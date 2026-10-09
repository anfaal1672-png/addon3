import { world, system } from "@minecraft/server";
import { getData, markDirty, rt } from "../core/data.js";
import { FORMS, KAIOKEN_LEVELS, KAIOKEN_HP_DRAIN, SPECIAL, chainOf, formsForRace } from "./formsData.js";
import { HAIR_COLOR, HAIR_STYLE, AURA, OVERLAY, POSE } from "../gen/catalog.js";
import { maxKi, kiCostMult, addExp, formName, applyPassives, powerOf } from "../core/stats.js";
import { particle, sound, title, shake, shakeArea, flash, msg, psound } from "../core/fx.js";
import { emit } from "../core/bus.js";
import { V, clamp, fmtPL, cmd } from "../core/util.js";

/* ------------------------------------------------------------------------------- visuals */

const BASE_BODY = { saiyan: "none", human: "none", namek: "namek", frieza: "frieza1", majin: "majin" };

function styleFor(style, pref) {
  if (!style || style === "base") return pref;
  if ((style === "ssj" || style === "ssj2") && pref === "vegeta") return "vegeta";
  if ((style === "ssj" || style === "ssj2") && pref === "trunks") return "ssj";
  return style;
}

export function auraColorName(p) {
  const r = rt(p);
  const d = getData(p);
  const f = r.form ? FORMS[r.form] : null;
  if (r.kaioken) return f && r.form === "blue" ? "blue_kaioken" : "red";
  if (f?.vis.aura) return f.vis.aura;
  if (r.fusion) return "cyan";
  if (d.race === "frieza") return "violet";
  if (d.race === "majin") return "pink";
  return "white";
}

/** Push visual entity properties for a player (only the ones that changed). */
export function refreshVisuals(p) {
  const d = getData(p);
  const r = rt(p);
  if (!d.race) return;
  const f = r.form ? FORMS[r.form] : null;
  const pref = d.hairStyle || "goku";
  let hair = 0;
  let style = HAIR_STYLE[pref] ?? 0;
  let body = 0;
  let scale = 1;
  let model = 0;
  let tail = false;
  let spark = false;
  let aura = 0;

  if (d.race === "saiyan" && d.showBaseHair) hair = HAIR_COLOR.black;
  if (d.showRace) body = OVERLAY[BASE_BODY[d.race]] ?? 0;
  if (d.race === "saiyan" && d.tail) tail = true;

  if (f) {
    if (f.vis.hair) {
      hair = HAIR_COLOR[f.vis.hair];
      style = HAIR_STYLE[styleFor(f.vis.style, pref)] ?? style;
    }
    if (f.vis.body) body = OVERLAY[f.vis.body] ?? body;
    if (f.vis.scale) scale = f.vis.scale;
    if (f.vis.tail) tail = true;
    if (f.vis.spark) spark = true;
  }
  if (r.fusion) {
    body = OVERLAY[r.fusion.body] ?? body;
    style = HAIR_STYLE[r.fusion.style] ?? style;
    if (!hair) hair = HAIR_COLOR.black;
    if (r.fusion.fail) scale = r.fusion.thin ? 0.82 : 1.0;
  }
  if (r.oozaru) {
    model = r.oozaru;
    scale = r.oozaru === 2 ? SPECIAL.golden_oozaru.scale : SPECIAL.oozaru.scale;
    tail = false;
  }
  const showAura = r.charging || r.transforming || r.kaioken || (f && f.vis.aura && d.alwaysAura !== false) ||
    (r.flying && r.fastFly) || r.casting;
  if (showAura && !r.hiddenKi) aura = AURA[auraColorName(p)] ?? AURA.white;
  if (!aura) spark = false;
  if (r.giant) scale = Math.max(scale, 3.0);

  const want = { "dbz:hair": hair, "dbz:hair_style": style, "dbz:body": body, "dbz:scale": scale, "dbz:model": model,
    "dbz:tail": tail, "dbz:spark": spark, "dbz:aura": aura };
  r.vis = r.vis || {};
  for (const [k, v] of Object.entries(want)) {
    if (r.vis[k] !== v) {
      try {
        p.setProperty(k, v);
        r.vis[k] = v;
      } catch {
        // property may be unavailable for a moment after join
      }
    }
  }
}

