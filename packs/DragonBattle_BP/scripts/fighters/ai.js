import { system, world } from "@minecraft/server";
import { V, isValid, chance, rand, clamp } from "../core/util.js";
import { particle, deco, sound, shakeArea, afterimage } from "../core/fx.js";
import { emit } from "../core/bus.js";
import { paceFactor } from "../core/settings.js";
import { isKO, isHeld, hold, powerOf } from "../combat/damage.js";
import { crackGround } from "../combat/terrain.js";
import { isBattler, nearestEnemy } from "../combat/teams.js";
import { activeBeamOf } from "../combat/projectiles.js";
import { fighters, setFlying, ensureGravity, setPose, setAura, speak, transform, hpFrac } from "./fighter.js";
import { profileOf, styleOf, SPECIALS } from "./roster.js";
import {
  face, rushCombo, fistClash, pursue, dashTo, leapBack, strafe, teleportBehind, tryDeflect, kiAttack, startAct, stepAct,
} from "./moves.js";
import { tryCombo } from "./combos.js";

/* The fighting brain. Every fighter in a battle thinks every 2 ticks: keep moving, read the distance, and pick
 * from blows, rushes, clashes, chases, ki attacks, transformations and signature moves according to its
 * personality. A fighter is never allowed to stand around: if it stops moving for long, it is pushed back in. */

const now = () => system.currentTick;

/** @type {(e: any) => boolean} returns false while a match is paused / in its intro */
let gate = () => true;
export function setGate(fn) {
  gate = fn;
}

system.runInterval(() => {
  for (const s of fighters.values()) {
    try {
      brain(s);
    } catch (err) {
      /** @type {any} */ (globalThis).__dbbErrors?.push(err);
    }
  }
}, 2);

function brain(s) {
  const e = s.e;
  if (!isValid(e)) {
    fighters.delete(s.id);
    return;
  }
  s.tick++;
  if (isKO(e) || !isBattler(e) || s.intro || !gate(e) || s.transforming > 0) return;
  if (isHeld(e)) return;
  if (s.stun > 0) {
    s.stun -= 2;
    if (s.stun % 10 === 0) particle(e.dimension, "dbb:sparkle", V.up(e.location, 2.1), "yellow", 0.8);
    return;
  }
  const t = now();
  if (s.act) {
    stepAct(s);
    return;
  }
  const target = pickTarget(s);
  if (!target) {
    if (s.flying) setFlying(s, false);
    else if (s.tick % 20 === 0) ensureGravity(e);
    return;
  }
  const ts = fighters.get(target.id);
  const dist = V.dist(e.location, target.location);
  const dy = target.location.y - e.location.y;
  if (t < s.busyUntil) {
    if (!activeBeamOf(e)) face(e, V.up(target.location, 1.1));
    return;
  }
  face(e, V.up(target.location, 1.1));
  const prof = profileOf(s.cid);
  const style = styleOf(s.cid);
  const pace = paceFactor();

  if (checkForms(s)) return;
  checkPinch(s);
  if (prof.regen && s.tick % 10 === 0) {
    try {
      const h = e.getComponent("minecraft:health");
      if (h.currentValue < h.effectiveMax) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + h.effectiveMax * prof.regen * 0.5));
    } catch {
      // ignore
    }
  }
  // a rival in the middle of transforming gets its moment
  if (ts && ts.transforming > 0) {
    if (chance(0.1)) strafe(s, target);
    return;
  }

  // flying: follow into the air, and take the fight up there now and then
  const airTarget = ts?.flying || (target.typeId === "minecraft:player" && !target.isOnGround);
  if (prof.fly && !s.flying && s.tick % 25 === 0 && chance(0.18)) s.flyUntil = t + Math.floor(rand(120, 280));
  if (prof.fly && (dy > 2.5 || (airTarget && dy > 1) || t < (s.flyUntil ?? 0))) setFlying(s, true);
  else if (s.flying && dy < 1 && !airTarget && s.tick % 10 === 0) setFlying(s, false);
  if (s.flying) moveFly(s, target, dist);

  if (t - (s.cd.deflect ?? -99) > 30 && chance(0.06 + style.guard * 0.12) && tryDeflect(s)) {
    s.cd.deflect = t;
    s.busyUntil = t + 6;
    return;
  }
  // chase a fighter it just sent flying
  if (s.chase) {
    if (t < s.chase.until && s.chase.id === target.id && chance(0.6)) {
      pursue(s, target);
      return;
    }
    if (t >= s.chase.until) {
      s.chase = null;
      s.chain = 0;
    }
  }
  // signature move
  const firstSpecial = s.started + 80 * pace;
  if (t >= (s.cd.special ?? firstSpecial) && chance(0.1)) {
    const sp = chooseSpecial(s, target, dist);
    if (sp) {
      s.cd.special = t + Math.floor(rand(200, 340) * pace);
      startAct(s, target, sp);
      return;
    }
  }
  // the overwhelming side toys with its prey
  if (style.taunt && powerOf(e) > powerOf(target) * 3 && t - (s.cd.taunt ?? -999) > 300 && chance(style.taunt * 0.06)) {
    s.cd.taunt = t;
    s.guardUntil = t + 30;
    s.busyUntil = t + 30;
    setPose(e, "guard");
    speak(s, "start", ["その程度か？", "退屈だな。", "もっと本気を出したらどうだ？"][Math.floor(rand(0, 3))]);
    emit("taunt", s, target);
    return;
  }
  if (dist < 3.4) closeRange(s, ts, target, style, prof, pace, t);
  else if (dist < 14) midRange(s, target, style, prof, pace, t);
  else farRange(s, target, style, prof, pace, t);
  antiStuck(s, target, dist, t);
}

