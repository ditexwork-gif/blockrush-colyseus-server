import { Room } from "colyseus";
import { ARENA_SOLIDS, DEPOT_SOLIDS, simulateMovement } from "../shared/movement.js";
import { byId, damageAtRange } from "../shared/weapons.js";
import { inputMessage, playerJoined, playerLeft, recordTick, roomCreated, roomDisposed } from "../metrics.js";
import { ArenaState, NetEvent, PlayerNetState } from "./schema.js";

const LEGACY_GUNS = ["AR-30", "SR-6", "SMG-40"].map(serverWeapon);
const SPAWNS = {
  foundry: [[-25,-9],[24,8],[-9,24],[9,-25],[-23,7],[24,-11],[8,24],[-8,-24]],
  depot: [[-26,-23],[26,23],[-8,26],[8,-26],[-26,21],[26,-21],[-7,-2],[7,2]]
};
const WALLS = { foundry: ARENA_SOLIDS, depot: DEPOT_SOLIDS };
const ROOM_IDS = "$blockrush-room-ids";
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MATCH_MS = 180_000;
const TICK_RATE = 60;
const TICK_MS = 1000 / TICK_RATE;
const TICK = 1 / TICK_RATE;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function serverWeapon(id) {
  const weapon = byId[id];
  return { ...weapon, delay: weapon.delay * 1000, reload: weapon.reload * 1000 };
}

function gunsFor(player) {
  return player.gunIds ? player.gunIds.map(serverWeapon) : LEGACY_GUNS;
}

function cleanName(value) {
  if (typeof value !== "string") return "FIGHTER";
  return value.replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 16) || "FIGHTER";
}

function makeRoomCode() {
  let value = "";
  for (let i = 0; i < 6; i++) value += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  return value;
}

function spawn(arena, player, now) {
  const others = arena.players.filter(candidate => candidate.id !== player.id && candidate.alive);
  const available = SPAWNS[arena.map] || SPAWNS.foundry;
  const spots = available
    .map(point => ({ point, distance: Math.min(999, ...others.map(other => Math.hypot(other.pose.x - point[0], other.pose.z - point[1]))) }))
    .sort((a, b) => b.distance - a.distance);
  const point = spots[0].point;
  player.pose = {
    x: point[0], y: 0, z: point[1], vx: 0, vy: 0, vz: 0,
    grounded: true, slide: 0, slideCooldown: 0, slideQueued: false,
    landedAt: -99, time: 0, yaw: Math.atan2(point[0], point[1]), pitch: 0
  };
  player.hp = 100;
  player.alive = true;
  player.life++;
  player.respawnAt = 0;
  player.lastDamage = now;
  player.poseAt = now;
  player.ammo = gunsFor(player).map(weapon => weapon.cap);
  player.reloadEnd = 0;
  player.loadoutSet = false;
  player.burstLeft = 0;
  player.chargeAt = null;
  player.swapUntil = 0;
  player.weapon = arena.mode === "gun" ? [2, 0, 1][player.gunStage || 0] : 0;
  player.fireCredit = 0;
  player.fireAt = now;
  player.ackInput = Number.isSafeInteger(player.ackInput) ? player.ackInput : 0;
  player.lastInputAt = now;
  player.inputCredit = 50;
  player.history = [{ at: now, tick: arena.tick || 0, pose: { ...player.pose } }];
}

function makePlayer(arena, id, name, now) {
  const player = {
    id,
    name: cleanName(name),
    ack: 0,
    ackInput: 0,
    eventCursor: 0,
    echo: 0,
    life: 0,
    kills: 0,
    deaths: 0,
    score: 0,
    weapon: 0,
    team: arena.players.length % 2,
    gunStage: 0,
    sniperKills: 0
  };
  player.pendingInputs = [];
  player.pendingFires = [];
  player.lastInput = { fwd: 0, right: 0, jump: false, slidePressed: false, sprint: false, aiming: false, yaw: 0, pitch: 0 };
  player.inputTicks = 3;
  player.inputWindowAt = now;
  player.inputCount = 0;
  player.actionWindowAt = now;
  player.actionCount = 0;
  player.strikes = 0;
  player.rtt = 0;
  player.pingNonce = 0;
  player.pingSentAt = 0;
  spawn(arena, player, now);
  return player;
}

