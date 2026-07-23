# Checkpoint 7 load simulator

This tool defines the deterministic 25-student Sheep City workload and analyzes metrics
captured from a real supported Windows/Paper Host. It does not generate or label synthetic
performance numbers as hardware evidence.

Generate the workload manifest:

```sh
pnpm --filter @badgerbots/load-simulator plan
```

After the Host/Paper probe has captured both strategies on the same machine, analyze them:

```sh
pnpm --filter @badgerbots/load-simulator exec badgerbots-load-simulator analyze \
  evidence/separate-worlds.json evidence/shared-instances.json
```

The evidence files must identify the exact commit, Windows version, CPU/RAM, Java/Paper
versions, artifact checksums, view/simulation distances, all phases, and every active-student
count from 0 through 25. Raw evidence must contain no camper names, usernames, IP addresses,
credentials, chat, or program bodies.

The evaluator prefers separate unloadable worlds only when they pass every candidate
threshold. It selects shared instances only if separate worlds fail and shared instances
pass. If neither passes, it returns a reduced enrollment result; it never recommends
silently combining privacy boundaries or weakening runtime limits.