export function setPose(entity, poseName, ticks = 0) {
  const id = POSE[poseName] ?? 0;
  try {
    entity.setProperty("dbz:pose", id);
  } catch {
    return;
  }
  if (entity.typeId === "minecraft:player") {
    const r = rt(entity);
    r.pose = id;
    r.poseUntil = ticks ? system.currentTick + ticks : 0;
  }
}

/* ------------------------------------------------------------------------------- unlocks */

function condMet(d, c) {
  if (c.flag) return !!d.quests[c.flag];
  if (c.train) return (d.train[c.train] ?? 0) >= c.min;
  return false;
}

export function formUnlockable(d, id) {
  const f = FORMS[id];
  if (!f || !f.races.includes(d.race)) return false;
  const u = f.unlock || {};
  if (u.level && d.level < u.level) return false;
  if (u.forms && !u.forms.every((x) => d.forms.includes(x))) return false;
  if (u.any && u.any.length && !u.any.some((c) => condMet(d, c))) return false;
  return true;
}

export function checkUnlocks(p, quiet = false) {
  const d = getData(p);
  if (!d.race) return [];
  const got = [];
  for (const id of formsForRace(d.race)) {
    if (d.forms.includes(id)) continue;
    if (formUnlockable(d, id)) {
      d.forms.push(id);
      got.push(id);
    }
  }
  if (got.length) {
    markDirty(p);
    if (!quiet) {
      for (const id of got) {
        title(p, `§6新たな変身！`, `§e${FORMS[id].name} §fを習得した`, 60);
        msg(p, `§6[変身習得] §e${FORMS[id].name}§f ― 変身アイテムを使うと変身できる。`);
      }
      psound(p, "dbz.learn");
    }
  }
  return got;
}

export function grantFlag(p, flag) {
  const d = getData(p);
  if (d.quests[flag]) return false;
  d.quests[flag] = true;
  markDirty(p);
  checkUnlocks(p);
  return true;
}

/* ------------------------------------------------------------------------------- transform */

export function defaultTarget(d) {
  let best = null;
  let bm = 0;
  for (const id of d.forms) {
    const f = FORMS[id];
    if (!f) continue;
    if (f.giant) continue;
    const m = d.race === "human" && f.humanMult ? f.humanMult : f.mult;
    if (m > bm) {
      bm = m;
      best = id;
    }
  }
  return best;
}

export function transformUp(p) {
  const d = getData(p);
  const r = rt(p);
  if (!d.race) return;
  if (r.oozaru) {
    msg(p, "§7大猿の間は変身できない。");
    return;
  }
  if (r.transforming) return;
  const target = d.target && d.forms.includes(d.target) ? d.target : defaultTarget(d);
  if (!target) {
    msg(p, "§7まだ変身を覚えていない。ドラゴンメニューの「変身」で覚え方を確認しよう。");
    return;
  }
  const chain = chainOf(target).filter((id) => d.forms.includes(id));
  const idx = r.form ? chain.indexOf(r.form) : -1;
  const next = chain[idx + 1];
  if (!next) {
    msg(p, `§7これ以上は変身できない（目標：${FORMS[target].name}）。`);
    return;
  }
  const cost = maxKi(d) * 0.08 * kiCostMult(d);
  if (d.ki < cost) {
    msg(p, "§c気が足りない！ 気を溜めよう。");
    psound(p, "dbz.click", 1, 0.6);
    return;
  }
  d.ki -= cost;
  doTransform(p, next);
}