function pickTarget(s) {
  const t = now();
  if (s.targetId && t < s.targetUntil) {
    const cur = world.getEntity(s.targetId);
    if (cur && isValid(cur) && !isKO(cur) && isBattler(cur)) return cur;
  }
  const next = nearestEnemy(s.e, 80);
  s.targetId = next?.id ?? null;
  s.targetUntil = t + 30;
  return next;
}

function closeRange(s, ts, target, style, prof, pace, t) {
  const e = s.e;
  // both go at it at blinding speed
  if (ts && !ts.act && t >= ts.busyUntil && !isHeld(target) && t - (s.cd.clash ?? -999) > 240 && chance(0.1)) {
    s.cd.clash = t;
    ts.cd.clash = t;
    fistClash(s, ts);
    return;
  }
  if (t < s.guardUntil) return;
  if (chance(style.guard * 0.12)) {
    s.guardUntil = t + 14;
    setPose(e, "guard");
    system.runTimeout(() => isValid(e) && setPose(e, s.flying ? "fly" : "none"), 14);
    return;
  }
  if (prof.tp && chance(0.05)) {
    teleportBehind(s, target);
    return;
  }
  if (t - (s.cd.melee ?? -99) > 14 * pace) {
    s.cd.melee = t;
    if (tryCombo(s, target, pace)) return;
    const rush = chance(0.22 + style.aggro * 0.18);
    rushCombo(s, target, rush ? 3 + Math.floor(rand(0, 3)) : 1 + Math.floor(rand(0, 2)));
    return;
  }
  if (t - (s.cd.leap ?? -99) > 70 * pace && chance(style.range * 0.12)) {
    s.cd.leap = t;
    leapBack(s, target);
    for (const k of Object.keys(s.cd)) if (/^a\d+$/.test(k)) s.cd[k] -= 40;
    return;
  }
  if (chance(0.2)) strafe(s, target);
}

function readyAttacks(s, prof, pace, t, kinds) {
  const out = [];
  (prof.atk ?? []).forEach((a, i) => {
    if (kinds && !kinds.includes(a.kind)) return;
    if (t - (s.cd[`a${i}`] ?? -999) > a.cd * 0.75 * pace) out.push([a, i]);
  });
  return out;
}

