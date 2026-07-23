# Local development

## Pinned prerequisites

- Node.js 24.18.0 LTS (Node 26 is accepted only for Checkpoint 0 discovery)
- pnpm 11.16.0
- Git 2.55 or compatible
- Rust 1.96.1 when desktop work starts
- Java 21 when the Minecraft spike starts
- Docker-compatible container runtime or an owner-authorized disposable PostgreSQL/Supabase environment for Checkpoint 2 migration execution

Use `.node-version`, `.tool-versions`, and `rust-toolchain.toml` with the version manager appropriate to the workstation. The repository never modifies global runtimes.

## Bootstrap

```sh
./scripts/bootstrap.sh
```

The command checks Node/pnpm, installs exactly `pnpm-lock.yaml`, then runs formatting, lint, metadata, unit, and secret checks. It does not start services, create accounts, download Paper/worlds, or contact production systems.

Copy `.env.example` to `.env.local` only when an application needs it. Replace placeholder local secrets with random development-only values. Production secrets belong in the chosen provider's protected secret store and must never be copied into this repository.

## Common checks

```sh
pnpm format
pnpm verify
pnpm build
```

Current limitations: Docker/PostgreSQL/Supabase CLI are absent on the development Mac, so Checkpoint 2 migration and RLS tests are static/local only. Paper/Tauri/Gradle projects intentionally begin in later checkpoints, and Windows remains the required installer/Minecraft evidence platform.
