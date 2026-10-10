/* Every character: strength, fighting personality, ki attacks, signature moves, transformations and lines.
 * rec = strength rank (the old addon's recommended level), plF/hpF scale it; atk = everyday ki attacks. */

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

/* ------------------------------------------------------------------------------------------ specials
 * Signature moves, used on a long cooldown with a full wind-up (title card, chant, camera cut).
 * type: beam | ball | disc | barrage | barrier | flare | buff | regen | tpbeam | spirit | meteor | timeskip | timestop
 *       | candy | selfdestruct | rush */
const BEAM = (name, color, power, extra = {}) => Object.assign({ type: "beam", name, color, power, width: 1.6, charge: 40, chant: null }, extra);
const BALLS = (name, color, power, extra = {}) => Object.assign({ type: "ball", name, color, power, size: 3, charge: 40, speed: 1.0, radius: 8 }, extra);
const KAME = ["か…", "め…", "は…", "め…", "波ーーっ！！"];

/** @type {Record<string, any[]>} */
export const SPECIALS = {
  goku: [BEAM("かめはめ波", "blue", 70, { chant: KAME }), { type: "buff", name: "界王拳", kind: "kaioken" },
    { type: "spirit", name: "元気玉", color: "cyan", power: 160 }, { type: "meteor", name: "流星脚" }],
  goku_ssj: [BEAM("かめはめ波", "blue", 85, { chant: KAME, width: 2 }), { type: "tpbeam", name: "瞬間移動かめはめ波", color: "blue", power: 90 },
    { type: "meteor", name: "メテオスマッシュ" }],
  goku_ssj3: [BEAM("超かめはめ波", "blue", 110, { chant: KAME, width: 2.6 }), { type: "meteor", name: "龍拳", color: "gold" },
    { type: "rush", name: "超連続攻撃" }],
  goku_god: [BEAM("ゴッドかめはめ波", "red", 120, { chant: KAME, width: 2.4 }), { type: "rush", name: "神の連撃" }],
  goku_blue: [BEAM("10倍かめはめ波", "blue", 140, { chant: KAME, width: 3 }), { type: "tpbeam", name: "瞬間移動かめはめ波", color: "cyan", power: 120 },
    { type: "buff", name: "ブルー界王拳", kind: "kaioken" }],
  goku_ui: [BEAM("かめはめ波", "white", 160, { chant: KAME, width: 3, charge: 20 }), { type: "timeskip", name: "身勝手の極意" },
    { type: "rush", name: "極意の連打" }],
  gohan: [BEAM("魔閃光", "yellow", 55, { chant: ["魔閃光ーっ！！"], pose: "overhead" }), { type: "rush", name: "怒りの連打" }],
  gohan_ssj2: [BEAM("かめはめ波", "blue", 110, { chant: KAME, width: 2.6 }), { type: "meteor", name: "怒りの一撃" },
    { type: "rush", name: "超サイヤ人2の猛攻" }],
  goten: [BEAM("かめはめ波", "blue", 40, { chant: KAME, width: 1.2 }), { type: "rush", name: "悟天アタック" }],
  goten_ssj: [BEAM("かめはめ波", "blue", 55, { chant: KAME, width: 1.4 }), { type: "barrage", name: "連続エネルギー弾", color: "yellow", count: 12 }],
  vegeta: [BEAM("ギャリック砲", "purple", 75, { chant: ["ギャリック砲ーっ！！"], width: 1.8 }),
    { type: "barrage", name: "連続エネルギー弾", color: "yellow", count: 16 }, { type: "meteor", name: "王子の一撃" }],
  vegeta_ssj: [BEAM("ファイナルフラッシュ", "yellow", 120, { chant: ["ファイナル…", "フラーーッシュ！！"], width: 3, charge: 55 }),
    BALLS("ビッグバンアタック", "cyan", 95, { size: 2.2, charge: 18, speed: 1.6, radius: 9 }),
    { type: "barrage", name: "連続エネルギー弾", color: "yellow", count: 20 }],
  vegeta_blue: [BEAM("ファイナルフラッシュ", "cyan", 150, { chant: ["ファイナル…", "フラーーッシュ！！"], width: 3.4, charge: 50 }),
    BALLS("ビッグバンアタック", "cyan", 120, { size: 2.6, charge: 16, speed: 1.7, radius: 10 }), { type: "rush", name: "王子の連撃" }],
  vegeta_ue: [BEAM("ファイナルフラッシュ", "purple", 170, { chant: ["ファイナル…", "フラーーッシュ！！"], width: 3.6, charge: 45 }),
    { type: "rush", name: "我儘の極意" }, { type: "meteor", name: "破壊の一撃", color: "purple" }],
  trunks: [{ type: "rush", name: "剣撃" }, BALLS("バーニングアタック", "yellow", 60, { size: 2, charge: 18, speed: 1.6 })],
  trunks_ssj: [BALLS("バーニングアタック", "yellow", 85, { size: 2.4, charge: 18, speed: 1.7 }), { type: "rush", name: "超サイヤ人の剣撃" },
    { type: "barrage", name: "連続エネルギー弾", color: "yellow", count: 14 }],
  piccolo: [BEAM("魔貫光殺砲", "yellow", 95, { chant: ["魔貫…", "光殺砲ーっ！！"], width: 0.6, charge: 70, pierce: true, spiral: true, pose: "forehead" }),
    { type: "barrier", name: "爆力魔波", color: "yellow", power: 50 }, { type: "regen", name: "再生" }],
  piccolo_orange: [BEAM("魔貫光殺砲", "orange", 150, { chant: ["魔貫…", "光殺砲ーっ！！"], width: 0.8, charge: 50, pierce: true, spiral: true, pose: "forehead" }),
    { type: "regen", name: "再生" }, { type: "meteor", name: "巨大な拳" }],
  krillin: [{ type: "disc", name: "気円斬", color: "yellow", power: 70 }, { type: "flare", name: "太陽拳" },
    BEAM("かめはめ波", "blue", 35, { chant: KAME, width: 1.1 })],
  tien: [{ type: "kikoho", name: "気功砲", color: "yellow", power: 75 }, { type: "flare", name: "太陽拳" },
    BEAM("どどん波", "yellow", 40, { width: 0.4, charge: 14, pierce: true })],
  yamcha: [{ type: "rush", name: "狼牙風風拳" }, { type: "guided", name: "繰気弾", color: "yellow", power: 45 }],
  roshi: [BEAM("かめはめ波", "blue", 40, { chant: KAME, width: 1.6 }), { type: "buff", name: "MAXパワー", kind: "max" }],
  bulma: [{ type: "barrage", name: "光線銃", color: "red", count: 6 }],
  karin: [{ type: "rush", name: "カリン流" }],
  yajirobe: [{ type: "rush", name: "居合斬り" }],
  kaio: [{ type: "flare", name: "ダジャレ" }],
  bubbles: [{ type: "rush", name: "ウホウホ" }],
  gregory: [{ type: "rush", name: "ハンマー" }],
  elder_kai: [{ type: "barrier", name: "老界王神の喝", color: "white", power: 20 }],
  guru: [{ type: "barrier", name: "最長老の気", color: "white", power: 15 }],
  namekian: [BEAM("ナメック流気功波", "yellow", 35, { width: 1 }), { type: "regen", name: "再生" }],
  announcer: [{ type: "flare", name: "マイクパフォーマンス" }],
  whis: [{ type: "barrier", name: "時の巻き戻し", color: "cyan", power: 60 }, { type: "rush", name: "杖の一撃" }],
  beerus: [BALLS("破壊の玉", "purple", 160, { size: 3.6, charge: 30, speed: 1.1, radius: 10 }), { type: "barrier", name: "破壊神の気", color: "purple", power: 80 },
    { type: "rush", name: "破壊神の指" }],

  raditz: [BEAM("ダブルサンデー", "purple", 45, { width: 1.2, charge: 20 }), { type: "rush", name: "サイヤ人の猛攻" }],
  nappa: [{ type: "barrier", name: "ボンバー", color: "yellow", power: 50 }, BEAM("口からビーム", "yellow", 45, { width: 1.4, charge: 16 })],
  saibaman: [{ type: "selfdestruct", name: "自爆" }],
  ginyu: [BEAM("ミルキーキャノン", "purple", 55, { charge: 20 }), { type: "rush", name: "ギニュー特戦隊の連撃" }],
  recoome: [BEAM("リクームイレイザーガン", "yellow", 60, { width: 2, charge: 30, chant: ["リクーム…", "イレイザーガーン！！"] }),
    { type: "meteor", name: "リクームキック" }],
  burter: [{ type: "rush", name: "スペースマッハアタック" }, { type: "barrage", name: "ブルーハリケーン", color: "blue", count: 10 }],
  jeice: [BALLS("クラッシャーボール", "red", 60, { size: 1.8, charge: 20, speed: 1.6 }), { type: "rush", name: "ジースの連撃" }],
  guldo: [{ type: "timestop", name: "時間停止" }],
  frieza1: [{ type: "deathbeam", name: "デスビーム", color: "pink", power: 25 }, { type: "rush", name: "尻尾の一撃" }],
  frieza2: [{ type: "deathbeam", name: "デスビーム", color: "pink", power: 30 }, { type: "meteor", name: "角の突撃" }],
  frieza3: [{ type: "barrage", name: "連続デスビーム", color: "pink", count: 14 }, { type: "deathbeam", name: "デスビーム", color: "pink", power: 32 }],
  frieza4: [{ type: "deathbeam", name: "デスビーム", color: "pink", power: 40 }, BALLS("デスボール", "orange", 130, { size: 4, charge: 45, speed: 0.7, radius: 11, overhead: true }),
    { type: "disc", name: "気円斬", color: "pink", power: 70 }],
  frieza_golden: [{ type: "deathbeam", name: "デスビーム", color: "gold", power: 70 },
    BALLS("スーパーノヴァ", "orange", 200, { size: 4.6, charge: 45, speed: 0.75, radius: 12, overhead: true }), { type: "rush", name: "黄金の猛攻" }],
  android17: [{ type: "barrier", name: "バリアー", color: "green", power: 55 }, { type: "barrage", name: "エネルギー弾", color: "green", count: 10 }],
  android18: [{ type: "disc", name: "気円斬", color: "yellow", power: 60 }, { type: "barrage", name: "エネルギー弾", color: "yellow", count: 12 }],
  android16: [BEAM("ヘルズフラッシュ", "yellow", 80, { width: 2.2, charge: 35, chant: ["ヘルズ…", "フラーッシュ！！"] }), { type: "meteor", name: "16号の剛腕" }],
  android19: [{ type: "regen", name: "エネルギー吸収" }, { type: "rush", name: "19号の突撃" }],
  android20: [BEAM("目からビーム", "red", 45, { width: 0.4, charge: 10, pierce: true }), { type: "regen", name: "エネルギー吸収" }],
  cell1: [BEAM("かめはめ波", "blue", 55, { chant: KAME }), { type: "regen", name: "再生" }],
  cell2: [BEAM("かめはめ波", "blue", 65, { chant: KAME }), { type: "regen", name: "再生" }],
  cell: [BEAM("かめはめ波", "blue", 95, { chant: KAME, width: 2.2 }), { type: "barrier", name: "パーフェクトバリアー", color: "blue", power: 60 },
    { type: "disc", name: "気円斬", color: "yellow", power: 70 }, { type: "regen", name: "再生" }],
  cell_super: [BEAM("ソーラーかめはめ波", "blue", 140, { chant: KAME, width: 3 }), { type: "barrier", name: "パーフェクトバリアー", color: "blue", power: 70 },
    { type: "tpbeam", name: "瞬間移動かめはめ波", color: "blue", power: 110 }, { type: "regen", name: "再生" }],
  cell_jr: [{ type: "barrage", name: "エネルギー弾", color: "blue", count: 10 }, { type: "rush", name: "セルジュニアの連撃" }],
  dabura: [BEAM("魔空波", "red", 70, { width: 1.8, charge: 30 }), { type: "barrage", name: "石化の唾", color: "dark", count: 6 }],
  spopovich: [{ type: "rush", name: "怪力" }],
  yamu: [{ type: "rush", name: "体当たり" }],
  buu_fat: [{ type: "candy", name: "お菓子になっちゃえ光線", color: "pink" }, { type: "regen", name: "再生" }, { type: "rush", name: "ブウのタックル" }],
  buu_super: [BEAM("イリュージョンかめはめ波", "pink", 100, { width: 2.2, chant: KAME }), { type: "candy", name: "お菓子になっちゃえ光線", color: "pink" },
    { type: "regen", name: "再生" }],
  buu_gohan: [BEAM("魔閃光", "purple", 120, { width: 2.4, pose: "overhead" }), { type: "regen", name: "再生" }, { type: "rush", name: "ブウの猛攻" }],
  buu_kid: [BALLS("惑星破壊弾", "pink", 170, { size: 4.2, charge: 45, speed: 0.8, radius: 12, overhead: true }), { type: "regen", name: "再生" },
    { type: "rush", name: "予測不能の連打" }],
  broly: [BALLS("イレイザーキャノン", "green", 85, { size: 2.2, charge: 20, speed: 1.5 }), { type: "meteor", name: "ブロリーの剛腕" }],
  broly_lssj: [BALLS("ギガンティックミーティア", "green", 170, { size: 4.2, charge: 30, speed: 1.0, radius: 12 }), { type: "meteor", name: "ギガンティッククラッシュ" },
    { type: "rush", name: "暴走" }],
  goku_black: [BEAM("黒いかめはめ波", "black_rose", 110, { chant: KAME, width: 2.2 }), { type: "rush", name: "気の刃" }],
  goku_black_rose: [BEAM("黒いかめはめ波", "black_rose", 140, { chant: KAME, width: 2.6 }), { type: "barrage", name: "神裂斬", color: "black_rose", count: 12 },
    { type: "rush", name: "ロゼの刃" }],
  zamasu: [BEAM("聖なる光の剣", "pink", 120, { width: 2, charge: 30 }), { type: "regen", name: "不死身の体" }, { type: "barrier", name: "神の怒り", color: "pink", power: 60 }],
  hit: [{ type: "timeskip", name: "時飛ばし" }, { type: "rush", name: "見えない打撃" }],
  jiren: [BALLS("パワーインパクト", "red", 190, { size: 4.4, charge: 30, speed: 1.0, radius: 12 }), { type: "barrier", name: "気合い", color: "red", power: 90 },
    { type: "meteor", name: "ジレンの拳" }],
  frieza_soldier: [{ type: "barrage", name: "スカウター連射", color: "pink", count: 6 }],
  rr_soldier: [{ type: "barrage", name: "一斉射撃", color: "yellow", count: 10 }],
  rr_robot: [BEAM("ロケットパンチ", "red", 40, { width: 0.8, charge: 14 })],
  oozaru: [BEAM("口からエネルギー波", "purple", 90, { width: 3, charge: 30 }), { type: "meteor", name: "大猿の踏みつけ" }],
  training_dummy: [],
};

