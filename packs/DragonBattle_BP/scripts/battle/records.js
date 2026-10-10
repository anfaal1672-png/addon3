import { worldGet, worldSet } from "../core/settings.js";
import { CHAR_INDEX } from "../gen/catalog.js";
import { charName } from "../fighters/fighter.js";

/* Win / loss records per character, the longest combos, favourite finishers, and the last match. */

const KEY = "dbb:records";
const LAST = "dbb:last";

/** @returns {Record<string, { w: number, l: number, combo: number, fin: Record<string, number> }>} */
function load() {
  return worldGet(KEY, {});
}

export function recordResult(winners, losers, stat) {
  const r = load();
  const get = (cid) => (r[cid] ??= { w: 0, l: 0, combo: 0, fin: {} });
  for (const cid of winners) {
    const x = get(cid);
    x.w++;
    x.combo = Math.max(x.combo, stat.comboBy?.[cid] ?? 0);
    if (stat.finisher) x.fin[stat.finisher] = (x.fin[stat.finisher] ?? 0) + 1;
  }
  for (const cid of losers) get(cid).l++;
  worldSet(KEY, r);
  worldSet(LAST, {
    winners: winners.map(charName), losers: losers.map(charName), secs: stat.secs ?? 0, finisher: stat.finisher ?? "",
    maxDamage: Math.round(stat.maxDamage ?? 0), maxCombo: stat.maxCombo ?? 0, mode: stat.mode ?? "",
  });
}

export function rankingText(limit = 15) {
  const r = load();
  const rows = Object.entries(r)
    .filter(([cid]) => CHAR_INDEX[cid] !== undefined)
    .sort(([, a], [, b]) => b.w - a.w || (a.l - b.l));
  if (!rows.length) return "§7まだ記録がありません。試合をしてみよう！";
  return rows.slice(0, limit).map(([cid, x], i) => {
    const total = x.w + x.l;
    const rate = total ? Math.round((x.w / total) * 100) : 0;
    const fav = Object.entries(x.fin).sort(([, a], [, b]) => b - a)[0]?.[0];
    return `§e${i + 1}. §f${charName(cid)}  §a${x.w}勝 §c${x.l}敗 §7(${rate}%)${x.combo ? ` 最大${x.combo}コンボ` : ""}${fav ? ` 得意技:${fav}` : ""}`;
  }).join("\n");
}

export function lastText() {
  const l = worldGet(LAST, null);
  if (!l) return "§7まだ試合がありません。";
  return [
    `§6勝者：§f${l.winners.join("、") || "なし"}`,
    `§7相手：${l.losers.join("、")}`,
    `§7試合時間：${l.secs}秒`,
    l.finisher ? `§7決め技：${l.finisher}` : "",
    `§7最大ダメージ：${l.maxDamage}　最大コンボ：${l.maxCombo}`,
  ].filter(Boolean).join("\n");
}

export function resetRecords() {
  worldSet(KEY, {});
  worldSet(LAST, null);
}
