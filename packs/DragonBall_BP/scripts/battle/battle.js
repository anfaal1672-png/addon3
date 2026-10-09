import { system, world, ItemStack, EntityComponentTypes, EntityDamageCause } from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";
import { CHARS, CHAR_INDEX } from "../gen/catalog.js";
import { fighters, setRole } from "../npc/fighters.js";
import { particle, sound, msg, title } from "../core/fx.js";
import { onCommand } from "../core/interact.js";
import { V, isValid } from "../core/util.js";
import {
  TEAMS, TEAM_IDS, SLOTS, TAG_BT, battleSettings, saveBattleSettings, teamOf, huntSlots, preySlots, isBattler,
  isBattleEnemy, battlersNear, findBattleTarget, allDimensions,
} from "./core.js";

/* Mob battle: team flags, duel / group wands, heal / kill / buff wands and a control menu.
 * Dragon Ball fighters fight with their own AI (engine chase + ki attacks); vanilla mobs are steered
 * from here with a simple chase-and-hit loop. */

export const TOOLS = ["dbz:bt_duel", "dbz:bt_group", ...TEAM_IDS.map((t) => `dbz:bt_team_${t}`), "dbz:bt_heal", "dbz:bt_kill",
  "dbz:bt_buff", "dbz:bt_menu"];

/* ------------------------------------------------------------------------------- names */

const MOB_NAMES = {
  zombie: "ゾンビ", husk: "ハスク", drowned: "ドラウンド", zombie_villager: "村人ゾンビ", skeleton: "スケルトン", stray: "ストレイ",
  bogged: "ボグド", wither_skeleton: "ウィザースケルトン", creeper: "クリーパー", spider: "クモ", cave_spider: "洞窟グモ",
  enderman: "エンダーマン", endermite: "エンダーマイト", silverfish: "シルバーフィッシュ", slime: "スライム", magma_cube: "マグマキューブ",
  witch: "ウィッチ", pillager: "ピリジャー", vindicator: "ヴィンディケーター", evoker: "エヴォーカー", ravager: "ラヴェジャー", vex: "ヴェックス",
  blaze: "ブレイズ", ghast: "ガスト", piglin: "ピグリン", piglin_brute: "ピグリンブルート", zombie_pigman: "ゾンビピグリン", hoglin: "ホグリン",
  zoglin: "ゾグリン", warden: "ウォーデン", guardian: "ガーディアン", elder_guardian: "エルダーガーディアン", phantom: "ファントム",
  breeze: "ブリーズ", creaking: "クリーキング", iron_golem: "アイアンゴーレム", snow_golem: "スノーゴーレム", wolf: "オオカミ",
  polar_bear: "シロクマ", panda: "パンダ", fox: "キツネ", cat: "ネコ", ocelot: "ヤマネコ", goat: "ヤギ", bee: "ミツバチ", llama: "ラマ",
  dolphin: "イルカ", axolotl: "ウーパールーパー", villager_v2: "村人", villager: "村人", wandering_trader: "行商人", pig: "ブタ",
  cow: "ウシ", sheep: "ヒツジ", chicken: "ニワトリ", horse: "ウマ", rabbit: "ウサギ", turtle: "カメ", camel: "ラクダ", armadillo: "アルマジロ",
  ender_dragon: "エンダードラゴン", wither: "ウィザー",
};

function baseName(e) {
  if (e.typeId === "dbz:fighter") {
    const cid = e.getDynamicProperty("dbz:cid");
    return typeof cid === "string" && CHAR_INDEX[cid] !== undefined ? CHARS[CHAR_INDEX[cid]].name : "戦士";
  }
  if (e.typeId === "minecraft:player") return /** @type {any} */ (e).name ?? "";
  const orig = e.getDynamicProperty("dbz:orig_name");
  if (typeof orig === "string" && orig) return orig;
  const short = e.typeId.replace(/^minecraft:/, "");
  return MOB_NAMES[short] ?? short;
}

function sideLabel(e) {
  const t = teamOf(e);
  if (t) return `${TEAMS[t].color}[${TEAMS[t].name}]`;
  const h = huntSlots(e);
  const pr = preySlots(e);
  if (h.length && pr.length) return "§d[一騎打ち]";
  if (h.length) return "§6[集団]";
  if (pr.length) return "§4[標的]";
  return "";
}