/* ------------------------------------------------------------------------------------------ personality
 * aggro: how eagerly it closes in (0..1); range: liking for ki over fists (0..1); taunt: toys with weaker foes */
const STYLE = {
  hero: { aggro: 0.6, range: 0.45, taunt: 0, guard: 0.35 },
  rash: { aggro: 0.8, range: 0.35, taunt: 0.05, guard: 0.2 },
  proud: { aggro: 0.75, range: 0.5, taunt: 0.15, guard: 0.3 },
  calm: { aggro: 0.45, range: 0.6, taunt: 0, guard: 0.5 },
  toy: { aggro: 0.4, range: 0.6, taunt: 0.4, guard: 0.35 },
  brute: { aggro: 0.9, range: 0.25, taunt: 0.1, guard: 0.1 },
  trick: { aggro: 0.55, range: 0.55, taunt: 0.1, guard: 0.45 },
  stoic: { aggro: 0.35, range: 0.4, taunt: 0, guard: 0.7 },
  weak: { aggro: 0.5, range: 0.5, taunt: 0, guard: 0.2 },
};

const STYLE_OF = {
  goku: "hero", gohan: "hero", goten: "rash", vegeta: "proud", trunks: "hero", piccolo: "calm", krillin: "hero", tien: "calm",
  yamcha: "rash", roshi: "calm", bulma: "weak", karin: "trick", yajirobe: "weak", kaio: "weak", bubbles: "trick", gregory: "trick",
  elder_kai: "weak", guru: "weak", namekian: "calm", announcer: "weak", whis: "stoic", beerus: "toy", raditz: "proud", nappa: "brute",
  saibaman: "rash", ginyu: "proud", recoome: "brute", burter: "trick", jeice: "proud", guldo: "trick", frieza: "toy", android17: "calm",
  android18: "calm", android16: "stoic", android19: "brute", android20: "trick", cell: "toy", cell_jr: "rash", dabura: "toy",
  spopovich: "brute", yamu: "brute", buu: "trick", broly: "brute", black: "toy", zamasu: "toy", hit: "stoic", jiren: "stoic",
  frieza_soldier: "weak", rr_soldier: "weak", rr_robot: "brute", oozaru: "brute", training_dummy: "weak",
};

