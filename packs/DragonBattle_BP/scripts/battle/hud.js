import { system, world } from "@minecraft/server";
import { settings } from "../core/settings.js";
import { isValid, pick, bar } from "../core/util.js";
import { actionbar, title, msg } from "../core/fx.js";
import { on } from "../core/bus.js";
import { isKO } from "../combat/damage.js";
import { teamOf, TEAM_STYLE } from "../combat/teams.js";
import { fighters, charName, hpFrac } from "../fighters/fighter.js";

/* What the spectators see: health bars, combo counter, move names, transformations and a running commentary. */

/** @type {() => any} */
let currentMatch = () => null;
export function bindMatch(fn) {
  currentMatch = fn;
}

function viewers(m) {
  if (!m) return [];
  try {
    return m.dim.getPlayers({ location: m.center, maxDistance: 220 });
  } catch {
    return [];
  }
}

const override = new Map(); // player id -> { text, until }

function flashLine(m, text, ticks = 30) {
  const until = system.currentTick + ticks;
  for (const p of viewers(m)) {
    override.set(p.id, { text, until });
    actionbar(p, text);
  }
}

function name(e) {
  const s = fighters.get(e.id);
  return s ? charName(s.cid) : "戦士";
}

function hpBar(e) {
  const f = isKO(e) ? 0 : hpFrac(e);
  const col = f > 0.5 ? "§a" : f > 0.25 ? "§e" : "§c";
  return `${bar(f, 10, "■", "■", col, "§8")} §f${Math.round(f * 100)}%`;
}

function teamColor(e) {
  const t = teamOf(e) ?? fighters.get(e.id)?.lastTeam;
  return TEAM_STYLE[t]?.color ?? "§f";
}

system.runInterval(() => {
  const m = currentMatch();
  if (!m || m.state === "done") return;
  const list = m.entities();
  let text;
  if (list.length === 2) {
    const [a, b] = list;
    text = `${teamColor(a)}${name(a)} ${hpBar(a)}   §7VS   ${teamColor(b)}${name(b)} ${hpBar(b)}`;
  } else {
    const parts = m.sides.map((side) => {
      const alive = side.ids.filter((id) => {
        const e = world.getEntity(id);
        return e && isValid(e) && !isKO(e);
      }).length;
      const st = TEAM_STYLE[side.team];
      return `${st.color}${side.label ?? st.name} ${alive}/${side.ids.length}`;
    });
    text = parts.join("  §7|  ");
  }
  if (m.paused) text = "§c一時停止中  " + text;
  const t = system.currentTick;
  for (const p of viewers(m)) {
    const o = override.get(p.id);
    if (o && t < o.until) continue;
    actionbar(p, text);
  }
}, 10);

/* ------------------------------------------------------------------------------- combos */

const combo = new Map(); // attacker id -> { victim, n, last }

on("hurt", (victim, attacker, amount, opts) => {
  const m = currentMatch();
  if (!m || !attacker || attacker.typeId !== "dbb:fighter") return;
  const t = system.currentTick;
  const c = combo.get(attacker.id);
  if (c && c.victim === victim.id && t - c.last < 26) {
    c.n++;
    c.last = t;
  } else combo.set(attacker.id, { victim: victim.id, n: 1, last: t });
  const n = combo.get(attacker.id).n;
  m.stat.maxCombo = Math.max(m.stat.maxCombo ?? 0, n);
  const cid = fighters.get(attacker.id)?.origin;
  if (cid) {
    m.stat.comboBy ??= {};
    m.stat.comboBy[cid] = Math.max(m.stat.comboBy[cid] ?? 0, n);
  }
  m.stat.maxDamage = Math.max(m.stat.maxDamage ?? 0, amount);
  if (n >= 3) flashLine(m, `${teamColor(attacker)}${name(attacker)}  §e§l${n} HIT!!`, 26);
  // a single blow that takes a big bite out of someone
  let max = 100;
  try {
    max = victim.getComponent("minecraft:health").effectiveMax;
  } catch {
    // ignore
  }
  if (amount > max * 0.18) say(m, pick(["強烈な一撃が入ったー！", "これは効いたかー！？", "とんでもないパワーだ！"]), 40);
});

/* ------------------------------------------------------------------------------- commentary */

