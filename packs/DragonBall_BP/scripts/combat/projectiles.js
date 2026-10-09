import { system, ItemStack } from "@minecraft/server";
import { KI_COLOR } from "../gen/catalog.js";
import { settings, rt } from "../core/data.js";
import { V, clamp, dirToRot, isValid, rand } from "../core/util.js";
import { particle, sound, boom, shakeArea, psound } from "../core/fx.js";
import { hurt, isHostile, powerOfAny, knock } from "./damage.js";
import { setPose } from "./forms.js";
import { emit } from "../core/bus.js";

const SKIP_TYPES = ["minecraft:item", "minecraft:xp_orb", "dbz:ki_blast", "dbz:beam", "dbz:dragon", "minecraft:armor_stand",
  "dbz:kintoun", "dbz:aircar", "dbz:spaceship"];
const UNBREAKABLE = new Set(["minecraft:bedrock", "minecraft:barrier", "minecraft:command_block", "minecraft:chain_command_block",
  "minecraft:repeating_command_block", "minecraft:structure_block", "minecraft:end_portal_frame", "minecraft:end_portal",
  "minecraft:portal", "minecraft:obsidian", "minecraft:reinforced_deepslate", "minecraft:chest", "minecraft:barrel",
  "minecraft:light_block", "dbz:htc_floor", "dbz:gravity_machine", "dbz:zsword_stone"]);

/** @type {(dim: any, loc: any, r: number) => boolean} */
let protector = () => false;
export function setProtector(fn) {
  protector = fn;
}

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
    ent = dim.spawnEntity("dbz:ki_blast", from);
    ent.setProperty("dbz:color", KI_COLOR[opts.color] ?? 0);
    ent.setProperty("dbz:shape", opts.shape ?? 0);
    ent.setProperty("dbz:size", clamp(opts.size ?? 0.6, 0.1, 12));
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
      if (b.owner && !isHostile(b.owner, e)) continue;
      if (!b.owner && e.typeId !== "minecraft:player") continue;
      b.hit.add(e.id);
      if (b.candy && tryCandy(e, b.owner)) continue;
      hurt(e, b.power, b.owner, { knock: { dir: b.dir, h: 0.6 + b.size * 0.2, v: 0.25 } });
      particle(b.dim, "dbz:impact", b.pos, b.color, 1 + b.size);
      if (!b.pierce) return explodeBlast(b);
    }
  }
  try {
    b.ent.teleport(b.pos);
  } catch {
    return false;
  }
  if (b.age % 2 === 0) particle(b.dim, "dbz:trail", b.pos, b.color, Math.max(0.5, b.size));
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
      if (owner && !isHostile(owner, e)) continue;
      if (!owner && e.typeId !== "minecraft:player") continue;
      const d = V.dist(e.location, pos);
      const f = clamp(1 - d / (radius + 1), 0.25, 1);
      hurt(e, power * f, owner, { knock: { dir: V.sub(e.location, pos), h: 0.4 + radius * 0.15, v: 0.35 + radius * 0.04 } });
    }
  }
  if (settings().terrain && radius >= 2) carve(dim, pos, Math.min(9, radius * 0.75));
}

export function carve(dim, center, radius) {
  if (protector(dim, center, radius)) return;
  const c = V.floor(center);
  const r = Math.ceil(radius);
  system.runJob((function* () {
    let n = 0;
    for (let y = r; y >= -r; y--) {
      for (let x = -r; x <= r; x++) {
        for (let z = -r; z <= r; z++) {
          const d2 = x * x + y * y * 1.4 + z * z;
          if (d2 > radius * radius) continue;
          const loc = { x: c.x + x, y: c.y + y, z: c.z + z };
          try {
            const b = dim.getBlock(loc);
            if (!b || b.isAir || UNBREAKABLE.has(b.typeId)) continue;
            if (d2 > (radius - 1.2) * (radius - 1.2) && y < 0) {
              if (Math.random() < 0.35 && !b.isLiquid) b.setType(Math.random() < 0.5 ? "minecraft:coarse_dirt" : "minecraft:basalt");
            } else if (!b.isLiquid) {
              b.setType("minecraft:air");
            }
          } catch {
            // unloaded
          }
          if (++n % 48 === 0) yield;
        }
      }
    }
  })());
}

