export type EvidenceStatus = "ready" | "blocked" | "warning";
export type LauncherKind = "prism" | "multimc";

export interface DiagnosticEvent {
  id: string;
  level: "info" | "warning" | "error";
  code: string;
  message: string;
}

export interface LauncherCandidate {
  kind: LauncherKind;
  label: string;
  root: string;
  detected: boolean;
}

export interface ConnectSnapshot {
  schemaVersion: 1;
  mode: "native" | "browser_preview";
  device: {
    id: string;
    persisted: boolean;
  };
  mapping: {
    minecraftUsername: string | null;
    authorizedByInstructor: boolean;
  };
  launchers: LauncherCandidate[];
  selectedLauncherRoot: string | null;
  profile: EvidenceStatus;
  clientMod: EvidenceStatus;
  serverEntry: EvidenceStatus;
  artifactManifestVerified: boolean;
  diagnostics: DiagnosticEvent[];
}

export interface ReadinessGate {
  allowed: boolean;
  reasons: string[];
}

export function initialBrowserSnapshot(): ConnectSnapshot {
  return {
    schemaVersion: 1,
    mode: "browser_preview",
    device: { id: "preview-device-not-persisted", persisted: false },
    mapping: { minecraftUsername: null, authorizedByInstructor: false },
    launchers: [
      {
        kind: "prism",
        label: "Prism Launcher",
        root: "%APPDATA%\\PrismLauncher",
        detected: false,
      },
      { kind: "multimc", label: "MultiMC", root: "Portable install", detected: false },
    ],
    selectedLauncherRoot: null,
    profile: "blocked",
    clientMod: "blocked",
    serverEntry: "blocked",
    artifactManifestVerified: false,
    diagnostics: [
      diagnostic(
        "CONNECT_PREVIEW_READY",
        "Browser preview loaded. No device identity or launcher files were changed.",
      ),
    ],
  };
}

export function readiness(snapshot: ConnectSnapshot): ReadinessGate {
  const reasons: string[] = [];
  if (!snapshot.device.persisted) reasons.push("Stable device identity has not been persisted.");
  if (!snapshot.mapping.authorizedByInstructor || !snapshot.mapping.minecraftUsername)
    reasons.push("An instructor must approve the fixed Minecraft username.");
  if (!snapshot.selectedLauncherRoot) reasons.push("A supported launcher must be selected.");
  if (!snapshot.artifactManifestVerified)
    reasons.push("The managed profile artifact manifest is not verified.");
  if (snapshot.profile !== "ready") reasons.push("The managed profile is not ready.");
  if (snapshot.clientMod !== "ready") reasons.push("The required client mod is not ready.");
  if (snapshot.serverEntry !== "ready") reasons.push("The local server entry is not ready.");
  return { allowed: reasons.length === 0, reasons };
}

export function applyInstructorMapping(
  snapshot: ConnectSnapshot,
  username: string,
  instructorAuthorized: boolean,
): ConnectSnapshot {
  if (!instructorAuthorized)
    return appendDiagnostic(
      snapshot,
      diagnostic(
        "MAPPING_AUTH_REQUIRED",
        "Only an authenticated instructor can change this device mapping.",
        "warning",
      ),
    );
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username))
    return appendDiagnostic(
      snapshot,
      diagnostic(
        "MAPPING_USERNAME_INVALID",
        "Minecraft usernames must be 3–16 letters, numbers, or underscores.",
        "warning",
      ),
    );
  return appendDiagnostic(
    {
      ...snapshot,
      mapping: { minecraftUsername: username, authorizedByInstructor: true },
    },
    diagnostic("MAPPING_UPDATED", "The instructor-approved device mapping was updated."),
  );
}

export function planManagedProfileRepair(
  snapshot: ConnectSnapshot,
  artifactSha256: string,
): { allowed: boolean; reason: string; target: string | null } {
  if (!snapshot.selectedLauncherRoot)
    return { allowed: false, reason: "No launcher root is selected.", target: null };
  if (!snapshot.artifactManifestVerified || !/^[a-f0-9]{64}$/.test(artifactSha256))
    return { allowed: false, reason: "A verified SHA-256 manifest is required.", target: null };
  const separator = snapshot.selectedLauncherRoot.includes("\\") ? "\\" : "/";
  return {
    allowed: true,
    reason: "A managed-only atomic repair may proceed.",
    target: `${snapshot.selectedLauncherRoot}${separator}instances${separator}badgerbots-code-studio`,
  };
}

export function displayDeviceId(id: string): string {
  return id.length > 12 ? `•••• ${id.slice(-8)}` : id;
}

function diagnostic(
  code: string,
  message: string,
  level: DiagnosticEvent["level"] = "info",
): DiagnosticEvent {
  return {
    id: `${code}-${Math.random().toString(36).slice(2, 9)}`,
    code,
    level,
    message: redact(message),
  };
}

function appendDiagnostic(snapshot: ConnectSnapshot, event: DiagnosticEvent): ConnectSnapshot {
  return { ...snapshot, diagnostics: [...snapshot.diagnostics, event].slice(-100) };
}

export function redact(value: string): string {
  return value
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[redacted-email]")
    .replace(/\b(bearer|token|password|secret)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}
