# Checkpoint 1: Program model and browser proof

Status: implementation and macOS browser proof complete locally on 2026-07-22. Clean Windows browser verification remains a manual evidence item. This checkpoint does not claim cloud or Minecraft execution.

## Genuinely working

- Canonical schema version 2 with stable IDs, explicit Player/Game/Sheep scripts, deterministic normalization/serialization, semantic validation, and lossless version 0/1 migrations.
- Sheep City nodes for projectile-hit explosion, player-move/gold detection/bounce, sheep spawn red/fast presentation, and sheep death gold drop.
- Restricted Java-style formatter and handwritten parser. The allowlist rejects imports, classes, arbitrary loops/objects, reflection, file/network/process access, threads, native calls, and unsupported syntax with line/column diagnostics.
- Thirteen original Blockly views, a complete searchable implemented library, and AST-to-block/block-to-AST adapters. The movement condition is composed from generic if, typed equality, material-under-player, and gold-block value blocks. Unknown or incomplete blocks fail closed rather than disappearing.
- Deterministic instruction-graph preview with source-node attribution and a validation gate. It is not connected to Paper.
- Static Next.js browser harness with three script tabs, immediate acknowledged local storage, restore, instructor-only local text switch, compiler console, invalid-text preservation, and explicit browser-only labelling.
- Versioned curriculum/benchmark/world metadata schemas plus source-gated manifests for both tracks and a Sheep City planning skeleton. No unavailable lesson prose or map was invented.

## Automated evidence

Run from the repository root:

```sh
pnpm verify
pnpm build
```

The compiler suite covers deterministic serialization, migration, every Sheep City event/action, safe numeric bounds, wrong-context placement, golden text, unsupported syntax, precise syntax errors, fast-check properties, all three Blockly tabs, the complete catalog, unknown-block refusal, both composed text/block round trips, instruction serialization, invalid-program refusal, and curriculum source gates.

The final command results are recorded in the checkpoint handoff rather than hard-coded here so this document cannot become a stale test counter.

## Browser verification performed

The production static export was served locally and exercised through the in-app browser:

1. Blockly initialized with English messages and visibly rendered the starter event blocks.
2. Searching `gold` returned exactly 2 of the 13 implemented blocks without curriculum filtering.
3. The completed fixture rendered and validation reported four handlers and five top-level instructions while stating that nothing was sent to Minecraft.
4. Local instructor tools enabled restricted text mode and displayed stable program/node IDs.
5. `import java.io.File;` was rejected; the entered text remained intact for correction.
6. Sheep blocks rendered in the Sheep tab, and an acknowledged completed program survived page reload.

## Migrations and configuration

- Added canonical program migrations `0 -> 1 -> 2`; schema 2 replaces the locked gold-condition node with independently identified typed condition/expression nodes. There is no database migration in this checkpoint.
- Added exact Blockly, Next/React, Zod, Vitest, and fast-check dependencies to the lockfile.
- The web application uses static export for the browser proof. No provider, endpoint, credential, or production environment was created.

## Security and privacy

- Text is parsed into an allowlisted AST and never compiled/evaluated as Java or JavaScript.
- Validation bounds explosion strength, bounce velocity, sheep speed, item drops, nesting, event size, and total nodes before instruction serialization.
- Local storage contains only the prototype program; the harness collects no camper identity and performs no cloud or Host networking.
- The instructor checkbox is explicitly a local compiler-proof switch, not authentication. Real instructor authorization is Checkpoint 2 work.
- The instruction graph is not yet safe to execute: Paper-side authentication, atomic deployment, scopes, cancellation, and circuit breakers remain Checkpoint 3 requirements.

## Clean Windows manual verification

On Windows 10 and 11 with pinned Node/pnpm versions:

1. Clone locally, run `./scripts/bootstrap.sh` in a compatible shell, then `pnpm build`.
2. Serve `apps/web/out` on localhost and repeat the browser steps above in the supported camp browser.
3. Record OS/browser versions, screenshots of all tabs and friendly error output, build/test logs, keyboard-only navigation observations, and any older-laptop rendering/performance issues.

This is browser/compiler verification only. It is not the Host/Connect installer or real Paper acceptance test.

## Acceptance mapping

| Checkpoint 1 acceptance item                           | Evidence                                            | Result       |
| ------------------------------------------------------ | --------------------------------------------------- | ------------ |
| Versioned AST, migrations, deterministic serialization | `program-model` schema/serializer/migration tests   | Pass locally |
| Sheep City node subset and type/limit validation       | program-model and instruction-graph tests           | Pass locally |
| Restricted parser/formatter                            | golden, property, and negative grammar tests        | Pass locally |
| Blockly adapters and three tabs                        | adapter/composed round-trip tests and browser proof | Pass locally |
| Full searchable implemented library                    | catalog test and `gold` browser search              | Pass locally |
| Immediate local autosave                               | browser save acknowledgement and reload restore     | Pass locally |
| Curriculum schemas/source gate                         | schema tests and pending-source manifests           | Pass locally |
| Cloud autosave/conflicts                               | Checkpoint 2 scope                                  | Not claimed  |
| Real Paper execution                                   | Checkpoint 3/Windows acceptance scope               | Not claimed  |

## Unresolved issues and next checkpoint

- BadgerBots-owned curriculum source files and the original Sheep City world asset remain absent.
- Clean Windows browser evidence is still required.
- Blockly supports only the checkpoint subset; every later educational block must repeat the full compiler/runtime/test contract.
- Checkpoint 2 is the free-tier cloud control plane: portable Postgres migrations, secure instructor bootstrap/auth, temporary camper join, autosave concurrency/restore, realtime status, authorization, and retention. Free services may pause or change limits, so the capacity/readiness gates in ADR 0009 remain mandatory.
