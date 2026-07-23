# Initial Codex master prompt - BadgerBots Code Studio

You are the lead engineer for **BadgerBots Code Studio**, a clean-room, Minecraft-only educational coding platform for in-person summer camps. Work inside this repository and turn the scaffold into a tested product through explicit checkpoints. Begin with the Sheep City vertical slice. Do not attempt every feature in one pass.

## Read first

Before modifying code, read these files in full:

- `README.md`
- `AGENTS.md`
- `docs/product-requirements.md`
- `docs/architecture/overview.md`
- `docs/decisions/0001-locked-product-decisions.md`
- `docs/security-and-privacy.md`
- `docs/testing-strategy.md`
- `docs/curriculum-source-notes.md`
- all relevant package/application README files

Inspect the entire repository and current git status. Preserve user changes. Create an initial decision/risk log rather than silently guessing about uncertain infrastructure.

## Mission

Build a polished BadgerBots-owned alternative to the useful Minecraft coding and classroom workflows described in the project documents without copying Code Kingdoms source code, branding, artwork, interface, maps, proprietary course text, or other assets.

The product has three coordinated applications and a Minecraft integration:

1. **BadgerBots Code Studio Web** - student editor, instructor dashboard, curriculum authoring, weekly sessions, temporary camper identities, autosave, progress, remote troubleshooting, host/device status.
2. **BadgerBots Host** - a polished Windows teacher application and installer that configures and runs the local Paper server, plugin, private daily worlds, backups, diagnostics, health checks, and authenticated outbound cloud connection.
3. **BadgerBots Connect** - a lightweight polished Windows student installer/helper that manages a stable device ID, fixed Minecraft username mapping, managed MultiMC/Prism profile and client mod, server entry, and readiness/status.
4. **BadgerBots Minecraft runtime** - Paper plugin, optional lightweight client mod, Minecraft-version adapter, safe scoped runtime, private world/instance lifecycle, visitor flow, and classroom controls.

The initial deployment is one camp at one location, with 20-25 students on Wi-Fi. The teacher laptop is conservatively assumed to be Windows 10, an Intel i5/i7, and 16 GB RAM. The instructor can keep it plugged in but not wired. Development begins on macOS; real installer/server tests occur on a capable Windows PC. The architecture should later support three or four locations without redesigning identity boundaries.

## Non-negotiable product behavior

- Minecraft only. Do not add Roblox abstractions or features.
- BadgerBots branding from the start using replaceable blue/green design tokens and original styling.
- The web/control plane may be cloud hosted at low cost; Minecraft compute runs on the teacher laptop.
- Host connects outbound to cloud. Browsers do not call arbitrary teacher-laptop ports. Minecraft clients connect over local Wi-Fi.
- Students join with weekly class code, first name, and last initial. No camper password for v1.
- A fixed device-to-Minecraft-username mapping persists between camps; camper records do not.
- One session owner and assistant instructors. Instructor auth is email/password. Never hard-code `instructor@badgerbots.org` or any password; provide secure bootstrap/setup.
- Student coding is block based. Use Blockly as a foundation for a custom editor.
- The complete searchable block library is always available. Curriculum may suggest/highlight blocks and measure progress but must never hide blocks based on chapter.
- Support multiple code areas/scripts such as Player, Game, and entity types.
- Only instructors have text mode in v1.
- Blockly and restricted Java-style text must round-trip through one canonical AST. Never use arbitrary Java as the source of truth or runtime.
- Clicking Run validates and atomically updates behavior without restarting Paper. If deployment fails, retain the last known-good program and show a friendly error.
- Student programs are strictly controlled, bounded, cancellable, attributable, and world scoped.
- Student worlds are private/invisible by default. Owner-approved visitors may play normally in the running world but cannot edit its code.
- Joining routes a student to the current daily world. Leaving stops that student's scripts/tasks and permits safe world unload. The teacher world remains loaded.
- Instructor dashboard exposes code snapshots, current project/progress, connection state, errors, help requests, and performance warnings; instructors can remotely edit and push code.
- Instructor controls include stop/run/restore program, reset/restore world, visit/teleport, kick, freeze, mute, inventory clear, gamemode, and teacher-world open/close/whitelist/reset.
- Camper access stops the day after session end. Data then enters a recoverable 7-14-day deletion window rather than immediate irreversible deletion.
- A normal Windows installer and first-run setup are part of the first usable product. Manual configuration-file editing is not an acceptable release workflow.

## Compiler and editor contract

Use a canonical, versioned, deterministic program AST as the sole semantic source of truth:

```text
Blockly workspace <-> canonical AST <-> restricted Java-style parser/formatter
                              |
                              v
                   safe runtime instruction graph
```

