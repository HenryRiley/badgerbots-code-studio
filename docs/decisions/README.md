# Architecture decision log

Decisions are immutable records. Supersede an accepted decision with a new ADR instead of rewriting its outcome. A `proposed` status means implementation must not treat the choice as release-ready.

| ADR                                                       | Status     | Decision                                                 |
| --------------------------------------------------------- | ---------- | -------------------------------------------------------- |
| [0001](0001-locked-product-decisions.md)                  | Accepted   | Locked product decisions                                 |
| [0002](0002-monorepo-and-toolchains.md)                   | Accepted   | Monorepo, build tooling, and pinned toolchains           |
| [0003](0003-control-plane-and-providers.md)               | Superseded | Rejected paid control-plane provider baseline            |
| [0004](0004-instructor-authentication.md)                 | Superseded | Replaced application-managed instructor authentication   |
| [0005](0005-realtime-protocol.md)                         | Accepted   | Outbound WebSocket realtime topology                     |
| [0006](0006-tauri-windows-packaging.md)                   | Accepted   | Tauri 2 Windows packaging strategy                       |
| [0007](0007-minecraft-paper-client-toolchain.md)          | Proposed   | Minecraft, Paper, Java, and client-mod version spike     |
| [0008](0008-world-strategy-experiment.md)                 | Accepted   | World strategy experiment and abstraction boundary       |
| [0009](0009-zero-cost-pilot-platform.md)                  | Accepted   | Zero-cost pilot hosting, data, auth, realtime, and email |
| [0010](0010-control-plane-security-boundaries.md)         | Accepted   | Control-plane security and provider boundaries           |
| [0011](0011-runtime-protocol-and-execution-scopes.md)     | Accepted   | Authenticated runtime protocol and execution scopes      |
| [0012](0012-connected-classroom-identity-and-edge-api.md) | Accepted   | Connected classroom identity, Realtime, and Edge API     |

The zero-cost provider decision is accepted for the one-camp pilot only and remains gated by capacity, recovery, privacy, and pre-camp readiness tests. The Minecraft decision remains proposed until its compatibility spike passes.
