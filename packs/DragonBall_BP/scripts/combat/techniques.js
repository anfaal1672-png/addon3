import { system, world } from "@minecraft/server";
import { TECHS } from "./techData.js";
import { RACES } from "./formsData.js";
import { getData, markDirty, rt } from "../core/data.js";
import { maxKi, kiCostMult, addExp, powerOf } from "../core/stats.js";
import { V, clamp, isValid, rand } from "../core/util.js";
import { particle, sound, title, msg, psound, flash, shake } from "../core/fx.js";
import { fireBlast, fireBeam, explode, handOrigin } from "./projectiles.js";
import { hurt, isHostile, knock } from "./damage.js";
import { setPose, refreshVisuals, cycleKaioken, auraColorName, powerBalls } from "./forms.js";
import { emit } from "../core/bus.js";

/* ------------------------------------------------------------------------------- learning */

function raceOk(learn, race) {
  if (!learn.race) return true;
  return Array.isArray(learn.race) ? learn.race.includes(race) : learn.race === race;
}

export function learnTech(p, id, quiet = false) {
  const d = getData(p);
  if (!TECHS[id] || d.techs.includes(id)) return false;
  d.techs.push(id);
  const empty = d.slots.indexOf(null);
  if (empty >= 0) d.slots[empty] = id;
  markDirty(p);
  if (!quiet) {
    title(p, "§b新しい技を覚えた！", `§f${TECHS[id].name}`, 50);
    msg(p, `§b[技習得] §f${TECHS[id].name} §7― ${TECHS[id].desc}${empty >= 0 ? `（技スロット${"ABCD"[empty]}にセットした）` : "（メニューの「技」でスロットにセットしよう）"}`);
    psound(p, "dbz.learn");
  }
  emit("techLearned", p, id);
  return true;
}

/** Learn every technique that only needs level/race. */
export function autoLearn(p) {
  const d = getData(p);
  if (!d.race) return;
  for (const [id, t] of Object.entries(TECHS)) {
    const L = t.learn || {};
    if (L.master) continue;
    if (L.level === undefined) continue;
    if (!raceOk(L, d.race)) continue;
    if (L.race === undefined && L.boss) continue;
    if (d.level >= L.level) learnTech(p, id);
  }
}

export function learnHint(id) {
  const L = TECHS[id].learn || {};
  const parts = [];
  const masters = { roshi: "亀仙人", goku: "孫悟空", vegeta: "ベジータ", piccolo: "ピッコロ", gohan: "孫悟飯", krillin: "クリリン",
    tien: "天津飯", yamcha: "ヤムチャ", kaio: "界王様" };
  if (L.master) parts.push(`${masters[L.master] ?? L.master}に教わる`);
  if (L.level) parts.push(`レベル${L.level}以上`);
  if (L.race) {
    const rs = Array.isArray(L.race) ? L.race : [L.race];
    parts.push(rs.map((r) => RACES[r]?.name ?? r).join("・") + "のみ");
  }
  if (L.boss) parts.push(`（他の種族はボス「${L.boss.startsWith("frieza") ? "フリーザ" : L.boss}」を倒すと習得）`);
  if (L.needs) parts.push(`前提：${L.needs.map((n) => TECHS[n]?.name).join("・")}`);
  return parts.join(" / ");
}

/* ------------------------------------------------------------------------------- casting */

function techPower(p, t, frac) {
  const d = getData(p);
  return (t.power ?? 0) * (0.3 + 0.7 * Math.pow(frac, 0.8)) * (1 + d.stats.ki * 0.012);
}

function payKi(p, t, frac) {
  const d = getData(p);
  const cost = (t.cost ?? 0) * Math.max(0.3, frac) * kiCostMult(d);
  if (d.ki < cost) return false;
  d.ki -= cost;
  return true;
}

function noKi(p) {
  msg(p, "§c気が足りない！（気溜めアイテムを長押しして回復）");
  psound(p, "dbz.click", 1, 0.6);
}

