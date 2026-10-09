import { system, world, ItemStack, EntityComponentTypes } from "@minecraft/server";
import { CHAR_INDEX } from "../gen/catalog.js";
import { V, isValid } from "../core/util.js";
import { particle, sound, msg } from "../core/fx.js";
import { isKO, hurt } from "../combat/damage.js";
import { clearBattleTags, SLOTS, TEAM_STYLE, allDimensions } from "../combat/teams.js";
import { fighters, spawnFighter, enterBattle, leaveBattle, revive, charName, label } from "../fighters/fighter.js";
import { currentMatch, freeMatch, togglePause, endMatch } from "./match.js";
import { cycleCamera, setCameraMode } from "./camera.js";
import { battleMenu } from "../ui/menu.js";

/* Hand tools: team flags, the duel wand, heal / knock-out wands, spawn eggs, the camera and the match controller. */

export const TOOLS = ["dbb:menu", "dbb:camera", "dbb:control", "dbb:team_red", "dbb:team_blue", "dbb:team_green", "dbb:team_yellow",
  "dbb:duel", "dbb:heal", "dbb:kill"];

export function giveTools(p) {
  try {
    const inv = p.getComponent(EntityComponentTypes.Inventory).container;
    const have = new Set();
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it) have.add(it.typeId);
    }
    for (const id of TOOLS) if (!have.has(id)) inv.addItem(new ItemStack(id, 1));
  } catch {
    // ignore
  }
  msg(p, "§aバトルの道具を受け取った。");
}

function heldId(p) {
  try {
    return p.getComponent(EntityComponentTypes.Inventory).container.getItem(p.selectedSlotIndex)?.typeId ?? "";
  } catch {
    return "";
  }
}

function mark(e, color = "white") {
  particle(e.dimension, "dbb:sparkle", V.up(e.location, 1.4), color, 1.2);
}

/* ------------------------------------------------------------------------------- duels */

