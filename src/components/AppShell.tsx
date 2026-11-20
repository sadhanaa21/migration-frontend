import type { ReactNode } from "react";
import type {
  MigrationPhase,
  PhaseInfo,
  SourceSystemMeta,
  CloudProviderMeta,
  SessionListItem,
} from "../types/migration";

interface AppShellProps {
  children: ReactNode;
  coreOnline: boolean | null;
  busy: boolean;
  currentPhase: MigrationPhase;
  completedPhases: MigrationPhase[];
  phases: PhaseInfo[];
  phaseData: Record<string, unknown>;
  currentPhaseInfo?: PhaseInfo;
  sources?: SourceSystemMeta[];
  clouds?: CloudProviderMeta[];
  sessions?: SessionListItem[];
  activeSessionId?: string | null;
  showSessions?: boolean;
  onToggleSessions?: () => void;
  onSwitchSession?: (sid: string) => void;
  onNewSession?: () => void;
}

export function AppShell({
  children,
  coreOnline,
  busy,
  currentPhase,
  completedPhases,
  phases,
  phaseData,
  currentPhaseInfo,
  sources = [],
  clouds = [],
  sessions = [],
  activeSessionId,
  showSessions = false,
  onToggleSessions,
  onSwitchSession,
  onNewSession,
}: AppShellProps) {
  const healthClass = coreOnline === null ? "neutral" : coreOnline ? "ok" : "error";
  const healthLabel =
    coreOnline === null
      ? "Checking…"
      : coreOnline
      ? "Core API Online"
      : "Core API Offline";

  const busyClass = busy ? "warn" : "neutral";

  return (
    <main className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar" aria-label="Migration progress">
        <div className="brand-block">
          <span className="brand-mark">AI</span>
          <div>
            <strong>Migration Assistant</strong>
            <small>AI-driven data migration</small>
          </div>
        </div>

        {/* Sessions switcher */}
        <div className="sessions-block">
          <div className="sessions-header">
            <button
              className="sessions-toggle"
              type="button"
              onClick={onToggleSessions}
              title="Switch between migration sessions"
            >
              💬 Chats {sessions.length > 0 ? `(${sessions.length})` : ""}
              <span className="toggle-caret">{showSessions ? "▲" : "▼"}</span>
            </button>
            <button
              className="new-session-btn"
              type="button"
              onClick={onNewSession}
              title="Start a new migration session"
              disabled={busy}
            >
              +
            </button>
          </div>
          {showSessions && (
            <ul className="sessions-list">
              {sessions.map((s) => {
                const isActive = s.session_id === activeSessionId;
                const label = s.source_system
                  ? `${s.source_system.toUpperCase()} → ${s.cloud_provider?.toUpperCase() ?? "?"}`
                  : `Session ${s.session_id.slice(0, 6)}`;
                const phase = s.migration_phase.replace(/_/g, " ").toLowerCase();
                return (
                  <li key={s.session_id}>
                    <button
                      type="button"
                      className={`session-item${isActive ? " active" : ""}`}
                      onClick={() => onSwitchSession?.(s.session_id)}
                      disabled={busy}
                    >
                      <span className="session-label">{label}</span>
                      <span className="session-phase">{phase}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <nav className="phase-progress" aria-label="Migration phases">
          {phases.map((phase) => {
            const isDone = completedPhases.includes(phase.id);
            const isCurrent = phase.id === currentPhase;
            return (
              <div
                key={phase.id}
                className={`phase-item${isDone ? " done" : ""}${isCurrent ? " current" : ""}`}
                title={phase.description}
              >
                <span className="phase-indicator">
                  {isDone ? "✓" : isCurrent ? "●" : "○"}
                </span>
                <span className="phase-name">{phase.display_name}</span>
              </div>
            );
          })}
        </nav>

        {Object.keys(phaseData).length > 0 && (
          <section className="phase-data-panel">
            <h3>Phase Details</h3>
            {Object.entries(phaseData)
              .filter(([, v]) => v !== null && v !== undefined && JSON.stringify(v) !== "{}" && JSON.stringify(v) !== "[]")
              .slice(0, 6)
              .map(([key, value]) => (
                <div key={key} className="phase-data-row">
                  <span className="phase-data-key">{key.replace(/_/g, " ")}</span>
                  <span className="phase-data-val">
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              ))}
          </section>
        )}

        {sources.length > 0 && (
          <section className="meta-panel">
            <h4>Sources</h4>
            {sources.map((s) => (
              <span key={s.id} className="meta-badge">{s.display_name}</span>
            ))}
          </section>
        )}

        {clouds.length > 0 && (
          <section className="meta-panel">
            <h4>Clouds</h4>
            {clouds.map((c) => (
              <span key={c.id} className="meta-badge">{c.display_name}</span>
            ))}
          </section>
        )}
      </aside>

      {/* ── Top bar ── */}
      <header className="topbar">
        <div>
          <p className="eyebrow">
            {currentPhaseInfo ? currentPhaseInfo.description : "AI-driven data migration"}
          </p>
          <h1>
            {currentPhaseInfo ? currentPhaseInfo.display_name : "Migration Assistant"}
          </h1>
        </div>
        <div className="status-strip">
          <span className={`status-pill ${healthClass}`}>
            <i />
            {healthLabel}
          </span>
          <span className={`status-pill ${busyClass}`}>
            <i />
            {busy ? "Working…" : "Ready"}
          </span>
        </div>
      </header>

      {/* ── Main workspace ── */}
      <section className="workspace">
        {children}
      </section>
    </main>
  );
}

