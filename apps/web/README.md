# Code Studio Web

Checkpoint 1 provides a statically exportable Next.js browser compiler harness. It renders the real Blockly Sheep City subset, keeps the complete implemented library searchable, exposes Player/Game/Sheep tabs, immediately acknowledges local saves, and gives a locally enabled instructor-only view of the restricted Java-style representation. Parse and validation results are shown in a compiler console.

The harness is deliberately labelled browser-only: Run produces an instruction-graph preview and never claims a Minecraft connection. Cloud identity, durable autosave/conflicts, dashboards, host status, and remote troubleshooting begin in later checkpoints.

Checkpoint 8 adds `/curriculum`, a clearly labelled in-memory instructor authoring lab. Draft
save, immutable revision history, review/reopen, duplication, preview, and publication validation
work locally. Publication intentionally fails while the source PDF and original world remain
unverified. It is not an authenticated dashboard or cloud-backed curriculum store.

Do not implement direct browser-to-teacher-host networking. The host maintains an authenticated outbound connection to the cloud control plane; Minecraft clients connect locally to the teacher laptop.
