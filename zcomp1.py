import json
import time

import boto3
from airflow import DAG
from airflow.decorators import task
from airflow.exceptions import AirflowFailException
from airflow.providers.amazon.aws.hooks.base_aws import AwsGenericHook
from airflow.utils.dates import days_ago
from datetime import timedelta

# ────────────────────────────────────────────────
#                 DAG CONFIGURATION
# ────────────────────────────────────────────────

DAG_ID = "esag_datalake_gold_iceberg_maintenance_dag"

AWS_CONN_ID = "aws_conn_dev_dr"
AWS_REGION = "ap-south-2"

ATHENA_RESULTS_BUCKET = "ap-south-2-esag-datalake-prd-athena-dr"
ATHENA_RESULTS_KEY = "airflow_athena_results/"
ATHENA_OUTPUT_LOCATION = f"s3://{ATHENA_RESULTS_BUCKET}/{ATHENA_RESULTS_KEY}"

CONFIG_DATABASE = "esagdl_config_db"

# Name of the Glue job as registered in AWS Glue
GLUE_JOB_NAME = "dl-utils-gold-iceberg-maintenance-job"

# Number of Glue jobs to run in parallel
PARALLEL_BATCH_SIZE = 25

default_args = {
    "owner": "data-engineering",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 0,
    "execution_timeout": timedelta(hours=6),
}

with DAG(
    dag_id=DAG_ID,
    default_args=default_args,
    description="[PRODUCTION] Runs Iceberg maintenance across all gold tables registered in gold_pipeline_config",
    start_date=days_ago(1),
    schedule='0 10 * * *',
    catchup=False,
    tags=["gold", "iceberg", "maintenance"],
    max_active_runs=1,
) as dag:

    # ────────────────────────────────────────────────
    #              MAIN PROCESSING TASK
    # ────────────────────────────────────────────────

    @task(task_id="run_gold_iceberg_maintenance_jobs")
    def run_gold_iceberg_maintenance_jobs(aws_conn_id: str, region_name: str):
        """
        1. Queries Athena for distinct gold_pipeline_config rows where load_flag = 'Y'.
        2. Triggers one Glue job per row, passing the full config row as --pipeline_config_row JSON.
        3. Polls all runs (up to PARALLEL_BATCH_SIZE in parallel) until completion.
        No load_status updates are performed by this DAG.
        """
        aws_hook = AwsGenericHook(aws_conn_id=aws_conn_id)
        creds = aws_hook.get_credentials()
        session = boto3.Session(
            aws_access_key_id=creds.access_key,
            aws_secret_access_key=creds.secret_key,
            aws_session_token=creds.token,
            region_name=region_name,
        )
        athena = session.client("athena")
        glue = session.client("glue")

        # ── 1. Fetch distinct rows from gold_pipeline_config ──────────────
        query_sql = f"""
        SELECT DISTINCT
            table_name,
            gold_db,
            iceberg_path,
            expire_snapshot_days
        FROM {CONFIG_DATABASE}.gold_pipeline_config
        WHERE load_flag    = 'Y'
          AND table_name   IS NOT NULL
          AND gold_db      IS NOT NULL
          AND iceberg_path IS NOT NULL
          AND table_group NOT LIKE '%directly_on_silver_mv%'
        ORDER BY table_name
        """

        qresp = athena.start_query_execution(
            QueryString=query_sql,
            QueryExecutionContext={"Database": CONFIG_DATABASE},
            ResultConfiguration={"OutputLocation": ATHENA_OUTPUT_LOCATION},
        )
        exec_id = qresp["QueryExecutionId"]

        while True:
            state = athena.get_query_execution(QueryExecutionId=exec_id)["QueryExecution"]["Status"]["State"]
            if state == "SUCCEEDED":
                break
            if state in ["FAILED", "CANCELLED"]:
                raise AirflowFailException(f"Athena query failed: {exec_id}")
            time.sleep(5)

        rows = []
        paginator = athena.get_paginator("get_query_results")
        for page in paginator.paginate(QueryExecutionId=exec_id):
            for row in page["ResultSet"]["Rows"]:
                rows.append([col.get("VarCharValue") for col in row["Data"]])

        if len(rows) <= 1:
            print("No rows found in gold_pipeline_config with load_flag = 'Y'. Nothing to process.")
            return

        headers = rows[0]
        records = [dict(zip(headers, r)) for r in rows[1:]]
        print(f"Tables to maintain: {len(records)}")

        # ── 2. Trigger Glue jobs in parallel batches ──────────────────────
        terminal_states = {"SUCCEEDED", "FAILED", "STOPPED", "TIMEOUT", "ERROR"}
        active_runs = []
        failed_jobs = []

        def drain_queue():
            still_running = []
            for run in active_runs:
                res = glue.get_job_run(JobName=GLUE_JOB_NAME, RunId=run["run_id"])
                state = res["JobRun"]["JobRunState"]
                if state == "SUCCEEDED":
                    print(f"Completed | table={run['table_name']} | run_id={run['run_id']}")
                elif state in terminal_states:
                    print(f"Failed | table={run['table_name']} | run_id={run['run_id']} | state={state}")
                    failed_jobs.append(run["table_name"])
                else:
                    still_running.append(run)
            return still_running

        for rec in records:
            while len(active_runs) >= PARALLEL_BATCH_SIZE:
                time.sleep(15)
                active_runs = drain_queue()

            tbl = rec.get("table_name", "unknown")
            print(f"Triggering Glue job | table={tbl} | job={GLUE_JOB_NAME}")
            run_resp = glue.start_job_run(
                JobName=GLUE_JOB_NAME,
                Arguments={"--pipeline_config_row": json.dumps(rec)},
            )
            active_runs.append({"table_name": tbl, "run_id": run_resp["JobRunId"]})

        # ── 3. Final drain: wait for all remaining jobs ───────────────────
        while active_runs:
            print(f"Waiting for {len(active_runs)} remaining job(s)...")
            time.sleep(15)
            active_runs = drain_queue()

        if failed_jobs:
            raise AirflowFailException(
                f"Iceberg maintenance failed for the following tables: {failed_jobs}"
            )

        print(f"All {len(records)} table(s) maintained successfully.")

    # ────────────────────────────────────────────────
    #               TASK PIPELINE
    # ────────────────────────────────────────────────

    run_gold_iceberg_maintenance_jobs(
        aws_conn_id=AWS_CONN_ID,
        region_name=AWS_REGION,
    )