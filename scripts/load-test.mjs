import { ColyseusSDK } from "@colyseus/sdk";

const serverUrl = process.env.SERVER_URL || "ws://127.0.0.1:2567";
const botCount = Math.max(2, Math.min(1000, Number(process.env.BOTS) || 200));
const durationMs = Math.max(1000, Number(process.env.DURATION_MS) || 10_000);
const sdk = new ColyseusSDK(serverUrl);
const rooms = new Map();

function packet(seq, phase) {
  const bytes = new Uint8Array(12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, seq, true);
  view.setUint8(4, phase % 240 < 120 ? 1 : 2);
  view.setInt16(5, Math.round(Math.sin(phase / 120) * 10_000), true);
  view.setUint16(9, 1, true);
  return bytes;
}

console.log(`Connecting ${botCount} bots to ${serverUrl}...`);
for (let index = 0; index < botCount; index++) {
  const room = await sdk.joinOrCreate("blockrush", {
    public: true,
    map: "foundry",
    mode: "ffa",
    name: `BOT${index}`
  });
  const group = rooms.get(room.roomId) || [];
  group.push(room);
  rooms.set(room.roomId, group);
}

for (const group of rooms.values()) {
  if (group.length > 1) await group[0].request("start", {});
}

let seq = 0;
const interval = setInterval(() => {
  seq++;
  for (const group of rooms.values()) {
    for (const room of group) room.send("i", packet(seq, seq));
  }
}, 1000 / 60);

await new Promise(resolve => setTimeout(resolve, durationMs));
clearInterval(interval);

const metricsUrl = serverUrl.replace(/^ws/, "http").replace(/\/$/, "") + "/metrics";
const metrics = await fetch(metricsUrl).then(response => response.json());
console.log(JSON.stringify({ bots: botCount, rooms: rooms.size, durationMs, metrics }, null, 2));
await Promise.all([...rooms.values()].flat().map(room => room.leave()));
if (metrics.tickP95Ms >= metrics.tickBudgetMs) process.exitCode = 1;