export function doTransform(p, id, cinematic = true) {
  const r = rt(p);
  const f = FORMS[id];
  if (!f) return;
  r.transforming = true;
  setPose(p, "transform", 34);
  refreshVisuals(p);
  const dim = p.dimension;
  const col = f.vis.aura ?? "white";
  if (cinematic) {
    sound(dim, "dbz.transform", p.location, 2.5);
    try {
      p.addEffect("slowness", 34, { amplifier: 5, showParticles: false });
    } catch {
      // ignore
    }
  }
  let t = 0;
  const run = system.runInterval(() => {
    t++;
    if (!p.isValid) {
      system.clearRun(run);
      return;
    }
    const loc = p.location;
    particle(dim, "dbz:aura_rise", loc, col, 1);
    if (t % 3 === 0) particle(dim, "dbz:dust_rise", loc, "white", 1);
    if (t % 4 === 0) particle(dim, "dbz:lightning", loc, "white", 1);
    if (t % 6 === 0) shake(p, 0.25, 0.3);
    if (t >= (cinematic ? 30 : 2)) {
      system.clearRun(run);
      r.form = id;
      r.transforming = false;
      if (f.giant) r.giant = true;
      refreshVisuals(p);
      applyPassives(p);
      particle(dim, "dbz:explosion_core", V.up(loc, 1), col, 3);
      particle(dim, "dbz:shockwave", loc, col, 4);
      particle(dim, "dbz:pillar", loc, col, 1);
      sound(dim, "dbz.aura_burst", loc, 3);
      shakeArea(dim, loc, 24, 0.6, 0.6);
      flash(p, { red: 1, green: 1, blue: 0.9 }, 0.05);
      title(p, `§6${f.name}！`, `§e戦闘力 ${fmtPL(powerOf(p))}`, 30);
      emit("transformed", p, id);
    }
  }, 1);
}

export function revertForm(p, quiet = false) {
  const r = rt(p);
  const had = r.form || r.kaioken;
  r.form = null;
  r.kaioken = 0;
  r.giant = false;
  refreshVisuals(p);
  applyPassives(p);
  if (had && !quiet) {
    sound(p.dimension, "dbz.dash", p.location, 1, 0.7);
    particle(p.dimension, "dbz:ki_spark", V.up(p.location, 1), "white", 1);
    msg(p, "§7変身を解いた。");
  }
}

export function cycleKaioken(p) {
  const r = rt(p);
  const d = getData(p);
  if (r.oozaru) return;
  const next = (r.kaioken + 1) % KAIOKEN_LEVELS.length;
  if (next === 0) {
    r.kaioken = 0;
    msg(p, "§7界王拳を解除した。");
    refreshVisuals(p);
    return;
  }
  if (next > 2 && d.level < 30) {
    msg(p, "§c体がもたない！（界王拳10倍以上はレベル30から）");
    r.kaioken = 0;
    refreshVisuals(p);
    return;
  }
  r.kaioken = next;
  const lv = KAIOKEN_LEVELS[next];
  title(p, `§c界王拳 ${lv}倍だーっ！！`, "", 25);
  sound(p.dimension, "dbz.aura_burst", p.location, 2, 1.2);
  particle(p.dimension, "dbz:explosion_core", V.up(p.location, 1), "red", 2);
  particle(p.dimension, "dbz:shockwave", p.location, "red", 3);
  refreshVisuals(p);
}

/* ------------------------------------------------------------------------------- per-second upkeep */

export function formSecond(p) {
  const d = getData(p);
  const r = rt(p);
  if (!d.race) return;
  const mk = maxKi(d);
  if (r.form) {
    const f = FORMS[r.form];
    const drain = f.drain * mk * kiCostMult(d) * (r.charging ? 0.3 : 1);
    d.ki -= drain;
    if (r.form.startsWith("ssj") || r.form === "ssj") d.train.ssjSec++;
    if (d.ki <= 0) {
      d.ki = 0;
      msg(p, "§c気が尽きて変身が解けた…");
      revertForm(p, true);
    }
  }
  if (r.kaioken) {
    try {
      const h = p.getComponent("minecraft:health");
      const loss = h.effectiveMax * KAIOKEN_HP_DRAIN[r.kaioken] * (r.form && r.form !== "blue" ? 2.5 : 1);
      if (h.currentValue - loss <= 2) {
        r.kaioken = 0;
        msg(p, "§c体が限界だ！ 界王拳が解けた。");
        refreshVisuals(p);
      } else {
        h.setCurrentValue(h.currentValue - loss);
      }
    } catch {
      // ignore
    }
  }
  if (r.oozaru) {
    r.oozaruSec = (r.oozaruSec ?? 0) + 1;
    const moon = isMoonVisible(p) || powerBallNear(p);
    if (r.oozaruSec > 180 || (!moon && r.oozaruSec > 20)) endOozaru(p);
  }
}

