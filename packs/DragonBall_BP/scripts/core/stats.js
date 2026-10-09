import { EntityComponentTypes, EquipmentSlot } from "@minecraft/server";
import { getData, markDirty, rt, settings } from "./data.js";
import { FORMS, RACES, SPECIAL, KAIOKEN_LEVELS } from "../combat/formsData.js";
import { clamp, fmtPL } from "./util.js";
import { particle, psound, sound, title, msg } from "./fx.js";
import { emit } from "./bus.js";

export const MAX_LEVEL = 150;

export function statSum(d) {
  const s = d.stats;
  return s.str + s.ki + s.vit + s.spd + s.def;
}

export function basePL(d) {
  const race = RACES[d.race] ?? RACES.human;
  const lv = d.level;
  const pl = 5 * Math.pow(1.115, lv - 1) * (1 + (statSum(d) - 5) / 15) * race.plMult;
  return Math.max(1, pl);
}

export function formMult(p, d = getData(p), r = rt(p)) {
  let m = 1;
  if (r.oozaru === 1) m *= SPECIAL.oozaru.mult;
  if (r.oozaru === 2) m *= SPECIAL.golden_oozaru.mult;
  if (r.form && FORMS[r.form]) {
    const f = FORMS[r.form];
    m *= d.race === "human" && f.humanMult ? f.humanMult : f.mult;
  }
  if (r.kaioken) m *= KAIOKEN_LEVELS[r.kaioken];
  if (r.fusion) m *= r.fusion.mult;
  if (r.absorbMult && r.absorbUntil > Date.now()) m *= r.absorbMult;
  if (r.ueStacks) m *= 1 + r.ueStacks * 0.02;
  return m;
}

/** Actual fighting power used for damage. */
export function powerOf(p) {
  const d = getData(p);
  return basePL(d) * formMult(p, d);
}

/** What scouters read: suppressed ki reads very low. */
export function displayPL(p) {
  const r = rt(p);
  if (r.hiddenKi) return 5;
  return powerOf(p);
}

export function maxKi(d) {
  return 100 + d.stats.ki * 12 + d.level * 2;
}

export function kiCostMult(d) {
  return (RACES[d.race]?.kiCost ?? 1) * settings().kiCost;
}

export function useKi(p, amount) {
  const d = getData(p);
  const need = amount * kiCostMult(d);
  if (d.ki < need) return false;
  d.ki -= need;
  return true;
}

export function addKi(p, amount) {
  const d = getData(p);
  d.ki = clamp(d.ki + amount, 0, maxKi(d));
}

export function expToNext(level) {
  return Math.floor(40 * Math.pow(level, 1.55));
}

/** Gain experience; handles level ups and points. */
export function addExp(p, amount, quiet = false) {
  const d = getData(p);
  if (!d.race || d.level >= MAX_LEVEL) return;
  const race = RACES[d.race];
  amount *= settings().growth * (race?.growth ?? 1) * (rt(p).expMult ?? 1);
  d.exp += amount;
  let leveled = 0;
  while (d.level < MAX_LEVEL && d.exp >= expToNext(d.level)) {
    d.exp -= expToNext(d.level);
    d.level++;
    d.points += d.level % 5 === 0 ? 5 : 3;
    leveled++;
  }
  if (leveled) {
    const pl = fmtPL(powerOf(p));
    title(p, `§6レベルアップ！ §fLv.${d.level}`, `§e戦闘力 ${pl}  §7(ステータスポイント +${leveled * 3})`, 50);
    psound(p, "dbz.levelup");
    particle(p.dimension, "dbz:pillar", p.location, "gold", 1);
    msg(p, `§6[レベルアップ] §fLv.${d.level} になった！ ドラゴンメニューの「ステータス」でポイントを振ろう。`);
    emit("levelUp", p, d.level);
  }
  markDirty(p);
  if (!quiet && amount >= 1) {
    rt(p).hudMsg = `§a+${Math.floor(amount)} EXP`;
    rt(p).hudMsgUntil = Date.now() + 1200;
  }
}

/* ------------------------------------------------------------------------------- status effects */

