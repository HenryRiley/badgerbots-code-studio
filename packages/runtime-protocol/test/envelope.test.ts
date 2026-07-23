import { describe, expect, it } from "vitest";
import { sheepCityCompletedExample } from "@badgerbots/program-model";
import {
  MemoryReplayLedger,
  canonicalEnvelopeMessage,
  compileInstructionGraph,
  signRuntimeEnvelope,
  verifyRuntimeEnvelope,
  type RuntimeScopeAddress,
  type UnsignedRuntimeEnvelope,
} from "../src/index.js";
import { NodeHmacSha256Authenticator } from "../src/node-auth.js";

const scope: RuntimeScopeAddress = {
  organizationId: "org-one",
  locationId: "location-madison",
  sessionId: "session-week-one",
  projectId: "sheep-city",
  studentId: "student-one",
  worldId: "world-student-one",
};

function unsigned(sequence = 7): UnsignedRuntimeEnvelope {
  return {
    protocolVersion: 1,
    channel: "cloud_to_host",
    senderId: "control-plane-one",
    recipientId: "host-one",
    commandId: `command-${sequence}`,
    sequence,
    issuedAt: 1_000_000,
    expiresAt: 1_030_000,
    nonce: `nonce-${sequence}`,
    scope,
    command: {
      kind: "deploy_program",
      programVersionId: "program-version-seven",
      graph: compileInstructionGraph(sheepCityCompletedExample),
    },
  };
}

describe("authenticated runtime envelopes", () => {
  const auth = new NodeHmacSha256Authenticator(
    Buffer.from("checkpoint-three-test-secret-with-more-than-thirty-two-bytes"),
  );

  it("uses deterministic canonical serialization", () => {
    const envelope = unsigned();
    expect(canonicalEnvelopeMessage(envelope)).toBe(canonicalEnvelopeMessage({ ...envelope }));
  });

  it("accepts one command and treats an authenticated retry as idempotent", async () => {
    const signed = await signRuntimeEnvelope(unsigned(), auth);
    const ledger = new MemoryReplayLedger();
    const expected = {
      channel: "cloud_to_host" as const,
      recipientId: "host-one",
      scope,
      now: 1_010_000,
    };
    await expect(verifyRuntimeEnvelope(signed, expected, auth, ledger)).resolves.toEqual({
      ok: true,
      disposition: "accepted",
    });
    await expect(verifyRuntimeEnvelope(signed, expected, auth, ledger)).resolves.toEqual({
      ok: true,
      disposition: "duplicate",
    });
  });

  it("rejects tampering, cross-world delivery, expiry, and sequence rollback", async () => {
    const signed = await signRuntimeEnvelope(unsigned(), auth);
    const expected = {
      channel: "cloud_to_host" as const,
      recipientId: "host-one",
      scope,
      now: 1_010_000,
    };
    const tampered = structuredClone(signed);
    if (tampered.command.kind !== "deploy_program") throw new Error("fixture changed");
    tampered.command.programVersionId = "attacker-version";
    await expect(
      verifyRuntimeEnvelope(tampered, expected, auth, new MemoryReplayLedger()),
    ).resolves.toMatchObject({ ok: false, code: "invalid_signature" });
    await expect(
      verifyRuntimeEnvelope(
        signed,
        { ...expected, scope: { ...scope, worldId: "foreign-world" } },
        auth,
        new MemoryReplayLedger(),
      ),
    ).resolves.toMatchObject({ ok: false, code: "wrong_scope" });
    await expect(
      verifyRuntimeEnvelope(
        signed,
        { ...expected, now: signed.expiresAt + 1 },
        auth,
        new MemoryReplayLedger(),
      ),
    ).resolves.toMatchObject({ ok: false, code: "expired" });

    const ledger = new MemoryReplayLedger();
    const newer = await signRuntimeEnvelope(unsigned(8), auth);
    await verifyRuntimeEnvelope(newer, expected, auth, ledger);
    await expect(verifyRuntimeEnvelope(signed, expected, auth, ledger)).resolves.toMatchObject({
      ok: false,
      code: "stale_sequence",
    });
  });
});