/* ------------------------------------------------------------------------------- great ape */

export const powerBalls = [];

export function powerBallNear(p) {
  const now = system.currentTick;
  for (let i = powerBalls.length - 1; i >= 0; i--) {
    if (powerBalls[i].until < now) powerBalls.splice(i, 1);
  }
  return powerBalls.some((b) => b.dim === p.dimension.id && V.dist(b.loc, p.location) < 80);
}

export function isMoonVisible(p) {
  try {
    const t = world.getTimeOfDay();
    const night = t > 13000 && t < 23000;
    return night && world.getMoonPhase() === 0 && p.dimension.id === "minecraft:overworld";
  } catch {
    return false;
  }
}

export function checkOozaru(p) {
  const d = getData(p);
  const r = rt(p);
  if (d.race !== "saiyan" || !d.tail || r.oozaru || r.fusion) return;
  const rot = p.getRotation();
  const lookingUp = rot.x < -25;
  let trigger = isMoonVisible(p) && lookingUp;
  if (!trigger && powerBallNear(p)) {
    const ball = powerBalls.find((b) => b.dim === p.dimension.id && V.dist(b.loc, p.location) < 80);
    if (ball) {
      const to = V.norm(V.sub(ball.loc, p.getHeadLocation()));
      trigger = V.dot(to, p.getViewDirection()) > 0.85;
    }
  }
  if (!trigger) return;
  startOozaru(p);
}

export function startOozaru(p) {
  const d = getData(p);
  const r = rt(p);
  const golden = d.forms.includes("ssj") && d.level >= 100;
  r.form = null;
  r.kaioken = 0;
  r.flying = false;
  r.oozaru = golden ? 2 : 1;
  r.oozaruSec = 0;
  title(p, golden ? "§6黄金大猿！！" : "§6大猿化！！", "§7月を見てしまった…", 50);
  sound(p.dimension, "dbz.roar", p.location, 3);
  shakeArea(p.dimension, p.location, 40, 1.2, 1.2);
  particle(p.dimension, "dbz:explosion_smoke", p.location, "white", 6);
  try {
    p.camera.setCamera("minecraft:third_person");
  } catch {
    // ignore
  }
  refreshVisuals(p);
  applyPassives(p);
  if (golden) grantFlag(p, "golden_oozaru_pending");
}

export function endOozaru(p) {
  const r = rt(p);
  const d = getData(p);
  if (!r.oozaru) return;
  const wasGolden = r.oozaru === 2;
  r.oozaru = 0;
  try {
    p.camera.clear();
  } catch {
    // ignore
  }
  particle(p.dimension, "dbz:explosion_smoke", p.location, "white", 4);
  refreshVisuals(p);
  applyPassives(p);
  msg(p, "§7大猿化が解けた。");
  if (wasGolden) {
    if (grantFlag(p, "golden_oozaru")) {
      msg(p, "§6黄金大猿の力を理性で制御できた… 超サイヤ人4への道が開けた！");
    }
  }
  addExp(p, 200 + d.level * 20);
}

export function cutTail(p) {
  const d = getData(p);
  if (d.race !== "saiyan" || !d.tail) return false;
  d.tail = false;
  markDirty(p);
  endOozaru(p);
  refreshVisuals(p);
  return true;
}

export { formName, clamp };
