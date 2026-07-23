# ADR 0007: Minecraft, Paper, Java, and client-mod version spike

Status: proposed on 2026-07-22. This is a spike candidate, not a supported release declaration.

## Candidate

- Minecraft Java Edition 1.21.11 protocol/world format.
- Latest stable Paper build for exactly 1.21.11, resolved through Paper's downloads API and pinned by build identifier plus SHA-256 in the release manifest.
- Java 21 managed runtime for Paper/plugin and client profile; never replace system Java.
- Fabric loader/API for the optional lightweight client mod, pinned to versions explicitly compatible with 1.21.11.
- Gradle Wrapper with Java toolchains; Paper API and Fabric Loom remain in separate modules. All Paper/Minecraft-specific calls stay behind `minecraft/version-adapter`.
- Prism Launcher is the primary managed-profile target; MultiMC compatibility is tested but not assumed from Prism results.

## Why not Minecraft 26.x yet

Paper's current documentation says 26.1+ requires Java 25, while Paper 1.20 through 1.21.11 uses Java 21. The newest line adds a newer runtime and less classroom/plug-in soak time without a Sheep City requirement that needs it. The conservative 1.21.11 candidate remains modern and aligns with Prism's documented Java 21 path for Minecraft 1.20.5 and above.

## Acceptance gate for Checkpoint 3

Before changing this ADR to accepted, record exact Paper/Fabric/Gradle/JDK builds and checksums; verify Paper API, Fabric mappings, Prism and MultiMC profile launch, original template load/reset, plugin hot deployment, Java licensing/redistribution, Windows 10 x64 launch, and a real server smoke test. If stable Paper artifacts or compatible Fabric tooling are unavailable, choose the newest mutually supported Java 21 version and record the change in a superseding ADR.

## Evidence

- Paper Java/version table and server requirements: <https://docs.papermc.io/paper/getting-started/>
- Paper stable-build download guidance: <https://docs.papermc.io/misc/downloads-service/>
- Prism Java selection guidance: <https://prismlauncher.org/wiki/getting-started/installing-java/>
- Fabric's newest 26.1 development line requires JDK 25, confirming that it is a distinct upgrade boundary: <https://docs.fabricmc.net/develop/getting-started/setting-up>
