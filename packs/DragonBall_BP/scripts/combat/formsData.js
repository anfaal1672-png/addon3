/* Transformation catalogue.
 * mult: power multiplier over base.  drain: fraction of max ki per second.
 * unlock: { level, forms: [...required forms], any: [{flag}|{train,min}] (one of) }.
 * vis: hair colour / style, aura, body overlay, spark, scale, model.
 */

/** @type {Record<string, any>} */
export const RACES = {
  saiyan: { name: "サイヤ人", desc: "戦闘力が伸びやすく、瀕死から回復するたびに強くなる。尻尾があり満月で大猿になる。", plMult: 1.0, kiCost: 1.0, regen: 0, growth: 1.15, color: "§6" },
  human: { name: "地球人", desc: "気のコントロールに優れ、気の消費が少ない。潜在能力解放と界王拳が得意。", plMult: 0.95, kiCost: 0.7, regen: 0, growth: 1.0, color: "§a" },
  namek: { name: "ナメック星人", desc: "体力が自然に回復し、腕を伸ばす攻撃と巨大化ができる。仲間を回復できる。", plMult: 1.0, kiCost: 0.9, regen: 1, growth: 1.0, color: "§2" },
  frieza: { name: "フリーザ一族", desc: "生まれつき強く、宇宙空間や水中でも平気。形態変化で力を解放する。", plMult: 1.3, kiCost: 1.0, regen: 0, growth: 0.95, color: "§d" },
  majin: { name: "魔人", desc: "体が再生し、相手をお菓子に変える光線が使える。吸収で力を取り込める。", plMult: 1.05, kiCost: 1.0, regen: 2, growth: 1.0, color: "§c" },
};

