# Student Connect installer

The current Checkpoint 5 slice defines an unsigned per-user NSIS prototype. Per-user installation is intentional: Connect manages one Windows user's dedicated launcher profile and does not require machine-wide Java, firewall, launcher, or Minecraft changes.

The release executable uses the Windows GUI subsystem, so no Command Prompt window opens. The app itself provides redacted operational diagnostics.

CI may build an internal unsigned artifact with a SHA-256 manifest. SmartScreen warnings are expected until BadgerBots production signing exists. Installation, upgrade, repair, mapping preservation, managed-profile rollback, and uninstall still require a physical Windows matrix before acceptance.
