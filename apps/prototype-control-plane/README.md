# Connected prototype control plane

Checkpoint 9 connects the existing control-plane, canonical program compiler, signed runtime
protocol, and atomic headless Host runtime through a loopback-only HTTP service.

It is intentionally a developer prototype:

- it binds only to `127.0.0.1`;
- each browser lab receives a random, memory-only bearer token;
- state disappears when the service stops;
- only an allowlisted local Web origin may call it;
- request bodies and request rates are bounded;
- the Host side verifies signed, scoped, expiring commands before deployment.

It does not represent deployed cloud authentication or real Paper execution.

Start it alongside Code Studio Web:

```sh
npx --yes pnpm@11.16.0 --filter @badgerbots/prototype-control-plane dev
npx --yes pnpm@11.16.0 --filter @badgerbots/web dev
```

Open <http://127.0.0.1:3000/prototype>. Do not expose port `4180` to the LAN or internet.
