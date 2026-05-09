import { useEffect, useMemo, useState } from "react";
import { checkCoreHealth, runSapAgent } from "./api/client";
import { initialMigrationState } from "./state/migrationState";
import type { MigrationState, SapAgentResponse, WizardStep } from "./types/migration";
import { AppShell } from "./components/AppShell";
import { WelcomePage } from "./pages/WelcomePage";
import { SourcePage } from "./pages/SourcePage";
import { CloudPage } from "./pages/CloudPage";
import { DestinationPage } from "./pages/DestinationPage";
import { ReviewPage } from "./pages/ReviewPage";
import { ScanPage } from "./pages/ScanPage";
import { ApprovalPage } from "./pages/ApprovalPage";

const steps: WizardStep[] = [
  "welcome",
  "source",
  "cloud",
  "destination",
  "review",
  "scan",
  "approval",
];

export function App() {
  const [currentStep, setCurrentStep] = useState<WizardStep>("welcome");
  const [state, setState] = useState<MigrationState>(initialMigrationState);
  const [coreOnline, setCoreOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Ready to configure your migration.");

  useEffect(() => {
    checkCoreHealth().then(setCoreOnline);
  }, []);

  const selectedTables = useMemo(
    () => state.scannedTables.filter((table) => table.selected),
    [state.scannedTables],
  );

  function updateState(patch: Partial<MigrationState>) {
    setState((previous) => ({ ...previous, ...patch }));
  }

  function updateNested<Key extends keyof MigrationState>(
    key: Key,
    value: Partial<MigrationState[Key]>,
  ) {
    setState((previous): MigrationState => ({
      ...previous,
      [key]: {
        ...(previous[key] as Record<string, unknown>),
        ...(value as Record<string, unknown>),
      } as MigrationState[Key],
    }));
  }

  function goNext() {
    const index = steps.indexOf(currentStep);
    setCurrentStep(steps[Math.min(index + 1, steps.length - 1)]);
  }

  function goBack() {
    const index = steps.indexOf(currentStep);
    setCurrentStep(steps[Math.max(index - 1, 0)]);
  }

  async function handleTestCore() {
    setBusy(true);
    setNotice("Checking the core API health endpoint...");
    const ok = await checkCoreHealth();
    setCoreOnline(ok);
    setNotice(ok ? "Core API is reachable." : "Core API is not reachable. Check the backend terminal.");
    setBusy(false);
  }

  function buildMigrationPrompt() {
    const tableNames = selectedTables.map((table) => table.name).join(", ");
    const paths = selectedTables.map((table) => `${table.name} -> ${table.destinationPath}`).join("; ");
    const limit = selectedTables.length > 1 ? "top 10 records from each selected table" : "top 10 records";

    return [
      `Fetch ${limit} from SAP S/4HANA for these selected objects: ${tableNames}.`,
      `Upload the fetched records to Azure Blob Storage as ${state.outputFormat}.`,
      `Use these destination paths: ${paths}.`,
      "Ask for human approval before writing to Azure Blob Storage.",
    ].join(" ");
  }

  async function requestApproval() {
    if (selectedTables.length === 0) {
      setNotice("Select at least one table before requesting approval.");
      return;
    }

    setBusy(true);
    setNotice("Asking the SAP agent to prepare an approval-gated upload...");

    try {
      const response = await runSapAgent({ message: buildMigrationPrompt() });
      applyAgentResponse(response);

      if (response.status === "approval_required" && response.approval) {
        setNotice("Approval request created. Review it before upload.");
        setCurrentStep("approval");
      } else {
        setNotice(response.message);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create approval request.");
    } finally {
      setBusy(false);
    }
  }

  async function resolveApproval(approve: boolean) {
    if (!state.approval) {
      setNotice("No active approval request found.");
      return;
    }

    setBusy(true);
    setNotice(approve ? "Approving upload and resuming the backend graph..." : "Rejecting upload request...");

    try {
      const response = await runSapAgent({
        approval_id: state.approval.approval_id,
        approve,
      });
      applyAgentResponse(response);
      setNotice(response.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to resolve approval.");
    } finally {
      setBusy(false);
    }
  }

  function applyAgentResponse(response: SapAgentResponse) {
    setState((previous) => ({
      ...previous,
      approval: response.approval ?? null,
      lastAgentResponse: response,
    }));
  }

  const pageProps = {
    state,
    updateState,
    updateNested,
    goNext,
    goBack,
    busy,
    setNotice,
  };

  return (
    <AppShell
      currentStep={currentStep}
      coreOnline={coreOnline}
      notice={notice}
      busy={busy}
      onStepChange={setCurrentStep}
    >
      {currentStep === "welcome" && <WelcomePage onStart={goNext} />}
      {currentStep === "source" && (
        <SourcePage {...pageProps} onTestCore={handleTestCore} />
      )}
      {currentStep === "cloud" && <CloudPage {...pageProps} />}
      {currentStep === "destination" && <DestinationPage {...pageProps} />}
      {currentStep === "review" && (
        <ReviewPage
          {...pageProps}
          coreOnline={coreOnline}
          onTestCore={handleTestCore}
        />
      )}
      {currentStep === "scan" && (
        <ScanPage
          {...pageProps}
          selectedTables={selectedTables}
          onRequestApproval={requestApproval}
        />
      )}
      {currentStep === "approval" && (
        <ApprovalPage
          {...pageProps}
          selectedTables={selectedTables}
          onResolveApproval={resolveApproval}
        />
      )}
    </AppShell>
  );
}
