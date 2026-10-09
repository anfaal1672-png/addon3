import { system, world, ItemStack } from "@minecraft/server";
import { getData, markDirty, rt } from "../core/data.js";
import { addExp } from "../core/stats.js";
import { V, isValid } from "../core/util.js";
import { particle, sound, title, msg, say } from "../core/fx.js";
import { on } from "../core/bus.js";
import { spawnFighter, fighters, hpFrac } from "../npc/fighters.js";
import { statsFor } from "../npc/chars.js";
import { getLayout } from "../world/sites.js";
import { CHARS, CHAR_INDEX } from "../gen/catalog.js";

const POOL = ["yamcha", "krillin", "tien", "piccolo", "gohan", "android18", "trunks", "vegeta", "goku", "gohan_ssj2", "hit"];
const N = (cid) => CHARS[CHAR_INDEX[cid]]?.name ?? cid;

const games = new Map(); // player id -> {round, opponents, foe, ring}

function bracketFor(level) {
  const sorted = POOL.slice().sort((a, b) => statsFor(a).prof.rec - statsFor(b).prof.rec);
  const fit = sorted.filter((c) => statsFor(c).prof.rec <= level + 8);
  const base = fit.length >= 4 ? fit.slice(-4) : sorted.slice(0, 4);
  return base;
}

on("tournamentJoin", (p) => {
  const ring = getLayout().budokai?.ring;
  if (!ring) {
    msg(p, "§7会場の準備がまだできていないようだ。");
    return;
  }
  if (games.has(p.id)) {
    msg(p, "§7もう出場している！");
    return;
  }
  const d = getData(p);
  const opponents = bracketFor(d.level);
  games.set(p.id, { round: 0, opponents, foe: null, ring, lock: 0 });
  say(p, "アナウンサー", "さあ、天下一武道会の始まりです！ 武舞台から落ちたら場外負け、相手の体力を2割まで減らせば勝ちです！");
  system.runTimeout(() => nextRound(p), 60);
});

function nextRound(p) {
  const g = games.get(p.id);
  if (!g || !isValid(p)) return;
  if (g.round >= g.opponents.length) {
    champion(p);
    return;
  }
  const cid = g.opponents[g.round];
  const r = g.ring;
  try {
    p.teleport({ x: r.x + 0.5, y: r.y + 1.1, z: r.z + 5.5 }, { facingLocation: { x: r.x + 0.5, y: r.y + 1.5, z: r.z - 5 } });
    p.getComponent("minecraft:health").resetToMaxValue();
  } catch {
    // ignore
  }
  const d = getData(p);
  const lvl = Math.max(statsFor(cid).prof.rec, d.level - 3 + g.round * 2);
  const foe = spawnFighter(cid, p.dimension, { x: r.x + 0.5, y: r.y + 1.1, z: r.z - 4.5 }, { role: "spar", level: lvl, sparWith: p.id, tag: "tournament", noForms: true });
  if (!foe) return;
  const s = fighters.get(foe.id);
  if (s) {
    s.sparWith = p.id;
    s.tournament = true;
  }
  g.foe = foe.id;
  g.lock = system.currentTick + 40;
  title(p, `§e第${g.round + 1}回戦`, `§fVS ${N(cid)}`, 50);
  sound(p.dimension, "dbz.boss", p.location, 1.5, 1.2);
}

function outOfRing(e, r) {
  const l = e.location;
  return (Math.abs(l.x - r.x - 0.5) > r.r + 0.6 || Math.abs(l.z - r.z - 0.5) > r.r + 0.6) && l.y < r.y + 1.6 && e.isOnGround;
}

function roundOver(p, won, why) {
  const g = games.get(p.id);
  if (!g) return;
  const foe = world.getEntity(g.foe);
  if (foe) {
    try {
      foe.remove();
    } catch {
      // ignore
    }
  }
  g.foe = null;
  if (!won) {
    games.delete(p.id);
    title(p, "§c敗退…", `§7${why}`, 60);
    say(p, "アナウンサー", "惜しくも敗退です！ また挑戦してください！");
    addExp(p, 100 + g.round * 150);
    return;
  }
  title(p, "§a勝利！", `§7${why}`, 40);
  addExp(p, 200 + g.round * 300);
  g.round++;
  system.runTimeout(() => nextRound(p), 80);
}

function champion(p) {
  games.delete(p.id);
  const d = getData(p);
  d.tournament++;
  markDirty(p);
  title(p, "§6天下一武道会 優勝！！", "§e賞金と賞品を手に入れた", 80);
  sound(p.dimension, "dbz.levelup", p.location, 2);
  particle(p.dimension, "dbz:pillar", p.location, "gold", 1);
  /** @type {[string, number][]} */
  const prizes = [["minecraft:diamond", 10], ["minecraft:gold_block", 4], ["dbz:senzu", 3]];
  for (const [id, n] of prizes) {
    try {
      p.dimension.spawnItem(new ItemStack(id, n), V.up(p.location, 1));
    } catch {
      // ignore
    }
  }
  addExp(p, 2000 + d.level * 50);
}

system.runInterval(() => {
  for (const [pid, g] of games) {
    const p = world.getEntity(pid);
    if (!p) {
      games.delete(pid);
      continue;
    }
    if (!g.foe || system.currentTick < g.lock) continue;
    const foe = world.getEntity(g.foe);
    if (!foe) {
      roundOver(p, true, "相手が倒れた");
      continue;
    }
    if (hpFrac(foe) < 0.2) roundOver(p, true, `${N(fighters.get(foe.id)?.cid ?? "")}は戦闘不能！`);
    else if (outOfRing(foe, g.ring)) roundOver(p, true, "相手の場外負け！");
    else if (outOfRing(p, g.ring)) roundOver(p, false, "場外負け…");
    else {
      try {
        const h = p.getComponent("minecraft:health");
        if (h.currentValue / h.effectiveMax < 0.2) {
          h.setCurrentValue(h.effectiveMax * 0.5);
          roundOver(p, false, "ダウン…");
        }
      } catch {
        // ignore
      }
    }
  }
}, 5);

on("playerDied", (p) => {
  if (games.has(p.id)) roundOver(p, false, "やられた");
});
