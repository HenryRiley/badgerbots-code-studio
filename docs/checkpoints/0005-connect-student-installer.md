# Checkpoint 5: Connect and student installer

Status: first fail-closed Connect application slice implemented on 2026-07-23. Checkpoint acceptance is not claimed. Stable native device identity, standard Prism discovery, original UI, readiness contracts, managed-only repair planning, tests, and Windows NSIS CI are present. Instructor authentication, durable account mapping through the control plane, verified profile/mod artifacts, actual installation/repair, Minecraft launch/status, and physical Windows evidence remain incomplete.

## Genuinely working

- Original BadgerBots Tauri/React student helper with an in-app redacted diagnostics console and a console-free Windows release executable.
- Native opaque UUID creation under Connect's application-local data directory. Reopening loads the same ID; corrupt or unsupported identity data fails closed.
- Read-only discovery of Prism's standard Windows `%APPDATA%\PrismLauncher` data root. A candidate counts as detected only when its `instances` directory exists.
- Domain contract requiring authenticated instructor authority and valid 3-16-character Minecraft username syntax before a fixed mapping changes.
- Readiness gate requiring durable identity, instructor-approved mapping, selected launcher, verified manifest, managed profile, client mod, and server entry.
- Repair planning targets only `instances/badgerbots-code-studio` and requires a verified 64-character SHA-256. No write operation is exposed yet.
- Per-user NSIS configuration with WebView2 bootstrap fallback and a 14-day unsigned CI artifact.

## Automated evidence

```sh
npx --yes pnpm@11.16.0 --filter @badgerbots/student-connect test
npx --yes pnpm@11.16.0 --filter @badgerbots/student-connect typecheck
npx --yes pnpm@11.16.0 --filter @badgerbots/student-connect build
npx --yes pnpm@11.16.0 verify
```

TypeScript tests cover readiness, instructor-only mapping, username validation, managed target isolation, checksum gating, and redaction. Rust tests cover identity stability, corrupt-state rejection, and launcher-directory detection.

Windows CI run
[`30043933390`](https://github.com/HenryRiley/badgerbots-code-studio/actions/runs/30043933390)
at commit `25ed7b24df999c3ee956eeae58d795e9fe0ff9db` produced the unsigned
`BadgerBots Connect_0.1.0_x64-setup.exe` artifact. The installer job passed in
15 minutes 15 seconds. Its independently verified SHA-256 is
`3cbc924f6772200952067bde2b33fdff4d5041ce21348435c5ec7a87970d88e0`.
The GitHub Actions artifact expires on 2026-08-06. This proves a Windows runner
can compile and package the installer; it does not replace the physical test
matrix below.

## Security and privacy

- The opaque device ID is not a camper identity and is not a credential.
- Weekly camper name data and Microsoft credentials are not stored by Connect.
- No shell, process, or filesystem plugin is granted to the webview. Native code exposes one read-only snapshot command.
- Portable launchers are not guessed or recursively scanned. A future UI must let an instructor explicitly select a portable root and validate it.
- No launcher files are modified until a signed/checksummed managed artifact, backup, atomic replacement, and rollback path exist.

## Acceptance mapping

| Checkpoint 5 item                      | Current evidence                       | Result                                 |
| -------------------------------------- | -------------------------------------- | -------------------------------------- |
| Stable device identity                 | Native reload and corruption tests     | Local pass; reinstall evidence pending |
| Instructor-controlled username mapping | Pure authorization/validation contract | Service/UI integration pending         |
| Prism/MultiMC detection                | Standard Prism root and fixture tests  | Prism slice; portable/MultiMC pending  |
| Managed profile/mod/server entry       | Isolated target and checksum gate      | Actual artifacts/install pending       |
| Connection/readiness status            | Fail-closed evidence model and UI      | Minecraft signal integration pending   |
| Windows installer/update/repair        | Per-user NSIS artifact + SHA-256        | CI pass; physical evidence pending     |

## Physical Windows matrix

Record commit, installer SHA-256, Windows version, Prism version, and launcher root.

| Scenario                                      | Status  |
| --------------------------------------------- | ------- |
| Clean per-user install and Start menu launch  | Pending |
| Launch without a Command Prompt window        | Pending |
| First identity persists after restart         | Pending |
| Upgrade/reinstall preserves device identity   | Pending |
| Standard Prism install is detected            | Pending |
| Portable Prism selection                      | Pending |
| Existing unrelated instances remain unchanged | Pending |
| Managed profile repair and rollback           | Pending |
| Client mod and server entry verification      | Pending |
| Uninstall retention choice                    | Pending |

## Next work

- Add authenticated instructor approval and control-plane device pairing.
- Define and pin the managed Prism instance, Fabric loader, client mod, and server-entry manifest with licenses and checksums.
- Implement backup-first staging, validation, atomic install/repair, and rollback for the dedicated instance only.
- Add explicit portable Prism/MultiMC selection rather than broad disk scanning.
- Build the client mod and authenticated local status protocol.
- Execute the physical Windows matrix before claiming Checkpoint 5 acceptance.
