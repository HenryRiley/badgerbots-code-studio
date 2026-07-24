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
npx --yes pnpm@11.16.0 prototype:minecraft
```

The first launch downloads checksummed Paper build 132 into ignored `work/paper-prototype/`,
downloads the pinned Gradle distribution into ignored `work/gradle-home/`, compiles the plugin, and
starts Paper. Nothing replaces the machine's global Java or Minecraft configuration.

## Test the complete playable path

1. Wait for `Paper is ready`.
2. In Minecraft Java 1.21.11, add and join `127.0.0.1:25565`. A LAN student uses the teacher PC's
   local IPv4 address instead; Windows may ask for a private-network firewall approval.
3. Open `http://127.0.0.1:3000/prototype`.
4. Create the local camp session, join it, and save the completed Sheep City test program.
5. Click **Run through signed Host channel**. Run fails safely with a friendly message if no player
   is in the Sheep City world.
6. In Minecraft:
   - fire a bow at the red/white target; the bounded explosion occurs at impact;
   - walk from the lapis center onto the gold pad; the modular equality condition bounces you;
   - find the named red, fast sheep in the west pen and defeat it; it drops a gold ingot.
7. Click **Prove bad deployment keeps last good**, then repeat an in-game action. The valid program
   remains active.
8. Click **Stop and cancel scope**. Further event behavior stops.
9. Press Ctrl+C once in the terminal. The launcher asks Paper to save and stop cleanly.

## Current limits

- Local, memory-only control-plane state is lost at shutdown.
- This prototype targets the first player in one generated Sheep City world.
- The native Tauri Host does not yet own this lifecycle, so the developer command uses a terminal.
  The finished Windows Host must show the same logs inside the app and launch without a command
  prompt window.
- Real Windows, LAN, installer, client mapping, multi-device sync, and 25-student tests are still
  required.