function useAtk(s, target, pick, t) {
  const [a, i] = pick;
  s.cd[`a${i}`] = t;
  kiAttack(s, target, a);
}

function midRange(s, target, style, prof, pace, t) {
  // rush in and open with a combo
  if (V.dist(s.e.location, target.location) < 8 && chance(0.04 + style.aggro * 0.06) && tryCombo(s, target, pace)) return;
  const ready = readyAttacks(s, prof, pace, t);
  if (ready.length && chance(0.16 + style.range * 0.22)) {
    useAtk(s, target, ready[Math.floor(Math.random() * ready.length)], t);
    return;
  }
  if (chance(style.aggro * 0.2)) {
    dashTo(s, target, 1.9);
    return;
  }
  if (prof.tp && chance(0.04)) {
    teleportBehind(s, target);
    return;
  }
  if (chance(0.18)) strafe(s, target);
}

function farRange(s, target, style, prof, pace, t) {
  const ready = readyAttacks(s, prof, pace, t);
  const big = ready.filter(([a]) => a.kind === "beam" || a.kind === "ball");
  if ((big.length || ready.length) && chance(0.14 + style.range * 0.2)) {
    const pool = big.length ? big : ready;
    useAtk(s, target, pool[Math.floor(Math.random() * pool.length)], t);
    return;
  }
  if (hpFrac(s.e) < 0.7 && t - (s.cd.powerup ?? -9999) > 600 * pace && chance(0.04)) {
    s.cd.powerup = t;
    powerUp(s);
    return;
  }
  if (!s.flying && chance(0.15 + style.aggro * 0.25)) dashTo(s, target, 2.2);
}

/** Flying: close in to a comfortable distance and drift around the target, never above the ceiling. */
function moveFly(s, target, dist) {
  const e = s.e;
  const style = styleOf(s.cid);
  const keep = 3 + style.range * 6;
  // level with a flying target (aiming above it makes two flyers climb after each other forever)
  const ts = fighters.get(target.id);
  const want = V.add(target.location, { x: 0, y: ts?.flying ? 0 : 1.2, z: 0 });
  if (s.floor !== undefined) want.y = Math.min(want.y, s.floor + MAX_ALT - 2);
  const to = V.sub(want, e.location);
  const prof = profileOf(s.cid);
  const sp = (prof.fast ? 0.55 : 0.38) * (dist > keep + 6 ? 1 : 0.5);
  try {
    if (dist > keep) {
      e.clearVelocity();
      e.applyImpulse(V.mul(V.norm(to), sp));
    } else if (s.tick % 6 === 0) {
      const n = V.norm(to);
      const side = s.tick % 24 < 12 ? { x: -n.z, y: 0, z: n.x } : { x: n.z, y: 0, z: -n.x };
      e.applyImpulse(V.add(V.mul(side, 0.25), { x: 0, y: clamp(to.y * 0.08, -0.15, 0.15), z: 0 }));
    }
  } catch {
    // ignore
  }
  if (s.tick % 6 === 0 && dist > keep + 6) deco(e.dimension, "dbb:trail", e.location, "white", 0.8);
}

/* ------------------------------------------------------------------------------- the ceiling */

/** How high above the ground a fighter may go while fighting. */
export const MAX_ALT = 12;

/** y of the ground under a fighter (top of the first solid block below), or undefined if there is none near. */
function floorBelow(e) {
  const dim = e.dimension;
  try {
    if (typeof dim.getBlockBelow === "function") {
      const b = dim.getBlockBelow(e.location, { maxDistance: 48, includeLiquidBlocks: true, includePassableBlocks: false });
      return b ? b.location.y + 1 : undefined;
    }
    const b = dim.getTopmostBlock({ x: e.location.x, z: e.location.z });
    return b && b.location.y < e.location.y ? b.location.y + 1 : undefined;
  } catch {
    return undefined;
  }
}

