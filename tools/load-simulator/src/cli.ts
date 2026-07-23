#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createTwentyFiveStudentPlan } from "@badgerbots/world-manager";
import { compareWorldStrategies, type HardwareEvidence } from "./index.js";

async function main(arguments_: string[]): Promise<void> {
  const [command, ...paths] = arguments_;
  if (command === "plan") {
    process.stdout.write(`${JSON.stringify(createTwentyFiveStudentPlan(), null, 2)}\n`);
    return;
  }
  if (command === "analyze" && paths.length === 2) {
    const evidence = await Promise.all(
      paths.map(async (path) => JSON.parse(await readFile(path, "utf8")) as HardwareEvidence),
    );
    process.stdout.write(`${JSON.stringify(compareWorldStrategies(evidence), null, 2)}\n`);
    return;
  }
  throw new Error(
    "Usage: badgerbots-load-simulator plan | analyze <separate-worlds.json> <shared-instances.json>",
  );
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Load-simulator command failed."}\n`,
  );
  process.exitCode = 1;
});
