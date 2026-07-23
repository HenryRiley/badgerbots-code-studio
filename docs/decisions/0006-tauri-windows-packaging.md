# ADR 0006: Tauri 2 Windows packaging

Status: accepted on 2026-07-22.

## Decision

- Build Host and Connect with Tauri 2, React/TypeScript, and Rust. Share UI/contracts but publish separate application identities, data directories, update channels, and installers.
- Produce x64 Windows NSIS installers on a pinned Windows CI runner. Build and smoke-test MSI artifacts later if organizational deployment requires them. Do not call macOS cross-compilation a release build.
- Use an intentional per-machine install for managed camp laptops. The installer may request elevation for application installation and narrowly scoped firewall configuration; daily application use must not require administrator rights.
- Use the OS-serviced WebView2 runtime with the embedded bootstrapper fallback. Do not ship a fixed WebView2 unless offline test results require it.
- Install managed Java, Paper, profiles, and mods only inside BadgerBots-owned directories. Back up any BadgerBots-managed file before atomic migration. Never replace global Java or unrelated Prism/MultiMC instances.
- Build unsigned prototypes in CI. Production publication is blocked until BadgerBots supplies protected code-signing credentials and the signed update/rollback path is tested.

## Evidence

Tauri documents NSIS and MSI targets, notes MSI is Windows-built, and describes macOS/Linux cross-compilation as a last resort: <https://v2.tauri.app/distribute/windows-installer/>.