Define stable node IDs, explicit types, schema versioning/migrations, semantic validation, and deterministic serialization. Preserve block-friendly structure when formatting and parsing text.

The text grammar may look like Java but must contain only supported BadgerBots constructs. Reject imports, reflection, file or network access, threads, native calls, shell/process access, arbitrary classes, and any unsupported syntax with precise, friendly diagnostics. Do not compile this text as Java.

Every added educational block is incomplete until it has:

1. toolbox/category and Blockly view;
2. canonical AST representation and type rules;
3. AST-to-block rendering;
4. Java-style formatting;
5. Java-style parsing;
6. semantic validation and friendly errors;
7. runtime serialization/execution;
8. structural benchmark support where relevant;
9. block-to-text-to-block and text-to-block-to-text tests;
10. resource-limit tests and documentation.

The eventual library needs events, variables/fields, functions/methods, commands, loops, conditionals, coordinates/directions, blocks/materials, entity spawning/configuration, teleportation, inventories/items, health/damage, gamemodes, effects, projectiles/explosions, timers/cooldowns, teams, scoreboards, chat, and win conditions. Only implement the Sheep City subset in its checkpoint, but design the AST to grow by versioned extensions rather than rewrites.

## World model and performance

Each project points to an immutable compact template with pre-generated chunks, spawn, border, reset policy, Minecraft version, checksum, and license/provenance record. Active worlds are working copies.

The preferred experience is one invisible private daily world per camper, but this cannot be accepted without evidence on a 16 GB teacher laptop. Build a benchmark that compares:

- separate unloadable per-student worlds; and
- protected, widely separated private instances in a smaller number of worlds.

Keep the user-facing abstraction independent of the chosen implementation. Measure heap, total RAM, CPU, tick duration/TPS, chunk load/unload time, entity count, disk, Run latency, and teacher-world responsiveness for 25 simulated students. Use compact worlds, bounded view/simulation distance, and scoped entities/tasks. Document a safe degradation policy rather than pretending unsupported hardware is ready.

Every event subscription, timer, repeating task, spawned entity, or pending operation must belong to an execution scope keyed by session, project, student, program version, and world. Stop/disconnect/unload cancels the scope deterministically. Add circuit breakers for runaway loops, block changes, entities, explosions, projectiles, chat, and wall-clock time.

## Curriculum scope and source discipline

Both tracks are in product scope:

- Grades 3-4: Sheep City, High Noon Saloon, Super Powered, Tag, Lucky Blocks.
- Grades 5-8: Vanilla+, Spartan School, Wizarding 101, Zombie Tag, Lucky Blocks.

The original BadgerBots-owned PDFs may be placed in `curriculum/source-material/`. They were not embedded in the initial scaffold, so do not invent detailed lesson text. Verify source ownership and slide references before transcription. Do not import Code Kingdoms screenshots, text, maps, or UI into distributable assets without confirmed rights.

Curriculum is versioned structured data: track -> project/day -> chapter -> step -> instructional block group. It supports written instructor directions, images, visual starter code, suggested block groups, flexible structural/runtime/manual benchmarks, world metadata, preview, duplication, revision, and publish state.

Progress is tolerant and non-restrictive. A valid alternative solution should not fail merely because block order or shape differs from an expected screenshot. Allow automatic structural detection, runtime observation, instructor-marked completion, working, optional extension, and needs-attention states.

## Sheep City first vertical slice

Create an original compact prototype map; do not reproduce the unavailable Code Kingdoms map. It needs an archery test lane, gold-block movement area, sheep pen, spawn, pre-generated chunks, and border.

Implement the smallest coherent block/runtime set for:

- projectile-hit event and bounded explosion at the hit location;
- player movement/material detection and a gold-block bounce/jump action;
- a custom sheep entity script/configuration, including a red/fast presentation using supported vanilla behavior and a gold drop behavior;
- Player, Game, and Sheep script tabs as required by the project model;
- Run, Stop, autosave, version restore, errors, and progress signals.

Do not fake Minecraft execution in the acceptance milestone. A browser-only simulator may be used earlier for compiler tests, but the checkpoint is complete only after validated instructions execute through the real Paper plugin on Windows.

### Sheep City end-to-end acceptance

From clean supported Windows systems:

