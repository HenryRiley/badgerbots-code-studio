import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const requiredFiles = [
  ".env.example",
  ".github/workflows/ci.yml",
  ".node-version",
  "docs/decisions/0001-locked-product-decisions.md",
  "docs/decisions/0009-zero-cost-pilot-platform.md",
  "docs/free-tier-capacity-budget.md",
  "docs/requirements-traceability.md",
  "docs/risk-register.md",
  "worlds/templates/sheep-city-original-prototype/world-license.yaml",
  "worlds/templates/sheep-city-original-prototype/world.yaml",
];

for (const relativePath of requiredFiles) {
  try {
    await access(path.join(rootDirectory, relativePath));
  } catch {
    throw new Error(`Required repository file is missing: ${relativePath}`);
  }
}

const worldDirectory = path.join(rootDirectory, "worlds", "templates");
const { readdir } = await import("node:fs/promises");
for (const entry of await readdir(worldDirectory, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const licensePath = path.join(worldDirectory, entry.name, "world-license.yaml");
  const metadataPath = path.join(worldDirectory, entry.name, "world.yaml");
  const license = YAML.parse(await readFile(licensePath, "utf8"));
  const world = YAML.parse(await readFile(metadataPath, "utf8"));

  for (const field of ["schemaVersion", "assetId", "creator", "license", "reviewStatus"]) {
    if (license[field] === undefined || license[field] === "") {
      throw new Error(`${path.relative(rootDirectory, licensePath)} is missing ${field}`);
    }
  }
  for (const field of ["schemaVersion", "id", "status", "minecraftVersion", "resetPolicy"]) {
    if (world[field] === undefined || world[field] === "") {
      throw new Error(`${path.relative(rootDirectory, metadataPath)} is missing ${field}`);
    }
  }
  if (world.id !== license.assetId) {
    throw new Error(`World id ${world.id} does not match license assetId ${license.assetId}`);
  }
}

console.log("Metadata validation passed: required files and world provenance records are present.");
