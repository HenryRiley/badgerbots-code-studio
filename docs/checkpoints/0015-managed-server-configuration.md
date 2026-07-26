# Checkpoint 15: managed server configuration

Status: first slice complete; full managed Paper lifecycle remains in progress

## Working in the repository

- Step 4 is now a real graphical form in the Windows Host rather than an unexplained checklist
  item.
- The form collects and validates the teacher Minecraft Java username, port, bounded server memory,
  and explicit Minecraft EULA acceptance.
- The native layer independently validates every field, checks for Java 21 without opening a
  command window, and returns actionable errors in the app.
- Host atomically creates an application-local runtime configuration with online authentication,
  disabled RCON/query, bounded view/simulation distances, and isolated bridge/backup directories.
- Successful preparation completes both server configuration and teacher Minecraft mapping, then
  visibly advances to scoped firewall approval.

## Automated evidence

- TypeScript tests cover accepted and rejected server-form values.
- Rust tests cover native validation and the restricted `server.properties` policy.
- Host TypeScript, Rust, formatting, lint, and production-build checks remain part of repository
  verification.

## Manual Windows verification

1. Install BadgerBots Host 0.3.0 over the existing build and launch it from Start.
2. Continue the retained setup. At Step 4, enter the exact teacher Minecraft Java username.
3. Keep port `25565` and `4 GiB` unless the local environment requires another non-privileged port.
4. Open and accept the Minecraft EULA, then select **Prepare server**.
5. Confirm no Command Prompt opens. With Java 21 available, the wizard should advance past both
   **Server configuration** and **Teacher Minecraft mapping** to **Scoped firewall approval**.
6. Close and reopen Host; confirm those completed steps remain complete.
7. If Java 21 is missing or another Java is first on PATH, confirm the error is shown inside Host
   and no setup step is falsely completed.

## Not yet claimed

- Host does not yet download/verify Paper and the plugin, create the Windows firewall exception,
  start/stop the real server, verify a backup, or unlock the Start button.
- The existing command-line Paper prototype remains separate evidence. This slice does not claim a
  finished no-terminal installation.
- Checkpoint 15 continues with pinned artifact acquisition, firewall consent, backup/recovery, and
  real Paper lifecycle management.
