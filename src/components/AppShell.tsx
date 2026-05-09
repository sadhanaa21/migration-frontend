import type { ReactNode } from "react";
import type { WizardStep } from "../types/migration";
import { Stepper } from "./Stepper";

interface AppShellProps {
  children: ReactNode;
  currentStep: WizardStep;
  coreOnline: boolean | null;
  notice: string;
  busy: boolean;
  onStepChange: (step: WizardStep) => void;
}

export function AppShell({
  children,
  currentStep,
  coreOnline,
  notice,
  busy,
  onStepChange,
}: AppShellProps) {
  const healthClass = coreOnline === null ? "neutral" : coreOnline ? "ok" : "error";
  const healthLabel = coreOnline === null ? "Checking API" : coreOnline ? "Core API Online" : "Core API Offline";

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Migration steps">
        <div className="brand-block">
          <span className="brand-mark">AI</span>
          <div>
            <strong>Migration Assistant</strong>
            <small>SAP to data lake</small>
          </div>
        </div>
        <Stepper currentStep={currentStep} onStepChange={onStepChange} />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Agentic data migration</p>
            <h1>AI Data Lake Migration Assistant</h1>
          </div>
          <div className="status-strip">
            <span className={`status-pill ${healthClass}`}>
              <i />
              {healthLabel}
            </span>
            <span className={`status-pill ${busy ? "warn" : "neutral"}`}>
              <i />
              {busy ? "Working" : "Ready"}
            </span>
          </div>
        </header>

        <div className="notice-bar" role="status">
          {notice}
        </div>

        {children}
      </section>
    </main>
  );
}
