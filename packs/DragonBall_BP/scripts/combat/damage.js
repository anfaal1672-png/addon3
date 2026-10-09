import { world, system, EntityDamageCause } from "@minecraft/server";
import { getData, markDirty, rt, settings } from "../core/data.js";
import { powerOf, addExp, maxKi, applyPassives } from "../core/stats.js";
import { FORMS } from "./formsData.js";
import { emit } from "../core/bus.js";
import { V, clamp, isValid, chance } from "../core/util.js";
import { particle, sound, title, msg, afterimage, shake, flash } from "../core/fx.js";
import { grantFlag, doTransform, refreshVisuals } from "./forms.js";

/* ------------------------------------------------------------------------------- power lookup */

const plCache = new Map();

export function setFighterPL(entity, pl) {
  plCache.set(entity.id, pl);
  try {
    entity.setDynamicProperty("dbz:pl", pl);
  } catch {
    // ignore
  }
}

export function powerOfAny(e) {
  if (!isValid(e)) return 1;
  if (e.typeId === "minecraft:player") return powerOf(e);
  let pl = plCache.get(e.id);
  if (pl === undefined) {
    try {
      const v = e.getDynamicProperty("dbz:pl");
      if (typeof v === "number") pl = v;
    } catch {
      // ignore
    }
    if (pl === undefined) {
      try {
        const h = e.getComponent("minecraft:health");
        pl = (h?.effectiveMax ?? 10) * 3 + 5;
      } catch {
        pl = 30;
      }
    }
    plCache.set(e.id, pl);
  }
  return pl;
}

export function families(e) {
  try {
    const tf = e.getComponent("minecraft:type_family");
    return tf ? tf.getTypeFamilies() : [];
  } catch {
    return [];
  }
}

export function hasFamily(e, fam) {
  try {
    return !!e.getComponent("minecraft:type_family")?.hasTypeFamily(fam);
  } catch {
    return false;
  }
}

/** Should `owner`'s attacks hurt `target`? */
export function isHostile(owner, target) {
  if (!isValid(owner) || !isValid(target)) return isValid(target);
  if (owner.id === target.id) return false;
  const tFam = families(target);
  if (tFam.includes("dbz_fx") || tFam.includes("dbz_vehicle") || tFam.includes("dbz_npc") || tFam.includes("dbz_dummy") && owner.typeId !== "minecraft:player") return false;
  if (target.typeId === "minecraft:item" || target.typeId === "minecraft:xp_orb" || target.typeId === "minecraft:armor_stand") return false;
  if (owner.typeId === "minecraft:player") {
    if (target.typeId === "minecraft:player") {
      if (!settings().pvp) return false;
      const ro = rt(owner);
      const rtg = rt(target);
      if (ro.fusionPartner === target.id || rtg.fusionPartner === owner.id) return false;
      return true;
    }
    if (tFam.includes("dbz_ally")) return false;
    return true;
  }
  const oFam = families(owner);
  if (oFam.includes("dbz_ally")) {
    return tFam.includes("dbz_enemy") || tFam.includes("monster");
  }
  if (oFam.includes("dbz_enemy") || oFam.includes("dbz_spar")) {
    return target.typeId === "minecraft:player" || tFam.includes("dbz_ally");
  }
  return true;
}

/* ------------------------------------------------------------------------------- damage */

const expected = new Map(); // entity id -> tick of scripted damage
const lastHurtTick = new Map();
const lastAttacker = new Map(); // victim id -> {id, tick}

export function scaledDamage(base, attacker, target) {
  const a = powerOfAny(attacker);
  const t = powerOfAny(target);
  let ratio = clamp(Math.pow(a / Math.max(1, t), 0.32), 0.12, 8);
  let dmg = base * ratio;
  const s = settings();
  if (attacker && attacker.typeId !== "minecraft:player" && target.typeId === "minecraft:player") dmg *= s.difficulty;
  if (attacker && attacker.typeId === "minecraft:player" && target.typeId !== "minecraft:player") dmg /= Math.sqrt(s.difficulty);
  return dmg;
}

function resistFactor(e) {
  try {
    const eff = e.getEffect("resistance");
    if (!eff) return 1;
    return clamp(1 - 0.2 * (eff.amplifier + 1), 0, 1);
  } catch {
    return 1;
  }
}