function tick(arena, now) {
  arena.tickAt = now;
  if (!arena.players.some(player => player.id === arena.hostId)) arena.hostId = arena.players[0]?.id || null;
  if (arena.phase === "playing") tickProjectiles(arena, now);
  if (arena.phase === "playing" && now >= arena.endsAt) arena.phase = "finished";
  for (const player of arena.players) {
    if (arena.phase === "playing" && !player.alive && now >= player.respawnAt) spawn(arena, player, now);
    if (player.reloadEnd && now >= player.reloadEnd) {
      player.ammo[player.reloadWeapon] = gunsFor(player)[player.reloadWeapon].cap;
      player.reloadEnd = 0;
    }
    if (player.alive && now - player.lastDamage > 5000) player.hp = Math.min(100, player.hp + 12 * TICK);
  }
}

function addEvent(arena, value) {
  arena.eventSeq++;
  arena.events.push({ ...value, seq: arena.eventSeq });
  arena.events = arena.events.slice(-50);
}

function publicRoom(arena, now, player) {
  return {
    code: arena.code,
    map: arena.map,
    mode: arena.mode,
    revision: arena.revision,
    round: arena.round,
    phase: arena.phase,
    hostId: arena.hostId,
    serverTime: now,
    endsAt: arena.endsAt,
    events: arena.events.filter(value => value.seq > (player?.eventCursor || 0)),
    self: player ? { id: player.id, ack: player.ack, ackInput: player.ackInput, ammo: player.ammo, echo: player.echo } : null,
    players: arena.players.map(value => ({
      id: value.id,
      name: value.name,
      pose: value.pose,
      hp: value.hp,
      alive: value.alive,
      life: value.life,
      kills: value.kills,
      deaths: value.deaths,
      score: value.score,
      weapon: value.weapon,
      team: value.team,
      gunStage: value.gunStage,
      sniperKills: value.sniperKills,
      respawnAt: value.respawnAt
    }))
  };
}

function rayBox(origin, direction, min, max) {
  let near = 0;
  let far = 220;
  for (const key of ["x", "y", "z"]) {
    if (Math.abs(direction[key]) < 1e-8) {
      if (origin[key] < min[key] || origin[key] > max[key]) return Infinity;
      continue;
    }
    let a = (min[key] - origin[key]) / direction[key];
    let b = (max[key] - origin[key]) / direction[key];
    if (a > b) [a, b] = [b, a];
    near = Math.max(near, a);
    far = Math.min(far, b);
    if (near > far) return Infinity;
  }
  return near;
}

function historicalPoseAtTick(player, at) {
  const history = player.history || [];
  if (!history.length) return player.pose;
  let closest = history[0];
  for (const sample of history) {
    if (sample.tick > at) break;
    closest = sample;
  }
  return closest.pose;
}

function seededUnit(seed) {
  let value = (seed >>> 0) + 0x6d2b79f5;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}

