import type { WizardStep } from "../types/migration";

const labels: Array<{ step: WizardStep; label: string }> = [
  { step: "welcome", label: "Welcome" },
  { step: "source", label: "Source" },
  { step: "cloud", label: "Cloud" },
  { step: "destination", label: "Destination" },
  { step: "review", label: "Review" },
  { step: "scan", label: "AI Scan" },
  { step: "approval", label: "Approval" },
];

interface StepperProps {
  currentStep: WizardStep;
  onStepChange: (step: WizardStep) => void;
}

export function Stepper({ currentStep, onStepChange }: StepperProps) {
  const activeIndex = labels.findIndex((item) => item.step === currentStep);

  return (
    <ol className="stepper">
      {labels.map((item, index) => (
        <li key={item.step}>
          <button
            className={item.step === currentStep ? "active" : index < activeIndex ? "done" : ""}
            type="button"
            onClick={() => onStepChange(item.step)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {item.label}
          </button>
        </li>
      ))}
    </ol>
  );
}
