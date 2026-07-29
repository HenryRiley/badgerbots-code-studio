# Checkpoint 21 — private player/world routing and capacity probe

## Genuinely working

- BadgerBots Connect opens the trusted Web classroom URL with its stable opaque device UUID.
- Camper join binds that device to the temporary enrollment. An assigned instructor can atomically
  map the device to one exact Minecraft Java username; mappings retain rename-safe history.
- The paired Host polls a signed, current-session route snapshot and forwards it over the
  authenticated local bridge. Paper accepts at most 25 unique camper/player routes.
- Run and Stop are resolved by organization, location, session, camper, project, exact username,
  and actual world. The former alphabetical-first-player shortcut is removed.
- Each mapped camper receives a deterministic persistent Sheep City working world. Death respawns
  there. Disconnect stops that camper's scopes, returns visitors, saves, checks occupancy, retries,
  and unloads safely. The teacher world is never part of private-world cleanup.
- Owners grant one-use visit approval with `/bbvisit allow <player>`; visitors use
  `/bbvisit join <owner>`. Visitors play but never acquire the owner's code/runtime scope.
- Host buttons run bounded separate-world and shared-instance Paper probes with 25 simulated
  camper scopes and exactly 80 samples. They measure working set on Windows, heap, CPU, Paper
  tick/TPS, chunk operations, Run latency, teacher scheduler delay, entities, and disk.

## Automated evidence

- `./gradlew --no-daemon check` — Paper compile, tests, and strict decoder proof passed.
- Web, Host, and Connect TypeScript checks passed.
- Host Rust Clippy passed with warnings denied.
- Connect Rust Clippy and four native tests passed.
- Deno format/lint/check and five Edge tests passed.
- The control-plane migration contract covers the atomic mapping function and service-role-only
  provider grant.

## Migrations and configuration

- Apply `database/migrations/0008_device_player_routing.sql`, then
  `database/providers/supabase/0009_device_player_routing_security.sql`, then redeploy
  `classroom-api`. The reviewed GitHub workflow performs this order.
- Set public GitHub repository variable `BADGERBOTS_WEB_URL` to the deployed HTTPS classroom URL
  before building Connect. It is not a secret.

## Windows verification

1. Install the new Host and Connect builds. Open Code Studio from Connect, join the active week,
   and assign that camper's exact Minecraft username in the instructor dashboard.
2. Start Host, join Minecraft with that username, and verify the private Sheep City welcome.
3. Run code, Stop it, die/respawn, reconnect, and confirm every action remains in that camper's
   world. Repeat concurrently with two distinct mapped usernames.
4. Approve and join a visit, then disconnect the owner. Verify the visitor returns to their own
   world and the console reports no unsafe unload.
5. In Host, run **Test 25 private worlds**, then **Test shared instances**. Wait for
   `BADGERBOTS_BENCHMARK_COMPLETE` each time and preserve both JSON paths. Do not run both at once.

## Security/privacy and limitations

- Device UUIDs and Minecraft usernames are operational identifiers; no Microsoft credentials are
  collected. Route snapshots contain no camper display names.
- Mapping replacement is transactional and restricted to assigned instructors through the Edge
  API. The portable migration revokes public execution before commit; the Supabase overlay grants
  only `service_role`, so a failed second migration remains closed.
- The benchmark exercises real Paper resources but simulates camper connections. It cannot prove
  Wi-Fi quality, launcher behavior, or 25 physical client sessions. The two Windows JSON files
  must be analyzed before selecting a production world strategy.
- Shared instances are benchmark candidates only. The implemented classroom routing continues to
  use separate unloadable worlds until physical evidence supports a strategy change.
