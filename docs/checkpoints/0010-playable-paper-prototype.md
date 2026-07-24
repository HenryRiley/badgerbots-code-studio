# Checkpoint 10: playable Paper prototype

Status: implementation complete and locally compiled on 2026-07-23; real-server Windows acceptance
is pending operator EULA acceptance and manual evidence.

## Genuinely working

- Pinned Gradle 9.6.1 wrapper with distribution checksum.
- Paper 1.21.11 stable build 132 URL/version/SHA-256 lock.
- Real plugin compilation against the official Paper API.
- Strict JSON instruction-graph decoding; unsupported opcodes fail closed.
- HMAC-SHA-256 authenticated, bounded, atomic Host-to-plugin file commands and signed responses.
- Existing scoped atomic runtime receives deploy/stop without Paper restart.
- Original procedural Sheep City world: spawn, gold pad, archery lane/target, sheep pen, nine loaded
  chunks, and 192-block border.
- Projectile hit, modular gold material equality/bounce, red/fast sheep spawn, gold death drop,
  invalid deployment retention, and Stop are wired to real Bukkit/Paper events.
- One EULA-gated command downloads only pinned artifacts into ignored `work/`, builds, starts, and
  gracefully stops the developer stack.

## Automated evidence

- `./gradlew --no-daemon jar`: real Paper plugin compiled successfully.
- `./gradlew --no-daemon check`: passed and includes the graph decoder rejection proof.
- Two forced deterministic JAR builds produced SHA-256
  `920d6cdc38dab5e137a686e3d3cedb76931b4102e05c5a15890a6b9b73d9573c`.
- The pinned Paper server download independently matched its recorded SHA-256; it was not started
  because the operator has not yet explicitly accepted the Minecraft EULA in this environment.
- `pnpm verify`: 22/22 tasks passed, including 118 Vitest assertions, five Rust unit tests, Java
  core proof, repository tests, lint/format/type checks, metadata validation, and secret scan.
- `pnpm --filter @badgerbots/web build`: production build passed with `/`, `/curriculum`, and
  `/prototype` generated.
- Linux and Windows CI now compile/test the Paper-specific plugin boundary.

## Manual verification

Follow [the playable Paper prototype guide](../playable-paper-prototype.md). Record the Windows PC
model, RAM, Java output, Paper/plugin build IDs, Web delivery trace, in-game screenshots, server
logs, and any firewall prompt. This implementation must not be called Sheep City acceptance until
those results exist.

## Configuration and migrations

- No database migration.
- Generated Paper/world/cache data stays under ignored `work/paper-prototype/`.
- The operator must explicitly set `BADGERBOTS_ACCEPT_MINECRAFT_EULA=true`.
- The launcher writes only its managed server directory and does not replace global Java or client
  configuration.

## Security/privacy

- Browser API remains loopback-only; the plugin exposes no HTTP listener.
- The control-plane verifies the signed cloud-to-Host envelope before emitting an HMAC-protected
  local file command.
- Request size, filenames, graph versions, project, events, opcodes, instructions, wall-clock,
  explosion, and item-drop limits fail closed.
- Prototype identities/state remain memory-only. The bridge secret is random per launch and is not
  persisted.

## Unresolved

- Physical Windows/Paper/LAN test and Minecraft EULA acceptance.
- Native Tauri Host ownership of the Paper lifecycle and in-app console.
- Firewall wizard, managed Java, backups, crash recovery, updates, repair/uninstall.
- Stable device/Minecraft mapping and managed Prism profile/client mod.
- Persistent provider-backed multi-device sync.
- Private per-student worlds/instances and measured 25-student capacity.

## Acceptance mapping

- Advances Sheep City steps 7, 10, 11, and 18 from headless contracts to a real Paper
  implementation; manual evidence is still open.
- Does not claim the full 20-step Sheep City acceptance list or completed Checkpoint 3/4/5/6.
