# BadgerBots threat model

Status: engineering baseline for Checkpoint 7; legal/privacy and independent security review
remain release gates.

## Protected assets and trust boundaries

- Temporary camper identity, code, progress, help state, and private-world membership.
- Persistent device and Minecraft mapping, kept separate from temporary campers.
- Instructor credentials/roles, Host pairing credentials, update keys, backups, and audit data.
- Canonical programs, last-known-good runtime versions, immutable templates, and working worlds.
- Boundaries: browser ↔ cloud, Host outbound ↔ cloud, Host ↔ Paper plugin, Minecraft client ↔
  local Paper, update/build pipeline, and local managed files.

## Principal threats and controls

| Threat                                     | Required control                                                                                        | Current evidence/gap                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Guessing a class code                      | Persistent rate limit, dated session, minimal identity, device association                              | Domain limiter passes; provider/device integration open    |
| Cross-tenant or cross-world access         | Opaque IDs plus organization/session/project/student/world authorization on every operation             | Domain/RLS and lease tests; deployed adversarial test open |
| Visitor edits owner code                   | Separate enter and edit permissions; edit remains owner/instructor only                                 | Lease model implemented; Paper routing open                |
| Runtime replay/tampering                   | Signed short-lived scoped envelopes, sequence/idempotency, durable replay ledger                        | Headless protocol passes; durable ledger open              |
| Student code escapes DSL                   | Canonical AST and allowlisted instruction graph; no arbitrary Java/JS/I/O/network/thread/process access | Compiler/runtime negative tests pass                       |
| Runaway tasks/entities                     | Per-scope registration, hard budgets, stop on breaker/disconnect/unload, cleanup counters               | Headless TS/Java passes; Paper soak open                   |
| Shared-instance boundary crossing          | Server-side bounds on every routed action/teleport; no client-trusted coordinates                       | Lease bounds implemented; Paper enforcement open           |
| Host/cloud outage loses control            | Existing last-good only, bounded redacted queue, no new remote change claim                             | Host policy implemented; transport drill open              |
| Disk pressure destroys recovery            | Pause admissions/deployments/backups; do not auto-delete verified backups                               | Host policy implemented; native disk integration open      |
| Corrupt world spreads or overwrites backup | Quarantine working copy, verify immutable template, atomic restore, retain backup until verified        | Manager/policy implemented; real world drill open          |
| Diagnostic data leaks child/secrets        | Allowlisted compact payloads, prohibited keys, redaction, correlation IDs                               | Host queue/redaction tests; cross-process review open      |
| Malicious update/artifact                  | Pinned dependencies, checksums/signatures, protected signing, rollback-safe update                      | CI/checksum prototypes; signing/rollback open              |
| Stolen teacher laptop                      | OS-protected credential storage, short-lived sessions, remote rotation, encrypted backups               | Design only                                                |

## Fail-closed rules

- Missing/invalid identity, assignment, scope, signature, version, checksum, or readiness evidence
  denies the operation.
- A failed deployment retains the prior program; a crashed plugin stops runtime scopes.
- Capacity, disk, or isolation failures pause new leases instead of weakening boundaries.
- Owner departure cancels the owner scope, evicts visitors, and permits safe unload; the teacher
  world is never part of this automatic unload path.
- Synthetic benchmarks, CI compilation, and browser simulations cannot be labelled physical
  Minecraft acceptance.

## Review cadence

Review after authentication/pairing changes, each new runtime instruction, each provider/update
change, Minecraft/Paper upgrades, retention changes, and before every camp release.
