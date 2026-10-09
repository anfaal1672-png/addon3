import { system, world, EntityComponentTypes } from "@minecraft/server";
import { CHARS, CHAR_INDEX } from "../gen/catalog.js";
import { spawnFighter } from "../npc/fighters.js";
import { particle, sound, msg } from "../core/fx.js";
import { V } from "../core/util.js";

/* Character spawn eggs (dbz:egg_<character id>).
 * Villains come out hostile and everyone else peaceful (talk / spar); sneaking while using flips it. */

const PREFIX = "dbz:egg_";

const HOSTILE = new Set([
  "raditz", "nappa", "saibaman", "ginyu", "recoome", "burter", "jeice", "guldo",
  "frieza1", "frieza2", "frieza3", "frieza4", "frieza_golden", "frieza_soldier",
  "android16", "android17", "android18", "android19", "android20",
  "cell1", "cell2", "cell", "cell_super", "cell_jr",
  "dabura", "spopovich", "yamu", "buu_fat", "buu_super", "buu_gohan", "buu_kid",
  "broly", "broly_lssj", "goku_black", "goku_black_rose", "zamasu", "hit", "jiren",
  "rr_soldier", "rr_robot", "oozaru",
]);

const OFFSET = { Up: { x: 0, y: 1, z: 0 }, Down: { x: 0, y: -2, z: 0 }, North: { x: 0, y: 0, z: -1 }, South: { x: 0, y: 0, z: 1 },
  East: { x: 1, y: 0, z: 0 }, West: { x: -1, y: 0, z: 0 } };

/** player id -> tick of the last spawn (a block click can fire both events below) */
const lastUse = new Map();

function spawnPoint(block, face) {
  const o = OFFSET[face] ?? OFFSET.Up;
  return { x: block.location.x + o.x + 0.5, y: block.location.y + o.y, z: block.location.z + o.z + 0.5 };
}

function airPoint(p) {
  try {
    const hit = p.getBlockFromViewDirection({ maxDistance: 6 });
    if (hit) return spawnPoint(hit.block, hit.face);
  } catch {
    // ignore
  }
  const v = p.getViewDirection();
  return V.add(p.location, { x: v.x * 3, y: 0, z: v.z * 3 });
}

function consumeOne(p) {
  try {
    if (p.getGameMode() === "Creative") return;
    const inv = p.getComponent(EntityComponentTypes.Inventory).container;
    const it = inv.getItem(p.selectedSlotIndex);
    if (!it || !it.typeId.startsWith(PREFIX)) return;
    if (it.amount > 1) {
      it.amount--;
      inv.setItem(p.selectedSlotIndex, it);
    } else inv.setItem(p.selectedSlotIndex, undefined);
  } catch {
    // ignore
  }
}

export function useEgg(p, typeId, loc) {
  const cid = typeId.slice(PREFIX.length);
  const idx = CHAR_INDEX[cid];
  if (idx === undefined) return null;
  const t = system.currentTick;
  if ((lastUse.get(p.id) ?? -100) > t - 5) return null;
  lastUse.set(p.id, t);
  let hostile = HOSTILE.has(cid);
  if (p.isSneaking) hostile = !hostile;
  const e = spawnFighter(cid, p.dimension, loc, { role: hostile ? "enemy" : "npc" });
  if (!e) return null;
  particle(p.dimension, "dbz:pop_smoke", loc, "white", 1);
  sound(p.dimension, "dbz.capsule", loc, 0.8);
  const name = CHARS[idx].name;
  msg(p, hostile ? `§c${name}が現れた！（敵）` : `§a${name}が現れた。§7（話しかけると会話・手合わせ）`);
  consumeOne(p);
  return e;
}

world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
  const id = ev.itemStack?.typeId;
  if (!ev.isFirstEvent || !id || !id.startsWith(PREFIX)) return;
  useEgg(ev.player, id, spawnPoint(ev.block, ev.blockFace));
});

world.afterEvents.itemUse.subscribe((ev) => {
  const id = ev.itemStack?.typeId;
  if (!id || !id.startsWith(PREFIX)) return;
  useEgg(ev.source, id, airPoint(ev.source));
});
