import { runSapAgent } from "../api/client";
import { ChatPanel } from "../components/ChatPanel";
import { TableCatalog } from "../components/TableCatalog";
import type { ChatMessage, SapTable } from "../types/migration";
import type { PageProps } from "./types";

interface ScanPageProps extends PageProps {
  selectedTables: SapTable[];
  onRequestApproval: () => void;
}

export function ScanPage({
  state,
  updateState,
  goBack,
  busy,
  setNotice,
  selectedTables,
  onRequestApproval,
}: ScanPageProps) {
  async function runScan(prompt: string) {
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      text: prompt,
    };

    updateState({
      chatMessages: [...state.chatMessages, userMessage],
    });
    setNotice("Asking the LLM for SAP table discovery...");

    try {
      const response = await runSapAgent({
        message: [
          "You are responding inside the migration frontend scan page.",
          `Latest user prompt: ${prompt}`,
          "If the prompt asks to list, inspect, fetch, scan, or migrate SAP data, use the SAP backend tools/agent.",
          "Do not use frontend-only metadata. Do not ask for an output file format.",
          "Return useful table/API names and the next migration step.",
        ].join("\n\n"),
      });
      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        text: response.message || "The LLM completed the request without additional details.",
      };

      updateState({
        approval: response.approval ?? state.approval,
        lastAgentResponse: response,
        chatMessages: [...state.chatMessages, userMessage, assistantMessage],
      });
      setNotice(response.status === "approval_required" ? "Approval request created." : "LLM response received.");
    } catch (error) {
      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        text:
          error instanceof Error
            ? `LLM request failed because ${error.message}`
            : "LLM request failed. Check the API and try again.",
      };

      updateState({
        chatMessages: [...state.chatMessages, userMessage, assistantMessage],
      });
      setNotice(error instanceof Error ? error.message : "Unable to reach the LLM.");
    }
  }

  return (
    <section className="scan-layout">
      <div className="scan-main">
        <section className="panel">
          <div className="panel-heading">
            <span>AI scan</span>
            <strong>Discover tables for the data lake</strong>
          </div>
          <p className="panel-copy">
            Start with all available SAP APIs, or ask the assistant to narrow the catalog to
            customers, products, or sales orders.
          </p>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={goBack}>
              Back
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => runScan("Scan all available SAP tables")}
            >
              Start AI Scan
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={busy || selectedTables.length === 0}
              onClick={onRequestApproval}
            >
              Request Approval
            </button>
          </div>
        </section>

        <TableCatalog
          tables={state.scannedTables}
          onChange={(scannedTables) => updateState({ scannedTables })}
        />
      </div>

      <ChatPanel messages={state.chatMessages} busy={busy} onPrompt={runScan} />
    </section>
  );
}
