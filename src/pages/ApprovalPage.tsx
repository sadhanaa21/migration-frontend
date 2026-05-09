import { ResponsePanel } from "../components/ResponsePanel";
import type { SapTable } from "../types/migration";
import type { PageProps } from "./types";

interface ApprovalPageProps extends PageProps {
  selectedTables: SapTable[];
  onResolveApproval: (approve: boolean) => void;
}

export function ApprovalPage({
  state,
  goBack,
  busy,
  selectedTables,
  onResolveApproval,
}: ApprovalPageProps) {
  return (
    <section className="page-grid">
      <div className="panel approval-panel">
        <div className="panel-heading">
          <span>Approval</span>
          <strong>Migration plan</strong>
        </div>

        <div className="plan-list">
          {selectedTables.map((table) => (
            <div className="plan-row" key={table.id}>
              <div>
                <strong>{table.name}</strong>
                <small>{table.apiPath}</small>
              </div>
              <span>{table.destinationPath}</span>
            </div>
          ))}
        </div>

        {state.approval ? (
          <div className="approval-card">
            <p className="eyebrow">Backend approval request</p>
            <h2>{state.approval.summary}</h2>
            <p>
              Tool: {state.approval.tool_name} | Expires:{" "}
              {new Date(state.approval.expires_at).toLocaleString()}
            </p>
          </div>
        ) : (
          <div className="approval-card muted">
            <p className="eyebrow">Waiting</p>
            <h2>No backend approval created yet</h2>
            <p>Go back to AI Scan and request approval after selecting tables.</p>
          </div>
        )}

        <div className="page-actions">
          <button className="secondary-button" type="button" onClick={goBack}>
            Back
          </button>
          <button
            className="danger-button"
            type="button"
            disabled={busy || !state.approval}
            onClick={() => onResolveApproval(false)}
          >
            Reject
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={busy || !state.approval}
            onClick={() => onResolveApproval(true)}
          >
            Approve Upload
          </button>
        </div>
      </div>

      <ResponsePanel response={state.lastAgentResponse} />
    </section>
  );
}