/** @type {Record<string, any>} */
export const FORMS = {
  // ------------------------------------------------------------------ Saiyan
  ssj: { name: "超サイヤ人", races: ["saiyan"], parent: null, mult: 50, drain: 0.004,
    unlock: { level: 25, any: [{ flag: "rage1" }] },
    hint: "レベル25以上で、強敵（ボス）との戦いで体力が2割を切るまで追い詰められると、怒りで覚醒する。",
    vis: { hair: "gold", style: "ssj", aura: "gold" }, speed: 1, resist: 0 },
  ssj2: { name: "超サイヤ人2", races: ["saiyan"], parent: "ssj", mult: 100, drain: 0.008,
    unlock: { level: 45, forms: ["ssj"], any: [{ flag: "rage2" }, { train: "ssjSec", min: 900 }] },
    hint: "レベル45以上。超サイヤ人で合計15分戦い慣れるか、レベル45以上で再び怒りが爆発すると覚醒。",
    vis: { hair: "pale_gold", style: "ssj2", aura: "gold_bright", spark: true }, speed: 1, resist: 1 },
  ssj3: { name: "超サイヤ人3", races: ["saiyan"], parent: "ssj2", mult: 400, drain: 0.03,
    unlock: { level: 60, forms: ["ssj2"], any: [{ train: "kaiSec", min: 600 }, { train: "htcSec", min: 900 }] },
    hint: "レベル60以上。界王星で10分、または精神と時の部屋で15分修行する。気の消費がとても激しい。",
    vis: { hair: "pale_gold", style: "ssj3", aura: "gold_bright", spark: true }, speed: 2, resist: 1 },
  ssj4: { name: "超サイヤ人4", races: ["saiyan"], parent: null, mult: 1200, drain: 0.012,
    unlock: { level: 100, forms: ["ssj"], any: [{ flag: "golden_oozaru" }] },
    hint: "レベル100以上で超サイヤ人を習得した状態で、尻尾があるまま満月を見て黄金大猿になり、元に戻る。",
    vis: { hair: "black", style: "ssj4", aura: "golden", body: "ssj4", tail: true }, speed: 2, resist: 2 },
  god: { name: "超サイヤ人ゴッド", races: ["saiyan"], parent: null, mult: 2000, drain: 0.006,
    unlock: { level: 90, any: [{ flag: "god_ritual" }, { flag: "beerus_ok" }] },
    hint: "レベル90以上。ビルスに実力を認めさせるか、神龍に「超サイヤ人ゴッドの儀式」を願う。",
    vis: { hair: "red", style: "base", aura: "red" }, speed: 2, resist: 2 },
  blue: { name: "超サイヤ人ブルー", races: ["saiyan"], parent: "god", mult: 5000, drain: 0.014,
    unlock: { level: 105, forms: ["god"], any: [{ flag: "whis_blue" }] },
    hint: "レベル105以上でゴッドを習得し、ビルスの星でウイスの修行を受ける。",
    vis: { hair: "cyan", style: "ssj", aura: "cyan" }, speed: 2, resist: 2 },
  ui_sign: { name: "身勝手の極意 兆", races: ["saiyan", "human"], parent: null, mult: 9000, drain: 0.016, dodge: 0.45,
    unlock: { level: 120, any: [{ flag: "jiren_rage" }, { flag: "whis_ui" }] },
    hint: "レベル120以上。ジレンとの戦いで限界まで追い詰められるか、ウイスの最終修行を受ける。",
    vis: { hair: "black", style: "base", aura: "silver" }, speed: 3, resist: 2 },
  ui: { name: "身勝手の極意", races: ["saiyan", "human"], parent: "ui_sign", mult: 15000, drain: 0.024, dodge: 0.8,
    unlock: { level: 135, forms: ["ui_sign"], any: [{ flag: "jiren_down" }] },
    hint: "レベル135以上で「兆」を習得し、ジレンを倒す。体が勝手に攻撃をよける。",
    vis: { hair: "silver", style: "base", aura: "silver" }, speed: 3, resist: 3 },
  ue: { name: "我儘の極意", races: ["saiyan"], parent: null, mult: 14000, drain: 0.02, rage: true,
    unlock: { level: 130, forms: ["god"], any: [{ flag: "beerus_ue" }] },
    hint: "レベル130以上でゴッドを習得し、ビルスの「破壊」の修行を受ける。攻撃を受けるほど強くなる。",
    vis: { hair: "purple", style: "vegeta", aura: "purple" }, speed: 2, resist: 3 },
  lssj: { name: "伝説の超サイヤ人", races: ["saiyan"], parent: null, mult: 800, drain: 0.007,
    unlock: { level: 70, any: [{ flag: "broly_down" }] },
    hint: "レベル70以上でブロリーを倒す。体が大きくなり、怒りにまかせた力を出せる。",
    vis: { hair: "green_gold", style: "lssj", aura: "green", body: "lssj", scale: 1.15 }, speed: 1, resist: 3 },
  // ------------------------------------------------------------------ all races
  pu1: { name: "潜在能力解放", races: ["saiyan", "human", "namek", "frieza", "majin"], parent: null, mult: 20, drain: 0.002, humanMult: 30,
    unlock: { level: 30, any: [{ flag: "guru" }] },
    hint: "レベル30以上で、ナメック星の最長老に潜在能力を引き出してもらう。",
    vis: { aura: "white_hot" }, speed: 1, resist: 0 },
  pu2: { name: "潜在能力解放・極", races: ["saiyan", "human", "namek", "frieza", "majin"], parent: "pu1", mult: 600, drain: 0.004, humanMult: 900,
    unlock: { level: 80, forms: ["pu1"], any: [{ flag: "elder_kai" }] },
    hint: "レベル80以上。Zソードを折ると現れる老界王神の儀式を受ける。",
    vis: { aura: "white_hot", spark: true }, speed: 2, resist: 1 },
  // ------------------------------------------------------------------ Namekian
  giant: { name: "巨大化", races: ["namek"], parent: null, mult: 5, drain: 0.01,
    unlock: { level: 15 }, hint: "レベル15で習得。",
    vis: { scale: 3.0 }, speed: 0, resist: 1, giant: true },
  orange: { name: "オレンジピッコロ", races: ["namek"], parent: null, mult: 4000, drain: 0.01,
    unlock: { level: 95, any: [{ flag: "orange_wish" }] },
    hint: "レベル95以上で、神龍に「ナメック星人の潜在能力を引き出してくれ」と願う。",
    vis: { body: "namek_orange", aura: "orange", scale: 1.1 }, speed: 2, resist: 3 },
  // ------------------------------------------------------------------ Frieza race
  f2: { name: "第二形態", races: ["frieza"], parent: null, mult: 3, drain: 0.0,
    unlock: { level: 10 }, hint: "レベル10で習得。", vis: { body: "frieza2", scale: 1.15 }, speed: 0, resist: 1 },
  f3: { name: "第三形態", races: ["frieza"], parent: "f2", mult: 8, drain: 0.0,
    unlock: { level: 25, forms: ["f2"] }, hint: "レベル25で習得。", vis: { body: "frieza3" }, speed: 1, resist: 1 },
  f4: { name: "最終形態", races: ["frieza"], parent: "f3", mult: 20, drain: 0.0,
    unlock: { level: 40, forms: ["f3"] }, hint: "レベル40で習得。", vis: { body: "frieza4", scale: 0.95 }, speed: 1, resist: 1 },
  f_full: { name: "フルパワー", races: ["frieza"], parent: "f4", mult: 40, drain: 0.006,
    unlock: { level: 55, forms: ["f4"] }, hint: "レベル55で習得。", vis: { body: "frieza4", aura: "violet", scale: 1.05, spark: true }, speed: 2, resist: 2 },
  golden: { name: "ゴールデンフリーザ", races: ["frieza"], parent: "f4", mult: 2400, drain: 0.012,
    unlock: { level: 95, forms: ["f4"], any: [{ train: "htcSec", min: 1200 }, { flag: "golden_frieza_down" }] },
    hint: "レベル95以上。精神と時の部屋で20分修行するか、ゴールデンフリーザを倒す。",
    vis: { body: "frieza_golden", aura: "golden" }, speed: 2, resist: 2 },
  black: { name: "ブラックフリーザ", races: ["frieza"], parent: "golden", mult: 14000, drain: 0.008,
    unlock: { level: 140, forms: ["golden"], any: [{ train: "htcSec", min: 3600 }] },
    hint: "レベル140以上でゴールデンを習得し、精神と時の部屋で合計60分修行する。",
    vis: { body: "frieza_black", aura: "dark" }, speed: 3, resist: 3 },
  // ------------------------------------------------------------------ Majin
  evil: { name: "悪の姿", races: ["majin"], parent: null, mult: 80, drain: 0.002,
    unlock: { level: 35 }, hint: "レベル35で習得。", vis: { body: "majin_super", aura: "pink" }, speed: 1, resist: 1 },
  pure: { name: "純粋な姿", races: ["majin"], parent: "evil", mult: 1500, drain: 0.008,
    unlock: { level: 70, forms: ["evil"] }, hint: "レベル70で習得。小さく、凶暴で、最も危険な姿。",
    vis: { body: "majin", aura: "pink", scale: 0.85, spark: true }, speed: 3, resist: 2 },
};

export const KAIOKEN_LEVELS = [0, 2, 3, 10, 20];
export const KAIOKEN_HP_DRAIN = [0, 0.004, 0.007, 0.018, 0.035]; // fraction of max hp per second

export const SPECIAL = {
  oozaru: { name: "大猿", mult: 10, scale: 3.2, model: 1 },
  golden_oozaru: { name: "黄金大猿", mult: 1500, scale: 3.4, model: 2 },
};

export function formsForRace(race) {
  return Object.entries(FORMS).filter(([, f]) => f.races.includes(race)).map(([id]) => id);
}

/** Ordered chain from the root of the given form's lineage down to the form. */
export function chainOf(id) {
  const out = [];
  let cur = id;
  while (cur) {
    out.unshift(cur);
    cur = FORMS[cur]?.parent ?? null;
  }
  return out;
}