/** Keep fighters out of the sky: no endless climbing while fighting, and gravity back on whenever they're not. */
function altitude(s) {
  const e = s.e;
  if (!isValid(e)) return;
  if (!isBattler(e) || isKO(e)) {
    // out of the fight (match over, knocked out, waiting): always fall back to the ground
    if (s.flying) setFlying(s, false);
    else if (s.tick % 10 === 0 && !e.isOnGround) ensureGravity(e);
    return;
  }
  const v = e.getVelocity();
  if (!gate(e)) {
    // paused, intro, result: hang where it is, never drift upwards
    if (v.y > 0.02) e.applyImpulse({ x: 0, y: -v.y, z: 0 });
    return;
  }
  if (s.floor === undefined || s.tick % 3 === 0) s.floor = floorBelow(e);
  const alt = s.floor === undefined ? MAX_ALT * 3 : e.location.y - s.floor;
  // flight has no gravity: give upward motion some drag so knock-ups and dashes don't carry on forever
  if (s.flying && v.y > 0.1) e.applyImpulse({ x: 0, y: -v.y * 0.3, z: 0 });
  if (alt > MAX_ALT + 10 && s.floor !== undefined) {
    e.teleport({ x: e.location.x, y: s.floor + MAX_ALT, z: e.location.z }, { checkForBlocks: true });
    e.clearVelocity();
  } else if (alt > MAX_ALT) {
    e.applyImpulse({ x: 0, y: -Math.max(0, v.y) - 0.12, z: 0 });
  }
}

system.runInterval(() => {
  for (const s of fighters.values()) {
    try {
      altitude(s);
    } catch {
      // ignore
    }
  }
}, 2);

/** Roar, flare the aura, crack the ground: a bit of health back and a short boost. */
function powerUp(s) {
  const e = s.e;
  hold(e, 24);
  s.busyUntil = now() + 26;
  setPose(e, "charge");
  setAura(e, true, s.cid);
  sound(e.dimension, "dbb.charge", e.location, 2.2);
  sound(e.dimension, "dbb.rumble", e.location, 2);
  speak(s, "transform", "はああああ…！");
  for (let i = 0; i < 6; i++) {
    system.runTimeout(() => {
      if (!isValid(e)) return;
      particle(e.dimension, "dbb:aura_rise", e.location, "white", 1.3);
      deco(e.dimension, "dbb:dust_rise", e.location, "white", 1.6);
      if (i % 2 === 0) particle(e.dimension, "dbb:lightning", V.up(e.location, rand(0.4, 2)), "white", 1);
      shakeArea(e.dimension, e.location, 30, 0.3 + i * 0.08, 0.4);
    }, i * 4);
  }
  system.runTimeout(() => {
    if (!isValid(e)) return;
    crackGround(e.dimension, V.up(e.location, -1), 5);
    particle(e.dimension, "dbb:shockwave", e.location, "white", 5);
    sound(e.dimension, "dbb.aura_burst", e.location, 2.5);
    try {
      const h = e.getComponent("minecraft:health");
      h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + h.effectiveMax * 0.08));
    } catch {
      // ignore
    }
    s.buff = { mult: 1.2, until: now() + 200, kind: "power" };
    emit("powerUp", s);
    system.runTimeout(() => isValid(e) && !s.act && setAura(e, false, s.cid), 30);
    setPose(e, s.flying ? "fly" : "none");
  }, 24);
}

