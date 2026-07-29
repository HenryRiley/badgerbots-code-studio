import { createHmac, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SignedRuntimeEnvelope } from "@badgerbots/runtime-protocol";
import { PaperFileClient } from "../src/prototype.js";

const scope = {
  organizationId: "organization-one",
  locationId: "location-one",
  sessionId: "session-one",
  projectId: "sheep-city",
  studentId: "student-one",
  worldId: "world-one",
};

function envelope(commandId: string): SignedRuntimeEnvelope {
  return {
    protocolVersion: 1,
    channel: "cloud_to_host",
    senderId: "cloud-one",
    recipientId: "host-one",
    commandId,
    sequence: 1,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 30_000,
    nonce: "nonce-one",
    scope,
    command: { kind: "stop_program", reason: "student" },
    signature: "cloud-signature",
  };
}

describe("authenticated Paper file client", () => {
  it("writes a signed request and accepts only a signed matching response", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "badgerbots-paper-bridge-"));
    const secret = randomBytes(32);
    const commandId = "command-one";
    const client = new PaperFileClient(root, secret.toString("base64url"));
    try {
      const responder = respond(root, commandId, secret);
      await expect(client.deliver(envelope(commandId), scope)).resolves.toMatchObject({
        commandId,
        status: "accepted",
        activeProgramVersionId: "version-one",
      });
      await responder;
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a tampered plugin response", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "badgerbots-paper-bridge-"));
    const secret = randomBytes(32);
    const commandId = "command-two";
    const client = new PaperFileClient(root, secret.toString("base64url"));
    try {
      const responder = respond(root, commandId, secret, true);
      await expect(client.deliver(envelope(commandId), scope)).rejects.toThrow(
        "Paper response signature was rejected",
      );
      await responder;
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function respond(root: string, commandId: string, secret: Buffer, tamper = false) {
  const requestPath = path.join(root, "inbox", `${commandId}.json`);
  const deadline = Date.now() + 2_000;
  let request: { payload: string; signature: string } | undefined;
  while (Date.now() < deadline) {
    try {
      request = JSON.parse(await readFile(requestPath, "utf8")) as {
        payload: string;
        signature: string;
      };
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  if (!request) throw new Error("Test Paper bridge did not receive the request.");
  expect(request.signature).toBe(sign(request.payload, secret));

  const outbox = path.join(root, "outbox");
  await mkdir(outbox, { recursive: true });
  const payload = JSON.stringify({
    commandId,
    status: "accepted",
    activeProgramVersionId: "version-one",
    message: "Program activated in Sheep City.",
  });
  await writeFile(
    path.join(outbox, `${commandId}.json`),
    JSON.stringify({
      payload,
      signature: tamper ? "0".repeat(64) : sign(payload, secret),
    }),
    "utf8",
  );
}

function sign(payload: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
