# Checkpoint 23 — unified classroom workspace

## Genuinely working

- Students move directly from class-code join into one Sheep City page containing block search,
  Blockly, save state, a prominent Run button, and a slide-out classroom control drawer.
- The drawer exposes Run, Stop, runtime/revision state, latest activity, help, and sign-out without
  requiring a separate student dashboard.
- Instructor edits autosave as attributed canonical revisions. An unchanged student editor accepts
  the new revision through Realtime or the ten-second fallback and displays an explicit
  confirmation. Unsynced student changes are preserved and reported as a conflict.
- Assigned instructors can reveal the same weekly class code repeatedly. Codes are derived from
  the existing protected credential pepper and session ID; the database continues to store only a
  digest. Revealing a legacy session code safely rotates that session to its stable derived code.
- Instructor setup is collapsed until needed, class-code access is prominent, redundant manual
  push/sync controls are removed, and previously unstyled primary/secondary buttons now use the
  BadgerBots design system.

## Automated and visual evidence

- Web tests cover accepting an instructor revision and preserving a changed local program.
- Edge tests cover deterministic, distinct, unambiguous class codes; six Edge tests pass.
- Web TypeScript, lint, and nine focused Web tests pass.
- Classroom landing and editor were rendered and inspected at desktop size; navigation, hierarchy,
  form styling, block workspace, status, and responsive constraints remain intact.

## Configuration and deployment

- No database migration is required.
- Run **Deploy Supabase production** to deploy the new `session_join_code` and `workspace_state`
  actions.
- Then run **Deploy classroom Web to Apache** to publish the unified UI.

## Security/privacy and limitations

- Join codes are retrievable only after assigned-instructor authorization. The raw code is not
  stored and is never written to audit events.
- Remote code never replaces a locally changed program. The UI reports that the incoming revision
  is waiting; a complete interactive merge UI remains future work.
- Physical two-browser, Host, and Minecraft verification remains required after deployment.
