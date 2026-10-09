import { system, world, ItemStack, EntityComponentTypes, EquipmentSlot } from "@minecraft/server";
import { ModalFormData, ActionFormData } from "@minecraft/server-ui";
import { getData, markDirty, rt, worldGet, worldSet } from "../core/data.js";
import { maxKi, addExp, displayPL, powerOf } from "../core/stats.js";
import { V, isValid, fmtPL, rand } from "../core/util.js";
import { particle, sound, title, msg, say, psound, flash } from "../core/fx.js";
import { addHudLine } from "../core/hud.js";
import { onBlockInteract } from "../core/interact.js";
import { powerOfAny, hurt, isHostile, knock, checkZenkai } from "../combat/damage.js";
import { spawnFighter, fighters } from "../npc/fighters.js";
import { CHARS, CHAR_INDEX, KI_COLOR } from "../gen/catalog.js";
import { dome, fill, set, disc, cylinder } from "../world/build.js";
import { addGravityRoom, removeGravityRoom } from "../world/regions.js";
import { summonKintoun, spawnVehicle, nearestVehicle } from "./vehicles.js";
import { radarMenu } from "../world/dragonballs.js";
import { emit } from "../core/bus.js";

export const KIT = ["dbz:ki_charge", "dbz:skill_1", "dbz:skill_2", "dbz:skill_3", "dbz:skill_4", "dbz:transform", "dbz:guard", "dbz:menu"];

export function giveKit(p, quiet = false) {
  let inv;
  try {
    inv = p.getComponent(EntityComponentTypes.Inventory).container;
  } catch {
    return;
  }
  const have = new Set();
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it) have.add(it.typeId);
  }
  let given = 0;
  KIT.forEach((id, idx) => {
    if (have.has(id)) return;
    const st = new ItemStack(id, 1);
    st.keepOnDeath = true;
    const cur = inv.getItem(idx);
    if (!cur) inv.setItem(idx, st);
    else {
      const left = inv.addItem(st);
      if (left) p.dimension.spawnItem(left, p.location);
    }
    given++;
  });
  if (given && !quiet) {
    msg(p, "§a操作アイテムを受け取った！ §7(1:気溜め 2〜5:技スロット 6:変身 7:ガード 8:メニュー)");
    psound(p, "dbz.capsule");
  }
}

function held(p) {
  try {
    return p.getComponent(EntityComponentTypes.Inventory).container.getItem(p.selectedSlotIndex);
  } catch {
    return undefined;
  }
}

function setHeld(p, item) {
  try {
    p.getComponent(EntityComponentTypes.Inventory).container.setItem(p.selectedSlotIndex, item);
  } catch {
    // ignore
  }
}

function consumeHeld(p) {
  const it = held(p);
  if (!it) return;
  if (it.amount > 1) {
    it.amount--;
    setHeld(p, it);
  } else setHeld(p, undefined);
}

/* ===================================================================================== consumables */

world.afterEvents.itemCompleteUse.subscribe((ev) => {
  const p = ev.source;
  const id = ev.itemStack?.typeId;
  if (id === "dbz:senzu") {
    const d = getData(p);
    try {
      p.getComponent("minecraft:health").resetToMaxValue();
      for (const e of ["poison", "wither", "slowness", "weakness", "nausea", "blindness", "hunger", "mining_fatigue"]) p.removeEffect(e);
    } catch {
      // ignore
    }
    d.ki = maxKi(d);
    particle(p.dimension, "dbz:sparkle", V.up(p.location, 1), "green", 1);
    sound(p.dimension, "dbz.senzu", p.location, 1);
    title(p, "", "§a仙豆を食べて全回復！", 20);
    system.runTimeout(() => checkZenkai(p), 2);
  } else if (id === "dbz:sacred_water") {
    const d = getData(p);
    d.points += 5;
    d.ki = maxKi(d);
    markDirty(p);
    title(p, "§b超聖水", "§f力が湧いてくる！（ステータスポイント+5）", 50);
    particle(p.dimension, "dbz:pillar", p.location, "cyan", 1);
  }
});

