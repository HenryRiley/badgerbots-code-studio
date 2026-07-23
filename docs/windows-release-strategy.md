# Windows build and verification strategy

macOS is a supported development workstation, not evidence that a Windows installer works.

## Build path

1. Pull-request CI runs repository checks on Linux and Windows using pinned Node/pnpm and immutable action commits.
2. Checkpoint 4 adds a Windows-only Tauri build job for x64 NSIS artifacts, checksums, software-bill-of-materials, and installer logs. MSI may be added for managed deployment requirements.
3. Release jobs consume pinned/checksummed Java, Paper, plugin, and client-mod inputs. They never fetch an unversioned `latest` artifact while assembling a release.
4. Unsigned artifacts are clearly labeled internal prototypes. Production release requires protected BadgerBots signing credentials, timestamping, signature verification, authenticated update manifests, and rollback evidence.
5. CI artifacts are promoted only after manual test records on physical Windows 10 and Windows 11 machines reference the exact build ID and checksums.

## Physical test record minimum

Record OS build, CPU/RAM/disk/network, standard-vs-admin user, existing Java/Prism/MultiMC state, install/repair/upgrade/uninstall results, firewall rule diff, WebView2 behavior, Paper readiness, Minecraft connection, log paths, screenshots, timings, restart behavior, and all deviations.

Host and Connect test matrices must include paths with spaces, offline/poor network, occupied ports, denied elevation/firewall, disk pressure, corrupt managed files, existing unrelated instances, reinstall preserving device identity, and rollback. The Sheep City acceptance milestone additionally requires real Paper execution and 25-student evidence; CI alone cannot satisfy it.
