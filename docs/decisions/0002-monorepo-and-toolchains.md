# ADR 0002: Monorepo, build tooling, and pinned toolchains

Status: accepted on 2026-07-22.

## Context

Web and desktop frontends share TypeScript contracts while Rust and Java have independent native build ecosystems. The scaffold already names pnpm, Turborepo, Cargo, and Gradle boundaries.

## Decision

- Use one pnpm workspace and Turborepo task graph for TypeScript applications, packages, repository tools, and orchestration.
- Keep Rust crates in a Cargo workspace once Tauri applications are scaffolded and Minecraft modules in a Gradle wrapper build once the version spike is accepted. Turbo may invoke those builds but does not replace their native lockfiles.
- Pin Node.js 24.18.0 LTS in `.node-version` and CI; allow Node 26 only as a temporary local discovery environment. Pin pnpm 11.16.0 and exact root dev dependencies in `package.json`/`pnpm-lock.yaml`.
- Pin Rust 1.96.1 for the future Tauri workspace. The Java runtime remains Java 21 for the Paper 1.21 candidate; an exact managed JDK distribution/checksum is deferred until ADR 0007 passes.
- Use strict TypeScript, ESLint, Prettier, Node's test runner for repository checks, and deterministic metadata/secret checks. Each implementation package must add its own `check`, `build`, and `test` tasks.

## Consequences

The JavaScript dependency graph and CI runtime are reproducible. Native lockfiles remain authoritative within their ecosystems. Local Node 26 is not evidence that production should use a Current release.

## Evidence

- Node lists version 24 as LTS and recommends production applications use Active or Maintenance LTS: <https://nodejs.org/en/about/previous-releases>
- Exact package versions were resolved from the npm registry on 2026-07-22.
