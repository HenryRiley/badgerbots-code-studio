# Codex working agreement

Read `README.md`, `docs/product-requirements.md`, `docs/architecture/overview.md`, `docs/decisions/0001-locked-product-decisions.md`, and `prompts/INITIAL_CODEX_PROMPT.md` before implementation.

## Execution rules

1. Work checkpoint by checkpoint. Do not claim later phases are complete.
2. Start with discovery and version spikes; record evidence in `docs/decisions/`.
3. Keep Minecraft-version-specific code behind `minecraft/version-adapter`.
4. Treat the canonical AST as authoritative. Blockly, simplified Java, persistence, runtime serialization, and benchmarks all consume it.
5. Reject unsupported text syntax with a child-friendly explanation; never silently discard code.
6. Never execute arbitrary student Java, JavaScript, shell commands, reflection, file I/O, network I/O, threads, or imports.
7. Preserve the full searchable block library regardless of lesson progress.
8. Every new block requires AST, type, formatter, parser, runtime, validation, and round-trip tests.
9. Do not commit copyrighted third-party worlds or assets. Require `world-license.yaml` for imports.
10. Keep student identity minimal: weekly join code, first name, last initial, and device-to-Minecraft-account association.
11. Never hard-code instructor credentials. Seed accounts through a documented secure setup path.
12. Do not weaken authentication, authorization, rate limits, world isolation, or resource limits to make a demo pass.
13. Keep macOS development working, but validate installers and Minecraft networking on Windows.
14. Update docs, tests, migrations, manual verification, and unresolved risks with every checkpoint.

## Definition of done

A checkpoint is complete only when its scoped UI and controls work, automated tests pass, migrations are included, relevant security limits are enforced, docs are current, Windows verification steps are recorded, and no placeholder control is presented as functional.
