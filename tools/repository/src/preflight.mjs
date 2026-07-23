import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const rootPackage = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
);

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
if (nodeMajor < 24 || nodeMajor >= 27) {
  console.error(
    `Unsupported Node.js ${process.versions.node}. Use Node.js 24 LTS (pinned in .node-version); Node 26 is temporarily accepted for local discovery.`,
  );
  process.exitCode = 1;
}

let pnpmVersion;
try {
  pnpmVersion = execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim();
} catch {
  console.error("pnpm is missing. Install the packageManager version declared in package.json.");
  process.exitCode = 1;
}

const expectedPnpm = rootPackage.packageManager.replace("pnpm@", "");
if (pnpmVersion && pnpmVersion !== expectedPnpm) {
  console.error(`pnpm ${pnpmVersion} is installed; pnpm ${expectedPnpm} is required.`);
  process.exitCode = 1;
}

if (!process.exitCode) {
  console.log(`Prerequisites ready: Node.js ${process.versions.node}, pnpm ${pnpmVersion}.`);
}