export function startCast(p, slot) {
  const d = getData(p);
  const r = rt(p);
  if (!d.race) return;
  if (r.oozaru) {
    // great apes fire a mouth blast instead
    fireBlast(p, { color: "purple", size: 2.5, speed: 1.6, power: 60, radius: 5, from: V.up(p.location, 5) });
    sound(p.dimension, "dbz.blast", p.location, 2, 0.6);
    return;
  }
  const id = d.slots[slot];
  if (!id) {
    msg(p, `§7技スロット${"ABCD"[slot]}は空いている。ドラゴンメニュー →「技」でセットしよう。`);
    return;
  }
  const t = TECHS[id];
  if (!t) return;
  if (t.needForm && !r.form && !r.kaioken) {
    msg(p, `§c${t.name}は変身中か界王拳中にしか撃てない！`);
    return;
  }
  if (r.beam) return;
  if (t.charge === 0 && t.kind !== "barrage") {
    executeInstant(p, id, t);
    return;
  }
  r.casting = { id, slot, ticks: 0, gathered: 0 };
  setPose(p, t.pose ?? "beam_charge");
  if (t.kind === "beam" || t.kind === "ball" || t.kind === "genki") sound(p.dimension, "dbz.beam_charge", p.location, 1.4);
  if (t.kind === "genki") {
    title(p, "§b元気玉", "§fみんな… オラに元気を分けてくれ！", 40);
    sound(p.dimension, "dbz.gather", p.location, 2);
  }
  refreshVisuals(p);
}

export function tickCast(p) {
  const r = rt(p);
  const c = r.casting;
  if (!c) return;
  const t = TECHS[c.id];
  const d = getData(p);
  c.ticks++;
  if (t.kind === "barrage") {
    if (c.ticks % 3 === 0) {
      if (!payKi(p, t, 1)) {
        noKi(p);
        endCast(p);
        return;
      }
      const dir = V.norm(V.add(p.getViewDirection(), { x: rand(-0.07, 0.07), y: rand(-0.05, 0.05), z: rand(-0.07, 0.07) }));
      fireBlast(p, { color: t.color, size: t.size, speed: t.speed, power: techPower(p, t, 1), radius: t.radius, dir, techId: c.id });
      if (c.ticks % 6 === 0) sound(p.dimension, "dbz.blast", p.location, 0.8, rand(0.9, 1.2));
    }
    setPose(p, "beam_fire");
    return;
  }
  // affordability caps the charge
  const affordable = clamp(d.ki / Math.max(1, (t.cost ?? 1) * kiCostMult(d)), 0, 1);
  const frac = Math.min(c.ticks / Math.max(1, t.charge), affordable, 1);
  c.frac = frac;
  const hand = t.pose === "overhead" ? V.up(p.location, 3.4 + frac * (t.kind === "genki" ? 4 : 1.5)) : handOrigin(p);
  if (c.ticks % 2 === 0) {
    particle(p.dimension, "dbz:charge_orb", hand, t.color, 1);
    particle(p.dimension, "dbz:glow_burst", hand, t.color, 0.6 + frac * (t.kind === "genki" ? 6 : 1.4));
  }
  if (t.kind === "genki" && c.ticks % 8 === 0) gatherGenki(p, c, hand);
  if (frac >= 1 && !c.full) {
    c.full = true;
    psound(p, "dbz.learn", 0.4, 1.6);
  }
  if (c.ticks % 20 === 0) addExp(p, 0.5, true);
  setPose(p, t.pose ?? "beam_charge");
}

function gatherGenki(p, c, hand) {
  const dim = p.dimension;
  let n = 0;
  for (const e of dim.getEntities({ location: p.location, maxDistance: 40, excludeFamilies: ["dbz_fx", "inanimate"] })) {
    if (e.id === p.id) continue;
    if (!e.getComponent("minecraft:health")) continue;
    n++;
    if (n <= 10) {
      const from = V.up(e.location, 1);
      const dir = V.norm(V.sub(hand, from));
      particle(dim, "dbz:gather", from, "cyan", 1, { dir, speed: Math.min(30, V.dist(hand, from)) });
    }
  }
  c.gathered += Math.min(12, n) + 1;
}

export function releaseCast(p) {
  const r = rt(p);
  const c = r.casting;
  if (!c) return;
  r.casting = null;
  const t = TECHS[c.id];
  if (t.kind === "barrage") {
    endCast(p);
    return;
  }
  const frac = Math.max(0.15, c.frac ?? 0);
  if (!payKi(p, t, frac)) {
    noKi(p);
    endCast(p);
    return;
  }
  fireCharged(p, c.id, t, frac, c);
  addExp(p, 1 + frac * 3, true);
  refreshVisuals(p);
}

