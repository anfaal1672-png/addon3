import { system, world } from "@minecraft/server";
import { getData, settings } from "../core/data.js";
import { V, rand, pick, chance, clamp } from "../core/util.js";
import { spawnFighter, fighters } from "../npc/fighters.js";
import { statsFor } from "../npc/chars.js";
import { siteAt, getLayout } from "./sites.js";

/* Natural spawns of Dragon Ball enemies around players (script-driven so the rate is configurable). */

function biomeOf(dim, loc) {
  try {
    return dim.getBiome(loc).id;
  } catch {
    return "";
  }
}

function pickSpawn(p, dim, loc) {
  const d = getData(p);
  const t = world.getTimeOfDay();
  const night = t > 13000 && t < 23000;
  const site = siteAt(loc, 60);
  const L = getLayout();
  if (site === "namek") return chance(0.7) ? "frieza_soldier" : null;
  if (site === "red_ribbon") return chance(0.6) ? "rr_soldier" : "rr_robot";
  if (L.red_ribbon && V.hdist(loc, L.red_ribbon) < 140 && chance(0.4)) return "rr_soldier";
  const biome = biomeOf(dim, loc);
  const lush = /plains|forest|jungle|savanna|swamp|meadow|taiga/.test(biome);
  if (!night && lush && chance(0.35)) return "dbz:dinosaur";
  if (night) {
    const opts = [];
    if (d.level >= 6) opts.push("saibaman");
    if (d.level >= 4) opts.push("rr_soldier");
    if (d.level >= 18) opts.push("frieza_soldier");
    if (d.level >= 55) opts.push("cell_jr");
    if (d.level >= 60) opts.push("yamu");
    if (opts.length && chance(0.5)) return pick(opts);
  }
  return null;
}

system.runInterval(() => {
  const rate = settings().spawnRate;
  if (rate <= 0) return;
  for (const p of world.getAllPlayers()) {
    if (p.dimension.id !== "minecraft:overworld") continue;
    const d = getData(p);
    if (!d.race) continue;
    if (!chance(0.35 * rate)) continue;
    const dim = p.dimension;
    let count = 0;
    for (const s of fighters.values()) if (s.role === "enemy" && !s.boss && V.dist(s.e.location, p.location) < 48) count++;
    try {
      count += dim.getEntities({ type: "dbz:dinosaur", location: p.location, maxDistance: 48 }).length;
    } catch {
      // ignore
    }
    if (count >= Math.round(3 * rate)) continue;
    const a = rand(0, Math.PI * 2);
    const r = rand(20, 32);
    const loc = { x: p.location.x + Math.cos(a) * r, y: p.location.y, z: p.location.z + Math.sin(a) * r };
    try {
      const top = dim.getTopmostBlock({ x: loc.x, z: loc.z });
      if (!top || top.isLiquid || top.typeId.includes("water")) continue;
      loc.y = top.location.y + 1;
    } catch {
      continue;
    }
    if (Math.abs(loc.y - p.location.y) > 24) continue;
    const site = siteAt(loc, 10);
    if (site && site !== "namek" && site !== "red_ribbon") continue;
    const what = pickSpawn(p, dim, loc);
    if (!what) continue;
    if (what === "dbz:dinosaur") {
      try {
        dim.spawnEntity("dbz:dinosaur", loc);
      } catch {
        // ignore
      }
      continue;
    }
    const rec = statsFor(what).prof.rec;
    const lvl = clamp(d.level, rec - 4, rec + 20);
    const n = what === "saibaman" || what === "rr_soldier" || what === "frieza_soldier" ? Math.floor(rand(1, 3.99)) : 1;
    for (let i = 0; i < n; i++) {
      spawnFighter(what, dim, V.add(loc, { x: rand(-2, 2), y: 0, z: rand(-2, 2) }), { role: "enemy", level: lvl, mob: true });
    }
  }
}, 200);
