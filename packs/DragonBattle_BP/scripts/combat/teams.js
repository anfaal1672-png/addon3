import { world } from "@minecraft/server";
import { TEAMS } from "../gen/catalog.js";

/* Who fights whom lives in entity tags, so it survives reloads and is cheap to test:
 *   dbb_bt + dbb_t_<team>   team member (each match side is a team)
 *   dbb_hunt_<k>            attacks whoever carries dbb_prey_<k> (duel wand: both carry both)
 * Knocked-out fighters lose their tags. */

export const TAG_BT = "dbb_bt";
export const SLOTS = 8;
export { TEAMS };

export const TEAM_STYLE = {
  red: { name: "赤", color: "§c", fx: "red" },
  blue: { name: "青", color: "§9", fx: "blue" },
  green: { name: "緑", color: "§a", fx: "green" },
  yellow: { name: "黄", color: "§e", fx: "yellow" },
  purple: { name: "紫", color: "§d", fx: "purple" },
  orange: { name: "橙", color: "§6", fx: "orange" },
  cyan: { name: "水色", color: "§b", fx: "cyan" },
  white: { name: "白", color: "§f", fx: "white" },
};

function tags(e) {
  try {
    return e.getTags();
  } catch {
    return [];
  }
}

export function teamOf(e) {
  for (const t of tags(e)) if (t.startsWith("dbb_t_")) return t.slice(6);
  return null;
}

function slotsOf(e, prefix) {
  const out = [];
  for (const t of tags(e)) if (t.startsWith(prefix)) out.push(Number(t.slice(prefix.length)));
  return out;
}

export const huntSlots = (e) => slotsOf(e, "dbb_hunt_");
export const preySlots = (e) => slotsOf(e, "dbb_prey_");

export function isBattler(e) {
  try {
    if (!e?.isValid) return false;
  } catch {
    return false;
  }
  return teamOf(e) !== null || huntSlots(e).length > 0 || preySlots(e).length > 0;
}

/** Whether a and b are on opposite sides. */
export function isEnemy(a, b) {
  if (!a || !b || a.id === b.id) return false;
  for (const k of huntSlots(a)) if (b.hasTag(`dbb_prey_${k}`)) return true;
  for (const k of huntSlots(b)) if (a.hasTag(`dbb_prey_${k}`)) return true;
  const ta = teamOf(a);
  const tb = teamOf(b);
  return !!(ta && tb && ta !== tb);
}

export function clearBattleTags(e) {
  try {
    for (const t of e.getTags()) if (t === TAG_BT || t.startsWith("dbb_t_") || t.startsWith("dbb_hunt_") || t.startsWith("dbb_prey_")) e.removeTag(t);
  } catch {
    // ignore
  }
}

export function setTeam(e, team) {
  clearBattleTags(e);
  try {
    e.addTag(TAG_BT);
    e.addTag(`dbb_t_${team}`);
  } catch {
    // ignore
  }
}

export function alive(e) {
  try {
    if (!e.isValid) return false;
    const h = e.getComponent("minecraft:health");
    return !h || h.currentValue > 0;
  } catch {
    return false;
  }
}

/** Every battle participant around loc. */
export function battlersNear(dim, loc, range = 96) {
  const seen = new Map();
  const add = (list) => {
    for (const x of list) if (alive(x)) seen.set(x.id, x);
  };
  try {
    add(dim.getEntities({ location: loc, maxDistance: range, tags: [TAG_BT] }));
    for (let k = 1; k <= SLOTS; k++) {
      add(dim.getEntities({ location: loc, maxDistance: range, tags: [`dbb_hunt_${k}`] }));
      add(dim.getEntities({ location: loc, maxDistance: range, tags: [`dbb_prey_${k}`] }));
    }
  } catch {
    // ignore
  }
  return [...seen.values()];
}

/** Nearest opponent of e (players in a team count), or null. */
export function nearestEnemy(e, range = 64) {
  let best = null;
  let bd = range * range;
  for (const x of battlersNear(e.dimension, e.location, range)) {
    if (!isEnemy(e, x)) continue;
    if (x.typeId === "minecraft:player") {
      try {
        const gm = x.getGameMode();
        if (gm === "Creative" || gm === "Spectator") continue;
      } catch {
        // ignore
      }
    }
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
