/* Combat profiles for every character.  rec = recommended player level, plF/hpF scale the fight.
 * atk: list of ranged options the AI can use.  forms: transformations at health thresholds. */

const B = (color, power, extra = {}) => Object.assign({ kind: "blast", color, power, size: 0.7, speed: 1.7, radius: 1.5, cd: 40 }, extra);
const BM = (color, power, extra = {}) => Object.assign({ kind: "beam", color, power, width: 1.0, range: 30, charge: 30, cd: 160 }, extra);
const BALL = (color, power, extra = {}) => Object.assign({ kind: "ball", color, power, size: 2.2, speed: 1.2, radius: 5, charge: 30, cd: 200 }, extra);
const AOE = (power, extra = {}) => Object.assign({ kind: "aoe", color: "white", power, radius: 6, cd: 220 }, extra);
const DISC = (power) => ({ kind: "disc", color: "yellow", power, size: 1.3, speed: 1.2, cd: 220 });

/** @type {Record<string, any>} */
export const PROFILES = {
  goku: { rec: 60, melee: 8, fly: true, atk: [B("blue", 10), BM("blue", 50, { name: "かめはめ波" })], dodge: 0.3, tp: true,
    forms: [{ at: 0.6, to: "goku_ssj", plF: 50 }, { at: 0.3, to: "goku_blue", plF: 200 }] },
  goku_ssj: { rec: 60, melee: 10, fly: true, atk: [B("yellow", 12), BM("blue", 60)], dodge: 0.35, tp: true },
  goku_ssj3: { rec: 70, melee: 12, fly: true, atk: [B("yellow", 14), BM("blue", 80, { width: 1.6 })], dodge: 0.35, tp: true },
  goku_god: { rec: 95, melee: 12, fly: true, atk: [B("red", 14), BM("blue", 80)], dodge: 0.4, tp: true },
  goku_blue: { rec: 110, melee: 14, fly: true, atk: [B("cyan", 16), BM("blue", 90, { width: 1.8 })], dodge: 0.4, tp: true },
  goku_ui: { rec: 135, melee: 18, fly: true, atk: [B("white", 18), BM("white", 110, { width: 2 })], dodge: 0.8, tp: true },
  gohan: { rec: 18, melee: 6, fly: true, atk: [B("yellow", 7), BM("yellow", 32, { name: "魔閃光" })], dodge: 0.2 },
  gohan_ssj2: { rec: 50, melee: 10, fly: true, atk: [B("yellow", 12), BM("blue", 70, { width: 1.6 })], dodge: 0.3 },
  goten: { rec: 15, melee: 5, fly: true, atk: [B("yellow", 6), BM("blue", 26)], dodge: 0.25 },
  goten_ssj: { rec: 35, melee: 7, fly: true, atk: [B("yellow", 8), BM("blue", 32)], dodge: 0.25 },
  vegeta: { rec: 25, melee: 8, fly: true, atk: [B("purple", 9), BM("purple", 45, { name: "ギャリック砲" })], dodge: 0.25,
    forms: [{ at: 0.4, to: "vegeta_ssj", plF: 50 }] },
  vegeta_ssj: { rec: 50, melee: 10, fly: true, atk: [B("yellow", 12), BM("yellow", 80, { width: 2.2, name: "ファイナルフラッシュ" })], dodge: 0.3 },
  vegeta_blue: { rec: 110, melee: 14, fly: true, atk: [B("cyan", 16), BM("cyan", 95, { width: 2.4 })], dodge: 0.35 },
  vegeta_ue: { rec: 135, melee: 18, fly: true, atk: [B("purple", 18), BM("purple", 110, { width: 2.4 })], dodge: 0.35 },
  trunks: { rec: 40, melee: 9, fly: true, atk: [B("yellow", 10), BM("yellow", 45)], dodge: 0.3, forms: [{ at: 0.5, to: "trunks_ssj", plF: 50 }] },
  trunks_ssj: { rec: 50, melee: 11, fly: true, atk: [B("yellow", 12), BALL("yellow", 60, { name: "バーニングアタック" })], dodge: 0.3 },
  piccolo: { rec: 20, melee: 7, fly: true, atk: [B("yellow", 8), BM("yellow", 60, { width: 0.5, name: "魔貫光殺砲", charge: 50, pierce: true, spiral: true })], dodge: 0.2 },
  piccolo_orange: { rec: 100, melee: 14, fly: true, atk: [B("orange", 14), BM("yellow", 90, { width: 0.7, spiral: true })], dodge: 0.25 },
  krillin: { rec: 10, melee: 5, fly: true, atk: [B("yellow", 6), DISC(30)], dodge: 0.2 },
  tien: { rec: 12, melee: 6, fly: true, atk: [B("yellow", 7), BM("yellow", 20, { width: 0.4, name: "どどん波", charge: 10, cd: 80 })], dodge: 0.2, flare: true },
  yamcha: { rec: 8, melee: 5, fly: true, atk: [B("yellow", 6, { guided: true })], dodge: 0.15 },
  roshi: { rec: 5, melee: 5, fly: false, atk: [BM("blue", 28, { name: "かめはめ波" })], dodge: 0.25 },
  bulma: { rec: 1, melee: 1, fly: false, atk: [], noncombat: true },
  karin: { rec: 15, melee: 4, fly: false, atk: [], dodge: 0.9 },
  yajirobe: { rec: 6, melee: 6, fly: false, atk: [] },
  kaio: { rec: 30, melee: 4, fly: false, atk: [], noncombat: true },
  bubbles: { rec: 1, melee: 1, fly: false, atk: [], dodge: 0.55, noncombat: true },
  gregory: { rec: 1, melee: 1, fly: true, atk: [], dodge: 0.5, noncombat: true },
  elder_kai: { rec: 1, melee: 1, fly: false, atk: [], noncombat: true },
  guru: { rec: 1, melee: 1, fly: false, atk: [], noncombat: true },
  namekian: { rec: 10, melee: 5, fly: true, atk: [B("yellow", 6)] },
  announcer: { rec: 1, melee: 1, fly: false, atk: [], noncombat: true },
  whis: { rec: 150, melee: 20, fly: true, atk: [], dodge: 0.95, noncombat: true },
  beerus: { rec: 95, melee: 16, fly: true, plF: 1.4, hpF: 2.5, atk: [B("purple", 18), BALL("orange", 120, { size: 3.5, radius: 8, name: "破壊の玉" })], dodge: 0.5, tp: true },

  raditz: { rec: 8, melee: 5, fly: true, plF: 1.3, hpF: 1.4, atk: [B("purple", 7), BM("purple", 26, { name: "ダブルサンデー" })], dodge: 0.15 },
  nappa: { rec: 14, melee: 7, fly: true, plF: 1.3, hpF: 1.6, atk: [B("yellow", 8), BM("yellow", 30, { name: "口からビーム" }), AOE(25, { name: "ボンバー" })] },
  saibaman: { rec: 10, melee: 4, fly: false, plF: 0.5, hpF: 0.25, atk: [B("green", 4)], selfDestruct: true },
  ginyu: { rec: 30, melee: 8, fly: true, plF: 1.3, hpF: 1.5, atk: [B("purple", 10), BM("purple", 40)], dodge: 0.2, bodyChange: true },
  recoome: { rec: 26, melee: 9, fly: true, plF: 1.2, hpF: 1.6, atk: [BM("yellow", 40, { name: "リクームイレイザーガン" })] },
  burter: { rec: 27, melee: 7, fly: true, plF: 1.2, hpF: 1.1, atk: [B("blue", 8)], dodge: 0.45, fast: true },
  jeice: { rec: 27, melee: 7, fly: true, plF: 1.2, hpF: 1.1, atk: [BALL("red", 35, { name: "クラッシャーボール", size: 1.6 })], dodge: 0.25 },
  guldo: { rec: 24, melee: 4, fly: false, plF: 1.0, hpF: 0.8, atk: [B("green", 6)], timeStop: true },
  frieza1: { rec: 33, melee: 9, fly: true, plF: 1.2, hpF: 1.4, atk: [BM("pink", 30, { width: 0.3, charge: 6, cd: 60, pierce: true, name: "デスビーム" })], dodge: 0.25,
    forms: [{ at: 0.25, to: "frieza2", plF: 3, heal: true }] },
  frieza2: { rec: 35, melee: 11, fly: true, plF: 1.2, hpF: 1.5, atk: [BM("pink", 34, { width: 0.3, charge: 6, cd: 60, pierce: true })], dodge: 0.25,
    forms: [{ at: 0.25, to: "frieza3", plF: 8, heal: true }] },
  frieza3: { rec: 37, melee: 11, fly: true, plF: 1.2, hpF: 1.5, atk: [B("pink", 12, { cd: 15, name: "連続気弾" }), BM("pink", 38, { width: 0.3, charge: 6, pierce: true })], dodge: 0.25,
    forms: [{ at: 0.25, to: "frieza4", plF: 20, heal: true }] },
  frieza4: { rec: 40, melee: 12, fly: true, plF: 1.3, hpF: 2.0, atk: [BM("pink", 40, { width: 0.3, charge: 6, cd: 50, pierce: true, name: "デスビーム" }),
    DISC(45), BALL("orange", 70, { size: 3, radius: 7, name: "デスボール", charge: 40 })], dodge: 0.3, tp: true },
  frieza_golden: { rec: 95, melee: 16, fly: true, plF: 1.4, hpF: 2.5, atk: [BM("gold", 90, { width: 0.4, charge: 8, cd: 50, pierce: true }), BALL("orange", 120, { size: 4, radius: 9 })], dodge: 0.35, tp: true },
  android17: { rec: 46, melee: 10, fly: true, plF: 1.2, hpF: 1.4, atk: [B("green", 11), AOE(30, { name: "バリア" })], dodge: 0.3, noKi: true },
  android18: { rec: 46, melee: 10, fly: true, plF: 1.2, hpF: 1.3, atk: [B("yellow", 11), DISC(35)], dodge: 0.3, noKi: true },
  android16: { rec: 48, melee: 13, fly: true, plF: 1.3, hpF: 2.0, atk: [BM("yellow", 45, { name: "ヘルズフラッシュ" })], noKi: true },
  android19: { rec: 42, melee: 9, fly: true, plF: 1.1, hpF: 1.5, atk: [B("red", 9)], absorbKi: true, noKi: true },
  android20: { rec: 43, melee: 8, fly: true, plF: 1.1, hpF: 1.3, atk: [BM("red", 30, { width: 0.4, name: "目からビーム" })], absorbKi: true, noKi: true },
  cell1: { rec: 50, melee: 11, fly: true, plF: 1.2, hpF: 1.5, atk: [BM("blue", 45, { name: "かめはめ波" })], dodge: 0.2,
    forms: [{ at: 0.2, to: "cell2", plF: 2.5, heal: true }] },
  cell2: { rec: 52, melee: 13, fly: true, plF: 1.2, hpF: 1.6, atk: [BM("blue", 50), B("yellow", 12)], dodge: 0.2,
    forms: [{ at: 0.2, to: "cell", plF: 6, heal: true }] },
  cell: { rec: 58, melee: 15, fly: true, plF: 1.3, hpF: 2.2, atk: [BM("blue", 70, { width: 1.8, name: "かめはめ波" }), DISC(50), AOE(40)], dodge: 0.3, tp: true,
    forms: [{ at: 0.15, to: "cell_super", plF: 1.6, heal: true }] },
  cell_super: { rec: 62, melee: 16, fly: true, plF: 1.4, hpF: 2.0, atk: [BM("blue", 100, { width: 2.4, name: "かめはめ波" }), B("yellow", 14, { cd: 20 })], dodge: 0.3, tp: true },
  cell_jr: { rec: 55, melee: 9, fly: true, plF: 0.6, hpF: 0.4, atk: [B("blue", 8)], dodge: 0.3 },
  dabura: { rec: 64, melee: 13, fly: true, plF: 1.2, hpF: 1.6, atk: [B("red", 13), BM("red", 55, { name: "魔空波" })], dodge: 0.2, stoneSpit: true },
  spopovich: { rec: 60, melee: 12, fly: false, plF: 0.7, hpF: 0.7, atk: [B("yellow", 10)] },
  yamu: { rec: 58, melee: 8, fly: false, plF: 0.6, hpF: 0.5, atk: [B("yellow", 8)] },
  buu_fat: { rec: 68, melee: 14, fly: true, plF: 1.3, hpF: 2.4, atk: [BM("pink", 30, { width: 0.4, candy: true, name: "お菓子光線" }), B("pink", 14)], regen: 0.02,
    forms: [{ at: 0.2, to: "buu_super", plF: 2.5, heal: true }] },
  buu_super: { rec: 74, melee: 16, fly: true, plF: 1.3, hpF: 2.2, atk: [B("pink", 15, { cd: 18 }), BM("pink", 70, { width: 1.5 })], regen: 0.02, dodge: 0.25,
    forms: [{ at: 0.25, to: "buu_gohan", plF: 2, heal: true }] },
  buu_gohan: { rec: 78, melee: 18, fly: true, plF: 1.3, hpF: 2.0, atk: [BM("purple", 85, { width: 1.8 }), B("pink", 16, { cd: 15 })], regen: 0.02, dodge: 0.3,
    forms: [{ at: 0.15, to: "buu_kid", plF: 1.5, heal: true }] },
  buu_kid: { rec: 82, melee: 18, fly: true, plF: 1.4, hpF: 2.0, atk: [BALL("pink", 110, { size: 3.5, radius: 9, name: "惑星破壊弾" }), B("pink", 16, { cd: 14 })], regen: 0.03, dodge: 0.3, tp: true },
  broly: { rec: 70, melee: 18, fly: true, plF: 1.3, hpF: 2.0, atk: [B("green", 16), BALL("green", 80, { name: "ギガンティックミーティア" })],
    forms: [{ at: 0.5, to: "broly_lssj", plF: 3, heal: true }] },
  broly_lssj: { rec: 75, melee: 22, fly: true, plF: 1.5, hpF: 3.0, atk: [B("green", 20, { cd: 20 }), BALL("green", 130, { size: 4, radius: 10, name: "ギガンティックミーティア" })], dodge: 0.15 },
  goku_black: { rec: 112, melee: 18, fly: true, plF: 1.3, hpF: 2.2, atk: [B("dark", 18), BM("black_rose", 90, { name: "黒いかめはめ波" })], dodge: 0.35, tp: true,
    forms: [{ at: 0.4, to: "goku_black_rose", plF: 2, heal: true }] },
  goku_black_rose: { rec: 115, melee: 20, fly: true, plF: 1.4, hpF: 2.4, atk: [B("black_rose", 20), BM("black_rose", 110, { width: 2 })], dodge: 0.4, tp: true },
  zamasu: { rec: 118, melee: 18, fly: true, plF: 1.4, hpF: 3.0, atk: [B("pink", 18, { cd: 15 }), BM("pink", 100, { width: 2, name: "聖なる光の剣" })], regen: 0.03, dodge: 0.3, tp: true },
  hit: { rec: 120, melee: 22, fly: true, plF: 1.4, hpF: 2.4, atk: [B("purple", 20)], dodge: 0.6, tp: true, timeSkip: true },
  jiren: { rec: 132, melee: 26, fly: true, plF: 1.5, hpF: 3.5, atk: [B("red", 24, { cd: 18 }), BALL("red", 150, { size: 4, radius: 10, name: "パワーインパクト" })], dodge: 0.45, tp: true },
  frieza_soldier: { rec: 22, melee: 5, fly: true, plF: 0.5, hpF: 0.3, atk: [B("pink", 6)] },
  rr_soldier: { rec: 6, melee: 4, fly: false, plF: 0.5, hpF: 0.3, atk: [B("yellow", 4, { name: "銃撃", size: 0.3, speed: 2.6 })] },
  rr_robot: { rec: 12, melee: 8, fly: false, plF: 0.8, hpF: 0.8, atk: [BM("red", 20, { width: 0.6 })] },
  oozaru: { rec: 20, melee: 18, fly: false, plF: 2.5, hpF: 2.0, atk: [BM("purple", 60, { width: 2.2, name: "口からエネルギー波" })] },
  training_dummy: { rec: 1, melee: 0, fly: false, atk: [], noncombat: true },
};

/** Player base power at a level, assuming average stat allocation. Mirrors core/stats.js basePL. */
export function expectedBase(level) {
  const sum = 5 + 3 * (level - 1);
  return 5 * Math.pow(1.115, level - 1) * (1 + (sum - 5) / 15);
}

/** Rough transformation multiplier a player is expected to have at a level. */
export function expectedForm(level) {
  if (level >= 135) return 15000;
  if (level >= 120) return 9000;
  if (level >= 105) return 5000;
  if (level >= 90) return 2000;
  if (level >= 60) return 400;
  if (level >= 45) return 100;
  if (level >= 25) return 50;
  if (level >= 12) return 2;
  return 1;
}

export function profileOf(id) {
  return PROFILES[id] ?? { rec: 10, melee: 5, fly: false, atk: [] };
}

/** Combat numbers for a character id (optionally at a forced level). */
export function statsFor(id, level) {
  const prof = profileOf(id);
  const lv = level ?? prof.rec;
  const pl = expectedBase(lv) * expectedForm(lv) * (prof.plF ?? 1);
  const hp = Math.round((60 + lv * 9) * (prof.hpF ?? 1));
  const melee = prof.melee * (1 + lv * 0.02);
  return { pl, hp, melee, prof };
}
