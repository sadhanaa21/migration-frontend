import { useState } from "react";
import type { ChatMessage } from "../types/migration";

interface ChatPanelProps {
  messages: ChatMessage[];
  busy: boolean;
  onPrompt: (prompt: string) => void;
}

const suggestions = [
  "Scan all available SAP tables",
  "Find customer and business partner data",
  "Show sales order tables",
  "Find product and material master tables",
];

export function ChatPanel({ messages, busy, onPrompt }: ChatPanelProps) {
  const [draft, setDraft] = useState("");

  function submitPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }
    onPrompt(trimmed);
    setDraft("");
  }

  return (
    <section className="panel chat-panel">
      <div className="panel-heading">
        <span>AI scan assistant</span>
        <strong>Catalog chat</strong>
      </div>

      <div className="chat-messages">
        {messages.map((message) => (
          <div className={`chat-message ${message.role}`} key={message.id}>
            {message.text}
          </div>
        ))}
      </div>

      <div className="prompt-chips">
        {suggestions.map((suggestion) => (
          <button type="button" key={suggestion} onClick={() => submitPrompt(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>

      <form
        className="chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          submitPrompt(draft);
        }}
      >
        <input
          value={draft}
          placeholder="Ask the agent what to scan..."
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={busy}>
          Send
        </button>
      </form>
    </section>
  );
}
