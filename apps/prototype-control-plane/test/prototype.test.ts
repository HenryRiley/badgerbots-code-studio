import { sheepCityCompletedExample } from "@badgerbots/program-model";
import { describe, expect, it } from "vitest";
import { ConnectedPrototype } from "../src/prototype.js";
import { isAllowedPrototypeOrigin, isValidPrototypeToken } from "../src/server.js";

describe("connected local prototype", () => {
  it("joins, saves, signs, deploys, executes, rejects a bad replacement, and stops", async () => {
    const prototype = new ConnectedPrototype();
    const initialized = await prototype.initialize();
    let snapshot = prototype.join({
      joinCode: initialized.joinCode,
      firstName: "Ada",
      lastInitial: "L",
    });
    expect(snapshot.phase).toBe("student_joined");
    snapshot = prototype.save(sheepCityCompletedExample, snapshot.workspaceRevision);
    expect(snapshot.workspaceRevision).toBe(1);

    snapshot = await prototype.run();
    const activeVersion = snapshot.activeProgramVersionId;
    expect(snapshot.phase).toBe("program_running");
    expect(snapshot.deliveries.at(-1)).toMatchObject({
      command: "deploy_program",
      status: "accepted",
    });

    prototype.trigger({ event: "projectile_hit" });
    prototype.trigger({ event: "player_move", materialUnderPlayer: "OTHER" });
    prototype.trigger({ event: "player_move", materialUnderPlayer: "GOLD_BLOCK" });
    prototype.trigger({ event: "sheep_spawn" });
    snapshot = prototype.trigger({ event: "sheep_death" });
    expect(snapshot.actions.map((action) => action.description)).toEqual([
      "explodeAt(event.location, 2.0)",
      "player.setVelocityY(1.2)",
      "sheep.setColor(RED)",
      "sheep.setSpeedMultiplier(1.8)",
      "world.dropItem(GOLD_INGOT, 1)",
    ]);

    snapshot = await prototype.attemptRejectedDeployment();
    expect(snapshot.activeProgramVersionId).toBe(activeVersion);
    expect(snapshot.deliveries.at(-1)).toMatchObject({
      command: "deploy_program",
      status: "rejected",
      detail: "deployment_validation_failed",
    });

    snapshot = await prototype.stop();
    expect(snapshot.phase).toBe("stopped");
    expect(snapshot.activeProgramVersionId).toBeUndefined();
    expect(() => prototype.trigger({ event: "projectile_hit" })).toThrow(
      "Deploy a program before firing events.",
    );
  });

  it("preserves the current revision when a stale save conflicts", async () => {
    const prototype = new ConnectedPrototype();
    const initialized = await prototype.initialize();
    prototype.join({
      joinCode: initialized.joinCode,
      firstName: "Grace",
      lastInitial: "H",
    });
    prototype.save(sheepCityCompletedExample, 0);
    expect(() => prototype.save(sheepCityCompletedExample, 0)).toThrow(
      "Revision conflict: expected 0, current 1.",
    );
    expect(prototype.snapshot().workspaceRevision).toBe(1);
  });

  it("restricts the HTTP boundary to approved loopback origins and strong tokens", () => {
    expect(isAllowedPrototypeOrigin("http://127.0.0.1:3000")).toBe(true);
    expect(isAllowedPrototypeOrigin("http://localhost:4173")).toBe(true);
    expect(isAllowedPrototypeOrigin("https://example.com")).toBe(false);
    expect(isAllowedPrototypeOrigin(undefined)).toBe(false);
    expect(isValidPrototypeToken("a".repeat(43))).toBe(true);
    expect(isValidPrototypeToken("short")).toBe(false);
    expect(isValidPrototypeToken(undefined)).toBe(false);
  });
});
