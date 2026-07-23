import { describe, expect, it } from "vitest";
import type { RealtimeHint, SessionRetentionState } from "../src/index.js";

describe("shared control-plane contracts", () => {
  it("keeps realtime hints versioned and payload-minimal", () => {
    const hint: RealtimeHint = {
      protocolVersion: 1,
      sequence: 1,
      organizationId: "org-1" as RealtimeHint["organizationId"],
      sessionId: "session-1" as RealtimeHint["sessionId"],
      topic: "program",
      entityId: "workspace-1",
      occurredAt: "2026-07-22T00:00:00.000Z",
    };
    expect(Object.keys(hint).sort()).toEqual([
      "entityId",
      "occurredAt",
      "organizationId",
      "protocolVersion",
      "sequence",
      "sessionId",
      "topic",
    ]);
  });

  it("defines recoverable deletion as an explicit state", () => {
    const states: SessionRetentionState[] = [
      "scheduled",
      "active",
      "hidden_recoverable",
      "deletion_queued",
      "deleted",
    ];
    expect(states).toContain("hidden_recoverable");
  });
});
