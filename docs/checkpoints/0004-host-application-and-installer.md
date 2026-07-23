# Checkpoint 4: Host application and teacher installer

Status: first Host application slice implemented and CI-verified on 2026-07-23. Checkpoint acceptance is not claimed. The Tauri shell, safety model, native persistence, UI, and unsigned Windows NSIS prototype exist; Paper lifecycle, real readiness probes, authentication/pairing, firewall, backups, updates, sleep inhibition, and physical Windows installer evidence remain incomplete.

## Genuinely working locally

- Original BadgerBots Tauri 2/React Host Control Center with explicit browser-preview/native-prototype labels and classroom-distance status hierarchy.
- Ordered seven-step first-run model covering sign-in, location, hardware, server configuration, teacher mapping, scoped firewall approval, and test server.
- Fail-closed readiness gate: server start remains unavailable until setup, readiness, all managed artifact checksums, a verified backup, and crash recovery pass.
- Independently tested server lifecycle state machine for start/running/stop/clean exit and unclean-exit recovery behavior.
- Diagnostic sanitization for common credentials and email addresses, bounded local event history, and correlation IDs.
- Tauri Rust commands for reading state and advancing setup. Non-secret state is loaded from the application-local directory and replaced atomically. Native server transitions deliberately return a locked diagnostic.
- Strict Tauri capability surface (`core:default` only), explicit CSP, distinct application identity, original icons, and pinned JavaScript/Rust dependencies.
- Windows CI builds an unsigned per-machine NSIS prototype, records its SHA-256, and retains the internal artifact for 14 days.

## Automated evidence

```sh
npx --yes pnpm@11.16.0 --filter @badgerbots/host-windows test
npx --yes pnpm@11.16.0 --filter @badgerbots/host-windows typecheck
cargo check --manifest-path apps/host-windows/src-tauri/Cargo.toml --locked
cargo test --manifest-path apps/host-windows/src-tauri/Cargo.toml --locked
npx --yes pnpm@11.16.0 --filter @badgerbots/host-windows build
npx --yes pnpm@11.16.0 verify
npx --yes pnpm@11.16.0 build
```

The Host tests cover locked initial state, setup ordering, all readiness gates, valid lifecycle transitions, crash recovery, sleep-inhibition intent cleanup, and diagnostic redaction. Native Rust tests prove the native snapshot starts locked and redacts a secret-shaped event.

The production web bundle was manually inspected in a browser. The seven-step sequence advanced correctly, the next step updated, server controls remained disabled, and no browser console error was emitted.

GitHub Actions run [30037850265](https://github.com/HenryRiley/badgerbots-code-studio/actions/runs/30037850265) passed all three jobs for commit `6030c9b`:

- repository checks on Ubuntu: passed in 6m35s;
- Windows bootstrap smoke test: passed in 11m06s;
- unsigned Host NSIS prototype: passed in 14m15s.

Artifact `badgerbots-host-unsigned-windows-x64` contains `BadgerBots Host_0.1.0_x64-setup.exe` and `SHA256SUMS.txt`. The installer checksum was independently recomputed after download and matched:

```text
8e7182bcfe6917b6c52c3d925ca3561c49c59b49b761df100a59a8ac497b1bf3
```

The artifact expires on 2026-08-06. A hosted Windows runner proves clean Windows compilation and packaging, not installation or behavior on classroom hardware.

On 2026-07-23, the project owner reported that the current tests work on Windows. The exact Windows version, installer log, screenshots, upgrade/uninstall cases, and Paper smoke-test evidence were not captured, so the detailed physical matrix below remains pending. Release builds now use the standard Rust Windows GUI subsystem setting and do not open a terminal window. Operational events appear in the app's redacted **Recent events** panel; developer builds may retain terminal diagnostics.

## Installer/configuration changes

- Tauri API 2.11.1, CLI 2.11.4, Rust crate 2.11.5, and `tauri-build` 2.6.3 are pinned.
- Vite 8.1.5 builds the Host frontend.
- Rust 1.96.1 remains pinned by the repository toolchain.
- NSIS is configured `perMachine`; WebView2 uses the system runtime with download-bootstrapper fallback.
- No database migration, cloud resource, production secret, firewall rule, Paper download, Java installation, or sleep-policy change was made.

## Security and privacy

- The browser cannot execute a process, access files, or make arbitrary network requests through a shell plugin; none is installed or granted.
- Native state contains status/setup metadata only. Authentication and pairing credentials are intentionally absent until OS-protected secret storage is designed and tested.
- Server launch is fail-closed. Browser preview actions never claim to sign in, configure a firewall, test Paper, or create a backup.
- Per-machine installation will require elevation, but daily application use must not. The exact installer privilege and uninstall behavior still needs Windows evidence.

## Physical Windows verification matrix

Record the exact commit and artifact SHA-256 for every run.

| Scenario                             | Windows 10 x64 | Windows 11 x64 | Required evidence                                     |
| ------------------------------------ | -------------- | -------------- | ----------------------------------------------------- |
| Standard-user install with elevation | Pending        | Pending        | Installer log, install path, Start menu entry         |
| Denied elevation                     | Pending        | Pending        | Clear failure and no partial install                  |
| First launch/WebView2 bootstrap      | Pending        | Pending        | Screenshot, runtime version, timing                   |
| Path containing spaces               | Pending        | Pending        | Launch and state persistence                          |
| Repair and same-version reinstall    | Pending        | Pending        | Preserved safe state, no unrelated changes            |
| Upgrade and rollback                 | Pending        | Pending        | Backup, atomic replacement, version evidence          |
| Uninstall                            | Pending        | Pending        | Removed managed files; retained/deleted data decision |
| Offline/poor network                 | Pending        | Pending        | Actionable state; no false Ready                      |
| Firewall diff                        | Pending        | Pending        | No rule today; later rule must be program/port scoped |
| Sleep policy restoration             | Pending        | Pending        | No change today; later active-camp-only proof         |
| Paper test server                    | Pending        | Pending        | Blocked today; later real plugin execution logs       |

## Acceptance mapping

| Checkpoint 4 item         | Current evidence                     | Result                                  |
| ------------------------- | ------------------------------------ | --------------------------------------- |
| Tauri Host shell          | Native compile plus browser UI/build | Pass locally                            |
| First-run wizard          | Ordered safety model and preview UI  | Model passes; real steps pending        |
| Readiness metrics         | Typed evidence states and locked UI  | Real Windows probes pending             |
| Paper lifecycle           | Guarded lifecycle model              | Real process integration pending        |
| Logs and crash recovery   | Redaction and recovery state tests   | Local model pass; restart drill pending |
| Backups and updates       | Status/gating contracts              | Implementation pending                  |
| Scoped firewall and sleep | Explicit locked states               | Implementation pending                  |
| NSIS installer            | Clean Windows CI build plus checksum | CI pass; physical evidence pending      |

## Unresolved issues and next work

- Checkpoint 3 still lacks a resolved Paper artifact and real server smoke test; that blocks honest Host server lifecycle integration.
- Secure pairing must use OS-protected storage with rotation and recovery, not the JSON status store.
- Readiness needs native RAM/disk/port/network/WebView2/Java measurements and conservative scoring.
- Backup creation/verification/restore, local outbound queue durability, signed updates/rollback, crash recovery, scoped firewall changes, and active-camp-only sleep inhibition are not implemented.
- A physical Windows 10/11 test record is required before this checkpoint can be accepted.
