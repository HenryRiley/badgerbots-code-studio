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

Checkpoint 9's connected prototype is a developer-only exception surface, not a deployment model.
It binds only to `127.0.0.1`, accepts four explicit loopback Web origins, issues random memory-only
bearer tokens, caps labs/body size/request rate, logs no tokens or program bodies, and loses all
identity/program state at shutdown. It must never be exposed to a LAN or used with real camper data.

Host operational world backups are local application data and may contain Minecraft player data.
The prototype restricts them to fixed managed world roots, rejects links/path traversal, verifies
every file, and retains at most five. They are not yet encrypted final-retention exports and must
not be copied to cloud storage or retained beyond the applicable camp deletion policy.
