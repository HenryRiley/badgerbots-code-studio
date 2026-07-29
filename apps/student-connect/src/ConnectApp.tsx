import { useEffect, useMemo, useState } from "react";
import { displayDeviceId, readiness, type ConnectSnapshot } from "./domain.js";
import { createConnectGateway } from "./gateway.js";

const gateway = createConnectGateway();

export function ConnectApp() {
  const [snapshot, setSnapshot] = useState<ConnectSnapshot>();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const gate = useMemo(() => (snapshot ? readiness(snapshot) : undefined), [snapshot]);

  useEffect(() => {
    void gateway
      .load()
      .then(setSnapshot)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Connect could not load device state.");
      });
  }, []);

  if (!snapshot)
    return (
      <main className="loading">
        <span className="logo">BB</span>
        <p>{error ?? "Checking this student laptop…"}</p>
      </main>
    );

  const detected = snapshot.launchers.filter((candidate) => candidate.detected);
  const checks = [
    ["Device identity", snapshot.device.persisted ? "ready" : "blocked"],
    ["Minecraft mapping", snapshot.mapping.minecraftUsername ? "ready" : "blocked"],
    ["Managed profile", snapshot.profile],
    ["Client connection mod", snapshot.clientMod],
    ["Camp server entry", snapshot.serverEntry],
  ] as const;

  return (
    <main className="shell">
      <header>
        <div className="brand">
          <span className="logo">BB</span>
          <div>
            <p className="eyebrow">BadgerBots Code Studio</p>
            <h1>Connect</h1>
          </div>
        </div>
        <span className={`mode ${snapshot.mode}`}>
          {snapshot.mode === "native" ? "Student helper" : "Browser preview"}
        </span>
      </header>

      {message ? <div className="action-message">{message}</div> : null}
      <section className={`readiness ${gate?.allowed ? "ready" : "blocked"}`}>
        <div>
          <p className="eyebrow">Minecraft readiness</p>
          <h2>{gate?.allowed ? "Ready to join camp" : "Setup needs an instructor"}</h2>
          <p>
            {gate?.allowed
              ? "This device has a verified managed profile."
              : "Connect will not modify Minecraft until identity, launcher, and artifact checks pass."}
          </p>
        </div>
        <div className="readiness-actions">
          <strong>{gate?.allowed ? "READY" : "SETUP"}</strong>
          <button
            type="button"
            className="coding-console-button"
            onClick={() => {
              setError(undefined);
              void gateway
                .openCodingConsole()
                .then(setMessage)
                .catch((reason: unknown) =>
                  setError(
                    reason instanceof Error
                      ? reason.message
                      : "The coding console could not be opened.",
                  ),
                );
            }}
          >
            Open coding console
          </button>
          <small>Links this device to the weekly camper join.</small>
        </div>
      </section>

      <section className="grid">
        <article className="card identity">
          <p className="eyebrow">This laptop</p>
          <h2>Persistent device identity</h2>
          <dl>
            <div>
              <dt>Device ID</dt>
              <dd>
                {snapshot.device.persisted
                  ? displayDeviceId(snapshot.device.id)
                  : "Ephemeral preview"}
              </dd>
            </div>
            <div>
              <dt>Fixed Minecraft username</dt>
              <dd>{snapshot.mapping.minecraftUsername ?? "Instructor assignment required"}</dd>
            </div>
          </dl>
          <p className="note">
            The device mapping persists between camps. Weekly camper names are not stored here.
          </p>
        </article>

        <article className="card">
          <p className="eyebrow">Managed launcher</p>
          <h2>{detected.length ? "Launcher detected" : "Prism or MultiMC not found"}</h2>
          <ul className="launcher-list">
            {snapshot.launchers.map((candidate) => (
              <li key={`${candidate.kind}-${candidate.root}`}>
                <span className={candidate.detected ? "dot ready" : "dot blocked"} />
                <div>
                  <strong>{candidate.label}</strong>
                  <p>{candidate.root}</p>
                </div>
                <small>{candidate.detected ? "Detected" : "Not found"}</small>
              </li>
            ))}
          </ul>
          <button type="button" disabled>
            Install or repair managed profile — unavailable
          </button>
        </article>
      </section>

      <section className="grid lower">
        <article className="card">
          <p className="eyebrow">Readiness checklist</p>
          <h2>Required components</h2>
          <ul className="check-list">
            {checks.map(([label, status]) => (
              <li key={label}>
                <span className={`dot ${status}`} />
                <strong>{label}</strong>
                <small>{status}</small>
              </li>
            ))}
          </ul>
        </article>

        <article className="card diagnostics">
          <p className="eyebrow">In-app console</p>
          <h2>Redacted diagnostics</h2>
          <ul>
            {snapshot.diagnostics
              .slice(-5)
              .reverse()
              .map((event) => (
                <li key={event.id}>
                  <span>{event.level}</span>
                  <div>
                    <strong>{event.code}</strong>
                    <p>{event.message}</p>
                  </div>
                </li>
              ))}
          </ul>
        </article>
      </section>

      <footer>
        <p>{gate?.reasons[0] ?? "All checks passed."}</p>
        <span>No Microsoft password is stored by Connect.</span>
      </footer>
    </main>
  );
}
