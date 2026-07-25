# Connected prototype control plane

The connected prototype joins the existing control-plane, canonical compiler, signed runtime
protocol, optional Supabase persistence, and headless or real Paper runtime through a loopback-only
HTTP service.

It is intentionally a developer prototype:

- it binds only to `127.0.0.1`;
- each browser lab receives a random bearer token that remains local and memory-only;
- memory mode state disappears when the service stops;
- optional Supabase mode durably stores normalized session/workspace/program rows, although the
  local bearer token is not restart-recoverable yet;
- only an allowlisted local Web origin may call it;
- request bodies and request rates are bounded;
- the Host side verifies signed, scoped, expiring commands before deployment.

It does not represent deployed cloud authentication. Paper mode performs real in-game execution.

When the dedicated Host ID/token, classroom API URL, and publishable key documented in
`docs/connected-classroom-setup.md` are present, the process also runs the Checkpoint 13 outbound
Host worker. It polls the deployed Edge API, verifies command HMAC, expiry, and sequence,
validates/compiles the canonical AST locally, delivers through the authenticated Paper bridge, and
acknowledges the durable database command. It opens no inbound port.

Start it alongside Code Studio Web:

```sh
npx --yes pnpm@11.16.0 --filter @badgerbots/prototype-control-plane dev
npx --yes pnpm@11.16.0 --filter @badgerbots/web dev
```

Open <http://127.0.0.1:3000/prototype>. Do not expose port `4180` to the LAN or internet.
For optional database configuration, see
[`docs/playable-paper-prototype.md`](../../docs/playable-paper-prototype.md).
