# Checkpoint 8: curriculum authoring foundation

Status: local implementation slice complete. Full curriculum transcription/publication is not
claimed.

## Genuinely working

- Versioned structured documents for track -> project/day -> chapter -> step -> instructional
  block group.
- Source and asset provenance states with verified ownership/license/checksum evidence.
- Fixed full-library toolbox policy with suggested block groups that cannot restrict access.
- Flexible structural, runtime, and manual benchmarks without exact-layout matching.
- Canonical Sheep City starter-program validation through the program model.
- Provider-neutral immutable revision history, explicit optimistic conflicts, preview,
  duplication provenance, review/reopen, and owner-only publication.
- Publication fails closed for missing/unverified source references, assets, starter programs,
  and world templates.
- A responsive `/curriculum` instructor lab with functional local lifecycle controls and explicit
  in-memory/source-pending labels.

No detailed lesson prose, screenshots, maps, or third-party material was added.

## Automated and browser evidence

- Focused curriculum tests cover source gating, revisions, conflicts, permissions, publication,
  duplication, tolerant benchmarks, full-library policy, and invalid starter programs.
- The production Next.js build statically generates `/` and `/curriculum`.
- Browser verification exercised draft save, review, blocked publication, duplication, navigation
  back to the block editor, a 760-pixel responsive viewport, and browser console errors.
- `pnpm verify` passed locally on 2026-07-23: formatting, metadata, 20 workspace type/build
  tasks, lint, 113 Vitest assertions, five Rust unit tests, the Java runtime core self-test,
  three repository-tool tests, and secret scanning.

## Migrations and configuration

No database migration is added in this slice. Existing `curriculum_versions` and
`curriculum_projects` JSONB storage can represent immutable document snapshots, but no provider
RPC/policy is claimed. The local service and UI are deliberately in memory until authenticated
owner/assistant authorization and atomic persistence are implemented together.

## Security and privacy

- Publication authority is owner-only in the domain contract.
- Audit events omit lesson bodies, starter programs, child data, and credentials.
- Strict schemas reject undeclared block-allowlist or exact-layout fields.
- Source verification represents a human ownership decision; software does not infer rights.
- The browser lab is explicitly local proof, not real authentication.

## Manual verification

1. Run `npx --yes pnpm@11.16.0 --filter @badgerbots/web dev`.
2. Open `http://localhost:3000/curriculum`.
3. Edit directions and save; revision and snapshot counts increase.
4. Submit for review; editing becomes disabled.
5. Try to publish; the unverified source and world are reported and state remains `in-review`.
6. Reopen to resume editing.
7. Duplicate; the copy starts at draft revision 1 with its content preserved.
8. Follow the Block editor link and confirm the existing editor remains operational.

## Acceptance mapping

| Later-checkpoint requirement          | Local evidence                                    | Remaining gate                              |
| ------------------------------------- | ------------------------------------------------- | ------------------------------------------- |
| Versioned structured curriculum       | Strict schema and immutable snapshots             | Provider persistence and full source intake |
| Preview, duplicate, revision, publish | Domain tests and functional local browser lab     | Authenticated multi-user UI                 |
| Visual starter code                   | Canonical starter validation                      | Blockly authoring surface                   |
| Flexible benchmarks                   | Structural/runtime/manual discriminated contracts | Runtime observation integration             |
| Asset provenance                      | Verified source/license/checksum publication gate | Owner-supplied assets and review            |
| Full curriculum tracks                | Source-gated track manifests only                 | Owned PDFs are still absent                 |

## Unresolved issues and next work

- BadgerBots-owned source PDFs must be supplied and reviewed before transcription.
- An original or licensed Sheep City world with provenance is still required.
- Provider-backed authoring needs owner/assistant RLS, atomic revision RPCs, and adversarial tests.
- Images and visual starter workspaces need managed upload, checksum, preview, backup, and
  rollback behavior.
- Checkpoints 2, 3, 6, and 7 retain their real provider/Paper/Windows acceptance gaps.
