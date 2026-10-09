import { system, world } from "@minecraft/server";
import { fill, set, setPerm, disc, cylinder, dome, sphere, flatten, flattenRound, hollowBox, tree, palm, surfaceY, loaded } from "./build.js";
import { worldGet, worldSet, settings, getData, rt } from "../core/data.js";
import { V, isValid, rand, randInt } from "../core/util.js";
import { spawnFighter, fighters } from "../npc/fighters.js";
import { setProtector } from "../combat/projectiles.js";
import { emit } from "../core/bus.js";
import { msg, title, flash, particle } from "../core/fx.js";

/* ===================================================================================== layout */

/** id -> definition. Earth sites use an offset from world spawn; planets live far away in the sky. */
export const SITES = {
  goku_house: { name: "パオズ山（悟空の家）", earth: true, off: [200, 60], radius: 22, npcs: [["goku", 0, -7], ["gohan", 3, -7], ["goten", -3, -7]] },
  kame_house: { name: "カメハウス", earth: true, off: [-280, 240], radius: 18, npcs: [["roshi", 1, -6], ["krillin", -2, -6]] },
  capsule_corp: { name: "カプセルコーポレーション", earth: true, off: [320, -220], radius: 28, npcs: [["bulma", 0, -4], ["vegeta", 18, 6], ["trunks", -6, -16]] },
  karin_tower: { name: "カリン塔と神様の神殿", earth: true, off: [-160, -340], radius: 20, npcs: [] },
  budokai: { name: "天下一武道会の会場", earth: true, off: [440, 280], radius: 32, npcs: [["announcer", 0, -12], ["tien", 14, -14], ["yamcha", -14, -14]] },
  red_ribbon: { name: "レッドリボン軍の基地", earth: true, off: [-500, -60], radius: 26, npcs: [] },
  cell_games: { name: "セルゲームの会場", earth: true, off: [80, 520], radius: 30, npcs: [] },
  namek: { name: "ナメック星", planet: true, off: [40000, 40000], ground: true, radius: 40, region: 190, fog: "namek",
    npcs: [["namekian", 6, 0], ["namekian", -8, 4], ["namekian", 2, 10]] },
  kai: { name: "界王星", planet: true, off: [30000, -30000], y: 220, radius: 20, region: 40, fog: "kai", gravity: 10,
    npcs: [["kaio", 0, -6], ["bubbles", 6, 3], ["gregory", -5, 5]] },
  beerus: { name: "破壊神ビルスの星", planet: true, off: [-40000, 40000], y: 190, radius: 26, region: 50, fog: "beerus",
    npcs: [["beerus", 0, -8], ["whis", 3, -8]] },
  top: { name: "力の大会の会場", planet: true, off: [-30000, -40000], y: 200, radius: 32, region: 60, fog: "top", npcs: [] },
  htc: { name: "精神と時の部屋", planet: true, off: [50000, 0], y: 120, radius: 44, region: 46, fog: "htc", npcs: [] },
};

let layout = null; // id -> {x,y,z,built}

function spawnXZ() {
  try {
    const s = world.getDefaultSpawnLocation();
    return { x: Math.floor(s.x), z: Math.floor(s.z) };
  } catch {
    return { x: 0, z: 0 };
  }
}

export function getLayout() {
  if (layout) return layout;
  layout = worldGet("dbz:sites", null);
  if (!layout) {
    const s = spawnXZ();
    layout = {};
    for (const [id, def] of Object.entries(SITES)) {
      layout[id] = { x: s.x + def.off[0], y: def.y ?? null, z: s.z + def.off[1], built: false };
    }
    worldSet("dbz:sites", layout);
  }
  return layout;
}

function saveLayout() {
  worldSet("dbz:sites", layout);
}

export function sitePos(id) {
  const L = getLayout()[id];
  if (!L) return null;
  return { x: L.x + 0.5, y: (L.y ?? 80) + 0.2, z: L.z + 0.5 };
}

export function siteBuilt(id) {
  return !!getLayout()[id]?.built;
}

/** Which site region contains a location (overworld only). */
export function siteAt(loc, extra = 0) {
  const L = getLayout();
  for (const [id, def] of Object.entries(SITES)) {
    const p = L[id];
    if (!p) continue;
    const r = (def.region ?? def.radius) + extra;
    if (Math.abs(loc.x - p.x) > r || Math.abs(loc.z - p.z) > r) continue;
    if (def.planet && !def.ground && p.y !== null && Math.abs(loc.y - p.y) > r + 40) continue;
    return id;
  }
  return null;
}

