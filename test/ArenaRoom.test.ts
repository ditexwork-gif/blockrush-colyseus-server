import assert from "node:assert/strict";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import appConfig from "../src/app.config.js";

describe("BLOCKRUSH realtime room", () => {
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

  it("acknowledges batched predicted movement over the realtime connection", async () => {
    const room = await colyseus.createRoom("blockrush", { map: "foundry", mode: "ffa" });
    const host = await colyseus.connectTo(room, { name: "HOST" });
    await colyseus.connectTo(room, { name: "GUEST" });
    const started = await host.request("start", {});
    const self = started.room.players.find((player: any) => player.id === host.sessionId);
    const before = { ...self.pose };
    const frames = Array.from({ length: 6 }, (_, index) => [index + 1, 1 / 120, 1, 0, 0, 0, 0]);

    host.send("sync", { round: 1, life: self.life, eventCursor: 0, frames, actions: [] });
    await room.waitForNextMessage();

    const updated = await host.request("snapshot", {});
    assert.equal(updated.room.self.ackInput, 6);
    assert.ok(updated.room.players.find((player: any) => player.id === host.sessionId).pose.z < before.z);
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
    shooter.fireCredit = 1000;
    shooter.fireAt = Date.now();
    const shot = { kind: "shot", origin: { x: 0, y: 1.1, z: 12 }, dir: { x: 0, y: 0, z: -1 }, aiming: true };

    host.send("sync", {
      round: started.room.round,
      life: shooter.life,
      eventCursor: 0,
      frames: [],
      actions: [1, 2, 3, 4].map(seq => ({ ...shot, seq, inputSeq: 0 }))
    });
    await room.waitForNextMessage();

    const updated = await host.request("snapshot", {});
    const hostState = updated.room.players.find((player: any) => player.id === host.sessionId);
    const targetState = updated.room.players.find((player: any) => player.id === guest.sessionId);
    assert.equal(hostState.kills, 1);
    assert.equal(hostState.score, 100);
    assert.equal(targetState.alive, false);
    assert.equal(targetState.deaths, 1);
    assert.equal(updated.room.self.ammo[0], 26);
    assert.ok(updated.room.events.some((event: any) => event.type === "kill"));
  });
});
