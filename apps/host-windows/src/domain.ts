export const SETUP_STEP_IDS = [
  "instructor_sign_in",
  "location",
  "hardware_readiness",
  "server_configuration",
  "teacher_minecraft_mapping",
  "firewall_approval",
  "test_server",
] as const;

export type SetupStepId = (typeof SETUP_STEP_IDS)[number];
export type CheckStatus = "pending" | "ready" | "warning" | "blocked";
export type ServerLifecycle = "stopped" | "starting" | "running" | "stopping" | "failed";

export interface SetupStep {
  id: SetupStepId;
  label: string;
  status: "pending" | "complete" | "blocked";
  detail: string;
}

export interface ReadinessCheck {
  id: string;
  label: string;
  status: CheckStatus;
  measured: string;
  requirement: string;
  recovery?: string;
}

export interface ManagedArtifact {
  id: "java" | "paper" | "plugin";
  label: string;
  status: "missing" | "verified" | "invalid";
  version: string;
  checksum: string;
}

export interface DiagnosticEvent {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error";
  code: string;
  message: string;
  correlationId: string;
}

export interface HostSnapshot {
  schemaVersion: 1;
  mode: "browser_preview" | "native";
  installationId: string;
  locationName: string;
  setupSteps: SetupStep[];
  readiness: ReadinessCheck[];
  artifacts: ManagedArtifact[];
  server: {
    lifecycle: ServerLifecycle;
    activeCamp: boolean;
    sleepInhibition: "inactive" | "requested" | "active";
    lastExit: "clean" | "unclean" | "unknown";
    recoveryRequired: boolean;
  };
  backup: {
    status: "never" | "verified" | "failed";
    lastVerifiedAt?: string;
  };
  update: {
    status: "not_checked" | "current" | "available" | "blocked";
    channel: "internal";
  };
  pendingOutboundMessages: number;
  diagnostics: DiagnosticEvent[];
  serverLogs: string[];
}

export interface HostOnboardingView {
  serviceConfigured: boolean;
  signedIn: boolean;
  paired: boolean;
  serviceUrl?: string;
  instructorEmail?: string;
  organizationName?: string;
  locationName?: string;
  hostId?: string;
  hostDisplayName?: string;
  credentialProtection: string;
}

export interface InstructorProfile {
  memberships: { organizationId: string; role: "owner" | "assistant" }[];
  organizations: { id: string; name: string }[];
  locations: { id: string; organizationId: string; name: string }[];
}

export interface SignInResult {
  onboarding: HostOnboardingView;
  profile: InstructorProfile;
}

export interface ServerConfigurationInput {
  teacherUsername: string;
  serverPort: number;
  maxHeapGib: number;
  eulaAccepted: boolean;
}

export function validateServerConfiguration(input: ServerConfigurationInput): string[] {
  const errors: string[] = [];
  if (!/^[A-Za-z0-9_]{3,16}$/.test(input.teacherUsername.trim()))
    errors.push("Enter the teacher’s exact 3–16 character Minecraft Java username.");
  if (!Number.isInteger(input.serverPort) || input.serverPort < 1024 || input.serverPort > 65535)
    errors.push("Choose a Minecraft port between 1024 and 65535.");
  if (![2, 4, 6, 8].includes(input.maxHeapGib))
    errors.push("Choose a server memory limit of 2, 4, 6, or 8 GiB.");
  if (!input.eulaAccepted)
    errors.push("Read and accept the Minecraft EULA before preparing the server.");
  return errors;
}

export function validateHostServiceInput(input: {
  serviceUrl: string;
  publishableKey: string;
}): string[] {
  const errors: string[] = [];
  try {
    const url = new URL(input.serviceUrl.trim());
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".supabase.co") ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      errors.push("Use the bare HTTPS Supabase Project URL.");
  } catch {
    errors.push("Enter a valid HTTPS classroom service URL.");
  }
  if (!input.publishableKey.startsWith("sb_publishable_") || input.publishableKey.length < 24)
    errors.push("Use the browser-safe Supabase Publishable key.");
  return errors;
}

