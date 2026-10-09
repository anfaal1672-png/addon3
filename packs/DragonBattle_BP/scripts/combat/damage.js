import { system, world, EntityDamageCause } from "@minecraft/server";
import { settings } from "../core/settings.js";
import { V, clamp, isValid } from "../core/util.js";
import { emit } from "../core/bus.js";
import { isBattler, isEnemy } from "./teams.js";

/* Damage between fighters: power-level scaling, knock-outs instead of deaths, hit-stop, knockback. */

const plCache = new Map();
const now = () => system.currentTick;

export function setPL(e, pl) {
  plCache.set(e.id, pl);
  try {
    e.setDynamicProperty("dbb:pl", pl);
  } catch {
    // ignore
  }
}

export function powerOf(e) {
  if (!isValid(e)) return 1;
  if (e.typeId === "minecraft:player") return 5000;
  let pl = plCache.get(e.id);
  if (pl === undefined) {
    try {
      const v = e.getDynamicProperty("dbb:pl");
      pl = typeof v === "number" ? v : 100;
    } catch {
      pl = 100;
    }
    plCache.set(e.id, pl);
  }
  return pl;
}

export function meleeOf(e) {
  try {
    const v = e.getDynamicProperty("dbb:melee");
    return typeof v === "number" ? v : 6;
  } catch {
    return 6;
  }
}

/* Fights are meant to be watched: an even match lasts a minute or two, and a big gap in power still makes a
 * fight (the weaker side can transform, awaken and come back) instead of a three-second knock-out. */
const DAMAGE_SCALE = 0.35;

export function scaledDamage(base, attacker, target) {
  if (!attacker || !isValid(attacker) || settings().balance) return base * DAMAGE_SCALE;
  const ratio = clamp(Math.pow(powerOf(attacker) / Math.max(1, powerOf(target)), 0.22), 0.3, 3);
  return base * ratio * DAMAGE_SCALE;
}

/** May something fired by owner hurt target? Spectators are safe unless the setting says otherwise. */
export function isHostile(owner, target) {
  if (!isValid(target) || (owner && owner.id === target.id)) return false;
  const t = target.typeId;
  if (t === "dbb:ki_blast" || t === "dbb:beam" || t === "minecraft:item" || t === "minecraft:xp_orb") return false;
  if (isKO(target)) return false;
  if (t === "minecraft:player" && !isBattler(target)) return !settings().safety;
  if (!owner || !isValid(owner)) return isBattler(target);
  return isEnemy(owner, target);
}

/* ------------------------------------------------------------------------------- holds (hit-stop, transforms) */

const holdUntil = new Map(); // id -> tick

/** Freeze an entity in place for a few ticks (stacking takes the later end). */
export function hold(e, ticks) {
  if (!isValid(e) || e.typeId === "minecraft:player") return;
  const end = now() + ticks;
  if ((holdUntil.get(e.id) ?? 0) < end) holdUntil.set(e.id, end);
  try {
    e.triggerEvent("dbb:freeze");
    e.clearVelocity();
  } catch {
    // ignore
  }
}

export function isHeld(e) {
  return (holdUntil.get(e.id) ?? 0) > now();
}

system.runInterval(() => {
  const t = now();
  for (const [id, end] of holdUntil) {
    if (end > t) continue;
    holdUntil.delete(id);
    const e = world.getEntity(id);
    if (e && isValid(e)) {
      try {
        e.triggerEvent("dbb:unfreeze");
      } catch {
        // ignore
      }
    }
  }
}, 1);

/* ------------------------------------------------------------------------------- knockback */

export function knock(target, dir, h, v) {
  try {
    const d = V.norm({ x: dir.x, y: 0, z: dir.z });
    if (target.typeId === "minecraft:player") {
      target.applyKnockback({ x: d.x * h, z: d.z * h }, v);
    } else {
      const kr = target.getComponent("minecraft:knockback_resistance");
      const f = 1 - (kr?.value ?? 0) * 0.6;
      target.applyImpulse({ x: d.x * h * f, y: v * f, z: d.z * h * f });
    }
  } catch {
    // ignore
  }
  if (h >= 1.4 && target.typeId === "dbb:fighter") emit("launched", target, h);
}

/* ------------------------------------------------------------------------------- knock-outs */

const knocked = new Set();

export function isKO(e) {
  try {
    return knocked.has(e.id) || e.hasTag("dbb_ko");
  } catch {
    return false;
  }
}

export function clearKO(e) {
  knocked.delete(e.id);
  try {
    e.removeTag("dbb_ko");
  } catch {
    // ignore
  }
}