1. Install BadgerBots Host through its normal installer.
2. Complete the wizard: sign in, location, hardware/readiness, server configuration, teacher Minecraft mapping, scoped firewall approval, test server, ready state.
3. Install BadgerBots Connect through its normal installer on a student machine.
4. Detect/configure the managed MultiMC/Prism profile and required client mod; permanently map the device to its fixed Minecraft username.
5. Instructor creates a dated weekly session and receives a join code.
6. Student joins Web with the code, first name, and last initial; the device association resolves without exposing Microsoft credentials.
7. Student connects to Minecraft and lands in a private Sheep City working copy.
8. Web loads starter state and the full searchable block library.
9. Student edits blocks; local save is immediate and cloud autosave is debounced. Refresh/reconnect loses no acknowledged change.
10. Run validates and deploys a version atomically without server restart. Sheep City behavior works in Minecraft.
11. Invalid combinations produce readable, actionable errors in Web and do not replace the last good runtime.
12. Instructor dashboard shows live status, latest periodically synchronized blocks, project, progress, errors, last successful run, and warnings.
13. Instructor remotely edits blocks; student receives the change with explicit conflict handling. Instructor can push/run it.
14. Instructor opens restricted text mode, makes a supported edit, parses it into AST, returns to equivalent blocks, and runs it.
15. Instructor restores an earlier code version and resets/restores the world.
16. Teacher world remains loaded, uses the same editor/runtime, and supports operator controls.
17. Student requests owner permission to visit another running world through the simplest reliable UI; unauthorized visits fail.
18. When the owner leaves, their handlers/tasks stop and the world unloads safely after visitors are handled.
19. Diagnostics show resource usage and circuit-breaker events without leaking secrets or unnecessary child data.
20. Automated tests, migrations, docs, release notes, Windows test evidence, and known limitations are checked in.

## Phased checkpoints

### Checkpoint 0 - Repository and evidence

- Inspect scaffold and source attachments.
- Initialize git if needed; do not push or create remote resources without authorization/authentication.
- Establish pinned toolchains, workspace layout, formatting, linting, tests, CI, environment examples, and secret scanning.
- Write ADRs for monorepo/build tooling, web/backend/provider choice, authentication, realtime protocol, Tauri packaging, Minecraft version, Paper/client-mod toolchain, and world strategy experiment.
- Build a risk register and requirements traceability table.
- Produce a one-command local development bootstrap with no production secrets.
- Define how Windows release artifacts are built from macOS development, normally through Windows CI and a Windows test machine.

Stop and report discoveries, decisions, costs/free-tier assumptions, and blockers before broad feature implementation.

### Checkpoint 1 - Program model and browser proof

- Implement the versioned AST, types, migrations, deterministic serializer, validation errors, and Sheep City node subset.
- Implement the restricted Java-style parser and formatter for that subset.
- Implement Blockly AST adapters and tabs/scripts.
- Add a small browser harness with full searchable library, autosave locally, console, and instructor text switch.
- Add property/golden round-trip tests and invalid-syntax tests.
- Define curriculum schemas and encode a source-verified Sheep City skeleton without inventing proprietary lesson prose.

Acceptance: supported block programs round-trip through text without semantic loss; unsupported text fails clearly; tests cover each node and migration.

### Checkpoint 2 - Cloud control plane

- Implement provider-backed but portable Postgres schema and migrations for organizations/locations, instructors, sessions, roles, join codes, campers, devices, Minecraft mappings, hosts, curriculum versions, projects, program versions, progress, help requests, runtime events, and audit records.
- Implement secure instructor bootstrap/login and owner/assistant authorization.
- Implement camper join and minimal identity.
- Implement debounced autosave, optimistic concurrency/conflict handling, restore history, realtime roster/status, and retention state machine.
- Document free-tier usage estimates for 25 students and an upgrade path; do not present zero cost as guaranteed.

Acceptance: tenant/session authorization tests pass; concurrent student/instructor edits are safe; expired sessions and recoverable deletion work.

### Checkpoint 3 - Runtime protocol and Paper spike

- Select the conservative supported Minecraft/Paper/client-mod version using current official compatibility evidence and record an ADR.
- Implement authenticated, versioned, idempotent cloud-to-Host protocol and local Host-to-plugin protocol.
- Build Paper plugin skeleton, AST instruction interpreter, execution scopes, atomic swaps, friendly error mapping, hard limits, and Sheep City actions/events.
- Create headless integration fixtures where possible and a real server smoke test.
- Implement immutable template validation and working-copy reset.

Acceptance: Sheep City instruction graph deploys to real Paper without restart; stop/disconnect cancels all scoped resources; last good version survives bad deployment.

### Checkpoint 4 - Host application and teacher installer

- Implement Tauri Host with sign-in/pairing, server lifecycle, readiness metrics, logs, backups, crash recovery, updates, and local queue/cache.
- Implement the first-run wizard and scoped Windows firewall flow.
- Bundle or securely acquire verified Java/Paper/plugin artifacts under their licenses.
- Produce installer, repair/upgrade/uninstall behavior, and Windows test matrix.
- Prevent sleep only while an active camp explicitly requires it and restore normal policy afterward.

Acceptance: a non-developer installs and reaches Ready without editing configuration files; failure states give actionable recovery steps.

### Checkpoint 5 - Connect, client mod, and student installer

