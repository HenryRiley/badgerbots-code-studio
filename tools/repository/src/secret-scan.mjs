import path from "node:path";
import { fileURLToPath } from "node:url";
import { listTextFiles, readUtf8File } from "./repository-files.mjs";

export const secretPatterns = [
  { name: "private key", pattern: /-----BEGIN (?:EC |OPENSSH |PGP |RSA )?PRIVATE KEY-----/g },
  { name: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: "GitHub token", pattern: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9_]{36,255}\b/g },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "Slack token", pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g },
  { name: "Stripe live key", pattern: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/g },
];

export function scanText(text) {
  const findings = [];
  for (const { name, pattern } of secretPatterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const line = text.slice(0, match.index).split("\n").length;
      findings.push({ line, name });
    }
  }
  return findings;
}

export async function scanRepository(rootDirectory) {
  const findings = [];
  for (const filePath of await listTextFiles(rootDirectory)) {
    const contents = await readUtf8File(filePath);
    if (contents === null) continue;
    for (const finding of scanText(contents)) {
      findings.push({ ...finding, file: path.relative(rootDirectory, filePath) });
    }
  }
  return findings;
}

async function main() {
  const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const findings = await scanRepository(rootDirectory);
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.line}: possible ${finding.name}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log("Secret scan passed: no recognized credential formats found.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