/* ======================================================================================= beams */

const beams = new Map();
const mash = new Map();

export function registerMash(p) {
  mash.set(p.id, (mash.get(p.id) ?? 0) + 1);
}

/**
 * opts: color, width, range, power, pierce, spiral, candy, duration, speed, instant, techId, firePose
 */
export function fireBeam(owner, opts) {
  const dim = owner.dimension;
  const origin = handOrigin(owner);
  let ent;
  try {
    ent = dim.spawnEntity("dbz:beam", origin);
    ent.setRotation({ x: 0, y: 0 });
    ent.setProperty("dbz:color", KI_COLOR[opts.color] ?? 0);
    ent.setProperty("dbz:width", clamp(opts.width ?? 1, 0.1, 8));
    ent.setProperty("dbz:spiral", !!opts.spiral);
    ent.setProperty("dbz:len", 0.5);
  } catch {
    return null;
  }
  const b = {
    ent, owner, ownerId: owner.id, dim, origin, dir: V.norm(owner.getViewDirection()), len: 0.5, range: opts.range ?? 32,
    width: opts.width ?? 1, power: opts.power ?? 30, pierce: !!opts.pierce, candy: !!opts.candy, color: opts.color ?? "blue",
    speed: opts.instant ? opts.range : (opts.speed ?? 2.6), age: 0, duration: opts.duration ?? 34, hitTimes: new Map(),
    clash: null, techId: opts.techId, firePose: opts.firePose ?? "beam_fire", ownerPL: powerOfAny(owner), dealt: new Map(),
    done: false,
  };
  beams.set(ent.id, b);
  sound(dim, "dbz.beam_fire", origin, 2.5);
  if (owner.typeId === "minecraft:player") rt(owner).beam = b;
  return b;
}

function stepBeam(b) {
  b.age++;
  if (!isValid(b.ent)) return false;
  if (!isValid(b.owner) || (b.owner.typeId === "minecraft:player" && rt(b.owner).dead)) return endBeam(b, false);
  // follow the caster
  b.origin = handOrigin(b.owner);
  const want = V.norm(b.owner.getViewDirection());
  b.dir = V.norm(V.lerp(b.dir, want, b.clash ? 0.02 : 0.18));
  setPose(b.owner, b.firePose, 4);
  if (b.clash) return stepClash(b);
  // extend
  let maxLen = b.range;
  try {
    const hit = b.dim.getBlockFromRay(b.origin, b.dir, { maxDistance: Math.min(b.range, b.len + b.speed), includeLiquidBlocks: false, includePassableBlocks: false });
    if (hit) maxLen = Math.min(maxLen, V.dist(b.origin, V.add(hit.block.location, { x: 0.5, y: 0.5, z: 0.5 })));
  } catch {
    // ignore
  }
  b.len = Math.min(maxLen, b.len + b.speed);
  // entity hits along the beam
  const r = Math.max(0.6, b.width * 0.75);
  const tip = V.add(b.origin, V.mul(b.dir, b.len));
  const candidates = [];
  try {
    for (const h of b.dim.getEntitiesFromRay(b.origin, b.dir, { maxDistance: b.len, excludeTypes: SKIP_TYPES })) candidates.push(h.entity);
  } catch {
    // ignore
  }
  for (const e of b.dim.getEntities({ location: tip, maxDistance: r + 1, excludeTypes: SKIP_TYPES })) candidates.push(e);
  if (b.width >= 1.5) {
    const mid = V.add(b.origin, V.mul(b.dir, b.len * 0.5));
    for (const e of b.dim.getEntities({ location: mid, maxDistance: Math.min(b.len * 0.5, r + 1.5), excludeTypes: SKIP_TYPES })) {
      // keep only those near the axis
      const rel = V.sub(V.up(e.location, 1), b.origin);
      const along = V.dot(rel, b.dir);
      const perp = V.len(V.sub(rel, V.mul(b.dir, along)));
      if (along > 0 && along < b.len && perp < r + 0.8) candidates.push(e);
    }
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
      hurt(e, b.power * share, b.owner, { knock: { dir: b.dir, h: 0.5 + b.width * 0.25, v: 0.15 } });
    }
    particle(b.dim, "dbz:impact", V.up(e.location, 1), b.color, 1.5 + b.width);
    if (!b.pierce) blocked = Math.min(blocked, along);
  }
  if (!b.pierce && blocked < b.len) b.len = Math.max(1, blocked);
  // check beam clash with other beams
  for (const o of beams.values()) {
    if (o === b || o.clash || o.done || o.dim.id !== b.dim.id) continue;
    if (o.ownerId === b.ownerId) continue;
    const otip = V.add(o.origin, V.mul(o.dir, o.len));
    const mytip = V.add(b.origin, V.mul(b.dir, b.len));
    if (V.dot(o.dir, b.dir) < -0.4 && V.dist(otip, mytip) < (o.width + b.width) * 0.9 + 1.2) {
      startClash(b, o);
      return true;
    }
  }
  updateBeamEntity(b);
  if (b.age % 3 === 0) {
    const t2 = V.add(b.origin, V.mul(b.dir, b.len));
    particle(b.dim, "dbz:explosion_core", t2, b.color, 0.6 + b.width * 0.6);
    particle(b.dim, "dbz:ki_spark", b.origin, b.color, 1);
    if (b.len < b.range - 0.5 && settings().terrain && b.width >= 0.8 && b.age % 6 === 0) carve(b.dim, t2, Math.min(4, b.width * 1.3));
  }
  if (b.age >= b.duration) return endBeam(b, true);
  return true;
}

