# ADR 0022: Run the outbound classroom worker inside BadgerBots Host

Status: Accepted

Date: 2026-07-29

## Context

The connected classroom prototype proved the cloud queue and signed Paper bridge with a developer
Node process. That path required a repository checkout, environment variables, pnpm, and
PowerShell. It also kept the paired Host credential outside the installed application's protected
credential store. A camp release cannot depend on that workflow.

## Decision

BadgerBots Host 0.9 runs the classroom worker natively in Rust whenever its managed Paper process
reaches Ready.

- Host reads the pairing token from its current-user protected credential store and never sends it
  to the webview or logs.
- Host polls the configured Supabase Edge endpoint over outbound HTTPS with the paired Host
  headers. No browser or cloud service opens a port on the teacher laptop.
- Each cloud command is HMAC-verified over the exact serialized command before parsing.
- Host independently validates the Sheep City schema-v2 AST and compiles the bounded instruction
  graph. It never evaluates Java, JavaScript, shell, or arbitrary code.
- Host signs the compiled command with a fresh per-Paper-process secret and delivers it through the
  existing local file bridge.
- Sequence and acknowledgement state is stored atomically outside the world folders. The bounded
  acknowledgement cache permits safe cloud retries without intentionally re-running a command.
- The worker stops with Paper. Network loss changes the in-app status to Offline while Paper and
  the last-known-good runtime remain available.

The Node worker remains a developer fixture temporarily. It is not the installed-camp path.

## Consequences

Teachers need only the Host installer and graphical setup. A live Windows/Supabase/Paper test is
still required before release because local unit tests cannot prove school-network behavior,
credential persistence across reinstall, or provider availability.