setProtector((dim, loc, r) => {
  if (dim.id !== "minecraft:overworld") return false;
  const L = getLayout();
  for (const [id, def] of Object.entries(SITES)) {
    const p = L[id];
    if (!p || !p.built || id === "namek") continue;
    if (Math.abs(loc.x - p.x) < def.radius + r && Math.abs(loc.z - p.z) < def.radius + r) {
      if (p.y === null || Math.abs(loc.y - p.y) < 60 + r || id === "karin_tower") return true;
    }
  }
  return false;
});

/* ===================================================================================== builders */

const W = "minecraft:white_concrete";
const Q = "minecraft:smooth_quartz";

function* buildKameHouse(dim, x, y, z) {
  flattenRound(dim, x, y, z, 18, "minecraft:sand", "minecraft:sand", 20, 5);
  yield;
  for (let d = 1; d <= 3; d++) disc(dim, x, y - d, z, 18, "minecraft:water", 9.5);
  disc(dim, x, y - 4, z, 18, "minecraft:sand", 9.5);
  yield;
  hollowBox(dim, x - 3, y, z - 3, x + 3, y + 4, z + 3, "minecraft:pink_concrete", "minecraft:oak_planks");
  fill(dim, x - 4, y + 5, z - 4, x + 4, y + 5, z + 4, "minecraft:red_concrete");
  fill(dim, x - 3, y + 6, z - 3, x + 3, y + 6, z + 3, "minecraft:red_concrete");
  fill(dim, x - 2, y + 7, z - 2, x + 2, y + 7, z + 2, "minecraft:red_concrete");
  fill(dim, x - 1, y + 1, z - 3, x, y + 2, z - 3, "minecraft:air");
  for (const [a, b] of [[-3, 0], [3, 0], [-2, -3], [2, -3], [0, 3]]) set(dim, x + a, y + 2, z + b, "minecraft:glass_pane");
  // KAME HOUSE lettering band
  fill(dim, x - 3, y + 4, z - 4, x + 3, y + 4, z - 4, "minecraft:red_concrete");
  yield;
  palm(dim, x + 6, y, z + 4, 8);
  palm(dim, x - 6, y, z + 5, 7);
  // beach umbrella and chair
  fill(dim, x + 5, y, z - 5, x + 5, y + 2, z - 5, "minecraft:oak_fence");
  disc(dim, x + 5, y + 3, z - 5, 2, "minecraft:red_wool");
  set(dim, x + 5, y + 3, z - 5, "minecraft:white_wool");
  set(dim, x + 4, y, z - 6, "minecraft:white_wool");
}

function* buildGokuHouse(dim, x, y, z) {
  flattenRound(dim, x, y, z, 22, "minecraft:grass_block", "minecraft:dirt", 18, 4);
  yield;
  cylinder(dim, x, z, 4, y, y + 3, W, true);
  fill(dim, x - 4, y - 1, z - 4, x + 4, y - 1, z + 4, "minecraft:spruce_planks");
  dome(dim, x, y + 4, z, 5, "minecraft:red_terracotta", false, 0.6);
  fill(dim, x, y, z - 4, x, y + 1, z - 4, "minecraft:air");
  set(dim, x - 4, y + 2, z, "minecraft:glass_pane");
  set(dim, x + 4, y + 2, z, "minecraft:glass_pane");
  yield;
  tree(dim, x + 9, y, z + 6, "minecraft:oak_log", "minecraft:oak_leaves", 6, 3);
  tree(dim, x - 10, y, z - 3, "minecraft:oak_log", "minecraft:oak_leaves", 5, 2.5);
  // Paozu peaks
  for (const [a, b, h] of [[16, 12, 20], [-15, 14, 26], [18, -13, 16], [-17, -16, 22], [4, 19, 14]]) {
    cylinder(dim, x + a, z + b, 2.4, y - 2, y + h, "minecraft:andesite");
    cylinder(dim, x + a, z + b, 1.6, y + h + 1, y + h + 3, "minecraft:grass_block");
    yield;
  }
  // grandpa Gohan's Dragon Ball shrine
  fill(dim, x + 5, y, z - 6, x + 6, y, z - 5, "minecraft:polished_andesite");
}

