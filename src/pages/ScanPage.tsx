import { scanSapCatalog } from "../api/catalog";
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
  function buildScanReply(prompt: string, tables: SapTable[]) {
    const normalized = prompt.toLowerCase();
    const selected = tables.filter((table) => table.selected);
    const selectedNames = selected.map((table) => table.name).join(", ");

    if (normalized.includes("sales")) {
      return `I found sales migration candidates and selected ${selectedNames || "none"}. Sales order APIs are ready for approval-gated upload; ECC-style sales metadata is shown as a future candidate.`;
    }

    if (normalized.includes("product") || normalized.includes("material")) {
      return `I focused on product and material data. I selected ${selectedNames || "none"} for the current runnable flow and kept metadata-only tables visible for planning.`;
    }

    if (normalized.includes("customer") || normalized.includes("partner")) {
      return `I narrowed the catalog to customer and business partner data. I selected ${selectedNames || "none"} because it maps to the live dummy SAP API.`;
    }

    return `Full scan complete. I found ${tables.length} candidates across live SAP APIs and metadata. I selected ${selected.length} runnable API-backed tables for the first migration plan.`;
  }

  async function runScan(prompt: string) {
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      text: prompt,
    };

    updateState({
      chatMessages: [...state.chatMessages, userMessage],
    });
    setNotice("AI scan is reading available SAP APIs and metadata candidates...");

    const tables = await scanSapCatalog(prompt);
    const assistantMessage: ChatMessage = {
      id: `${Date.now()}-assistant`,
      role: "assistant",
      text: buildScanReply(prompt, tables),
    };

    updateState({
      scannedTables: tables,
      chatMessages: [...state.chatMessages, userMessage, assistantMessage],
    });
    setNotice("Scan completed. Review and adjust selected tables.");
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
