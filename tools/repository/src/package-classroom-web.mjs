import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceDirectory = path.join(repositoryRoot, "apps/web/out");
const destinationDirectory = path.join(repositoryRoot, "installers/artifacts/classroom-web");
const apacheConfiguration = path.join(repositoryRoot, "apps/web/deploy/apache/classroom.htaccess");

async function collectFiles(directory, prefix = "") {
  const names = await readdir(directory);
  const results = [];
  for (const name of names.sort()) {
    const relativePath = path.posix.join(prefix, name);
    const absolutePath = path.join(directory, name);
    const details = await stat(absolutePath);
    if (details.isDirectory()) {
      results.push(...(await collectFiles(absolutePath, relativePath)));
    } else {
      const contents = await readFile(absolutePath);
      results.push({
        path: relativePath,
        bytes: contents.byteLength,
        sha256: createHash("sha256").update(contents).digest("hex"),
      });
    }
  }
  return results;
}

async function main() {
  const html = await readFile(path.join(sourceDirectory, "index.html"), "utf8");
  if (!html.includes("/classroom/_next/")) {
    throw new Error(
      "The Web export is not configured for /classroom. Build with BADGERBOTS_CLASSROOM_STATIC_DEPLOYMENT=1.",
    );
  }

  await stat(path.join(sourceDirectory, "_next"));
  await rm(destinationDirectory, { recursive: true, force: true });
  await mkdir(destinationDirectory, { recursive: true });
  await cp(path.join(sourceDirectory, "_next"), path.join(destinationDirectory, "_next"), {
    recursive: true,
  });
  await cp(path.join(sourceDirectory, "index.html"), path.join(destinationDirectory, "index.html"));
  for (const name of await readdir(sourceDirectory)) {
    if (name.endsWith(".txt")) {
      await cp(path.join(sourceDirectory, name), path.join(destinationDirectory, name));
    }
  }
  await cp(path.join(sourceDirectory, "editor"), path.join(destinationDirectory, "editor"), {
    recursive: true,
  });
  await cp(apacheConfiguration, path.join(destinationDirectory, ".htaccess"));

  const files = await collectFiles(destinationDirectory);
  const manifest = {
    schemaVersion: 1,
    route: "/classroom/",
    generatedAt: new Date().toISOString(),
    files,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
  };
  await writeFile(
    path.join(destinationDirectory, "deployment-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  console.log(
    `Packaged ${files.length} classroom files (${manifest.totalBytes} bytes) at ${destinationDirectory}`,
  );
}

await main();
