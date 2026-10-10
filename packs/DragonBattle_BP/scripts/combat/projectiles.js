import { system, ItemStack } from "@minecraft/server";
import { KI_COLOR, POSE } from "../gen/catalog.js";
import { settings } from "../core/settings.js";
import { V, clamp, dirToRot, isValid, rand } from "../core/util.js";
import { particle, deco, sound, boom, shakeArea } from "../core/fx.js";
import { hurt, isHostile, powerOf, knock } from "./damage.js";
import { carve } from "./terrain.js";
import { emit } from "../core/bus.js";

const powerOfAny = powerOf;

function setPose(e, name) {
  try {
    e.setProperty("dbb:pose", POSE[name] ?? 0);
  } catch {
    // ignore
  }
}

const SKIP_TYPES = ["minecraft:item", "minecraft:xp_orb", "dbb:ki_blast", "dbb:beam", "minecraft:armor_stand"];

export function handOrigin(e) {
  const head = e.getHeadLocation();
  const dir = e.getViewDirection();
  return V.add(V.up(head, -0.35), V.mul(dir, 0.9));
}

/* ======================================================================================= blasts */

const blasts = new Map();

/**
 * opts: color, size, speed, power, radius, life, homing, guided, pierce, shape(0 orb/1 disc), candy, from, dir, techId, scaleExplosion
 */
export function fireBlast(owner, opts) {
  const dim = owner.dimension;
  const from = opts.from ?? handOrigin(owner);
  const dir = V.norm(opts.dir ?? owner.getViewDirection());
  let ent;
  try {
    ent = dim.spawnEntity("dbb:ki_blast", from);
    ent.setProperty("dbb:color", KI_COLOR[opts.color] ?? 0);
    ent.setProperty("dbb:shape", opts.shape ?? 0);
    ent.setProperty("dbb:size", clamp(opts.size ?? 0.6, 0.1, 12));
  } catch {
    return null;
  }
  const b = {
    ent, owner, ownerId: owner.id, dim, pos: from, dir, speed: opts.speed ?? 1.6, power: opts.power ?? 6,
    radius: opts.radius ?? 1.2, life: opts.life ?? 70, age: 0, hit: new Set(), homing: !!opts.homing, guided: !!opts.guided,
    pierce: !!opts.pierce, color: opts.color ?? "yellow", size: opts.size ?? 0.6, candy: !!opts.candy, techId: opts.techId,
    ownerPL: powerOfAny(owner), guideDist: 6,
  };
  blasts.set(ent.id, b);
  return b;
}

