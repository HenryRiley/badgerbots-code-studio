import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { parse } from "yaml";

export * from "./capacity.js";
export * from "./leases.js";
export * from "./load-scenario.js";

export interface WorldTemplateManifest {
  schemaVersion: 1;
  id: string;
  status: "ready";
  minecraftVersion: "1.21.11";
  spawn: { x: number; y: number; z: number; yaw: number; pitch: number };
  worldBorder: { centerX: number; centerZ: number; size: number };
  preGenerated: true;
  resetPolicy: "restore-from-immutable-template";
  contentDirectory: string;
  contentSha256: string;
}

export interface WorldLicenseManifest {
  schemaVersion: 1;
  assetId: string;
  creator: string;
  license: string;
  redistributionAllowed: boolean;
  reviewStatus: "verified";
}

export type TemplateValidation =
  | {
      ok: true;
      manifest: WorldTemplateManifest;
      license: WorldLicenseManifest;
      measuredSha256: string;
    }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function safeChild(root: string, child: string): string | undefined {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(child)) return undefined;
  const target = resolve(root, child);
  return target.startsWith(`${resolve(root)}${sep}`) ? target : undefined;
}

async function filesRecursively(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error("World templates may not contain symbolic links.");
    if (entry.isDirectory()) results.push(...(await filesRecursively(root, path)));
    else if (entry.isFile()) results.push(relative(root, path));
    else throw new Error("World template contains an unsupported filesystem entry.");
  }
  return results;
}

export async function checksumWorldDirectory(directory: string): Promise<string> {
  const hash = createHash("sha256");
  for (const file of await filesRecursively(directory)) {
    hash.update(file.replaceAll(sep, "/"));
    hash.update("\0");
    hash.update(await readFile(join(directory, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function validateWorldTemplate(
  templateDirectory: string,
): Promise<TemplateValidation> {
  const errors: string[] = [];
  let rawManifest: unknown;
  let rawLicense: unknown;
  try {
    rawManifest = parse(await readFile(join(templateDirectory, "world.yaml"), "utf8"));
    rawLicense = parse(await readFile(join(templateDirectory, "world-license.yaml"), "utf8"));
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : "World metadata could not be read."],
    };
  }
  if (!isRecord(rawManifest) || !isRecord(rawLicense))
    return { ok: false, errors: ["World metadata must be YAML objects."] };
  const spawn = rawManifest.spawn;
  const border = rawManifest.worldBorder;
  if (rawManifest.schemaVersion !== 1) errors.push("world.yaml schemaVersion must be 1.");
  if (typeof rawManifest.id !== "string" || !/^[a-z][a-z0-9-]{2,63}$/.test(rawManifest.id))
    errors.push("World template ID is invalid.");
  if (rawManifest.status !== "ready") errors.push("World template status is not ready.");
  if (rawManifest.minecraftVersion !== "1.21.11")
    errors.push("World template must target Minecraft 1.21.11.");
  if (
    !isRecord(spawn) ||
    ![spawn.x, spawn.y, spawn.z, spawn.yaw, spawn.pitch].every(isFiniteNumber)
  )
    errors.push("World spawn must contain finite x/y/z/yaw/pitch values.");
  if (
    !isRecord(border) ||
    !isFiniteNumber(border.centerX) ||
    !isFiniteNumber(border.centerZ) ||
    !isFiniteNumber(border.size) ||
    border.size < 32 ||
    border.size > 512
  )
    errors.push("World border must have finite coordinates and a size from 32 to 512 blocks.");
  if (rawManifest.preGenerated !== true) errors.push("World template must be pre-generated.");
  if (rawManifest.resetPolicy !== "restore-from-immutable-template")
    errors.push("World reset policy is invalid.");
  const contentDirectory =
    typeof rawManifest.contentDirectory === "string"
      ? safeChild(templateDirectory, rawManifest.contentDirectory)
      : undefined;
  if (!contentDirectory) errors.push("World contentDirectory is invalid.");
  const expectedSha =
    typeof rawManifest.contentSha256 === "string" ? rawManifest.contentSha256 : "";
  if (!/^[a-f0-9]{64}$/.test(expectedSha)) errors.push("World content SHA-256 is invalid.");
  if (rawLicense.schemaVersion !== 1) errors.push("world-license schemaVersion must be 1.");
  if (rawLicense.assetId !== rawManifest.id) errors.push("World license assetId does not match.");
  if (typeof rawLicense.creator !== "string" || rawLicense.creator.trim() === "")
    errors.push("World creator is missing.");
  if (typeof rawLicense.license !== "string" || rawLicense.license.trim() === "")
    errors.push("World license is missing.");
  if (typeof rawLicense.redistributionAllowed !== "boolean")
    errors.push("World redistribution permission is missing.");
  if (rawLicense.reviewStatus !== "verified") errors.push("World license review is not verified.");
  if (errors.length > 0 || !contentDirectory) return { ok: false, errors };
  try {
    if (!(await lstat(contentDirectory)).isDirectory())
      return { ok: false, errors: ["World contentDirectory is not a directory."] };
    const measuredSha256 = await checksumWorldDirectory(contentDirectory);
    if (measuredSha256 !== expectedSha)
      return { ok: false, errors: ["World content checksum does not match world.yaml."] };
    return {
      ok: true,
      manifest: rawManifest as unknown as WorldTemplateManifest,
      license: rawLicense as unknown as WorldLicenseManifest,
      measuredSha256,
    };
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : "World content validation failed."],
    };
  }
}

export async function resetWorkingWorld(input: {
  templateDirectory: string;
  workingWorldRoot: string;
  instanceId: string;
}): Promise<{ workingDirectory: string; templateSha256: string }> {
  const validation = await validateWorldTemplate(input.templateDirectory);
  if (!validation.ok) throw new Error(`World template is invalid: ${validation.errors.join(" ")}`);
  const target = safeChild(input.workingWorldRoot, input.instanceId);
  if (!target) throw new Error("Working-world instance ID is invalid.");
  await mkdir(input.workingWorldRoot, { recursive: true });
  const stagingRoot = await mkdtemp(join(input.workingWorldRoot, ".reset-"));
  const staged = join(stagingRoot, "world");
  const backup = join(stagingRoot, "previous");
  const content = join(input.templateDirectory, validation.manifest.contentDirectory);
  await cp(content, staged, { recursive: true, errorOnExist: true, force: false });
  let hadPrevious = false;
  try {
    try {
      await rename(target, backup);
      hadPrevious = true;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await rename(staged, target);
    if (hadPrevious) await rm(backup, { recursive: true, force: true });
    await rm(stagingRoot, { recursive: true, force: true });
    return { workingDirectory: target, templateSha256: validation.measuredSha256 };
  } catch (error) {
    try {
      if (hadPrevious) await rename(backup, target);
    } finally {
      await rm(stagingRoot, { recursive: true, force: true });
    }
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}