/** Character id -> key used for personality and lines (forms share their base character's). */
export function baseOf(id) {
  if (id.startsWith("frieza") && id !== "frieza_soldier") return "frieza";
  if (id.startsWith("cell") && id !== "cell_jr") return "cell";
  if (id.startsWith("buu")) return "buu";
  if (id.startsWith("goku_black")) return "black";
  if (id.startsWith("broly")) return "broly";
  if (id.startsWith("android") || id.startsWith("rr_") || id.startsWith("frieza_") || id.startsWith("cell_") || id.startsWith("elder")
    || id.startsWith("training")) return id;
  return id.split("_")[0];
}

export function styleOf(id) {
  return STYLE[STYLE_OF[baseOf(id)] ?? "hero"];
}

const VILLAINS = new Set(["raditz", "nappa", "saibaman", "ginyu", "recoome", "burter", "jeice", "guldo", "frieza", "android17", "android18",
  "android16", "android19", "android20", "cell", "cell_jr", "dabura", "spopovich", "yamu", "buu", "broly", "black", "zamasu",
  "frieza_soldier", "rr_soldier", "rr_robot", "oozaru"]);

export function isVillain(id) {
  return VILLAINS.has(baseOf(id));
}

/* ------------------------------------------------------------------------------------------ lines */
const HERO_LINES = {
  start: ["いくぞ！", "全力でいかせてもらう！", "負けるわけにはいかない！"],
  special: ["これでどうだ！", "くらえーっ！"],
  transform: ["はあああああっ！！"],
  pinch: ["くっ… まだだ…！", "こんなところで…！"],
  win: ["勝った…！", "いい勝負だった！"],
  lose: ["ちくしょう…", "強すぎる…"],
};
const VILLAIN_LINES = {
  start: ["遊んでやろう。", "せいぜい楽しませてくれよ。", "死にたいらしいな。"],
  special: ["消えてなくなれ！", "これで終わりだ！"],
  transform: ["本当の力を見せてやる…！"],
  pinch: ["ば、ばかな…！", "このオレが…！？"],
  win: ["フン、くだらん。", "これが力の差だ。"],
  lose: ["こ、このオレが… 負けるだと…！"],
};

