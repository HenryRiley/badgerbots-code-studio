# ADR 0014: managed runtime directory and server configuration

- Status: Accepted
- Date: 2026-07-25

## Context

The installed Host could pair to a classroom and probe hardware, but its “Server configuration”
step was only a status label. Requiring teachers to run the prototype launcher or edit Paper files
would violate the product’s graphical-installation requirement and risks changing unrelated Java
or Minecraft installations.

## Decision

Host owns one application-local `minecraft-runtime` directory. The wizard collects only the exact
teacher Minecraft Java username, a non-privileged server port, a bounded heap allocation, and
explicit Minecraft EULA acceptance.

The native layer validates those values again, detects Java 21 without opening a Windows console,
and atomically writes an online-mode Paper configuration. It prepares separate plugin, bridge,
outbox, inbox, and backup directories. The username is configuration metadata, never an identifier
or path component.

This slice detects an existing Java 21 runtime. A later artifact-acquisition slice may install a
pinned, checksummed private Java runtime inside the managed directory, but must not replace the
user’s global Java installation.

## Consequences

- A teacher can complete server configuration and Minecraft mapping entirely in the Host UI.
- Reopening Host retains the completed steps and managed settings.
- Paper download, plugin acquisition, firewall approval, backup verification, and server lifecycle
  remain locked until separately implemented and tested.
- Accepting the EULA is explicit and cannot be inferred or silently preselected.
