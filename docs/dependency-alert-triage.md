# Dependency alert triage

Reviewed 2026-07-23 against the four open GitHub Dependabot alerts.

| Alert               | Package   | Severity | Disposition                                                                                                                                                                                                                                                                                                                         |
| ------------------- | --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GHSA-6g55-p6wh-862q | `postcss` | high     | Remediated on the Checkpoint 6 branch by overriding Next.js's build-time dependency to 8.5.21. Production web build passes.                                                                                                                                                                                                         |
| GHSA-qx2v-qp2m-jg93 | `postcss` | medium   | Remediated by the same 8.5.21 override.                                                                                                                                                                                                                                                                                             |
| GHSA-f88m-g3jw-g9cj | `sharp`   | high     | Remediated on the Checkpoint 6 branch by overriding Next.js's optional image/build dependency to 0.35.0. Static production build passes.                                                                                                                                                                                            |
| GHSA-wrw7-89jp-8q8g | `glib`    | medium   | Dismissed as a tolerable risk because it is not used in the supported product target. Tauri 2.11.5 pulls `gtk`/`glib` 0.18 only for Linux/BSD targets. BadgerBots Host and Connect ship for Windows, macOS is development-only, and application code does not call `VariantStrIter`. Revisit before any Linux desktop distribution. |

The npm overrides are temporary supply-chain controls. Remove them when a supported
Next.js release declares patched dependency ranges. Do not move to a prerelease solely
to remove an alert.

GitHub alerts evaluate the default branch. The three npm alerts remain visible until
the remediation branch is merged into `main` and Dependabot rescans the lockfile.
