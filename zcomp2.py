from airflow import DAG
from airflow.providers.amazon.aws.hooks.base_aws import AwsGenericHook
from airflow.providers.amazon.aws.operators.athena import AthenaOperator
from airflow.operators.trigger_dagrun import TriggerDagRunOperator
from airflow.exceptions import AirflowFailException
from airflow.utils.trigger_rule import TriggerRule
from airflow.decorators import task
from airflow.utils.dates import days_ago

from datetime import datetime, timedelta
import json
import time
import boto3
# ────────────────────────────────────────────────
#                 DAG CONFIGURATION
# ────────────────────────────────────────────────

DAG_ID = "esag_datalake_sapecc_api_to_silver_daily_dag"

AWS_CONN_ID = "aws_conn_dev_dr"
AWS_REGION = "ap-south-2"

ATHENA_RESULTS_BUCKET = "ap-south-2-esag-datalake-prd-athena-dr"
ATHENA_RESULTS_KEY = "airflow_athena_results/"
ATHENA_OUTPUT_LOCATION = f"s3://{ATHENA_RESULTS_BUCKET}/{ATHENA_RESULTS_KEY}"

CONFIG_DATABASE = "esagdl_config_db"

# Set this to 1 to run jobs strictly one after another within a stage
PARALLEL_BATCH_SIZE = 25

default_args = {
    "owner": "data-engineering",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 0,
    "execution_timeout": timedelta(hours=12),
}