const setupLabels: Record<SetupStepId, string> = {
  instructor_sign_in: "Instructor sign-in",
  location: "Camp location",
  hardware_readiness: "Hardware readiness",
  server_configuration: "Server configuration",
  teacher_minecraft_mapping: "Teacher Minecraft mapping",
  firewall_approval: "Scoped firewall approval",
  test_server: "Test server",
};

export function createInitialHostSnapshot(mode: HostSnapshot["mode"]): HostSnapshot {
  return {
    schemaVersion: 1,
    mode,
    installationId: mode === "native" ? "native-installation" : "browser-preview",
    locationName: "Not configured",
    setupSteps: SETUP_STEP_IDS.map((id) => ({
      id,
      label: setupLabels[id],
      status: "pending",
      detail: id === "instructor_sign_in" ? "Required before location setup." : "Waiting",
    })),
    readiness: [
      {
        id: "platform",
        label: "Supported Windows platform",
        status: mode === "native" ? "pending" : "blocked",
        measured: mode === "native" ? "Probe pending" : "Browser preview",
        requirement: "Windows 10/11 x64",
        recovery: "Run the signed Host prototype on the teacher Windows PC.",
      },
      {
        id: "memory",
        label: "System memory",
        status: "pending",
        measured: "Not measured",
        requirement: "16 GB recommended for 25 campers",
      },
      {
        id: "network",
        label: "Local network",
        status: "pending",
        measured: "Not tested",
        requirement: "Private Wi-Fi and scoped Minecraft port",
      },
    ],
    artifacts: [
      {
        id: "java",
        label: "Managed Java 21",
        status: "missing",
        version: "pending",
        checksum: "pending",
      },
      {
        id: "paper",
        label: "Paper 1.21.11",
        status: "missing",
        version: "pending",
        checksum: "pending",
      },
      {
        id: "plugin",
        label: "BadgerBots Paper plugin",
        status: "missing",
        version: "pending",
        checksum: "pending",
      },
    ],
    server: {
      lifecycle: "stopped",
      activeCamp: false,
      sleepInhibition: "inactive",
      lastExit: "unknown",
      recoveryRequired: false,
    },
    backup: { status: "never" },
    update: { status: "not_checked", channel: "internal" },
    pendingOutboundMessages: 0,
    diagnostics: [
      diagnostic("HOST_PREVIEW_READY", "Host safety model loaded. Paper controls remain locked."),
    ],
    serverLogs: [],
  };
}

export function nextIncompleteStep(snapshot: HostSnapshot): SetupStepId | undefined {
  return snapshot.setupSteps.find((step) => step.status !== "complete")?.id;
}

export function completeSetupStep(
  snapshot: HostSnapshot,
  stepId: SetupStepId,
  detail: string,
): HostSnapshot {
  const expected = nextIncompleteStep(snapshot);
  if (expected !== stepId)
    return appendDiagnostic(
      snapshot,
      diagnostic(
        "SETUP_ORDER_REJECTED",
        `Complete ${setupLabels[expected ?? "test_server"]} first.`,
        "warning",
      ),
    );
  return {
    ...snapshot,
    setupSteps: snapshot.setupSteps.map((step) =>
      step.id === stepId
        ? { ...step, status: "complete", detail: sanitizeDiagnosticText(detail) }
        : step,
    ),
    diagnostics: [
      ...snapshot.diagnostics,
      diagnostic("SETUP_STEP_COMPLETED", `${setupLabels[stepId]} completed.`),
    ].slice(-100),
  };
}

