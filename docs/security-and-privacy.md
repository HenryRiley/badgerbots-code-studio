# Security, safety, and privacy baseline

- Minimize child data; do not require legal surname, personal email, or Microsoft credentials in the web platform.
- Enforce location/session tenancy on every query and realtime subscription.
- Use secure password hashing, session rotation, CSRF protection, rate limits, audit logs, and least-privilege roles.
- Pair Hosts and devices with short-lived, instructor-authorized codes and rotate long-lived credentials.
- Sign runtime envelopes; reject replays, stale versions, unknown hosts, and cross-session/world identifiers.
- Apply hard quotas for loop iterations, scheduled tasks, wall-clock execution, blocks changed, entities spawned, projectiles, explosions, messages, and retained logs.
- Cap explosion size and destructive radius. Prevent filesystem/network access, reflection, imports, threads, native calls, command execution, and operator escalation.
- Scope every event handler and mutation to the student's active world unless an explicit instructor-authorized teacher-world action is used.
- Provide immediate Stop controls and automatic circuit breakers for lag, runaway loops, or entity floods.
- Redact secrets and unnecessary child data from diagnostics. Encrypt sensitive credentials at rest using OS-protected storage.
- Verify downloaded runtimes, server builds, plugins, client mods, and updates with checksums/signatures.
- Keep backups recoverable but bound to the same deletion schedule.
- Obtain legal/privacy review before production use with children; document COPPA and organizational obligations rather than assuming compliance.
