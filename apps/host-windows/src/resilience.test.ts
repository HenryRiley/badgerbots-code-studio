import { describe, expect, it } from "vitest";
import {
  BoundedOutboundQueue,
  applyOperationalSignal,
  createHostResilienceSnapshot,
  type OutboundDiagnostic,
} from "./resilience.js";

const context = {
  correlationId: "correlation-one",
  occurredAt: "2026-07-23T18:00:00.000Z",
};

function event(index: number, kind: OutboundDiagnostic["kind"] = "health"): OutboundDiagnostic {
  return {
    schemaVersion: 1,
    kind,
    entityId: `entity-${index}`,
    correlationId: `correlation-${index}`,
    occurredAt: "2026-07-23T18:00:00.000Z",
    payload: { activeStudents: index },
  };
}

describe("Host safe degradation", () => {
  it("continues only last-known-good runtime during cloud loss", () => {
    const offline = applyOperationalSignal(
      createHostResilienceSnapshot(),
      { kind: "cloud_connection", state: "offline" },
      context,
    );
    expect(offline).toMatchObject({
      cloudConnection: "offline",
      existingRuntime: "continue_last_good",
    });
  });

  it("pauses admission and stops runtime after a plugin crash", () => {
    const crashed = applyOperationalSignal(
      createHostResilienceSnapshot(),
      { kind: "plugin_health", state: "crashed" },
      context,
    );
    expect(crashed).toMatchObject({
      pluginHealth: "crashed",
      admissions: "paused",
      existingRuntime: "stopped",
    });
  });

  it("quarantines corrupt worlds without exposing their identifiers in messages", () => {
    const corrupt = applyOperationalSignal(
      createHostResilienceSnapshot(),
      { kind: "world_integrity", worldId: "world-one", state: "corrupt" },
      context,
    );
    expect(corrupt.quarantinedWorldIds).toEqual(["world-one"]);
    expect(corrupt.diagnostics.at(-1)).toMatchObject({ code: "WORLD_QUARANTINED" });
    expect(corrupt.diagnostics.at(-1)?.message).not.toContain("world-one");
  });

  it("pauses new worlds under disk pressure and retains existing runtime", () => {
    const pressure = applyOperationalSignal(
      createHostResilienceSnapshot(),
      { kind: "disk", state: "pressure" },
      context,
    );
    expect(pressure).toMatchObject({ admissions: "paused", existingRuntime: "active" });
  });
});

describe("bounded redacted outbound queue", () => {
  it("drops coalescible health events before audit/runtime events", () => {
    const queue = new BoundedOutboundQueue(10);
    queue.enqueue(event(1, "audit"));
    for (let index = 2; index <= 10; index += 1) queue.enqueue(event(index));
    expect(queue.enqueue(event(11, "runtime"))).toEqual({
      queued: true,
      droppedHealthEvents: 1,
    });
    expect(queue.peek(10).some((entry) => entry.kind === "audit")).toBe(true);
    expect(queue.peek(10).some((entry) => entry.kind === "runtime")).toBe(true);
  });

  it("rejects sensitive or oversized diagnostic fields", () => {
    const queue = new BoundedOutboundQueue();
    const sensitive = event(1);
    sensitive.payload = { camperName: "Ada" };
    expect(() => queue.enqueue(sensitive)).toThrow(/prohibited/);
  });
});