function angleDelta(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function aimDirection(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

function damagePlayer(arena, player, target, damage, head, now, action = {}, end = target.pose) {
  if (!target.alive) return;
  const weaponId = action.weaponId || gunsFor(player)[player.weapon].id;
  target.hp = Math.max(0, target.hp - damage);
  target.lastDamage = now;
  addEvent(arena, {
    type: "hit",
    weaponId,
    player: player.id,
    target: target.id,
    head,
    end,
    from: { x: player.pose.x, y: player.pose.y + 1.5, z: player.pose.z },
    actionSeq: action.seq
  });
  if (target.hp > 0) return;
  target.alive = false;
  target.deaths++;
  target.respawnAt = now + 3000;
  if (target.id !== player.id) {
    player.kills++;
    player.score += head ? 150 : 100;
    if (arena.mode === "gun") {
      if (player.gunStage < 2) {
        player.gunStage++;
        player.weapon = [2, 0, 1][player.gunStage];
        player.ammo[player.weapon] = gunsFor(player)[player.weapon].cap;
      } else if (++player.sniperKills >= 3) {
        arena.phase = "finished";
        arena.endsAt = now;
      }
    }
  }
  addEvent(arena, {
    type: "kill",
    weaponId,
    player: player.id,
    target: target.id,
    killer: player.name,
    victim: target.name,
    head,
    score: target.id === player.id ? 0 : head ? 150 : 100,
    actionSeq: action.seq
  });
}

function worldDistance(arena, origin, direction, maxDistance = 220) {
  let distance = maxDistance;
  for (const solid of WALLS[arena.map] || WALLS.foundry) {
    distance = Math.min(distance, rayBox(
      origin,
      direction,
      { x: solid.x - solid.w / 2, y: solid.bottom, z: solid.z - solid.d / 2 },
      { x: solid.x + solid.w / 2, y: solid.top, z: solid.z + solid.d / 2 }
    ));
  }
  return distance;
}

function shoot(arena, player, action, now) {
  const weapon = gunsFor(player)[player.weapon];
  action = {...action, weaponId: weapon.id};
  if (!player.alive || player.reloadEnd || now < (player.swapUntil || 0) || player.ammo[player.weapon] <= 0) return;
  const yaw = Number(action.yaw), pitch = Number(action.pitch);
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch) || Math.abs(angleDelta(yaw, player.pose.yaw)) > Math.PI / 12 || Math.abs(pitch - player.pose.pitch) > Math.PI / 12) {
    player.strikes++;
    return;
  }
  const origin = { x: player.pose.x, y: player.pose.y + (player.pose.slide ? 1 : 1.62), z: player.pose.z };
  const direction = aimDirection(yaw, pitch);
  const length = 1;
  const delay = weapon.burst && player.burstLeft > 0 ? weapon.burstDelay * 1000 : weapon.delay;
  player.fireCredit = Math.min(Math.max(1000, delay), player.fireCredit + Math.max(0, now - player.fireAt));
  player.fireAt = now;
  if (player.fireCredit + 1 < delay) return;
  player.fireCredit = Math.max(0, player.fireCredit - delay);
  player.ammo[player.weapon]--;
  if (weapon.burst) player.burstLeft = player.burstLeft > 0 ? player.burstLeft - 1 : weapon.burst - 1;
  const power = weapon.charge ? (player.chargeAt !== null && now - player.chargeAt >= weapon.charge * 1000 ? 1 : 0.4) : 1;
  player.chargeAt = null;
  const normalized = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
  const rewindTick = clamp(Number(action.tick) || arena.tick, arena.tick - 60, arena.tick);
  if (weapon.projectile) {
    arena.projectiles.push({
      owner: player.id,
      actionSeq: action.seq,
      id: weapon.id,
      pos: { ...origin },
      vel: {
        x: normalized.x * weapon.projectile.speed,
        y: normalized.y * weapon.projectile.speed,
        z: normalized.z * weapon.projectile.speed
      },
      born: now,
      at: now
    });
    addEvent(arena, {
      type: "shot",
      player: player.id,
      origin,
      end: { x: origin.x + normalized.x * 5, y: origin.y + normalized.y * 5, z: origin.z + normalized.z * 5 },
      weapon: player.weapon,
      actionSeq: action.seq
    });
    return;
  }
  for (let pellet = 0; pellet < weapon.pellets; pellet++) {
    const spread = action.aiming ? (weapon.cls === "SNIPER" ? 0.0003 : weapon.spread * 0.2) : weapon.spread;
    const ray = {
      x: normalized.x + (seededUnit(action.seq * 17 + pellet * 3) - 0.5) * spread,
      y: normalized.y + (seededUnit(action.seq * 17 + pellet * 3 + 1) - 0.5) * spread,
      z: normalized.z + (seededUnit(action.seq * 17 + pellet * 3 + 2) - 0.5) * spread
    };
    const rayLength = Math.hypot(ray.x, ray.y, ray.z);
    for (const key of ["x", "y", "z"]) ray[key] /= rayLength;
    let distance = worldDistance(arena, origin, ray);
    let targets = [];
    for (const target of arena.players) {
      if (target.id === player.id || !target.alive || (arena.mode === "tdm" && target.team === player.team)) continue;
      const pose = historicalPoseAtTick(target, rewindTick);
      const height = pose.slide ? 1.2 : 1.9;
      const hit = rayBox(origin, ray,
        { x: pose.x - 0.45, y: pose.y, z: pose.z - 0.45 },
        { x: pose.x + 0.45, y: pose.y + height, z: pose.z + 0.45 });
      if (hit < distance) targets.push({ target, hit, head: origin.y + ray.y * hit > pose.y + (pose.slide ? 0.9 : 1.43) });
    }
    targets.sort((a, b) => a.hit - b.hit);
    if (!weapon.pierce) targets = targets.slice(0, 1);
    for (const value of targets) {
      const end = {
        x: origin.x + ray.x * value.hit,
        y: origin.y + ray.y * value.hit,
        z: origin.z + ray.z * value.hit
      };
      damagePlayer(arena, player, value.target,
        weapon.damage * power * damageAtRange(weapon, value.hit) * (value.head ? weapon.hs : 1),
        value.head, now, action, end);
    }
    if (!weapon.pierce && targets.length) distance = targets[0].hit;
    addEvent(arena, {
      type: "shot",
      player: player.id,
      origin,
      end: { x: origin.x + ray.x * distance, y: origin.y + ray.y * distance, z: origin.z + ray.z * distance },
      weapon: player.weapon,
      actionSeq: action.seq
    });
  }
}