/**
 * Deal script damage. `base` is scaled by power levels unless opts.raw.
 * opts: { raw, knock: {dir, h, v}, cause, noScale, fromTech }
 */
export function hurt(target, base, attacker, opts = {}) {
  if (!isValid(target)) return 0;
  let amount = opts.raw ? base : scaledDamage(base, attacker, target);
  if (amount <= 0) return 0;
  const now = system.currentTick;
  if (attacker && attacker.typeId === "minecraft:player") {
    lastAttacker.set(target.id, { id: attacker.id, tick: now });
    rt(attacker).lastTargetId = target.id;
  }
  // defender-side hooks (dodge / guard) for players
  if (target.typeId === "minecraft:player") {
    const res = preDefend(target, attacker, amount);
    if (res <= 0) return 0;
    amount = res;
  }
  let health;
  try {
    health = target.getComponent("minecraft:health");
  } catch {
    return 0;
  }
  if (!health) return 0;
  const lh = lastHurtTick.get(target.id) ?? -100;
  const canApply = now - lh >= 10;
  expected.set(target.id, now);
  if (canApply) {
    try {
      target.applyDamage(amount, { cause: opts.cause ?? EntityDamageCause.entityAttack, damagingEntity: isValid(attacker) ? attacker : undefined });
    } catch {
      // ignore
    }
    lastHurtTick.set(target.id, now);
  } else {
    const real = amount * resistFactor(target);
    const cur = health.currentValue;
    if (cur - real <= 0.5) {
      health.setCurrentValue(1);
      const wait = 10 - (now - lh);
      system.runTimeout(() => {
        if (!isValid(target)) return;
        expected.set(target.id, system.currentTick);
        try {
          target.applyDamage(9999, { cause: EntityDamageCause.entityAttack, damagingEntity: isValid(attacker) ? attacker : undefined });
        } catch {
          // ignore
        }
      }, Math.max(1, wait));
    } else {
      health.setCurrentValue(cur - real);
      if (target.typeId === "minecraft:player") afterHurtPlayer(target, attacker, real);
    }
  }
  if (opts.knock) knock(target, opts.knock.dir, opts.knock.h ?? 0.8, opts.knock.v ?? 0.3);
  emit("damaged", target, attacker, amount, opts);
  return amount;
}

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
}

/* ------------------------------------------------------------------------------- defensive hooks */

function preDefend(p, attacker, amount) {
  const r = rt(p);
  const now = system.currentTick;
  // just guard
  if (r.guard && now - r.guardStartTick <= 6) {
    justGuard(p, attacker);
    return 0;
  }
  // Ultra Instinct dodge
  const f = r.form ? FORMS[r.form] : null;
  if (f?.dodge && chance(f.dodge) && isValid(attacker)) {
    autoDodge(p, attacker);
    return 0;
  }
  if (r.guard) amount *= 0.35;
  return amount;
}

export function justGuard(p, attacker) {
  const r = rt(p);
  if (now() - (r.lastJustGuard ?? -100) < 5) return;
  r.lastJustGuard = now();
  sound(p.dimension, "dbz.just_guard", p.location, 1.5);
  particle(p.dimension, "dbz:impact", V.up(p.location, 1.2), "cyan", 2);
  particle(p.dimension, "dbz:shockwave", V.up(p.location, 1), "cyan", 2);
  r.hudMsg = "§bジャストガード！";
  r.hudMsgUntil = Date.now() + 1200;
  if (isValid(attacker) && V.dist(attacker.location, p.location) < 8) {
    const back = V.norm(attacker.getViewDirection());
    const dest = V.sub(attacker.location, V.mul({ x: back.x, y: 0, z: back.z }, 1.6));
    afterimage(p.dimension, p.location, "cyan");
    try {
      p.teleport(dest, { facingLocation: V.up(attacker.location, 1.2) });
    } catch {
      // ignore
    }
    try {
      attacker.addEffect("slowness", 30, { amplifier: 3, showParticles: false });
    } catch {
      // ignore
    }
  }
}

function autoDodge(p, attacker) {
  const r = rt(p);
  if (now() - (r.lastDodge ?? -100) < 8) return;
  r.lastDodge = now();
  afterimage(p.dimension, p.location, "silver");
  sound(p.dimension, "dbz.dash", p.location, 1, 1.4);
  const side = V.norm({ x: -(attacker.location.z - p.location.z), y: 0, z: attacker.location.x - p.location.x });
  const dest = V.add(p.location, V.mul(side, chance(0.5) ? 2.2 : -2.2));
  try {
    p.teleport(dest, { facingLocation: V.up(attacker.location, 1.2), checkForBlocks: true });
  } catch {
    // ignore
  }
  r.hudMsg = "§f体が勝手に…よけた！";
  r.hudMsgUntil = Date.now() + 1000;
}

