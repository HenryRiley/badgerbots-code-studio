import { describe, expect, it } from "vitest";
import {
  applyInstructorMapping,
  initialBrowserSnapshot,
  planManagedProfileRepair,
  readiness,
  redact,
} from "./domain.js";

describe("BadgerBots Connect safety model", () => {
  it("starts locked without durable identity, mapping, or verified artifacts", () => {
    const snapshot = initialBrowserSnapshot();
    expect(readiness(snapshot).allowed).toBe(false);
    expect(readiness(snapshot).reasons).toHaveLength(7);
  });

  it("rejects student-side mapping changes", () => {
    const snapshot = applyInstructorMapping(initialBrowserSnapshot(), "Camper_01", false);
    expect(snapshot.mapping.minecraftUsername).toBeNull();
    expect(snapshot.diagnostics.at(-1)?.code).toBe("MAPPING_AUTH_REQUIRED");
  });

  it("validates Minecraft username syntax", () => {
    const snapshot = applyInstructorMapping(initialBrowserSnapshot(), "not allowed!", true);
    expect(snapshot.mapping.minecraftUsername).toBeNull();
    expect(snapshot.diagnostics.at(-1)?.code).toBe("MAPPING_USERNAME_INVALID");
  });

  it("accepts an instructor-approved fixed username", () => {
    const snapshot = applyInstructorMapping(initialBrowserSnapshot(), "Badger_17", true);
    expect(snapshot.mapping).toEqual({
      minecraftUsername: "Badger_17",
      authorizedByInstructor: true,
    });
  });

  it("plans writes only inside the dedicated managed instance", () => {
    const snapshot = {
      ...initialBrowserSnapshot(),
      selectedLauncherRoot: "C:\\Users\\Student\\AppData\\Roaming\\PrismLauncher",
      artifactManifestVerified: true,
    };
    const plan = planManagedProfileRepair(snapshot, "a".repeat(64));
    expect(plan.allowed).toBe(true);
    expect(plan.target).toBe(
      "C:\\Users\\Student\\AppData\\Roaming\\PrismLauncher\\instances\\badgerbots-code-studio",
    );
  });

  it("refuses repair without a verified checksum", () => {
    const snapshot = { ...initialBrowserSnapshot(), selectedLauncherRoot: "C:\\PrismLauncher" };
    expect(planManagedProfileRepair(snapshot, "unverified").allowed).toBe(false);
  });

  it("redacts credentials and child email addresses from diagnostics", () => {
    expect(redact("email kid@example.org token=abc123")).toBe(
      "email [redacted-email] token=[redacted]",
    );
  });
});
