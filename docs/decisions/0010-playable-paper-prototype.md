# ADR 0010: playable Paper prototype boundary

Status: accepted for the local prototype on 2026-07-23; production acceptance remains open.

## Decision

Keep the conservative Minecraft Java/Paper 1.21.11 line for the first playable prototype and use
Java 21. Paper's current compatibility table still supports Java 21 for 1.21.11, while its newer
26.x line requires Java 25. Pin Paper 1.21.11 stable build 132 and its SHA-256 in repository
metadata. Build the plugin with the pinned Gradle 9.6.1 wrapper and distribution checksum.

The developer launcher downloads Paper into ignored `work/` storage, verifies it before execution,
builds and installs the BadgerBots plugin, and starts Paper plus the existing Web/control-plane
prototype. It requires explicit `BADGERBOTS_ACCEPT_MINECRAFT_EULA=true`; the application does not
accept Mojang's EULA for the operator.

For this slice, the authenticated Host-to-plugin transport is an HMAC-SHA-256 protected local file
spool. The control-plane prototype verifies the signed cloud-to-Host envelope, writes an atomic
bounded command file, and verifies the plugin's signed response. The plugin listens on no browser
port. Command IDs provide idempotent response handling, and deployment still uses the scoped atomic
runtime with last-known-good retention.

The plugin procedurally creates an original compact Sheep City world from vanilla blocks, loads a
3×3 chunk area, applies a 192-block border, and teleports the first prototype player there. This is
a working developer-world implementation, not evidence for 25 separate student worlds or a final
redistributable template.

## Evidence

- Paper documentation compatibility table: Minecraft 1.20–1.21.11 uses Java 21.
- Paper Fill API on 2026-07-23: 1.21.11 build 132, stable, SHA-256
  `5ffef465eeeb5f2a3c23a24419d97c51afd7dbb4923ff42df9a3f58bba1ccfba`.
- Gradle 9.6.1 distribution checksum:
  `9c0f7faeeb306cb14e4279a3e084ca6b596894089a0638e68a07c945a32c9e14`.

## Consequences and open gates

- A teacher or developer can test real Run/Stop and Sheep City behavior without a cloud bill.
- The prototype still uses one local world and the first online player; device/Minecraft mapping
  and multi-student isolation remain release gates.
- Paper is downloaded rather than redistributed. Managed Java acquisition, artifact licensing
  review, Windows firewall UX, backup/repair/update, signing, and physical Windows evidence remain
  open.
- The file-spool bridge is local prototype infrastructure. Production Host pairing must provision
  and rotate its secret and persist replay state securely.
