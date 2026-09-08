import { Room } from "colyseus";
import { ARENA_SOLIDS, DEPOT_SOLIDS, simulateMovement } from "../shared/movement.js";
import { byId, damageAtRange } from "../shared/weapons.js";

const LEGACY_GUNS = ["AR-30", "SR-6", "SMG-40"].map(serverWeapon);
const SPAWNS = {
  foundry: [[-25,-9],[24,8],[-9,24],[9,-25],[-23,7],[24,-11],[8,24],[-8,-24]],
  depot: [[-26,-23],[26,23],[-8,26],[8,-26],[-26,21],[26,-21],[-7,-2],[7,2]]
};
const WALLS = { foundry: ARENA_SOLIDS, depot: DEPOT_SOLIDS };
const ROOM_IDS = "$blockrush-room-ids";
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MATCH_MS = 180_000;
const TICK_MS = 1000 / 30;
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
  player.history = [{ at: now, pose: { ...player.pose } }];
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
  spawn(arena, player, now);
  return player;
}

function tick(arena, now) {
  const dt = clamp((now - arena.tickAt) / 1000, 0, 1);
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
    if (player.alive && now - player.lastDamage > 5000) player.hp = Math.min(100, player.hp + 12 * dt);
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

function historicalPose(player, at) {
  const history = player.history || [];
  if (!history.length) return player.pose;
  let before = history[0];
  let after = history.at(-1);
  for (let i = 1; i < history.length; i++) {
    if (history[i].at >= at) {
      before = history[i - 1];
      after = history[i];
      break;
    }
  }
  if (at <= before.at) return before.pose;
  if (at >= after.at) return player.pose;
  const amount = (at - before.at) / (after.at - before.at || 1);
  const a = before.pose;
  const b = after.pose;
  return {
    ...b,
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
    z: a.z + (b.z - a.z) * amount,
    slide: (Number(a.slide) || 0) + ((Number(b.slide) || 0) - (Number(a.slide) || 0)) * amount
  };
}

function damagePlayer(arena, player, target, damage, head, now, action = {}, end = target.pose) {
  if (!target.alive) return;
  target.hp = Math.max(0, target.hp - damage);
  target.lastDamage = now;
  addEvent(arena, {
    type: "hit",
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
  if (!player.alive || player.reloadEnd || now < (player.swapUntil || 0) || player.ammo[player.weapon] <= 0 || !action.dir || !action.origin) return;
  const origin = action.origin;
  const direction = action.dir;
  const sourcePose = Number.isSafeInteger(action.inputSeq)
    ? (player.history?.findLast(item => item.seq <= action.inputSeq)?.pose || player.pose)
    : player.pose;
  if (!["x", "y", "z"].every(key => Number.isFinite(origin[key]) && Number.isFinite(direction[key]))) return;
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length < 0.9 || length > 1.1 || Math.hypot(origin.x - sourcePose.x, origin.z - sourcePose.z) > 3 || Math.abs(origin.y - (sourcePose.y + 1.5)) > 1) return;
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
  const rewindAt = clamp(Number(action.viewTime) || now, now - 1000, now);
  if (weapon.projectile) {
    arena.projectiles.push({
      owner: player.id,
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
      x: normalized.x + (Math.random() - 0.5) * spread,
      y: normalized.y + (Math.random() - 0.5) * spread,
      z: normalized.z + (Math.random() - 0.5) * spread
    };
    const rayLength = Math.hypot(ray.x, ray.y, ray.z);
    for (const key of ["x", "y", "z"]) ray[key] /= rayLength;
    let distance = worldDistance(arena, origin, ray);
    let targets = [];
    for (const target of arena.players) {
      if (target.id === player.id || !target.alive || (arena.mode === "tdm" && target.team === player.team)) continue;
      const pose = historicalPose(target, rewindAt);
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
        damagePlayer(arena, player, target, damage, false, now);
        if (target.id === player.id) target.pose.vy = (Number(target.pose.vy) || 0) + damage * 0.24;
      }
    }
    return false;
  });
}

function decodeFrames(body) {
  if (!Array.isArray(body?.frames)) return [];
  return body.frames.slice(0, 240)
    .filter(frame => Array.isArray(frame) && frame.length === 7)
    .map(frame => ({
      seq: frame[0],
      dt: frame[1],
      fwd: frame[2],
      right: frame[3],
      jump: !!(frame[4] & 1),
      slidePressed: !!(frame[4] & 2),
      sprint: !!(frame[4] & 4),
      aiming: !!(frame[4] & 8),
      yaw: frame[5],
      pitch: frame[6]
    }));
}

function applyInputs(arena, player, rawInputs, now) {
  if (!player.alive || !rawInputs.length) return;
  const elapsed = Math.max(0, now - player.lastInputAt);
  const inputs = rawInputs.filter(input => input && Number.isSafeInteger(input.seq) && input.seq > player.ackInput);
  player.lastInputAt = now;
  player.inputCredit = Math.min(1000, (Number(player.inputCredit) || 0) + elapsed);
  const validDuration = input => {
    const dt = Number(input?.dt);
    return Number.isFinite(dt) && dt > 0 && dt <= 0.05 ? dt : 0;
  };
  let timeline = now - Math.min(1000, inputs.reduce((sum, input) => sum + validDuration(input) * 1000, 0));
  for (const input of inputs) {
    if (input.seq <= player.ackInput) continue;
    player.ackInput = input.seq;
    const dt = validDuration(input);
    const cost = dt * 1000;
    if (!dt || cost > player.inputCredit + 0.001) continue;
    player.inputCredit = Math.max(0, player.inputCredit - cost);
    const clean = {
      fwd: clamp(Number(input.fwd) || 0, -1, 1),
      right: clamp(Number(input.right) || 0, -1, 1),
      jump: !!input.jump,
      slidePressed: !!input.slidePressed,
      sprint: !!input.sprint,
      aiming: !!input.aiming,
      yaw: Number.isFinite(input.yaw) ? input.yaw : 0,
      speed: gunsFor(player)[player.weapon].speed,
      map: arena.map
    };
    player.pose = simulateMovement(player.pose, clean, dt);
    player.pose.yaw = clean.yaw % (Math.PI * 2);
    player.pose.pitch = clamp(Number(input.pitch) || 0, -1.45, 1.45);
    timeline += cost;
    const { x, y, z, slide, yaw } = player.pose;
    if (timeline - (player.history.at(-1)?.at || 0) >= 20 || input === inputs.at(-1)) {
      player.history.push({ at: timeline, seq: input.seq, pose: { x, y, z, slide, yaw } });
    }
  }
  player.poseAt = now;
  player.history = player.history.filter(item => item.at >= now - 1000).slice(-80);
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
    } else if (action.kind === "shot") {
      shoot(arena, player, action, now);
    }
  }
}