function updateBeamEntity(b) {
  try {
    b.ent.teleport(b.origin);
    const rot = dirToRot(b.dir);
    b.ent.setProperty("dbz:len", clamp(b.len, 0, 80));
    b.ent.setProperty("dbz:pitch", clamp(rot.pitch, -180, 180));
    b.ent.setProperty("dbz:yaw", clamp(rot.yaw, -360, 360));
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
  if (isValid(b.owner) && b.owner.typeId === "minecraft:player") {
    const r = rt(b.owner);
    if (r.beam === b) r.beam = null;
    setPose(b.owner, "none");
  }
  remove(b.ent);
  return false;
}

/* --------------------------------------------------------------------------------- beam struggle */

function startClash(a, o) {
  const c = { a, b: o, s: 0, ticks: 0, point: null };
  a.clash = c;
  o.clash = c;
  for (const side of [a, o]) {
    if (isValid(side.owner) && side.owner.typeId === "minecraft:player") {
      rt(side.owner).hudMsg = "§c§l押し合いだ！ ジャンプを連打！";
      rt(side.owner).hudMsgUntil = Date.now() + 3000;
      psound(side.owner, "dbz.clash", 1.5);
    }
    side.duration = side.age + 200;
  }
}

function pushPower(side) {
  const pl = Math.log10(Math.max(10, powerOfAny(side.owner)));
  let input;
  if (isValid(side.owner) && side.owner.typeId === "minecraft:player") {
    input = mash.get(side.ownerId) ?? 0;
    mash.set(side.ownerId, 0);
    input = Math.min(3, input) * 1.0 + 0.15;
  } else {
    input = rand(0.4, 1.6);
  }
  return pl * (side.power / 40) * input;
}

function stepClash(b) {
  const c = b.clash;
  if (c.a !== b) {
    // secondary: just render toward the clash point
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
  const pa = pushPower(A);
  const pb = pushPower(B);
  c.s = clamp(c.s + (pa - pb) * 0.012, -1, 1);
  const t = 0.5 + c.s * 0.45;
  c.point = V.lerp(A.origin, B.origin, t);
  A.len = Math.max(0.5, V.dist(A.origin, c.point));
  A.dir = V.norm(V.sub(c.point, A.origin));
  updateBeamEntity(A);
  if (c.ticks % 2 === 0) {
    particle(A.dim, "dbz:explosion_core", c.point, A.color, 2 + A.width);
    particle(A.dim, "dbz:explosion_core", c.point, B.color, 2 + B.width);
    particle(A.dim, "dbz:lightning", V.up(c.point, -1), "white", 1);
  }
  if (c.ticks % 10 === 0) {
    shakeArea(A.dim, c.point, 30, 0.5, 0.5);
    sound(A.dim, "dbz.clash", c.point, 2);
  }
  for (const side of [A, B]) {
    if (isValid(side.owner) && side.owner.typeId === "minecraft:player") {
      const mine = side === A ? c.s : -c.s;
      const n = Math.round((mine + 1) * 10);
      rt(side.owner).hudMsg = `§c押し合い！ジャンプ連打！ §a${"█".repeat(n)}§c${"█".repeat(20 - n)}`;
      rt(side.owner).hudMsgUntil = Date.now() + 400;
    }
  }
  if (c.s >= 0.98) return finishClash(c, A);
  if (c.s <= -0.98) return finishClash(c, B);
  if (c.ticks > 200) return finishClash(c, c.s >= 0 ? A : B);
  return true;
}

function finishClash(c, winner) {
  c.over = true;
  const loser = winner === c.a ? c.b : c.a;
  winner.clash = null;
  loser.clash = null;
  endBeam(loser, false);
  if (isValid(loser.owner)) {
    hurt(loser.owner, winner.power * 1.4, winner.owner, { knock: { dir: winner.dir, h: 2.2, v: 0.6 } });
    explode(winner.dim, V.up(loser.owner.location, 1), Math.max(2, winner.width * 3), winner.power * 0.5, winner.owner, winner.color);
  }
  if (isValid(winner.owner) && winner.owner.typeId === "minecraft:player") {
    rt(winner.owner).hudMsg = "§a押し勝った！！";
    rt(winner.owner).hudMsgUntil = Date.now() + 1500;
  }
  if (isValid(loser.owner) && loser.owner.typeId === "minecraft:player") {
    rt(loser.owner).hudMsg = "§c押し負けた…！";
    rt(loser.owner).hudMsgUntil = Date.now() + 1500;
  }
  winner.duration = winner.age + 16;
  emit("beamClashEnd", winner, loser);
  return winner === c.a;
}

/* ======================================================================================= candy */

function tryCandy(e, owner) {
  if (!isValid(e) || e.typeId === "minecraft:player") return false;
  try {
    if (e.getDynamicProperty("dbz:boss") === true) return false;
  } catch {
    // ignore
  }
  const h = e.getComponent("minecraft:health");
  if (!h || h.effectiveMax > 120) return false;
  const loc = e.location;
  const dim = e.dimension;
  particle(dim, "dbz:pop_smoke", loc, "pink", 1);
  sound(dim, "dbz.capsule", loc, 1);
  try {
    const items = ["minecraft:cake", "minecraft:cookie", "minecraft:pumpkin_pie"];
    dim.spawnItem(new ItemStack(items[Math.floor(Math.random() * items.length)], 1 + Math.floor(Math.random() * 3)), loc);
  } catch {
    // ignore
  }
  emit("candied", e, owner);
  try {
    e.remove();
  } catch {
    // ignore
  }
  return true;
}

/* ======================================================================================= loop */

system.runInterval(() => {
  for (const [id, b] of blasts) {
    let alive = false;
    try {
      alive = stepBlast(b);
    } catch {
      alive = false;
    }
    if (!alive) {
      blasts.delete(id);
      remove(b.ent);
    }
  }
  for (const [id, b] of beams) {
    let alive = false;
    try {
      alive = b.done ? false : stepBeam(b);
    } catch {
      alive = false;
    }
    if (!alive) {
      if (!b.done) endBeam(b, false);
      beams.delete(id);
    }
  }
}, 1);

/** Remove stray projectile entities left over from a previous session. */
export function cleanupStray(dim) {
  try {
    for (const e of dim.getEntities({ families: ["dbz_fx"] })) {
      if (!blasts.has(e.id) && !beams.has(e.id)) e.remove();
    }
  } catch {
    // ignore
  }
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

export { knock };