export function endCast(p) {
  const r = rt(p);
  r.casting = null;
  setPose(p, "none");
  refreshVisuals(p);
}

function fireCharged(p, id, t, frac, c) {
  const dim = p.dimension;
  const power = techPower(p, t, frac);
  switch (t.kind) {
    case "beam": {
      const width = (t.width ?? 1) * (0.55 + 0.45 * frac);
      fireBeam(p, { color: t.color, width, range: t.range, power, pierce: t.pierce, spiral: t.spiral, candy: t.candy,
        duration: Math.round(20 + 22 * frac), techId: id, firePose: t.firePose ?? "beam_fire", instant: t.instantBeam });
      if (frac >= 0.9) {
        title(p, "", `§b${t.name}！！`, 20);
        shake(p, 0.4, 0.5);
        if ((t.power ?? 0) >= 60) {
          try {
            p.camera.setCamera("minecraft:third_person");
            system.runTimeout(() => {
              try {
                if (!rt(p).oozaru) p.camera.clear();
              } catch {
                // ignore
              }
            }, 45);
          } catch {
            // ignore
          }
        }
      }
      break;
    }
    case "ball": {
      const from = t.pose === "overhead" ? V.up(p.location, 4) : handOrigin(p);
      fireBlast(p, { color: t.color, size: t.size * (0.5 + 0.5 * frac), speed: t.speed, power, radius: t.radius * (0.5 + 0.5 * frac),
        from, techId: id, life: 90 });
      sound(dim, "dbz.blast", p.location, 2, 0.6);
      setPose(p, t.pose === "overhead" ? "throw" : "one_hand", 12);
      break;
    }
    case "disc": {
      fireBlast(p, { color: t.color, size: t.size, speed: t.speed, power, radius: 1.2, shape: 1, homing: true, pierce: true, life: 90,
        from: V.up(p.location, 2.4), techId: id });
      sound(dim, "dbz.disc", p.location, 1.5);
      setPose(p, "throw", 10);
      break;
    }
    case "guided": {
      fireBlast(p, { color: t.color, size: t.size, speed: t.speed, power, radius: 2, guided: true, life: 140, techId: id });
      sound(dim, "dbz.blast", p.location, 1.2);
      setPose(p, "one_hand", 10);
      break;
    }
    case "genki": {
      const size = clamp(1 + c.gathered * 0.04 + frac * 2, 1.2, 9);
      const pw = power * (0.3 + size / 9);
      fireBlast(p, { color: "cyan", size, speed: t.speed, power: pw, radius: clamp(size * 1.6, 3, 12), from: V.up(p.location, 3.5 + size),
        techId: id, life: 140 });
      title(p, "", "§bいっけぇーー！！", 20);
      sound(dim, "dbz.beam_fire", p.location, 2.5, 0.7);
      setPose(p, "throw", 14);
      break;
    }
    case "aoe": {
      setPose(p, "transform", 10);
      explode(dim, V.up(p.location, 1), t.radius * (0.5 + 0.5 * frac), power, p, t.color);
      particle(dim, "dbz:shockwave", p.location, "white", t.radius);
      break;
    }
    case "special": {
      if (id === "power_ball") powerBall(p);
      break;
    }
    default:
      break;
  }
}

/* ------------------------------------------------------------------------------- instant techniques */

function executeInstant(p, id, t) {
  const d = getData(p);
  const r = rt(p);
  const dim = p.dimension;
  if (t.kind === "special" && id === "instant_transmission") {
    emit("openTransmission", p);
    return;
  }
  if (t.kind === "buff") {
    if (r.kaioken === 0 && !payKi(p, t, 1)) return noKi(p);
    setPose(p, "transform", 12);
    cycleKaioken(p);
    return;
  }
  if (!payKi(p, t, 1)) return noKi(p);
  switch (t.kind) {
    case "blast":
      fireBlast(p, { color: blastColor(p, t), size: t.size, speed: t.speed, power: techPower(p, t, 1), radius: t.radius, techId: id });
      sound(dim, "dbz.blast", p.location, 1);
      setPose(p, "one_hand", 8);
      break;
    case "beam":
      fireBeam(p, { color: t.color, width: t.width, range: t.range, power: techPower(p, t, 1), pierce: t.pierce, instant: true,
        duration: 8, techId: id, firePose: "one_hand", candy: t.candy });
      break;
    case "rush":
      startRush(p, t);
      break;
    case "instant":
      instantEffect(p, id, t);
      break;
    default:
      break;
  }
}

