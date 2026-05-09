import { FormField } from "../components/FormField";
import { OptionCard } from "../components/OptionCard";
import { PageActions } from "../components/PageActions";
import type { DestinationWarehouse } from "../types/migration";
import type { PageProps } from "./types";

export function DestinationPage({
  state,
  updateState,
  updateNested,
  goBack,
  goNext,
}: PageProps) {
  function selectDestination(destination: DestinationWarehouse) {
    updateState({ destination });
  }

  return (
    <section className="page-grid">
      <div className="panel">
        <div className="panel-heading">
          <span>Destination</span>
          <strong>What is the destination warehouse?</strong>
        </div>

        <div className="option-grid">
          <OptionCard
            badge="BL"
            title="Azure Blob Storage"
            description="Current backend write target."
            selected={state.destination === "azure_blob"}
            onClick={() => selectDestination("azure_blob")}
          />
          <OptionCard
            badge="DL"
            title="ADLS Gen2"
            description="Data lake target option for the UI flow."
            selected={state.destination === "adls_gen2"}
            onClick={() => selectDestination("adls_gen2")}
          />
          <OptionCard
            badge="DB"
            title="Databricks"
            description="Future ingestion trigger target."
            selected={state.destination === "databricks"}
            disabled
            onClick={() => selectDestination("databricks")}
          />
          <OptionCard
            badge="SY"
            title="Synapse"
            description="Future analytical warehouse target."
            selected={state.destination === "synapse"}
            disabled
            onClick={() => selectDestination("synapse")}
          />
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <span>Credentials</span>
          <strong>Destination connection</strong>
        </div>

        <div className="field-grid">
          <FormField
            label="Storage connection string"
            type="password"
            value={state.destinationCredentials.connectionString}
            placeholder="DefaultEndpointsProtocol=..."
            onChange={(connectionString) =>
              updateNested("destinationCredentials", { connectionString })
            }
          />
          <FormField
            label="Container name"
            value={state.destinationCredentials.containerName}
            placeholder="sap-api"
            onChange={(containerName) => updateNested("destinationCredentials", { containerName })}
          />
          <FormField
            label="Account name"
            value={state.destinationCredentials.accountName}
            placeholder="optional"
            onChange={(accountName) => updateNested("destinationCredentials", { accountName })}
          />
          <FormField
            label="Account key"
            type="password"
            value={state.destinationCredentials.accountKey}
            placeholder="optional"
            onChange={(accountKey) => updateNested("destinationCredentials", { accountKey })}
          />
          <FormField
            label="Landing folder"
            value={state.destinationCredentials.landingFolder}
            placeholder="sap-s4"
            onChange={(landingFolder) => updateNested("destinationCredentials", { landingFolder })}
          />
        </div>

        <div className="format-row">
          <span>Landing format</span>
          {(["parquet", "json", "csv"] as const).map((format) => (
            <button
              className={state.outputFormat === format ? "selected-chip" : ""}
              type="button"
              key={format}
              onClick={() => updateState({ outputFormat: format })}
            >
              {format.toUpperCase()}
            </button>
          ))}
        </div>

        <PageActions back={goBack} next={goNext} />
      </div>
    </section>
  );
}