function* buildCapsuleCorp(dim, x, y, z) {
  flattenRound(dim, x, y, z, 28, "minecraft:grass_block", "minecraft:dirt", 26, 4);
  yield;
  fill(dim, x - 13, y - 1, z - 13, x + 13, y - 1, z + 13, "minecraft:polished_diorite");
  dome(dim, x, y, z, 13, W, true, 0.85);
  yield;
  // yellow band
  for (const dy of [4, 5]) {
    const rr = 13 * Math.sqrt(1 - (dy / (13 * 0.85)) ** 2);
    disc(dim, x, y + dy, z, rr, "minecraft:yellow_concrete", rr - 1.3);
  }
  // entrance
  fill(dim, x - 2, y, z - 14, x + 2, y + 3, z - 9, "minecraft:air");
  fill(dim, x - 3, y + 4, z - 14, x + 3, y + 4, z - 12, W);
  // CC logo panel
  const px = x;
  const pz = z - 15;
  fill(dim, px - 4, y + 5, pz, px + 4, y + 9, pz, W);
  const C = [[0, 1], [0, 2], [0, 3], [1, 0], [2, 0], [1, 4], [2, 4]];
  for (const off of [-3, 1]) for (const [a, b] of C) set(dim, px + off + a, y + 5 + b, pz - 0, "minecraft:blue_concrete");
  yield;
  // interior
  for (const [a, b] of [[-6, 4], [6, 4], [0, 8]]) {
    fill(dim, x + a - 1, y, z + b - 1, x + a + 1, y, z + b + 1, "minecraft:iron_block");
    set(dim, x + a, y + 1, z + b, "minecraft:glass");
  }
  set(dim, x, y, z, "minecraft:sea_lantern");
  // gravity room
  const gx = x + 18;
  const gz = z + 6;
  dome(dim, gx, y, gz, 6, W, true, 0.9);
  fill(dim, gx - 5, y - 1, gz - 5, gx + 5, y - 1, gz + 5, "minecraft:polished_deepslate");
  disc(dim, gx, y + 3, gz, 6, "minecraft:red_stained_glass", 5);
  fill(dim, gx - 1, y, gz - 6, gx + 1, y + 2, gz - 6, "minecraft:air");
  set(dim, gx, y, gz, "dbz:gravity_machine");
  yield;
  tree(dim, x - 20, y, z + 10, "minecraft:birch_log", "minecraft:birch_leaves", 6, 2.5);
  tree(dim, x + 8, y, z - 22, "minecraft:birch_log", "minecraft:birch_leaves", 5, 2.5);
}

function* buildKarin(dim, x, y, z) {
  flattenRound(dim, x, y, z, 12, "minecraft:grass_block", "minecraft:dirt", 12, 3);
  yield;
  const top = Math.min(y + 150, 255);
  for (let yy = y; yy <= top; yy += 30) {
    cylinder(dim, x, z, 3, yy, Math.min(top, yy + 29), "minecraft:white_terracotta");
    fill(dim, x - 3, yy + 10, z - 3, x + 3, yy + 10, z + 3, "minecraft:light_blue_terracotta");
    yield;
  }
  cylinder(dim, x, z, 3, y, top, "minecraft:white_terracotta");
  for (let yy = y; yy <= top; yy++) {
    setPerm(dim, x, yy, z - 4, "minecraft:ladder", { facing_direction: 2 });
    if (yy % 25 === 0) yield;
  }
  // Karin's sanctuary
  disc(dim, x, top + 1, z, 7, Q);
  disc(dim, x, top + 2, z, 7, "minecraft:oak_fence", 6);
  dome(dim, x, top + 2, z, 5, "minecraft:white_terracotta", true, 0.8);
  fill(dim, x - 1, top + 2, z - 5, x + 1, top + 4, z - 4, "minecraft:air");
  set(dim, x, top + 1, z - 4, Q);
  set(dim, x, top + 2, z - 4, "minecraft:air");
  set(dim, x, top + 3, z - 4, "minecraft:air");
  yield;
  // The Lookout
  const ly = Math.min(top + 34, 300);
  disc(dim, x, ly, z, 18, "dbz:lookout_tile");
  for (let i = 1; i <= 9; i++) {
    disc(dim, x, ly - i, z, 18 * (1 - i / 10), Q);
    if (i % 3 === 0) yield;
  }
  palm(dim, x + 12, ly + 1, z + 8, 6);
  palm(dim, x - 12, ly + 1, z + 8, 6);
  palm(dim, x - 11, ly + 1, z - 9, 6);
  // temple
  hollowBox(dim, x - 4, ly + 1, z - 4, x + 4, ly + 6, z + 4, "minecraft:quartz_block", Q);
  dome(dim, x, ly + 7, z, 4, "minecraft:quartz_block", false, 0.8);
  fill(dim, x - 1, ly + 1, z - 4, x + 1, ly + 3, z - 4, "minecraft:air");
  for (const [a, b] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) fill(dim, x + a, ly + 1, z + b, x + a, ly + 6, z + b, "minecraft:quartz_pillar");
  // Hyperbolic Time Chamber entrance
  hollowBox(dim, x + 10, ly + 1, z - 3, x + 15, ly + 6, z + 3, "minecraft:quartz_block", Q, "minecraft:quartz_block");
  fill(dim, x + 10, ly + 1, z - 1, x + 10, ly + 3, z + 1, "minecraft:air");
  fill(dim, x + 12, ly + 1, z - 1, x + 14, ly + 1, z + 1, "dbz:htc_floor");
  layout.karin_tower.top = top;
  layout.karin_tower.lookout = ly;
  saveLayout();
}