/** @type {Record<string, any>} */
const LINES = {
  goku: { start: ["オッス！ オラわくわくすっぞ！", "おめえ強そうだな！ いっちょやってみっか！"], special: ["これがオラの全力だーっ！"],
    transform: ["はあああああっ！！ これが… 超サイヤ人だ！"], pinch: ["へへっ… おめえ、ほんとに強えな…！"],
    win: ["いい勝負だったな！ またやろうぜ！"], lose: ["ひぇ～… おめえ強えなあ…"] },
  gohan: { start: ["僕だって… 戦えます！"], special: ["お父さん… 力を貸して！"], transform: ["許さない…！ 許さないぞおおお！！"],
    pinch: ["負けられない… みんなのためにも！"], win: ["終わった…"], lose: ["ご、ごめんなさい… お父さん…"] },
  goten: { start: ["よーし、いっくぞー！"], special: ["かめはめ波ーっ！"], transform: ["えへへ、金色になっちゃった！"], pinch: ["いたた…"],
    win: ["やったー！ 勝っちゃった！"], lose: ["うえーん…"] },
  vegeta: { start: ["サイヤ人の王子をなめるなよ！", "貴様ごときがこのオレに勝てると思うな！"], special: ["消えてなくなれーっ！！"],
    transform: ["見るがいい… これが超サイヤ人だ！！"], pinch: ["このオレが… こんなヤツに…！"], win: ["フン、当然の結果だ。"],
    lose: ["くそったれ…！"] },
  trunks: { start: ["未来は… 変えてみせる！"], special: ["これで終わりだ！"], transform: ["はああああっ！！"], pinch: ["まだだ… まだ終われない！"],
    win: ["平和は守った…"], lose: ["すみません… 母さん…"] },
  piccolo: { start: ["神と融合したこのオレの力… 見せてやろう。"], special: ["魔貫光殺砲ーっ！！"], transform: ["はあああっ！"],
    pinch: ["チッ… やるじゃないか…"], win: ["フン、甘く見たな。"], lose: ["くっ… 不覚…"] },
  krillin: { start: ["よーし、オレだってやるときはやるんだ！"], special: ["気円斬ーっ！！"], pinch: ["ひえっ！ やばいって！"],
    win: ["や、やった！ 勝ったぞ！"], lose: ["またオレか…"] },
  tien: { start: ["鶴仙流… いや、天津飯流の拳を見せてやる。"], special: ["気功砲ーっ！！"], pinch: ["まだ… 撃てる…！"], win: ["修行の成果だ。"],
    lose: ["くっ…"] },
  yamcha: { start: ["狼牙風風拳を見せてやるぜ！"], special: ["狼牙風風拳！！ ハイハイハイーッ！"], pinch: ["ま、まずい…"], win: ["へっ、どんなもんだ！"],
    lose: ["またこのパターンかよ…"] },
  roshi: { start: ["ほっほっほ、武天老師の実力を見せてやろう。"], special: ["MAXパワーじゃ！"], win: ["まだまだ若いもんには負けんわい。"],
    lose: ["いたた… 腰が…"] },
  beerus: { start: ["ふわぁ… 退屈させないでよね。"], special: ["破壊…！"], pinch: ["へぇ… 少しは楽しめそうだね。"], win: ["まあ、こんなもんか。"],
    lose: ["…ありえない。"] },
  whis: { start: ["おやおや。少しだけお相手しましょうか。"], special: ["ほい。"], win: ["まだまだですねえ。"], lose: ["あらら… 珍しいこともあるものですね。"] },
  raditz: { start: ["カカロットの兄、ラディッツだ！"], special: ["ダブルサンデー！！"], pinch: ["ま、待て！ 話せばわかる！"], win: ["弱いヤツめ！"],
    lose: ["こ、このオレが…"] },
  nappa: { start: ["へっへっへ、遊んでやるぜ！"], special: ["ボンバーッ！！"], win: ["弱すぎるぜ！"], lose: ["ベ、ベジータ… 助けてくれ…"] },
  saibaman: { start: ["キキーッ！"], special: ["キキッ…！！（自爆）"], win: ["キキキッ！"], lose: ["キ…"] },
  ginyu: { start: ["ギニュー特戦隊、参上！ スペシャルファイティングポーズ！"], special: ["これがギニュー様の力だ！"], win: ["見たか、ギニュー特戦隊の力を！"],
    lose: ["ば、ばかな…"] },
  recoome: { start: ["リクーム！ 参上！"], special: ["リクーム… イレイザーガーン！！"], win: ["ハッハー！"], lose: ["い… いたい…"] },
  burter: { start: ["宇宙一のスピードを見せてやる！"], special: ["スペースマッハアタック！"], win: ["遅いんだよ！"], lose: ["オレより速いだと…"] },
  jeice: { start: ["ジース参上！"], special: ["クラッシャーボール！"], win: ["チョロいもんだぜ！"], lose: ["く、くそ…"] },
  guldo: { start: ["グルドだ！ 時間を止めてやる！"], special: ["ぶはっ…！（時間停止）"], win: ["ウハハハ！"], lose: ["息が… 続かない…"] },
  frieza: { start: ["ホッホッホ… 少しは楽しませてくださいね。", "このフリーザに逆らうとは、いい度胸です。"], special: ["死になさい！"],
    transform: ["お見せしましょう… 私の本当の姿を！"], pinch: ["許さん… 許さんぞ、虫ケラ！！"], win: ["ホッホッホ、あっけないですね。"],
    lose: ["そ、そんな… この私が…！"] },
  android17: { start: ["悪いけど、手加減はしないよ。"], special: ["バリアー！"], win: ["退屈しのぎにはなったかな。"], lose: ["やるじゃないか。"] },
  android18: { start: ["さっさと終わらせるよ。"], special: ["気円斬！"], win: ["弱すぎ。"], lose: ["…ちっ。"] },
  android16: { start: ["…戦闘を開始する。"], special: ["ヘルズフラッシュ。"], win: ["…任務完了。"], lose: ["…自然を… 守って…"] },
  android19: { start: ["エネルギーを吸い取ってやる！"], win: ["ごちそうさま。"], lose: ["ピー…"] },
  android20: { start: ["ドクター・ゲロの力を思い知れ！"], win: ["計算どおりだ。"], lose: ["こ、こんなはずでは…"] },
  cell: { start: ["さあ、セルゲームを始めようか。", "完全体となった私の力、見せてやろう。"], special: ["かめはめ波！"],
    transform: ["完全体だ…！ これが完全体の力だ！"], pinch: ["き、きさま…！ 完全体の私を…！"], win: ["フフフ… 完璧だ。"],
    lose: ["バカな… 完全体の私が…！"] },
  cell_jr: { start: ["キキッ！ 遊ぼうよ！"], win: ["キャハハ！"], lose: ["キ…"] },
  dabura: { start: ["暗黒魔界の王、ダーブラ様だ。"], special: ["魔空波！"], win: ["地獄へ落ちろ。"], lose: ["こ、この魔界の王が…"] },
  spopovich: { start: ["ウオオオオ！"], win: ["ガアアア！"], lose: ["ウ…ウ…"] },
  yamu: { start: ["エネルギーをいただくぞ！"], win: ["フン。"], lose: ["ぐはっ…"] },
  buu: { start: ["ブウ、おまえ倒す！", "あそぼ！ あそぼ！"], special: ["おまえ、お菓子になっちゃえ！"], transform: ["ウオオオオオ！！"],
    pinch: ["ブウ、怒ったぞ！"], win: ["ブウ、勝った！ キャハハ！"], lose: ["ブウ… 負けた…"] },
  broly: { start: ["カカロットォ…！！", "オレは悪魔だ…"], special: ["ウオオオオオオ！！"], transform: ["ウオオオオオオオオ！！"],
    pinch: ["ウ… ウオオオオ！"], win: ["フハハハハ！"], lose: ["カカロットォ…"] },
  black: { start: ["人間ども… 美しい世界のために消えてもらう。"], special: ["これが神の力だ。"], transform: ["見せてやろう… ロゼの美しさを。"],
    pinch: ["人間ごときが…！"], win: ["美しい…"], lose: ["ありえない… 神である私が…"] },
  zamasu: { start: ["正義は我にあり。"], special: ["神の裁きを受けよ！"], pinch: ["不死身の私に何をしても無駄だ！"], win: ["正義が勝つのだ。"],
    lose: ["人間… ごときが…"] },
  hit: { start: ["…依頼を遂行する。"], special: ["時飛ばし。"], win: ["…終わりだ。"], lose: ["…見事だ。"] },
  jiren: { start: ["…力こそが全てだ。"], special: ["…ふん。"], pinch: ["オレが… 負けるわけにはいかない…！"], win: ["…弱い。"],
    lose: ["…オレの… 負けだ…"] },
  oozaru: { start: ["グオオオオオ！！"], special: ["グオオオオ！！"], win: ["ゴアアアア！"], lose: ["グオ…"] },
  bulma: { start: ["ちょ、ちょっと！ 私は科学者なのよ！？"], special: ["えいっ！ えいっ！"], win: ["見た！？ これが天才の実力よ！"], lose: ["もうっ！ ベジータ～！"] },
  kaio: { start: ["わしは北の界王じゃ！"], special: ["ふとんがふっとんだ！"], win: ["わっはっは！"], lose: ["ひ～ん…"] },
};

