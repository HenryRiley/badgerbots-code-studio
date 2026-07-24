# Playable Sheep City Paper prototype

This is the shortest current path from the Blockly editor to real Minecraft Java Edition. It is a
developer prototype, not the finished Host installer.

## Requirements

- Minecraft Java Edition 1.21.11.
- Java 21 available as `java`.
- At least 6 GB free RAM so Paper can use up to 4 GB.
- Internet access on first launch for the pinned Paper/Gradle dependencies.
- Read and accept the [Minecraft EULA](https://aka.ms/MinecraftEULA).

## Start on macOS or Linux

```sh
BADGERBOTS_ACCEPT_MINECRAFT_EULA=true npx --yes pnpm@11.16.0 prototype:minecraft
```

## Start on Windows PowerShell

```powershell
$env:BADGERBOTS_ACCEPT_MINECRAFT_EULA = "true"
corepack.cmd pnpm install --frozen-lockfile
corepack.cmd pnpm prototype:minecraft
```

For the teacher account to receive operator controls in this prototype run, set its exact Java
username before launching:

```powershell
$env:BADGERBOTS_TEACHER_MINECRAFT_USERNAME = "YourMinecraftName"
```

Only that exact username becomes an operator. Students get the lesson equipment without operator
access.

The first launch downloads checksummed Paper build 132 into ignored `work/paper-prototype/`,
downloads the pinned Gradle distribution into ignored `work/gradle-home/`, compiles the plugin, and
starts Paper. Nothing replaces the machine's global Java or Minecraft configuration.
The Windows commands reuse Corepack's repository-pinned pnpm; pnpm does not need to be installed
globally.

## Test the complete playable path

1. Wait for `Paper is ready`.
2. In Minecraft Java 1.21.11, add and join `127.0.0.1:25565`. A LAN student uses the teacher PC's
   local IPv4 address instead; Windows may ask for a private-network firewall approval.
3. Open `http://127.0.0.1:3000/prototype`.
4. Create the local camp session, join it, and save the completed Sheep City test program.
5. Click **Run through signed Host channel**. Run fails safely with a friendly message if no player
   is in the Sheep City world.
6. In Minecraft:
   - confirm the server supplied a bow, 64 arrows, an iron sword, and food without operator access;
   - fire a bow at the red/white target; the bounded explosion occurs at impact;
   - walk from the lapis center onto the gold pad; the modular equality condition bounces you;
   - find the named red, fast sheep in the west pen and defeat it; it drops a gold ingot.
   - use `/kill` only if you are already an operator, or take ordinary non-fall damage until you
     die; Respawn must return you to Sheep City. Fall damage is disabled in Sheep City.
7. Click **Prove bad deployment keeps last good**, then repeat an in-game action. The valid program
   remains active.
8. Click **Stop and cancel scope**. Further event behavior stops.
9. Press Ctrl+C once in the terminal. The launcher asks Paper to save and stop cleanly.

## Current limits

- The default local control-plane state is lost at shutdown. Optional Supabase persistence stores
  normalized session, camper, workspace, and atomic program-version rows, but restoring a browser
  lab after the local API process restarts is not implemented yet.
- This prototype targets the first player in one generated Sheep City world.
- The native Tauri Host does not yet own this lifecycle, so the developer command uses a terminal.
  The finished Windows Host must show the same logs inside the app and launch without a command
  prompt window.
- Real Windows, LAN, installer, client mapping, multi-device sync, and 25-student tests are still
  required.

## Optional Supabase Free persistence

This is optional; the Minecraft prototype does not need a database to run.

1. Create a Supabase Free project only when you are ready to test database persistence.
2. Apply, in order:
   `database/migrations/0001_control_plane_core.sql`,
   `database/providers/supabase/0002_supabase_security.sql`, and
   `database/migrations/0003_atomic_program_version_ids.sql`.
3. Set these only in the control-plane server environment:

   ```text
   BADGERBOTS_PROTOTYPE_PERSISTENCE=supabase
   BB_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
   ```

4. Start the prototype normally. Its status card must say `supabase · synced`.
5. In Supabase Table Editor, confirm rows appear in `sessions`, `campers`,
   `project_workspaces`, and `program_versions` as you create, join, and save.

Never place the service-role key in a browser variable, commit it, paste it into a screenshot, or
share it with students. This adapter does not make the current local API safe for public Internet
exposure.
