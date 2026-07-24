# Connected local prototype

Checkpoint 9 is the first executable connection across previously separate product layers:

```text
Code Studio Web
  -> loopback control plane
  -> canonical program validation and immutable revision
  -> signed, scoped, expiring cloud-to-Host envelope
  -> Host verification and atomic runtime deployment
  -> attributed headless Sheep City actions
  -> signed Host acknowledgement
```

It intentionally stops at the Paper boundary. The runtime adapter records the exact Minecraft API
intent and canonical AST node attribution, but it does not claim that a Paper server performed the
action.

## Run

Use the pinned package manager without installing pnpm globally:

```sh
npx --yes pnpm@11.16.0 install --frozen-lockfile
npx --yes pnpm@11.16.0 prototype
```

Open <http://127.0.0.1:3000/prototype>. Use `127.0.0.1`, not a LAN address, because the prototype
control plane rejects non-loopback Web origins.

## Manual workflow

1. Create a local camp session. The class code is random on every process run.
2. Join using first name and one last initial.
3. Either synchronize the block editor's last runnable local save or load the completed Sheep City
   test program.
4. Save the canonical program and Run it through the signed Host channel.
5. Prove that an intentionally over-limit replacement is rejected while the last good version
   remains active.
6. Fire `projectileHit()`, `playerMove(GOLD_BLOCK)`, `onSheepSpawn()`, and `onSheepDeath()`.
7. Inspect both signed-delivery results and AST-attributed runtime actions.
8. Stop the scope and confirm all event buttons lock.

## Security boundary

- The service binds to `127.0.0.1:4180` only.
- Only Code Studio origins on loopback ports 3000 and 4173 are accepted.
- Each lab gets a random 256-bit bearer token held only in React state.
- At most eight labs exist for four hours; each IP is limited to 120 requests per minute.
- JSON bodies are limited to 512 KB.
- The server does not log tokens, join codes, names, programs, or event bodies.
- All state is memory-only and disappears on shutdown.

Do not expose port 4180, use this with real child data, or treat it as production authentication.

## Remaining real-product path

1. Replace memory storage with tested provider-backed PostgreSQL and real instructor/camper
   authentication.
2. Move the Host verifier and durable replay/command queue into the native Windows Host.
3. Connect the verified Host command to the compiled Paper plugin through a local authenticated
   transport.
4. Create and validate the original Sheep City world, then execute the full Windows/Paper journey.
