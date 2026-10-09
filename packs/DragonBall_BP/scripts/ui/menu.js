import { system, world, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";
import { getData, markDirty, rt, settings, saveSettings, resetData } from "../core/data.js";
import { basePL, powerOf, maxKi, expToNext, formName, applyPassives, statSum } from "../core/stats.js";
import { RACES, FORMS, formsForRace, chainOf, KAIOKEN_LEVELS } from "../combat/formsData.js";
import { TECHS, TECH_ORDER } from "../combat/techData.js";
import { learnHint, autoLearn } from "../combat/techniques.js";
import { refreshVisuals, checkUnlocks, defaultTarget, cutTail, revertForm } from "../combat/forms.js";
import { fmtPL, V, isValid } from "../core/util.js";
import { msg, psound, title, sound, particle } from "../core/fx.js";
import { on } from "../core/bus.js";
import { giveKit } from "../items/items.js";
import { storyMenu } from "../story/sagas.js";
import { allyEntities, callAlly, dismissAlly, NAME } from "../npc/masters.js";
import { SITES, getLayout, travelTo, landingSpot } from "../world/sites.js";
import { transmitTo } from "../combat/movement.js";
import { fighters } from "../npc/fighters.js";
import { CHARS } from "../gen/catalog.js";

async function show(p, form) {
  const r = rt(p);
  r.menuOpen = true;
  try {
    let res = await form.show(p);
    let tries = 0;
    while (res.canceled && res.cancelationReason === "UserBusy" && tries++ < 10) {
      await new Promise((ok) => system.runTimeout(() => ok(undefined), 10));
      res = await form.show(p);
    }
    return res;
  } finally {
    r.menuOpen = false;
  }
}

/* ===================================================================================== race selection */

const RACE_BONUS = { saiyan: { str: 2 }, human: { ki: 2 }, namek: { vit: 2 }, frieza: { def: 1, spd: 1 }, majin: { vit: 1, def: 1 } };

export async function raceMenu(p) {
  const ids = Object.keys(RACES);
  const f = new ActionFormData().title("§l§6種族を選ぼう").body("§fあなたの種族を選んでください。種族ごとに得意なこと、覚える変身や技が違います。\n§7（あとから神龍に願って変えることもできます）");
  for (const id of ids) f.button(`${RACES[id].color}§l${RACES[id].name}§r\n§8${RACES[id].desc.slice(0, 22)}…`);
  const r = await show(p, f);
  if (r.canceled || r.selection === undefined) {
    system.runTimeout(() => raceMenu(p), 60);
    return;
  }
  const id = ids[r.selection];
  const conf = new MessageFormData().title(`${RACES[id].name}`).body(`${RACES[id].desc}\n\nこの種族で始めますか？`).button1("決定").button2("選び直す");
  const c = await show(p, conf);
  if (c.canceled || c.selection !== 0) {
    raceMenu(p);
    return;
  }
  const d = getData(p);
  d.race = id;
  d.tail = id === "saiyan";
  for (const [k, v] of Object.entries(RACE_BONUS[id])) d.stats[k] += v;
  d.ki = maxKi(d);
  markDirty(p);
  giveKit(p);
  autoLearn(p);
  checkUnlocks(p, true);
  refreshVisuals(p);
  applyPassives(p);
  title(p, `${RACES[id].color}${RACES[id].name}`, "§fあなたの冒険が始まる！", 60);
  sound(p.dimension, "dbz.aura_burst", p.location, 1.5);
  particle(p.dimension, "dbz:pillar", p.location, "gold", 1);
  system.runTimeout(() => helpMenu(p, 0), 80);
}

/* ===================================================================================== main menu */

export async function mainMenu(p) {
  const d = getData(p);
  if (!d.race) return raceMenu(p);
  const r = rt(p);
  let hp = "?";
  try {
    const h = p.getComponent("minecraft:health");
    hp = `${Math.ceil(h.currentValue)}/${Math.ceil(h.effectiveMax)}`;
  } catch {
    // ignore
  }
  const f = new ActionFormData().title("§l§6ドラゴンメニュー").body(
    `${RACES[d.race].color}${RACES[d.race].name} §fLv.${d.level}  §7EXP ${Math.floor(d.exp)}/${expToNext(d.level)}\n` +
    `§6戦闘力 §e${fmtPL(powerOf(p))} §7（基本 ${fmtPL(basePL(d))}）\n§c体力 ${hp}  §b気 ${Math.floor(d.ki)}/${maxKi(d)}\n§d状態：${formName(p)}` +
    (d.points ? `\n§a振り分けられるポイント：${d.points}` : ""));
  /** @type {[string, () => any][]} */
  const items = [
    ["ステータス" + (d.points ? ` §a(+${d.points})` : ""), () => statusMenu(p)],
    ["技・技スロット", () => techMenu(p)],
    ["変身", () => formMenu(p)],
    ["ストーリー", () => storyMenu(p)],
    ["仲間", () => allyMenu(p)],
    ["瞬間移動・地点の登録", () => warpMenu(p)],
    ["修行の記録", () => recordMenu(p)],
    ["道具を受け取る", () => giveKit(p)],
    ["個人設定", () => personalMenu(p)],
    ["ワールド設定", () => worldMenu(p)],
    ["操作説明・遊び方", () => helpMenu(p, 0)],
  ];
  for (const [label] of items) f.button(label);
  const res = await show(p, f);
  if (res.canceled || res.selection === undefined) return;
  psound(p, "dbz.click");
  await items[res.selection][1]();
}

/* ===================================================================================== status */

const STAT_INFO = {
  str: ["力", "格闘のダメージが上がる"],
  ki: ["気", "気の最大量と気功技の威力が上がる"],
  vit: ["体力", "最大体力が上がる"],
  spd: ["スピード", "移動・飛行が速くなる"],
  def: ["防御", "受けるダメージが減る"],
};

async function statusMenu(p) {
  const d = getData(p);
  const f = new ModalFormData().title("§lステータス");
  const keys = Object.keys(STAT_INFO);
  const hp = (() => {
    try {
      return Math.ceil(p.getComponent("minecraft:health").effectiveMax);
    } catch {
      return 20;
    }
  })();
  const head = `§a振り分けポイント：${d.points}\n§7最大体力 ${hp} / 最大気 ${maxKi(d)} / 基本戦闘力 ${fmtPL(basePL(d))}`;
  keys.forEach((k, i) => {
    const [name, desc] = STAT_INFO[k];
    f.slider(`${i === 0 ? head + "\n\n" : ""}§e${name} §f${d.stats[k]} §7（${desc}）\n追加`, 0, Math.max(1, d.points), { valueStep: 1, defaultValue: 0 });
  });
  const r = await show(p, f);
  if (r.canceled || !r.formValues) return;
  let total = 0;
  const add = r.formValues.map((v) => Number(v) || 0);
  for (const v of add) total += v;
  if (total > d.points) {
    msg(p, `§cポイントが足りない！（${total}/${d.points}）`);
    return statusMenu(p);
  }
  keys.forEach((k, i) => (d.stats[k] += add[i]));
  d.points -= total;
  markDirty(p);
  applyPassives(p);
  if (total) {
    msg(p, `§aステータスを強化した！ 戦闘力 ${fmtPL(powerOf(p))}`);
    psound(p, "dbz.learn");
  }
}

/* ===================================================================================== techniques */

async function techMenu(p) {
  const d = getData(p);
  const f = new ActionFormData().title("§l技").body(`§7技を選ぶとスロットにセットできる。\n§f現在：${d.slots.map((id, i) => `${"ABCD"[i]}:${id ? TECHS[id].name : "なし"}`).join(" / ")}`);
  const learned = TECH_ORDER.filter((id) => d.techs.includes(id));
  for (const id of learned) {
    const t = TECHS[id];
    const slot = d.slots.indexOf(id);
    f.button(`§l${t.name}${slot >= 0 ? ` §r§2[${"ABCD"[slot]}]` : ""}\n§r§8気${t.cost}${t.charge ? ` 溜め${(t.charge / 20).toFixed(1)}秒` : ""}`);
  }
  f.button("§7まだ覚えていない技を見る");
  const r = await show(p, f);
  if (r.canceled || r.selection === undefined) return;
  if (r.selection === learned.length) return unlearnedMenu(p);
  const id = learned[r.selection];
  const t = TECHS[id];
  const g = new ActionFormData().title(t.name).body(`§f${t.desc}\n\n§7消費気：${t.cost}  威力：${t.power ?? "-"}  溜め：${t.charge ? (t.charge / 20).toFixed(1) + "秒" : "なし"}\n\nどのスロットにセットする？`);
  for (let i = 0; i < 4; i++) g.button(`技スロット${"ABCD"[i]}（${d.slots[i] ? TECHS[d.slots[i]].name : "空き"}）`);
  g.button("スロットから外す");
  const s = await show(p, g);
  if (s.canceled || s.selection === undefined) return;
  if (s.selection === 4) {
    d.slots = d.slots.map((x) => (x === id ? null : x));
  } else {
    d.slots = d.slots.map((x) => (x === id ? null : x));
    d.slots[s.selection] = id;
  }
  markDirty(p);
  psound(p, "dbz.click");
  return techMenu(p);
}

async function unlearnedMenu(p) {
  const d = getData(p);
  const rest = TECH_ORDER.filter((id) => !d.techs.includes(id));
  let body = "";
  for (const id of rest) body += `§e${TECHS[id].name}§r\n §7${learnHint(id)}\n`;
  const f = new ActionFormData().title("まだ覚えていない技").body(body || "§aすべての技を覚えた！").button("戻る");
  await show(p, f);
  return techMenu(p);
}

/* ===================================================================================== forms */

async function formMenu(p) {
  const d = getData(p);
  const r = rt(p);
  const ids = formsForRace(d.race);
  const target = d.target && d.forms.includes(d.target) ? d.target : defaultTarget(d);
  let body = `§f変身アイテムを使うたびに、目標の変身まで1段階ずつ変身する（しゃがみ+使用で解除）。\n§7現在の目標：§e${target ? FORMS[target].name : "なし"}\n§7界王拳：技「界王拳」で倍率アップ（${KAIOKEN_LEVELS.slice(1).join("/")}倍）\n`;
  const f = new ActionFormData().title("§l変身");
  const choices = [];
  for (const id of ids) {
    const fm = FORMS[id];
    const has = d.forms.includes(id);
    const mult = d.race === "human" && fm.humanMult ? fm.humanMult : fm.mult;
    if (has) {
      f.button(`§l§6${fm.name}§r ${id === target ? "§a[目標]" : ""}\n§8x${mult} 消費${(fm.drain * 100).toFixed(1)}%/秒`);
      choices.push(id);
    } else {
      body += `\n§8✖ ${fm.name}§7：${fm.hint}`;
    }
  }
  if (d.race === "saiyan") {
    body += `\n\n§6大猿：尻尾があるサイヤ人が満月（夜・満月の日）を見上げると変身。§7尻尾：${d.tail ? "あり" : "なし"}`;
    f.button(d.tail ? "§c尻尾を切る" : "§7（尻尾は神龍に願うと生える）");
    choices.push("__tail");
  }
  f.body(body);
  const res = await show(p, f);
  if (res.canceled || res.selection === undefined) return;
  const pick = choices[res.selection];
  if (pick === "__tail") {
    if (d.tail) {
      const c = await show(p, new MessageFormData().title("尻尾を切る").body("本当に尻尾を切りますか？ 大猿になれなくなります。").button1("切る").button2("やめる"));
      if (!c.canceled && c.selection === 0 && cutTail(p)) {
        msg(p, "§7尻尾を切った。");
        try {
          p.dimension.spawnItem(new ItemStack("dbz:saiyan_tail", 1), p.location);
        } catch {
          // ignore
        }
      }
    }
    return;
  }
  d.target = pick;
  markDirty(p);
  msg(p, `§a変身の目標を「${FORMS[pick].name}」にした。§7（${chainOf(pick).filter((x) => d.forms.includes(x)).map((x) => FORMS[x].name).join(" → ")}）`);
}

/* ===================================================================================== allies */

async function allyMenu(p) {
  const d = getData(p);
  const ids = Object.keys(d.allies);
  if (!ids.length) {
    await show(p, new ActionFormData().title("仲間").body("§7まだ仲間がいない。\n悟空やピッコロたち（各地の名所にいる）と手合わせで勝つと、仲間にできる。").button("閉じる"));
    return;
  }
  const near = new Set(allyEntities(p).map((s) => s.cid.replace(/_(ssj3|ssj2|ssj|god|blue|ui|ue)$/, "")));
  const f = new ActionFormData().title("§l仲間").body("§7仲間は一緒に飛び、敵と戦い、ピンチの時は仙豆で助けてくれる（最大3人）。");
  for (const id of ids) {
    const a = d.allies[id];
    const st = a.dead ? "§c倒れている（ドラゴンボールで復活）" : near.has(id) ? "§a同行中" : "§7待機中";
    f.button(`§l${NAME(id)}§r\n${st}`);
  }
  const r = await show(p, f);
  if (r.canceled || r.selection === undefined) return;
  const id = ids[r.selection];
  const a = d.allies[id];
  if (a.dead) {
    msg(p, `§7${NAME(id)}は倒れている。神龍に「仲間を生き返らせてくれ」と願おう。`);
    return;
  }
  if (near.has(id)) dismissAlly(p, id);
  else callAlly(p, id);
}

/* ===================================================================================== warp / instant transmission */

async function warpMenu(p) {
  const d = getData(p);
  const f = new ActionFormData().title("§l地点の登録").body(`§7登録した地点や、気を感じる相手のところへは「瞬間移動」で行ける。\n登録数：${d.tp.length}/10`);
  f.button("今いる場所を登録する");
  for (const t of d.tp) f.button(`§c削除：§f${t.name}`);
  if (d.techs.includes("instant_transmission")) f.button("§b瞬間移動する");
  const r = await show(p, f);
  if (r.canceled || r.selection === undefined) return;
  if (r.selection === 0) {
    if (d.tp.length >= 10) {
      msg(p, "§7これ以上登録できない。");
      return;
    }
    const form = new ModalFormData().title("地点の名前").textField("名前", "例：家", { defaultValue: `地点${d.tp.length + 1}` });
    const n = await show(p, form);
    if (n.canceled || !n.formValues) return;
    const loc = p.location;
    d.tp.push({ name: String(n.formValues[0] || `地点${d.tp.length + 1}`), dim: p.dimension.id, x: loc.x, y: loc.y, z: loc.z });
    markDirty(p);
    msg(p, "§a地点を登録した。");
    return;
  }
  if (r.selection <= d.tp.length) {
    d.tp.splice(r.selection - 1, 1);
    markDirty(p);
    return;
  }
  return transmissionMenu(p);
}

export async function transmissionMenu(p) {
  const d = getData(p);
  const targets = [];
  for (const s of fighters.values()) {
    if (!isValid(s.e)) continue;
    if (s.role === "npc" || (s.role === "ally" && s.owner === p.id)) {
      targets.push({ label: `§a${CHARS[s.e.getProperty("dbz:char")]?.name ?? s.cid} §7の気`, loc: s.e.location, dim: s.e.dimension });
    }
  }
  for (const o of world.getAllPlayers()) {
    if (o.id !== p.id) targets.push({ label: `§b${o.name} §7の気`, loc: o.location, dim: o.dimension });
  }
  for (const t of d.tp) targets.push({ label: `§e${t.name}`, loc: { x: t.x, y: t.y, z: t.z }, dim: world.getDimension(t.dim) });
  const L = getLayout();
  for (const [id, def] of Object.entries(SITES)) {
    if (!L[id]?.built) continue;
    if (def.planet && !d.visited[id]) continue;
    targets.push({ label: `§6${def.name}`, site: id });
  }
  const f = new ActionFormData().title("§b瞬間移動").body("§7額に指を当てて、気を探る…");
  for (const t of targets.slice(0, 40)) f.button(t.label);
  const r = await show(p, f);
  if (r.canceled || r.selection === undefined) return;
  const t = targets[r.selection];
  if (t.site) {
    if (SITES[t.site].planet) {
      transmitTo(p, landingSpot(t.site), world.getDimension("minecraft:overworld"));
    } else {
      const pos = L[t.site];
      transmitTo(p, { x: pos.x + 0.5, y: (pos.y ?? 80) + 1, z: pos.z - 6.5 }, world.getDimension("minecraft:overworld"));
    }
    return;
  }
  const dest = V.add(t.loc, { x: 1.2, y: 0.1, z: 1.2 });
  transmitTo(p, dest, t.dim, V.up(t.loc, 1));
}

on("openTransmission", (p) => transmissionMenu(p));

/* ===================================================================================== records */

async function recordMenu(p) {
  const d = getData(p);
  const t = d.train;
  const body = [
    `§eレベル ${d.level}  §7ステータス合計 ${statSum(d)}`,
    `§f覚えた技：${d.techs.length}/${TECH_ORDER.length}  変身：${d.forms.length}`,
    `§f倒したボス：${d.bosses.length}  倒した敵：${d.kills}`,
    `§f天下一武道会 優勝：${d.tournament}回  サイヤ人パワーアップ：${d.zenkai}回`,
    "",
    `§b修行の記録`,
    `§7重力室の最高重力：${t.gravityBest}倍`,
    `§7精神と時の部屋：${Math.floor(t.htcSec / 60)}分（外の世界の約${Math.floor(t.htcSec / 60) * 6}日）`,
    `§7界王星での修行：${Math.floor(t.kaiSec / 60)}分`,
    `§7瞑想：${Math.floor(t.meditateSec / 60)}分`,
    `§7超サイヤ人での戦闘：${Math.floor(t.ssjSec / 60)}分`,
    `§7サンドバッグを殴った回数：${t.dummyHits}`,
    `§7高速飛行の距離：約${Math.floor(t.runDist)}ブロック`,
    "",
    `§d不老不死：${d.immortal ? "はい" : "いいえ"}  §6潜在能力解放：${d.quests.guru ? (d.quests.elder_kai ? "極" : "済") : "まだ"}`,
  ].join("\n");
  await show(p, new ActionFormData().title("§l修行の記録").body(body).button("閉じる"));
}

/* ===================================================================================== settings */

async function personalMenu(p) {
  const d = getData(p);
  const styles = ["goku", "vegeta", "gohan", "trunks"];
  const styleNames = ["悟空タイプ", "ベジータタイプ", "悟飯タイプ", "トランクスタイプ"];
  const huds = ["full", "compact", "off"];
  const f = new ModalFormData().title("§l個人設定")
    .dropdown("画面表示（HUD）", ["くわしく", "かんたん", "表示しない"], { defaultValueIndex: Math.max(0, huds.indexOf(d.hud)) })
    .dropdown("髪型（超サイヤ人などの時）", styleNames, { defaultValueIndex: Math.max(0, styles.indexOf(d.hairStyle)) })
    .toggle("ふだんもサイヤ人の黒髪を表示する", { defaultValue: !!d.showBaseHair })
    .toggle("種族の見た目を表示する（ナメック星人・フリーザ一族・魔人）", { defaultValue: d.showRace !== false })
    .toggle("変身中はずっとオーラを出す", { defaultValue: d.alwaysAura !== false });
  const r = await show(p, f);
  if (r.canceled || !r.formValues) return;
  const v = r.formValues;
  d.hud = huds[Number(v[0])];
  d.hairStyle = styles[Number(v[1])];
  d.showBaseHair = !!v[2];
  d.showRace = !!v[3];
  d.alwaysAura = !!v[4];
  markDirty(p);
  refreshVisuals(p);
}

function canAdmin(p) {
  try {
    return world.getAllPlayers().length === 1 || p.commandPermissionLevel >= 1;
  } catch {
    return true;
  }
}

async function worldMenu(p) {
  if (!canAdmin(p)) {
    msg(p, "§7ワールド設定はオペレーターだけが変更できる。");
    return;
  }
  const s = settings();
  const f = new ModalFormData().title("§lワールド設定")
    .slider("難易度（敵の強さ） x0.1", 5, 30, { valueStep: 1, defaultValue: Math.round(s.difficulty * 10) })
    .toggle("地形破壊（気功波や爆発で地面がえぐれる）", { defaultValue: s.terrain })
    .slider("気の消費量 x0.1", 3, 30, { valueStep: 1, defaultValue: Math.round(s.kiCost * 10) })
    .slider("成長スピード（経験値） x0.1", 5, 50, { valueStep: 1, defaultValue: Math.round(s.growth * 10) })
    .toggle("PvP（プレイヤー同士の攻撃）", { defaultValue: s.pvp })
    .slider("敵の出現頻度 x0.1（0で出ない）", 0, 30, { valueStep: 1, defaultValue: Math.round(s.spawnRate * 10) })
    .slider("ドラゴンボールが石になる日数", 1, 14, { valueStep: 1, defaultValue: s.dbDays })
    .toggle("名所の建物を自動で作る", { defaultValue: s.structures });
  const r = await show(p, f);
  if (r.canceled || !r.formValues) return;
  const v = r.formValues.map((x) => (typeof x === "number" ? x : x ? 1 : 0));
  s.difficulty = v[0] / 10;
  s.terrain = !!r.formValues[1];
  s.kiCost = v[2] / 10;
  s.growth = v[3] / 10;
  s.pvp = !!r.formValues[4];
  s.spawnRate = v[5] / 10;
  s.dbDays = v[6];
  s.structures = !!r.formValues[7];
  saveSettings();
  msg(p, "§aワールド設定を保存した。");
}

/* ===================================================================================== help */

/** @type {[string, string[]][]} */
const HELP = [
  ["操作のきほん", [
    "§e1：気溜め§f … 長押しで気を溜める（しゃがみながら使うと「気を消す」切り替え）",
    "§e2〜5：技スロットA〜D§f … 押すと技。気功波は長押しで溜めて、離すと発射",
    "§e6：変身§f … 押すたびに1段階変身。しゃがみ+使用で解除",
    "§e7：ガード§f … 長押しでガード。攻撃を受ける直前に押すとジャストガード（相手の背後に回り込む）",
    "§e8：ドラゴンメニュー§f … ステータス・技・変身・ストーリーなど",
    "§7※アイテムを無くしたらメニューの「道具を受け取る」か /dbz:dbkit",
  ]],
  ["移動", [
    "§e舞空術§f … 空中でもう一度ジャンプ。ジャンプで上昇、しゃがみで下降、ダッシュで高速飛行",
    "§e着地§f … 地面でしゃがむか、しばらく地面に立つ",
    "§e高速移動（残像）§f … しゃがみを素早く2回",
    "§e追撃§f … コンボのフィニッシュ直後にしゃがみ2回で相手の背後へ",
    "§e瞬間移動§f … 悟空に教わる技。登録した地点や仲間の気のところへ一瞬で移動",
    "§e筋斗雲§f … 「筋斗雲を呼ぶ」アイテムで呼べる（心が清くないと乗れない）",
  ]],
  ["戦い方", [
    "§f素手で殴り続けるとコンボになり、5発目がフィニッシュ（大きく吹き飛ばす）",
    "§f吹き飛んだ相手が壁にぶつかると「めり込む」",
    "§fかめはめ波などのビーム同士がぶつかると押し合いになる。§eジャンプ連打§fで押し勝て！",
    "§f気が無くなると技も飛行も使えない。気溜めや瞑想（しゃがんでじっとする）で回復",
    "§f強い相手（戦闘力が高い）ほどダメージが通りにくい。修行してレベルを上げよう",
  ]],
  ["成長と修行", [
    "§f敵を倒す・技を使う・修行で経験値。レベルが上がるとポイントを振り分けられる",
    "§e重力室§f（カプセルコーポ／カプセル）… 重いほど経験値アップ",
    "§e精神と時の部屋§f（神様の神殿）… 経験値3倍",
    "§e界王星§f … 重力10倍、経験値2倍。界王様の修行で界王拳と元気玉",
    "§e重りの道着・亀の甲羅・ピッコロのマント§f … 動きは遅いが経験値アップ",
    "§eサンドバッグ§f … 殴ると経験値（作業台で作れる）",
  ]],
  ["世界と名所", [
    "§f世界の始まりの場所の周りに名所がある：パオズ山、カメハウス、カプセルコーポ、カリン塔、天下一武道会、レッドリボン軍基地、セルゲーム会場",
    "§f近づくと建物が現れる。各地の師匠に話しかけて技を教わろう",
    "§fブルマに宇宙船カプセルをもらうと、ナメック星・界王星・ビルスの星・力の大会会場へ行ける",
    "§fストーリーはメニューの「ストーリー」から。ラディッツからジレンまで",
  ]],
  ["ドラゴンボール", [
    "§fブルマにドラゴンレーダーをもらおう。持っていると一番近いボールの方向が出る",
    "§f7つ集めて近くに並べ、ボールを使うと神龍が現れ願いを叶えてくれる",
    "§fナメック星のボールはポルンガ（願い3つ）、超ドラゴンボールは超神龍",
    "§f願いを叶えたボールは世界中に飛び散り、しばらく石になる",
  ]],
];

export async function helpMenu(p, page) {
  const [head, lines] = HELP[page];
  const f = new ActionFormData().title(`§l遊び方（${page + 1}/${HELP.length}）${head}`).body(lines.join("\n\n"));
  if (page < HELP.length - 1) f.button("次へ");
  if (page > 0) f.button("前へ");
  f.button("閉じる");
  const r = await show(p, f);
  if (r.canceled || r.selection === undefined) return;
  const next = page < HELP.length - 1;
  if (next && r.selection === 0) return helpMenu(p, page + 1);
  if (page > 0 && r.selection === (next ? 1 : 0)) return helpMenu(p, page - 1);
}

export { revertForm };
