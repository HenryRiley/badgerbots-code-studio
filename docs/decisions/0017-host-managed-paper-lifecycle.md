# ADR 0017: Host-managed Paper lifecycle and live console

- Status: Accepted for the internal prototype
- Date: 2026-07-26

## Context

The graphical smoke test proves that Paper, the Sheep City plugin, the authenticated bridge, and
the loopback listener can start together. A classroom still needs the installed Host to own the
long-running process without a terminal, communicate readiness honestly, stop cleanly, and give
the instructor useful live output.

## Decision

The native Host owns one Paper child process through a single supervisor. Start re-verifies the
pinned Paper and plugin artifacts, configuration, recovery copy, and lifecycle gates before
launch. Packaged Windows builds use `CREATE_NO_WINDOW`; redirected output is sent to the Host UI as
events.

The supervisor reports `Starting`, `Running`, `Stopping`, `Stopped`, or `Failed` from observed
process and readiness evidence. It accepts only bounded lifecycle controls, not arbitrary shell or
Paper-console input. Stop and normal Host-window close send Paper's `stop` command, wait up to one
minute, then terminate a process that does not exit. A normal window close waits for this cleanup
before the application exits.

Only the newest 80 redacted lines are retained. Secret-shaped lines are dropped, managed-runtime
paths are removed, and individual lines are limited to 500 characters. Log events update the
visible console in real time without persisting every line to disk.

While the server is ready, Windows sleep inhibition uses `SetThreadExecutionState` with
`ES_SYSTEM_REQUIRED`. Host restores the normal policy after exit. An unexpected child exit changes
the lifecycle to `Failed`, records an unclean exit, and requires graphical verification and
recovery before another Start.

## Consequences

- Teachers can start, monitor, stop, and recover the classroom server without PowerShell.
- The visible console contains real redacted Paper output, not fabricated status messages.
- Arbitrary server commands are intentionally excluded from the first prototype console.
- A normal Host close does not knowingly leave Paper running.
- Hard termination of the Host process, OS power loss, verified world backup/restore, managed Java,
  update/repair, and full physical Windows recovery drills remain release gates.
