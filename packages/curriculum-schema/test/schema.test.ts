import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { ProjectSchema, TrackSchema, WorldTemplateSchema } from "../src/index.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

async function readYaml(relativePath: string): Promise<unknown> {
  return YAML.parse(await readFile(resolve(repositoryRoot, relativePath), "utf8"));
}

describe("source-gated curriculum schema", () => {
  it("validates the Sheep City skeleton without invented lesson prose", async () => {
    const input = await readYaml("curriculum/tracks/grades-3-4/sheep-city/project.yaml");
    const project = ProjectSchema.parse(input);
    expect(project.sourceProvenance).toBe("badgerbots-curriculum-slides-pending-local-intake");
    expect(project).not.toHaveProperty("chapters");
    expect(project).not.toHaveProperty("directions");
  });

  it.each(["curriculum/tracks/grades-3-4/track.yaml", "curriculum/tracks/grades-5-8/track.yaml"])(
    "validates source-gated track metadata: %s",
    async (path) => {
      expect(TrackSchema.parse(await readYaml(path)).status).toBe("source-verification-required");
    },
  );

  it("validates pending world metadata without pretending the asset exists", async () => {
    const world = WorldTemplateSchema.parse(
      await readYaml("worlds/templates/sheep-city-original-prototype/world.yaml"),
    );
    expect(world.status).toBe("asset-required");
    expect(world.spawn).toBe("pending");
  });

  it("rejects publication while source verification is pending", () => {
    expect(() =>
      ProjectSchema.parse({
        schemaVersion: 1,
        id: "invented",
        title: "Invented",
        day: 1,
        status: "published",
        sourceProvenance: "pending",
        scripts: ["player"],
        mechanics: [],
        benchmarks: [],
        worldTemplate: "missing",
        directions: "Unverified proprietary prose",
      }),
    ).toThrow();
  });
});