/** Transform when the going gets tough (or awaken once if there's nothing to transform into). */
function checkForms(s) {
  const f = hpFrac(s.e);
  // a form chain is defined on the character a fighter started as (goku -> goku_ssj -> goku_blue) and on each form
  const forms = [...(profileOf(s.cid).forms ?? []), ...(profileOf(s.origin).forms ?? [])];
  if (!s.noForms && forms.length) {
    for (const fm of forms) {
      if (fm.to === s.cid || s.formsDone.has(fm.to)) continue;
      if (f <= Math.max(fm.at, 0.2) + 0.15) {
        s.formsDone.add(fm.to);
        transform(s, fm.to);
        return true;
      }
    }
  }
  if (!s.awakened && f < 0.3 && chance(0.5)) {
    s.awakened = true;
    speak(s, "pinch");
    emit("awaken", s);
    powerUp(s);
    s.buff = { mult: 1.35, until: now() + 400, kind: "rage" };
    return true;
  }
  return false;
}

function checkPinch(s) {
  if (s.pinchSaid || hpFrac(s.e) > 0.25) return;
  s.pinchSaid = true;
  speak(s, "pinch");
  emit("pinch", s);
}

/** Pick a signature move that suits the moment. */
function chooseSpecial(s, target, dist) {
  const list = SPECIALS[s.cid] ?? [];
  const f = hpFrac(s.e);
  const tf = hpFrac(target);
  const pool = [];
  for (const sp of list) {
    let w = 1;
    switch (sp.type) {
      case "selfdestruct":
        if (f > 0.35) continue;
        w = 4;
        break;
      case "regen":
        if (f > 0.55) continue;
        w = 2.5;
        break;
      case "buff":
        if (s.buff && now() < s.buff.until) continue;
        w = f < 0.6 ? 2 : 0.7;
        break;
      case "spirit":
        if (dist < 9) continue;
        w = tf < 0.5 ? 2.5 : 0.6;
        break;
      case "beam":
      case "ball":
      case "kikoho":
        w = dist > 5 ? 1.6 : 0.6;
        if (tf < 0.35) w *= 2;
        break;
      case "rush":
      case "meteor":
      case "timeskip":
        w = dist < 10 ? 1.6 : 0.6;
        break;
      case "barrier":
        w = dist < 7 ? 1.4 : 0.3;
        break;
      case "candy":
        w = tf < 0.3 ? 4 : 0.4;
        break;
      default:
        w = 1;
    }
    pool.push([sp, w]);
  }
  if (!pool.length) return null;
  let r = Math.random() * pool.reduce((a, [, w]) => a + w, 0);
  for (const [sp, w] of pool) {
    r -= w;
    if (r <= 0) return sp;
  }
  return pool[pool.length - 1][0];
}

/** Never stand still for long, never stay buried, never wander off. */
function antiStuck(s, target, dist, t) {
  const e = s.e;
  if (s.tick % 10 !== 0) return;
  const moved = V.dist(e.location, s.lastPos ?? e.location);
  s.lastPos = e.location;
  if (moved > 0.4 || dist < 3.4) s.lastMove = t;
  let buried = false;
  try {
    const b = e.dimension.getBlock(V.up(e.location, 1.5));
    buried = !!b && !b.isAir && !b.isLiquid && b.typeId !== "minecraft:short_grass" && b.typeId !== "minecraft:tall_grass";
  } catch {
    // ignore
  }
  if (buried) {
    try {
      e.teleport(V.up(e.location, 2.5), { checkForBlocks: true });
    } catch {
      // ignore
    }
    particle(e.dimension, "dbb:pop_smoke", e.location, "white", 1.4);
    sound(e.dimension, "dbb.impact", e.location, 1);
    return;
  }
  if (t - s.lastMove > 50 || dist > 70 || e.location.y < target.location.y - 25) {
    s.lastMove = t;
    afterimage(e.dimension, e.location, "white");
    const side = V.norm({ x: rand(-1, 1), y: 0, z: rand(-1, 1) });
    try {
      e.teleport(V.add(target.location, V.mul(side, 4)), { checkForBlocks: true, facingLocation: V.up(target.location, 1.1) });
    } catch {
      // ignore
    }
    sound(e.dimension, "dbb.dash", e.location, 1);
  }
}

export { fighters };