function* buildBudokai(dim, x, y, z) {
  flatten(dim, x, y, z, 32, "minecraft:grass_block", "minecraft:dirt", 22, 4);
  yield;
  fill(dim, x - 10, y - 1, z - 10, x + 10, y, z + 10, "minecraft:stone_bricks");
  fill(dim, x - 10, y, z - 10, x + 10, y, z - 10, "minecraft:chiseled_stone_bricks");
  fill(dim, x - 10, y, z + 10, x + 10, y, z + 10, "minecraft:chiseled_stone_bricks");
  fill(dim, x - 10, y, z - 10, x - 10, y, z + 10, "minecraft:chiseled_stone_bricks");
  fill(dim, x + 10, y, z - 10, x + 10, y, z + 10, "minecraft:chiseled_stone_bricks");
  yield;
  for (let t = 0; t < 3; t++) {
    const r1 = 16 + t * 2;
    fill(dim, x - r1 - 1, y + t, z + r1, x + r1 + 1, y + t, z + r1 + 1, "minecraft:smooth_stone");
    fill(dim, x + r1, y + t, z - r1, x + r1 + 1, y + t, z + r1 + 1, "minecraft:smooth_stone");
    fill(dim, x - r1 - 1, y + t, z - r1, x - r1, y + t, z + r1 + 1, "minecraft:smooth_stone");
    yield;
  }
  // gate (temple style)
  const gz = z - 24;
  for (const a of [-5, 5]) fill(dim, x + a, y, gz, x + a, y + 7, gz, "minecraft:red_concrete");
  fill(dim, x - 7, y + 8, gz - 1, x + 7, y + 8, gz + 1, "minecraft:orange_terracotta");
  fill(dim, x - 6, y + 9, gz - 1, x + 6, y + 9, gz + 1, "minecraft:orange_terracotta");
  fill(dim, x - 4, y + 10, gz, x + 4, y + 10, gz, "minecraft:red_concrete");
  layout.budokai.ring = { x, y, z, r: 10 };
  saveLayout();
}

function* buildRedRibbon(dim, x, y, z) {
  flatten(dim, x, y, z, 26, "minecraft:gravel", "minecraft:stone", 22, 4);
  yield;
  hollowBox(dim, x - 13, y, z - 8, x + 13, y + 9, z + 8, "minecraft:light_gray_concrete", "minecraft:polished_andesite", "minecraft:gray_concrete");
  fill(dim, x - 13, y + 6, z - 8, x + 13, y + 7, z - 8, "minecraft:red_concrete");
  fill(dim, x - 2, y, z - 8, x + 2, y + 4, z - 8, "minecraft:air");
  yield;
  for (const [a, b] of [[-16, -11], [16, -11], [-16, 11], [16, 11]]) {
    fill(dim, x + a, y, z + b, x + a, y + 14, z + b, "minecraft:iron_bars");
    fill(dim, x + a - 1, y + 15, z + b - 1, x + a + 1, y + 16, z + b + 1, "minecraft:gray_concrete");
    set(dim, x + a, y + 17, z + b, "minecraft:redstone_lamp");
  }
  // big ribbon emblem
  fill(dim, x - 3, y + 10, z - 2, x + 3, y + 14, z - 2, "minecraft:red_concrete");
  fill(dim, x - 1, y + 11, z - 3, x + 1, y + 13, z - 3, "minecraft:white_concrete");
  fill(dim, x + 2, y, z + 12, x + 8, y + 3, z + 18, "minecraft:gray_concrete");
}

function* buildCellGames(dim, x, y, z) {
  flatten(dim, x, y, z, 30, "minecraft:coarse_dirt", "minecraft:dirt", 24, 4);
  yield;
  fill(dim, x - 12, y - 1, z - 12, x + 12, y, z + 12, Q);
  for (let i = -12; i <= 12; i += 3) {
    fill(dim, x + i, y, z - 12, x + i, y, z + 12, "minecraft:quartz_bricks");
  }
  for (const [a, b] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) fill(dim, x + a, y + 1, z + b, x + a, y + 6, z + b, "minecraft:quartz_pillar");
  for (let i = 0; i < 6; i++) {
    const a = rand(-28, 28);
    const b = rand(-28, 28);
    if (Math.abs(a) < 15 && Math.abs(b) < 15) continue;
    cylinder(dim, Math.floor(x + a), Math.floor(z + b), rand(1.5, 3), y, y + randInt(3, 9), "minecraft:stone");
  }
}

