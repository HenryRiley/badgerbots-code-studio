# Windows build and verification strategy

macOS is a supported development workstation, not evidence that a Windows installer works.

## Cloud prerequisite

Windows installers consume the centrally deployed classroom service; they are not database
deployment tools. Before distributing an installer, a repository owner runs the protected
**Deploy Supabase production** GitHub workflow and verifies its migration and Edge Function steps.
Supabase access tokens and database URLs must never be compiled into, copied beside, or requested
by BadgerBots Host or Connect.

The Host installer may embed only `BADGERBOTS_SUPABASE_URL` and
`BADGERBOTS_SUPABASE_PUBLISHABLE_KEY` through GitHub repository variables. Those are browser-safe
connection values. A release build must verify both variables are configured before it can be
called teacher-ready.

## Build path

1. Pull-request CI runs repository checks on Linux and Windows using pinned Node/pnpm and immutable action commits.
2. Checkpoint 4 adds a Windows-only Tauri build job for an unsigned x64 NSIS artifact and SHA-256. Software-bill-of-materials generation and captured installer logs remain pending. MSI may be added for managed deployment requirements.
3. Release jobs consume pinned/checksummed Paper, plugin, and client-mod inputs. Host 0.8.0
   acquires the exact Temurin 21.0.11+10 Windows x64 ZIP during graphical setup from its immutable
   release URL, verifies the recorded vendor SHA-256 before extraction, and keeps it private.
   Neither CI nor Host fetches an unversioned `latest` runtime.
4. Unsigned artifacts are clearly labeled internal prototypes. Production release requires protected BadgerBots signing credentials, timestamping, signature verification, authenticated update manifests, and rollback evidence.
5. CI artifacts are promoted only after manual test records on physical Windows 10 and Windows 11 machines reference the exact build ID and checksums.

## Physical test record minimum

Record OS build, CPU/RAM/disk/network, standard-vs-admin user, existing Java/Prism/MultiMC state, install/repair/upgrade/uninstall results, firewall rule diff, WebView2 behavior, Paper readiness, Minecraft connection, log paths, screenshots, timings, restart behavior, and all deviations.

Host and Connect test matrices must include paths with spaces, offline/poor network, occupied ports, denied elevation/firewall, disk pressure, corrupt managed files, existing unrelated instances, reinstall preserving device identity, and rollback. The Sheep City acceptance milestone additionally requires real Paper execution and 25-student evidence; CI alone cannot satisfy it.