function tickProjectiles(arena, now) {
  arena.projectiles = arena.projectiles.filter(projectile => {
    const player = arena.players.find(value => value.id === projectile.owner);
    const weapon = byId[projectile.id];
    if (!player || !weapon) return false;
    let explode = false;
    while (projectile.at < now && !explode) {
      const dt = Math.min(0.02, (now - projectile.at) / 1000);
      projectile.at += dt * 1000;
      projectile.vel.y -= weapon.projectile.gravity * dt;
      const length = Math.hypot(projectile.vel.x, projectile.vel.y, projectile.vel.z);
      const direction = { x: projectile.vel.x / length, y: projectile.vel.y / length, z: projectile.vel.z / length };
      const travel = length * dt;
      let hit = worldDistance(arena, projectile.pos, direction, travel);
      for (const target of arena.players) {
        if (!target.alive || target.id === player.id || (arena.mode === "tdm" && target.team === player.team)) continue;
        const pose = target.pose;
        hit = Math.min(hit, rayBox(projectile.pos, direction,
          { x: pose.x - 0.45, y: pose.y, z: pose.z - 0.45 },
          { x: pose.x + 0.45, y: pose.y + 1.9, z: pose.z + 0.45 }));
      }
      for (const key of ["x", "y", "z"]) projectile.pos[key] += direction[key] * hit;
      explode = hit < travel || projectile.pos.y <= 0 || projectile.at - projectile.born >= 3000;
    }
    if (!explode) return true;
    addEvent(arena, { type: "explosion", pos: projectile.pos, color: weapon.color });
    for (const target of arena.players) {
      if (!target.alive || (target.id !== player.id && arena.mode === "tdm" && target.team === player.team)) continue;
      const distance = Math.hypot(target.pose.x - projectile.pos.x, target.pose.y + 1.5 - projectile.pos.y, target.pose.z - projectile.pos.z);
      const damage = weapon.damage * Math.max(0, 1 - distance / weapon.projectile.radius) * (target.id === player.id ? 0.5 : 1);
      if (damage > 0) {
        damagePlayer(arena, player, target, damage, false, now, {seq: projectile.actionSeq, weaponId: projectile.id});
        if (target.id === player.id) target.pose.vy = (Number(target.pose.vy) || 0) + damage * 0.24;
      }
    }
    return false;
  });
}

function applyActions(arena, player, body, now) {
  const actions = Array.isArray(body?.actions) ? body.actions.slice(0, 24) : [];
  for (const action of actions) {
    if (!action || !Number.isSafeInteger(action.seq) || action.seq <= player.ack) continue;
    player.ack = action.seq;
    if (action.kind === "loadout" && arena.mode !== "gun" && !player.loadoutSet &&
        Array.isArray(action.ids) && action.ids.length === 2 &&
        byId[action.ids[0]]?.slot === "primary" && byId[action.ids[1]]?.slot === "secondary") {
      player.gunIds = action.ids;
      player.loadoutSet = true;
      player.ammo = gunsFor(player).map(weapon => weapon.cap);
      player.weapon = 0;
    } else if (action.kind === "charge" && gunsFor(player)[player.weapon].charge && player.alive && !player.reloadEnd) {
      player.chargeAt = now;
    } else if (action.kind === "switch" && arena.mode !== "gun" && Number.isInteger(action.weapon) && gunsFor(player)[action.weapon]) {
      if (player.weapon !== action.weapon) player.swapUntil = now + 350;
      player.weapon = action.weapon;
      player.reloadEnd = 0;
      player.burstLeft = 0;
      player.chargeAt = null;
    } else if (action.kind === "reload" && player.alive && !player.reloadEnd && player.ammo[player.weapon] < gunsFor(player)[player.weapon].cap) {
      player.reloadWeapon = player.weapon;
      player.reloadEnd = now + gunsFor(player)[player.weapon].reload;
    }
  }
}