let lastSay = 0;

/** Announcer line in chat. Important ones (force) always go through; others are spaced out. */
export function say(m, text, gap = 60, force = false) {
  if (!settings().commentary || !m) return;
  const t = system.currentTick;
  if (!force && t - lastSay < gap) return;
  lastSay = t;
  for (const p of viewers(m)) msg(p, `§6[実況]§f ${text}`);
}

function bigTitle(m, text, sub, stay = 30) {
  for (const p of viewers(m)) title(p, text, sub, stay);
}

on("special", (s, sp) => {
  const m = currentMatch();
  if (!m) return;
  bigTitle(m, `§b§l${sp.name}`, `§7${charName(s.cid)}`, 28);
  say(m, pick([`${charName(s.cid)}が構えた！ ${sp.name}だー！`, `出るか、${charName(s.cid)}の${sp.name}！`, `${sp.name}！ 会場が揺れているー！`]), 30);
});

on("transformStart", (s, from, to) => {
  const m = currentMatch();
  if (!m) return;
  say(m, pick([`な、なんと！ ${charName(from)}の姿が変わっていくー！`, `${charName(from)}の気がどんどん膨れ上がっていく！`]), 0, true);
});

on("transformed", (s, from, to) => {
  const m = currentMatch();
  if (!m) return;
  bigTitle(m, `§6§l${charName(to)}`, "§e変身！", 40);
  flashLine(m, `§6${charName(from)} → §e§l${charName(to)}`, 40);
});

on("beamClash", (a, b) => {
  const m = currentMatch();
  if (!m) return;
  bigTitle(m, "§c§l押し合いだ！！", "", 30);
  say(m, "気功波と気功波が正面からぶつかったー！ すさまじい押し合いだ！", 0, true);
});

on("beamClashTick", (c) => {
  const m = currentMatch();
  if (!m || c.ticks % 10 !== 0) return;
  const n = Math.round((c.s + 1) * 10);
  flashLine(m, `§c${name(c.a.owner)} §a${"█".repeat(n)}§c${"█".repeat(20 - n)} §9${name(c.b.owner)}`, 14);
});

on("beamClashEnd", (w) => {
  const m = currentMatch();
  if (!m || !isValid(w.owner)) return;
  say(m, `押し勝ったのは${name(w.owner)}だーっ！！`, 0, true);
});

on("fistClash", (s, t) => {
  const m = currentMatch();
  if (!m) return;
  say(m, pick(["目にも止まらぬ拳の打ち合いだー！", "速い、速すぎるー！ 拳と拳がぶつかり合う！"]), 40);
});

on("pursuit", (s) => {
  const m = currentMatch();
  if (!m) return;
  say(m, pick([`${charName(s.cid)}が追いついたー！ 追撃だ！`, "吹き飛ばした先に回り込んでいる！"]), 80);
});

on("slammed", () => {
  const m = currentMatch();
  if (!m) return;
  say(m, pick(["地面にめり込んだー！", "叩きつけられたー！ 大きなクレーターができている！"]), 90);
});

on("pinch", (s) => {
  const m = currentMatch();
  if (!m) return;
  say(m, `${charName(s.cid)}、ピンチだ！ ここから逆転はあるのか！？`, 60);
});

on("awaken", (s) => {
  const m = currentMatch();
  if (!m) return;
  bigTitle(m, "§c§l覚醒！！", `§7${charName(s.cid)}`, 30);
  say(m, `${charName(s.cid)}の気が爆発的に高まったー！ まだ終わっていない！`, 0, true);
});

on("counter", (s) => {
  const m = currentMatch();
  if (!m) return;
  say(m, `見切った！ ${charName(s.cid)}のカウンターだ！`, 80);
});

on("taunt", (s) => {
  const m = currentMatch();
  if (!m) return;
  say(m, `${charName(s.cid)}、余裕の表情だ…！`, 80);
});

on("deflect", (s) => {
  const m = currentMatch();
  if (!m) return;
  say(m, `${charName(s.cid)}、気弾を弾き飛ばしたー！`, 120);
});

on("fighterDown", (e) => {
  const m = currentMatch();
  if (!m) return;
  say(m, `${name(e)}、ダウーーン！！`, 0, true);
});

export { bigTitle, flashLine, viewers };
