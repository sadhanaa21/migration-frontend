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
      <pre>{response ? JSON.stringify(response, null, 2) : "No backend response yet."}</pre>
    </section>
  );
}
