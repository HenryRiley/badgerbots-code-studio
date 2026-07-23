# ADR 0011: Authenticated runtime protocol and execution scopes

Status: accepted for the local Checkpoint 3 contract on 2026-07-22. Transport deployment and real Paper acceptance remain pending.

## Decision

Cloud-to-Host and Host-to-plugin commands use a versioned deterministic envelope. Every envelope names its sender, recipient, channel, command ID, monotonically increasing sequence, short validity window, nonce, and full organization/location/session/project/student/world scope. The current local adapter authenticates the canonical envelope with HMAC-SHA-256 and a device-bound secret of at least 32 bytes. Production pairing must provision and rotate a distinct secret per Host; a shared repository or application secret is forbidden.

Receivers authenticate before returning scope-specific errors, reject expired or stale commands, and retain command IDs so an authenticated retry is acknowledged as a duplicate instead of executing twice. The browser never receives Host credentials or opens a direct teacher-laptop control port. The Host remains the authenticated outbound cloud peer defined by ADR 0005.

The runtime converts only validated canonical AST programs into an allowlisted instruction graph. Active execution is keyed by organization, location, session, project, student, program version, and world. Events, timers, entities, and other resources register with that scope and are cancelled deterministically on Stop, replacement, disconnect, or world unload. A deployment is validated and prepared before replacing the active program; failure retains the last known-good version. Per-event instruction, explosion, item-drop, nesting, handler, and wall-clock limits fail closed and stop the affected scope.

## Consequences

- The same contract can be carried over a cloud WebSocket and a loopback Host/plugin channel without trusting transport ordering.
- Idempotency/replay state must become durable across Host restart before release; the in-memory ledger is only a local proof.
- HMAC is appropriate for the paired Host proof, but secret storage, rotation, compromise recovery, and authenticated acknowledgements still require Host integration.
- Paper API calls remain behind the adapter. The headless interpreter and pure-Java core can be tested without a Minecraft server, but those tests do not prove Paper compatibility.

## Acceptance evidence still required

Build the Paper-specific sources against the locked API, connect the Host transport, persist replay state, run a real Paper server on supported Windows, prove hot deployment and last-good retention, and verify that all scoped tasks/entities are removed on disconnect and world unload.