function knockOut(victim, attacker) {
  if (isKO(victim)) return;
  knocked.add(victim.id);
  try {
    victim.addTag("dbb_ko");
    victim.getComponent("minecraft:health")?.setCurrentValue(1);
  } catch {
    // ignore
  }
  emit("ko", victim, attacker);
}

/* ------------------------------------------------------------------------------- hurting */

/** @type {(target: any, attacker: any, amount: number, opts: any) => number} */
let defenseHook = (t, a, amount) => amount;
export function setDefenseHook(fn) {
  defenseHook = fn;
}

const expected = new Map(); // id -> tick of our own applyDamage

/**
 * Deal base damage (scaled by power levels) from attacker to target.
 * opts: raw (skip scaling), knock {dir,h,v}, hitstop (ticks), heavy, label, unblockable
 */
export function hurt(target, base, attacker, opts = {}) {
  if (!isValid(target) || isKO(target)) return 0;
  let amount = opts.raw ? base : scaledDamage(base, attacker, target);
  if (target.typeId === "dbb:fighter") amount = defenseHook(target, attacker, amount, opts);
  if (amount <= 0) return 0;
  if (target.typeId === "minecraft:player") {
    try {
      target.applyDamage(Math.min(amount, 12), { cause: EntityDamageCause.entityAttack, damagingEntity: isValid(attacker) ? attacker : undefined });
    } catch {
      // ignore
    }
    if (opts.knock) knock(target, opts.knock.dir, Math.min(1.2, opts.knock.h ?? 0.8), Math.min(0.6, opts.knock.v ?? 0.3));
    return amount;
  }
  let h;
  try {
    h = target.getComponent("minecraft:health");
  } catch {
    return 0;
  }
  if (!h) return 0;
  const ko = h.currentValue - amount <= 1;
  if (ko) knockOut(target, attacker);
  else {
    expected.set(target.id, now());
    try {
      target.applyDamage(amount, { cause: EntityDamageCause.entityAttack, damagingEntity: isValid(attacker) ? attacker : undefined });
    } catch {
      h.setCurrentValue(Math.max(1, h.currentValue - amount));
    }
  }
  emit("hurt", target, attacker, amount, opts, ko);
  const k = opts.knock;
  if (k) {
    const hs = opts.hitstop ?? 0;
    if (hs > 0) {
      hold(target, hs);
      if (isValid(attacker)) hold(attacker, hs);
      system.runTimeout(() => isValid(target) && knock(target, k.dir, ko ? Math.max(1.6, k.h ?? 0.8) : k.h ?? 0.8, ko ? 0.6 : k.v ?? 0.3), hs + 1);
    } else knock(target, k.dir, ko ? Math.max(1.6, k.h ?? 0.8) : k.h ?? 0.8, ko ? 0.6 : k.v ?? 0.3);
  }
  return amount;
}

/* Engine melee (the chase-and-swing behaviour) lands a token 1 damage; turn it into a real, scaled blow. */
world.afterEvents.entityHurt.subscribe((ev) => {
  const victim = ev.hurtEntity;
  const t = now();
  const exp = expected.get(victim.id);
  if (exp !== undefined && t - exp <= 1) {
    expected.delete(victim.id);
    return;
  }
  const attacker = ev.damageSource.damagingEntity;
  if (victim.typeId !== "dbb:fighter" || attacker?.typeId !== "dbb:fighter") return;
  if (ev.damageSource.cause !== EntityDamageCause.entityAttack) return;
  let h;
  try {
    h = victim.getComponent("minecraft:health");
  } catch {
    return;
  }
  if (!h || h.currentValue <= 0) return;
  let want = defenseHook(victim, attacker, scaledDamage(meleeOf(attacker) * 0.7, attacker, victim), {});
  const next = h.currentValue + ev.damage - want;
  if (next <= 1) knockOut(victim, attacker);
  else {
    try {
      h.setCurrentValue(Math.min(h.effectiveMax, next));
    } catch {
      // ignore
    }
  }
  emit("hurt", victim, attacker, want, { melee: true }, next <= 1);
});

world.afterEvents.entityDie.subscribe((ev) => {
  const dead = ev.deadEntity;
  plCache.delete(dead.id);
  knocked.delete(dead.id);
  holdUntil.delete(dead.id);
  if (dead.typeId === "dbb:fighter") emit("fighterGone", dead.id);
});

world.afterEvents.entityRemove.subscribe((ev) => {
  plCache.delete(ev.removedEntityId);
  knocked.delete(ev.removedEntityId);
  holdUntil.delete(ev.removedEntityId);
});
