import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(repository, "work", "paper-prototype");
const bridge = path.join(runtime, "bridge");
const plugins = path.join(runtime, "plugins");
const paper = path.join(runtime, "paper-1.21.11-132.jar");
const plugin = path.join(
  repository,
  "minecraft",
  "paper-plugin",
  "build",
  "libs",
  "badgerbots-paper-plugin.jar",
);
const PAPER_URL =
  "https://fill-data.papermc.io/v1/objects/5ffef465eeeb5f2a3c23a24419d97c51afd7dbb4923ff42df9a3f58bba1ccfba/paper-1.21.11-132.jar";
const PAPER_SHA256 = "5ffef465eeeb5f2a3c23a24419d97c51afd7dbb4923ff42df9a3f58bba1ccfba";

if (process.env.BADGERBOTS_ACCEPT_MINECRAFT_EULA !== "true") {
  fail(
    "Minecraft's EULA must be accepted explicitly. Read https://aka.ms/MinecraftEULA, then set BADGERBOTS_ACCEPT_MINECRAFT_EULA=true and run this command again.",
  );
}

await mkdir(plugins, { recursive: true });
await mkdir(path.join(bridge, "inbox"), { recursive: true });
await mkdir(path.join(bridge, "outbox"), { recursive: true });
await ensurePaper();
await buildPlugin();
await copyFile(plugin, path.join(plugins, "badgerbots-paper-plugin.jar"));
await writeManagedConfiguration();
await clearBridgeMessages();

const secret = randomBytes(32).toString("base64url");
const java = process.env.BADGERBOTS_JAVA ?? "java";
const teacherUsername = process.env.BADGERBOTS_TEACHER_MINECRAFT_USERNAME;
if (teacherUsername && !/^[A-Za-z0-9_]{3,16}$/.test(teacherUsername)) {
  fail("BADGERBOTS_TEACHER_MINECRAFT_USERNAME must be a valid 3-16 character Java username.");
}
const paperProcess = spawn(
  java,
  [
    "-Xms1G",
    "-Xmx4G",
    `-Dbadgerbots.bridge.dir=${bridge}`,
    ...(teacherUsername ? [`-Dbadgerbots.teacherUsername=${teacherUsername}`] : []),
    "-jar",
    paper,
    "--nogui",
  ],
  {
    cwd: runtime,
    env: { ...process.env, BADGERBOTS_PAPER_BRIDGE_SECRET: secret },
    stdio: ["pipe", "pipe", "pipe"],
  },
);

let paperReady = false;
let paperOutput = "";
const ready = new Promise((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(new Error("Paper did not reach Ready within three minutes.")),
    180_000,
  );
  const inspect = (chunk) => {
    const text = chunk.toString();
    paperOutput = `${paperOutput}${text}`.slice(-20_000);
    process.stdout.write(`[Paper] ${text}`);
    if (!paperReady && /Done \([^)]+\)! For help, type "help"/.test(paperOutput)) {
      paperReady = true;
      clearTimeout(timeout);
      resolve();
    }
  };
  paperProcess.stdout.on("data", inspect);
  paperProcess.stderr.on("data", inspect);
  paperProcess.once("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  paperProcess.once("exit", (code) => {
    if (!paperReady) {
      clearTimeout(timeout);
      reject(new Error(`Paper stopped before Ready (exit ${code ?? "unknown"}).`));
    }
  });
});

try {
  await ready;
  process.stdout.write(
    "\nPaper is ready. Join 127.0.0.1:25565 with Minecraft Java 1.21.11, then open http://127.0.0.1:3000/prototype.\n\n",
  );
} catch (error) {
  await stopPaper();
  fail(error instanceof Error ? error.message : "Paper failed to start.");
}

