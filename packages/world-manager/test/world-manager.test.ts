import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { checksumWorldDirectory, resetWorkingWorld, validateWorldTemplate } from "../src/index.js";

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "badgerbots-world-test-"));
  roots.push(root);
  const template = join(root, "template");
  const content = join(template, "world");
  await mkdir(join(content, "region"), { recursive: true });
  await writeFile(join(content, "level.dat"), "original-level");
  await writeFile(join(content, "region", "r.0.0.mca"), "pregenerated-region");
  const contentSha256 = await checksumWorldDirectory(content);
  await writeFile(
    join(template, "world.yaml"),
    stringify({
      schemaVersion: 1,
      id: "sheep-city-test",
      status: "ready",
      minecraftVersion: "1.21.11",
      spawn: { x: 0.5, y: 65, z: 0.5, yaw: 0, pitch: 0 },
      worldBorder: { centerX: 0, centerZ: 0, size: 128 },
      preGenerated: true,
      resetPolicy: "restore-from-immutable-template",
      contentDirectory: "world",
      contentSha256,
    }),
  );
  await writeFile(
    join(template, "world-license.yaml"),
    stringify({
      schemaVersion: 1,
      assetId: "sheep-city-test",
      creator: "BadgerBots",
      license: "internal-use",
      redistributionAllowed: false,
      reviewStatus: "verified",
    }),
  );
  return { root, template, content, contentSha256 };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("immutable world templates", () => {
  it("validates metadata, provenance, bounds, and deterministic content checksum", async () => {
    const data = await fixture();
    await expect(validateWorldTemplate(data.template)).resolves.toMatchObject({
      ok: true,
      measuredSha256: data.contentSha256,
    });
  });

  it("rejects modified template content", async () => {
    const data = await fixture();
    await writeFile(join(data.content, "level.dat"), "tampered");
    await expect(validateWorldTemplate(data.template)).resolves.toEqual({
      ok: false,
      errors: ["World content checksum does not match world.yaml."],
    });
  });

  it("atomically restores a working copy without modifying the immutable template", async () => {
    const data = await fixture();
    const workingRoot = join(data.root, "working");
    const first = await resetWorkingWorld({
      templateDirectory: data.template,
      workingWorldRoot: workingRoot,
      instanceId: "student-one",
    });
    await writeFile(join(first.workingDirectory, "level.dat"), "student changes");
    await resetWorkingWorld({
      templateDirectory: data.template,
      workingWorldRoot: workingRoot,
      instanceId: "student-one",
    });
    expect(await readFile(join(first.workingDirectory, "level.dat"), "utf8")).toBe(
      "original-level",
    );
    expect(await readFile(join(data.content, "level.dat"), "utf8")).toBe("original-level");
  });

  it("rejects traversal in the working instance identifier", async () => {
    const data = await fixture();
    await expect(
      resetWorkingWorld({
        templateDirectory: data.template,
        workingWorldRoot: join(data.root, "working"),
        instanceId: "../escape",
      }),
    ).rejects.toThrow("instance ID is invalid");
  });
});
