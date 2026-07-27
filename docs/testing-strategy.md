# Testing strategy

## Automated layers

- AST schema, migrations, type checking, deterministic serialization, and semantic validation.
- Every block: block-to-AST, AST-to-block, AST-to-text, text-to-AST, runtime serialization, invalid-input diagnostics, and round-trip invariants.
- Curriculum schema/provenance and benchmark tolerance.
- Protocol authentication, idempotency, reconnect, ordering, stale-message rejection, and authorization.
- Plugin execution scopes, quotas, cancellations, atomic program swap, visitor permissions, and world cleanup.
- Role/session/tenant access and retention state machine.
- Web autosave conflicts and instructor/student concurrent edits.
- Installer upgrade, rollback, repair, uninstall, checksums, paths with spaces, and non-admin failure guidance.

Checkpoint 1 exercises the first three compiler bullets with Vitest and fast-check across `program-model`, `java-dsl`, `block-editor`, `runtime-protocol`, and `curriculum-schema`. The composed tests explicitly cover blocks -> AST -> text -> AST -> blocks and text -> AST -> blocks -> AST -> text.

Checkpoint 2 adds provider-neutral service tests for bootstrap, roles, minimal join identity, class-code rate limits, tenant/session authorization, optimistic conflicts, idempotency, restore history, compact realtime hints, and retention/purge. SQL contract tests check the schema, credential digests, RLS enablement, anonymous-grant refusal, and atomic workspace locking. These are not database integration tests; executing both migrations and adversarial RLS/concurrency scenarios against PostgreSQL remains a release gate.

Checkpoint 3 adds signed-envelope tamper/scope/expiry/replay tests; headless atomic deployment, last-good retention, action attribution, cancellation, and circuit-breaker tests; a dependency-free Java 21 core self-test; and immutable template/checksum/reset tests. Paper-specific Java sources are outside the dependency-free compilation path. A resolved Paper API build, real server behavior, durable replay across restart, Windows networking, and scope leak/soak evidence remain required-environment tests.

Checkpoint 4 adds TypeScript tests for fail-closed Host readiness, ordered setup, server lifecycle, crash recovery, active-camp power intent, and diagnostic redaction. Rust tests and Clippy cover the Tauri command/state boundary and native initial state. The production frontend is visually inspected for explicit preview labelling, disabled infrastructure controls, setup progression, and console errors. Windows CI is responsible for building the unsigned NSIS prototype and checksum; CI success does not replace the physical Windows install/repair/upgrade/uninstall matrix.

The first Checkpoint 6 slice adds provider-neutral tests for help-request
deduplication, acknowledgement/resolution, tolerant progress upserts, minimal roster
projection, audit/realtime hints, and cross-session denial. A real provider,
authenticated dashboard, and multi-browser synchronization test remain required.

The Checkpoint 6 browser stability correction adds local-storage envelope tests for the
canonical program plus per-script visual and instructor-text drafts, legacy-save migration,
corrupt-save preservation, and failed writes. Manual browser coverage verifies that
incomplete editor work survives refresh and rapid tab switching without being treated as
runnable code.

Checkpoint 7 adds strategy-independent private-world lease/isolation tests, candidate threshold
and physical-evidence validation, deterministic 25-student workload orchestration, injected
failure cleanup, Host outage/disk/corruption degradation, bounded redacted queue behavior, and
TypeScript/Java scope-cancellation continuation. Synthetic metrics test policy only; both
strategies still require the documented Windows/Paper run before capacity acceptance.

Checkpoint 8 adds curriculum document/source/asset schemas, immutable revision history,
optimistic conflict refusal, owner-only publish authorization, duplication provenance, canonical
starter-program validation, and source/world publication gates. Browser verification covers the
local draft -> review -> blocked-publish flow, independent duplication, route navigation,
responsive layout without horizontal overflow, and console stability. Provider persistence,
authenticated author roles, source-file ingestion, and publication from a deployed database
remain required-environment tests.

Checkpoint 9 adds an integration test that drives generated session/join identity, canonical
optimistic save, signed and scoped cloud-to-Host delivery, verified Host acknowledgement, atomic
deployment, all Sheep City event actions, invalid replacement rejection with last-good retention,
and Stop cancellation. HTTP boundary tests cover explicit loopback-origin and strong-token policy.
Browser verification exercises the same workflow through `/prototype`, checks action/source-node
evidence, confirms Stop disables events, and verifies no horizontal overflow or console errors.
This is headless runtime evidence; it does not replace the real Paper/Windows test.