/* ===================================================================================== scouter */

function wearingScouter(p) {
  try {
    return p.getComponent(EntityComponentTypes.Equippable).getEquipment(EquipmentSlot.Head)?.typeId === "dbz:scouter";
  } catch {
    return false;
  }
}

addHudLine((p, d, r) => {
  if (!wearingScouter(p)) return null;
  let hit;
  try {
    hit = p.dimension.getEntitiesFromRay(p.getHeadLocation(), p.getViewDirection(), { maxDistance: 80, excludeFamilies: ["dbz_fx", "inanimate"] })
      .find((h) => h.entity.id !== p.id);
  } catch {
    hit = undefined;
  }
  if (!hit) {
    r.scouterTarget = null;
    return "§a[スカウター] §2…";
  }
  const e = hit.entity;
  const pl = e.typeId === "minecraft:player" ? displayPL(e) : powerOfAny(e);
  if (r.scouterTarget !== e.id) {
    r.scouterTarget = e.id;
    r.scouterSince = system.currentTick;
    psound(p, "dbz.scouter_beep", 0.6);
  }
  const name = e.typeId === "dbz:fighter" ? CHARS[e.getProperty("dbz:char")]?.name ?? "?" : e.typeId === "minecraft:player" ? e.name : e.typeId.replace("minecraft:", "");
  if (pl > 5e5 && system.currentTick - (r.scouterSince ?? 0) > 30) {
    breakScouter(p);
    return "§c[スカウター] 測定不能！！";
  }
  return `§a[スカウター] §f${name} §a戦闘力 §e${fmtPL(pl)} §7(${Math.round(hit.distance)}m)`;
});

function breakScouter(p) {
  try {
    p.getComponent(EntityComponentTypes.Equippable).setEquipment(EquipmentSlot.Head, undefined);
  } catch {
    return;
  }
  sound(p.dimension, "dbz.scouter_explode", p.location, 1.5);
  particle(p.dimension, "dbz:impact", p.getHeadLocation(), "orange", 1.5);
  particle(p.dimension, "dbz:explosion_smoke", p.getHeadLocation(), "white", 0.6);
  title(p, "§cボンッ！！", "§7スカウターが壊れた！ 戦闘力が高すぎる…", 40);
}

/* ===================================================================================== ki sensing */

addHudLine((p, d, r) => {
  if (d.level < 15 || wearingScouter(p) || d.hud === "off") return null;
  if (system.currentTick % 20 !== 0 && r.senseLine !== undefined) return r.senseLine;
  let best = null;
  let bp = 0;
  const my = powerOf(p);
  for (const s of fighters.values()) {
    if (!isValid(s.e) || s.e.dimension.id !== p.dimension.id) continue;
    if (s.role !== "enemy" && s.role !== "ally") continue;
    const dist = V.dist(s.e.location, p.location);
    if (dist > 160 || dist < 4) continue;
    const pl = powerOfAny(s.e) * (s.boss ? 3 : 1);
    if (pl > bp) {
      bp = pl;
      best = { s, dist };
    }
  }
  if (!best) {
    r.senseLine = null;
    return null;
  }
  const e = best.s.e;
  const dx = e.location.x - p.location.x;
  const dz = e.location.z - p.location.z;
  const rel = (Math.atan2(-dx, dz) * 180) / Math.PI - p.getRotation().y;
  const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  const arrow = arrows[Math.round((((rel % 360) + 360) % 360) / 45) % 8];
  const ratio = powerOfAny(e) / Math.max(1, my);
  const feel = best.s.role === "ally" ? "§a仲間の気" : ratio > 3 ? "§c§lとてつもない気" : ratio > 1 ? "§c強い気" : "§e敵の気";
  r.senseLine = `§d[気の感知] ${feel} §f${arrow} ${Math.round(best.dist)}m`;
  return r.senseLine;
});