export class ArenaRoom extends Room {
  maxClients = 8;
  arena = null;

  messages = {
    i: (client, body) => this.queueInput(client, body),
    f: (client, body) => this.queueFire(client, body),
    a: (client, body) => this.handleAction(client, body),
    pong: (client, nonce) => this.handlePong(client, nonce),
    start: client => this.startMatch(client),
    snapshot: client => ({ room: this.snapshotFor(client) }),
  };

  async onCreate(options) {
    this.roomId = await this.generateRoomId();
    const now = Date.now();
    const map = ["foundry", "depot"].includes(options?.map) ? options.map : "foundry";
    const mode = ["ffa", "tdm", "gun"].includes(options?.mode) ? options.mode : "ffa";
    const publicRoom = options?.public === true;
    this.metadata = { map, mode, public: publicRoom };
    this.arena = {
      code: this.roomId,
      map,
      mode,
      revision: 0,
      round: 0,
      phase: "waiting",
      hostId: null,
      endsAt: 0,
      tickAt: now,
      players: [],
      events: [],
      eventSeq: 0,
      projectiles: []
    };
    this.arena.tick = 0;
    this.schemaEventSeq = 0;
    this.emptyTimer = null;
    this.autoDispose = false;
    const state = new ArenaState();
    state.code = this.roomId; state.map = map; state.mode = mode; state.serverTime = now;
    this.setState(state);
    this.setPatchRate(50);
    this.setSimulationInterval(() => this.step(), TICK_MS);
    roomCreated();
  }

  onJoin(client, options) {
    clearTimeout(this.emptyTimer);
    const now = Date.now();
    const player = makePlayer(this.arena, client.sessionId, options?.name, now);
    this.arena.players.push(player);
    if (!this.arena.hostId) this.arena.hostId = player.id;
    this.arena.revision++;
    this.state.players.set(player.id, new PlayerNetState());
    playerJoined();
    this.syncState(now);
  }

  onDrop(client) {
    this.allowReconnection(client, 20).catch(() => {});
  }

  onReconnect(client) {
    const player = this.playerFor(client);
    if (player) {
      player.lastInputAt = Date.now();
      player.inputCredit = 50;
    }
    this.syncState(Date.now());
  }

  onLeave(client) {
    this.arena.players = this.arena.players.filter(player => player.id !== client.sessionId);
    if (this.arena.hostId === client.sessionId) this.arena.hostId = this.arena.players[0]?.id || null;
    this.arena.revision++;
    this.state.players.delete(client.sessionId);
    playerLeft();
    this.syncState(Date.now());
    if (!this.arena.players.length) this.emptyTimer = setTimeout(() => this.disconnect(), 30_000);
  }

  async onDispose() {
    clearTimeout(this.emptyTimer);
    roomDisposed(this.arena?.players?.length || 0);
    await this.presence.srem(ROOM_IDS, this.roomId);
  }

  async generateRoomId() {
    const current = await this.presence.smembers(ROOM_IDS);
    let id;
    do id = makeRoomCode(); while (current.includes(id));
    await this.presence.sadd(ROOM_IDS, id);
    return id;
  }

  playerFor(client) {
    return this.arena.players.find(player => player.id === client.sessionId);
  }

  snapshotFor(client) {
    const now = Date.now();
    return publicRoom(this.arena, now, this.playerFor(client));
  }

  step() {
    const started = performance.now();
    const now = Date.now();
    this.arena.tick++;
    for (const player of this.arena.players) this.stepPlayer(player, now);
    tick(this.arena, now);
    for (const player of this.arena.players) this.resolveFires(player, now);
    if (this.arena.tick % 120 === 0) this.pingClients(now);
    this.arena.revision++;
    this.syncState(now);
    recordTick(performance.now() - started);
  }

  countMessage(player, now, channel = "input") {
    const windowKey = channel === "input" ? "inputWindowAt" : "actionWindowAt";
    const countKey = channel === "input" ? "inputCount" : "actionCount";
    const limit = channel === "input" ? 70 : 40;
    if (now - player[windowKey] >= 1000) { player[windowKey] = now; player[countKey] = 0; }
    if (++player[countKey] <= limit) return true;
    if (++player.strikes >= 5) this.clients.find(client => client.sessionId === player.id)?.leave(4002, "Input rate exceeded");
    return false;
  }

