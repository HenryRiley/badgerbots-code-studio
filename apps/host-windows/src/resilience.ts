import { sanitizeDiagnosticText, type DiagnosticEvent } from "./domain.js";

export type OperationalSignal =
  | { kind: "cloud_connection"; state: "online" | "offline" }
  | { kind: "plugin_health"; state: "healthy" | "crashed" | "recovering" }
  | { kind: "disk"; state: "normal" | "pressure" | "critical" }
  | { kind: "world_integrity"; worldId: string; state: "healthy" | "corrupt" | "restoring" }
  | { kind: "capacity"; state: "healthy" | "warning" | "closed"; reason: string };

export interface HostResilienceSnapshot {
  schemaVersion: 1;
  cloudConnection: "online" | "offline";
  pluginHealth: "healthy" | "crashed" | "recovering";
  diskState: "normal" | "pressure" | "critical";
  capacityState: "healthy" | "warning" | "closed";
  admissions: "open" | "paused";
  existingRuntime: "active" | "continue_last_good" | "stopped";
  quarantinedWorldIds: string[];
  diagnostics: DiagnosticEvent[];
}

export interface OutboundDiagnostic {
  schemaVersion: 1;
  kind: "health" | "runtime" | "audit";
  entityId: string;
  correlationId: string;
  occurredAt: string;
  payload: Record<string, string | number | boolean>;
}

const opaqueIdPattern = /^[a-z][a-z0-9-]{2,63}$/;
const prohibitedPayloadKey = /(name|email|chat|program|code|token|secret|password|authorization)/i;

export function createHostResilienceSnapshot(): HostResilienceSnapshot {
  return {
    schemaVersion: 1,
    cloudConnection: "online",
    pluginHealth: "healthy",
    diskState: "normal",
    capacityState: "warning",
    admissions: "open",
    existingRuntime: "active",
    quarantinedWorldIds: [],
    diagnostics: [],
  };
}

export function applyOperationalSignal(
  snapshot: HostResilienceSnapshot,
  signal: OperationalSignal,
  context: { correlationId: string; occurredAt: string },
): HostResilienceSnapshot {
  if (!opaqueIdPattern.test(context.correlationId))
    throw new Error("Operational signal correlation ID is invalid.");
  if (!Number.isFinite(Date.parse(context.occurredAt)))
    throw new Error("Operational signal timestamp is invalid.");
  const next = structuredClone(snapshot);
  let code = "HOST_OPERATIONAL_SIGNAL";
  let level: DiagnosticEvent["level"] = "info";
  let message: string = signal.kind;
  switch (signal.kind) {
    case "cloud_connection":
      next.cloudConnection = signal.state;
      if (signal.state === "offline") {
        next.existingRuntime = next.pluginHealth === "healthy" ? "continue_last_good" : "stopped";
        code = "CLOUD_OFFLINE_LAST_GOOD_ONLY";
        level = "warning";
        message =
          "Cloud connection is offline. Existing last-known-good programs may continue; remote changes are unavailable.";
      } else {
        next.existingRuntime = next.pluginHealth === "healthy" ? "active" : "stopped";
        code = "CLOUD_CONNECTION_RESTORED";
        message = "Cloud connection restored; queued redacted events may synchronize.";
      }
      break;
    case "plugin_health":
      next.pluginHealth = signal.state;
      if (signal.state === "crashed") {
        next.existingRuntime = "stopped";
        code = "PLUGIN_CRASH_SCOPES_STOP_REQUIRED";
        level = "error";
        message =
          "Minecraft plugin stopped unexpectedly. New worlds are paused and every execution scope must be cancelled.";
      } else if (signal.state === "recovering") {
        next.existingRuntime = "stopped";
        code = "PLUGIN_RECOVERY_IN_PROGRESS";
        level = "warning";
        message = "Plugin recovery is in progress; last-good programs are not active yet.";
      } else {
        next.existingRuntime = next.cloudConnection === "online" ? "active" : "continue_last_good";
        code = "PLUGIN_HEALTH_RESTORED";
        message = "Plugin health checks passed.";
      }
      break;
    case "disk":
      next.diskState = signal.state;
      if (signal.state === "critical") {
        code = "DISK_CRITICAL_ADMISSIONS_PAUSED";
        level = "error";
        message =
          "Disk space is critical. New worlds, deployments, and backups are paused; existing backups are retained.";
      } else if (signal.state === "pressure") {
        code = "DISK_PRESSURE_ADMISSIONS_PAUSED";
        level = "warning";
        message =
          "Disk space is below the operating reserve. New private worlds are paused pending instructor action.";
      } else {
        code = "DISK_RESERVE_RESTORED";
        message = "Disk reserve is within the operating envelope.";
      }
      break;
    case "world_integrity":
      if (!opaqueIdPattern.test(signal.worldId)) throw new Error("World ID is invalid.");
      if (signal.state === "corrupt") {
        if (!next.quarantinedWorldIds.includes(signal.worldId))
          next.quarantinedWorldIds.push(signal.worldId);
        code = "WORLD_QUARANTINED";
        level = "error";
        message =
          "A working world failed integrity checks and was quarantined without deleting its backup.";
      } else if (signal.state === "restoring") {
        code = "WORLD_RESTORE_IN_PROGRESS";
        level = "warning";
        message = "A quarantined world is restoring from its verified immutable template.";
      } else {
        next.quarantinedWorldIds = next.quarantinedWorldIds.filter(
          (worldId) => worldId !== signal.worldId,
        );
        code = "WORLD_INTEGRITY_RESTORED";
        message = "World integrity checks passed after restore.";
      }
      break;
    case "capacity":
      next.capacityState = signal.state;
      code = signal.state === "closed" ? "CAPACITY_ADMISSIONS_PAUSED" : "CAPACITY_STATE_CHANGED";
      level = signal.state === "healthy" ? "info" : "warning";
      message = signal.reason;
      break;
  }
  next.admissions =
    next.pluginHealth === "healthy" &&
    next.diskState === "normal" &&
    next.capacityState !== "closed"
      ? "open"
      : "paused";
  next.diagnostics = [
    ...next.diagnostics,
    {
      id: `event-${context.correlationId}`,
      timestamp: context.occurredAt,
      level,
      code,
      message: sanitizeDiagnosticText(message),
      correlationId: context.correlationId,
    },
  ].slice(-100);
  return next;
}

