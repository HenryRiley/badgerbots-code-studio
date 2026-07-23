# BadgerBots Code Studio

BadgerBots Code Studio is a clean-room, Minecraft-only coding platform for BadgerBots summer camps. It combines a block-based learning website, a teacher-laptop Minecraft host, a student connection helper, and a restricted Java-style educational runtime.

This repository contains the Sheep City compiler/browser proof, local Checkpoint 2 control-plane implementation, and a local Checkpoint 3 runtime/Paper spike—not a completed product. Begin with [`prompts/INITIAL_CODEX_PROMPT.md`](prompts/INITIAL_CODEX_PROMPT.md), then use the architecture and acceptance criteria in `docs/`.

Checkpoint 0 established repository/tooling evidence. Checkpoint 1 adds the canonical AST, restricted text grammar, Blockly adapters, instruction graph, source-gated curriculum schemas, and browser compiler harness. Checkpoint 2 adds portable control-plane migrations, authorization/lifecycle services, provider adapters, and tests; real provider execution remains pending. The Checkpoint 3 spike adds authenticated/idempotent runtime envelopes, headless TypeScript and Java interpreters, scoped cancellation/circuit breakers, a Paper API boundary, and immutable-world validation/reset. See the [Checkpoint 3 record](docs/checkpoints/0003-runtime-protocol-paper-spike.md), [risk register](docs/risk-register.md), [requirements traceability](docs/requirements-traceability.md), and [$0 pilot capacity budget](docs/free-tier-capacity-budget.md). No deployed cloud control plane, real Paper execution, usable world asset, or installer is claimed as complete.

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
