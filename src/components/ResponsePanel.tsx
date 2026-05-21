import type { SapAgentResponse } from "../types/migration";

interface ResponsePanelProps {
  response?: SapAgentResponse | null;
}

export function ResponsePanel({ response }: ResponsePanelProps) {
  return (
    <section className="panel response-panel">
      <div className="panel-heading">
        <span>Backend response</span>
        <strong>{response?.status ?? "Waiting"}</strong>
      </div>
      {response ? (
        <div className="response-summary">
          <p>{response.message || "The backend completed without additional details."}</p>
          {response.approval && (
            <small>
              Approval {response.approval.approval_id} is waiting for {response.approval.tool_name}.
            </small>
          )}
        </div>
      ) : (
        <p>No backend response yet.</p>
      )}
    </section>
  );
}
