# Checkpoint 15: managed server configuration

Status: graphical configuration, artifacts, firewall, test-server, managed-lifecycle, and
world-recovery slices implemented;
physical Windows verification remains required

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
- Step 7 re-verifies the installed artifacts and configuration recovery copy, starts Paper without
  a command window, and requires distinct Paper, Sheep City plugin, authenticated bridge, and
  loopback-port readiness signals.
- Host automatically sends `stop`, requires a clean exit, and displays a bounded redacted server
  log inside the app. A failed test remains retryable and never completes setup.
- After setup, **Start classroom server** launches the verified Paper/plugin configuration as a
  long-running hidden child process. The state becomes Running only after Paper, plugin, bridge,
  and loopback readiness are all observed.
- The in-app console receives actual Paper output in real time, auto-scrolls, retains the newest 80
  redacted lines, and exposes no arbitrary command input.
- **Stop server** and normal app close request Paper's clean shutdown. A one-minute bound prevents
  an unresponsive child from hanging the Host forever.
- Unexpected Paper exit moves Host to Failed and requires **Verify and recover** before restart.
  Windows sleep prevention is active only while Paper is ready.
- Start creates and verifies a checksummed managed-world snapshot before launching Paper.
- The Recovery panel provides functional **Back up now**, **Restore latest**, and **Reset Sheep
  City** controls while Paper is stopped.
- Restore stages and verifies all files before replacing fixed managed world roots. Reset backs up
  first and removes only Sheep City so the original plugin-owned prototype regenerates next start.
- At most five operational snapshots, 100,000 files, and 4 GiB per snapshot are accepted.

## Automated evidence

- TypeScript tests cover accepted and rejected server-form values.
- Rust tests cover native validation and the restricted `server.properties` policy.
- Rust tests cover checksum mismatch, JAR rejection, privileged-port rejection, and exact
  private-network TCP firewall parameters.
- Rust tests cover required Paper/plugin/bridge readiness signals and server-log redaction.
- Rust tests cover supervisor state updates, crash recovery requirement, and the 80-line console
  bound.
- Rust tests cover backup creation, exact manifest verification, tamper refusal, restore, and
  Sheep City-only reset.
- Host TypeScript, Rust, formatting, lint, and production-build checks remain part of repository
  verification.

## Manual Windows verification

1. Install BadgerBots Host 0.7.0 over the existing build and launch it from Start.
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
12. At **Test server**, select **Run server test**. Confirm no Command Prompt or PowerShell window
    opens. First launch may take up to three minutes.
13. Confirm Host reports that Paper, the Sheep City plugin, authenticated bridge, local port, and
    clean shutdown passed. The server state must return to **Stopped**, with last exit **Clean**.
14. Inspect the built-in Paper readiness log. It must contain startup and shutdown evidence but no
    bridge credential or full managed-runtime path.
15. Close and reopen Host. Confirm all seven setup gates remain complete.
16. Before camp acceptance, connect one supported student device over the actual private Wi-Fi;
    loopback success alone does not prove LAN/firewall behavior.
17. Select **Start classroom server**. Confirm the status changes to Starting, live Paper lines
    appear immediately, and Running appears only after all readiness signals.
18. Confirm the console shows **LIVE**, continues to update, auto-scrolls, and never displays the
    bridge credential or full managed-runtime path.
19. Join Minecraft Java at `127.0.0.1:25565` (or the configured port) and confirm Sheep City loads.
20. Select **Stop server**. Confirm Stopping then Stopped/clean, with no Command Prompt or Java
    console window at any point.
21. Start again, then close Host. Confirm Host waits for Paper's clean shutdown before closing.
    Reopen it and confirm the last exit is clean rather than requiring recovery.
22. Start again and end only that Paper `java.exe` child in Task Manager. Confirm Host changes to
    Failed, reports an unclean exit, blocks Start, and **Verify and recover** returns it to Stopped.
23. During Running, confirm Windows does not automatically sleep. After Stop, confirm the normal
    power policy resumes.
24. With Paper stopped, select **Back up now**. Confirm the status becomes Verified, snapshot count
    increases, and latest size is nonzero.
25. Start Minecraft, visibly change Sheep City and the teacher world, stop cleanly, then select
    **Restore latest** and accept the warning. Start again and confirm both worlds match the
    snapshot.
26. Stop, select **Reset Sheep City**, accept the warning, and start again. Confirm Sheep City
    regenerates while the teacher world remains unchanged. Restore latest and confirm the
    pre-reset Sheep City returns.
27. Create more than five backups and confirm the displayed retained count stays at five.
28. Copy and alter a file inside the newest backup on a disposable test installation. Confirm
    Restore fails with a SHA-256 error and current worlds remain untouched.

## Not yet claimed

- Host does not yet provide an encrypted/compressed final-retention export, managed Java
  distribution, firewall repair/removal, or signed update/repair behavior.
- Hard-killing Host itself or losing power still requires a physical orphan-process and world
  integrity drill.
- The Java 21 runtime is version-probed but not yet a privately managed checksummed distribution.
- Checkpoint 15 continues with managed Java and repair/uninstall behavior.
