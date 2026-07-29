import { describe, expect, it } from "vitest";
import { sheepCityCompletedExample } from "@badgerbots/program-model";
import {
  compileCloudRuntimeCommand,
  signClassroomHostPayload,
  type CloudCommand,
} from "../src/classroom-host.js";

function command(program: unknown = sheepCityCompletedExample): CloudCommand {
  return {
    id: "f4cc12e4-b1d0-4c62-8c44-e10a3b4a394a",
    organizationId: "50d0a6d4-7a65-4db5-814d-bc8088ea6b79",
    locationId: "7dc4fabe-5cbd-46ae-995e-e7677c820abc",
    sessionId: "09de5199-ea36-43ac-91d8-08fcc7a305ad",
    workspaceId: "e6335ca3-a6cd-4ed8-953d-98298f38348b",
    sequence: 1,
    kind: "deploy_program",
    payload: {
      programVersionId: "9564f968-f6c5-45c2-9a93-f721920eb42d",
      program,
    },
    issuedAt: "2026-07-25T12:00:00.000Z",
    expiresAt: "2026-07-25T12:02:00.000Z",
  };
}

describe("connected classroom outbound Host", () => {
  it("compiles a validated canonical cloud program at the Host boundary", () => {
    const runtime = compileCloudRuntimeCommand(command());
    expect(runtime.kind).toBe("deploy_program");
    if (runtime.kind !== "deploy_program") throw new Error("Expected a deployment.");
    expect(runtime.graph.handlers).toHaveLength(4);
    expect(runtime.programVersionId).toBe("9564f968-f6c5-45c2-9a93-f721920eb42d");
  });

  it("rejects an unsafe cloud program before Paper delivery", () => {
    const unsafe = structuredClone(sheepCityCompletedExample);
    const event = unsafe.scripts[0]?.body[0];
    if (!event || event.body[0]?.nodeType !== "explode_at_hit") throw new Error("Invalid fixture.");
    event.body[0].power = 100;
    expect(() => compileCloudRuntimeCommand(command(unsafe))).toThrow(/Cannot compile invalid/);
  });

  it("binds command delivery signatures to the dedicated Host token and payload", () => {
    const token = "host-token-with-more-than-thirty-two-characters-for-tests";
    const payload = JSON.stringify(command());
    expect(signClassroomHostPayload(token, payload)).toMatch(/^[0-9a-f]{64}$/);
    expect(signClassroomHostPayload(token, `${payload}tampered`)).not.toBe(
      signClassroomHostPayload(token, payload),
    );
  });
});