with DAG(
    dag_id=DAG_ID,
    default_args=default_args,
    description="[PRODUCTION][DAILY] Orchestrates SAP ECC API → Landing → Bronze → Silver pipeline",
    start_date=days_ago(1),
    schedule="10 21 * * *",
    # schedule=None,
    catchup=False,
    tags=["sapecc", "api", "datalake", "silver"],
    max_active_runs=1,
) as dag:

    # ────────────────────────────────────────────────
    #                HELPER FUNCTIONS
    # ────────────────────────────────────────────────

    def get_sapecc_rows_to_process_sql(stage: str) -> str:
        last_ts_column_map = {
            "landing": "landing_last_load_timestamp",
            "bronze": "bronze_table_last_load_timestamp",
            "silver": "silver_table_last_load_timestamp",
        }

        last_ts_col = last_ts_column_map.get(stage.lower())
        
        # Note: We filter for 'Y' and the specific stage status set by the previous Athena task
        return f"""
        SELECT 
            pplc.table_name,
            ds.*,
            pplc.*
        FROM {CONFIG_DATABASE}.datasources_config ds
        INNER JOIN {CONFIG_DATABASE}.sapecc_pipeline_config pplc
            ON ds.data_source = pplc.data_source
        WHERE lower(ds.data_source)       = 'sapecc'
          AND lower(ds.environment)        = 'prd'
          AND lower(ds.connection_type)    = 'api'
          AND pplc.load_flag               = 'Y'
          AND lower(pplc.table_group) LIKE '%daily%'
          AND lower(pplc.load_frequency)  = 'daily'
          AND COALESCE(load_start_timestamp, '1999-01-01 00:00:00') > COALESCE({last_ts_col}, '1999-01-01 00:00:00') 
          AND load_status != 'Landing Success'
        ORDER BY sapecc_pipeline_config_row_id
        """

    def get_sapecc_rows_to_process_sql_deduped(stage: str) -> str:
        """Deduplicated + incremental condition — used for bronze and silver"""
    
        last_ts_column_map = {
            "bronze": "bronze_table_last_load_timestamp",
            "silver": "silver_table_last_load_timestamp",
        }
        last_ts_col = last_ts_column_map.get(stage.lower())
        
        if last_ts_col == "bronze_table_last_load_timestamp":
            load_status_condition = """load_status NOT LIKE 'Landing Failed%' AND load_status != 'Bronze Success'"""
        
        elif last_ts_col == "silver_table_last_load_timestamp":
            load_status_condition = """load_status NOT LIKE 'Landing Failed%' AND load_status NOT LIKE 'Bronze Failed%' AND load_status != 'Silver Success'"""
            
        return f"""
        SELECT *
        FROM (
            SELECT
                pplc.table_name,
                ds.*,
                pplc.*,
                ROW_NUMBER() OVER (
                    PARTITION BY pplc.table_name
                    ORDER BY pplc.{last_ts_col} DESC
                ) AS rn
            FROM {CONFIG_DATABASE}.datasources_config ds
            INNER JOIN {CONFIG_DATABASE}.sapecc_pipeline_config pplc
                ON ds.data_source = pplc.data_source
            WHERE lower(ds.data_source)       = 'sapecc'
            AND lower(ds.environment)        = 'prd'
            AND lower(ds.connection_type)    = 'api'
            AND pplc.load_flag               = 'Y'
            AND lower(pplc.table_group) LIKE '%daily%'
            AND lower(pplc.load_frequency)  = 'daily'
            AND COALESCE(load_start_timestamp, '1999-01-01 00:00:00') 
            > COALESCE({last_ts_col}, '1999-01-01 00:00:00') 
            AND {load_status_condition}
        ) t
        WHERE rn = 1
        ORDER BY sapecc_pipeline_config_row_id
        """
        
    # ────────────────────────────────────────────────
    #           ATHENA STATUS UPDATE TASKS
    # ────────────────────────────────────────────────

    sapecc_pipeline_config_landing_status_load_start_date_update_task = AthenaOperator(
        task_id="sapecc_pipeline_config_landing_status_load_start_date_update",
        aws_conn_id=AWS_CONN_ID,
        query=f"""
        UPDATE {CONFIG_DATABASE}.sapecc_pipeline_config 
        SET 
            load_status = 'Landing Running', 
            load_start_timestamp = date_format(current_timestamp AT TIME ZONE 'Asia/Dubai', '%Y-%m-%d %H:%i:%s') 
        WHERE load_flag = 'Y'
            AND lower(data_source) = 'sapecc'
            AND lower(table_group) LIKE '%daily%'
            AND lower(load_frequency)  = 'daily';
        """,
        database=CONFIG_DATABASE,
        output_location=ATHENA_OUTPUT_LOCATION,
        region_name=AWS_REGION,
    )

    sapecc_pipeline_config_bronze_status_running_update_task = AthenaOperator(
        task_id="sapecc_pipeline_config_bronze_status_running_update",
        trigger_rule="all_done",
        aws_conn_id=AWS_CONN_ID,
        query=f"""
        UPDATE {CONFIG_DATABASE}.sapecc_pipeline_config 
        SET 
            load_status = 'Bronze Running' 
        WHERE load_flag = 'Y' 
            AND lower(data_source) = 'sapecc'
            AND (lower(load_status) = 'landing success' OR lower(load_status) Like 'bronze failed%')
            AND lower(table_group) LIKE '%daily%'
            AND lower(load_frequency)  = 'daily';
        """,
        database=CONFIG_DATABASE,
        output_location=ATHENA_OUTPUT_LOCATION,
        region_name=AWS_REGION,
    )

    sapecc_pipeline_config_silver_status_running_update_task = AthenaOperator(
        task_id="sapecc_pipeline_config_silver_status_running_update",
        trigger_rule="all_done",
        aws_conn_id=AWS_CONN_ID,
        query=f"""
        UPDATE {CONFIG_DATABASE}.sapecc_pipeline_config 
        SET 
            load_status = 'Silver Running' 
        WHERE load_flag = 'Y' 
            AND lower(data_source) = 'sapecc'
            AND (lower(load_status) = 'bronze success' OR lower(load_status) Like 'silver failed%')
            AND lower(table_group) LIKE '%daily%'
            AND lower(load_frequency)  = 'daily';
        """,
        database=CONFIG_DATABASE,
        output_location=ATHENA_OUTPUT_LOCATION,
        region_name=AWS_REGION,
    )

    sapecc_pipeline_config_load_end_date_update_task = AthenaOperator(
        task_id="sapecc_pipeline_config_load_end_date_update",
        trigger_rule="all_done",
        aws_conn_id=AWS_CONN_ID,
        query=f"""
        UPDATE {CONFIG_DATABASE}.sapecc_pipeline_config 
        SET
            load_end_timestamp = date_format(current_timestamp AT TIME ZONE 'Asia/Dubai', '%Y-%m-%d %H:%i:%s')
        WHERE load_flag = 'Y'
            AND lower(data_source) = 'sapecc'
            AND lower(load_status) = 'silver success'
            AND lower(table_group) LIKE '%daily%'
            AND lower(load_frequency)  = 'daily';
        """,
        database=CONFIG_DATABASE,
        output_location=ATHENA_OUTPUT_LOCATION,
        region_name=AWS_REGION,
    )

    # ────────────────────────────────────────────────
    #              MAIN PROCESSING TASK
    # ────────────────────────────────────────────────
    @task
    def process_and_run_glue_jobs(stage: str, script_name_field: str, aws_conn_id: str, region_name: str):
        
        aws_hook = AwsGenericHook(aws_conn_id=aws_conn_id)

        # client_cache holds one boto3 client per service name.
        # get_credentials() — and Airflow's secrets masker — is called only on first
        # use or on an explicit force_refresh=True (token expiry). Calling it on every
        # loop tick causes the re2 secrets-masker pattern to grow too large and crash
        # with: re2._re2.Error: b'pattern too large - compile failed'
        client_cache = {}

        def get_client(service_name: str, force_refresh: bool = False):
            if service_name not in client_cache or force_refresh:
                creds = aws_hook.get_credentials()
                session = boto3.Session(
                    aws_access_key_id=creds.access_key,
                    aws_secret_access_key=creds.secret_key,
                    aws_session_token=creds.token,
                    region_name=region_name,
                )
                client_cache[service_name] = session.client(service_name)
            return client_cache[service_name]

        # ────────────────────────────────────────────────
        # 1. Get eligible tables via Athena (with fresh client)
        if stage.lower() == "landing":  
            query_sql = get_sapecc_rows_to_process_sql(stage)
        else:
            # bronze and silver use deduplicated logic
            query_sql = get_sapecc_rows_to_process_sql_deduped(stage)

        qresp = get_client("athena").start_query_execution(
            QueryString=query_sql,
            QueryExecutionContext={"Database": CONFIG_DATABASE},
            ResultConfiguration={"OutputLocation": ATHENA_OUTPUT_LOCATION},
        )
        
        exec_id = qresp["QueryExecutionId"]

        # Poll Athena — reuse cached client, only refresh on token expiry
        while True:
            try:
                state_resp = get_client("athena").get_query_execution(QueryExecutionId=exec_id)
            except Exception as _poll_err:
                if "ExpiredTokenException" in str(_poll_err):
                    print("Athena poll: token expired — refreshing client")
                    state_resp = get_client("athena", force_refresh=True).get_query_execution(QueryExecutionId=exec_id)
                else:
                    raise
            state = state_resp["QueryExecution"]["Status"]["State"]

            if state == "SUCCEEDED":
                break
            if state in ["FAILED", "CANCELLED"]:
                error_msg = state_resp["QueryExecution"]["Status"].get("StateChangeReason", "Unknown error")
                raise Exception(f"Athena query failed: {exec_id} - {state} - {error_msg}")

            time.sleep(5)

        # Fetch and parse results
        rows = []
        paginator = get_client("athena").get_paginator("get_query_results")
        for page in paginator.paginate(QueryExecutionId=exec_id):
            for row in page["ResultSet"]["Rows"]:
                rows.append([col.get("VarCharValue") for col in row["Data"]])

        if len(rows) <= 1:
            print(f"No records to process for stage: {stage}")
            return

        headers = rows[0]
        records = [dict(zip(headers, r)) for r in rows[1:]]
        
        # ────────────────────────────────────────────────
        # Queue management
        active_runs = []
        failed_jobs = []
        
        # Helper to clean up finished jobs from the active list
        def manage_active_queue():
            still_running = []
            for run in active_runs:
                try:
                    res = get_client("glue").get_job_run(JobName=run['name'], RunId=run['id'])
                    state = res['JobRun']['JobRunState']

                    if state == 'SUCCEEDED':
                        print(f"Finished: {run['name']}")
                    elif state in ['FAILED', 'STOPPED', 'TIMEOUT']:
                        print(f"Failed: {run['name']} → {state}")
                        failed_jobs.append(run['name'])
                    else:
                        still_running.append(run)
                except Exception as e:
                    err_str = str(e)
                    if 'ExpiredTokenException' in err_str:
                        print(f"Token expired polling {run['name']} — refreshing Glue client, will retry next cycle")
                        get_client("glue", force_refresh=True)
                        still_running.append(run)  # keep in queue, retry next poll cycle
                    else:
                        print(f"Error polling Glue job {run['name']}: {err_str}")
                        raise

            return still_running

        # ────────────────────────────────────────────────
        # 4. Trigger Glue jobs (with concurrency limit)
        for rec in records:
            job_name = rec.get(script_name_field)
            if not job_name:
                continue

            # Respect parallel limit
            while len(active_runs) >= PARALLEL_BATCH_SIZE:
                print(f"Parallel limit reached ({len(active_runs)}/{PARALLEL_BATCH_SIZE}). Waiting...")
                time.sleep(30)
                active_runs = manage_active_queue()

            print(f"Triggering Glue job: {job_name} for table {rec.get('table_name')}")

            try:
                run_response = get_client("glue").start_job_run(
                    JobName=job_name,
                    Arguments={"--pipeline_config_row": json.dumps(rec)}
                )
            except Exception as e:
                if "ExpiredTokenException" in str(e):
                    print(f"Token expired triggering {job_name} — refreshing Glue client and retrying")
                    run_response = get_client("glue", force_refresh=True).start_job_run(
                        JobName=job_name,
                        Arguments={"--pipeline_config_row": json.dumps(rec)}
                    )
                else:
                    raise

            active_runs.append({
                'name': job_name,
                'id': run_response['JobRunId']
            })

        # ────────────────────────────────────────────────
        # 5. Wait for all remaining jobs to complete
        while len(active_runs) > 0:
            print(f"Waiting for {len(active_runs)} remaining jobs in stage '{stage}'...")
            time.sleep(30)
            active_runs = manage_active_queue()

        if failed_jobs:
            print(f"WARNING: Stage {stage} had failed Glue jobs: {', '.join(failed_jobs)}")
            print(f"Successful jobs will proceed. Failed tables will be excluded from downstream stages.")
            raise AirflowFailException(f"Stage {stage} failed for jobs: {failed_jobs}")
        else:
            print(f"All {stage} completed successfully.")

    # ────────────────────────────────────────────────
    #           TASK PIPELINE
    # ────────────────────────────────────────────────

    sapecc_to_landing_job_run_task = process_and_run_glue_jobs.override(task_id="sapecc_to_landing_job_run_task", trigger_rule="all_done")(
        stage="landing", script_name_field="source_to_landing_script", aws_conn_id=AWS_CONN_ID, region_name=AWS_REGION
    )

    sapecc_landing_to_bronze_job_run_task = process_and_run_glue_jobs.override(task_id="sapecc_landing_to_bronze_job_run_task", trigger_rule="all_done")(
        stage="bronze", script_name_field="landing_to_bronze_script", aws_conn_id=AWS_CONN_ID, region_name=AWS_REGION
    )

    sapecc_bronze_to_silver_job_run_task = process_and_run_glue_jobs.override(task_id="sapecc_bronze_to_silver_job_run_task", trigger_rule="all_done")(
        stage="silver", script_name_field="bronze_to_silver_script", aws_conn_id=AWS_CONN_ID, region_name=AWS_REGION
    )

    sapecc_silver_to_gold_dag_trigger_task = TriggerDagRunOperator(
        task_id="sapecc_silver_to_gold_dag_trigger",
        trigger_dag_id="esag_datalake_sapecc_silver_to_gold_dag",
        trigger_rule="all_done"
    )

    # ────────────────────────────────────────────────
    #               TASK DEPENDENCIES
    # ────────────────────────────────────────────────
    (
        sapecc_pipeline_config_landing_status_load_start_date_update_task 
        >> sapecc_to_landing_job_run_task 
        >> sapecc_pipeline_config_bronze_status_running_update_task 
        >> sapecc_landing_to_bronze_job_run_task 
        >> sapecc_pipeline_config_silver_status_running_update_task 
        >> sapecc_bronze_to_silver_job_run_task 
        >> sapecc_pipeline_config_load_end_date_update_task
        >> sapecc_silver_to_gold_dag_trigger_task
    )