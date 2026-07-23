# Repository tools

Checkpoint 0 repository-only checks. They use Node APIs and have no access to production systems.

- `preflight.mjs` checks local prerequisite versions without installing global software.
- `validate-metadata.mjs` validates required scaffold metadata and provenance fields.
- `secret-scan.mjs` rejects known credential formats and private keys while avoiding `.git`, dependencies, generated artifacts, and ignored binary source material.

The secret scanner is a deterministic baseline, not a substitute for provider-side secret detection, credential rotation, or repository-host protection rules.
