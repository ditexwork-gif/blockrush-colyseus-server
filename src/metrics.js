const startedAt = Date.now();
const tickDurations = [];
const totals = { roomsCreated: 0, inputMessages: 0, rejectedMessages: 0 };
let activeRooms = 0;
let activePlayers = 0;

export function roomCreated() {
  activeRooms++;
  totals.roomsCreated++;
}

export function roomDisposed(playerCount = 0) {
  activeRooms = Math.max(0, activeRooms - 1);
  activePlayers = Math.max(0, activePlayers - playerCount);
}

export function playerJoined() {
  activePlayers++;
}

export function playerLeft() {
  activePlayers = Math.max(0, activePlayers - 1);
}

export function inputMessage(accepted) {
  totals.inputMessages++;
  if (!accepted) totals.rejectedMessages++;
}

export function recordTick(durationMs) {
  tickDurations.push(durationMs);
  if (tickDurations.length > 6000) tickDurations.shift();
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

export function metricsSnapshot() {
  return {
    ok: true,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    activeRooms,
    activePlayers,
    roomsCreated: totals.roomsCreated,
    inputMessages: totals.inputMessages,
    rejectedMessages: totals.rejectedMessages,
    tickSamples: tickDurations.length,
    tickP50Ms: Number(percentile(tickDurations, 0.5).toFixed(3)),
    tickP95Ms: Number(percentile(tickDurations, 0.95).toFixed(3)),
    tickP99Ms: Number(percentile(tickDurations, 0.99).toFixed(3)),
    tickBudgetMs: 8
  };
}
