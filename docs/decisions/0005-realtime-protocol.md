# ADR 0005: Realtime protocol

Status: accepted on 2026-07-22.

## Decision

- Browsers and each Host connect to the cloud control plane over authenticated TLS WebSockets. Hosts initiate outbound connections; the cloud never opens an inbound teacher-laptop port.
- Use versioned JSON envelopes initially. Every command has a UUID, protocol version, tenant/session/target identifiers, issued/expiry time, monotonic target sequence, correlation ID, and acknowledgement state.
- Persist commands and acknowledgements in PostgreSQL before delivery. A unique `(target_id, command_id)` constraint provides idempotency. Reconnect resumes from the last acknowledged sequence.
- Host commands are additionally authenticated with a rotated pairing credential and signed payload context. Reject expired, replayed, cross-session, cross-world, and unknown-host messages.
- The Host keeps a bounded durable local queue/cache for brief cloud interruption. Program activation remains a Host/plugin atomic operation; realtime delivery never makes an unvalidated program active.
- Do not add Redis or a message broker for the initial single-process deployment. Add a PostgreSQL-backed fan-out or broker only after multiple application replicas are measured and required.

## Consequences

Autosave concurrency still uses durable optimistic version checks; WebSocket arrival order is not treated as database truth. The protocol can later move to binary encoding without changing its identifiers or idempotency semantics.
