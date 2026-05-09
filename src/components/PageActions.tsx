interface PageActionsProps {
  back?: () => void;
  next?: () => void;
  nextLabel?: string;
  disabled?: boolean;
  primary?: () => void;
  primaryLabel?: string;
}

export function PageActions({
  back,
  next,
  nextLabel = "Continue",
  disabled,
  primary,
  primaryLabel,
}: PageActionsProps) {
  return (
    <div className="page-actions">
      {back && (
        <button className="secondary-button" type="button" onClick={back}>
          Back
        </button>
      )}
      {primary && (
        <button className="secondary-button" type="button" disabled={disabled} onClick={primary}>
          {primaryLabel}
        </button>
      )}
      {next && (
        <button className="primary-button" type="button" disabled={disabled} onClick={next}>
          {nextLabel}
        </button>
      )}
    </div>
  );
}