/* ===================================================================================== capsules */

function housesKey() {
  return "dbz:capsuleHouses";
}

function lookGround(p, dist = 4) {
  const v = p.getViewDirection();
  const at = V.add(p.location, V.mul({ x: v.x, y: 0, z: v.z }, dist));
  try {
    const top = p.dimension.getTopmostBlock({ x: at.x, z: at.z });
    if (top) at.y = top.location.y + 1;
  } catch {
    // ignore
  }
  return V.floor(at);
}

function pop(p, at) {
  particle(p.dimension, "dbz:pop_smoke", at, "white", 1.5);
  sound(p.dimension, "dbz.capsule", at, 1.5);
}

function capsuleHouse(p) {
  const list = worldGet(housesKey(), []);
  const near = list.find((h) => h.dim === p.dimension.id && V.dist(h, p.location) < 9);
  const dim = p.dimension;
  if (near) {
    fill(dim, near.x - 5, near.y, near.z - 5, near.x + 5, near.y + 6, near.z + 5, "minecraft:air");
    if (near.kind === "gravity") removeGravityRoom(near);
    worldSet(housesKey(), list.filter((h) => h !== near));
    pop(p, near);
    msg(p, "§7カプセルにしまった。");
    return true;
  }
  return false;
}

function placeHouse(p, kind) {
  if (capsuleHouse(p)) return;
  const at = lookGround(p, 7);
  const dim = p.dimension;
  pop(p, at);
  if (kind === "house") {
    dome(dim, at.x, at.y, at.z, 4.5, "minecraft:white_concrete", true, 1.0);
    fill(dim, at.x - 4, at.y - 1, at.z - 4, at.x + 4, at.y - 1, at.z + 4, "minecraft:oak_planks");
    fill(dim, at.x, at.y, at.z - 4, at.x, at.y + 1, at.z - 4, "minecraft:air");
    disc(dim, at.x, at.y + 2, at.z, 4.5, "minecraft:glass", 3.6);
    set(dim, at.x + 2, at.y, at.z + 2, "minecraft:crafting_table");
    set(dim, at.x - 2, at.y, at.z + 2, "minecraft:furnace");
    set(dim, at.x, at.y + 4, at.z, "minecraft:sea_lantern");
    set(dim, at.x + 2, at.y, at.z - 2, "minecraft:chest");
  } else {
    dome(dim, at.x, at.y, at.z, 5, "minecraft:white_concrete", true, 0.9);
    fill(dim, at.x - 4, at.y - 1, at.z - 4, at.x + 4, at.y - 1, at.z + 4, "minecraft:polished_deepslate");
    disc(dim, at.x, at.y + 3, at.z, 5, "minecraft:red_stained_glass", 4);
    fill(dim, at.x, at.y, at.z - 5, at.x, at.y + 1, at.z - 5, "minecraft:air");
    set(dim, at.x, at.y, at.z, "dbz:gravity_machine");
    addGravityRoom(at);
  }
  const list = worldGet(housesKey(), []);
  list.push({ x: at.x, y: at.y, z: at.z, dim: dim.id, kind });
  worldSet(housesKey(), list.slice(-12));
  msg(p, kind === "house" ? "§aボンッ！ 家が出てきた。（同じカプセルを近くで使うとしまえる）" : "§aボンッ！ 重力室が出てきた。中の装置を使って重力を変えよう。");
}

function vehicleCapsule(p, type, name) {
  const v = nearestVehicle(p, type, 8);
  if (v && p.isSneaking) {
    pop(p, v.location);
    try {
      v.remove();
    } catch {
      // ignore
    }
    msg(p, `§7${name}をカプセルにしまった。`);
    return;
  }
  if (v) {
    msg(p, `§7${name}はもう出ている。しまうときはしゃがみながら使う。`);
    return;
  }
  if (spawnVehicle(p, type)) msg(p, `§aボンッ！ ${name}が出てきた。右クリック（長押し）で乗る。`);
}