function blastColor(p, t) {
  const a = auraColorName(p);
  const map = { gold: "yellow", gold_bright: "yellow", red: "red", cyan: "cyan", silver: "white", purple: "purple", green: "green",
    rose: "black_rose", pink: "pink", violet: "purple", golden: "gold", dark: "dark", orange: "orange", blue_kaioken: "cyan", white_hot: "white" };
  const r = rt(p);
  if (r.form || r.kaioken) return map[a] ?? t.color;
  return t.color;
}

function frontTarget(p, range, cone = 0.8) {
  const head = p.getHeadLocation();
  const view = p.getViewDirection();
  let best = null;
  let bd = Infinity;
  for (const e of p.dimension.getEntities({ location: head, maxDistance: range, excludeFamilies: ["dbz_fx", "dbz_vehicle", "inanimate"] })) {
    if (e.id === p.id) continue;
    if (!isHostile(p, e)) continue;
    const to = V.sub(V.up(e.location, 1), head);
    const dist = V.len(to);
    if (V.dot(V.norm(to), view) < cone) continue;
    if (dist < bd) {
      bd = dist;
      best = e;
    }
  }
  return best;
}

function instantEffect(p, id, t) {
  const dim = p.dimension;
  const d = getData(p);
  switch (id) {
    case "taiyoken": {
      setPose(p, "forehead", 10);
      title(p, "", "§e太陽拳！！", 15);
      sound(dim, "dbz.flash", p.location, 2.5);
      particle(dim, "dbz:explosion_core", V.up(p.location, 1.8), "white", 6);
      for (const e of dim.getEntities({ location: p.location, maxDistance: t.radius, excludeFamilies: ["dbz_fx", "dbz_vehicle"] })) {
        if (e.id === p.id || !isHostile(p, e)) continue;
        try {
          if (e.typeId === "minecraft:player") {
            flash(e, { red: 1, green: 1, blue: 1 }, 1.2);
            e.addEffect("blindness", 80, { amplifier: 0, showParticles: false });
          }
          e.addEffect("slowness", 70, { amplifier: 6, showParticles: false });
          e.addEffect("weakness", 70, { amplifier: 1, showParticles: false });
          if (e.typeId === "dbz:fighter") {
            e.triggerEvent("dbz:freeze");
            system.runTimeout(() => isValid(e) && e.triggerEvent("dbz:unfreeze"), 70);
            emit("stunned", e, 70);
          }
        } catch {
          // ignore
        }
      }
      break;
    }
    case "regenerate": {
      const h = p.getComponent("minecraft:health");
      if (h) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + h.effectiveMax * 0.4));
      particle(dim, "dbz:sparkle", V.up(p.location, 1), "green", 1);
      sound(dim, "dbz.senzu", p.location, 1, 0.8);
      setPose(p, "transform", 10);
      msg(p, "§a体を再生した！");
      break;
    }
    case "heal": {
      let target = null;
      for (const e of dim.getEntities({ location: p.getHeadLocation(), maxDistance: 6, excludeFamilies: ["dbz_fx", "dbz_enemy", "monster"] })) {
        if (e.id === p.id) continue;
        if (e.typeId === "minecraft:player" || e.typeId === "dbz:fighter") {
          target = e;
          break;
        }
      }
      const tgt = target ?? p;
      const h = tgt.getComponent("minecraft:health");
      if (h) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + h.effectiveMax * (target ? 0.6 : 0.3)));
      particle(dim, "dbz:sparkle", V.up(tgt.location, 1), "gold", 1);
      particle(dim, "dbz:aura_rise", tgt.location, "gold", 1);
      sound(dim, "dbz.learn", tgt.location, 1);
      emit("healed", tgt, p);
      break;
    }
    case "arm_stretch": {
      const e = frontTarget(p, 14, 0.9);
      setPose(p, "one_hand", 10);
      if (!e) break;
      const head = p.getHeadLocation();
      const to = V.sub(V.up(e.location, 1), head);
      const n = Math.ceil(V.len(to));
      for (let i = 1; i < n; i++) particle(dim, "dbz:trail", V.add(head, V.mul(V.norm(to), i)), "green", 0.4);
      hurt(e, techPower(p, t, 1), p);
      knock(e, V.mul(to, -1), 1.4, 0.3);
      sound(dim, "dbz.punch_heavy", e.location, 1.2);
      break;
    }
    case "absorb": {
      const e = frontTarget(p, 5, 0.6);
      if (!e || e.typeId === "minecraft:player") {
        msg(p, "§7吸収できる相手が目の前にいない。");
        d.ki += t.cost;
        break;
      }
      const h = e.getComponent("minecraft:health");
      if (!h || h.currentValue / h.effectiveMax > 0.3) {
        msg(p, "§7相手がまだ元気すぎる（体力3割以下で吸収できる）。");
        d.ki += t.cost;
        break;
      }
      const r = rt(p);
      r.absorbMult = 1.5;
      r.absorbUntil = Date.now() + 10 * 60 * 1000;
      particle(dim, "dbz:pop_smoke", e.location, "pink", 1);
      sound(dim, "dbz.fusion", p.location, 1.2);
      title(p, "§d吸収！", "§f10分間、戦闘力が1.5倍になった", 40);
      emit("absorbed", e, p);
      hurt(e, 99999, p, { raw: true });
      break;
    }
    default:
      break;
  }
}

