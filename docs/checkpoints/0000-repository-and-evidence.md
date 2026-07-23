# Checkpoint 0: Repository and evidence

Status: implementation complete locally on 2026-07-22; remote CI and physical Windows verification remain external evidence items.

## Discovery

- The starting directory was not a Git repository; local Git was initialized on branch `main`. No remote, commit, push, cloud resource, email, or deployment was created.
- The scaffold contained 35 project files plus macOS `.DS_Store` files. It had no source code, lockfile, migrations, installer projects, native builds, world archive, or application tests.
- No curriculum PDF/PPTX attachments were present. Detailed lesson transcription remains blocked.
- The Sheep City directory contains metadata and a pending license record only; it explicitly has no world asset.
- Local tools observed: macOS 27 arm64, Node 26.4.0 Current, pnpm 11.9.0, Rust/Cargo 1.96.1 from Homebrew, Oracle Java 21.0.9, Git 2.55. Docker, Gradle, Corepack, rustup, gitleaks, and yq were absent.

## Added in this checkpoint

- Exact JavaScript dependency declarations/lockfile, pinned CI/toolchain files, strict shared TypeScript config, formatting/linting, repository metadata tests, deterministic known-format secret scan, environment example, and a one-command bootstrap.
- Immutable-SHA GitHub Actions workflow with Linux verification and a Windows bootstrap smoke job.
- ADRs 0002-0008, risk register, requirements traceability, local development guidance, and Windows release strategy.
- Git repository metadata on local branch `main`.

After the initial report, the owner rejected the paid provider estimate. ADR 0009 now supersedes the Railway/Neon baseline with a $0 one-camp pilot on Cloudflare Pages Free, Supabase Free, and Resend Free. The free-tier capacity budget and new availability/backup risks are recorded; no provider resource was created.

## Scope boundaries

No application UI, AST, parser, database, Paper server/plugin, Minecraft map, Tauri application, or installer has been implemented. The Sheep City acceptance milestone is not started and is not claimed.

## External/manual evidence still required

- Push to an owner-authorized repository and observe both CI jobs.
- Install/use Node 24.18.0 and pnpm 11.16.0 locally, then run `./scripts/bootstrap.sh` from a clean clone.
- Run the same clean-clone bootstrap on Windows 10/11. This verifies tooling only, not installers or Minecraft.
- Supply and verify BadgerBots-owned curriculum sources before curriculum transcription.
- Complete ADR 0007's Paper/Fabric/Prism spike before Checkpoint 3 implementation.
