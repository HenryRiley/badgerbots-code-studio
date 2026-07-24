# Paper plugin

Server-side educational runtime and classroom controls. The Checkpoint 3 spike includes a pure Java 21 runtime core for atomic program installation, exact execution scopes, deterministic cancellation, limits, and Sheep City instructions. `PaperGameAdapter`, `PaperEventRouter`, and `PaperRuntimeGateway` contain the version-specific Paper boundary for the four Sheep City events plus disconnect/world-unload cleanup.

This plugin executes only validated runtime instructions derived from the canonical AST. The
Checkpoint 10 developer slice compiles the real Paper plugin, creates an original compact Sheep
City world from vanilla blocks, and accepts bounded HMAC-authenticated commands through a local
Host-owned file spool. It does not open a browser-accessible port.

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