function nearestTarget(b, range) {
  let best = null;
  let bd = range * range;
  for (const e of b.dim.getEntities({ location: b.pos, maxDistance: range, excludeTypes: SKIP_TYPES })) {
    if (!isHostile(b.owner, e)) continue;
    const d = V.dist2(e.location, b.pos);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

function stepBlast(b) {
  b.age++;
  if (!isValid(b.ent)) return false;
  if (!isValid(b.owner)) b.owner = undefined;
  if (b.homing && b.age > 3) {
    const t = nearestTarget(b, 24);
    if (t) {
      const want = V.norm(V.sub(V.up(t.location, 1), b.pos));
      b.dir = V.norm(V.lerp(b.dir, want, 0.22));
    }
  }
  if (b.guided && b.owner) {
    const head = b.owner.getHeadLocation();
    b.guideDist = Math.min(30, b.guideDist + b.speed * 0.6);
    const aim = V.add(head, V.mul(b.owner.getViewDirection(), b.guideDist));
    b.dir = V.norm(V.lerp(b.dir, V.norm(V.sub(aim, b.pos)), 0.35));
  }
  const steps = Math.max(1, Math.ceil(b.speed / 0.6));
  const step = V.mul(b.dir, b.speed / steps);
  for (let i = 0; i < steps; i++) {
    b.pos = V.add(b.pos, step);
    // blocks
    let block;
    try {
      block = b.dim.getBlock(b.pos);
    } catch {
      block = undefined;
    }
    if (!block) return explodeBlast(b);
    if (!block.isAir && !block.isLiquid && block.typeId !== "minecraft:short_grass" && block.typeId !== "minecraft:tall_grass") {
      return explodeBlast(b);
    }
    // entities
    const r = Math.max(0.8, b.size * 0.9);
    for (const e of b.dim.getEntities({ location: b.pos, maxDistance: r + 0.6, excludeTypes: SKIP_TYPES })) {
      if (e.id === b.ownerId || b.hit.has(e.id)) continue;
      if (!isHostile(b.owner, e)) continue;
      b.hit.add(e.id);
      if (b.candy && tryCandy(e, b.owner)) continue;
      hurt(e, b.power, b.owner, { knock: { dir: b.dir, h: 0.6 + b.size * 0.2, v: 0.25 } });
      particle(b.dim, "dbb:impact", b.pos, b.color, 1 + b.size);
      if (!b.pierce) return explodeBlast(b);
    }
  }
  try {
    b.ent.teleport(b.pos);
  } catch {
    return false;
  }
  if (b.age % 2 === 0) particle(b.dim, "dbb:trail", b.pos, b.color, Math.max(0.5, b.size));
  if (b.age >= b.life) return explodeBlast(b);
  return true;
}

function explodeBlast(b) {
  explode(b.dim, b.pos, b.radius, b.power * 0.6, b.owner, b.color, b.hit);
  remove(b.ent);
  return false;
}

function remove(e) {
  try {
    if (isValid(e)) e.remove();
  } catch {
    // ignore
  }
}

/** Area damage + visuals + optional crater. `skip` ids won't be hurt again. */
export function explode(dim, pos, radius, power, owner, color = "yellow", skip = new Set()) {
  boom(dim, pos, color, Math.max(1, radius));
  if (power > 0) {
    for (const e of dim.getEntities({ location: pos, maxDistance: radius + 1, excludeTypes: SKIP_TYPES })) {
      if (skip.has(e.id)) continue;
      if (!isHostile(owner, e)) continue;
      const d = V.dist(e.location, pos);
      const f = clamp(1 - d / (radius + 1), 0.25, 1);
      hurt(e, power * f, owner, { knock: { dir: V.sub(e.location, pos), h: 0.4 + radius * 0.15, v: 0.35 + radius * 0.04 } });
    }
  }
  if (radius >= 2) carve(dim, pos, Math.min(9, radius * 0.75));
}

/* ======================================================================================= beams */

const beams = new Map();

/**
 * opts: color, width, range, power, pierce, spiral, candy, duration, speed, instant, firePose, name
 */
export function fireBeam(owner, opts) {
  const dim = owner.dimension;
  const origin = handOrigin(owner);
  let ent;
  try {
    ent = dim.spawnEntity("dbb:beam", origin);
    ent.setRotation({ x: 0, y: 0 });
    ent.setProperty("dbb:color", KI_COLOR[opts.color] ?? 0);
    ent.setProperty("dbb:width", clamp(opts.width ?? 1, 0.1, 8));
    ent.setProperty("dbb:spiral", !!opts.spiral);
    ent.setProperty("dbb:len", 0.5);
  } catch {
    return null;
  }
  const b = {
    ent, owner, ownerId: owner.id, dim, origin, dir: V.norm(opts.dir ?? owner.getViewDirection()), len: 0.5, range: opts.range ?? 36,
    width: opts.width ?? 1, power: opts.power ?? 30, pierce: !!opts.pierce, candy: !!opts.candy, color: opts.color ?? "blue",
    speed: opts.instant ? opts.range : (opts.speed ?? 2.8), age: 0, duration: opts.duration ?? 34, hitTimes: new Map(),
    clash: null, firePose: opts.firePose ?? "beam_fire", dealt: new Map(), done: false, name: opts.name ?? null,
  };
  beams.set(ent.id, b);
  sound(dim, "dbb.beam_fire", origin, 2.5 + b.width * 0.4);
  return b;
}

function stepBeam(b) {
  b.age++;
  if (!isValid(b.ent)) return false;
  if (!isValid(b.owner)) return endBeam(b, false);
  b.origin = handOrigin(b.owner);
  const want = V.norm(b.owner.getViewDirection());
  b.dir = V.norm(V.lerp(b.dir, want, b.clash ? 0.02 : 0.18));
  setPose(b.owner, b.firePose);
  if (b.clash) return stepClash(b);
  let maxLen = b.range;
  try {
    const hit = b.dim.getBlockFromRay(b.origin, b.dir, { maxDistance: Math.min(b.range, b.len + b.speed), includeLiquidBlocks: false, includePassableBlocks: false });
    if (hit) maxLen = Math.min(maxLen, V.dist(b.origin, V.add(hit.block.location, { x: 0.5, y: 0.5, z: 0.5 })));
  } catch {
    // ignore
  }
  b.len = Math.min(maxLen, b.len + b.speed);
  const r = Math.max(0.6, b.width * 0.75);
  const tip = V.add(b.origin, V.mul(b.dir, b.len));
  const candidates = [];
  try {
    for (const h of b.dim.getEntitiesFromRay(b.origin, b.dir, { maxDistance: b.len, excludeTypes: SKIP_TYPES })) candidates.push(h.entity);
  } catch {
    // ignore
  }
  for (const e of b.dim.getEntities({ location: tip, maxDistance: r + 1, excludeTypes: SKIP_TYPES })) candidates.push(e);
  const mid = V.add(b.origin, V.mul(b.dir, b.len * 0.5));
  for (const e of b.dim.getEntities({ location: mid, maxDistance: b.len * 0.5 + r + 1.5, excludeTypes: SKIP_TYPES })) {
    const rel = V.sub(V.up(e.location, 1), b.origin);
    const along = V.dot(rel, b.dir);
    const perp = V.len(V.sub(rel, V.mul(b.dir, along)));
    if (along > 0 && along < b.len && perp < r + 0.8) candidates.push(e);
  }
  const now = system.currentTick;
  let blocked = Infinity;
  for (const e of candidates) {
    if (!isValid(e) || e.id === b.ownerId) continue;
    if (!isHostile(b.owner, e)) continue;
    const along = V.dot(V.sub(V.up(e.location, 1), b.origin), b.dir);
    if (!b.pierce && along > blocked) continue;
    const last = b.hitTimes.get(e.id) ?? -100;
    if (now - last < 6) {
      if (!b.pierce) blocked = Math.min(blocked, along);
      continue;
    }
    b.hitTimes.set(e.id, now);
    if (b.candy && tryCandy(e, b.owner)) continue;
    const first = !b.dealt.has(e.id);
    const share = first ? 0.45 : 0.14;
    b.dealt.set(e.id, (b.dealt.get(e.id) ?? 0) + share);
    if ((b.dealt.get(e.id) ?? 0) <= 1.2) {
      hurt(e, b.power * share, b.owner, { knock: { dir: b.dir, h: 0.5 + b.width * 0.3, v: 0.2 }, label: b.name, beam: true });
    }
    particle(b.dim, "dbb:impact", V.up(e.location, 1), b.color, 1.5 + b.width);
    if (!b.pierce) blocked = Math.min(blocked, along);
  }
  if (!b.pierce && blocked < b.len) b.len = Math.max(1, blocked);
  for (const o of beams.values()) {
    if (o === b || o.clash || o.done || o.dim.id !== b.dim.id) continue;
    if (o.ownerId === b.ownerId) continue;
    const otip = V.add(o.origin, V.mul(o.dir, o.len));
    const mytip = V.add(b.origin, V.mul(b.dir, b.len));
    if (V.dot(o.dir, b.dir) < -0.4 && V.dist(otip, mytip) < (o.width + b.width) * 0.9 + 1.6) {
      startClash(b, o);
      return true;
    }
  }
  updateBeamEntity(b);
  if (b.age % 3 === 0) {
    const t2 = V.add(b.origin, V.mul(b.dir, b.len));
    particle(b.dim, "dbb:explosion_core", t2, b.color, 0.6 + b.width * 0.6);
    deco(b.dim, "dbb:ki_spark", b.origin, b.color, 1);
    if (b.len < b.range - 0.5 && b.width >= 0.8 && b.age % 6 === 0) carve(b.dim, t2, Math.min(4, b.width * 1.3));
  }
  if (b.age % 8 === 0) shakeArea(b.dim, b.origin, 24, 0.15 + b.width * 0.08, 0.3);
  if (b.age >= b.duration) return endBeam(b, true);
  return true;
}

function updateBeamEntity(b) {
  try {
    b.ent.teleport(b.origin);
    const rot = dirToRot(b.dir);
    b.ent.setProperty("dbb:len", clamp(b.len, 0, 80));
    b.ent.setProperty("dbb:pitch", clamp(rot.pitch, -180, 180));
    b.ent.setProperty("dbb:yaw", clamp(rot.yaw, -360, 360));
  } catch {
    // ignore
  }
}

function endBeam(b, explodeTip) {
  if (b.done) return false;
  b.done = true;
  if (explodeTip) {
    const tip = V.add(b.origin, V.mul(b.dir, b.len));
    explode(b.dim, tip, Math.max(1.5, b.width * 2.4), b.power * 0.35, b.owner, b.color);
  }
  if (isValid(b.owner)) setPose(b.owner, "none");
  remove(b.ent);
  emit("beamEnd", b);
  return false;
}

/* --------------------------------------------------------------------------------- beam struggle */

function startClash(a, o) {
  const c = { a, b: o, s: 0, ticks: 0, point: null, swing: rand(-0.3, 0.3) };
  a.clash = c;
  o.clash = c;
  for (const side of [a, o]) side.duration = side.age + 260;
  sound(a.dim, "dbb.clash", a.origin, 3);
  emit("beamClash", a, o);
}

function pushPower(side, c) {
  const pl = Math.log10(Math.max(10, powerOfAny(side.owner)));
  // the struggle sways back and forth before someone breaks through
  const sway = 1 + Math.sin((c.ticks + (side === c.a ? 0 : 20)) / 14) * 0.45;
  return pl * (side.power / 40) * rand(0.6, 1.4) * sway;
}

function stepClash(b) {
  const c = b.clash;
  if (c.a !== b) {
    if (c.point) {
      b.len = Math.max(0.5, V.dist(b.origin, c.point));
      b.dir = V.norm(V.sub(c.point, b.origin));
    }
    updateBeamEntity(b);
    return !c.over;
  }
  c.ticks++;
  const A = c.a;
  const B = c.b;
  if (!isValid(A.ent) || !isValid(B.ent) || B.done) return finishClash(c, A);
  if (!isValid(B.owner)) return finishClash(c, A);
  const pa = pushPower(A, c);
  const pb = pushPower(B, c);
  c.s = clamp(c.s + (pa - pb) * 0.01 + c.swing * 0.004, -1, 1);
  if (c.ticks % 40 === 0) c.swing = rand(-0.5, 0.5);
  const t = 0.5 + c.s * 0.45;
  c.point = V.lerp(A.origin, B.origin, t);
  A.len = Math.max(0.5, V.dist(A.origin, c.point));
  A.dir = V.norm(V.sub(c.point, A.origin));
  updateBeamEntity(A);
  if (c.ticks % 2 === 0) {
    particle(A.dim, "dbb:explosion_core", c.point, A.color, 2.2 + A.width);
    particle(A.dim, "dbb:explosion_core", c.point, B.color, 2.2 + B.width);
    deco(A.dim, "dbb:lightning", V.up(c.point, -1), "white", 1.4);
  }
  if (c.ticks % 6 === 0) {
    particle(A.dim, "dbb:shockwave", c.point, "white", 2 + (A.width + B.width) * 0.5);
    deco(A.dim, "dbb:dust_rise", V.up(c.point, -2), "white", 2);
  }
  if (c.ticks % 10 === 0) {
    shakeArea(A.dim, c.point, 40, 0.6, 0.5);
    sound(A.dim, "dbb.struggle", c.point, 3);
  }
  emit("beamClashTick", c);
  if (c.s >= 0.98) return finishClash(c, A);
  if (c.s <= -0.98) return finishClash(c, B);
  if (c.ticks > 240) return finishClash(c, c.s >= 0 ? A : B);
  return true;
}

function finishClash(c, winner) {
  c.over = true;
  const loser = winner === c.a ? c.b : c.a;
  winner.clash = null;
  loser.clash = null;
  endBeam(loser, false);
  if (isValid(loser.owner)) {
    hurt(loser.owner, winner.power * 1.4, winner.owner, { knock: { dir: winner.dir, h: 2.4, v: 0.6 }, hitstop: 4, label: winner.name });
    explode(winner.dim, V.up(loser.owner.location, 1), Math.max(2.5, winner.width * 3), winner.power * 0.5, winner.owner, winner.color);
  }
  winner.duration = winner.age + 16;
  emit("beamClashEnd", winner, loser);
  return winner === c.a;
}

/* ======================================================================================= candy */

/** Buu's beam: a fighter on its last legs turns into sweets (a knock-out); others just take the hit. */
function tryCandy(e, owner) {
  if (!isValid(e) || e.typeId !== "dbb:fighter") return false;
  let frac = 1;
  try {
    const h = e.getComponent("minecraft:health");
    frac = h.currentValue / h.effectiveMax;
  } catch {
    return false;
  }
  if (frac > 0.3) return false;
  const loc = e.location;
  const dim = e.dimension;
  particle(dim, "dbb:pop_smoke", loc, "pink", 1.5);
  sound(dim, "dbb.capsule", loc, 1.2);
  try {
    const items = ["minecraft:cake", "minecraft:cookie", "minecraft:pumpkin_pie"];
    dim.spawnItem(new ItemStack(items[Math.floor(Math.random() * items.length)], 1 + Math.floor(Math.random() * 3)), loc);
  } catch {
    // ignore
  }
  emit("candied", e, owner);
  return true;
}

/* ======================================================================================= loop */

system.runInterval(() => {
  for (const [id, b] of blasts) {
    let ok = false;
    try {
      ok = stepBlast(b);
    } catch {
      ok = false;
    }
    if (!ok) {
      blasts.delete(id);
      remove(b.ent);
    }
  }
  for (const [id, b] of beams) {
    let ok = false;
    try {
      ok = b.done ? false : stepBeam(b);
    } catch {
      ok = false;
    }
    if (!ok) {
      if (!b.done) endBeam(b, false);
      beams.delete(id);
    }
  }
}, 1);

/** Remove projectile entities that no longer belong to anything (after a reload, or when a match ends). */
export function cleanupStray(dim) {
  try {
    for (const e of dim.getEntities({ families: ["dbb_fx"] })) {
      if (!blasts.has(e.id) && !beams.has(e.id)) e.remove();
    }
  } catch {
    // ignore
  }
}

/** End everything in flight (match over). */
export function clearAll() {
  for (const b of blasts.values()) remove(b.ent);
  blasts.clear();
  for (const b of beams.values()) {
    b.done = true;
    remove(b.ent);
  }
  beams.clear();
}

export function activeBeamOf(entity) {
  for (const b of beams.values()) if (b.ownerId === entity.id && !b.done) return b;
  return null;
}

export function blastsNear(loc, radius) {
  const out = [];
  for (const b of blasts.values()) if (V.dist(b.pos, loc) < radius) out.push(b);
  return out;
}

/** Send a blast back where it came from (deflects and barriers). */
export function deflect(b, by, dir) {
  b.owner = by;
  b.ownerId = by.id;
  b.dir = V.norm(dir);
  b.hit.clear();
  b.homing = false;
  b.guided = false;
  particle(b.dim, "dbb:impact", b.pos, b.color, 1.5);
  sound(b.dim, "dbb.guard", b.pos, 1.2);
}

export function setBlastOwnerAim(b, aim) {
  b.dir = V.norm(V.sub(aim, b.pos));
}

export { knock };
