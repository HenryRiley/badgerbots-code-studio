import { useEffect, useMemo, useState } from "react";
import {
  canStartServer,
  hostErrorMessage,
  type HostOnboardingView,
  type HostSnapshot,
  type InstructorProfile,
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
            ? "Cloud sign-in and Host pairing are real. Server controls unlock only after the remaining artifact, readiness, firewall, and recovery work is verified."
            : "This preview exercises the wizard without contacting Supabase or storing credentials."}
        </span>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}
      <div className="status-banner" aria-live="polite">
        {message}
      </div>

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
                  ? "Readiness test stopped cleanly"
                  : "Waiting for the guided readiness test"}
              </p>
            </div>
          </div>
          <button type="button" className="locked-button" disabled title={gate?.reasons.join(" ")}>
            Camp server controls — next slice
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
                      {artifact.checksum === "system-version-probe"
                        ? "System version probe"
                        : `SHA-256 ${artifact.checksum.slice(0, 12)}…`}
                    </small>
                  ) : null}
                </div>
              ))}
            </div>
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
          <span>{snapshot.serverLogs.length} lines</span>
        </div>
        <pre aria-label="Redacted Paper server output">
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
              Host will create the managed server folder and safe configuration. It checks Java 21
              without opening a command window.
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
              Host will download the pinned Paper server from PaperMC, verify its SHA-256 checksum,
              install the BadgerBots plugin bundled with this installer, and create a configuration
              recovery snapshot.
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
                return "Paper, the BadgerBots plugin, and Java 21 passed runtime preparation.";
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
              minLength={12}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={props.busy}>
            Sign in
          </button>
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

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
