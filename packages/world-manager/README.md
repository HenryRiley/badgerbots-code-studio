# World manager

Checkpoint 3 immutable-template validation and atomic working-copy reset. A template is accepted only when its version, spawn, compact border, pre-generation flag, provenance review, safe content path, and deterministic SHA-256 all pass. Reset copies verified immutable content into a staging directory and atomically replaces only the explicitly named working instance.

The repository's Sheep City directory remains `asset-required`, so it intentionally fails readiness validation until an original world is created and checksummed.
