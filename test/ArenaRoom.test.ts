import assert from "node:assert/strict";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import appConfig from "../src/app.config.js";

const wait = (ms = 120) => new Promise(resolve => setTimeout(resolve, ms));
function inputPacket(seq: number, { forward = true, yaw = 0, pitch = 0, weapon = 0 } = {}) {
  const bytes = new Uint8Array(12), view = new DataView(bytes.buffer);
  view.setUint32(0, seq, true); view.setUint8(4, forward ? 1 : 0);
  view.setInt16(5, Math.round(yaw * 10000), true); view.setInt16(7, Math.round(pitch * 10000), true);
  view.setUint16(9, 1, true); view.setUint8(11, weapon); return bytes;
}
function firePacket(seq: number, tick: number, yaw = 0, pitch = 0, weapon = 0) {
  const bytes = new Uint8Array(13), view = new DataView(bytes.buffer);
  view.setUint32(0, seq, true); view.setUint32(4, tick, true);
  view.setInt16(8, Math.round(yaw * 10000), true); view.setInt16(10, Math.round(pitch * 10000), true);
  view.setUint8(12, weapon); return bytes;
}

describe("BLOCKRIFT realtime room", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  before(async () => { colyseus = await boot(appConfig); });
  after(async () => { await colyseus.shutdown(); });
  beforeEach(async () => { await colyseus.cleanup(); });

  it("creates a six-character room and starts only after a friend joins", async () => {
    const room = await colyseus.createRoom("blockrush", { map: "depot", mode: "tdm" });
    const host = await colyseus.connectTo(room, { name: "ALPHA" });
    assert.match(room.roomId, /^[A-Z2-9]{6}$/);

    const waiting = await host.request("snapshot", {});
    assert.equal(waiting.room.map, "depot");
    assert.equal(waiting.room.mode, "tdm");
    assert.equal(waiting.room.hostId, host.sessionId);
    await assert.rejects(host.request("start", {}), /Invite at least one friend/);

    const guest = await colyseus.connectTo(room, { name: "<BETA>" });
    const started = await host.request("start", {});
    assert.equal(started.room.phase, "playing");
    assert.equal(started.room.round, 1);
    assert.equal(started.room.players.length, 2);
    assert.notEqual(started.room.players[0].team, started.room.players[1].team);
    assert.equal(started.room.players.find((player: any) => player.id === guest.sessionId).name, "BETA");
  });

  it("packs authoritative state into one 20 Hz schema stream", async () => {
    const room: any = await colyseus.createRoom("blockrush", { map: "foundry", mode: "ffa", public: false });
    const host: any = await colyseus.connectTo(room, { name: "HOST" });
    assert.equal(room.maxClients, 8);
    assert.equal(room.patchRate, 1000, "waiting rooms use only a low-frequency heartbeat");
    const player = host.state.players.get(host.sessionId);
    assert.equal(typeof player.x, "number");
    assert.equal(typeof player.lastSeq, "number");
    assert.equal("pose" in player, false);
  });

  it("fills a compatible public room through Quick Play", async () => {
    const options = { map: "foundry", mode: "ffa", public: true, name: "QUICK" };
    const first: any = await colyseus.sdk.joinOrCreate("blockrush", options);
    await first.waitForInitialState();
    assert.ok(first.state.startsIn >= 11 && first.state.startsIn <= 12);
    const second: any = await colyseus.sdk.joinOrCreate("blockrush", { ...options, name: "SECOND" });
    await second.waitForInitialState();
    assert.equal(second.roomId, first.roomId);
    await wait(80);
    assert.equal(first.state.players.size, 6);
    assert.equal([...first.state.players.values()].filter((player: any) => player.bot).length, 4);
    assert.equal(first.state.phase, 1, "a second human immediately starts Quick Play");
    await second.leave();
    await wait(80);
    assert.equal(first.state.players.size, 6, "a bot fills a permanently vacated public seat");
    assert.equal(new Set([...first.state.players.keys()]).size, 6, "replacement bot ids stay unique");
  });

  it("exposes room and fixed-tick performance metrics", async () => {
    const room = await colyseus.createRoom("blockrush", { map: "foundry", mode: "ffa", public: false });
    await colyseus.connectTo(room, { name: "METRICS" });
    await wait();
    const response: any = await colyseus.http.get("/metrics");
    assert.equal(response.statusCode, 200);
    assert.ok(response.data.activeRooms >= 1);
    assert.ok(response.data.activePlayers >= 1);
    assert.ok(response.data.tickSamples > 0);
    assert.equal(response.data.tickBudgetMs, 8);
  });

  it("acknowledges batched predicted movement over the realtime connection", async () => {
    const room = await colyseus.createRoom("blockrush", { map: "foundry", mode: "ffa" });
    const host = await colyseus.connectTo(room, { name: "HOST" });
    await colyseus.connectTo(room, { name: "GUEST" });
    const started = await host.request("start", {});
    const self = started.room.players.find((player: any) => player.id === host.sessionId), before = self.pose.z;
    for (let seq = 1; seq <= 6; seq++) host.send("i", inputPacket(seq));
    await wait();
    const updated = await host.request("snapshot", {});
    assert.equal(updated.room.self.ackInput, 6);
    assert.ok(updated.room.players.find((player: any) => player.id === host.sessionId).pose.z < before);
  });

  it("drains a burst of inputs without leaving the client in permanent replay", async () => {
    const room: any = await colyseus.createRoom("blockrush", { map: "foundry", mode: "ffa" });
    const host = await colyseus.connectTo(room, { name: "HOST" });
    await colyseus.connectTo(room, { name: "GUEST" });
    await host.request("start", {});
    const player = room.arena.players.find((value: any) => value.id === host.sessionId);
    const before = player.pose.z;
    for (let seq = 1; seq <= 40; seq++) host.send("i", inputPacket(seq));
    player.hp = 60;
    await wait(500);
    const updated = await host.request("snapshot", {});
    assert.equal(updated.room.self.ackInput, 40);
    assert.equal(player.pendingInputs.length, 0);
    assert.ok(player.pose.z < before, "taking damage does not stop authoritative movement");
  });

  it("holds a dropped player's seat and neutralizes movement during reconnection", async () => {
    const room: any = await colyseus.createRoom("blockrush", { map: "foundry", mode: "ffa" });
    const host: any = await colyseus.connectTo(room, { name: "HOST" });
    const player = room.arena.players.find((value: any) => value.id === host.sessionId);
    player.pendingInputs.push({ seq: 1 });
    player.pendingFires.push({ seq: 1 });
    player.lastInput = { ...player.lastInput, fwd:1, right:1, sprint:true, aiming:true };
    let seconds = 0;
    room.allowReconnection = async (_client: any, duration: number) => { seconds = duration; };
    room.onDrop(host);
    assert.equal(seconds, 20);
    assert.equal(player.pendingInputs.length, 0);
    assert.equal(player.pendingFires.length, 0);
    assert.equal(player.lastInput.fwd, 0);
    assert.equal(player.lastInput.right, 0);
    assert.equal(player.lastInput.aiming, false);
  });

  it("drops to heartbeat cadence after a round and ignores idle gameplay messages", async () => {
    const room: any = await colyseus.createRoom("blockrush", { map: "foundry", mode: "ffa" });
    const host = await colyseus.connectTo(room, { name: "HOST" });
    await colyseus.connectTo(room, { name: "GUEST" });
    await host.request("start", {});
    assert.equal(room.patchRate, 50);
    room.arena.endsAt = Date.now() - 1;
    await wait(80);
    assert.equal(room.arena.phase, "finished");
    assert.equal(room.patchRate, 1000);
    const player = room.arena.players.find((value: any) => value.id === host.sessionId);
    const queued = player.pendingInputs.length;
    host.send("i", inputPacket(999));
    host.send("f", firePacket(999, room.arena.tick));
    host.send("a", {kind:"reload",seq:999});
    await wait(40);
    assert.equal(player.pendingInputs.length, queued);
    assert.equal(player.pendingFires.length, 0);
    assert.notEqual(player.ack, 999);
  });

  it("keeps shots, damage, kills, scores, and ammunition authoritative", async () => {
    const room: any = await colyseus.createRoom("blockrush", { map: "foundry", mode: "ffa" });
    const host = await colyseus.connectTo(room, { name: "HOST" });
    const guest = await colyseus.connectTo(room, { name: "TARGET" });
    const started = await host.request("start", {});
    const shooter = room.arena.players.find((player: any) => player.id === host.sessionId);
    const target = room.arena.players.find((player: any) => player.id === guest.sessionId);
    shooter.pose = { ...shooter.pose, x: 0, y: 0, z: 12, yaw: 0, pitch: 0 };
    target.pose = { ...target.pose, x: 0, y: 0, z: 10, yaw: Math.PI, pitch: 0 };
    shooter.history = [{ tick: room.arena.tick, at: Date.now(), pose: { ...shooter.pose } }];
    target.history = [{ tick: room.arena.tick, at: Date.now(), pose: { ...target.pose } }];
    shooter.fireCredit = 1000;
    shooter.fireAt = Date.now();
    shooter.pose.yaw = 0; shooter.pose.pitch = 0; shooter.lastInput.aiming = true;
    for (let seq = 1; seq <= 4; seq++) host.send("f", firePacket(seq, room.arena.tick));
    await wait();

    const updated = await host.request("snapshot", {});
    const hostState = updated.room.players.find((player: any) => player.id === host.sessionId);
    const targetState = updated.room.players.find((player: any) => player.id === guest.sessionId);
    assert.equal(hostState.kills, 1);
    assert.ok(hostState.score === 100 || hostState.score === 150);
    assert.equal(targetState.alive, false);
    assert.equal(targetState.deaths, 1);
    assert.equal(updated.room.self.ammo[0], 26);
    assert.ok(updated.room.events.some((event: any) => event.type === "kill" && event.weaponId === "AR-30"));
    assert.ok(updated.room.events.filter((event: any) => event.type === "hit").every((event: any) => event.weaponId === "AR-30" && Number.isInteger(event.actionSeq)));
    const shotEvents = updated.room.events.filter((event: any) => event.type === "shot");
    assert.ok(shotEvents.length > 0 && shotEvents.every((event: any) => event.weaponId === "AR-30"), "remote muzzle and tracer VFX receive the authoritative weapon identity");
  });
});