Checkpoint 10 compiles the Paper-specific Java boundary with the official 1.21.11 API on Linux and
Windows CI, runs a strict supported/unsupported instruction-graph decoder proof, verifies pinned
Gradle and Paper metadata, and provides an EULA-gated one-command real-server journey. Manual
verification covers real projectile, movement/material, sheep spawn/death, invalid-deploy
last-known-good, and Stop behavior. Until that journey is recorded on the Windows test PC, this is
a playable implementation rather than accepted real-environment evidence.

Checkpoint 13 adds Deno checks for the deployable Edge Function and tests its HMAC class-code
helpers, minimal camper names, strict Sheep City shape, and unsafe values. SQL contract tests cover
temporary Auth subjects, one-time owner bootstrap after developer-only prototype rows, RLS,
persistent join throttling, ordered command locking/redelivery, and Realtime publication. Host
tests compile the canonical cloud program locally, reject unsafe replacements before Paper, and
bind delivery signatures to a dedicated credential and exact payload. Live gates are
migration/function deployment, owner/assistant authorization, two-device RLS/Realtime, deliberate
save conflict, Host reconnect/redelivery, and cloud-to-real-Paper Run/Stop.

Checkpoint 14 adds strict native Host service-configuration validation, rejects Secret keys at the
UI and Rust boundaries, limits the native Edge client to authenticated profile/pair actions, and
tests the graphical onboarding state. Windows CI additionally exercises current-user DPAPI
protect/unprotect and builds the NSIS installer with optional public service configuration.
Physical Windows evidence must prove restart persistence, no plaintext credential, assistant
denial, no console window, and the native platform/RAM probe.

Checkpoint 15 adds graphical server configuration, immutable Paper object/checksum enforcement,
embedded-plugin fail-closed behavior, atomic artifact writes, configuration recovery evidence, and
pure firewall-policy tests. Windows CI builds the exact plugin before compiling the Host installer.
Physical Windows evidence must verify the download, UAC cancellation/success paths, Private-only
TCP rule, restart persistence, and absence of a console window. CI does not exercise an elevated
firewall mutation.

The Host 0.5.0 slice adds pure detection/redaction tests for Paper, Sheep City plugin, and
authenticated bridge readiness. Windows CI compiles that process boundary and packages the real
plugin into the installer. Physical Windows evidence must run the graphical Test server step,
confirm the built-in bounded log, loopback listener, clean shutdown, persistence, and absence of a
Java/Command Prompt window. Loopback evidence does not replace a student-device test on camp Wi-Fi.

Host 0.6.0 adds native supervisor tests for live readiness/crash state and bounded console
retention. TypeScript tests and compilation cover the graphical lifecycle contract. Physical
Windows evidence must prove that Start streams real Paper lines while the UI remains responsive,
Running is not shown before all readiness signals, Stop exits cleanly, normal Host close waits for
Paper, unexpected child exit requires recovery, sleep policy is restored, and neither Java nor a
Command Prompt window becomes visible.

Host 0.7.1 adds native filesystem tests for staged world backup creation, per-file SHA-256
verification, tamper refusal, transactional selected-snapshot restore, and Sheep City-only reset. The
frontend contract no longer requires a manually fabricated backup before Start because native
Start creates and verifies one itself. Physical Windows evidence must test paths with spaces,
automatic pre-start backup, manual backup, tampered-manifest refusal, restore after a visible
world change, reset/regeneration, five-snapshot rotation, low disk space, and interruption during
copy/commit.

The corrective 0.7.1 recovery flow must additionally create an intact automatic snapshot, change
the working world, create a newer manual snapshot of that changed state, select the older
automatic snapshot, and prove the older contents are restored. The UI must label both snapshots
by local time and reason and warn that a manual snapshot captures the current state.

## Required real-environment tests

- Windows 10/11 Host installation and firewall prompts.
- Existing MultiMC and Prism layouts on student devices.
- Managed Java runtime and chosen Minecraft/Paper/client-mod version.
- One owner plus assistants; reconnect after cloud/network interruption.
- 25 simulated students and a staged real-client test.
- Compare private worlds versus protected instances: RAM, heap, tick time, CPU, disk, load/unload latency, entities, and repeated Run operations.
- Teacher world remains responsive under worst supported load.
- Host crash/restart recovery, template integrity, and backup restore.

## Sheep City acceptance test

Run the entire journey from clean Windows machines using release installers. No manual config-file edits are allowed. Record build IDs, hardware, timing, metrics, failures, screenshots, and unresolved risks.
