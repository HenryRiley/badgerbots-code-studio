import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".pnpm-store",
  ".turbo",
  "artifacts",
  "backups",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "work",
]);

const ignoredExtensions = new Set([
  ".7z",
  ".class",
  ".docx",
  ".gz",
  ".jar",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".pptx",
  ".tar",
  ".webp",
  ".zip",
]);

export async function listTextFiles(rootDirectory) {
  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (
          !ignoredDirectories.has(entry.name) &&
          absolutePath !== path.join(rootDirectory, "worlds", "local")
        ) {
          await visit(absolutePath);
        }
      } else if (entry.isFile() && !ignoredExtensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(absolutePath);
      }
    }
  }

  await visit(rootDirectory);
  return files;
}

export async function readUtf8File(filePath) {
  const buffer = await readFile(filePath);
  if (buffer.includes(0)) return null;
  return buffer.toString("utf8");
}
