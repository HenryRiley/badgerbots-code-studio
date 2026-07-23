# Architecture overview

## Deployment topology

```text
Cloud control plane
  Web UI + API + database + authentication + curriculum + autosave
                    ^
                    | authenticated outbound realtime channel
                    v
Teacher Windows laptop
  Host app -> Paper server -> BadgerBots plugin -> world instances
       ^              ^
       | local Wi-Fi   | Minecraft protocol
       |              |
Student laptop: browser + Connect + managed MultiMC/Prism profile/client mod
```

The teacher host never needs an inbound public internet port. Minecraft traffic stays on the local Wi-Fi. The browser should not directly call arbitrary teacher-laptop ports.

## Authoritative program flow

```text
Blockly view <-> canonical versioned AST <-> restricted Java-style view
                         |
                         v
            validated runtime instruction graph
                         |
                         v
             Paper plugin scoped execution
```

The AST owns semantics. Text is parsed into the supported grammar. Blockly is regenerated from AST. Runtime instructions are bounded, cancellable, attributable, and world-scoped.

## Core boundaries

- Cloud control plane: identity, sessions, roles, curriculum, program versions, progress, audit trail, host registry.
- Host: local secrets, Paper lifecycle, update/download verification, queue, world storage, backups, diagnostics, local readiness.
- Plugin: in-process game integration, event ownership, cancellation, quotas, telemetry, operator commands.
- Connect/client mod: fixed-device identity, profile health, local server discovery, optional in-game UI.
- Version adapter: only component aware of selected Minecraft/Paper implementation details.

## Reliability model

- Commands carry unique IDs and acknowledgements; retries are idempotent.
- Host keeps a durable local command/program cache for brief cloud interruptions.
- Program activation is atomic: validate first, then swap the active handler set.
- A failed deployment leaves the last known-good program active unless instructor chooses Stop.
- World templates are immutable; reset creates/restores a working copy.
- Every scheduled task, event subscription, entity, and mutable resource is registered to a student execution scope for cleanup.

## Preferred technology, subject to spikes

- Next.js/TypeScript web application.
- PostgreSQL and provider-adapted email/password authentication; the one-camp pilot uses Supabase Auth under ADR 0009.
- Blockly-based block editor.
- Tauri 2 + React/TypeScript + Rust for both Windows helpers.
- Paper server plugin and a lightweight compatible client mod.
- pnpm workspace/Turborepo for JS/TS; separate Gradle modules for Minecraft; Cargo workspace for Tauri.
- CI on macOS/Linux plus Windows installer jobs.

For the one-camp pilot, [ADR 0009](../decisions/0009-zero-cost-pilot-platform.md) selects Cloudflare Pages Free plus Supabase Free and Resend Free, subject to measured quota, backup, readiness, and privacy gates. Provider-facing code remains behind adapters and standard PostgreSQL migrations so this zero-cost deployment can be replaced without redesigning product boundaries.