function wantEffect(p, id, amp, duration = 20000000) {
  try {
    const cur = p.getEffect(id);
    if (amp < 0) {
      if (cur) p.removeEffect(id);
      return;
    }
    if (cur && cur.amplifier === amp && cur.duration > 200) return;
    if (cur) p.removeEffect(id);
    p.addEffect(id, duration, { amplifier: amp, showParticles: false });
  } catch {
    // ignore
  }
}

/** Equipment based bonuses (gi sets etc.). */
export function gearInfo(p) {
  const info = { weight: 0, kiRegen: 0, def: 0, scouter: false, gi: 0 };
  try {
    const eq = p.getComponent(EntityComponentTypes.Equippable);
    if (!eq) return info;
    const ids = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet].map((s) => eq.getEquipment(s)?.typeId ?? "");
    for (const id of ids) {
      if (id === "dbz:scouter") info.scouter = true;
      if (id.startsWith("dbz:weighted_") || id === "dbz:turtle_shell" || id === "dbz:piccolo_cape" || id === "dbz:piccolo_turban") info.weight++;
      if (id.startsWith("dbz:kame_") || id.startsWith("dbz:kai_")) info.gi++;
      if (id.startsWith("dbz:saiyan_")) info.def++;
      if (id.startsWith("dbz:kai_")) info.kiRegen += 0.5;
    }
  } catch {
    // ignore
  }
  return info;
}

/** Refresh passive effects from stats, forms, gear and guard state. Called every 10 ticks. */
export function applyPassives(p) {
  const d = getData(p);
  const r = rt(p);
  if (!d.race) return;
  const gear = gearInfo(p);
  const form = r.form ? FORMS[r.form] : null;
  // health
  let hb = Math.floor((d.stats.vit - 1) * 0.7 + d.level * 0.12);
  if (r.oozaru) hb += 15;
  if (r.fusion) hb += 10;
  hb = clamp(hb, -1, 49);
  wantEffect(p, "health_boost", hb >= 0 ? hb : -1);
  // resistance
  let res = d.stats.def >= 70 ? 2 : d.stats.def >= 30 ? 1 : d.stats.def >= 10 ? 0 : -1;
  if (form) res = Math.max(res, form.resist - 1);
  if (gear.def) res = Math.max(res, 0);
  if (r.oozaru) res = Math.max(res, 2);
  if (r.guard) res = Math.max(res, Date.now() - r.guardStart < 300 ? 4 : 2);
  wantEffect(p, "resistance", Math.min(res, 4));
  // speed
  let spd = d.stats.spd >= 80 ? 2 : d.stats.spd >= 30 ? 1 : d.stats.spd >= 10 ? 0 : -1;
  if (form) spd = Math.max(spd, form.speed - 1);
  if (gear.weight) spd = -1;
  wantEffect(p, "speed", spd);
  wantEffect(p, "slowness", gear.weight ? Math.min(2, gear.weight - 1) : -1);
  // jump: strong fighters jump higher
  wantEffect(p, "jump_boost", d.level >= 15 && !gear.weight ? Math.min(2, Math.floor(d.level / 40)) : -1);
  // regen
  const race = RACES[d.race];
  let regen = race.regen > 0 ? race.regen - 1 : -1;
  if (d.immortal) regen = Math.max(regen, 1);
  wantEffect(p, "regeneration", regen);
  // water breathing for Frieza race
  if (d.race === "frieza") wantEffect(p, "water_breathing", 0);
  // night vision on Namek / HTC is not needed; fire resistance at high levels
  wantEffect(p, "fire_resistance", d.level >= 60 ? 0 : -1);
  r.gear = gear;
}

export function raceColor(d) {
  return RACES[d.race]?.color ?? "§f";
}

export function formName(p) {
  const r = rt(p);
  const parts = [];
  if (r.fusion) parts.push(r.fusion.name);
  if (r.oozaru === 1) parts.push(SPECIAL.oozaru.name);
  if (r.oozaru === 2) parts.push(SPECIAL.golden_oozaru.name);
  if (r.form) parts.push(FORMS[r.form]?.name ?? "");
  if (r.kaioken) parts.push(`界王拳${KAIOKEN_LEVELS[r.kaioken]}倍`);
  return parts.join("・") || "通常";
}

export function fxLevel(p) {
  sound(p.dimension, "dbz.levelup", p.location);
}
