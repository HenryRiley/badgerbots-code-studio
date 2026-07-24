# Checkpoint 9: connected local prototype

Status: implementation complete when the documented automated, browser, and CI checks pass. Real
Paper and cloud-provider acceptance are not claimed.

## Genuinely working

- One command starts Code Studio Web and the loopback prototype control plane.
- A generated one-day session produces a random class code.
- A camper joins using only first name and last initial.
- The editor's last runnable canonical program or the completed test program can be saved with
  optimistic revision checks.
- The control plane compiles and signs a scoped, expiring deployment command.
- The loopback Host independently verifies signature, recipient, scope, time window, and replay
  sequence before atomic deployment.
- Host acknowledgements are signed and independently verified by the control plane.
- An invalid over-limit replacement is rejected while the last known-good program remains active.
- All Sheep City actions execute through the bounded headless runtime and record source-node
  attribution.
- Signed Stop removes the active execution scope and disables further events.

## Automated and browser evidence

- Connected-prototype tests cover the full workflow, stale optimistic saves, origin restrictions,
  and bearer-token requirements.
- Browser verification covers create, join, canonical save, signed Run, rejected replacement,
  four event types, attributed actions, Stop, disabled post-stop controls, console stability, and
  horizontal-overflow inspection.
- Production Web build must generate `/prototype`.
- Full repository verification and four GitHub checks remain the final checkpoint gates.

## Migrations and configuration

No migration is added. That is intentional: this developer service is memory-only and does not
pretend to satisfy provider durability or RLS. `NEXT_PUBLIC_BADGERBOTS_PROTOTYPE_API` may point the
Web page to another loopback port during development; the default is `http://127.0.0.1:4180`.

## Security and privacy

- Loopback binding and an explicit local-origin allowlist prevent LAN exposure by default.
- Random lab tokens and generated bootstrap/session secrets are never hard-coded or logged.
- Labs, bodies, request rate, credential lifetime, and retained action/delivery records are bounded.
- Diagnostics expose opaque IDs and source node IDs, not tokens or program bodies.
- The lab is unsuitable for real camper data and is labelled accordingly.

## Manual verification

Follow [the connected prototype guide](../connected-prototype.md). On Windows, run the same command
from PowerShell and confirm the Web/loopback flow. This does not replace installing Host or running
Paper.

## Acceptance mapping

| Product behavior   | Checkpoint 9 evidence                                       | Remaining acceptance gate                         |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------- |
| Join and workspace | Generated session/class code and authorized local workspace | Provider auth, device mapping, retention jobs     |
| Autosave/conflict  | Canonical sync and optimistic revision rejection            | Debounced provider persistence and reconnect      |
| Host protocol      | Signed commands and acknowledgements verified end to end    | Native Host outbound transport and durable replay |
| Atomic Run         | Connected last-good deployment behavior                     | Real Paper hot deployment on Windows              |
| Sheep City actions | Bounded, attributed headless adapter actions                | Original world and real Paper behavior            |
| Stop cleanup       | Active runtime scope is cancelled deterministically         | Paper tasks/entities/world unload evidence        |

## Next work

- Run the existing PostgreSQL migrations against a real local/provider test database and implement
  authenticated Web persistence.
- Move this Host verifier/queue into the native Tauri Host.
- Compile and smoke-test the version-specific Paper sources, then connect Host to plugin locally.
- Supply or create the original Sheep City world with provenance and checksum metadata.