function now() {
  return system.currentTick;
}

/** Called after a player actually lost health. */
function afterHurtPlayer(p, attacker, amount) {
  const d = getData(p);
  const r = rt(p);
  r.lastDamageTick = now();
  let h;
  try {
    h = p.getComponent("minecraft:health");
  } catch {
    return;
  }
  if (!h) return;
  const frac = h.currentValue / Math.max(1, h.effectiveMax);
  if (r.form === "ue") r.ueStacks = Math.min(60, (r.ueStacks ?? 0) + 1);
  if (d.immortal && frac < 0.25) {
    h.setCurrentValue(h.effectiveMax);
    try {
      p.addEffect("resistance", 60, { amplifier: 4, showParticles: false });
    } catch {
      // ignore
    }
    msg(p, "§d不老不死の体が傷を一瞬で治した！");
    particle(p.dimension, "dbz:sparkle", V.up(p.location, 1), "gold", 1);
  }
  if (d.race === "saiyan" && frac < 0.1) r.zenkaiReady = true;
  if (r.inSpar && frac < 0.2) emit("sparLost", p);
  // rage awakenings during real fights
  const bossNear = isValid(attacker) && hasFamily(attacker, "dbz_enemy") && (attacker.getDynamicProperty("dbz:boss") === true);
  if (bossNear && frac < 0.2 && d.race === "saiyan") {
    if (!d.forms.includes("ssj") && d.level >= 25 && grantFlag(p, "rage1")) rageAwaken(p, "ssj");
    else if (d.forms.includes("ssj") && !d.forms.includes("ssj2") && d.level >= 45 && grantFlag(p, "rage2")) rageAwaken(p, "ssj2");
  }
  if (bossNear && frac < 0.15 && attacker.getDynamicProperty("dbz:cid") === "jiren" && d.level >= 120 && (d.race === "saiyan" || d.race === "human")) {
    if (grantFlag(p, "jiren_rage")) rageAwaken(p, "ui_sign");
  }
}

function rageAwaken(p, form) {
  const d = getData(p);
  if (!d.forms.includes(form)) return;
  title(p, "§c怒りが…限界を超えた！！", "§e眠っていた力が目覚める", 70);
  flash(p, { red: 1, green: 0.95, blue: 0.6 }, 0.3);
  shake(p, 1.2, 1.5);
  try {
    const h = p.getComponent("minecraft:health");
    h?.setCurrentValue(h.effectiveMax * 0.6);
  } catch {
    // ignore
  }
  d.ki = maxKi(d);
  doTransform(p, form, true);
}

/* ------------------------------------------------------------------------------- vanilla melee hook */

let meleeHook = null;
export function setMeleeHook(fn) {
  meleeHook = fn;
}

export function fighterMelee(e) {
  const v = e.getDynamicProperty("dbz:melee");
  return typeof v === "number" ? v : 4;
}

world.afterEvents.entityHurt.subscribe((ev) => {
  const victim = ev.hurtEntity;
  const t = now();
  const id = victim.id;
  const exp = expected.get(id);
  if (exp !== undefined && t - exp <= 1) {
    expected.delete(id);
    lastHurtTick.set(id, t);
    if (victim.typeId === "minecraft:player") afterHurtPlayer(victim, ev.damageSource.damagingEntity, ev.damage);
    return;
  }
  lastHurtTick.set(id, t);
  const src = ev.damageSource;
  const attacker = src.damagingEntity;
  if (src.cause === EntityDamageCause.fall && victim.typeId === "minecraft:player" && getData(victim).level >= 5) {
    try {
      const h = victim.getComponent("minecraft:health");
      if (h && h.currentValue > 0) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + ev.damage));
    } catch {
      // ignore
    }
    return;
  }
  if (src.cause === EntityDamageCause.entityAttack && isValid(attacker)) {
    if (attacker.typeId === "minecraft:player" && meleeHook) {
      lastAttacker.set(id, { id: attacker.id, tick: t });
      rt(attacker).lastTargetId = id;
      const want = meleeHook(attacker, victim, ev.damage);
      adjust(victim, ev.damage, want);
    } else if (attacker.typeId === "dbz:fighter" && victim.typeId === "minecraft:player") {
      let want = scaledDamage(fighterMelee(attacker), attacker, victim);
      const r = rt(victim);
      if (r.guard && t - r.guardStartTick <= 6) {
        justGuard(victim, attacker);
        want = 0;
      } else if (r.guard) want *= 0.35;
      const f = r.form ? FORMS[r.form] : null;
      if (want > 0 && f?.dodge && chance(f.dodge)) {
        autoDodge(victim, attacker);
        want = 0;
      }
      adjust(victim, ev.damage, want * resistFactor(victim));
    } else if (attacker.typeId === "dbz:fighter") {
      adjust(victim, ev.damage, scaledDamage(fighterMelee(attacker), attacker, victim));
    }
  }
  if (victim.typeId === "minecraft:player") afterHurtPlayer(victim, attacker, ev.damage);
});