  queueInput(client, body) {
    const player = this.playerFor(client);
    if (!player || !(body instanceof Uint8Array) || body.byteLength !== 12) { inputMessage(false); return; }
    const now = Date.now();
    if (!this.countMessage(player, now, "input") || this.arena.phase !== "playing") { inputMessage(false); return; }
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const seq = view.getUint32(0, true), buttons = view.getUint8(4), dtTicks = view.getUint16(9, true);
    if (!seq || seq <= player.ackInput || dtTicks < 1 || dtTicks > 3) { player.strikes++; inputMessage(false); return; }
    const input = { seq, dtTicks, fwd:(buttons&1?1:0)-(buttons&2?1:0), right:(buttons&4?1:0)-(buttons&8?1:0), jump:!!(buttons&16), slidePressed:!!(buttons&32), sprint:!!(buttons&64), aiming:!!(buttons&128), yaw:view.getInt16(5,true)/10000, pitch:view.getInt16(7,true)/10000, weapon:view.getUint8(11) };
    player.pendingInputs.push(input);
    if (player.pendingInputs.length > 30) { player.pendingInputs.splice(0, player.pendingInputs.length - 30); player.strikes++; }
    inputMessage(true);
  }

  queueFire(client, body) {
    const player = this.playerFor(client);
    if (!player || !(body instanceof Uint8Array) || body.byteLength !== 13 || !this.countMessage(player, Date.now(), "action")) return;
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const fire = { seq:view.getUint32(0,true), tick:view.getUint32(4,true), yaw:view.getInt16(8,true)/10000, pitch:view.getInt16(10,true)/10000, weapon:view.getUint8(12), aiming:player.lastInput.aiming };
    if (!fire.seq || fire.seq <= player.ack || player.pendingFires.length >= 12) { player.strikes++; return; }
    player.pendingFires.push(fire);
  }

  handleAction(client, action) {
    const player = this.playerFor(client);
    if (!player || !action || typeof action !== "object" || !this.countMessage(player, Date.now(), "action")) return;
    applyActions(this.arena, player, { actions:[action] }, Date.now());
    this.syncState(Date.now());
  }

  pingClients(now) {
    for (const client of this.clients) {
      const player = this.playerFor(client);
      if (!player) continue;
      player.pingNonce = (player.pingNonce + 1) >>> 0;
      player.pingSentAt = now;
      client.send("ping", player.pingNonce);
    }
  }

  handlePong(client, nonce) {
    const player = this.playerFor(client);
    if (!player || nonce !== player.pingNonce || !player.pingSentAt) return;
    const sample = clamp(Date.now() - player.pingSentAt, 0, 2000);
    player.rtt = player.rtt ? player.rtt * 0.7 + sample * 0.3 : sample;
    player.pingSentAt = 0;
  }

  stepPlayer(player, now) {
    if (!player.alive || this.arena.phase !== "playing") return;
    player.inputTicks = Math.min(6, (player.inputTicks || 0) + 1);
    const q = player.pendingInputs, count = Math.min(q.length, q.length > 6 ? 3 : 1);
    if (!count) {
      const held = { ...player.lastInput, jump:false, slidePressed:false, speed:gunsFor(player)[player.weapon].speed, map:this.arena.map };
      player.pose = simulateMovement(player.pose, held, TICK);
    }
    for (let index=0; index<count; index++) {
      const input = q.shift();
      if (input.dtTicks > player.inputTicks) { player.strikes++; continue; }
      player.inputTicks -= input.dtTicks;
      if (Number.isInteger(input.weapon) && gunsFor(player)[input.weapon] && input.weapon !== player.weapon && this.arena.mode !== "gun") {
        player.weapon = input.weapon; player.reloadEnd = 0; player.swapUntil = now + 350;
      }
      const clean = { ...input, speed:gunsFor(player)[player.weapon].speed, map:this.arena.map };
      for (let step=0; step<input.dtTicks; step++) player.pose = simulateMovement(player.pose, { ...clean, jump:step===0&&clean.jump, slidePressed:step===0&&clean.slidePressed }, TICK);
      player.pose.yaw = clean.yaw; player.pose.pitch = clamp(clean.pitch,-1.45,1.45);
      player.lastInput = { ...clean, jump:false, slidePressed:false };
      player.ackInput = input.seq;
    }
    player.history.push({ tick:this.arena.tick, at:now, pose:{...player.pose} });
    player.history = player.history.slice(-60);
  }

