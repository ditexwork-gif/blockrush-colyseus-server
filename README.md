# BLOCKRUSH Colyseus server

Authoritative WebSocket room server for the public BLOCKRUSH browser game.

- Fixed 60 Hz room simulation; clients send 12-byte inputs, never positions.
- One delta-encoded `@colyseus/schema` patch per client every 50 ms (20 Hz).
- Server-side shooting, ammunition, damage, scoring, respawn, and one-second rewind.
- Client RTT measured by a server challenge; rewind is server-selected and capped.
- Eight-player private rooms, compatible-room Quick Play, and 20-second reconnection.
- Colyseus Cloud's managed WebSocket transport plus `/health` and `/metrics`
  endpoints. The native uWebSockets package is reserved for self-hosting because
  the managed Cloud runtime does not load it reliably.

## Local verification

```bash
npm install
npm test
npm run build
```

Run the 200-client load test against a running server:

```bash
npm run build
node build/index.js
BOTS=200 SERVER_URL=ws://127.0.0.1:2567 npm run load-test
```

## Colyseus Cloud deployment

```bash
npx @colyseus/cloud deploy
```

The first deployment opens Colyseus Cloud so the `blockrush-server` application can be selected. Keep the generated `.colyseus-cloud.json` private.

Colyseus Cloud deploys every update pushed to the linked `main` branch. Deploy the
server before publishing a browser client that uses the binary/schema protocol.
