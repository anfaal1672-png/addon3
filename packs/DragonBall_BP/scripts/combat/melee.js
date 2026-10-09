import { system, world } from "@minecraft/server";
import { getData, rt } from "../core/data.js";
import { addExp } from "../core/stats.js";
import { V, isValid, rand } from "../core/util.js";
import { particle, sound, shake, afterimage } from "../core/fx.js";
import { scaledDamage, setMeleeHook, knock, hurt, hasFamily } from "./damage.js";
import { carve } from "./projectiles.js";
import { settings } from "../core/data.js";
import { setPose } from "./forms.js";
import { emit } from "../core/bus.js";

const WEAPON_BONUS = { "dbz:nyoibo": 4, "dbz:z_sword": 12, "dbz:gregory_hammer": 0 };

function heldId(p) {
  try {
    return p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex)?.typeId ?? "";
  } catch {
    return "";
  }
}

export function meleeBase(p) {
  const d = getData(p);
  let base = 2.5 + d.stats.str * 0.32 + d.level * 0.06;
  base += WEAPON_BONUS[heldId(p)] ?? 0;
  if (rt(p).oozaru) base *= 2.5;
  if (rt(p).giant) base *= 1.6;
  return base;
}

/** Returns the damage the hit should have dealt. Handles combos, finishers and clashes. */
function onPlayerMelee(p, victim, vanilla) {
  if (heldId(p).startsWith("dbz:bt_")) return 0; // mob battle tools select, they don't hurt
  const r = rt(p);
  const now = system.currentTick;
  if (r.comboTarget !== victim.id || now - r.lastHitTick > 22) r.comboCount = 0;
  r.comboTarget = victim.id;
  r.lastHitTick = now;
  r.comboCount++;
  const dim = p.dimension;
  const at = V.up(victim.location, 1.1);
  // fist clash: the victim was hitting us a moment ago
  if (r.lastHurtBy && r.lastHurtBy.id === victim.id && now - r.lastHurtBy.tick < 6) {
    particle(dim, "dbz:shockwave", at, "white", 2);
    particle(dim, "dbz:impact", at, "white", 2.5);
    sound(dim, "dbz.clash", at, 1.5);
    shake(p, 0.35, 0.3);
    knock(p, V.sub(p.location, victim.location), 0.6, 0.15);
    knock(victim, V.sub(victim.location, p.location), 0.6, 0.15);
  }
  // training dummy
  if (hasFamily(victim, "dbz_dummy")) {
    getData(p).train.dummyHits++;
    addExp(p, 0.6 + getData(p).level * 0.02, true);
    try {
      const h = victim.getComponent("minecraft:health");
      h?.resetToMaxValue();
    } catch {
      // ignore
    }
    particle(dim, "dbz:impact", at, "white", 1);
    sound(dim, "dbz.punch", at, 0.8, rand(0.9, 1.1));
    if (r.comboCount >= 5) r.comboCount = 0;
    return 0;
  }
  const n = r.comboCount;
  let mult = [1, 1, 1.06, 1.12, 1.18][Math.min(n, 4)] ?? 1.2;
  const finisher = n >= 5;
  if (finisher) mult = 2.3;
  const dmg = scaledDamage(meleeBase(p) * mult, p, victim);
  particle(dim, "dbz:impact", at, finisher ? "yellow" : "white", finisher ? 2.4 : 1.1);
  if (finisher) {
    r.comboCount = 0;
    sound(dim, "dbz.punch_heavy", at, 1.4);
    particle(dim, "dbz:shockwave", at, "white", 2.5);
    shake(p, 0.45, 0.35);
    const dir = p.getViewDirection();
    system.run(() => knock(victim, dir, 2.6, 0.55));
    r.chaseUntil = now + 34;
    r.chaseTarget = victim;
    r.hudMsg = "§eフィニッシュ！ §7(しゃがみ2回で追撃)";
    r.hudMsgUntil = Date.now() + 1500;
    watchImpact(victim, dir, p);
    emit("finisher", p, victim);
  } else {
    sound(dim, "dbz.punch", at, 0.9, rand(0.9, 1.25));
  }
  if (n % 2 === 0) addExp(p, 0.2, true);
  return dmg;
}

/** After a finisher, check whether the victim slammed into a wall. */
function watchImpact(victim, dir, attacker) {
  let t = 0;
  const run = system.runInterval(() => {
    t++;
    if (!isValid(victim) || t > 10) {
      system.clearRun(run);
      return;
    }
    if (t < 3) return;
    const ahead = V.add(V.up(victim.location, 1), V.mul(V.norm({ x: dir.x, y: 0, z: dir.z }), 1.0));
    let solid = false;
    try {
      const b = victim.dimension.getBlock(ahead);
      solid = !!b && !b.isAir && !b.isLiquid;
    } catch {
      solid = false;
    }
    if (solid) {
      system.clearRun(run);
      particle(victim.dimension, "dbz:explosion_smoke", ahead, "white", 1.5);
      particle(victim.dimension, "dbz:dust_rise", ahead, "white", 1);
      sound(victim.dimension, "dbz.punch_heavy", ahead, 1.4, 0.7);
      if (isValid(attacker)) hurt(victim, meleeBase(attacker) * 1.2, attacker);
      if (settings().terrain) carve(victim.dimension, ahead, 1.6);
      if (isValid(attacker) && attacker.typeId === "minecraft:player") {
        rt(attacker).hudMsg = "§6めり込んだ！";
        rt(attacker).hudMsgUntil = Date.now() + 1200;
      }
    }
  }, 1);
}

/** Dash-chase after a finisher. Returns true if a chase happened. */
export function tryChase(p) {
  const r = rt(p);
  if (system.currentTick > r.chaseUntil || !isValid(r.chaseTarget)) return false;
  const e = r.chaseTarget;
  r.chaseUntil = 0;
  const away = V.norm(p.getViewDirection());
  const dest = V.add(e.location, V.mul({ x: away.x, y: 0, z: away.z }, 1.6));
  afterimage(p.dimension, p.location, "white");
  try {
    p.teleport(dest, { facingLocation: V.up(e.location, 1.2), checkForBlocks: true });
  } catch {
    return false;
  }
  setPose(p, "rush", 6);
  const dmg = scaledDamage(meleeBase(p) * 2.6, p, e);
  hurt(e, dmg, p, { raw: true, knock: { dir: V.sub(e.location, p.location), h: 2.2, v: 0.9 } });
  particle(p.dimension, "dbz:impact", V.up(e.location, 1), "yellow", 3);
  particle(p.dimension, "dbz:shockwave", V.up(e.location, 1), "yellow", 3);
  sound(p.dimension, "dbz.punch_heavy", e.location, 1.6, 0.8);
  shake(p, 0.6, 0.4);
  r.hudMsg = "§6追撃！！";
  r.hudMsgUntil = Date.now() + 1200;
  return true;
}

setMeleeHook(onPlayerMelee);

/** Track which fighter last punched each player (for fist clashes). */
world.afterEvents.entityHitEntity.subscribe((ev) => {
  const a = ev.damagingEntity;
  const v = ev.hitEntity;
  if (v?.typeId === "minecraft:player" && a?.typeId === "dbz:fighter") {
    rt(v).lastHurtBy = { id: a.id, tick: system.currentTick };
  }
});