function ajisa(dim, x, y, z) {
  const h = randInt(6, 10);
  fill(dim, x, y, z, x, y + h, z, "minecraft:stripped_jungle_log");
  sphere(dim, x, y + h + 1, z, 2.2, "dbz:ajisa_leaves");
}

function* buildNamek(dim, x, y, z) {
  flattenRound(dim, x, y, z, 26, "dbz:namek_grass", "minecraft:dirt", 26, 3);
  yield;
  for (const [a, b] of [[6, 0], [-8, 4], [2, 10], [-3, -9]]) {
    dome(dim, x + a, y, z + b, 3.5, W, true, 1.1);
    fill(dim, x + a, y, z + b - 3, x + a, y + 1, z + b - 3, "minecraft:air");
    set(dim, x + a + 3, y + 2, z + b, "minecraft:glass");
    set(dim, x + a - 3, y + 2, z + b, "minecraft:glass");
    yield;
  }
  // Grand Elder Guru's house on a rock spire
  const gx = x + 18;
  const gz = z - 14;
  cylinder(dim, gx, gz, 4, y - 2, y + 26, "minecraft:stone");
  cylinder(dim, gx, gz, 5, y + 27, y + 27, "dbz:namek_grass");
  dome(dim, gx, y + 28, gz, 4, W, true, 1.1);
  fill(dim, gx, y + 28, gz - 4, gx, y + 29, gz - 4, "minecraft:air");
  layout.namek.guru = { x: gx + 0.5, y: y + 28, z: gz + 0.5 };
  yield;
  // Frieza's spaceship
  const fx = x - 30;
  const fz = z + 22;
  for (const [a, b] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) fill(dim, fx + a, y, fz + b, fx + a, y + 3, fz + b, "minecraft:iron_bars");
  disc(dim, fx, y + 4, fz, 11, "minecraft:light_gray_concrete");
  disc(dim, fx, y + 5, fz, 10, "minecraft:white_concrete");
  dome(dim, fx, y + 6, fz, 7, W, true, 0.5);
  disc(dim, fx, y + 6, fz, 8, "minecraft:light_blue_stained_glass", 7);
  layout.namek.ship = { x: fx + 0.5, y: y + 7, z: fz + 0.5 };
  yield;
  for (let i = 0; i < 14; i++) {
    const a = Math.floor(rand(-26, 26));
    const b = Math.floor(rand(-26, 26));
    if (Math.abs(a) < 12 && Math.abs(b) < 12) continue;
    ajisa(dim, x + a, y, z + b);
  }
  saveLayout();
}

function* buildKai(dim, x, y, z) {
  sphere(dim, x, y, z, 14, "minecraft:dirt");
  yield;
  dome(dim, x, y, z, 14, "dbz:kai_grass", false, 1.0);
  yield;
  const top = y + 14;
  fill(dim, x - 9, top, z - 9, x + 9, top + 12, z + 9, "minecraft:air");
  disc(dim, x, top - 1, z, 9, "dbz:kai_grass");
  // King Kai's house
  dome(dim, x + 3, top, z + 4, 3.5, W, true, 1.1);
  fill(dim, x + 3, top, z + 1, x + 3, top + 1, z + 1, "minecraft:air");
  set(dim, x + 3, top + 4, z + 4, "minecraft:red_concrete");
  tree(dim, x - 5, top, z + 3, "minecraft:oak_log", "minecraft:oak_leaves", 4, 2);
  // King Kai's car
  fill(dim, x - 3, top, z - 4, x - 1, top, z - 2, "minecraft:red_concrete");
  set(dim, x - 2, top + 1, z - 3, "minecraft:red_concrete");
  // Z Sword
  set(dim, x + 6, top, z - 5, "dbz:zsword_stone");
  layout.kai.top = top;
  layout.kai.zsword = { x: x + 6, y: top, z: z - 5 };
  saveLayout();
}

