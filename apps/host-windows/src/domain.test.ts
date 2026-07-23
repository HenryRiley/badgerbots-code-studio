import { describe, expect, it } from "vitest";
import {
  SETUP_STEP_IDS,
  canStartServer,
  completeSetupStep,
  createInitialHostSnapshot,
  requestServerTransition,
  sanitizeDiagnosticText,
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
    backup: { status: "verified", lastVerifiedAt: "2026-07-23T00:00:00.000Z" },
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
        "No verified recovery backup exists.",
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
});
