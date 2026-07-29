import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  canStartServer,
  hostErrorMessage,
  type HostOnboardingView,
  type HostSnapshot,
  type InstructorProfile,
  type RuntimeInstallProgress,
  validateHostServiceInput,
  validateServerConfiguration,
} from "./domain.js";
import { createHostGateway } from "./gateway.js";

const gateway = createHostGateway();
const buildSettings = import.meta.env as unknown as Record<string, unknown>;

function buildSetting(name: string): string {
  const value = buildSettings[name];
  return typeof value === "string" ? value : "";
}

export function HostApp() {
  const [snapshot, setSnapshot] = useState<HostSnapshot>();
  const [onboarding, setOnboarding] = useState<HostOnboardingView>();
  const [profile, setProfile] = useState<InstructorProfile>();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState("Loading protected Host state…");
  const [busy, setBusy] = useState(false);
  const [installProgress, setInstallProgress] = useState<RuntimeInstallProgress>();
  const [selectedBackupId, setSelectedBackupId] = useState<string>();
  const consoleRef = useRef<HTMLPreElement>(null);
  const gate = useMemo(() => (snapshot ? canStartServer(snapshot) : undefined), [snapshot]);

  async function refresh() {
    const [nextSnapshot, nextOnboarding] = await Promise.all([
      gateway.load(),
      gateway.onboarding(),
    ]);
    setSnapshot(nextSnapshot);
    setOnboarding(nextOnboarding);
  }

  useEffect(() => {
    void refresh().catch((reason: unknown) => {
      setError(hostErrorMessage(reason, "Host state could not be loaded."));
    });
  }, []);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen<RuntimeInstallProgress>("host-install-progress", (event) => {
      if (!disposed) setInstallProgress(event.payload);
    }).then((nextUnlisten) => {
      if (disposed) nextUnlisten();
      else unlisten = nextUnlisten;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen("host-server-update", () => {
      void gateway.load().then((next) => {
        if (!disposed) setSnapshot(next);
      });
    }).then((nextUnlisten) => {
      if (disposed) nextUnlisten();
      else unlisten = nextUnlisten;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const consoleElement = consoleRef.current;
    if (consoleElement) consoleElement.scrollTop = consoleElement.scrollHeight;
  }, [snapshot?.serverLogs.length]);

  useEffect(() => {
    const backups = snapshot?.backup.snapshots ?? [];
    setSelectedBackupId((current) =>
      backups.some((backup) => backup.backupId === current) ? current : backups[0]?.backupId,
    );
  }, [snapshot?.backup.snapshots]);

  async function perform(work: () => Promise<string>) {
    setBusy(true);
    setError(undefined);
    try {
      setMessage(await work());
    } catch (reason) {
      setError(hostErrorMessage(reason, "Host setup could not continue."));
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot || !onboarding)
    return (
      <main className="loading-shell">
        <div className="brand-mark">BB</div>
        <p>{error ?? message}</p>
      </main>
    );

  const completed = snapshot.setupSteps.filter((step) => step.status === "complete").length;
  const selectedBackup = snapshot.backup.snapshots.find(
    (backup) => backup.backupId === selectedBackupId,
  );

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
          {snapshot.mode === "native" ? "Windows Host" : "Browser preview"}
        </div>
      </header>

      <section
        className={snapshot.mode === "native" ? "notice product-boundary" : "notice"}
        aria-label="Build boundary"
      >
        <strong>
          {snapshot.mode === "native" ? "Native onboarding enabled." : "Safe browser preview."}
        </strong>
        <span>
          {snapshot.mode === "native"
            ? "Cloud pairing and managed Paper controls are real. Server output stays in the live redacted console below."
            : "This preview exercises the wizard without contacting Supabase or storing credentials."}
        </span>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}
      <div className="status-banner" aria-live="polite">
        {message}
      </div>
      {installProgress ? (
        <section className={`install-progress ${installProgress.phase}`} aria-live="polite">
          <div>
            <strong>
              {installProgress.repair ? "Managed Java repair" : "Managed runtime setup"}
            </strong>
            <span>{installProgress.message}</span>
          </div>
          <progress
            max={100}
            value={installProgress.percent}
            aria-label={installProgress.message}
          />
          <small>
            {installProgress.percent !== undefined
              ? `${installProgress.percent}%`
              : "Checking files…"}
            {installProgress.totalBytes
              ? ` · ${formatMegabytes(installProgress.downloadedBytes)} of ${formatMegabytes(installProgress.totalBytes)}`
              : ""}
          </small>
        </section>
      ) : null}

      <OnboardingWizard
        onboarding={onboarding}
        snapshot={snapshot}
        {...(profile ? { profile } : {})}
        busy={busy}
        perform={perform}
        onConfigured={setOnboarding}
        onSignedIn={(result) => {
          setOnboarding(result.onboarding);
          setProfile(result.profile);
          void gateway.load().then(setSnapshot);
        }}
        onPaired={(view) => {
          setOnboarding(view);
          void gateway.load().then(setSnapshot);
        }}
        onHardwareProbed={setSnapshot}
        onServerConfigured={setSnapshot}
        onRuntimePrepared={setSnapshot}
        onFirewallApproved={setSnapshot}
        onServerTested={setSnapshot}
      />

      <section className="hero-grid">
        <article className="hero-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Camp readiness</p>
              <h2>{gate?.allowed ? "Ready for server start" : "Setup in progress"}</h2>
            </div>
            <span className={`large-status ${gate?.allowed ? "ready" : "blocked"}`}>
              {gate?.allowed ? "READY" : `${completed}/7`}
            </span>
          </div>
          <p className="hero-copy">
            {onboarding.paired
              ? `${onboarding.hostDisplayName ?? "This Host"} is securely paired with ${onboarding.locationName ?? "its camp location"}.`
              : "Complete the guided connection steps above. No PowerShell variables or configuration-file editing are required in the installed app."}
          </p>
          <div className="progress-track" aria-label={`${completed} of 7 setup steps complete`}>
            <span style={{ width: `${(completed / snapshot.setupSteps.length) * 100}%` }} />
          </div>
          <p className="progress-label">
            {completed} of {snapshot.setupSteps.length} safety gates complete
          </p>
        </article>

        <article className="server-card">
          <p className="eyebrow">Minecraft server</p>
          <div className="server-state">
            <span className={`server-icon ${snapshot.server.lifecycle}`}>◆</span>
            <div>
              <h2>{titleCase(snapshot.server.lifecycle)}</h2>
              <p>
                {snapshot.setupSteps.at(-1)?.status === "complete"
                  ? "Verified backup runs automatically before each normal start"
                  : "Waiting for the guided readiness test"}
              </p>
            </div>
          </div>
          <div className={`cloud-connection ${snapshot.cloudConnection.status}`}>
            <span className="cloud-status-dot" aria-hidden="true" />
            <div>
              <strong>Classroom cloud · {titleCase(snapshot.cloudConnection.status)}</strong>
              <p>{snapshot.cloudConnection.detail}</p>
              {snapshot.cloudConnection.lastCommandId ? (
                <small>
                  Last command {snapshot.cloudConnection.lastCommandId.slice(0, 8)}… ·{" "}
                  {titleCase(snapshot.cloudConnection.lastCommandStatus ?? "processed")}
                </small>
              ) : null}
            </div>
          </div>
          {snapshot.server.lifecycle === "stopped" ? (
            <button
              type="button"
              className="primary-button"
              disabled={busy || !gate?.allowed}
              title={gate?.reasons.join(" ")}
              onClick={() =>
                void perform(async () => {
                  setSnapshot(await gateway.startServer());
                  return "Starting Paper. Live readiness will appear below.";
                })
              }
            >
              Start classroom server
            </button>
          ) : null}
          {snapshot.server.lifecycle === "starting" || snapshot.server.lifecycle === "running" ? (
            <button
              type="button"
              className="danger-button"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  setSnapshot(await gateway.stopServer());
                  return "Clean Paper shutdown requested.";
                })
              }
            >
              {snapshot.server.lifecycle === "starting" ? "Cancel startup" : "Stop server"}
            </button>
          ) : null}
          {snapshot.server.lifecycle === "stopping" ? (
            <button type="button" className="locked-button" disabled>
              Stopping safely…
            </button>
          ) : null}
          {snapshot.server.lifecycle === "maintenance" ? (
            <button type="button" className="locked-button" disabled>
              Verifying world files…
            </button>
          ) : null}
          {snapshot.server.lifecycle === "failed" ? (
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  setSnapshot(await gateway.recoverServer());
                  return "Server recovery checks passed. Start is available again.";
                })
              }
            >
              Verify and recover
            </button>
          ) : null}
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
              <h2>Setup evidence</h2>
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
                  {artifact.status === "verified" ? (
                    <small className="artifact-proof">
                      SHA-256 {artifact.checksum.slice(0, 12)}…
                    </small>
                  ) : null}
                </div>
              ))}
            </div>
            {snapshot.artifacts.some(
              (artifact) => artifact.id === "java" && artifact.status === "verified",
            ) ? (
              <button
                type="button"
                className="secondary-button repair-button"
                disabled={busy || snapshot.server.lifecycle !== "stopped"}
                onClick={() =>
                  void perform(async () => {
                    setInstallProgress(undefined);
                    setSnapshot(await gateway.repairManagedJava());
                    return "Java 21 detection, verification, and repair completed inside Host.";
                  })
                }
              >
                {busy ? "Checking Java 21…" : "Verify & repair Java"}
              </button>
            ) : null}
          </article>
        </div>
      </section>

      <section className="bottom-grid">
        <article className="panel compact-panel">
          <p className="eyebrow">Protected configuration</p>
          <h2>Host identity</h2>
          <dl>
            <div>
              <dt>Paired</dt>
              <dd>{onboarding.paired ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{onboarding.locationName ?? "Not selected"}</dd>
            </div>
            <div>
              <dt>Credential</dt>
              <dd>{onboarding.credentialProtection}</dd>
            </div>
          </dl>
        </article>
        <article className="panel compact-panel backup-panel">
          <p className="eyebrow">Recovery</p>
          <h2>World backup & restore</h2>
          <dl>
            <div>
              <dt>Verified backup</dt>
              <dd>{titleCase(snapshot.backup.status)}</dd>
            </div>
            <div>
              <dt>Retained snapshots</dt>
              <dd>{snapshot.backup.backupCount}/5</dd>
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
          <p className="backup-note">
            {snapshot.backup.lastAction === "sheep-city-reset-pending"
              ? "Sheep City reset is pending. Start the server to regenerate it; an earlier snapshot can still be selected and restored."
              : "Choose the snapshot from before the damage occurred. Restore verifies SHA-256 evidence before replacing a working world."}
          </p>
          <div className="backup-history">
            <label htmlFor="backup-snapshot">Recovery point</label>
            <select
              id="backup-snapshot"
              value={selectedBackupId ?? ""}
              disabled={busy || snapshot.backup.snapshots.length === 0}
              onChange={(event) => setSelectedBackupId(event.target.value)}
            >
              {snapshot.backup.snapshots.length === 0 ? (
                <option value="">No world snapshots yet</option>
              ) : null}
              {snapshot.backup.snapshots.map((backup, index) => (
                <option key={backup.backupId} value={backup.backupId}>
                  {formatBackupTime(backup.createdAt)} — {backupReason(backup.reason)}
                  {index === 0 ? " (newest)" : ""}
                </option>
              ))}
            </select>
            {selectedBackup ? (
              <div className="backup-selection">
                <strong>{backupReason(selectedBackup.reason)}</strong>
                <span>
                  {formatBackupTime(selectedBackup.createdAt)} ·{" "}
                  {formatBytes(selectedBackup.totalBytes)} · {selectedBackup.worldCount} worlds
                </span>
              </div>
            ) : null}
          </div>
          <div className="backup-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={
                busy ||
                snapshot.server.lifecycle !== "stopped" ||
                completed !== 7 ||
                snapshot.backup.lastAction === "sheep-city-reset-pending"
              }
              onClick={() =>
                void perform(async () => {
                  if (
                    !window.confirm(
                      "Back up the worlds exactly as they are now? If the world is already damaged, use an older recovery point instead.",
                    )
                  )
                    return "Backup cancelled.";
                  setMessage("Copying and verifying managed world files…");
                  setSnapshot(await gateway.createWorldBackup());
                  return "Managed worlds were backed up and verified.";
                })
              }
            >
              Back up now
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={
                busy ||
                snapshot.server.lifecycle !== "stopped" ||
                snapshot.backup.status !== "verified" ||
                !selectedBackup
              }
              onClick={() =>
                void perform(async () => {
                  if (!selectedBackup) return "Choose a recovery point first.";
                  if (
                    !window.confirm(
                      `Restore ${backupReason(selectedBackup.reason)} from ${formatBackupTime(selectedBackup.createdAt)}? Current managed worlds will be replaced.`,
                    )
                  )
                    return "Restore cancelled.";
                  setMessage("Verifying and restoring the selected managed-world snapshot…");
                  setSnapshot(await gateway.restoreWorldBackup(selectedBackup.backupId));
                  return "The selected verified world backup was restored.";
                })
              }
            >
              Restore selected
            </button>
            <button
              type="button"
              className="reset-button"
              disabled={
                busy ||
                snapshot.server.lifecycle !== "stopped" ||
                completed !== 7 ||
                snapshot.backup.lastAction === "sheep-city-reset-pending"
              }
              onClick={() =>
                void perform(async () => {
                  if (
                    !window.confirm(
                      "Reset Sheep City? Host will first create a verified backup, then regenerate Sheep City on the next server start.",
                    )
                  )
                    return "Sheep City reset cancelled.";
                  setMessage("Creating a recovery snapshot before resetting Sheep City…");
                  setSnapshot(await gateway.resetSheepCityWorld());
                  return "Sheep City will regenerate on the next server start.";
                })
              }
            >
              Reset Sheep City
            </button>
          </div>
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

      <section className="panel server-console-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Built-in server console</p>
            <h2>Paper readiness log</h2>
          </div>
          <span
            className={`console-live-status ${
              snapshot.server.lifecycle === "running" ||
              snapshot.server.lifecycle === "starting" ||
              snapshot.server.lifecycle === "stopping"
                ? "live"
                : ""
            }`}
          >
            {snapshot.server.lifecycle === "running" ||
            snapshot.server.lifecycle === "starting" ||
            snapshot.server.lifecycle === "stopping"
              ? "● LIVE"
              : `${snapshot.serverLogs.length} lines`}
          </span>
        </div>
        <pre ref={consoleRef} aria-live="polite" aria-label="Live redacted Paper server output">
          {snapshot.serverLogs.length
            ? snapshot.serverLogs.join("\n")
            : "The graphical server test has not run yet."}
        </pre>
      </section>
    </main>
  );
}

