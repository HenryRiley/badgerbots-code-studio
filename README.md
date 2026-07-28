# BadgerBots Code Studio

BadgerBots Code Studio is a clean-room, Minecraft-only coding platform for BadgerBots summer camps. It combines a block-based learning website, a teacher-laptop Minecraft host, a student connection helper, and a restricted Java-style educational runtime.

This repository contains the Sheep City compiler/browser proof, local control-plane and runtime
slices, early Host and Connect applications, scale/curriculum foundations, and a playable Paper
developer prototype with validated Supabase persistence and a deployable connected-classroom
slice—not a completed product. Begin
with [`prompts/INITIAL_CODEX_PROMPT.md`](prompts/INITIAL_CODEX_PROMPT.md), then use the architecture
and acceptance criteria in `docs/`.

The current prototype adds a checksummed Gradle/Paper build, compiled plugin, authenticated local
Host-to-plugin file bridge, and an original procedurally generated Sheep City world. The Web
prototype can deploy Run/Stop to Paper without a restart. A real Windows playtest has confirmed
the complete Sheep City behavior, equipment, fall protection, and respawn path. Optional Supabase
mode now adds encrypted four-hour browser/API recovery; the owner has validated that path against
Supabase Free. Checkpoint 13 adds real instructor/camper Auth boundaries, weekly sessions, Realtime
workspace hints, a dashboard, and an outbound durable Host command queue. Its new migration,
Edge Function deployment, and two-device cloud-to-Paper path still require manual validation.
Checkpoint 14 begins release productization: the native Windows Host now owns instructor sign-in,
location selection, secure pairing, current-user protected credential storage, and hardware
probing inside its graphical wizard. The current Checkpoint 15 slices add managed server
configuration, pinned Paper/plugin verification, configuration recovery evidence, and scoped
Private-network firewall approval. Host 0.8.1 now downloads and verifies a pinned free Temurin
Java 21 runtime into its private application-data directory, repairs missing or changed runtime
files through the graphical UI, and launches Paper with that exact private executable without
changing global Java. It also runs a real bounded Paper/plugin/bridge readiness test and owns
permanent Start/Stop/Recover lifecycle controls, conditional Windows
sleep prevention, clean close handling, and a realtime redacted Paper console without opening a
command window. It now adds bounded SHA-256 world snapshots, automatic pre-start backup,
transactional selectable-snapshot restore, and a safe Sheep City reset. Recovery points identify
automatic, manual, reset, and crash-recovery snapshots so damage is not accidentally restored just
because it was backed up most recently. Paper plugin 0.6.1 creates the original Sheep City layout
only for a genuinely new world; normal starts and restored snapshots preserve block changes. The
Host sign-in screen now accepts every non-empty password supported by the configured Supabase
project, normalizes instructor email input, explains Supabase Auth failures without exposing
account secrets, and lets an unpaired installation replace a stale Project URL or Publishable key
inside the graphical wizard. The control plane can also recover an instructor whose Supabase Auth
account was deliberately deleted and recreated, but only when the replacement has the exact
confirmed email, the prior Auth UUID is absent, and the service-role-only audited migration is
deployed.
The encrypted final-retention export, authenticated application updates, firewall cleanup, and
physical installer repair evidence remain open. See the
[playable prototype guide](docs/playable-paper-prototype.md),
[risk register](docs/risk-register.md), [requirements traceability](docs/requirements-traceability.md),
and [$0 pilot capacity budget](docs/free-tier-capacity-budget.md). No source curriculum has been
transcribed, and no deployed cloud control plane, measured 25-student capacity, managed client
profile, or accepted Windows installer is claimed as complete.

## Product shape

- **Code Studio Web**: student editor, curriculum, temporary camp identities, progress, and instructor dashboard.
- **BadgerBots Host**: polished Windows app and installer for running a Paper server on the teacher laptop.
- **BadgerBots Connect**: lightweight Windows helper and client-mod installer for fixed student devices.
- **Minecraft runtime**: Paper plugin, optional client mod, version adapter, private daily world instances, and safe execution of a controlled program model.
- **Shared compiler**: Blockly and instructor-only simplified Java both round-trip through one canonical AST.

## First milestone

The first end-to-end checkpoint is a one-day **Sheep City** vertical slice. It must prove installation, pairing, joining, a private template world, block editing, autosave, Run without server restart, readable errors, instructor remote troubleshooting, safe script shutdown, and teacher-world controls.

## Repository map

```text
apps/                       User-facing applications
  web/                      Student and instructor web platform
  host-windows/             Teacher host desktop application
  student-connect/          Student device helper
minecraft/                  Paper plugin, client mod, version boundary
packages/                   Shared TypeScript libraries and contracts
curriculum/                 BadgerBots-owned course definitions and source intake
worlds/                     Original/licensed world templates and license records
installers/                 Teacher and student installer projects
docs/                       Product, architecture, safety, and testing decisions
prompts/                    Durable Codex implementation prompts
tests/                      Cross-application fixtures and end-to-end tests
```

## Ground rules

- This is a clean-room alternative. Do not copy Code Kingdoms code, UI, art, text, videos, maps, or proprietary assets.
- BadgerBots owns the referenced instructional slides, but the original PDFs are not embedded in this scaffold. Put them in `curriculum/source-material/` before detailed curriculum transcription.
- Never run student-supplied arbitrary Java. Only the supported AST and restricted DSL may execute.
- The full block library stays available. Progress checks guide learning; they do not hide blocks.
- Camper records become inaccessible after the session and enter a recoverable retention window before permanent deletion.
- World assets require license and attribution metadata before use.

## Suggested local prerequisites

- Node.js LTS and pnpm
- Rust stable and Tauri 2 prerequisites
- Java toolchain selected by the Minecraft version spike
- Docker for local cloud-service development
- A Windows 10/11 test PC for installers, firewall behavior, MultiMC/Prism integration, and the real 25-client load test

No secrets, passwords, Microsoft credentials, or production connection strings belong in this repository.

## Local bootstrap

Install the versions pinned by `.node-version` and `packageManager`, then run:

```sh
./scripts/bootstrap.sh
```

The bootstrap installs the locked JavaScript dependencies and runs all repository checks without production secrets. See [local development](docs/development.md) and the [Windows release strategy](docs/windows-release-strategy.md).

To remove reproducible compiler output, run `pnpm clean`. To also remove installed
JavaScript dependencies, run `pnpm clean:all`; the next bootstrap will restore them.

## Connected local prototype

After bootstrap, start the Web app and loopback control plane together:

```sh
npx --yes pnpm@11.16.0 prototype
```

Open <http://127.0.0.1:3000/prototype>. This proves the connected application contract without
pretending to be a cloud deployment or Minecraft server.

After applying and deploying Checkpoint 13, open <http://127.0.0.1:3000/classroom> for instructor
login, weekly sessions, camper join, remote edits, help, and outbound Run/Stop. Follow
[`docs/connected-classroom-setup.md`](docs/connected-classroom-setup.md); do not place provider
Secret keys in browser variables.

To run the same workflow through real local Paper and the compiled BadgerBots plugin, read the
[playable Sheep City guide](docs/playable-paper-prototype.md), accept the Minecraft EULA, then run:

```sh
BADGERBOTS_ACCEPT_MINECRAFT_EULA=true npx --yes pnpm@11.16.0 prototype:minecraft
```
