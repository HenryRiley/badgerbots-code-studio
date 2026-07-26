import { describe, expect, it } from "vitest";
import {
  SETUP_STEP_IDS,
  canStartServer,
  completeSetupStep,
  createInitialHostSnapshot,
  hostErrorMessage,
  requestServerTransition,
  sanitizeDiagnosticText,
  validateHostServiceInput,
  validateServerConfiguration,
  type HostSnapshot,
} from "./domain.js";

function readySnapshot(): HostSnapshot {
  let snapshot = createInitialHostSnapshot("native");
  for (const step of SETUP_STEP_IDS) snapshot = completeSetupStep(snapshot, step, "verified");
  return {
    ...snapshot,
    readiness: snapshot.readiness.map((check) => ({ ...check, status: "ready" })),
    artifacts: snapshot.artifacts.map((artifact) => ({
      ...artifact,
      status: "verified",
      version: "test-version",
      checksum: "a".repeat(64),
    })),
    backup: {
      status: "verified",
      lastVerifiedAt: "2026-07-23T00:00:00.000Z",
      latestId: "world-test",
      backupCount: 1,
      totalBytes: 8192,
    },
  };
}

describe("Host setup and server safety model", () => {
  it("starts with every real infrastructure control locked", () => {
    const snapshot = createInitialHostSnapshot("browser_preview");
    expect(canStartServer(snapshot)).toEqual({
      allowed: false,
      reasons: [
        "First-run setup is incomplete.",
        "Readiness checks are incomplete or blocked.",
        "Managed Java, Paper, and plugin artifacts are not verified.",
      ],
    });
  });

  it("enforces the first-run wizard order", () => {
    const initial = createInitialHostSnapshot("native");
    const rejected = completeSetupStep(initial, "firewall_approval", "approved");
    expect(rejected.setupSteps.every((step) => step.status === "pending")).toBe(true);
    expect(rejected.diagnostics.at(-1)).toMatchObject({ code: "SETUP_ORDER_REJECTED" });
    const accepted = completeSetupStep(initial, "instructor_sign_in", "paired");
    expect(accepted.setupSteps[0]).toMatchObject({ status: "complete", detail: "paired" });
  });

  it("permits server startup only after every readiness gate", () => {
    const snapshot = readySnapshot();
    expect(canStartServer(snapshot)).toEqual({ allowed: true, reasons: [] });
    expect(requestServerTransition(snapshot, "start").server.lifecycle).toBe("starting");
  });

  it("uses explicit lifecycle transitions and releases camp power state after Stop", () => {
    const starting = requestServerTransition(readySnapshot(), "start");
    const running = requestServerTransition(starting, "mark_running");
    expect(running.server).toMatchObject({
      lifecycle: "running",
      activeCamp: true,
      sleepInhibition: "requested",
    });
    const stopping = requestServerTransition(running, "stop");
    const stopped = requestServerTransition(stopping, "mark_stopped");
    expect(stopped.server).toMatchObject({
      lifecycle: "stopped",
      activeCamp: false,
      sleepInhibition: "inactive",
      lastExit: "clean",
    });
  });

  it("fails closed after a crash and requires recovery", () => {
    const running = requestServerTransition(
      requestServerTransition(readySnapshot(), "start"),
      "mark_running",
    );
    const failed = requestServerTransition(running, "crash");
    expect(failed.server).toMatchObject({
      lifecycle: "failed",
      activeCamp: false,
      sleepInhibition: "inactive",
      lastExit: "unclean",
      recoveryRequired: true,
    });
    expect(canStartServer(failed).reasons).toContain("Crash recovery must finish before restart.");
  });

  it("redacts common credentials and email addresses from diagnostics", () => {
    expect(
      sanitizeDiagnosticText(
        "teacher@example.com token=abcdef password=hunter2 authorization:BearerSecretValue",
      ),
    ).toBe("[redacted-email] [redacted-secret] [redacted-secret] [redacted-secret]");
  });

  it("accepts only the public Supabase onboarding boundary", () => {
    expect(
      validateHostServiceInput({
        serviceUrl: "https://camp-project.supabase.co",
        publishableKey: "sb_publishable_example-key-long-enough",
      }),
    ).toEqual([]);
    expect(
      validateHostServiceInput({
        serviceUrl: "http://camp-project.supabase.co/rest/v1",
        publishableKey: "sb_secret_never-place-this-in-the-host-form",
      }),
    ).toEqual([
      "Use the bare HTTPS Supabase Project URL.",
      "Use the browser-safe Supabase Publishable key.",
    ]);
  });

  it("validates the managed Minecraft server form before native setup", () => {
    expect(
      validateServerConfiguration({
        teacherUsername: "Teacher_01",
        serverPort: 25565,
        maxHeapGib: 4,
        eulaAccepted: true,
      }),
    ).toEqual([]);
    expect(
      validateServerConfiguration({
        teacherUsername: "../teacher",
        serverPort: 80,
        maxHeapGib: 16,
        eulaAccepted: false,
      }),
    ).toEqual([
      "Enter the teacher’s exact 3–16 character Minecraft Java username.",
      "Choose a Minecraft port between 1024 and 65535.",
      "Choose a server memory limit of 2, 4, 6, or 8 GiB.",
      "Read and accept the Minecraft EULA before preparing the server.",
    ]);
  });

  it("preserves actionable native command errors", () => {
    expect(hostErrorMessage("Instructor sign-in failed.", "Fallback")).toBe(
      "Instructor sign-in failed.",
    );
    expect(hostErrorMessage(new Error("Network unavailable."), "Fallback")).toBe(
      "Network unavailable.",
    );
    expect(hostErrorMessage({ message: "untrusted shape" }, "Fallback")).toBe("Fallback");
  });
});