/* ------------------------------------------------------------------------------- rush */

function startRush(p, t) {
  const e = frontTarget(p, 9, 0.7);
  const r = rt(p);
  if (!e) {
    msg(p, "§7目の前に敵がいない。");
    getData(p).ki += t.cost;
    return;
  }
  const back = V.norm(V.sub(p.location, e.location));
  const dest = V.add(e.location, V.mul({ x: back.x, y: 0, z: back.z }, 1.3));
  particle(p.dimension, "dbz:afterimage", p.location, "white", 1);
  try {
    p.teleport(dest, { facingLocation: V.up(e.location, 1.2), checkForBlocks: true });
  } catch {
    // ignore
  }
  r.rushTicks = 26;
  r.rushTarget = e;
  r.rushPower = techPower(p, t, 1);
  sound(p.dimension, "dbz.dash", p.location, 1.2);
}

export function tickRush(p) {
  const r = rt(p);
  if (!r.rushTicks) return;
  r.rushTicks--;
  const e = r.rushTarget;
  if (!isValid(e)) {
    r.rushTicks = 0;
    setPose(p, "none");
    return;
  }
  setPose(p, "rush", 3);
  try {
    if (e.typeId !== "minecraft:player") e.clearVelocity();
  } catch {
    // ignore
  }
  if (r.rushTicks % 2 === 0) {
    const at = V.up(e.location, 1 + rand(-0.3, 0.4));
    particle(p.dimension, "dbz:impact", at, "white", 1.2);
    sound(p.dimension, "dbz.punch", at, 0.9, rand(0.9, 1.3));
    hurt(e, r.rushPower, p, { raw: false });
  }
  if (r.rushTicks === 0) {
    hurt(e, r.rushPower * 4, p, { knock: { dir: p.getViewDirection(), h: 2.4, v: 0.5 } });
    sound(p.dimension, "dbz.punch_heavy", e.location, 1.5);
    particle(p.dimension, "dbz:shockwave", V.up(e.location, 1), "white", 2.5);
    shake(p, 0.5, 0.4);
    setPose(p, "none");
    emit("finisher", p, e);
  }
}

/* ------------------------------------------------------------------------------- power ball */

function powerBall(p) {
  const loc = V.add(V.up(p.location, 22), V.mul(p.getViewDirection(), 6));
  let ent;
  try {
    ent = p.dimension.spawnEntity("dbz:ki_blast", loc);
    ent.setProperty("dbz:color", 6);
    ent.setProperty("dbz:size", 6);
  } catch {
    return;
  }
  const until = system.currentTick + 1200;
  powerBalls.push({ loc, dim: p.dimension.id, until });
  title(p, "§fパワーボール", "§7弾けて混ざれっ！", 30);
  sound(p.dimension, "dbz.aura_burst", loc, 3, 1.4);
  let t = 0;
  const run = system.runInterval(() => {
    t++;
    if (!isValid(ent) || t > 1200) {
      system.clearRun(run);
      if (isValid(ent)) ent.remove();
      return;
    }
    if (t % 10 === 0) particle(ent.dimension, "dbz:glow_burst", loc, "white", 8);
    try {
      ent.teleport(loc);
    } catch {
      // ignore
    }
  }, 2);
}

export { TECHS };
