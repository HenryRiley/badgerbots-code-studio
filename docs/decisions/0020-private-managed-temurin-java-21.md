# ADR 0020: private managed Temurin Java 21

- Status: Accepted for the Windows x64 internal prototype
- Date: 2026-07-27
- Supersedes: the external system-Java decision in ADR 0015

## Context

BadgerBots Host previously discovered `java` through the Windows process search path. That made a
teacher responsible for installing the right Java version and allowed a later PATH or global Java
change to alter which executable launched Paper. It also made repair a command-line task.

The Host needs a no-cost Java 21 runtime whose exact Windows artifact and redistribution terms can
be recorded. Setup must not run a vendor MSI or change system Java, the registry, `JAVA_HOME`, or
PATH.

## Decision

Host 0.8.0 pins the Eclipse Temurin JRE 21.0.11+10 Windows x64 ZIP:

- artifact:
  `OpenJDK21U-jre_x64_windows_hotspot_21.0.11_10.zip`
- immutable release:
  <https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.11%2B10>
- download:
  <https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.11%2B10/OpenJDK21U-jre_x64_windows_hotspot_21.0.11_10.zip>
- vendor SHA-256:
  `be26677aaa20b39a62edcaab4c8857a8b76673b0f45abc0b6143b142b62717e4`
- vendor checksum file:
  <https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.11%2B10/OpenJDK21U-jre_x64_windows_hotspot_21.0.11_10.zip.sha256.txt>

Eclipse Adoptium describes Temurin as open-source, TCK-tested runtime binaries and records OpenJDK
under GPL v2 with the Classpath Exception (and applicable Assembly Exception):
<https://adoptium.net/about/>. The ZIP carries its own legal notices inside the private runtime.
BadgerBots does not modify or remove those files.

During graphical setup, Host downloads at most 64 MiB, checks the complete archive SHA-256 before
extracting, rejects unsafe paths, links, multiple roots, more than 4,000 entries, and more than
256 MiB expanded data. It stages the runtime below Host's application-local
`minecraft-runtime/managed-java` directory, records every installed regular file's size and
SHA-256, verifies the complete tree, then atomically activates it. The archive is not run as an
installer.

Before every Paper start, the same preparation path verifies the private runtime. A missing,
changed, or unexpected file triggers a clean re-download and staged replacement. The graphical
**Verify & repair Java** control runs this check on demand and all download, verification,
installation, and repair progress is emitted to the Host UI.

`ServerLaunch` contains the verified private `bin/java.exe` path. Both the readiness test and
long-running Paper supervisor create the process from that exact path. They never resolve `java`
through PATH. Windows' global Java installation, `JAVA_HOME`, registry, and file associations are
not read or changed. Host also removes inherited Java option and classpath environment variables
from the child process so machine-wide developer settings cannot inject flags into classroom
Paper.

## Consequences

- A network connection is required for first Java/Paper setup and for repair when the private copy
  is missing or damaged.
- The Java archive adds about 49 MB of download and roughly the extracted JRE size under the
  BadgerBots application-data directory, but does not enlarge the NSIS installer itself.
- The current pin supports Windows x64 only. Windows ARM64 needs a separate recorded artifact and
  checksum before support can be claimed.
- Updating Java is a source change with a new artifact URL, checksum, license review, Windows CI
  build, and physical smoke test; Host never follows an unpinned "latest" URL.
- Code signing, update-manifest authentication, firewall cleanup, and uninstall removal evidence
  remain separate release gates.
