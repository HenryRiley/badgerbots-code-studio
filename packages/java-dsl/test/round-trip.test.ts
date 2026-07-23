import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  normalizeProgram,
  sheepCityCompletedExample,
  validateProgram,
} from "@badgerbots/program-model";
import { formatProgram, parseProgram } from "../src/index.js";

const sheepCityGoldenText = `// @program-id: sheep-city-complete
program SheepCity {
  // @id: script-player
  script Player {
    // @id: event-projectile-hit
    void onProjectileHit() {
      // @id: explode-safe
      explodeAtHit(2.0);
    }

    // @id: event-player-move
    void onPlayerMove() {
      // @id: if-gold
      // @expression-id: equals-gold
      // @expression-id: material-under-player
      // @expression-id: gold-block-value
      if (getMaterialUnderPlayer() == Material.GOLD_BLOCK) {
        // @id: bounce-gold
        player.bounce(1.2);
      }
    }
  }

  // @id: script-game
  script Game {
  }

  // @id: script-sheep
  script Sheep {
    // @id: event-sheep-spawn
    void onSheepSpawn() {
      // @id: sheep-red
      sheep.setColor(DyeColor.RED);
      // @id: sheep-fast
      sheep.setSpeedMultiplier(1.8);
    }

    // @id: event-sheep-death
    void onSheepDeath() {
      // @id: drop-gold
      dropItem(Material.GOLD_INGOT, 1);
    }
  }
}
`;

describe("restricted Java-style text", () => {
  it("round-trips every Sheep City node and preserves stable IDs", () => {
    const text = formatProgram(sheepCityCompletedExample);
    const result = parseProgram(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.program).toEqual(normalizeProgram(sheepCityCompletedExample));
    expect(formatProgram(result.program)).toBe(text);
  });

  it("matches the reviewed Sheep City golden text representation", () => {
    expect(formatProgram(sheepCityCompletedExample)).toBe(sheepCityGoldenText);
    const parsed = parseProgram(sheepCityGoldenText);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.program).toEqual(normalizeProgram(sheepCityCompletedExample));
  });

  it.each([
    ["import java.io.File;", "imports"],
    ["class Sneaky {}", "custom classes"],
    ["Runtime.getRuntime();", "system or process access"],
    ["new Thread();", "threads or native code"],
    ["java.net.Socket", "file, network, or reflection access"],
    ["while (true) {}", "loops"],
  ])("rejects unsupported syntax: %s", (source, expected) => {
    const result = parseProgram(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.message).toContain(expected);
  });

  it("reports a precise friendly syntax error", () => {
    const text = formatProgram(sheepCityCompletedExample).replace(
      "explodeAtHit(2.0);",
      "explodeAtHit(2.0)",
    );
    const result = parseProgram(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe("EXPECTED_SYMBOL");
    expect(result.diagnostics[0]?.message).toContain("Expected “;”");
  });

  it("property-tests bounded explosion values through text", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), (halfPower) => {
        const program = structuredClone(sheepCityCompletedExample);
        const explosion = program.scripts[0]?.body[0]?.body[0];
        if (!explosion || explosion.nodeType !== "explode_at_hit") return false;
        explosion.power = halfPower / 2;
        const parsed = parseProgram(formatProgram(program));
        return parsed.ok && validateProgram(parsed.program).ok;
      }),
      { numRuns: 100 },
    );
  });
});