function adjust(victim, dealt, want) {
  try {
    const h = victim.getComponent("minecraft:health");
    if (!h || h.currentValue <= 0) return;
    const diff = want - dealt;
    if (Math.abs(diff) < 0.05) return;
    const next = h.currentValue - diff;
    if (next <= 0.5) {
      h.setCurrentValue(1);
      const lh = lastHurtTick.get(victim.id) ?? now();
      system.runTimeout(() => {
        if (!isValid(victim)) return;
        expected.set(victim.id, now());
        const la = lastAttacker.get(victim.id);
        const killer = la ? world.getEntity(la.id) : undefined;
        try {
          victim.applyDamage(9999, { cause: EntityDamageCause.entityAttack, damagingEntity: killer });
        } catch {
          // ignore
        }
      }, Math.max(1, 11 - (now() - lh)));
    } else {
      h.setCurrentValue(Math.min(h.effectiveMax, next));
    }
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------------------- deaths & rewards */

world.afterEvents.entityDie.subscribe((ev) => {
  const dead = ev.deadEntity;
  let killer = ev.damageSource.damagingEntity;
  if (!isValid(killer) || killer.typeId !== "minecraft:player") {
    const la = lastAttacker.get(dead.id);
    if (la && now() - la.tick < 300) killer = world.getEntity(la.id);
  }
  lastAttacker.delete(dead.id);
  if (dead.typeId === "minecraft:player") {
    emit("playerDied", dead);
    return;
  }
  const pl = powerOfAny(dead);
  plCache.delete(dead.id);
  if (isValid(killer) && killer.typeId === "minecraft:player") {
    const kp = powerOf(killer);
    const ratio = clamp(pl / Math.max(1, kp), 0.03, 30);
    const isBoss = dead.typeId === "dbz:fighter" && safeProp(dead, "dbz:boss") === true;
    let exp = 4 + 22 * Math.pow(ratio, 0.75);
    if (isBoss) exp *= 12;
    if (dead.typeId === "dbz:fighter") exp *= 2;
    addExp(killer, exp);
    const d = getData(killer);
    d.kills++;
    if (dead.typeId === "minecraft:villager_v2" || dead.typeId === "minecraft:villager" || hasFamily(dead, "dbz_ally")) d.karma -= 5;
    if (hasFamily(dead, "monster")) d.karma = Math.min(50, d.karma + 0.2);
    markDirty(killer);
  }
  emit("entityKilled", dead, killer);
});

function safeProp(e, k) {
  try {
    return e.getDynamicProperty(k);
  } catch {
    return undefined;
  }
}

/** Saiyan zenkai boost once they're healed from the brink. */
export function checkZenkai(p) {
  const r = rt(p);
  if (!r.zenkaiReady) return;
  try {
    const h = p.getComponent("minecraft:health");
    if (h.currentValue / h.effectiveMax < 0.9) return;
  } catch {
    return;
  }
  r.zenkaiReady = false;
  const d = getData(p);
  d.zenkai++;
  d.points += 2;
  addExp(p, 50 + d.level * 15, true);
  markDirty(p);
  title(p, "§6サイヤ人の血が騒ぐ…", "§e瀕死から復活してパワーアップした！（ステータスポイント+2）", 60);
  sound(p.dimension, "dbz.aura_burst", p.location, 1.5);
}

export { applyPassives, refreshVisuals };
