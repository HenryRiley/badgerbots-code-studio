# Paper plugin

Server-side educational runtime and classroom controls. The Checkpoint 3 spike includes a pure Java 21 runtime core for atomic program installation, exact execution scopes, deterministic cancellation, limits, and Sheep City instructions. `PaperGameAdapter`, `PaperEventRouter`, and `PaperRuntimeGateway` contain the version-specific Paper boundary for the four Sheep City events plus disconnect/world-unload cleanup.

Paper plugin 0.6.1 treats Sheep City as a persistent working world. It generates the original
layout only when the world directory is absent, then records an initialization marker. Existing
legacy worlds and restored snapshots are loaded without rewriting fences or other blocks. Host's
explicit Sheep City Reset removes the world directory and therefore remains the only normal
regeneration path.

This plugin executes only validated runtime instructions derived from the canonical AST. The
Checkpoint 10 developer slice compiles the real Paper plugin, creates an original compact Sheep
City world from vanilla blocks, and accepts bounded HMAC-authenticated commands through a local
Host-owned file spool. It does not open a browser-accessible port.

Checkpoint 21 replaces the single-player prototype shortcut with exact signed routes. Each mapped
camper receives a deterministic, persistent, unloadable working world. Run and Stop resolve the
organization, location, session, camper, project, Minecraft username, and actual Paper world
together. Owner-approved visitors cannot edit code; owner departure stops scoped handlers,
returns connected visitors, and unloads only after the world is empty. The teacher world remains
loaded.

`/bbbenchmark separate-worlds` and `/bbbenchmark shared-instances` are operator-only bounded
probes used by the Host buttons. They create 25 real Paper runtime scopes and temporary benchmark
world allocations, collect 80 samples, write redacted machine/evidence JSON, safely unload, and
delete only the run's `bb_bench_<opaque-run-id>_*` directories. This simulates camper connections;
it is not evidence of 25 physical client machines or Wi-Fi quality.

Run the dependency-free core proof with:

```sh
sh scripts/test-core.sh
```

Compile the Paper boundary and run its strict graph-decoder proof with:

```sh
./gradlew --no-daemon check
```

On Windows use `.\gradlew.bat --no-daemon check`. The wrapper distribution and Paper server artifact
are pinned and checksummed. Follow [`docs/playable-paper-prototype.md`](../../docs/playable-paper-prototype.md)
to run the end-to-end developer prototype. Physical Windows/LAN evidence remains mandatory.