function slotInUse(k) {
  for (const dim of allDimensions()) {
    try {
      if (dim.getEntities({ tags: [`dbb_hunt_${k}`] }).length || dim.getEntities({ tags: [`dbb_prey_${k}`] }).length) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

export function startDuel(a, b) {
  let k = 0;
  for (let i = 1; i <= SLOTS; i++) {
    if (!slotInUse(i)) {
      k = i;
      break;
    }
  }
  if (!k) return 0;
  for (const e of [a, b]) {
    if (isKO(e)) revive(e);
    clearBattleTags(e);
    e.addTag(`dbb_hunt_${k}`);
    e.addTag(`dbb_prey_${k}`);
    try {
      e.triggerEvent("dbb:role_battle");
      e.triggerEvent(`dbb:hunt_${k}`);
    } catch {
      // ignore
    }
    const s = fighters.get(e.id);
    if (s) {
      s.lastTeam = "purple";
      s.started = system.currentTick;
      label(s);
    }
    freeMatch(e);
  }
  return k;
}

/* ------------------------------------------------------------------------------- hitting with a tool */

const duelPick = new Map(); // player id -> fighter id

export function useOnFighter(p, id, target) {
  if (target.typeId !== "dbb:fighter") {
    msg(p, "§7ドラゴンボールのキャラに使ってね。");
    return;
  }
  const name = charName(fighters.get(target.id)?.cid ?? "");
  if (id.startsWith("dbb:team_")) {
    if (p.isSneaking) {
      leaveBattle(target);
      currentMatch()?.ids.delete(target.id);
      msg(p, `§7${name}をバトルから外した。`);
      return;
    }
    const team = id.slice("dbb:team_".length);
    if (isKO(target)) revive(target);
    enterBattle(target, team);
    freeMatch(target);
    mark(target, team === "yellow" ? "gold" : team);
    msg(p, `${TEAM_STYLE[team].color}${name}が${TEAM_STYLE[team].name}チームに入った。`);
    return;
  }
  if (id === "dbb:duel") {
    if (p.isSneaking) {
      duelPick.delete(p.id);
      msg(p, "§7選択を解除した。");
      return;
    }
    const firstId = duelPick.get(p.id);
    const first = firstId ? world.getEntity(firstId) : undefined;
    if (!first || !isValid(first) || first.id === target.id) {
      duelPick.set(p.id, target.id);
      mark(target, "yellow");
      msg(p, `§e1人目：${name}§7（もう1人を叩くと一騎打ち開始）`);
      return;
    }
    duelPick.delete(p.id);
    if (!startDuel(first, target)) {
      msg(p, "§c同時にできる一騎打ちはここまで。どれかが終わるのを待とう。");
      return;
    }
    mark(first, "red");
    mark(target, "red");
    sound(p.dimension, "dbb.clash", target.location, 1.5);
    msg(p, `§d一騎打ち：${charName(fighters.get(first.id)?.cid ?? "")} vs ${name}`);
    return;
  }
  if (id === "dbb:heal") {
    if (isKO(target)) {
      const s = fighters.get(target.id);
      revive(target);
      if (s?.lastTeam && currentMatch()) enterBattle(target, s.lastTeam);
    } else {
      try {
        target.getComponent("minecraft:health")?.resetToMaxValue();
      } catch {
        // ignore
      }
    }
    mark(target, "green");
    sound(p.dimension, "dbb.senzu", target.location, 1);
    return;
  }
  if (id === "dbb:kill") {
    hurt(target, 1e9, undefined, { raw: true, unblockable: true });
    particle(target.dimension, "dbb:pop_smoke", target.location, "white", 1.4);
  }
}

world.afterEvents.entityHitEntity.subscribe((ev) => {
  const p = ev.damagingEntity;
  const target = ev.hitEntity;
  if (p?.typeId !== "minecraft:player" || !target || !isValid(target)) return;
  const id = heldId(p);
  if (!["dbb:team_", "dbb:duel", "dbb:heal", "dbb:kill"].some((k) => id.startsWith(k))) return;
  // the tool's own swing does no harm
  try {
    if (target.typeId === "dbb:fighter") target.getComponent("minecraft:health")?.setCurrentValue(
      Math.min(target.getComponent("minecraft:health").effectiveMax, target.getComponent("minecraft:health").currentValue + 1));
  } catch {
    // ignore
  }
  useOnFighter(p, id, target);
});

/* ------------------------------------------------------------------------------- using items */

const lastEgg = new Map();

function spawnPoint(block, face) {
  const o = { Up: [0, 1, 0], Down: [0, -2, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] }[face] ?? [0, 1, 0];
  return { x: block.location.x + o[0] + 0.5, y: block.location.y + o[1], z: block.location.z + o[2] + 0.5 };
}

function airPoint(p) {
  try {
    const hit = p.getBlockFromViewDirection({ maxDistance: 8 });
    if (hit) return spawnPoint(hit.block, hit.face);
  } catch {
    // ignore
  }
  const v = p.getViewDirection();
  return V.add(p.location, { x: v.x * 3, y: 0, z: v.z * 3 });
}

export function useEgg(p, typeId, loc) {
  const cid = typeId.slice("dbb:egg_".length);
  if (CHAR_INDEX[cid] === undefined) return null;
  const t = system.currentTick;
  if ((lastEgg.get(p.id) ?? -100) > t - 5) return null;
  lastEgg.set(p.id, t);
  const e = spawnFighter(cid, p.dimension, loc);
  if (!e) return null;
  particle(p.dimension, "dbb:pop_smoke", loc, "white", 1);
  sound(p.dimension, "dbb.capsule", loc, 0.8);
  msg(p, `§a${charName(cid)}が現れた。§7（チームの旗や一騎打ちの杖で戦わせよう）`);
  try {
    if (p.getGameMode() !== "Creative") {
      const inv = p.getComponent(EntityComponentTypes.Inventory).container;
      const it = inv.getItem(p.selectedSlotIndex);
      if (it && it.typeId === typeId) {
        if (it.amount > 1) {
          it.amount--;
          inv.setItem(p.selectedSlotIndex, it);
        } else inv.setItem(p.selectedSlotIndex, undefined);
      }
    }
  } catch {
    // ignore
  }
  return e;
}

world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
  const id = ev.itemStack?.typeId;
  if (!ev.isFirstEvent || !id || !id.startsWith("dbb:egg_")) return;
  useEgg(ev.player, id, spawnPoint(ev.block, ev.blockFace));
});

world.afterEvents.itemUse.subscribe((ev) => {
  const p = ev.source;
  const id = ev.itemStack?.typeId ?? "";
  if (id.startsWith("dbb:egg_")) {
    useEgg(p, id, airPoint(p));
    return;
  }
  if (id === "dbb:menu") battleMenu(p);
  else if (id === "dbb:camera") {
    if (p.isSneaking) setCameraMode(p, "free");
    else cycleCamera(p);
  } else if (id === "dbb:control") {
    const m = currentMatch();
    if (!m) msg(p, "§7今は試合をしていません。");
    else if (p.isSneaking) endMatch(m, true);
    else if (!togglePause(m)) msg(p, "§7試合が始まってから使えます。");
  } else if (id === "dbb:duel") {
    duelPick.delete(p.id);
    msg(p, "§7一騎打ちの選択を解除した。");
  } else if (id.startsWith("dbb:team_") || id === "dbb:heal" || id === "dbb:kill") {
    msg(p, "§7キャラを叩いて使います。");
  }
});
