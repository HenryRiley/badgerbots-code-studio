# Checkpoint 12: durable session recovery and synchronized browser state

Status: implementation complete; live Supabase validation required

## Working

- The browser retains the random lab token locally, removes it from use after expiration, and
  automatically recovers the authenticated lab after refresh.
- Authenticated browser tabs poll the loopback control plane every 2.5 seconds and adopt newer
  change sequences. A stale save receives an explicit revision conflict, refreshes the visible
  server revision, and asks the user to review before retrying.
- Supabase mode writes an encrypted, authenticated recovery envelope with a four-hour expiry.
  The lookup key is an HMAC digest of the bearer token; neither the raw token nor plaintext camper
  identity, access credential, class code, or program appears in the recovery table.
- Recovery reconstructs the canonical workspace, version history, camper authorization hash
  context, and revision. Runtime state deliberately recovers stopped so code is never redeployed
  merely because a process restarted.
- Memory mode implements the same recovery contract for automated tests without requiring an
  external account, but it does not survive a process restart.

## Automated evidence

- Recovery tests restore an acknowledged workspace and successfully authorize the next optimistic
  save.
- Encryption tests prove the stored payload omits plaintext identity and uses only a 64-character
  token digest.
- Migration tests verify RLS, anonymous/authenticated revocation, expiry bounds, and service-role
  function grants.

## Security and privacy

- `SUPABASE_SERVICE_ROLE_KEY` and `BADGERBOTS_PROTOTYPE_RECOVERY_SECRET` remain server-only.
- AES-256-GCM provides confidentiality and tamper detection for recovery payloads.
- Recovery expires after four hours and expired rows are cleaned during writes.
- Browser polling uses the existing Authorization header; the bearer token is not placed in a URL,
  query string, log, or realtime channel name.
- This local prototype still must not be exposed directly to the LAN or public Internet.

## Manual validation still required

The owner has not created a Supabase project, so no live database claim is made. When ready, follow
`docs/playable-paper-prototype.md`, apply migrations through the documented migration workflow,
then verify `supabase · synced`, browser refresh, API restart recovery, and stale two-tab conflict
handling.

## Next prototype increment

- Replace polling with authenticated Supabase Broadcast after instructor/camper JWT claims and
  channel authorization policies exist.
- Add an instructor editing surface that displays the incoming canonical program and offers
  explicit keep-local, accept-remote, and merge/retry choices.
- Move the recovery cache and lifecycle into the native Host rather than the developer launcher.
