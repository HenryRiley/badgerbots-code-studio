# ADR 0015: Host artifact and firewall boundary

- Status: Accepted for the internal prototype
- Date: 2026-07-25

## Context

The graphical Host can create server settings, but a teacher still cannot obtain the Paper server
or approve local Minecraft traffic without developer commands. Downloads and privileged firewall
changes are supply-chain and operating-system trust boundaries.

## Decision

The internal Host pins Paper 1.21.11 build 132 by immutable object URL and SHA-256. It sends the
identifying User-Agent required by PaperMC, caps the response at 80 MiB, validates both checksum
and JAR shape, and uses atomic replacement. A failed or unexpected response never replaces a
previous verified file.

The BadgerBots plugin is built and tested from the checked-out commit on Windows CI, then embedded
in the Host installer. Host verifies the embedded bytes when copying them into its private plugin
directory and records their SHA-256. An installer built without the plugin fails closed with an
actionable error.

The prototype continues using an externally installed Java 21 runtime verified by version probe.
It records this differently from SHA-256-verified Paper/plugin artifacts. Selecting and verifying
a privately managed Java distribution remains a release gate.

Firewall approval is an explicit wizard action. On Windows, Host asks for UAC elevation and invokes
`netsh.exe` directly without PowerShell. The rule permits inbound TCP only on the configured
Minecraft port and only on networks Windows classifies as Private. It does not open a router,
public internet port, UDP rule, or all-network rule.

## Consequences

- Teachers can install verified server files and approve the local firewall from the app.
- The unsigned installer remains an internal prototype and does not establish supply-chain trust
  equivalent to code signing.
- Test-server launch, readiness observation, real world backup/restore, firewall removal during
  uninstall, and managed Java remain open.
