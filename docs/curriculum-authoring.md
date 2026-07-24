# Curriculum authoring

Status: Checkpoint 8 local authoring contract. Authenticated provider persistence and source
transcription are not yet implemented.

## Source intake

1. Place only BadgerBots-owned or explicitly licensed source files in
   `curriculum/source-material/`.
2. Record the original filename and a stable page/slide locator.
3. Record whether the source is BadgerBots-owned, licensed third-party material, or a new
   original work.
4. A human owner reviews ownership evidence before changing the source state to `verified`.
5. Reject third-party screenshots, maps, prose, or interface artwork when distribution rights
   are unclear.

Do not put camper data, Microsoft credentials, passwords, or production secrets in curriculum
documents or provenance records.

## Authoring lifecycle

```text
draft -> in-review -> published
   ^          |
   |----------| reopen
```

- Draft saves require the current revision. Stale saves fail with an explicit conflict.
- Each successful save and lifecycle transition creates an immutable snapshot.
- Owners and assistants may draft, preview, duplicate, submit, and reopen.
- Only an owner may publish.
- Published snapshots cannot be edited. Duplicate one to create a new draft.
- Audit events contain opaque instructor/document IDs, action, revision, correlation ID, and
  timestamp—not curriculum bodies or child data.

## Publication gate

Publication is blocked unless:

- every source referenced by a step is verified with ownership evidence;
- every referenced asset is verified, checksummed, licensed, and attached to a verified source;
- every project points to a validated, checksummed world-template version;
- every starter program is a valid canonical BadgerBots AST;
- the document uses the fixed `complete-searchable-library` toolbox policy; and
- the document is currently in review and an owner performs the action.

The current Sheep City skeleton deliberately fails this gate because the source PDF and original
world asset are absent.

## Guidance and benchmarks

Instructional block groups are suggestions and highlights only. They never hide blocks.
Structural benchmarks use tolerant `contains-all` or `contains-any` node requirements rather
than exact serialized layouts. Runtime observations and instructor manual decisions may be
combined so alternate safe solutions can pass.

## Local verification

Run the web app and open `/curriculum`:

```sh
npx --yes pnpm@11.16.0 --filter @badgerbots/web dev
```

Save a revision, submit it for review, confirm publishing reports the missing source/world,
reopen it, and duplicate it. Refresh resets the lab because provider persistence is intentionally
not connected.
