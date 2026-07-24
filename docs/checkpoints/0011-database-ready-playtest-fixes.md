# Checkpoint 11: database-ready playable prototype

Status: implementation complete; Windows retest required

## Working

- The Paper plugin gives each joining player an idempotent Sheep City test kit: bow, arrows, iron
  sword, and food. Operator access is not required for the lesson loop.
- An explicitly configured teacher Minecraft username receives operator status for the prototype
  run; other players do not. The dedicated generated server clears its prototype operator list at
  every launch, including after an interrupted previous run.
- Fall damage is cancelled only inside Sheep City.
- Paper owns `PlayerRespawnEvent` and routes respawning players to Sheep City with their test kit.
- Random control-plane identifiers are database-compatible UUIDs while remaining branded opaque
  types in application code.
- The local prototype can optionally write its real organizations, locations, instructor,
  membership, session, camper, canonical workspace, and program-version state to Supabase.
- Program saves use a row lock, optimistic revision check, idempotency key, and caller-generated
  version UUID in one PostgreSQL function. Failed durable joins/saves roll back the corresponding
  in-memory mutation.
- The browser status card identifies `memory` or `supabase` persistence and whether the latest
  authoritative operation synchronized.

## Evidence from the owner

On a real Windows/Paper run before these fixes:

- the server launched and the Minecraft client joined Sheep City;
- the modular `getMaterialUnder(player) == GOLD_BLOCK` condition executed the jump behavior;
- the missing equipment and incorrect vanilla-world respawn were reproduced.

This is valuable real-runtime evidence, but the equipment and respawn fixes still require the
manual retest below.

The updated Paper plugin passed `./gradlew --no-daemon check` and assembled with SHA-256
`353688aae2a692a60adfafcfc1259fc7dafe9c9232f13c949dfb4f6e4b9b1ef8`.

## Manual Windows retest

1. Pull this branch, optionally set `BADGERBOTS_TEACHER_MINECRAFT_USERNAME` to the teacher's exact
   Java username, and restart `prototype:minecraft` so the plugin JAR is rebuilt.
2. Join without operator status. Confirm bow, 64 arrows, iron sword, and food appear.
   If the configured teacher joins, confirm only that account is an operator.
3. Run the completed program and shoot the archery target.
4. Walk repeatedly onto gold and confirm no fall damage is taken.
5. Die from a non-fall source and click Respawn. Confirm you return to the Sheep City plaza with
   the test kit, not the vanilla world.
6. Stop the program and confirm the programmed behaviors stop.

## Database verification

Database setup remains optional and costs $0 within the documented pilot guardrails. Follow
`docs/playable-paper-prototype.md`. A successful test shows `supabase · synced` and creates compact
normalized rows. The service-role credential remains only in the Node control-plane process.

## Security and privacy

- No operator permission is granted to campers.
- Fall protection is scoped to the Sheep City world.
- The database adapter stores hashed class/access credentials, never the plaintext class code or
  camper access token.
- The service-role key is server-only. The local prototype API remains loopback-only.
- No external Supabase project or paid resource was created by Codex.

## Known limits / next prototype work

- The local lab bearer token and runtime connection are not restored after the Node process
  restarts, even though canonical database rows survive.
- Realtime subscriptions and two-device conflict testing are not connected yet.
- Each lab still supports one student and one generated world.
- Host and Connect installers do not yet own the playable server lifecycle.

The next working-prototype increment is durable lab recovery plus Supabase Realtime workspace
notifications and explicit student/instructor conflict handling.
