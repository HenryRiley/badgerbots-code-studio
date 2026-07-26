# ADR 0016: Host Paper smoke-test lifecycle

- Status: Accepted for the internal prototype
- Date: 2026-07-25

## Context

The Host wizard can install and verify Paper, the BadgerBots plugin, configuration recovery files,
and the Windows firewall rule. The final setup gate still cannot prove that those pieces work
together without a teacher opening a terminal.

## Decision

The Test server step is a bounded automatic smoke test. Host re-verifies Paper, plugin, and
configuration-recovery checksums, checks that the configured loopback port is free, creates a
cryptographically random one-time bridge credential, and launches Java with redirected standard
streams. Packaged Windows builds use `CREATE_NO_WINDOW`; server output is presented only in the
Host UI.

The test waits at most three minutes for independent evidence that Paper reported Ready, the Sheep
City plugin loaded, and the authenticated local file bridge started. It then connects to the
configured loopback Minecraft port, sends Paper's `stop` command, and allows at most one minute for
a successful exit. A failed timeout causes bounded cleanup and never completes the setup gate.

Host retains only the newest 80 log lines, removes the managed runtime path, drops secret-shaped
lines, and limits each line to 500 characters. Passing loopback evidence is recorded as a warning
until a real student device connects over the camp's private Wi-Fi.

## Consequences

- A teacher can complete all seven first-run gates without PowerShell or Command Prompt.
- Test-server success proves local composition and clean shutdown, not classroom LAN reachability,
  sustained load, world backup/restore, or production server lifecycle.
- The one-time bridge credential is not persisted or shown in the UI.
- Permanent Start/Stop controls, crash recovery, sleep inhibition, and verified world backups
  remain separate work.