/** Pick a line for a character and situation (or null when it has none). */
export function lineFor(id, kind) {
  const base = baseOf(id);
  const own = LINES[base]?.[kind];
  const pool = own ?? (isVillain(id) ? VILLAIN_LINES : HERO_LINES)[kind];
  if (!pool || !pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Special lines for fated match-ups, keyed "a|b" by base character. */
const RIVALS = {
  "goku|vegeta": ["カカロット… 決着をつけてやる！", "へへっ、やっぱりおめえとやるのが一番わくわくすっぞ！"],
  "goku|frieza": ["フリーザ… おめえだけは許さねえ！", "ホッホッホ… あのときのお礼をしてあげますよ、孫悟空。"],
  "gohan|cell": ["もうやめろ… セル…！", "フフフ… 怒れ、悟飯！ もっと怒るのだ！"],
  "goku|jiren": ["ジレン… オラ、おめえを超えてみせる！", "…来い。"],
  "goku|broly": ["ブロリー… 落ち着けって！", "カカロットォォ！！"],
  "goku|black": ["オラの体で何してんだ…！", "孫悟空… 人間の最高傑作よ。"],
  "goku|hit": ["殺し屋のヒットだな！ 楽しみだぞ！", "…時飛ばしを破れるか。"],
  "vegeta|frieza": ["フリーザ… 今度こそ貴様を倒す！", "ベジータ… 猿の王子が。"],
  "piccolo|gohan": ["悟飯… 手加減はせんぞ！", "はい！ ピッコロさん！"],
  "goku|beerus": ["ビルス様… 本気でいくぞ！", "いいねえ… 退屈しのぎにはなりそうだ。"],
  "trunks|black": ["ブラック… 未来を壊したおまえを許さない！", "人間ごときがしつこいな。"],
  "krillin|frieza": ["フリーザ… あのときの借りは返すぜ！", "ホッホッホ、また死にたいのですか？"],
  "goku|cell": ["セル… オラが相手だ！", "孫悟空… 楽しませてもらおう。"],
};

/** [lineForA, lineForB] when a and b have history, else null. */
export function rivalLines(a, b) {
  const ka = baseOf(a);
  const kb = baseOf(b);
  if (RIVALS[`${ka}|${kb}`]) return RIVALS[`${ka}|${kb}`];
  if (RIVALS[`${kb}|${ka}`]) return [...RIVALS[`${kb}|${ka}`]].reverse();
  return null;
}

/* ------------------------------------------------------------------------------------------ numbers */
export function expectedBase(level) {
  const sum = 5 + 3 * (level - 1);
  return 5 * Math.pow(1.115, level - 1) * (1 + (sum - 5) / 15);
}

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
  const p = PROFILES[id] ?? { rec: 10, melee: 5, fly: false, atk: [] };
  return p;
}

/** Combat numbers for a character id. */
export function statsFor(id) {
  const prof = profileOf(id);
  const lv = prof.rec;
  const pl = expectedBase(lv) * expectedForm(lv) * (prof.plF ?? 1);
  const hp = Math.round((60 + lv * 9) * (prof.hpF ?? 1));
  const melee = Math.max(1, prof.melee) * (1 + lv * 0.02);
  return { pl, hp, melee, prof };
}

/** Everyone can fight in this addon: non-fighters get a basic ki shot so they can at least try. */
for (const [id, p] of Object.entries(PROFILES)) {
  if (!p.atk || !p.atk.length) p.atk = id === "training_dummy" ? [] : [B("yellow", Math.max(2, p.melee))];
  p.fly = p.fly || p.rec >= 15;
}
