import { useEffect, useMemo, useState } from "react";
import { canStartServer, nextIncompleteStep, type HostSnapshot } from "./domain.js";
import { createHostGateway } from "./gateway.js";

const gateway = createHostGateway();

export function HostApp() {
  const [snapshot, setSnapshot] = useState<HostSnapshot>();
  const [error, setError] = useState<string>();
  const gate = useMemo(() => (snapshot ? canStartServer(snapshot) : undefined), [snapshot]);

  useEffect(() => {
    void gateway
      .load()
      .then(setSnapshot)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Host state could not be loaded.");
      });
  }, []);

  if (!snapshot)
    return (
      <main className="loading-shell">
        <div className="brand-mark">BB</div>
        <p>{error ?? "Loading protected Host state…"}</p>
      </main>
    );

  const nextStep = nextIncompleteStep(snapshot);
  const completed = snapshot.setupSteps.filter((step) => step.status === "complete").length;

  async function completeNextStep() {
    if (!nextStep) return;
    try {
      setSnapshot(await gateway.completeStep(nextStep, completionDetail(nextStep)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Setup step failed.");
    }
  }

  return (
    <main className="host-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">BB</div>
          <div>
            <p className="eyebrow">BadgerBots Code Studio</p>
            <h1>Host Control Center</h1>
          </div>
        </div>
        <div className={`mode-chip ${snapshot.mode}`}>
          <span className="status-dot" />
          {snapshot.mode === "native" ? "Native prototype" : "Browser preview"}
        </div>
      </header>

      <section className="notice" aria-label="Prototype boundary">
        <strong>Checkpoint 4 engineering preview.</strong>
        <span>
          Paper launch, firewall changes, downloads, backups, updates, and sleep control remain
          locked until their verified native implementations exist.
        </span>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="hero-grid">
        <article className="hero-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Camp readiness</p>
              <h2>{gate?.allowed ? "Ready for server start" : "Setup required"}</h2>
            </div>
            <span className={`large-status ${gate?.allowed ? "ready" : "blocked"}`}>
              {gate?.allowed ? "READY" : "LOCKED"}
            </span>
          </div>
          <p className="hero-copy">
            {gate?.allowed
              ? "All safety gates are satisfied."
              : "The Host will refuse to launch Minecraft until setup, artifact, recovery, and backup gates pass."}
          </p>
          <div className="progress-track" aria-label={`${completed} of 7 setup steps complete`}>
            <span style={{ width: `${(completed / snapshot.setupSteps.length) * 100}%` }} />
          </div>
          <p className="progress-label">
            {completed} of {snapshot.setupSteps.length} setup steps complete
          </p>
          <div className="button-row">
            <button
              type="button"
              className="primary-button"
              onClick={() => void completeNextStep()}
              disabled={!nextStep}
            >
              {nextStep ? `Preview ${labelFor(nextStep)}` : "Setup preview complete"}
            </button>
            {snapshot.mode === "browser_preview" ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void gateway.resetPreview().then(setSnapshot)}
              >
                Reset preview
              </button>
            ) : null}
          </div>
        </article>

        <article className="server-card">
          <p className="eyebrow">Minecraft server</p>
          <div className="server-state">
            <span className={`server-icon ${snapshot.server.lifecycle}`}>◆</span>
            <div>
              <h2>{titleCase(snapshot.server.lifecycle)}</h2>
              <p>Paper controls unavailable</p>
            </div>
          </div>
          <button type="button" className="locked-button" disabled title={gate?.reasons.join(" ")}>
            Start server — unavailable
          </button>
          <ul className="gate-list">
            {(gate?.reasons ?? []).slice(0, 3).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel setup-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">First-run wizard</p>
              <h2>Protected setup sequence</h2>
            </div>
            <span>{completed}/7</span>
          </div>
          <ol className="setup-list">
            {snapshot.setupSteps.map((step, index) => (
              <li key={step.id} className={step.status}>
                <span className="step-number">{step.status === "complete" ? "✓" : index + 1}</span>
                <div>
                  <strong>{step.label}</strong>
                  <p>{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </article>

        <div className="right-stack">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Readiness</p>
                <h2>Teacher laptop</h2>
              </div>
              <span>Evidence</span>
            </div>
            <div className="check-list">
              {snapshot.readiness.map((check) => (
                <div className="check-row" key={check.id}>
                  <span className={`check-indicator ${check.status}`} />
                  <div>
                    <strong>{check.label}</strong>
                    <p>{check.measured}</p>
                  </div>
                  <small>{check.requirement}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Managed supply chain</p>
                <h2>Server artifacts</h2>
              </div>
              <span>Checksum required</span>
            </div>
            <div className="artifact-grid">
              {snapshot.artifacts.map((artifact) => (
                <div key={artifact.id}>
                  <span className={`artifact-status ${artifact.status}`}>{artifact.status}</span>
                  <strong>{artifact.label}</strong>
                  <p>{artifact.version}</p>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="bottom-grid">
        <article className="panel compact-panel">
          <p className="eyebrow">Recovery</p>
          <h2>Backup & restart</h2>
          <dl>
            <div>
              <dt>Verified backup</dt>
              <dd>{titleCase(snapshot.backup.status)}</dd>
            </div>
            <div>
              <dt>Last server exit</dt>
              <dd>{titleCase(snapshot.server.lastExit)}</dd>
            </div>
            <div>
              <dt>Recovery required</dt>
              <dd>{snapshot.server.recoveryRequired ? "Yes" : "No"}</dd>
            </div>
          </dl>
        </article>
        <article className="panel compact-panel">
          <p className="eyebrow">Connectivity</p>
          <h2>Cloud & updates</h2>
          <dl>
            <div>
              <dt>Outbound queue</dt>
              <dd>{snapshot.pendingOutboundMessages}</dd>
            </div>
            <div>
              <dt>Update channel</dt>
              <dd>{titleCase(snapshot.update.channel)}</dd>
            </div>
            <div>
              <dt>Update status</dt>
              <dd>{titleCase(snapshot.update.status)}</dd>
            </div>
          </dl>
        </article>
        <article className="panel diagnostics-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Redacted diagnostics</p>
              <h2>Recent events</h2>
            </div>
            <span>{snapshot.diagnostics.length}</span>
          </div>
          <ul>
            {snapshot.diagnostics
              .slice(-4)
              .reverse()
              .map((event) => (
                <li key={event.id}>
                  <span className={event.level}>{event.level}</span>
                  <div>
                    <strong>{event.code}</strong>
                    <p>{event.message}</p>
                  </div>
                </li>
              ))}
          </ul>
        </article>
      </section>
    </main>
  );
}

function labelFor(value: string): string {
  return value.replaceAll("_", " ");
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function completionDetail(step: string): string {
  const details: Record<string, string> = {
    instructor_sign_in: "Preview only — no credential stored.",
    location: "Madison pilot preview",
    hardware_readiness: "Preview acknowledged — native measurements still required.",
    server_configuration: "Safe defaults previewed; artifacts remain missing.",
    teacher_minecraft_mapping: "Preview mapping acknowledged; no Microsoft credentials stored.",
    firewall_approval: "Preview only — no firewall rule was created.",
    test_server: "Blocked from real launch until artifacts are verified.",
  };
  return details[step] ?? "Previewed";
}
