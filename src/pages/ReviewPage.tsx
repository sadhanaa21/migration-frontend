import { PageActions } from "../components/PageActions";
import type { PageProps } from "./types";

interface ReviewPageProps extends PageProps {
  coreOnline: boolean | null;
  onTestCore: () => void;
}

export function ReviewPage({
  state,
  goBack,
  goNext,
  busy,
  coreOnline,
  onTestCore,
}: ReviewPageProps) {
  return (
    <section className="page-grid">
      <div className="panel">
        <div className="panel-heading">
          <span>Review</span>
          <strong>Connection summary</strong>
        </div>

        <dl className="summary-list">
          <div>
            <dt>Source</dt>
            <dd>{state.sourceSystem.toUpperCase()} at {state.sourceCredentials.baseUrl}</dd>
          </div>
          <div>
            <dt>Cloud</dt>
            <dd>{state.cloudProvider.toUpperCase()}</dd>
          </div>
          <div>
            <dt>Destination</dt>
            <dd>{state.destination.replace(/_/g, " ")} / {state.destinationCredentials.containerName}</dd>
          </div>
          <div>
            <dt>Landing format</dt>
            <dd>{state.outputFormat.toUpperCase()}</dd>
          </div>
        </dl>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <span>Readiness</span>
          <strong>Pre-scan checks</strong>
        </div>

        <div className="readiness-grid">
          <div className={coreOnline ? "check-card ok" : "check-card"}>
            <strong>Core API</strong>
            <span>{coreOnline ? "Reachable" : "Needs verification"}</span>
          </div>
          <div className="check-card ok">
            <strong>Source credentials</strong>
            <span>Captured for this run</span>
          </div>
          <div className="check-card ok">
            <strong>Destination credentials</strong>
            <span>Captured for this run</span>
          </div>
        </div>

        <PageActions
          back={goBack}
          next={goNext}
          nextLabel="Continue to AI Scan"
          primary={onTestCore}
          primaryLabel="Test Core API"
          disabled={busy}
        />
      </div>
    </section>
  );
}
