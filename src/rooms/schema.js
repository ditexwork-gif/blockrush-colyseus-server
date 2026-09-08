import { schema, t } from "@colyseus/schema";

export const PlayerNetState = schema({
  name: t.string(""),
  x: t.int16(0), y: t.int16(0), z: t.int16(0),
  vx: t.int16(0), vy: t.int16(0), vz: t.int16(0),
  yawQ: t.int8(0), pitchQ: t.int8(0),
  hp: t.uint8(100), flags: t.uint8(3), weapon: t.uint8(0), team: t.uint8(0), gunStage: t.uint8(0),
  kills: t.uint16(0), deaths: t.uint16(0), life: t.uint16(0), score: t.uint32(0),
  lastSeq: t.uint32(0), lastActionSeq: t.uint32(0), respawnIn: t.uint16(0),
  ammo0: t.uint8(0), ammo1: t.uint8(0)
}, "PlayerNetState");

export const NetEvent = schema({
  seq: t.uint32(0), type: t.string(""), player: t.string(""), target: t.string(""),
  killer: t.string(""), victim: t.string(""), weaponId: t.string(""),
  actionSeq: t.uint32(0), score: t.uint16(0), color: t.uint32(0), head: t.boolean(false),
  ox: t.int16(0), oy: t.int16(0), oz: t.int16(0), ex: t.int16(0), ey: t.int16(0), ez: t.int16(0)
}, "NetEvent");

export const ArenaState = schema({
  code: t.string(""), map: t.string("foundry"), mode: t.string("ffa"), hostId: t.string(""),
  phase: t.uint8(0), tick: t.uint32(0), round: t.uint16(0), endsAtTick: t.uint32(0), serverTime: t.float64(0),
  players: t.map(PlayerNetState), events: t.array(NetEvent)
}, "ArenaState");