export class ArenaRoom extends Room {
  maxClients = 6;
  maxMessagesPerSecond = 90;
  arena = null;

  messages = {
    sync: (client, body) => this.handleSync(client, body),
    start: client => this.startMatch(client),
    snapshot: client => ({ room: this.snapshotFor(client) }),
    ping: (_client, body) => ({ sentAt: Number(body?.sentAt) || 0, serverTime: Date.now() })
  };

  async onCreate(options) {
    this.roomId = await this.generateRoomId();
    const now = Date.now();
    const map = ["foundry", "depot"].includes(options?.map) ? options.map : "foundry";
    const mode = ["ffa", "tdm", "gun"].includes(options?.mode) ? options.mode : "ffa";
    this.metadata = { map, mode };
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
    this.setTimestep(() => this.step(), TICK_MS);
  }

  onJoin(client, options) {
    const now = Date.now();
    const player = makePlayer(this.arena, client.sessionId, options?.name, now);
    this.arena.players.push(player);
    if (!this.arena.hostId) this.arena.hostId = player.id;
    this.arena.revision++;
    this.sendSnapshots();
  }

  onDrop(client) {
    this.allowReconnection(client, 15).catch(() => {});
  }

  onReconnect(client) {
    const player = this.playerFor(client);
    if (player) {
      player.lastInputAt = Date.now();
      player.inputCredit = 50;
    }
    this.sendSnapshot(client);
  }

  onLeave(client) {
    this.arena.players = this.arena.players.filter(player => player.id !== client.sessionId);
    if (this.arena.hostId === client.sessionId) this.arena.hostId = this.arena.players[0]?.id || null;
    this.arena.revision++;
    this.sendSnapshots();
  }

  async onDispose() {
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

  sendSnapshot(client) {
    const player = this.playerFor(client);
    if (player) client.send("snapshot", { room: publicRoom(this.arena, Date.now(), player) });
  }

  sendSnapshots() {
    const now = Date.now();
    for (const client of this.clients) {
      const player = this.playerFor(client);
      if (player) client.send("snapshot", { room: publicRoom(this.arena, now, player) });
    }
  }

  step() {
    tick(this.arena, Date.now());
    this.arena.revision++;
    this.sendSnapshots();
  }

  handleSync(client, body) {
    const player = this.playerFor(client);
    if (!player || !body || typeof body !== "object" || Array.isArray(body)) return;
    const now = Date.now();
    if (Number.isFinite(body.sentAt)) player.echo = body.sentAt;
    if (Number.isSafeInteger(body.eventCursor) && body.eventCursor >= 0) player.eventCursor = body.eventCursor;
    if (this.arena.phase !== "playing" || body.round !== this.arena.round || body.life !== player.life) return;
    applyInputs(this.arena, player, decodeFrames(body), now);
    applyActions(this.arena, player, body, now);
    this.arena.revision++;
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
    this.sendSnapshots();
    return { room: this.snapshotFor(client) };
  }
}
