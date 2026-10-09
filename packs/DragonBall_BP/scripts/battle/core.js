import { world } from "@minecraft/server";
import { worldGet, worldSet } from "../core/data.js";

/* Mob battle state lives in entity tags so it survives reloads and works on any entity
 * (fighters, vanilla mobs, players):
 *   dbz_bt + dbz_t_<team>   team battle member
 *   dbz_hunt_<k>            attacks whoever carries dbz_prey_<k>
 *   dbz_prey_<k>            target of slot k (a duel gives both fighters both tags)
 * Fighters additionally get the matching component group so the engine chases the target. */

export const TEAMS = {
  red: { name: "赤", color: "§c" },
  blue: { name: "青", color: "§9" },
  green: { name: "緑", color: "§a" },
  yellow: { name: "黄", color: "§e" },
};
export const TEAM_IDS = Object.keys(TEAMS);
export const SLOTS = 8;
export const TAG_BT = "dbz_bt";

const SKEY = "dbz:battle";
let cache = null;

/** paused: nobody fights; ff: friendly fire inside a team; hp: show health under names */
export function battleSettings() {
  if (!cache) cache = Object.assign({ paused: false, ff: false, hp: true }, worldGet(SKEY, {}));
  return cache;
}

export function saveBattleSettings() {
  worldSet(SKEY, battleSettings());
}

function tags(e) {
  try {
    return e.getTags();
  } catch {
    return [];
  }
}

export function teamOf(e) {
  for (const t of tags(e)) if (t.startsWith("dbz_t_")) return t.slice(6);
  return null;
}

function slotsOf(e, prefix) {
  const out = [];
  for (const t of tags(e)) if (t.startsWith(prefix)) out.push(Number(t.slice(prefix.length)));
  return out;
}

export const huntSlots = (e) => slotsOf(e, "dbz_hunt_");
export const preySlots = (e) => slotsOf(e, "dbz_prey_");

export function isBattler(e) {
  try {
    if (!e?.isValid) return false;
  } catch {
    return false;
  }
  return teamOf(e) !== null || huntSlots(e).length > 0 || preySlots(e).length > 0;
}

/** Whether a fights b under the battle rules. forDamage: also let friendly fire through (it never makes
 * teammates seek each other out). */
export function isBattleEnemy(a, b, forDamage = false) {
  if (!a || !b || a.id === b.id) return false;
  for (const k of huntSlots(a)) if (b.hasTag(`dbz_prey_${k}`)) return true;
  for (const k of huntSlots(b)) if (a.hasTag(`dbz_prey_${k}`)) return true; // hit back
  const ta = teamOf(a);
  const tb = teamOf(b);
  if (ta && tb) return ta !== tb || (forDamage && battleSettings().ff);
  return false;
}

function alive(e) {
  try {
    if (!e.isValid) return false;
    const h = e.getComponent("minecraft:health");
    if (h && h.currentValue <= 0) return false;
    if (e.typeId === "minecraft:player") {
      const gm = /** @type {any} */ (e).getGameMode?.();
      if (gm === "Spectator") return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Every living battle participant in the entity's dimension within range. */
export function battlersNear(dim, loc, range = 64) {
  const seen = new Map();
  const add = (list) => {
    for (const x of list) if (alive(x)) seen.set(x.id, x);
  };
  try {
    add(dim.getEntities({ location: loc, maxDistance: range, tags: [TAG_BT] }));
    for (let k = 1; k <= SLOTS; k++) {
      add(dim.getEntities({ location: loc, maxDistance: range, tags: [`dbz_hunt_${k}`] }));
      add(dim.getEntities({ location: loc, maxDistance: range, tags: [`dbz_prey_${k}`] }));
    }
  } catch {
    // ignore
  }
  return [...seen.values()];
}

/** Nearest entity e should be fighting right now, or null. */
export function findBattleTarget(e, range = 48) {
  if (battleSettings().paused || !isBattler(e)) return null;
  let best = null;
  let bd = range * range;
  for (const x of battlersNear(e.dimension, e.location, range)) {
    if (!isBattleEnemy(e, x)) continue;
    const dx = x.location.x - e.location.x;
    const dy = x.location.y - e.location.y;
    const dz = x.location.z - e.location.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) {
      bd = d;
      best = x;
    }
  }
  return best;
}

export function allDimensions() {
  const out = new Map();
  for (const id of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
    try {
      const d = world.getDimension(id);
      if (d && !out.has(d.id ?? id)) out.set(d.id ?? id, d);
    } catch {
      // ignore
    }
  }
  return [...out.values()];
}