function hpText(e) {
  try {
    const h = e.getComponent("minecraft:health");
    if (!h) return "";
    return `\n§c❤ §f${Math.ceil(h.currentValue)}/${Math.ceil(h.effectiveMax)}`;
  } catch {
    return "";
  }
}

function label(e) {
  if (e.typeId === "minecraft:player") return;
  try {
    if (!isBattler(e)) {
      restoreName(e);
      return;
    }
    e.nameTag = `${sideLabel(e)}§r ${baseName(e)}${battleSettings().hp ? hpText(e) : ""}`;
  } catch {
    // ignore
  }
}

function rememberName(e) {
  if (e.typeId === "dbz:fighter" || e.typeId === "minecraft:player") return;
  try {
    if (e.getDynamicProperty("dbz:orig_name") === undefined) e.setDynamicProperty("dbz:orig_name", e.nameTag ?? "");
  } catch {
    // ignore
  }
}

function restoreName(e) {
  try {
    if (e.typeId === "dbz:fighter") {
      const s = fighters.get(e.id);
      const n = baseName(e);
      e.nameTag = s?.role === "ally" ? `§a${n}` : s?.boss ? `§c${n}` : n;
    } else if (e.typeId !== "minecraft:player") {
      const orig = e.getDynamicProperty("dbz:orig_name");
      e.nameTag = typeof orig === "string" ? orig : "";
      e.setDynamicProperty("dbz:orig_name", undefined);
    }
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------------------- membership */

/** Put a fighter's role / chase group in line with its battle tags. */
export function syncFighter(e) {
  if (e.typeId !== "dbz:fighter") return;
  const s = fighters.get(e.id);
  const role = s?.role ?? e.getDynamicProperty("dbz:role") ?? "npc";
  try {
    if (isBattler(e)) {
      if (role !== "battle") {
        e.setDynamicProperty("dbz:prev_role", role);
        setRole(e, "battle");
      }
      const h = huntSlots(e);
      const t = teamOf(e);
      if (battleSettings().paused) e.triggerEvent("dbz:bt_clear");
      else if (h.length) e.triggerEvent(`dbz:hunt_${h[0]}`);
      else if (t) e.triggerEvent(`dbz:bt_${t}`);
      else e.triggerEvent("dbz:bt_clear");
    } else if (role === "battle") {
      e.triggerEvent("dbz:bt_clear");
      const prev = e.getDynamicProperty("dbz:prev_role");
      setRole(e, typeof prev === "string" && prev !== "battle" ? prev : "npc");
      e.setDynamicProperty("dbz:prev_role", undefined);
    }
  } catch {
    // ignore
  }
}

function clearTags(e) {
  try {
    for (const t of e.getTags()) if (t === TAG_BT || t.startsWith("dbz_t_") || t.startsWith("dbz_hunt_") || t.startsWith("dbz_prey_")) e.removeTag(t);
  } catch {
    // ignore
  }
}

function refresh(e) {
  syncFighter(e);
  label(e);
  targets.delete(e.id);
}

export function joinTeam(e, team) {
  rememberName(e);
  clearTags(e);
  e.addTag(TAG_BT);
  e.addTag(`dbz_t_${team}`);
  refresh(e);
  particle(e.dimension, "dbz:sparkle", V.up(e.location, 1), team === "yellow" ? "gold" : team, 1);
}

export function leaveBattle(e) {
  clearTags(e);
  refresh(e);
}

function slotInUse(k) {
  for (const dim of allDimensions()) {
    try {
      if (dim.getEntities({ tags: [`dbz_hunt_${k}`] }).length || dim.getEntities({ tags: [`dbz_prey_${k}`] }).length) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

function freeSlot() {
  for (let k = 1; k <= SLOTS; k++) if (!slotInUse(k)) return k;
  return 0;
}

/** a and b fight each other and nobody else. */
export function startDuel(a, b) {
  const k = freeSlot();
  if (!k) return 0;
  for (const e of [a, b]) {
    rememberName(e);
    clearTags(e);
    e.addTag(`dbz_hunt_${k}`);
    e.addTag(`dbz_prey_${k}`);
    refresh(e);
  }
  activeSlots.add(k);
  return k;
}

/** Everyone in group gangs up on target. */
export function startHunt(group, target) {
  const k = freeSlot();
  if (!k) return 0;
  for (const e of group) {
    if (!isValid(e) || e.id === target.id) continue;
    rememberName(e);
    clearTags(e);
    e.addTag(`dbz_hunt_${k}`);
    refresh(e);
  }
  rememberName(target);
  clearTags(target);
  target.addTag(`dbz_prey_${k}`);
  refresh(target);
  activeSlots.add(k);
  return k;
}

/* ------------------------------------------------------------------------------- vanilla mob AI */

const MELEE = {
  zombie: 3, husk: 3, drowned: 3, zombie_villager: 3, skeleton: 2, stray: 2, bogged: 2, wither_skeleton: 8, spider: 2, cave_spider: 2,
  enderman: 7, endermite: 2, silverfish: 1, slime: 4, magma_cube: 6, witch: 3, pillager: 4, vindicator: 13, evoker: 6, ravager: 12,
  vex: 9, blaze: 6, ghast: 6, piglin: 5, piglin_brute: 13, zombie_pigman: 8, hoglin: 8, zoglin: 8, warden: 30, guardian: 6,
  elder_guardian: 8, phantom: 4, breeze: 6, creaking: 8, iron_golem: 15, snow_golem: 1, wolf: 4, polar_bear: 6, panda: 6, fox: 2,
  cat: 3, ocelot: 3, goat: 2, bee: 2, llama: 1, dolphin: 3, axolotl: 2, ender_dragon: 15, wither: 15,
};
const BIG = new Set(["iron_golem", "ravager", "warden", "hoglin", "zoglin", "polar_bear", "ender_dragon", "wither", "ghast", "elder_guardian"]);
const FLYERS = new Set(["phantom", "bee", "blaze", "ghast", "vex", "breeze", "ender_dragon", "wither", "allay", "parrot", "bat"]);

const targets = new Map(); // id -> { id, until }
const lastHit = new Map(); // id -> tick
const fuse = new Map(); // creeper id -> tick it started hissing

function puppetTarget(e, now) {
  const c = targets.get(e.id);
  if (c && now < c.until) {
    const t = world.getEntity(c.id);
    if (t && isValid(t)) return t;
  }
  const t = findBattleTarget(e);
  targets.set(e.id, { id: t?.id ?? "", until: now + 10 });
  return t;
}

function strike(e, target, dmg) {
  try {
    target.applyDamage(dmg, { cause: EntityDamageCause.entityAttack, damagingEntity: e });
  } catch {
    // ignore
  }
  const away = V.norm({ x: target.location.x - e.location.x, y: 0, z: target.location.z - e.location.z });
  try {
    if (target.typeId === "minecraft:player") target.applyKnockback({ x: away.x * 0.4, z: away.z * 0.4 }, 0.25);
    else target.applyImpulse({ x: away.x * 0.35, y: 0.2, z: away.z * 0.35 });
  } catch {
    // ignore
  }
}

function creeperBlow(e) {
  const at = V.up(e.location, 0.8);
  particle(e.dimension, "dbz:explosion_core", at, "white", 1.2);
  particle(e.dimension, "dbz:explosion_smoke", at, "white", 1.2);
  sound(e.dimension, "dbz.explosion", at, 1.2);
  for (const x of battlersNear(e.dimension, e.location, 4)) {
    if (!isBattleEnemy(e, x, true)) continue;
    try {
      x.applyDamage(18 * (1 - V.dist(x.location, e.location) / 5), { cause: EntityDamageCause.entityExplosion, damagingEntity: e });
    } catch {
      // ignore
    }
  }
  fuse.delete(e.id);
  try {
    e.kill();
  } catch {
    // ignore
  }
}

function puppetStep(e, now) {
  const target = puppetTarget(e, now);
  const kind = e.typeId.replace(/^minecraft:/, "");
  if (!target) {
    fuse.delete(e.id);
    return;
  }
  const d = V.sub(target.location, e.location);
  const flat = Math.hypot(d.x, d.z);
  const reach = (BIG.has(kind) ? 2.8 : 1.9) + (target.typeId === "dbz:fighter" ? 0.3 : 0);
  try {
    e.setRotation({ x: 0, y: (Math.atan2(-d.x, d.z) * 180) / Math.PI });
  } catch {
    // ignore
  }
  if (kind === "creeper") {
    if (flat < 3) {
      if (!fuse.has(e.id)) {
        fuse.set(e.id, now);
        sound(e.dimension, "random.fuse", e.location, 1);
      } else if (now - (fuse.get(e.id) ?? now) >= 30) return creeperBlow(e);
    } else fuse.delete(e.id);
  }
  if (flat > reach * 0.8) {
    const n = flat > 0 ? { x: d.x / flat, z: d.z / flat } : { x: 0, z: 0 };
    const sp = BIG.has(kind) ? 0.1 : 0.13;
    let y = 0;
    if (FLYERS.has(kind)) y = Math.max(-0.2, Math.min(0.2, d.y * 0.05));
    else if (e.isOnGround && d.y > 0.6) y = 0.42;
    try {
      e.applyImpulse({ x: n.x * sp, y, z: n.z * sp });
    } catch {
      // ignore
    }
  }
  if (kind !== "creeper" && flat <= reach && Math.abs(d.y) < 2.6 && now - (lastHit.get(e.id) ?? -99) >= 20) {
    lastHit.set(e.id, now);
    strike(e, target, MELEE[kind] ?? 2);
  }
}

/* ------------------------------------------------------------------------------- results */

const activeSlots = new Set();
let contested = false;

function announce(text, sub = "") {
  for (const p of world.getAllPlayers()) {
    title(p, text, sub, 60);
    msg(p, `${text}${sub ? " §7" + sub : ""}`);
  }
}

function allBattlers() {
  const out = [];
  for (const dim of allDimensions()) {
    try {
      out.push(...battlersNear(dim, { x: 0, y: 0, z: 0 }, 1e7));
    } catch {
      // ignore
    }
  }
  return out;
}

function checkResults(list) {
  if (battleSettings().paused) return;
  // team battle
  const teams = new Map();
  for (const e of list) {
    const t = teamOf(e);
    if (t) teams.set(t, (teams.get(t) ?? 0) + 1);
  }
  if (teams.size >= 2) contested = true;
  else if (contested) {
    contested = false;
    const [t] = [...teams.keys()];
    if (t) announce(`${TEAMS[t].color}${TEAMS[t].name}チームの勝利！`, `残り ${teams.get(t)} 体`);
    else announce("§7引き分け…", "全員倒れた");
  }
  // duels and hunts
  for (let k = 1; k <= SLOTS; k++) {
    const members = list.filter((e) => e.hasTag(`dbz_hunt_${k}`) || e.hasTag(`dbz_prey_${k}`));
    const duelists = members.filter((e) => e.hasTag(`dbz_hunt_${k}`) && e.hasTag(`dbz_prey_${k}`));
    const hunters = members.filter((e) => e.hasTag(`dbz_hunt_${k}`) && !e.hasTag(`dbz_prey_${k}`));
    const prey = members.filter((e) => e.hasTag(`dbz_prey_${k}`) && !e.hasTag(`dbz_hunt_${k}`));
    if (!members.length) {
      activeSlots.delete(k);
      continue;
    }
    if (duelists.length >= 2 || (hunters.length && prey.length)) {
      activeSlots.add(k);
      continue;
    }
    if (!activeSlots.has(k)) continue;
    activeSlots.delete(k);
    if (duelists.length === 1) announce(`§d${baseName(duelists[0])}の勝ち！`, "一騎打ち");
    else if (prey.length) announce(`§4${baseName(prey[0])}が集団を退けた！`, "集団戦");
    else if (hunters.length) announce("§6標的を倒した！", `集団戦（残り ${hunters.length} 体）`);
    for (const e of members) leaveBattle(e);
  }
}

world.afterEvents.entityDie.subscribe((ev) => {
  targets.delete(ev.deadEntity.id);
  lastHit.delete(ev.deadEntity.id);
  fuse.delete(ev.deadEntity.id);
});

system.runInterval(() => {
  const now = system.currentTick;
  if (now % 2 === 0 && !battleSettings().paused) {
    for (const e of cachedPuppets) {
      if (!isValid(e)) continue;
      try {
        puppetStep(e, now);
      } catch {
        // ignore
      }
    }
  }
  if (now % 10 === 0) {
    const list = allBattlers();
    cachedPuppets = list.filter((e) => e.typeId !== "dbz:fighter" && e.typeId !== "minecraft:player");
    if (battleSettings().hp) for (const e of list) label(e);
    if (now % 20 === 0) checkResults(list);
  }
}, 1);

/** @type {any[]} */
let cachedPuppets = [];

/* ------------------------------------------------------------------------------- tools */

const duelPick = new Map(); // player id -> entity id
const groupPick = new Map(); // player id -> Set of entity ids

function heldId(p) {
  try {
    return p.getComponent(EntityComponentTypes.Inventory).container.getItem(p.selectedSlotIndex)?.typeId ?? "";
  } catch {
    return "";
  }
}

function mark(e, color = "white") {
  particle(e.dimension, "dbz:sparkle", V.up(e.location, 1.2), color, 1);
}

function heal(e) {
  try {
    e.getComponent("minecraft:health")?.resetToMaxValue();
    e.extinguishFire?.();
  } catch {
    // ignore
  }
  mark(e, "green");
}

const BUFFS = [["strength", 1], ["speed", 1], ["resistance", 1], ["regeneration", 0]];

export function useTool(p, id, target) {
  const name = baseName(target);
  if (id.startsWith("dbz:bt_team_")) {
    if (p.isSneaking) {
      leaveBattle(target);
      msg(p, `§7${name}をバトルから外した。`);
    } else {
      const t = id.slice("dbz:bt_team_".length);
      joinTeam(target, t);
      msg(p, `${TEAMS[t].color}${name}が${TEAMS[t].name}チームに入った。`);
    }
    return;
  }
  if (id === "dbz:bt_duel") {
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
      msg(p, `§e1体目：${name}§7（もう1体を叩くと一騎打ち開始）`);
      return;
    }
    duelPick.delete(p.id);
    if (!startDuel(first, target)) {
      msg(p, "§c同時にできる一騎打ち・集団戦はここまで。どれかが終わるのを待とう。");
      return;
    }
    mark(first, "red");
    mark(target, "red");
    sound(p.dimension, "dbz.clash", target.location, 1);
    msg(p, `§d一騎打ち：${baseName(first)} vs ${name}`);
    return;
  }
  if (id === "dbz:bt_group") {
    const set = groupPick.get(p.id) ?? new Set();
    groupPick.set(p.id, set);
    if (p.isSneaking) {
      const group = [...set].map((x) => world.getEntity(x)).filter((x) => x && isValid(x) && x.id !== target.id);
      if (!group.length) {
        msg(p, "§7先に（しゃがまずに）仲間を叩いて選ぼう。");
        return;
      }
      if (!startHunt(group, target)) {
        msg(p, "§c同時にできる一騎打ち・集団戦はここまで。どれかが終わるのを待とう。");
        return;
      }
      set.clear();
      mark(target, "red");
      sound(p.dimension, "dbz.clash", target.location, 1);
      msg(p, `§6集団戦：${group.length}体 → ${name}`);
      return;
    }
    if (set.has(target.id)) set.delete(target.id);
    else set.add(target.id);
    mark(target, set.has(target.id) ? "gold" : "white");
    msg(p, `§6集団：${set.size}体選択中§7（しゃがんで標的を叩くと開始）`);
    return;
  }
  if (id === "dbz:bt_heal") {
    if (p.isSneaking) for (const e of battlersNear(p.dimension, p.location, 32)) heal(e);
    else heal(target);
    return;
  }
  if (id === "dbz:bt_kill") {
    if (target.typeId === "minecraft:player") return;
    particle(target.dimension, "dbz:pop_smoke", target.location, "white", 1);
    try {
      target.kill();
    } catch {
      // ignore
    }
    return;
  }
  if (id === "dbz:bt_buff") {
    for (const [eff, amp] of BUFFS) {
      try {
        if (p.isSneaking) target.removeEffect(eff);
        else target.addEffect(eff, 1200, { amplifier: amp, showParticles: true });
      } catch {
        // ignore
      }
    }
    mark(target, p.isSneaking ? "white" : "orange");
    msg(p, p.isSneaking ? `§7${name}の効果を消した。` : `§6${name}を強化した（60秒）。`);
  }
}

world.afterEvents.entityHitEntity.subscribe((ev) => {
  const p = ev.damagingEntity;
  const target = ev.hitEntity;
  if (p?.typeId !== "minecraft:player" || !target || !isValid(target)) return;
  const id = heldId(p);
  if (!id.startsWith("dbz:bt_")) return;
  try {
    useTool(p, id, target);
  } catch {
    // ignore
  }
});

world.afterEvents.itemUse.subscribe((ev) => {
  const p = ev.source;
  const id = ev.itemStack?.typeId ?? "";
  if (!id.startsWith("dbz:bt_")) return;
  if (id === "dbz:bt_menu") battleMenu(p);
  else if (id.startsWith("dbz:bt_team_")) {
    if (p.isSneaking) {
      leaveBattle(p);
      msg(p, "§7バトルから抜けた。");
    } else {
      const t = id.slice("dbz:bt_team_".length);
      joinTeam(p, t);
      msg(p, `${TEAMS[t].color}あなたは${TEAMS[t].name}チームに入った！（他のチームから狙われます）`);
    }
  } else if (id === "dbz:bt_duel") {
    duelPick.delete(p.id);
    msg(p, "§7一騎打ちの選択を解除した。");
  } else if (id === "dbz:bt_group") {
    groupPick.delete(p.id);
    msg(p, "§7集団の選択を解除した。");
  }
});

/* ------------------------------------------------------------------------------- menu */

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
  msg(p, "§aモブバトルの道具を受け取った。");
}

function statusText(p) {
  const list = battlersNear(p.dimension, p.location, 96);
  const lines = [];
  for (const t of TEAM_IDS) {
    const n = list.filter((e) => teamOf(e) === t).length;
    if (n) lines.push(`${TEAMS[t].color}${TEAMS[t].name}チーム：${n}体`);
  }
  const duels = new Set();
  for (const e of list) for (const k of huntSlots(e)) duels.add(k);
  for (const e of list) for (const k of preySlots(e)) duels.add(k);
  if (duels.size) lines.push(`§d一騎打ち・集団戦：${duels.size}件`);
  const st = battleSettings();
  lines.push("");
  lines.push(st.paused ? "§c一時停止中" : "§aバトル中");
  return lines.join("\n") || "§7参加者なし";
}

const HELP = [
  "§l§eモブバトルの遊び方§r",
  "§c赤§r・§9青§r・§a緑§r・§e黄§rの§fチームの旗§rでキャラやモブを叩くと、そのチームに入ります。違うチームどうしが自動で戦います。",
  "旗をしゃがみながら叩くとバトルから外れます。旗を空中で使うと、自分もチームに入れます。",
  "§d一騎打ちの杖§r：2体を順番に叩くと、その2体だけで戦います。",
  "§6集団戦の杖§r：仲間を叩いて選び、しゃがみながら標的を叩くと、全員で襲いかかります。",
  "§a回復の杖§r（しゃがむと周りの参加者全員）、§8撃破の杖§r、§6強化の杖§r（力・速さ・耐性・再生。しゃがむと解除）。",
  "ドラゴンボールのキャラは気功波や変身も使って戦います。普通のモブも殴り合います。",
  "クリエイティブで遊ぶのがおすすめです。",
].join("\n\n");

export async function battleMenu(p) {
  const st = battleSettings();
  const f = new ActionFormData().title("モブバトル").body(statusText(p));
  f.button(st.paused ? "§a再開する" : "§c一時停止する");
  f.button(`味方への攻撃：${st.ff ? "§aあり" : "§7なし"}`);
  f.button(`体力表示：${st.hp ? "§aあり" : "§7なし"}`);
  f.button("道具を受け取る");
  f.button("近くの参加者を全員解散");
  f.button("近くの参加者を全員倒す");
  f.button("遊び方");
  const r = await f.show(p);
  if (r.canceled) return;
  if (r.selection === 0) {
    st.paused = !st.paused;
    saveBattleSettings();
    for (const e of allBattlers()) syncFighter(e);
    msg(p, st.paused ? "§cバトルを一時停止した。" : "§aバトル再開！");
  } else if (r.selection === 1) {
    st.ff = !st.ff;
    saveBattleSettings();
  } else if (r.selection === 2) {
    st.hp = !st.hp;
    saveBattleSettings();
    for (const e of allBattlers()) label(e);
  } else if (r.selection === 3) giveTools(p);
  else if (r.selection === 4) {
    const list = battlersNear(p.dimension, p.location, 64);
    for (const e of list) leaveBattle(e);
    contested = false;
    msg(p, `§7${list.length}体をバトルから外した。`);
  } else if (r.selection === 5) {
    const ok = await new MessageFormData().title("全員倒す").body("近くのバトル参加者（プレイヤー以外）を全員倒します。よろしいですか？")
      .button1("倒す").button2("やめる").show(p);
    if (ok.canceled || ok.selection !== 0) return;
    for (const e of battlersNear(p.dimension, p.location, 64)) {
      if (e.typeId === "minecraft:player") continue;
      try {
        e.kill();
      } catch {
        // ignore
      }
    }
  } else if (r.selection === 6) {
    await new ActionFormData().title("モブバトルの遊び方").body(HELP).button("閉じる").show(p);
  }
}

onCommand("dbz:dbbattle", (p) => {
  giveTools(p);
  battleMenu(p);
});