export function canStartServer(snapshot: HostSnapshot): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (snapshot.setupSteps.some((step) => step.status !== "complete"))
    reasons.push("First-run setup is incomplete.");
  if (snapshot.readiness.some((check) => check.status === "blocked" || check.status === "pending"))
    reasons.push("Readiness checks are incomplete or blocked.");
  if (snapshot.artifacts.some((artifact) => artifact.status !== "verified"))
    reasons.push("Managed Java, Paper, and plugin artifacts are not verified.");
  if (snapshot.backup.status !== "verified") reasons.push("No verified recovery backup exists.");
  if (snapshot.server.recoveryRequired) reasons.push("Crash recovery must finish before restart.");
  return { allowed: reasons.length === 0, reasons };
}

export function requestServerTransition(
  snapshot: HostSnapshot,
  action: "start" | "mark_running" | "stop" | "mark_stopped" | "crash",
): HostSnapshot {
  if (action === "start") {
    const gate = canStartServer(snapshot);
    if (!gate.allowed)
      return appendDiagnostic(
        snapshot,
        diagnostic("SERVER_START_BLOCKED", gate.reasons.join(" "), "warning"),
      );
    if (snapshot.server.lifecycle !== "stopped") return invalidTransition(snapshot);
    return withServer(snapshot, { lifecycle: "starting" }, "SERVER_START_REQUESTED");
  }
  if (action === "mark_running" && snapshot.server.lifecycle === "starting")
    return withServer(
      snapshot,
      { lifecycle: "running", activeCamp: true, sleepInhibition: "requested" },
      "SERVER_RUNNING",
    );
  if (action === "stop" && snapshot.server.lifecycle === "running")
    return withServer(snapshot, { lifecycle: "stopping" }, "SERVER_STOP_REQUESTED");
  if (action === "mark_stopped" && snapshot.server.lifecycle === "stopping")
    return withServer(
      snapshot,
      {
        lifecycle: "stopped",
        activeCamp: false,
        sleepInhibition: "inactive",
        lastExit: "clean",
        recoveryRequired: false,
      },
      "SERVER_STOPPED",
    );
  if (action === "crash" && ["starting", "running", "stopping"].includes(snapshot.server.lifecycle))
    return withServer(
      snapshot,
      {
        lifecycle: "failed",
        activeCamp: false,
        sleepInhibition: "inactive",
        lastExit: "unclean",
        recoveryRequired: true,
      },
      "SERVER_UNCLEAN_EXIT",
      "error",
    );
  return invalidTransition(snapshot);
}

export function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\b(?:token|password|secret|authorization)\s*[:=]\s*\S+/gi, "[redacted-secret]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted-credential]")
    .slice(0, 500);
}

export function hostErrorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof Error && reason.message.trim()) return reason.message.trim();
  if (typeof reason === "string" && reason.trim()) return reason.trim();
  return fallback;
}

function diagnostic(
  code: string,
  message: string,
  level: DiagnosticEvent["level"] = "info",
): DiagnosticEvent {
  const serial = Math.random().toString(36).slice(2, 10);
  return {
    id: `event-${serial}`,
    timestamp: new Date().toISOString(),
    level,
    code,
    message: sanitizeDiagnosticText(message),
    correlationId: `host-${serial}`,
  };
}

function appendDiagnostic(snapshot: HostSnapshot, event: DiagnosticEvent): HostSnapshot {
  return { ...snapshot, diagnostics: [...snapshot.diagnostics, event].slice(-100) };
}

function invalidTransition(snapshot: HostSnapshot): HostSnapshot {
  return appendDiagnostic(
    snapshot,
    diagnostic(
      "SERVER_TRANSITION_REJECTED",
      "Server lifecycle transition was rejected.",
      "warning",
    ),
  );
}

function withServer(
  snapshot: HostSnapshot,
  server: Partial<HostSnapshot["server"]>,
  code: string,
  level: DiagnosticEvent["level"] = "info",
): HostSnapshot {
  return appendDiagnostic(
    { ...snapshot, server: { ...snapshot.server, ...server } },
    diagnostic(code, code.replaceAll("_", " ").toLowerCase(), level),
  );
}