const pnpmEntrypoint = process.env.npm_execpath;
if (!pnpmEntrypoint) {
  await stopPaper();
  fail("Start this launcher through pnpm so the Web services can be started.");
}
const services = spawn(process.execPath, [pnpmEntrypoint, "prototype"], {
  cwd: repository,
  env: {
    ...process.env,
    BADGERBOTS_PAPER_BRIDGE_DIR: bridge,
    BADGERBOTS_PAPER_BRIDGE_SECRET: secret,
  },
  stdio: "inherit",
});

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  services.kill("SIGTERM");
  await stopPaper();
};
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());

const exitCode = await new Promise((resolve) => {
  services.once("exit", (code) => resolve(code ?? 0));
  services.once("error", () => resolve(1));
});
await stop();
process.exitCode = exitCode;

async function ensurePaper() {
  if (await matchesChecksum(paper, PAPER_SHA256)) {
    process.stdout.write("Pinned Paper 1.21.11 build 132 is verified.\n");
    return;
  }
  process.stdout.write("Downloading pinned Paper 1.21.11 build 132...\n");
  const response = await fetch(PAPER_URL);
  if (!response.ok || !response.body) fail(`Paper download failed with HTTP ${response.status}.`);
  const temporary = `${paper}.download`;
  const file = await open(temporary, "w", 0o600);
  try {
    for await (const chunk of response.body) await file.write(chunk);
  } finally {
    await file.close();
  }
  if (!(await matchesChecksum(temporary, PAPER_SHA256))) {
    await unlink(temporary).catch(() => undefined);
    fail("Paper download checksum did not match the pinned release.");
  }
  await rename(temporary, paper);
}

async function buildPlugin() {
  const windows = process.platform === "win32";
  const wrapper = path.join(
    repository,
    "minecraft",
    "paper-plugin",
    windows ? "gradlew.bat" : "gradlew",
  );
  if (!windows) await chmod(wrapper, 0o755);
  await run(wrapper, ["--no-daemon", "jar"], path.dirname(wrapper), {
    GRADLE_USER_HOME: path.join(repository, "work", "gradle-home"),
  });
}

async function writeManagedConfiguration() {
  await writeFile(path.join(runtime, "eula.txt"), "eula=true\n", { encoding: "utf8", mode: 0o600 });
  // This is a dedicated generated server. Clear any operator left by an interrupted prior
  // prototype run before the explicitly configured teacher is granted access on join.
  await writeFile(path.join(runtime, "ops.json"), "[]\n", { encoding: "utf8", mode: 0o600 });
  await writeFile(
    path.join(runtime, "server.properties"),
    [
      "motd=BadgerBots Sheep City Prototype",
      "online-mode=true",
      "server-ip=",
      "server-port=25565",
      "max-players=25",
      "view-distance=6",
      "simulation-distance=4",
      "spawn-protection=0",
      "allow-flight=false",
      "enable-rcon=false",
      "enable-query=false",
      "white-list=false",
      "level-name=teacher_world",
      "difficulty=normal",
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o600 },
  );
}

async function clearBridgeMessages() {
  for (const directory of [path.join(bridge, "inbox"), path.join(bridge, "outbox")]) {
    for (const name of await readdir(directory))
      if (/^[A-Za-z0-9_-]{1,100}\.json(?:\.new)?$/.test(name))
        await unlink(path.join(directory, name));
  }
}

async function matchesChecksum(file, expected) {
  try {
    await stat(file);
    const hash = createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
    return hash === expected;
  } catch {
    return false;
  }
}

async function run(command, args, cwd, extraEnvironment = {}) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnvironment },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (value) => resolve(value ?? 1));
  });
  if (code !== 0) fail(`${path.basename(command)} failed with exit code ${code}.`);
}

async function stopPaper() {
  if (paperProcess.exitCode !== null) return;
  paperProcess.stdin.write("stop\n");
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      paperProcess.kill("SIGTERM");
      resolve();
    }, 15_000);
    paperProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function fail(message) {
  process.stderr.write(`\nBadgerBots Paper prototype: ${message}\n`);
  process.exit(1);
}
