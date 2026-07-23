# Runtime protocol

Graph version 2 preserves generic `if`, equality, material-read, and material-constant operations as independent attributed instructions. Every instruction/expression carries its source node ID, and invalid or over-limit programs are refused before serialization.

Checkpoint 3 adds deterministic signed envelopes for cloud/Host/plugin channels, channel/recipient/full-scope binding, expiry, replay ordering, and authenticated idempotent retries. The Node adapter uses HMAC-SHA-256 with a 32-byte-or-longer pairing secret. Production secrets must be device-specific, rotated, and stored by the Host; never ship a shared key.

The headless interpreter implements atomic graph replacement, last-known-good retention, exact execution scopes, deterministic resource cancellation, source-node attribution, and Sheep City event limits. This is protocol/runtime-core evidence only. The replay ledger is in memory and the Paper adapter has not passed a real server smoke test, so neither transport durability nor Minecraft execution is claimed complete.
