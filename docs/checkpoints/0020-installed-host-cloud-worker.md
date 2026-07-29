# Installed Host cloud worker slice

Status: implemented and automated locally on 2026-07-29; physical Windows 10 connected evidence
remains required.

Release candidate: BadgerBots Host 0.9.0.

## Working

- Starting the managed classroom server automatically starts an authenticated outbound cloud
  worker inside Host.
- The worker uses the pairing credential already protected by Windows and requires no repository,
  environment variables, Node.js, pnpm, or PowerShell on the teacher laptop.
- Signed cloud commands are checked for identity shape, sequence, issue/expiry window, HMAC, and
  payload limits before use.
- Sheep City AST v2 is independently validated and deterministically compiled to the Paper
  instruction graph.
- Host-to-Paper requests and responses use the fresh per-process 256-bit bridge secret.
- A bounded durable command/acknowledgement cache supports retries and survives Host restarts
  without storing credentials.
- Host shows Connecting, Online, Offline, accepted, and rejected status in its graphical server
  card. Secrets and child names are excluded from this status.
- Paper remains running during a cloud outage; the last-known-good program is retained.

## Automated evidence

- Rust tests cover HMAC compatibility, bounded durable acknowledgements, deterministic AST
  compilation, and invalid-range rejection.
- The existing Paper bridge, atomic runtime, Host lifecycle, artifact, backup, and redaction tests
  remain part of the workspace verification.

## Manual Windows 10 connected verification

1. Install Host 0.9.0 on the paired Windows 10 teacher laptop. Do not clone the repository.
2. Sign in, pair the Host, complete setup, and start the classroom server.
3. Confirm **Classroom cloud · Online** appears in Host and no Command Prompt window opens.
4. Join Sheep City in Minecraft and join the same active session from Web.
5. Change a valid student program and click Run. Within about five seconds, confirm Host reports
   the command accepted, Web reports accepted, and Minecraft behavior changes without a restart.
6. Send an invalid or conflicting deployment. Confirm it is rejected and the prior behavior keeps
   running.
7. Disconnect Wi-Fi. Confirm Host reports Offline while Paper stays running. Restore Wi-Fi and
   confirm it returns Online without re-pairing.
8. Click Stop in Web and confirm the student's handlers stop.
9. Stop Paper in Host and confirm cloud status becomes Stopped.
10. Restart Host and Paper, retry a queued command, and confirm it is acknowledged once.

## Security and privacy

The pairing token remains in the native protected store and request headers only. It is not
serialized into Host state, the durable acknowledgement file, UI events, or logs. Canonical
programs are accepted only through the authenticated queue and restricted compiler.

## Open release evidence

- Physical Windows 10 two-device network-loss/retry evidence.
- Replace the prototype's first-player/single-world bridge with explicit camper-to-player and
  working-world routing.
- Run the 25-student world-strategy benchmark before promising one private world per camper.