function* buildBeerus(dim, x, y, z) {
  disc(dim, x, y, z, 24, "minecraft:grass_block");
  for (let i = 1; i <= 12; i++) {
    disc(dim, x, y - i, z, 24 * (1 - i / 13), i < 3 ? "minecraft:dirt" : "minecraft:purpur_block");
    if (i % 3 === 0) yield;
  }
  fill(dim, x - 20, y + 1, z - 20, x + 20, y + 30, z + 20, "minecraft:air");
  yield;
  // palace: stepped pyramid with a tall tower
  for (let i = 0; i < 6; i++) {
    const r = 9 - i;
    fill(dim, x - r, y + 1 + i * 2, z + 6 - r, x + r, y + 2 + i * 2, z + 6 + r, i % 2 ? "minecraft:sandstone" : "minecraft:smooth_sandstone");
    fill(dim, x - r + 1, y + 1 + i * 2, z + 6 - r + 1, x + r - 1, y + 2 + i * 2, z + 6 + r - 1, "minecraft:air");
  }
  cylinder(dim, x, z + 6, 2, y + 13, y + 24, "minecraft:purpur_pillar");
  dome(dim, x, y + 25, z + 6, 3, "minecraft:purpur_block", false, 1.2);
  fill(dim, x - 1, y + 1, z - 3, x + 1, y + 3, z - 3, "minecraft:air");
  disc(dim, x - 12, y, z - 8, 4, "minecraft:water");
  tree(dim, x + 14, y + 1, z - 10, "minecraft:dark_oak_log", "minecraft:azalea_leaves", 7, 3);
  tree(dim, x - 15, y + 1, z + 9, "minecraft:dark_oak_log", "minecraft:azalea_leaves", 6, 3);
}

function* buildTop(dim, x, y, z) {
  disc(dim, x, y, z, 30, Q);
  disc(dim, x, y, z, 30, "minecraft:quartz_bricks", 28);
  for (let i = 1; i <= 10; i++) {
    disc(dim, x, y - i, z, 30 * (1 - i / 11), "minecraft:polished_blackstone");
    if (i % 3 === 0) yield;
  }
  fill(dim, x - 29, y + 1, z - 29, x + 29, y + 25, z + 29, "minecraft:air");
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = Math.floor(x + Math.cos(a) * 26);
    const pz = Math.floor(z + Math.sin(a) * 26);
    fill(dim, px, y + 1, pz, px, y + 12, pz, "minecraft:quartz_pillar");
    set(dim, px, y + 13, pz, "minecraft:sea_lantern");
  }
}

function* buildHTC(dim, x, y, z) {
  fill(dim, x - 44, y, z - 44, x + 44, y, z + 44, "dbz:htc_floor");
  yield;
  fill(dim, x - 44, y + 1, z - 44, x + 44, y + 24, z + 44, "minecraft:air");
  yield;
  for (const [a1, b1, a2, b2] of [[-45, -45, 45, -45], [-45, 45, 45, 45], [-45, -45, -45, 45], [45, -45, 45, 45]]) {
    fill(dim, x + a1, y + 1, z + b1, x + a2, y + 26, z + b2, "minecraft:barrier");
    yield;
  }
  hollowBox(dim, x - 4, y, z - 4, x + 4, y + 6, z + 4, "minecraft:quartz_block", Q, "minecraft:quartz_block");
  fill(dim, x - 1, y + 1, z - 4, x + 1, y + 3, z - 4, "minecraft:air");
  fill(dim, x - 1, y, z - 1, x + 1, y, z + 1, "minecraft:emerald_block");
  set(dim, x + 3, y + 1, z + 3, "minecraft:white_wool");
  fill(dim, x - 3, y + 1, z + 3, x - 2, y + 1, z + 3, "minecraft:barrel");
}

const BUILDERS = {
  kame_house: buildKameHouse, goku_house: buildGokuHouse, capsule_corp: buildCapsuleCorp, karin_tower: buildKarin,
  budokai: buildBudokai, red_ribbon: buildRedRibbon, cell_games: buildCellGames, namek: buildNamek, kai: buildKai,
  beerus: buildBeerus, top: buildTop, htc: buildHTC,
};

/* ===================================================================================== lazy building */

const building = new Set();

function npcY(dim, id, x, z, baseY) {
  if (id === "kai") return layout.kai.top ?? baseY;
  if (id === "beerus" || id === "top" || id === "htc") return baseY + 1;
  return baseY;
}