/* ===================================================================================== weapons & tools */

function nyoibo(p) {
  const dim = p.dimension;
  if (p.isSneaking) {
    // pole vault straight up
    try {
      p.applyKnockback({ x: 0, z: 0 }, 2.4);
    } catch {
      // ignore
    }
    staffVisual(p, { x: 0, y: -1, z: 0 }, 6);
    say(p, "あなた", "伸びろ、如意棒ーっ！");
    return;
  }
  const head = p.getHeadLocation();
  const dir = p.getViewDirection();
  let len = 22;
  let target;
  try {
    const hits = dim.getEntitiesFromRay(head, dir, { maxDistance: 22, excludeFamilies: ["dbz_fx", "inanimate"] }).filter((h) => h.entity.id !== p.id && isHostile(p, h.entity));
    if (hits.length) {
      target = hits[0].entity;
      len = hits[0].distance;
    }
    const b = dim.getBlockFromRay(head, dir, { maxDistance: len, includePassableBlocks: false });
    if (b && !target) len = V.dist(head, b.block.location);
  } catch {
    // ignore
  }
  staffVisual(p, dir, len);
  sound(dim, "dbz.dash", head, 1, 0.8);
  if (target) {
    hurt(target, 10 + getData(p).stats.str * 0.3, p, { knock: { dir, h: 1.6, v: 0.4 } });
    particle(dim, "dbz:impact", V.up(target.location, 1), "red", 1.5);
  }
  wearTool(p, 1);
}

function staffVisual(p, dir, len) {
  let ent;
  try {
    const origin = V.add(V.up(p.getHeadLocation(), -0.4), V.mul(dir, 0.6));
    ent = p.dimension.spawnEntity("dbz:beam", origin);
    const yaw = (Math.atan2(-dir.x, dir.z) * 180) / Math.PI;
    const pitch = (-Math.atan2(dir.y, Math.sqrt(dir.x * dir.x + dir.z * dir.z)) * 180) / Math.PI;
    ent.setProperty("dbz:color", KI_COLOR.red);
    ent.setProperty("dbz:width", 0.18);
    ent.setProperty("dbz:len", Math.min(80, len));
    ent.setProperty("dbz:yaw", yaw);
    ent.setProperty("dbz:pitch", pitch);
  } catch {
    return;
  }
  system.runTimeout(() => {
    try {
      ent.remove();
    } catch {
      // ignore
    }
  }, 8);
}

function wearTool(p, amount) {
  const it = held(p);
  if (!it) return;
  try {
    const dur = it.getComponent("minecraft:durability");
    if (!dur) return;
    dur.damage = Math.min(dur.maxDurability, dur.damage + amount);
    if (dur.damage >= dur.maxDurability) {
      setHeld(p, undefined);
      if (it.typeId === "dbz:z_sword") zSwordBroke(p);
      else sound(p.dimension, "random.break", p.location, 1);
    } else setHeld(p, it);
  } catch {
    // ignore
  }
}

function zSwordBroke(p) {
  const d = getData(p);
  sound(p.dimension, "dbz.clash", p.location, 2);
  title(p, "§cZソードが折れた！！", "§7…中から誰か出てきたぞ？", 60);
  if (d.quests.elderKaiFreed) return;
  d.quests.elderKaiFreed = true;
  markDirty(p);
  system.runTimeout(() => {
    const loc = V.add(p.location, V.mul(p.getViewDirection(), 2));
    particle(p.dimension, "dbz:explosion_smoke", loc, "white", 2);
    spawnFighter("elder_kai", p.dimension, loc, { role: "npc", home: loc, tag: "elder_kai" });
    say(p, "老界王神", "ふぃ〜、やっと出られたわい！ わしは15代前の界王神じゃ。礼に潜在能力を引き出してやってもいいぞい。");
  }, 30);
}

