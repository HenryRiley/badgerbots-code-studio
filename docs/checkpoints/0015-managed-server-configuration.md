# Checkpoint 15: managed server configuration

Status: artifact/firewall slice implemented; physical Windows verification and test-server
lifecycle remain in progress

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
- Host downloads the immutable pinned Paper 1.21.11 build, enforces the expected size and SHA-256,
  and never installs a failed download.
- Windows CI compiles/tests the BadgerBots Paper plugin and embeds it in the Host installer. Host
  verifies its JAR shape and records its SHA-256 when installing it.
- A configuration-only recovery snapshot is created before first server launch.
- The firewall screen invokes one normal Windows UAC prompt. Its rule is inbound TCP, the configured
  port only, and Windows Private networks only; it does not use PowerShell.

## Automated evidence

- TypeScript tests cover accepted and rejected server-form values.
- Rust tests cover native validation and the restricted `server.properties` policy.
- Rust tests cover checksum mismatch, JAR rejection, privileged-port rejection, and exact
  private-network TCP firewall parameters.
- Host TypeScript, Rust, formatting, lint, and production-build checks remain part of repository
  verification.

## Manual Windows verification

1. Install BadgerBots Host 0.4.0 over the existing build and launch it from Start.
2. Continue the retained setup. At Step 4, enter the exact teacher Minecraft Java username.
3. Keep port `25565` and `4 GiB` unless the local environment requires another non-privileged port.
4. Open and accept the Minecraft EULA, then select **Prepare server**.
5. Confirm no Command Prompt opens. With Java 21 available, the wizard should advance past both
   **Server configuration** and **Teacher Minecraft mapping** to **Scoped firewall approval**.
6. Close and reopen Host; confirm those completed steps remain complete.
7. Select **Install verified server files**. Confirm it downloads Paper, verifies all three runtime
   rows, and does not open a terminal.
8. Select **Approve private-network access**, accept the UAC prompt, and confirm the wizard advances
   to **Test server**.
9. In Windows Defender Firewall with Advanced Security, confirm the BadgerBots rule is inbound TCP,
   port `25565` (or the configured port), and Private profile only.
10. Close and reopen Host. Confirm artifact evidence and completed firewall state remain.
11. If Java 21 is missing, the network is offline, UAC is cancelled, or the checksum is wrong,
    confirm the error appears inside Host and the related readiness step is not falsely completed.

## Not yet claimed

- Host does not yet start/stop the real server, observe Paper readiness, verify a world backup,
  remove/repair its firewall rule, or unlock the Start button.
- The existing command-line Paper prototype remains separate evidence. This slice does not claim a
  finished no-terminal installation.
- The Java 21 runtime is version-probed but not yet a privately managed checksummed distribution.
- Checkpoint 15 continues with test-server lifecycle, world backup/recovery, managed Java, and
  repair/uninstall behavior.
