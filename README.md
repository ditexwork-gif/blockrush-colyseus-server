# BLOCKRUSH Colyseus server

Authoritative WebSocket room server for the public BLOCKRUSH browser game.

## Local verification

```bash
npm install
npm test
npm run build
```

## Colyseus Cloud deployment

```bash
npx @colyseus/cloud deploy
```

The first deployment opens Colyseus Cloud so the `blockrush-server` application can be selected. Keep the generated `.colyseus-cloud.json` private.