world.afterEvents.entityHitEntity.subscribe((ev) => {
  const p = /** @type {import("@minecraft/server").Player} */ (ev.damagingEntity);
  if (p?.typeId !== "minecraft:player") return;
  const it = held(p);
  if (it?.typeId === "dbz:z_sword") wearTool(p, 1);
  // pick training dummies back up
  const e = ev.hitEntity;
  if (e?.typeId === "dbz:fighter" && p.isSneaking && fighters.get(e.id)?.role === "dummy") {
    try {
      e.remove();
    } catch {
      return;
    }
    try {
      p.getComponent(EntityComponentTypes.Inventory).container.addItem(new ItemStack("dbz:training_dummy", 1));
    } catch {
      // ignore
    }
    msg(p, "§7サンドバッグを回収した。");
  }
});

/* ===================================================================================== block interactions */

onBlockInteract("dbz:gravity_machine", async (p) => {
  const d = getData(p);
  const maxG = Math.min(500, 10 + d.level * 5);
  const f = new ModalFormData().title("§c重力装置").slider(`重力（最大 ${maxG}倍）\n§7重いほど経験値が増えるが、レベル以上の重力は体を痛める`, 1, maxG, { valueStep: 1, defaultValue: Math.min(maxG, d.gravity ?? 10) });
  const r = await f.show(p);
  if (r.canceled || !r.formValues) return;
  d.gravity = Number(r.formValues[0]);
  markDirty(p);
  sound(p.dimension, "dbz.scouter_beep", p.location, 1, 0.6);
  title(p, `§c重力 ${d.gravity}倍`, "§7部屋の中にいる間だけ有効", 40);
});

onBlockInteract("dbz:zsword_stone", (p, block) => {
  const d = getData(p);
  if (d.level < 50) {
    msg(p, "§7Zソードはびくともしない…（レベル50以上の力が必要）");
    return;
  }
  try {
    block.setType("minecraft:mossy_cobblestone");
  } catch {
    // ignore
  }
  try {
    p.getComponent(EntityComponentTypes.Inventory).container.addItem(new ItemStack("dbz:z_sword", 1));
  } catch {
    // ignore
  }
  title(p, "§eZソードを引き抜いた！", "§7伝説の剣… でも何かが封印されているらしい", 50);
  sound(p.dimension, "dbz.aura_burst", p.location, 1.5);
});

/* ===================================================================================== item use routing */

export const useHandlers = {
  "dbz:dragon_radar": (p) => radarMenu(p),
  "dbz:capsule_house": (p) => placeHouse(p, "house"),
  "dbz:capsule_gravity": (p) => placeHouse(p, "gravity"),
  "dbz:capsule_aircar": (p) => vehicleCapsule(p, "dbz:aircar", "エアカー"),
  "dbz:capsule_spaceship": (p) => vehicleCapsule(p, "dbz:spaceship", "宇宙船"),
  "dbz:kintoun": (p) => summonKintoun(p),
  "dbz:nyoibo": (p) => nyoibo(p),
  "dbz:potara": (p) => emit("potaraUse", p),
  "dbz:training_dummy": (p) => {
    const at = lookGround(p, 3);
    const e = spawnFighter("training_dummy", p.dimension, { x: at.x + 0.5, y: at.y, z: at.z + 0.5 }, { role: "dummy", name: "修行用サンドバッグ" });
    if (e) {
      consumeHeld(p);
      msg(p, "§7サンドバッグを置いた。殴ると経験値が入る（しゃがみながら殴ると回収）。");
    }
  },
  "dbz:saiyan_tail": (p) => msg(p, "§7切れてしまったサイヤ人の尻尾だ…"),
};

export { held };
