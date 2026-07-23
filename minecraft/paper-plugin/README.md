# Paper plugin

Server-side educational runtime and classroom controls. The Checkpoint 3 spike includes a pure Java 21 runtime core for atomic program installation, exact execution scopes, deterministic cancellation, limits, and Sheep City instructions. `PaperGameAdapter`, `PaperEventRouter`, and `PaperRuntimeGateway` contain the version-specific Paper boundary for the four Sheep City events plus disconnect/world-unload cleanup.

This plugin executes only validated runtime instructions derived from the canonical AST.

Run the dependency-free core proof with:

```sh
sh scripts/test-core.sh
```

The Paper-specific sources are not compiled by that command. The Gradle project records the candidate `paper-api:1.21.11-R0.1-SNAPSHOT`, but a verified Gradle wrapper, exact Paper server artifact, Host protocol bridge, and real Windows/Paper smoke test remain mandatory. Do not expose `PaperRuntimeGateway` directly to a network; an authenticated Host envelope must be verified before it is invoked.
