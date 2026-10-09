import { system } from "@minecraft/server";
import { getData, rt } from "./data.js";
import { maxKi, powerOf, formName, expToNext } from "./stats.js";
import { TECHS } from "../combat/techData.js";
import { fmtPL, bar } from "./util.js";

const providers = [];

/** Register a function returning an extra HUD line (or null). */
export function addHudLine(fn) {
  providers.push(fn);
}

export function renderHud(p) {
  const d = getData(p);
  const r = rt(p);
  if (!d.race || d.hud === "off" || r.menuOpen) return;
  let hp = 0;
  let hpMax = 20;
  try {
    const h = p.getComponent("minecraft:health");
    hp = h.currentValue;
    hpMax = h.effectiveMax;
  } catch {
    // ignore
  }
  const mk = maxKi(d);
  const kiFrac = d.ki / mk;
  const lines = [];
  const kiCol = kiFrac < 0.2 ? "§c" : r.charging ? "§f" : "§b";
  const top = `§c❤${Math.ceil(hp)}/${Math.ceil(hpMax)} §r${kiCol}気 ${bar(kiFrac, 16, "|", "|", kiCol, "§8")} §7${Math.floor(d.ki)}  §6戦闘力 §e${fmtPL(r.hiddenKi ? 5 : powerOf(p))}`;
  lines.push(top);
  if (d.hud === "full") {
    const form = formName(p);
    const fly = r.flying ? (r.fastFly ? " §b[高速飛行]" : " §b[舞空術]") : "";
    const hide = r.hiddenKi ? " §8[気を消している]" : "";
    lines.push(`§eLv.${d.level} §7EXP ${bar(d.exp / expToNext(d.level), 10, "|", "|", "§a", "§8")} §d[${form}]${fly}${hide}`);
  }
  if (r.casting) {
    const t = TECHS[r.casting.id];
    const f = r.casting.frac ?? 0;
    lines.push(`§e${t?.name ?? ""} 溜め ${bar(f, 20, "█", "█", f >= 1 ? "§a" : "§e", "§8")} §f${Math.floor(f * 100)}%`);
  }
  for (const fn of providers) {
    try {
      const s = fn(p, d, r);
      if (s) lines.push(s);
    } catch {
      // ignore
    }
  }
  if (r.hudMsg && Date.now() < r.hudMsgUntil) lines.push(r.hudMsg);
  else if (d.hud === "full") {
    const slots = d.slots.map((id, i) => `§7${"ABCD"[i]}:§f${id ? TECHS[id]?.name ?? "-" : "-"}`).join(" ");
    lines.push(slots);
  }
  try {
    p.onScreenDisplay.setActionBar(lines.join("\n"));
  } catch {
    // ignore
  }
}