function spawnSiteNpcs(id, dim) {
  const def = SITES[id];
  const p = layout[id];
  for (const [cid, a, b] of def.npcs) {
    const loc = { x: p.x + a + 0.5, y: npcY(dim, id, p.x + a, p.z + b, p.y) + 0.1, z: p.z + b + 0.5 };
    spawnFighter(cid, dim, loc, { role: cid === "bubbles" || cid === "gregory" ? "passive" : "npc", home: loc, tag: `site_${id}` });
  }
  if (id === "karin_tower" && layout.karin_tower.top) {
    const t = layout.karin_tower.top + 2;
    spawnFighter("karin", dim, { x: p.x + 2.5, y: t, z: p.z + 0.5 }, { role: "npc", home: { x: p.x + 2.5, y: t, z: p.z + 0.5 }, tag: "site_karin_tower" });
    spawnFighter("yajirobe", dim, { x: p.x - 2.5, y: t, z: p.z + 0.5 }, { role: "npc", home: { x: p.x - 2.5, y: t, z: p.z + 0.5 }, tag: "site_karin_tower" });
    const ly = layout.karin_tower.lookout + 1;
    spawnFighter("piccolo", dim, { x: p.x + 0.5, y: ly, z: p.z - 7.5 }, { role: "npc", home: { x: p.x + 0.5, y: ly, z: p.z - 7.5 }, tag: "site_karin_tower" });
  }
  if (id === "namek" && layout.namek.guru) {
    spawnFighter("guru", dim, layout.namek.guru, { role: "npc", home: layout.namek.guru, tag: "site_namek" });
  }
}

export function buildSite(id, dim, onDone) {
  if (building.has(id) || layout[id].built) return;
  const def = SITES[id];
  const p = layout[id];
  if (p.y === null) {
    p.y = def.earth && id === "kame_house" ? Math.max(62, Math.min(70, surfaceY(dim, p.x, p.z, 63))) : surfaceY(dim, p.x, p.z, 70);
    if (id === "kame_house") p.y = 63;
  }
  building.add(id);
  const gen = BUILDERS[id](dim, p.x, p.y, p.z);
  system.runJob((function* () {
    for (const _ of gen) yield;
    p.built = true;
    building.delete(id);
    saveLayout();
    system.runTimeout(() => {
      spawnSiteNpcs(id, dim);
      emit("siteBuilt", id);
      if (onDone) onDone();
    }, 20);
  })());
}

function readyToBuild(dim, id) {
  const p = layout[id];
  const def = SITES[id];
  const r = Math.min(def.radius, 24);
  const y = p.y ?? 64;
  return loaded(dim, p.x, y, p.z) && loaded(dim, p.x + r, y, p.z + r) && loaded(dim, p.x - r, y, p.z - r) &&
    loaded(dim, p.x + r, y, p.z - r) && loaded(dim, p.x - r, y, p.z + r);
}

system.runInterval(() => {
  if (!settings().structures) return;
  getLayout();
  const ow = world.getDimension("minecraft:overworld");
  for (const pl of world.getAllPlayers()) {
    if (pl.dimension.id !== "minecraft:overworld") continue;
    for (const id of Object.keys(SITES)) {
      const p = layout[id];
      if (p.built || building.has(id)) continue;
      const near = Math.abs(pl.location.x - p.x) < 56 && Math.abs(pl.location.z - p.z) < 56;
      if (!near) continue;
      if (readyToBuild(ow, id)) {
        msg(pl, `§7[${SITES[id].name}] が見えてきた…`);
        buildSite(id, ow);
      }
    }
  }
}, 40);

/* ===================================================================================== npc upkeep */

system.runInterval(() => {
  if (!layout) return;
  const ow = world.getDimension("minecraft:overworld");
  const recruited = new Set();
  for (const pl of world.getAllPlayers()) {
    const d = getData(pl);
    for (const [cid, a] of Object.entries(d.allies)) if (/** @type {any} */ (a).recruited) recruited.add(cid);
  }
  for (const [id, def] of Object.entries(SITES)) {
    const p = layout[id];
    if (!p.built) continue;
    const players = ow.getPlayers({ location: { x: p.x, y: p.y ?? 64, z: p.z }, maxDistance: 48 });
    if (!players.length) continue;
    const present = new Set();
    for (const s of fighters.values()) {
      if (isValid(s.e) && s.e.hasTag(`site_${id}`)) present.add(s.cid.replace(/_(ssj|ssj2|ssj3|god|blue|ui|ue)$/, ""));
    }
    for (const [cid, a, b] of def.npcs) {
      if (present.has(cid) || recruited.has(cid)) continue;
      if (cid === "namekian" && present.has("namekian")) continue;
      const loc = { x: p.x + a + 0.5, y: npcY(ow, id, p.x + a, p.z + b, p.y) + 0.1, z: p.z + b + 0.5 };
      if (!loaded(ow, loc.x, loc.y, loc.z)) continue;
      spawnFighter(cid, ow, loc, { role: cid === "bubbles" || cid === "gregory" ? "passive" : "npc", home: loc, tag: `site_${id}` });
    }
  }
}, 300);

