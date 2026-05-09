import { FormField } from "../components/FormField";
import { OptionCard } from "../components/OptionCard";
import { PageActions } from "../components/PageActions";
import type { SourceSystem } from "../types/migration";
import type { PageProps } from "./types";

interface SourcePageProps extends PageProps {
  onTestCore: () => void;
}

export function SourcePage({
  state,
  updateState,
  updateNested,
  goBack,
  goNext,
  busy,
  onTestCore,
}: SourcePageProps) {
  function selectSource(sourceSystem: SourceSystem) {
    updateState({ sourceSystem });
  }

  return (
    <section className="page-grid">
      <div className="panel">
        <div className="panel-heading">
          <span>Source system</span>
          <strong>What is the source system?</strong>
        </div>

        <div className="option-grid">
          <OptionCard
            badge="S4"
            title="SAP S/4HANA"
            description="Use the local dummy SAP OData server."
            selected={state.sourceSystem === "sap_s4"}
            onClick={() => selectSource("sap_s4")}
          />
          <OptionCard
            badge="ECC"
            title="SAP ECC"
            description="Ready for metadata catalog driven scans."
            selected={state.sourceSystem === "sap_ecc"}
            onClick={() => selectSource("sap_ecc")}
          />
          <OptionCard
            badge="OR"
            title="Oracle"
            description="Future connector."
            selected={state.sourceSystem === "oracle"}
            disabled
            onClick={() => selectSource("oracle")}
          />
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <span>Connection</span>
          <strong>SAP credentials</strong>
        </div>

        <div className="field-grid">
          <FormField
            label="SAP base URL"
            value={state.sourceCredentials.baseUrl}
            placeholder="http://127.0.0.1:8011"
            onChange={(baseUrl) => updateNested("sourceCredentials", { baseUrl })}
          />
          <FormField
            label="Client"
            value={state.sourceCredentials.clientId}
            placeholder="100"
            onChange={(clientId) => updateNested("sourceCredentials", { clientId })}
          />
          <FormField
            label="Username"
            value={state.sourceCredentials.username}
            placeholder="demo"
            onChange={(username) => updateNested("sourceCredentials", { username })}
          />
          <FormField
            label="Password"
            type="password"
            value={state.sourceCredentials.password}
            placeholder="demo123"
            onChange={(password) => updateNested("sourceCredentials", { password })}
          />
        </div>

        <PageActions
          back={goBack}
          next={goNext}
          primary={onTestCore}
          primaryLabel="Test Core API"
          disabled={busy}
        />
      </div>
    </section>
  );
}
