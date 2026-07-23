# Checkpoint 3: Runtime protocol and Paper spike

Status: local protocol, headless runtime core, Paper boundary source, and immutable-world manager implemented on 2026-07-22. Checkpoint acceptance is not claimed: the Paper-specific source has not yet been built against a resolved Paper server/API artifact or executed on Windows.

## Genuinely working locally

- Deterministic signed runtime envelopes with protocol/channel/recipient/scope binding, short expiry, monotonic sequence checks, tamper rejection, and idempotent duplicate handling.
- A Sheep City instruction interpreter that accepts only graph version 2, validates limits before swap, retains the last good program after bad deployment, attributes every adapter action to its source node and full execution scope, and deterministically cancels registered resources.
- Circuit breakers for handler count, nesting, instructions per event, explosions, item drops, and event wall-clock time.
- A Java 21 runtime core with equivalent atomic deployment, scope cancellation, and Sheep City operations, compiled and tested directly with `javac -Xlint:all -Werror` without Paper dependencies.
- Paper adapter/router source for projectile-hit, player-move, sheep-spawn, sheep-death, player disconnect, and world unload. This source is intentionally not counted as working Minecraft execution until the Paper build and server smoke test pass.
- Immutable template metadata/provenance/checksum validation and rollback-safe working-copy reset. The checked-in Sheep City template remains `asset-required`, so no usable map is claimed.
- Editor and restricted DSL labels now use composable Java-style vocabulary: `onProjectileHit()`, `onPlayerMove()`, `onSheepSpawn()`, `onSheepDeath()`, `if`, `==`, `getMaterialUnderPlayer()`, and namespaced constants such as `Material.GOLD_BLOCK`.

## Automated evidence

From the repository root:

```sh
npx --yes pnpm@11.16.0 verify
npx --yes pnpm@11.16.0 build
```

The runtime tests cover authenticated retry, tampering, cross-world delivery, expiry, sequence rollback, all four Sheep City handlers, last-good retention, reverse-order cancellation, circuit breaking, template tampering, atomic reset, and traversal refusal. The Java self-test runs as part of the workspace test task.

## Configuration and migrations

- No database migration or production secret was added.
- `minecraft/version-adapter/toolchain-candidate.yaml` records Minecraft/Paper/Java/Gradle candidates and deliberately leaves exact server/runtime checksums pending.
- The Paper build candidate uses Java 21 and `paper-api:1.21.11-R0.1-SNAPSHOT`. The absence of a Gradle wrapper and resolved dependency prevents a reproducible Paper JAR claim on this workstation.

## Security and privacy

- Runtime messages are bound to opaque IDs, never display names or Minecraft usernames.
- Scope checks cover tenant, location, session, project, student, world, and active program version; node IDs attribute actions and breaker events without logging program bodies or child names.
- The in-memory replay ledger loses state on restart. Durable encrypted Host storage, secret rotation, authenticated acknowledgements, redacted structured diagnostics, and adversarial transport tests remain release gates.
- The Paper gateway currently relies on its future Host bridge to authenticate an envelope before invocation. It must not be exposed as a network listener by itself.

## Manual Paper/Windows verification still required

1. Generate and verify the pinned Gradle wrapper; resolve the exact Paper 1.21.11 server build and record artifact checksums and licenses.
2. Build the plugin on Windows with Java 21 and start a clean Paper server using the eventual Host-managed configuration.
3. Deploy the valid Sheep City graph without restarting Paper and confirm projectile explosion, gold-block bounce, red/fast sheep behavior, and gold-ingot drop in the scoped working world.
4. Submit a malformed/over-limit graph and confirm the previous behavior remains active with a friendly correlated error.
5. Register representative timers/entities, then test Stop, replacement, disconnect, and world unload; confirm nothing fires afterward and the teacher world remains loaded.
6. Tamper with, duplicate, delay, reorder, cross-address, and replay Host commands across a restart; confirm fail-closed behavior and idempotent acknowledgement.
7. Validate/reset an original licensed Sheep City template and record load/unload timing. The current placeholder metadata cannot satisfy this step.

## Acceptance mapping

| Checkpoint 3 item                           | Local evidence                                        | Result                                    |
| ------------------------------------------- | ----------------------------------------------------- | ----------------------------------------- |
| Authenticated versioned idempotent protocol | Envelope/authenticator/replay tests                   | Pass locally; durable transport pending   |
| Paper plugin and interpreter                | Headless TS and Java core tests; Paper adapter source | Core pass; real Paper build/run pending   |
| Atomic swaps and last-good behavior         | TS and Java runtime tests                             | Pass headlessly; Paper smoke pending      |
| Execution scopes and limits                 | Cancellation/attribution/breaker tests                | Pass headlessly; Paper leak/soak pending  |
| Sheep City runtime behavior                 | Fake adapter plus Paper API boundary source           | Real Minecraft evidence pending           |
| Immutable template/reset                    | Checksum/provenance/reset tests                       | Manager passes; original map asset absent |

## Unresolved issues and next work

- Checkpoint 2 still lacks provider-backed PostgreSQL/RLS evidence.
- Checkpoint 3 still lacks the exact locked Paper artifact, Gradle wrapper, Host bridge, durable replay ledger, working original map, real server smoke test, and Windows evidence.
- Do not proceed to a release-grade Host installer on the assumption that the uncompiled Paper boundary is compatible. The next safe step is to close these Checkpoint 3 evidence gaps, then begin Checkpoint 4 Host application work.
