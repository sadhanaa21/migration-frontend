import { OptionCard } from "../components/OptionCard";
import { PageActions } from "../components/PageActions";
import type { CloudProvider } from "../types/migration";
import type { PageProps } from "./types";

export function CloudPage({ state, updateState, goBack, goNext }: PageProps) {
  function selectCloud(cloudProvider: CloudProvider) {
    updateState({ cloudProvider });
  }

  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <span>Cloud provider</span>
        <strong>What cloud do you want to use?</strong>
      </div>

      <div className="option-grid three">
        <OptionCard
          badge="AZ"
          title="Azure"
          description="Blob Storage, ADLS Gen2, Synapse, and Databricks landing patterns."
          selected={state.cloudProvider === "azure"}
          onClick={() => selectCloud("azure")}
        />
        <OptionCard
          badge="AWS"
          title="AWS"
          description="S3 landing is available in the backend, SAP flow can be added later."
          selected={state.cloudProvider === "aws"}
          disabled
          onClick={() => selectCloud("aws")}
        />
        <OptionCard
          badge="GCP"
          title="Google Cloud"
          description="Future BigQuery and Cloud Storage target."
          selected={state.cloudProvider === "gcp"}
          disabled
          onClick={() => selectCloud("gcp")}
        />
      </div>

      <PageActions back={goBack} next={goNext} />
    </section>
  );
}