- Implement stable device identity and instructor-controlled Minecraft username mapping.
- Detect supported MultiMC/Prism installations without damaging unrelated instances.
- Install/update/repair a managed profile and lightweight client mod; add local server entry.
- Implement helper status and, if reliable, in-game world/visit-request UI.
- Produce Windows installer and rollback-safe updates.

Acceptance: reinstall/upgrade preserves device mapping, camper sign-in resolves correctly, and Minecraft connection/status works without manual file editing.

### Checkpoint 6 - Instructor workflow and Sheep City completion

- Finish dashboards, remote snapshot/edit/conflict flow, text mode, runtime errors, performance warnings, progress, help queue, program/world restore, visitor permission, and operator controls.
- Ensure teacher world uses same runtime and remains loaded.
- Complete original Sheep City map asset and license metadata.
- Run all end-to-end acceptance steps on Windows.

Acceptance: the entire Sheep City list above passes with evidence. No visible placeholder button may be counted as finished.

### Checkpoint 7 - Scale, safety, and release candidate

- Build 25-student load simulator and compare world implementations.
- Tune view/simulation distances, world lifecycle, queues, quotas, backups, and telemetry.
- Threat model authentication, pairing, protocol, DSL, plugin, local files, update chain, and child data.
- Test Wi-Fi interruption, cloud outage, host/plugin crash, restart, disk pressure, corrupt world, and installer rollback.
- Produce an instructor operations guide and troubleshooting bundle.

Acceptance: documented supported hardware envelope and degraded behavior; teacher world stays usable; safety tests and recovery drills pass.

### Later checkpoints - Full curriculum and polish

- Transcribe and verify both BadgerBots-owned curriculum tracks.
- Implement remaining block/runtime vocabulary incrementally with the full per-block contract.
- Create or license daily worlds with provenance.
- Add curriculum authoring, flexible benchmarks, digital completion badges/certificate download, multi-location operations, and optional parent email only after privacy/consent review.

## Data model minimum

Design explicit identifiers and lifecycle state machines for:

- organization, location, instructor, membership/role;
- host installation and pairing credential;
- session, owner, assistants, dates, join code, track, retention state;
- persistent device and Minecraft username/account mapping;
- temporary camper and enrollment;
- curriculum track/version, project/day, chapter, step, benchmark, asset provenance;
- world template/version and active world/instance;
- project workspace, script/tab, canonical program, saved version, active runtime version;
- help request, progress observation/manual decision;
- connection/runtime health and redacted diagnostic event;
- auditable instructor/control action.

Never use a display name or Minecraft username as a database primary key. Design renames and account remapping safely.

## Installer and supply-chain requirements

- Provide a polished graphical installer, Start menu entry, repair/update/uninstall, logs, readiness check, and actionable errors.
- Use per-machine/per-user installation intentionally and document admin requirements.
- Never globally replace a user's Java, MultiMC/Prism, firewall, or Minecraft configuration.
- Back up any managed file before migration and verify atomic replacement.
- Pin and verify third-party artifacts. Track licenses and checksums.
- Separate code signing from correctness: unsigned prototypes may warn; production release requires BadgerBots signing credentials and protected CI secrets.
- Update manifests must be authenticated and rollback safe.

## Quality bar

- Accessible, original BadgerBots blue/green UI usable by instructors at classroom distance and by children on older laptops.
- Loading, empty, offline, reconnecting, stale, error, and permission-denied states are designed, not incidental.
- No fake live indicators or placeholder controls presented as working.
- Strict TypeScript/Rust/Java checks, deterministic formatting, unit/integration/e2e tests, migrations, and generated contract checks.
- Structured redacted logs with correlation IDs across web, Host, and plugin.
- Documentation includes local setup, Windows testing, deployment, backup/restore, incident response, curriculum authoring, and known limitations.
- Avoid premature microservices and Kubernetes. Prefer a modular monolith/control plane plus clear Host/plugin boundaries until scale proves otherwise.

## How to work with the project owner

Lead with the completed outcome and evidence. State assumptions and product-impacting tradeoffs. Ask only when a decision cannot be discovered or a choice changes scope, safety, cost, licensing, or external systems. Do not create paid cloud resources, publish deployments, push to GitHub, send email, or acquire/download third-party world assets without explicit authorization.

At the end of every checkpoint provide:

- what is genuinely working;
- commands/tests run and summarized results;
- manual verification steps, especially Windows;
- migrations/config changes;
- security/privacy implications;
- screenshots or logs where useful;
- unresolved issues, risks, and next checkpoint;
- a concise mapping to acceptance criteria.

Begin now with Checkpoint 0. Do not skip version/tooling evidence, do not start by polishing mock screens, and do not claim the Sheep City milestone until it runs end to end on a real supported Windows/Paper environment.