function OnboardingWizard(props: {
  onboarding: HostOnboardingView;
  snapshot: HostSnapshot;
  profile?: InstructorProfile;
  busy: boolean;
  perform(work: () => Promise<string>): Promise<void>;
  onConfigured(view: HostOnboardingView): void;
  onSignedIn(result: { onboarding: HostOnboardingView; profile: InstructorProfile }): void;
  onPaired(view: HostOnboardingView): void;
  onHardwareProbed(snapshot: HostSnapshot): void;
  onServerConfigured(snapshot: HostSnapshot): void;
  onRuntimePrepared(snapshot: HostSnapshot): void;
  onFirewallApproved(snapshot: HostSnapshot): void;
  onServerTested(snapshot: HostSnapshot): void;
}) {
  const [serviceUrl, setServiceUrl] = useState<string>(
    buildSetting("VITE_BADGERBOTS_SUPABASE_URL"),
  );
  const [publishableKey, setPublishableKey] = useState<string>(
    buildSetting("VITE_BADGERBOTS_SUPABASE_PUBLISHABLE_KEY"),
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [displayName, setDisplayName] = useState("BadgerBots Teacher Laptop");
  const [teacherUsername, setTeacherUsername] = useState("");
  const [serverPort, setServerPort] = useState(25565);
  const [maxHeapGib, setMaxHeapGib] = useState(4);
  const [eulaAccepted, setEulaAccepted] = useState(false);

  const ownerOrganizationIds = new Set(
    props.profile?.memberships
      .filter((membership) => membership.role === "owner")
      .map((membership) => membership.organizationId) ?? [],
  );
  const organizations =
    props.profile?.organizations.filter((item) => ownerOrganizationIds.has(item.id)) ?? [];
  const locations =
    props.profile?.locations.filter((item) => item.organizationId === organizationId) ?? [];

  useEffect(() => {
    if (!organizationId && organizations[0]) setOrganizationId(organizations[0].id);
  }, [organizationId, organizations]);

  useEffect(() => {
    if (!locations.some((location) => location.id === locationId)) {
      setLocationId(locations[0]?.id ?? "");
    }
  }, [locationId, locations]);

  const nextStep = props.snapshot.setupSteps.find((step) => step.status !== "complete");
  const artifactsReady = props.snapshot.artifacts.every(
    (artifact) => artifact.status === "verified",
  );

  if (props.onboarding.paired && nextStep?.id === "server_configuration")
    return (
      <section className="onboarding-card">
        <div className="wizard-heading">
          <span>4</span>
          <div>
            <p className="eyebrow">Minecraft server</p>
            <h2>Prepare the private classroom server</h2>
            <p>
              Host will create the managed server folder and safe configuration. The next screen
              first checks for a compatible existing Java 21 installation. If none is available, it
              installs a private runtime without opening a command window or changing Windows Java
              settings.
            </p>
          </div>
        </div>
        <form
          className="wizard-form runtime-form"
          onSubmit={(event) => {
            event.preventDefault();
            void props.perform(async () => {
              const input = {
                teacherUsername: teacherUsername.trim(),
                serverPort,
                maxHeapGib,
                eulaAccepted,
              };
              const validationErrors = validateServerConfiguration(input);
              if (validationErrors[0]) throw new Error(validationErrors.join(" "));
              const next = await gateway.configureServer(input);
              props.onServerConfigured(next);
              return "Private server settings and teacher Minecraft mapping were saved.";
            });
          }}
        >
          <label>
            Teacher Minecraft username
            <input
              required
              minLength={3}
              maxLength={16}
              pattern="[A-Za-z0-9_]{3,16}"
              placeholder="TeacherPlayer"
              value={teacherUsername}
              onChange={(event) => setTeacherUsername(event.target.value)}
            />
          </label>
          <label>
            Minecraft port
            <input
              required
              type="number"
              min={1024}
              max={65535}
              value={serverPort}
              onChange={(event) => setServerPort(event.target.valueAsNumber)}
            />
          </label>
          <label>
            Server memory
            <select
              value={maxHeapGib}
              onChange={(event) => setMaxHeapGib(Number(event.target.value))}
            >
              <option value={2}>2 GiB</option>
              <option value={4}>4 GiB (recommended)</option>
              <option value={6}>6 GiB</option>
              <option value={8}>8 GiB</option>
            </select>
          </label>
          <label className="checkbox-field">
            <input
              required
              type="checkbox"
              checked={eulaAccepted}
              onChange={(event) => setEulaAccepted(event.target.checked)}
            />
            <span>
              I have read and accept the{" "}
              <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noreferrer">
                Minecraft EULA
              </a>
              .
            </span>
          </label>
          <button className="primary-button" disabled={props.busy || !eulaAccepted}>
            Prepare server
          </button>
        </form>
      </section>
    );

  if (props.onboarding.paired && nextStep?.id === "firewall_approval" && !artifactsReady)
    return (
      <section className="onboarding-card">
        <div className="wizard-heading">
          <span>5</span>
          <div>
            <p className="eyebrow">Verified server files</p>
            <h2>Install the Minecraft runtime</h2>
            <p>
              Host will scan for and verify an existing 64-bit Java 21 runtime first. If none is
              compatible, it downloads the pinned Eclipse Temurin runtime privately. It also
              verifies Paper, adds the bundled BadgerBots plugin, and creates a recovery snapshot.
            </p>
          </div>
        </div>
        <div className="wizard-action">
          <span className="secure-chip">No terminal or configuration editing</span>
          <button
            type="button"
            className="primary-button"
            disabled={props.busy}
            onClick={() =>
              void props.perform(async () => {
                props.onRuntimePrepared(await gateway.prepareRuntimeArtifacts());
                return "Java 21, Paper, and the BadgerBots plugin passed verification.";
              })
            }
          >
            {props.busy ? "Downloading and verifying…" : "Install verified server files"}
          </button>
        </div>
      </section>
    );

  if (props.onboarding.paired && nextStep?.id === "firewall_approval" && artifactsReady)
    return (
      <section className="onboarding-card">
        <div className="wizard-heading">
          <span>6</span>
          <div>
            <p className="eyebrow">Windows network approval</p>
            <h2>Allow Minecraft on this private network</h2>
            <p>
              Windows will show one administrator approval prompt. Host adds only an inbound TCP
              rule for the configured Minecraft port and only for networks marked Private.
            </p>
          </div>
        </div>
        <div className="wizard-action">
          <span className="secure-chip">No public-internet port is opened</span>
          <button
            type="button"
            className="primary-button"
            disabled={props.busy}
            onClick={() =>
              void props.perform(async () => {
                props.onFirewallApproved(await gateway.approveFirewall());
                return "Windows Private-network Minecraft access was approved.";
              })
            }
          >
            {props.busy ? "Waiting for Windows…" : "Approve private-network access"}
          </button>
        </div>
      </section>
    );

  if (props.onboarding.paired && nextStep?.id === "test_server")
    return (
      <section className="onboarding-card">
        <div className="wizard-heading">
          <span>7</span>
          <div>
            <p className="eyebrow">Paper readiness</p>
            <h2>Test the classroom server</h2>
            <p>
              Host will start Paper without a command window, verify the Sheep City plugin,
              authenticated local bridge, and Minecraft listener, then issue a clean shutdown. First
              launch can take up to three minutes.
            </p>
          </div>
        </div>
        <div className="wizard-action">
          <span className="secure-chip">Logs stay inside BadgerBots Host</span>
          <button
            type="button"
            className="primary-button"
            disabled={props.busy}
            onClick={() =>
              void props.perform(async () => {
                props.onServerTested(await gateway.testServer());
                return "Paper readiness passed and the test server stopped cleanly.";
              })
            }
          >
            {props.busy ? "Starting, checking, and stopping Paper…" : "Run server test"}
          </button>
        </div>
      </section>
    );

  if (props.onboarding.paired)
    return (
      <section className="onboarding-card complete-card">
        <div>
          <p className="eyebrow">Connected classroom</p>
          <h2>{props.onboarding.hostDisplayName ?? "Teacher Host"} is paired</h2>
          <p>
            {props.onboarding.organizationName} · {props.onboarding.locationName}
          </p>
          {nextStep ? (
            <p className="next-step-note">
              Next: {nextStep.label}. Host will unlock each control only when its native
              implementation is available.
            </p>
          ) : null}
        </div>
        <div className="button-row">
          <button
            className="primary-button"
            disabled={props.busy}
            onClick={() =>
              void props.perform(async () => {
                props.onHardwareProbed(await gateway.probeHardware());
                return "Laptop platform and memory checks completed.";
              })
            }
          >
            Check this laptop
          </button>
          {props.onboarding.signedIn ? (
            <button
              className="secondary-button"
              disabled={props.busy}
              onClick={() =>
                void props.perform(async () => {
                  props.onConfigured(await gateway.signOut());
                  return "Instructor signed out. The protected Host pairing remains available.";
                })
              }
            >
              Sign out
            </button>
          ) : (
            <span className="secure-chip">Protected on this Windows account</span>
          )}
        </div>
      </section>
    );

  if (!props.onboarding.serviceConfigured)
    return (
      <section className="onboarding-card">
        <div className="wizard-heading">
          <span>1</span>
          <div>
            <p className="eyebrow">First-run setup</p>
            <h2>Connect to BadgerBots</h2>
            <p>
              Production installers can include these public values automatically. Internal builds
              accept them here—never enter a Secret key.
            </p>
          </div>
        </div>
        <form
          className="wizard-form service-form"
          onSubmit={(event) => {
            event.preventDefault();
            void props.perform(async () => {
              const validation = validateHostServiceInput({ serviceUrl, publishableKey });
              if (validation[0]) throw new Error(validation[0]);
              props.onConfigured(await gateway.configureService(serviceUrl, publishableKey));
              setPublishableKey("");
              return "Classroom service configured. Sign in to choose this Host’s location.";
            });
          }}
        >
          <label>
            Supabase Project URL
            <input
              type="url"
              required
              placeholder="https://project.supabase.co"
              value={serviceUrl}
              onChange={(event) => setServiceUrl(event.target.value)}
            />
          </label>
          <label>
            Publishable key
            <input
              type="password"
              required
              autoComplete="off"
              placeholder="sb_publishable_…"
              value={publishableKey}
              onChange={(event) => setPublishableKey(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={props.busy}>
            Continue securely
          </button>
        </form>
      </section>
    );

  if (!props.onboarding.signedIn)
    return (
      <section className="onboarding-card">
        <div className="wizard-heading">
          <span>2</span>
          <div>
            <p className="eyebrow">Instructor access</p>
            <h2>Sign in</h2>
            <p>Your password is used only for this sign-in and is never written to disk.</p>
          </div>
        </div>
        <form
          className="wizard-form"
          onSubmit={(event) => {
            event.preventDefault();
            void props.perform(async () => {
              try {
                const result = await gateway.signIn(email, password);
                props.onSignedIn(result);
                return "Instructor verified. Choose the camp location for this laptop.";
              } finally {
                setPassword("");
              }
            });
          }}
        >
          <label>
            Instructor email
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button className="primary-button" disabled={props.busy}>
              Sign in
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={props.busy}
              onClick={() =>
                void props.perform(async () => {
                  props.onConfigured(await gateway.clearServiceConfiguration());
                  return "Enter the current classroom service connection.";
                })
              }
            >
              Change service connection
            </button>
          </div>
        </form>
      </section>
    );

  return (
    <section className="onboarding-card">
      <div className="wizard-heading">
        <span>3</span>
        <div>
          <p className="eyebrow">Host pairing</p>
          <h2>Choose this laptop’s location</h2>
          <p>The one-time Host credential is protected for the current Windows account.</p>
        </div>
      </div>
      {organizations.length === 0 ? (
        <div className="inline-warning">
          An organization owner must complete initial Host pairing. Assistant accounts cannot pair a
          new laptop.
        </div>
      ) : (
        <form
          className="wizard-form pair-form"
          onSubmit={(event) => {
            event.preventDefault();
            void props.perform(async () => {
              const next = await gateway.pairHost(organizationId, locationId, displayName);
              props.onPaired(next);
              return "Host paired. The credential is protected by Windows and was not displayed.";
            });
          }}
        >
          <label>
            Organization
            <select
              required
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Location
            <select
              required
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Laptop name
            <input
              required
              minLength={3}
              maxLength={80}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={props.busy || !locationId}>
            Pair this Host
          </button>
        </form>
      )}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "None";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

function formatBackupTime(value: string): string {
  const unixSeconds = value.startsWith("unix-") ? Number(value.slice(5)) : Number.NaN;
  const date = Number.isFinite(unixSeconds) ? new Date(unixSeconds * 1000) : new Date(value);
  return Number.isNaN(date.getTime())
    ? "Time unavailable"
    : date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function backupReason(reason: HostSnapshot["backup"]["snapshots"][number]["reason"]): string {
  const labels: Record<typeof reason, string> = {
    "automatic-before-start": "Before server start",
    manual: "Manual snapshot",
    "before-sheep-city-reset": "Before Sheep City reset",
    "recovery-after-interruption": "Crash-recovery snapshot",
    legacy: "Earlier Host snapshot",
  };
  return labels[reason];
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
