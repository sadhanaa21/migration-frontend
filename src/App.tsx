import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import {
  checkCoreHealth,
  createSession,
  sendMessage,
  getSessionStatus,
  getHistory,
  listSessions,
  getSources,
  getClouds,
  getPhases,
} from "./api/client";
import type {
  MigrationPhase,
  ChatMessage,
  ApprovalItem,
  SourceSystemMeta,
  CloudProviderMeta,
  PhaseInfo,
  SessionListItem,
} from "./types/migration";
import { AppShell } from "./components/AppShell";

const SESSION_KEY = "migration_session_id";

function mkId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function phaseLabel(phase: MigrationPhase): string {
  return phase.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState<MigrationPhase>("INIT");
  const [completedPhases, setCompletedPhases] = useState<MigrationPhase[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalItem[]>([]);
  const [phaseData, setPhaseData] = useState<Record<string, unknown>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [coreOnline, setCoreOnline] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [showSessions, setShowSessions] = useState(false);

  // Metadata from backend (no hardcoding)
  const [sources, setSources] = useState<SourceSystemMeta[]>([]);
  const [clouds, setClouds] = useState<CloudProviderMeta[]>([]);
  const [phases, setPhases] = useState<PhaseInfo[]>([]);

  const endRef = useRef<HTMLDivElement>(null);
  const sourcesRef = useRef<SourceSystemMeta[]>([]);

  // Initialise: health check + metadata + session
  useEffect(() => {
    void (async () => {
      const [ok] = await Promise.all([
        checkCoreHealth(),
        getSources()
          .then((data) => {
            setSources(data);
            sourcesRef.current = data;
          })
          .catch(() => {}),
        getClouds().then(setClouds).catch(() => {}),
        getPhases().then(setPhases).catch(() => {}),
      ]);
      setCoreOnline(ok);

      if (!ok) return;

      // Load list of all sessions for the switcher
      listSessions().then(setSessions).catch(() => {});

      // Re-use existing session from localStorage if valid (survives refresh)
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        try {
          const [status, history] = await Promise.all([
            getSessionStatus(stored),
            getHistory(stored).catch(() => [] as import("./types/migration").HistoryEntry[]),
          ]);
          setSessionId(stored);
          setCurrentPhase(status.migration_phase);
          setCompletedPhases(status.completed_phases);
          setPendingApprovals(status.pending_approvals);
          // Restore conversation from DB history
          if (history.length > 0) {
            setMessages(
              history.map((h) => ({
                id: mkId(),
                role: h.role,
                text: h.content,
              }))
            );
          } else {
            setMessages([{
              id: mkId(),
              role: "assistant",
              text: `Welcome back! Resuming your migration — currently at **${phaseLabel(status.migration_phase)}** phase. How can I help?`,
            }]);
          }
          return;
        } catch {
          localStorage.removeItem(SESSION_KEY);
        }
      }

      // Create new session
      try {
        const res = await createSession();
        setSessionId(res.session_id);
        localStorage.setItem(SESSION_KEY, res.session_id);
        setCurrentPhase(res.migration_phase);
        setMessages([
          {
            id: mkId(),
            role: "assistant",
            text: "Welcome! I'm your AI Migration Assistant. I'll guide you through migrating your data to the cloud. What source system are you migrating from?",
            suggestions: sourcesRef.current.map((s) => s.display_name),
          },
        ]);
        listSessions().then(setSessions).catch(() => {});
      } catch {
        setCoreOnline(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);

  // Poll for approval updates every 5s when approvals pending
  useEffect(() => {
    if (!sessionId || pendingApprovals.length === 0) return;
    const iv = setInterval(async () => {
      try {
        const status = await getSessionStatus(sessionId);
        setPendingApprovals(status.pending_approvals);
        if (status.migration_phase !== currentPhase) {
          setCurrentPhase(status.migration_phase);
          setCompletedPhases(status.completed_phases);
        }
      } catch {
        // ignore polling errors
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [sessionId, pendingApprovals.length, currentPhase]);

  const handleSend = useCallback(
    async (text: string, approvalId?: string, approve?: boolean) => {
      if (!sessionId || busy) return;
      const msgText = text.trim();
      if (!msgText && approvalId === undefined) return;

      if (msgText) {
        setMessages((prev) => [
          ...prev,
          { id: mkId(), role: "user", text: msgText },
        ]);
      }
      setDraft("");
      setBusy(true);

      try {
        const res = await sendMessage(sessionId, msgText, approvalId, approve);
        setCurrentPhase(res.migration_phase);
        setCompletedPhases(res.completed_phases);
        setPendingApprovals(res.pending_approvals);
        setPhaseData(res.phase_data);
        setMessages((prev) => [
          ...prev,
          {
            id: mkId(),
            role: "assistant",
            text: res.message,
            suggestions: res.suggestions,
            pendingApprovals: res.pending_approvals,
          },
        ]);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          {
            id: mkId(),
            role: "assistant",
            text: e instanceof Error ? `Error: ${e.message}` : "Something went wrong. Please try again.",
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [sessionId, busy]
  );

  const handleApprove = useCallback(
    async (approvalId: string, approve: boolean) => {
      if (!sessionId) return;
      const approvalMsg = approve ? "Approved" : "Rejected";
      await handleSend(approvalMsg, approvalId, approve);
    },
    [sessionId, handleSend]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.trim()) void handleSend(draft);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim()) void handleSend(draft);
    }
    // Shift+Enter falls through and inserts a newline naturally
  };

  const handleSwitchSession = useCallback(async (sid: string) => {
    if (sid === sessionId) { setShowSessions(false); return; }
    setBusy(true);
    try {
      const [status, history] = await Promise.all([
        getSessionStatus(sid),
        getHistory(sid).catch(() => [] as import("./types/migration").HistoryEntry[]),
      ]);
      localStorage.setItem(SESSION_KEY, sid);
      setSessionId(sid);
      setCurrentPhase(status.migration_phase);
      setCompletedPhases(status.completed_phases);
      setPendingApprovals(status.pending_approvals);
      setPhaseData({});
      setMessages(
        history.length > 0
          ? history.map((h) => ({ id: mkId(), role: h.role, text: h.content }))
          : [{ id: mkId(), role: "assistant", text: `Switched to session. Phase: **${phaseLabel(status.migration_phase)}**. How can I help?` }]
      );
      setShowSessions(false);
    } finally {
      setBusy(false);
    }
  }, [sessionId]);

  const handleNewSession = useCallback(async () => {
    setBusy(true);
    try {
      const res = await createSession();
      localStorage.setItem(SESSION_KEY, res.session_id);
      setSessionId(res.session_id);
      setCurrentPhase(res.migration_phase);
      setCompletedPhases([]);
      setPendingApprovals([]);
      setPhaseData({});
      setMessages([{
        id: mkId(),
        role: "assistant",
        text: "New session started! What source system are you migrating from?",
        suggestions: sources.map((s) => s.display_name),
      }]);
      listSessions().then(setSessions).catch(() => {});
      setShowSessions(false);
    } finally {
      setBusy(false);
    }
  }, [sources]);

  // Only show suggestions that are short, meaningful quick-replies (not sentences)
  function isUsefulChip(s: string): boolean {
    if (!s || s.length > 30) return false;
    const lower = s.toLowerCase();
    // Skip generic meta-questions that aren't one-click actions
    const skipPrefixes = ["i'll ", "what are ", "what is ", "how do ", "provide "];
    return !skipPrefixes.some((p) => lower.startsWith(p));
  }

  const currentPhaseInfo = phases.find((p) => p.id === currentPhase);

  return (
    <AppShell
      coreOnline={coreOnline}
      busy={busy}
      currentPhase={currentPhase}
      completedPhases={completedPhases}
      phases={phases}
      phaseData={phaseData}
      currentPhaseInfo={currentPhaseInfo}
      sources={sources}
      clouds={clouds}
      sessions={sessions}
      activeSessionId={sessionId}
      showSessions={showSessions}
      onToggleSessions={() => setShowSessions((v) => !v)}
      onSwitchSession={(sid) => void handleSwitchSession(sid)}
      onNewSession={() => void handleNewSession()}
    >
      {/* Chat panel */}
      <div className="chat-panel">
        <div className="chat-messages">
          {messages.map((msg) => (
            <article key={msg.id} className={`chat-message ${msg.role}`}>
              {msg.role === "assistant" ? (
                <div className="md-body">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              ) : (
                <p style={{ whiteSpace: "pre-wrap" }}>{msg.text}</p>
              )}
              {/* Suggestions — only show short, actionable chips */}
              {msg.role === "assistant" && msg.suggestions && msg.suggestions.filter(isUsefulChip).length > 0 && (
                <div className="suggestions">
                  {msg.suggestions.filter(isUsefulChip).map((s) => (
                    <button
                      key={s}
                      className="suggestion-chip"
                      type="button"
                      onClick={() => void handleSend(s)}
                      disabled={busy}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {/* Inline approval queue */}
              {msg.role === "assistant" &&
                msg.pendingApprovals &&
                msg.pendingApprovals.length > 0 && (
                  <div className="approval-queue">
                    {msg.pendingApprovals.map((a) => (
                      <div key={a.approval_id} className="approval-card">
                        <p className="approval-summary">{a.summary}</p>
                        {a.cloud_resource_type && (
                          <small className="approval-resource">{a.cloud_resource_type}</small>
                        )}
                        <div className="approval-actions">
                          <button
                            className="primary-button"
                            type="button"
                            onClick={() => void handleApprove(a.approval_id, true)}
                            disabled={busy}
                          >
                            Approve
                          </button>
                          <button
                            className="danger-button"
                            type="button"
                            onClick={() => void handleApprove(a.approval_id, false)}
                            disabled={busy}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </article>
          ))}
          {busy && (
            <article className="chat-message assistant typing">
              <p>Working...</p>
            </article>
          )}
          <div ref={endRef} />
        </div>

        <form className="chat-composer" onSubmit={handleSubmit}>
          <textarea
            value={draft}
            placeholder="Type a message… (Shift+Enter for new line)"
            rows={1}
            onChange={(e) => {
              setDraft(e.target.value);
              // Auto-grow up to ~5 lines
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
            }}
            onKeyDown={handleKeyDown}
            disabled={busy || !sessionId}
          />
          <button
            className="primary-button"
            type="submit"
            disabled={busy || !draft.trim() || !sessionId}
          >
            Send
          </button>
        </form>
      </div>
    </AppShell>
  );
}