  resolveFires(player, now) {
    for (const fire of player.pendingFires.splice(0, 8)) {
      player.ack = Math.max(player.ack, fire.seq);
      if (fire.weapon !== player.weapon) { player.strikes++; continue; }
      const rewindTicks = clamp(Math.round(((player.rtt || 0) / 2 + 100) / TICK_MS), 0, 60);
      fire.tick = this.arena.tick - rewindTicks;
      shoot(this.arena, player, fire, now);
    }
  }

  syncState(now) {
    const state=this.state, arena=this.arena;
    state.code=arena.code; state.map=arena.map; state.mode=arena.mode; state.hostId=arena.hostId||"";
    state.phase=arena.phase==="waiting"?0:arena.phase==="playing"?1:2; state.tick=arena.tick; state.round=arena.round;
    state.endsAtTick=arena.phase==="playing"?arena.tick+Math.max(0,Math.ceil((arena.endsAt-now)/TICK_MS)):arena.tick;
    state.serverTime=now;
    for (const player of arena.players) {
      let net=state.players.get(player.id); if(!net){net=new PlayerNetState();state.players.set(player.id,net)}
      const p=player.pose, q=value=>clamp(Math.round((Number(value)||0)*100),-32768,32767);
      net.name=player.name; net.x=q(p.x); net.y=q(p.y); net.z=q(p.z); net.vx=q(p.vx); net.vy=q(p.vy); net.vz=q(p.vz);
      net.yawQ=clamp(Math.round(angleDelta(p.yaw,0)/Math.PI*127),-127,127); net.pitchQ=clamp(Math.round((p.pitch||0)/1.45*127),-127,127);
      net.hp=clamp(Math.round(player.hp),0,100); net.flags=(player.alive?1:0)|(p.grounded?2:0)|(p.slide?4:0)|(player.lastInput?.aiming?8:0)|(player.reloadEnd?16:0);
      net.weapon=player.weapon; net.team=player.team; net.gunStage=player.gunStage; net.kills=player.kills; net.deaths=player.deaths; net.life=player.life; net.score=player.score;
      net.lastSeq=player.ackInput; net.lastActionSeq=player.ack; net.respawnIn=player.alive?0:clamp(Math.ceil((player.respawnAt-now)/TICK_MS),0,65535);
      net.ammo0=clamp(player.ammo?.[0]||0,0,255); net.ammo1=clamp(player.ammo?.[1]||0,0,255);
    }
    for (const event of arena.events) if(event.seq>this.schemaEventSeq){
      const net=new NetEvent(), origin=event.origin||event.from||event.pos||{}, end=event.end||event.pos||{};
      Object.assign(net,{seq:event.seq,type:event.type||"",player:event.player||"",target:event.target||"",killer:event.killer||"",victim:event.victim||"",weaponId:event.weaponId||"",actionSeq:event.actionSeq||0,score:event.score||0,color:event.color||0,head:!!event.head,ox:Math.round((origin.x||0)*100),oy:Math.round((origin.y||0)*100),oz:Math.round((origin.z||0)*100),ex:Math.round((end.x||0)*100),ey:Math.round((end.y||0)*100),ez:Math.round((end.z||0)*100)});
      state.events.push(net); this.schemaEventSeq=event.seq;
    }
    while(state.events.length>32)state.events.shift();
  }

  startMatch(client) {
    const player = this.playerFor(client);
    if (!player) throw new Error("Your room session ended. Join the room again.");
    if (player.id !== this.arena.hostId) throw new Error("Only the room host can start the match.");
    if (this.arena.players.length < 2) throw new Error("Invite at least one friend before starting.");
    if (this.arena.phase === "playing") return { room: this.snapshotFor(client) };
    const now = Date.now();
    this.arena.phase = "playing";
    this.arena.round++;
    this.arena.endsAt = now + MATCH_MS;
    this.arena.events = [];
    this.arena.projectiles = [];
    this.arena.players.forEach((value, index) => {
      value.kills = 0;
      value.deaths = 0;
      value.score = 0;
      value.gunStage = 0;
      value.sniperKills = 0;
      value.team = index % 2;
      spawn(this.arena, value, now);
    });
    this.arena.revision++;
    this.syncState(now);
    return { room: this.snapshotFor(client) };
  }
}
