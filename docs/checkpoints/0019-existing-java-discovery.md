# Existing Java discovery slice

Status: implemented and automated locally on 2026-07-29; physical Windows 10 evidence remains
required.

Release candidate: BadgerBots Host 0.8.2.

## Working

- Host prefers an already-verified private runtime when one exists.
- Otherwise, graphical preparation scans standard Windows Java sources before downloading.
- Candidates must identify as 64-bit Java 21 in a hidden direct process.
- Host records the selected executable's canonical path and SHA-256 and verifies both before every
  Paper launch.
- A missing, incompatible, or changed candidate fails closed. Graphical repair scans again and
  falls back to the pinned private Temurin runtime when needed.
- Host never alters or uninstalls an existing Java installation.
- Setup and runtime wording no longer promises a duplicate private install when a compatible
  runtime is already available.

## Automated evidence

- Rust unit tests cover strict Java-major parsing and unordered Java property parsing.
- Existing private-runtime archive safety and damage-detection tests remain in place.
- Host TypeScript, Rust, formatting, lint, repository, installer, and Windows bootstrap checks
  remain release gates.

## Manual Windows 10 verification

1. On a disposable Windows 10 x64 computer with Java 21 installed, record the result of
   `where.exe java` for evidence only.
2. Remove any prior BadgerBots `managed-java` application-data folder, then run graphical
   **Install verified server files**.
3. Confirm the in-app progress says it is looking for existing Java and then reports that no
   duplicate runtime was installed.
4. Confirm `managed-java/existing-java.json` exists while the versioned private Temurin directory
   does not.
5. Start Paper and confirm no Command Prompt appears and Sheep City loads.
6. Stop Paper, rename the external Java folder, and try Start. Confirm Host refuses the changed
   runtime with a friendly repair instruction.
7. Select **Verify & repair Java**. With no other Java 21 candidate available, confirm Host
   downloads, verifies, and privately installs the pinned fallback entirely in the app.
8. Restore the external Java folder. Confirm Host never changed its files, PATH, registry entries,
   or Windows Java associations.
9. Repeat on a clean system with Java 17 only. Confirm Java 17 is rejected and the pinned Java 21
   fallback installs.

## Remaining release evidence

- Record the physical Windows 10 results above.
- Code signing, authenticated application updates, and uninstall cleanup are still separate release
  gates.
