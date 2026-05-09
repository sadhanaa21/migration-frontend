interface WelcomePageProps {
  onStart: () => void;
}

export function WelcomePage({ onStart }: WelcomePageProps) {
  return (
    <section className="welcome-grid">
      <div className="welcome-copy">
        <p className="eyebrow">Welcome</p>
        <h2>Move SAP data into your cloud lake with an approval-gated AI workflow.</h2>
        <p>
          Connect the source, choose Azure as the cloud landing zone, scan the available
          SAP APIs and tables, then approve the generated migration plan.
        </p>
        <button className="primary-button" type="button" onClick={onStart}>
          Start Migration Setup
        </button>
      </div>

      <div className="journey-map">
        {["Connect SAP", "Choose cloud", "Set destination", "AI scan", "Approve upload"].map(
          (item, index) => (
            <div className="journey-step" key={item}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item}</strong>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