/* ===================================================================================== travel */

export function travelTo(p, id, after) {
  const def = SITES[id];
  const pos = layout[id];
  const ow = world.getDimension("minecraft:overworld");
  flash(p, { red: 1, green: 1, blue: 1 }, 0.6);
  title(p, `§e${def.name}`, "§7へ移動中…", 50);
  const hoverY = (pos.y ?? 150) + 40;
  try {
    p.teleport({ x: pos.x + 0.5, y: Math.min(310, hoverY), z: pos.z + 0.5 }, { dimension: ow });
    p.addEffect("slow_falling", 400, { amplifier: 0, showParticles: false });
    p.addEffect("resistance", 400, { amplifier: 4, showParticles: false });
  } catch {
    return;
  }
  getData(p).visited[id] = true;
  let tries = 0;
  const run = system.runInterval(() => {
    tries++;
    if (!isValid(p) || tries > 120) {
      system.clearRun(run);
      return;
    }
    if (!loaded(ow, pos.x, pos.y ?? 64, pos.z)) return;
    if (!pos.built) {
      if (!building.has(id) && readyToBuild(ow, id)) buildSite(id, ow);
      return;
    }
    system.clearRun(run);
    const land = landingSpot(id);
    try {
      p.teleport(land, { dimension: ow });
      p.removeEffect("resistance");
    } catch {
      // ignore
    }
    title(p, `§e${def.name}`, "§7に到着した", 40);
    if (after) after();
  }, 10);
}

export function landingSpot(id) {
  const pos = layout[id];
  if (id === "kai") return { x: pos.x + 0.5, y: (pos.top ?? pos.y + 14) + 0.5, z: pos.z - 2.5 };
  if (id === "htc") return { x: pos.x + 0.5, y: pos.y + 1.2, z: pos.z - 6.5 };
  if (id === "namek") return { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z - 8.5 };
  return { x: pos.x + 0.5, y: (pos.y ?? 80) + 1.2, z: pos.z - 4.5 };
}

/* ===================================================================================== Namek terraforming */

const namekDone = new Set(worldGet("dbz:namekChunks", []));
let namekBusy = false;

export function terraformNamek(p) {
  if (namekBusy || !layout?.namek?.built) return;
  const c = layout.namek;
  const cx = Math.floor(p.location.x / 16);
  const cz = Math.floor(p.location.z / 16);
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      const kx = cx + dx;
      const kz = cz + dz;
      const key = `${kx},${kz}`;
      if (namekDone.has(key)) continue;
      const wx = kx * 16;
      const wz = kz * 16;
      if (Math.abs(wx + 8 - c.x) > SITES.namek.region || Math.abs(wz + 8 - c.z) > SITES.namek.region) {
        namekDone.add(key);
        continue;
      }
      const dim = p.dimension;
      if (!loaded(dim, wx, 64, wz) || !loaded(dim, wx + 15, 64, wz + 15)) continue;
      namekBusy = true;
      system.runJob((function* () {
        for (let x = wx; x < wx + 16; x++) {
          for (let z = wz; z < wz + 16; z++) {
            try {
              const top = dim.getTopmostBlock({ x, z });
              if (!top) continue;
              let y = top.location.y;
              for (let i = 0; i < 14; i++) {
                const b = dim.getBlock({ x, y, z });
                if (!b) break;
                const t = b.typeId;
                if (t.includes("leaves") || t.includes("_log") || t.includes("vine") || t.includes("flower") || t === "minecraft:short_grass" ||
                  t === "minecraft:tall_grass" || t.includes("bush") || t === "minecraft:snow_layer") {
                  b.setType("minecraft:air");
                  y--;
                  continue;
                }
                if (t === "minecraft:grass_block" || t === "minecraft:podzol" || t === "minecraft:mycelium" || t === "minecraft:snow") b.setType("dbz:namek_grass");
                break;
              }
            } catch {
              // ignore
            }
          }
          yield;
        }
        // a few Ajissa trees
        for (let i = 0; i < 2; i++) {
          const x = wx + randInt(2, 13);
          const z = wz + randInt(2, 13);
          try {
            const top = dim.getTopmostBlock({ x, z });
            if (top && top.typeId === "dbz:namek_grass" && Math.random() < 0.6) ajisa(dim, x, top.location.y + 1, z);
          } catch {
            // ignore
          }
        }
        namekDone.add(key);
        worldSet("dbz:namekChunks", [...namekDone]);
        namekBusy = false;
      })());
      return;
    }
  }
}

export { layout as _layout };