export class BoundedOutboundQueue {
  private readonly entries: OutboundDiagnostic[] = [];

  constructor(private readonly maximumEntries = 500) {
    if (!Number.isInteger(maximumEntries) || maximumEntries < 10 || maximumEntries > 10_000)
      throw new Error("Outbound queue size must be an integer from 10 to 10000.");
  }

  enqueue(event: OutboundDiagnostic): { queued: boolean; droppedHealthEvents: number } {
    validateOutboundDiagnostic(event);
    let droppedHealthEvents = 0;
    if (this.entries.length >= this.maximumEntries) {
      const healthIndex = this.entries.findIndex((entry) => entry.kind === "health");
      if (healthIndex >= 0) {
        this.entries.splice(healthIndex, 1);
        droppedHealthEvents = 1;
      } else {
        return { queued: false, droppedHealthEvents: 0 };
      }
    }
    this.entries.push(structuredClone(event));
    return { queued: true, droppedHealthEvents };
  }

  acknowledge(correlationId: string): void {
    const index = this.entries.findIndex((entry) => entry.correlationId === correlationId);
    if (index >= 0) this.entries.splice(index, 1);
  }

  peek(limit = 100): OutboundDiagnostic[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500)
      throw new Error("Outbound queue read limit must be an integer from 1 to 500.");
    return structuredClone(this.entries.slice(0, limit));
  }

  size(): number {
    return this.entries.length;
  }
}

function validateOutboundDiagnostic(event: OutboundDiagnostic): void {
  if (event.schemaVersion !== 1) throw new Error("Unsupported outbound diagnostic version.");
  if (!opaqueIdPattern.test(event.entityId) || !opaqueIdPattern.test(event.correlationId))
    throw new Error("Outbound diagnostic identifiers are invalid.");
  if (!Number.isFinite(Date.parse(event.occurredAt)))
    throw new Error("Outbound diagnostic timestamp is invalid.");
  for (const [key, value] of Object.entries(event.payload)) {
    if (prohibitedPayloadKey.test(key))
      throw new Error(`Outbound diagnostic payload key ${key} is prohibited.`);
    if (
      (typeof value === "string" && value.length > 240) ||
      (typeof value === "number" && !Number.isFinite(value))
    )
      throw new Error("Outbound diagnostic payload value is invalid.");
  }
  if (JSON.stringify(event).length > 4_096)
    throw new Error("Outbound diagnostic exceeds the 4 KiB redacted event limit.");
}
