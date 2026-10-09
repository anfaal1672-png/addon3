import { system, world, ItemStack, EntityComponentTypes, EquipmentSlot } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { CHARS, CHAR_INDEX } from "../gen/catalog.js";
import { getData, markDirty, rt } from "../core/data.js";
import { addExp, maxKi, powerOf } from "../core/stats.js";
import { V, isValid, fmtPL, randInt } from "../core/util.js";
import { particle, sound, title, msg, say, psound } from "../core/fx.js";
import { on, emit } from "../core/bus.js";
import { fighters, setRole, spawnFighter, setupFighter, setChar, hpFrac } from "./fighters.js";
import { statsFor } from "./chars.js";
import { learnTech } from "../combat/techniques.js";
import { TECHS } from "../combat/techData.js";
import { grantFlag, setPose, doTransform } from "../combat/forms.js";
import { setFighterPL, hasFamily } from "../combat/damage.js";
import { getLayout } from "../world/sites.js";

const NAME = (cid) => CHARS[CHAR_INDEX[cid]]?.name ?? cid;
const BASE = (cid) => cid.replace(/_(ssj3|ssj2|ssj|god|blue|ui|ue|orange|lssj|rose)$/, "").replace(/^goku_black$/, "goku_black");

function give(p, id, n = 1) {
  try {
    const inv = p.getComponent(EntityComponentTypes.Inventory).container;
    const left = inv.addItem(new ItemStack(id, n));
    if (left) p.dimension.spawnItem(left, p.location);
  } catch {
    // ignore
  }
}

function hasItem(p, id) {
  try {
    const inv = p.getComponent(EntityComponentTypes.Inventory).container;
    for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.typeId === id) return true;
  } catch {
    // ignore
  }
  return false;
}

function wearing(p, id) {
  try {
    const eq = p.getComponent(EntityComponentTypes.Equippable);
    return [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet].some((s) => eq.getEquipment(s)?.typeId === id);
  } catch {
    return false;
  }
}

/* ===================================================================================== spar */

export function startSpar(p, e, cid) {
  const d = getData(p);
  const s = fighters.get(e.id);
  if (!s) return;
  const st = statsFor(BASE(cid));
  const lvl = Math.max(st.prof.rec, Math.min(d.level, st.prof.rec + 8));
  setupFighter(e, s.cid, { role: "spar", level: lvl, home: s.home, sparWith: p.id, noForms: true });
  const ns = fighters.get(e.id);
  if (ns) {
    ns.sparWith = p.id;
    ns.home = s.home;
  }
  e.addTag(`spar_${p.id}`);
  rt(p).inSpar = e.id;
  title(p, "§e手合わせ開始！", `§f${NAME(cid)}の体力を2割まで減らせば勝ち`, 50);
  sound(p.dimension, "dbz.boss", p.location, 1.2, 1.3);
}

function endSpar(e, p, won) {
  const s = fighters.get(e.id);
  if (!s) return;
  const cid = BASE(s.cid);
  s.sparWith = null;
  try {
    e.removeTag(`spar_${p.id}`);
  } catch {
    // ignore
  }
  setRole(e, "npc");
  setChar(e, cid, true);
  rt(p).inSpar = null;
  if (won) {
    const d = getData(p);
    d.quests[`spar_${cid}`] = true;
    markDirty(p);
    title(p, "§a手合わせに勝った！", `§f${NAME(cid)}「やるじゃないか…！」`, 50);
    addExp(p, 80 + statsFor(cid).prof.rec * 12);
    sound(p.dimension, "dbz.levelup", p.location, 1);
    sparRewards(p, cid);
  } else {
    title(p, "§c手合わせに負けた…", `§f${NAME(cid)}「まだまだだな」`, 50);
    try {
      const h = p.getComponent("minecraft:health");
      h.setCurrentValue(Math.max(h.currentValue, h.effectiveMax * 0.5));
    } catch {
      // ignore
    }
    addExp(p, 20);
  }
}

on("damaged", (target, attacker) => {
  if (target?.typeId !== "dbz:fighter") return;
  const s = fighters.get(target.id);
  if (!s || !s.sparWith || s.tournament) return;
  if (hpFrac(target) < 0.2) {
    const p = world.getEntity(s.sparWith);
    if (p) endSpar(target, p, true);
  }
});

on("sparLost", (p) => {
  const id = rt(p).inSpar;
  if (!id) return;
  const e = world.getEntity(id);
  if (e) endSpar(e, p, false);
  else rt(p).inSpar = null;
});

// vanilla melee hits on spar opponents do not pass through the "damaged" bus, so watch health too
system.runInterval(() => {
  for (const s of fighters.values()) {
    if (!s.sparWith || !isValid(s.e) || s.tournament) continue;
    if (hpFrac(s.e) < 0.2) {
      const p = world.getEntity(s.sparWith);
      if (p) endSpar(s.e, p, true);
    } else {
      const p = world.getEntity(s.sparWith);
      if (!p || V.dist(p.location, s.e.location) > 60) {
        s.sparWith = null;
        setRole(s.e, "npc");
        setChar(s.e, BASE(s.cid), true);
      }
    }
  }
}, 10);

function sparRewards(p, cid) {
  const d = getData(p);
  switch (cid) {
    case "krillin":
      learnTech(p, "kienzan");
      break;
    case "yamcha":
      learnTech(p, "sokidan");
      break;
    case "tien":
      learnTech(p, "taiyoken");
      learnTech(p, "dodonpa");
      break;
    case "piccolo":
      learnTech(p, "makankosappo");
      if (!d.quests.got_piccolo_gear) {
        d.quests.got_piccolo_gear = true;
        give(p, "dbz:piccolo_turban");
        give(p, "dbz:piccolo_cape");
        say(p, "ピッコロ", "この重いマントとターバンをつけて修行しろ。");
      }
      break;
    case "gohan":
      learnTech(p, "masenko");
      break;
    case "vegeta":
      learnTech(p, "galick_gun");
      if (!d.quests.got_saiyan_armor) {
        d.quests.got_saiyan_armor = true;
        give(p, "dbz:saiyan_top");
        give(p, "dbz:saiyan_pants");
        give(p, "dbz:saiyan_boots");
        say(p, "ベジータ", "フン… その戦闘服をくれてやる。せいぜい役に立てるんだな。");
      }
      break;
    case "roshi":
      if (d.techs.includes("kamehameha") && d.level >= 35) learnTech(p, "super_kamehameha");
      break;
    case "beerus":
      if (grantFlag(p, "beerus_ok")) say(p, "ビルス", "ふーん… 君、なかなかやるじゃないか。気に入ったよ。");
      if (d.level >= 130 && d.forms.includes("god") && grantFlag(p, "beerus_ue")) say(p, "ビルス", "破壊の心を少しだけ教えてあげよう。");
      break;
    case "goku":
      say(p, "悟空", "オラ、ワクワクすっぞ！ またやろうな！");
      break;
    default:
      break;
  }
}

/* ===================================================================================== allies */

const MAX_ALLIES = 3;

export function recruit(p, e, cid) {
  const d = getData(p);
  const active = Object.values(d.allies).filter((a) => /** @type {any} */ (a).active).length;
  if (active >= MAX_ALLIES) {
    msg(p, `§7一緒に連れて行ける仲間は${MAX_ALLIES}人までだ。仲間メニューで誰かを帰そう。`);
    return;
  }
  d.allies[cid] = { recruited: true, active: true, dead: false };
  markDirty(p);
  setupFighter(e, cid, { role: "ally", owner: p, level: d.level, home: null });
  try {
    e.removeTag(`site_${siteTagOf(e)}`);
  } catch {
    // ignore
  }
  for (const t of e.getTags()) if (t.startsWith("site_")) e.removeTag(t);
  e.addTag(`ally_${p.id}`);
  setFighterPL(e, powerOf(p) * 0.8);
  title(p, `§a${NAME(cid)}が仲間になった！`, "§7一緒に戦ってくれる", 50);
  psound(p, "dbz.learn");
}

function siteTagOf(e) {
  const t = e.getTags().find((x) => x.startsWith("site_"));
  return t ? t.slice(5) : "";
}

export function allyEntities(p) {
  const out = [];
  for (const s of fighters.values()) {
    if (s.role === "ally" && s.owner === p.id && isValid(s.e)) out.push(s);
  }
  return out;
}

export function callAlly(p, cid) {
  const d = getData(p);
  const a = d.allies[cid];
  if (!a || a.dead) return;
  if (allyEntities(p).some((s) => BASE(s.cid) === cid)) {
    msg(p, `§7${NAME(cid)}はもう近くにいる。`);
    return;
  }
  const active = allyEntities(p).length;
  if (active >= MAX_ALLIES) {
    msg(p, `§7一緒に連れて行ける仲間は${MAX_ALLIES}人までだ。`);
    return;
  }
  const loc = V.add(p.location, { x: randInt(-2, 2), y: 0.5, z: randInt(-2, 2) });
  const e = spawnFighter(cid, p.dimension, loc, { role: "ally", owner: p, level: d.level, tag: `ally_${p.id}` });
  if (e) {
    setFighterPL(e, powerOf(p) * 0.8);
    a.active = true;
    markDirty(p);
    particle(p.dimension, "dbz:pillar", loc, "white", 1);
    sound(p.dimension, "dbz.teleport", loc, 1);
    say(p, NAME(cid), "呼んだか？ 一緒に行くぜ！");
  }
}

export function dismissAlly(p, cid) {
  const d = getData(p);
  for (const s of allyEntities(p)) {
    if (BASE(s.cid) === cid) {
      particle(s.e.dimension, "dbz:pillar", s.e.location, "white", 1);
      try {
        s.e.remove();
      } catch {
        // ignore
      }
    }
  }
  if (d.allies[cid]) d.allies[cid].active = false;
  markDirty(p);
}

world.afterEvents.entityDie.subscribe((ev) => {
  const e = ev.deadEntity;
  if (e.typeId !== "dbz:fighter") return;
  let role;
  let owner;
  let cid;
  try {
    role = e.getDynamicProperty("dbz:role");
    owner = e.getDynamicProperty("dbz:owner");
    cid = e.getDynamicProperty("dbz:cid");
  } catch {
    return;
  }
  if (role !== "ally" || typeof owner !== "string" || typeof cid !== "string") return;
  const p = world.getEntity(owner);
  if (!p || p.typeId !== "minecraft:player") return;
  const d = getData(p);
  const base = BASE(cid);
  d.allies[base] = Object.assign(d.allies[base] ?? {}, { dead: true, active: false });
  markDirty(p);
  title(p, `§c${NAME(base)}がやられた…！`, "§7ドラゴンボールで生き返らせることができる", 60);
  // Krillin moment
  if ((base === "krillin" || base === "gohan") && d.race === "saiyan" && d.level >= 25 && !d.forms.includes("ssj")) {
    if (grantFlag(p, "rage1")) {
      system.runTimeout(() => {
        title(p, "§c§lよくも…よくも" + NAME(base) + "をーーっ！！", "§e怒りで眠っていた力が目覚めた", 70);
        doTransform(p, "ssj", true);
      }, 40);
    }
  }
});

on("alliesRevived", (p) => {
  const d = getData(p);
  for (const a of Object.values(d.allies)) /** @type {any} */ (a).active = false;
});

/* ===================================================================================== dialogue */

world.afterEvents.playerInteractWithEntity.subscribe((ev) => {
  const e = ev.target;
  if (e.typeId !== "dbz:fighter") return;
  const s = fighters.get(e.id);
  if (!s) return;
  const p = ev.player;
  const d = getData(p);
  if (!d.race) {
    msg(p, "§7まず種族を選ぼう（ドラゴンメニュー）。");
    return;
  }
  if (s.role === "ally" && s.owner === p.id) {
    allyMenu(p, s);
    return;
  }
  if (s.role !== "npc") return;
  talk(p, e, BASE(s.cid));
});

async function allyMenu(p, s) {
  const cid = BASE(s.cid);
  const f = new ActionFormData().title(NAME(cid)).body(`§f戦闘力：${fmtPL(powerOf(p) * 0.8)}\n§7一緒に戦ってくれている仲間。`);
  f.button("ついてきてくれ");
  f.button("家に帰ってくれ");
  if (cid === "goku" || cid === "vegeta") f.button("フュージョンしよう（ダンス）");
  if (cid === "goku" || cid === "vegeta") f.button("ポタラで合体しよう");
  const r = await f.show(p);
  if (r.canceled) return;
  if (r.selection === 1) dismissAlly(p, cid);
  if (r.selection === 2) emit("fusionRequest", p, s.e, "dance");
  if (r.selection === 3) emit("fusionRequest", p, s.e, "potara");
}

const LINES = {
  goku: ["よっ！ オラ悟空！ 強えヤツと戦うのが大好きなんだ！", "腹減ったなぁ…"],
  gohan: ["お父さんみたいに強くなりたいんです。", "勉強も修行も大事ですよ！"],
  goten: ["ねえねえ、一緒に遊ぼうよ！"],
  vegeta: ["カカロットの次は貴様か… 相手になってやる。", "サイヤ人の王子をなめるなよ。"],
  trunks: ["未来から来ました。人造人間の恐ろしさを知っています…"],
  piccolo: ["修行の邪魔だ… いや、鍛えてほしいのか？"],
  krillin: ["気円斬は当てれば何でも切れるんだぜ！"],
  tien: ["太陽拳は目くらましに便利だぞ。"],
  yamcha: ["繰気弾は俺のオリジナル技さ！"],
  roshi: ["ほっほっほ、わしが武天老師じゃ。", "よく動き、よく学び、よく遊び、よく食べて、よく休む。これが亀仙流の修行じゃ。"],
  bulma: ["私はブルマ！ 天才科学者よ！"],
  karin: ["わしはカリン。この塔を登ってくるとは大したもんじゃ。"],
  yajirobe: ["仙豆はやらんぞ… いや、少しならいいか。"],
  kaio: ["わしが北の界王じゃ！ 面白いダジャレを言ったら修行をつけてやろう… なんてな！"],
  guru: ["よく来ましたね… あなたの中に眠っている力を感じます。"],
  namekian: ["ナメック星へようこそ。", "最長老様は岩山の上におられます。"],
  announcer: ["天下一武道会へようこそ！ 出場しますか？"],
  whis: ["おやおや、修行をご希望ですか？", "ビルス様はお昼寝中です。"],
  beerus: ["ふわぁ… 僕を起こしたのは君？ 破壊しちゃうよ？"],
  elder_kai: ["わしは15代前の界王神じゃ。Zソードを折ったのはお前さんか？"],
};

async function talk(p, e, cid) {
  const d = getData(p);
  const lines = LINES[cid] ?? ["……"];
  const opts = [];
  const add = (label, fn) => opts.push({ label, fn });
  const body = [`§f「${lines[randInt(0, lines.length - 1)]}」`];
  const lv = d.level;
  const sparOk = !["bulma", "kaio", "guru", "namekian", "announcer", "whis", "elder_kai", "karin", "yajirobe", "bubbles", "gregory"].includes(cid);

  switch (cid) {
    case "roshi": {
      if (!d.quests.roshi_met) {
        add("§e弟子にしてください！", () => {
          d.quests.roshi_met = true;
          give(p, "dbz:kame_top");
          give(p, "dbz:kame_pants");
          give(p, "dbz:kame_boots");
          give(p, "dbz:turtle_shell");
          say(p, "亀仙人", "よかろう！ まずはその甲羅を背負って（胸に装備）、500ブロック走ってくるのじゃ！ 道着もやろう。");
        });
      } else if (!d.techs.includes("kamehameha")) {
        const dist = Math.floor(d.quests.shellDist ?? 0);
        body.push(`§7甲羅を背負って走った距離：${dist}/500`);
        add("§e修行の成果を見てください", () => {
          if (dist >= 500) {
            say(p, "亀仙人", "よくやった！ では亀仙流の奥義、かめはめ波を教えよう！ かー… めー… はー… めー… 波ーっ！！");
            learnTech(p, "kamehameha");
          } else say(p, "亀仙人", `まだまだじゃ！ あと${500 - dist}ブロック走ってこい！`);
        });
      } else if (lv >= 35 && !d.techs.includes("super_kamehameha")) {
        body.push("§7超かめはめ波：亀仙人との手合わせに勝つと教わる");
      }
      break;
    }
    case "kaio": {
      if (!d.techs.includes("kaioken")) {
        const n = d.quests.bubblesHits ?? 0;
        body.push(`§7修行1：バブルスくんを10回捕まえろ（殴ってタッチ）：${n}/10`);
        add("§eバブルスくんを捕まえました！", () => {
          if (n >= 10) {
            say(p, "界王様", "見事じゃ！ では界王拳を教えてやろう。体に負担がかかるから気をつけるんじゃぞ！");
            learnTech(p, "kaioken");
          } else say(p, "界王様", "まだまだじゃな。バブルスくんはすばしっこいぞ！");
        });
      } else if (!d.techs.includes("genkidama")) {
        const n = d.quests.gregoryHits ?? 0;
        body.push(`§7修行2：ハンマーでグレゴリーを3回たたけ：${n}/3（レベル40から元気玉）`);
        if (!hasItem(p, "dbz:gregory_hammer")) add("§eハンマーをください", () => give(p, "dbz:gregory_hammer"));
        add("§eグレゴリーをたたきました！", () => {
          if (n >= 3 && lv >= 40) {
            say(p, "界王様", "よーし！ 最後の技、元気玉じゃ！ 生き物たちから元気を少しずつ分けてもらう技じゃ。");
            learnTech(p, "genkidama");
          } else if (n >= 3) say(p, "界王様", "腕は確かじゃが、元気玉はレベル40になってからじゃ。");
          else say(p, "界王様", "グレゴリーはまだピンピンしておるぞ！");
        });
      }
      body.push(`§7界王星では重力が地球の10倍。ここでの修行は経験値2倍じゃ。（滞在：${Math.floor(d.train.kaiSec / 60)}分）`);
      break;
    }
    case "karin": {
      const today = world.getDay();
      if (d.quests.senzuDay !== today) {
        add("§a仙豆をください", () => {
          d.quests.senzuDay = today;
          give(p, "dbz:senzu", 3);
          say(p, "カリン様", "ほれ、仙豆じゃ。1粒で10日は何も食べなくても平気じゃぞ。（毎日3粒もらえる）");
        });
      }
      if (!d.sacredWater) {
        const n = d.quests.karinHits ?? 0;
        body.push(`§7修行：わしに3回攻撃を当てたら超聖水をやろう：${n}/3`);
        add("§e超聖水をください", () => {
          if (n >= 3) {
            d.sacredWater = true;
            give(p, "dbz:sacred_water");
            say(p, "カリン様", "ほっほ、見事じゃ。超聖水を飲むと力が湧いてくるぞ。");
          } else say(p, "カリン様", "わしのスピードについてこれるかな？");
        });
      }
      break;
    }
    case "yajirobe": {
      add("§a仙豆を少し分けて", () => {
        if (d.quests.yajiDay === world.getDay()) say(p, "ヤジロベー", "今日はもうやらん！");
        else {
          d.quests.yajiDay = world.getDay();
          give(p, "dbz:senzu", 1);
          say(p, "ヤジロベー", "1粒だけだぞ！");
        }
      });
      break;
    }
    case "bulma": {
      if (!d.quests.got_radar) {
        add("§eドラゴンレーダーを貸して！", () => {
          d.quests.got_radar = true;
          give(p, "dbz:dragon_radar");
          give(p, "dbz:capsule_house");
          say(p, "ブルマ", "いいわよ！ ドラゴンボールの位置がわかるの。ホイポイカプセル（家）もあげるわ。投げると家が出てくるわよ。");
        });
      }
      if (!d.quests.got_gravity && lv >= 12) {
        add("§e重力室を使いたい", () => {
          d.quests.got_gravity = true;
          give(p, "dbz:capsule_gravity");
          say(p, "ブルマ", "ベジータ用に作った重力室のカプセルよ。家の隣の重力室も自由に使っていいわ。");
        });
      }
      if (!d.quests.got_aircar) {
        add("§eエアカーのカプセルがほしい", () => {
          d.quests.got_aircar = true;
          give(p, "dbz:capsule_aircar");
          say(p, "ブルマ", "はい、エアカー！ 運転は気をつけてね。");
        });
      }
      if (!d.quests.got_ship && (lv >= 22 || d.bosses.includes("vegeta"))) {
        add("§e宇宙船を作って！", () => {
          d.quests.got_ship = true;
          give(p, "dbz:capsule_spaceship");
          say(p, "ブルマ", "ナメック星にも行ける宇宙船よ！ 中の重力も調整できるんだから。");
        });
      }
      add("§7この世界のことを教えて", () => {
        say(p, "ブルマ", "カメハウス、カリン塔、天下一武道会の会場… 世界中に名所があるわ。ドラゴンボールを7つ集めると神龍が願いを叶えてくれるのよ！");
      });
      break;
    }
    case "guru": {
      if (!d.quests.guru) {
        add("§e潜在能力を引き出してください", () => {
          if (lv >= 30) {
            setPose(e, "one_hand");
            particle(p.dimension, "dbz:pillar", p.location, "white", 1);
            sound(p.dimension, "dbz.aura_burst", p.location, 1.5);
            grantFlag(p, "guru");
            addExp(p, 500);
            say(p, "最長老", "あなたの中に眠っている力を引き出しました… さあ、行きなさい。");
          } else say(p, "最長老", "あなたにはまだ早いようです。もう少し鍛えてからいらっしゃい。（レベル30から）");
        });
      }
      break;
    }
    case "elder_kai": {
      if (!d.quests.elder_kai) {
        add("§e潜在能力を極限まで引き出してください", () => {
          if (lv < 80 || !d.forms.includes("pu1")) {
            say(p, "老界王神", "まずは最長老に潜在能力を引き出してもらい、レベル80になってから来るんじゃ。");
            return;
          }
          ritual(p, e);
        });
      }
      break;
    }
    case "whis": {
      if (d.forms.includes("god") && lv >= 105 && !d.quests.whis_blue) {
        const n = d.quests.whisHits ?? 0;
        body.push(`§7修行：私に10回攻撃を当ててごらんなさい：${n}/10`);
        add("§e修行の成果を見てください", () => {
          if (n >= 10) {
            grantFlag(p, "whis_blue");
            say(p, "ウイス", "お見事です。神の気をまとったまま超サイヤ人になってごらんなさい。");
          } else say(p, "ウイス", "おほほ、まだまだですね。");
        });
      } else if (lv >= 120 && !d.quests.whis_ui && (d.race === "saiyan" || d.race === "human")) {
        const n = d.quests.whisHits2 ?? 0;
        body.push(`§7最終修行：私に30回攻撃を当てる（考えずに体を動かすのです）：${n}/30`);
        add("§e修行の成果を見てください", () => {
          if (n >= 30) {
            grantFlag(p, "whis_ui");
            say(p, "ウイス", "身勝手の極意の入り口に立ちましたね。");
          } else say(p, "ウイス", "考えてはいけません。体に任せるのです。");
        });
      } else {
        body.push("§7（ゴッドを習得しレベル105以上でブルーの修行、レベル120以上で身勝手の極意の修行）");
      }
      break;
    }
    case "announcer": {
      add("§e天下一武道会に出場する", () => emit("tournamentJoin", p, e));
      break;
    }
    case "goku": {
      if (lv >= 70 && !d.techs.includes("instant_transmission")) {
        add("§e瞬間移動を教えて", () => {
          say(p, "悟空", "ヤードラット星で教わった技なんだ。額に指を当てて、相手の気を感じるんだ！");
          learnTech(p, "instant_transmission");
        });
      }
      if (lv >= 100 && d.techs.includes("kamehameha") && !d.techs.includes("kamehameha_x10")) {
        add("§e10倍かめはめ波を教えて", () => {
          say(p, "悟空", "変身した状態でありったけの力を込めるんだ！");
          learnTech(p, "kamehameha_x10");
        });
      }
      break;
    }
    case "vegeta": {
      if (d.techs.includes("galick_gun")) {
        if (lv >= 30 && d.race === "saiyan" && !d.techs.includes("power_ball")) add("§eパワーボールを教えて", () => {
          say(p, "ベジータ", "人工の満月だ。尻尾のあるサイヤ人なら大猿になれる。");
          learnTech(p, "power_ball");
        });
        if (lv >= 50 && !d.techs.includes("final_flash")) add("§eファイナルフラッシュを教えて", () => {
          say(p, "ベジータ", "いいだろう… 全エネルギーを両手に集めて放つんだ！");
          learnTech(p, "final_flash");
        });
        if (lv >= 60 && !d.techs.includes("big_bang")) add("§eビッグバンアタックを教えて", () => {
          say(p, "ベジータ", "片手に気を集中させろ。これがビッグバンアタックだ！");
          learnTech(p, "big_bang");
        });
      }
      break;
    }
    case "piccolo": {
      if (d.techs.includes("makankosappo") && lv >= 35 && !d.techs.includes("bakuretsu_mapa")) {
        add("§e爆裂魔波を教えて", () => {
          say(p, "ピッコロ", "前方を一気に吹き飛ばす技だ。使いこなしてみろ。");
          learnTech(p, "bakuretsu_mapa");
        });
      }
      break;
    }
    case "namekian": {
      add("§a傷を治してください", () => {
        try {
          p.getComponent("minecraft:health").resetToMaxValue();
        } catch {
          // ignore
        }
        particle(p.dimension, "dbz:sparkle", V.up(p.location, 1), "gold", 1);
        say(p, "ナメック星人", "治しておきましたよ。");
      });
      break;
    }
    default:
      break;
  }
  if (sparOk) {
    const rec = statsFor(cid).prof.rec;
    add(`§c手合わせしてください §7（目安レベル${rec}）`, () => startSpar(p, e, cid));
  }
  const canRecruit = ["goku", "gohan", "goten", "vegeta", "trunks", "piccolo", "krillin", "tien", "yamcha"].includes(cid);
  if (canRecruit && !d.allies[cid]?.active) {
    add(`§a仲間になってくれ`, () => {
      if (!d.quests[`spar_${cid}`]) {
        say(p, NAME(cid), "まずは手合わせで実力を見せてくれ！");
        return;
      }
      recruit(p, e, cid);
    });
  }
  add("§7さようなら", () => {});
  const f = new ActionFormData().title(`§l${NAME(cid)}`).body(body.join("\n"));
  for (const o of opts) f.button(o.label);
  rt(p).menuOpen = true;
  const r = await f.show(p);
  rt(p).menuOpen = false;
  if (r.canceled || r.selection === undefined) return;
  await opts[r.selection].fn();
  markDirty(p);
}

function ritual(p, e) {
  title(p, "§d潜在能力解放の儀式", "§7じっとしているんじゃ… （60秒）", 60);
  let t = 0;
  const start = p.location;
  const run = system.runInterval(() => {
    t++;
    if (!isValid(p) || !isValid(e)) {
      system.clearRun(run);
      return;
    }
    if (V.dist(start, p.location) > 4) {
      system.clearRun(run);
      say(p, "老界王神", "こら！ 動いてはいかん！ 最初からやり直しじゃ。");
      return;
    }
    setPose(e, t % 2 ? "fusion" : "overhead");
    particle(p.dimension, "dbz:sparkle", V.up(p.location, 1), "white", 1);
    if (t >= 60) {
      system.clearRun(run);
      setPose(e, "none");
      grantFlag(p, "elder_kai");
      addExp(p, 3000);
      say(p, "老界王神", "ほれ、終わったぞい。お前さんの潜在能力は極限まで引き出された！");
    }
  }, 20);
}

/* ===================================================================================== quest hit tracking */

world.afterEvents.entityHitEntity.subscribe((ev) => {
  const p = /** @type {import("@minecraft/server").Player} */ (ev.damagingEntity);
  const e = ev.hitEntity;
  if (p?.typeId !== "minecraft:player" || e?.typeId !== "dbz:fighter") return;
  const s = fighters.get(e.id);
  if (!s) return;
  const d = getData(p);
  const held = (() => {
    try {
      return p.getComponent(EntityComponentTypes.Inventory).container.getItem(p.selectedSlotIndex)?.typeId;
    } catch {
      return undefined;
    }
  })();
  if (s.cid === "bubbles") {
    d.quests.bubblesHits = (d.quests.bubblesHits ?? 0) + 1;
    msg(p, `§eバブルスくんを捕まえた！（${d.quests.bubblesHits}/10）`);
    teleportAway(e);
  } else if (s.cid === "gregory" && held === "dbz:gregory_hammer") {
    d.quests.gregoryHits = (d.quests.gregoryHits ?? 0) + 1;
    msg(p, `§eグレゴリーをたたいた！（${d.quests.gregoryHits}/3）`);
    teleportAway(e);
  } else if (s.cid === "karin" && s.role === "npc") {
    if (Math.random() < 0.85) {
      teleportAway(e, 3);
      msg(p, "§7カリン様にかわされた！");
    } else {
      d.quests.karinHits = (d.quests.karinHits ?? 0) + 1;
      msg(p, `§eカリン様に当たった！（${d.quests.karinHits}/3）`);
    }
  } else if (s.cid === "whis") {
    if (Math.random() < 0.8) {
      teleportAway(e, 3);
    } else {
      d.quests.whisHits = (d.quests.whisHits ?? 0) + 1;
      if (d.level >= 120) d.quests.whisHits2 = (d.quests.whisHits2 ?? 0) + 1;
      msg(p, `§bウイスに攻撃が当たった！（${d.quests.whisHits}）`);
    }
  }
  markDirty(p);
});

function teleportAway(e, r = 6) {
  const s = fighters.get(e.id);
  const home = s?.home ?? e.location;
  const dest = { x: home.x + (Math.random() - 0.5) * r * 2, y: home.y + (s?.cid === "gregory" ? 1.5 : 0.2), z: home.z + (Math.random() - 0.5) * r * 2 };
  particle(e.dimension, "dbz:afterimage", e.location, "white", 1);
  try {
    e.teleport(dest);
  } catch {
    // ignore
  }
}

/* track distance run while wearing Roshi's turtle shell */
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const d = getData(p);
    if (!d.quests.roshi_met || d.techs.includes("kamehameha")) continue;
    if (!wearing(p, "dbz:turtle_shell")) continue;
    const r = rt(p);
    const loc = p.location;
    if (r.shellLast) {
      const dist = Math.sqrt((loc.x - r.shellLast.x) ** 2 + (loc.z - r.shellLast.z) ** 2);
      if (dist < 12) d.quests.shellDist = (d.quests.shellDist ?? 0) + dist;
      if (Math.floor((d.quests.shellDist ?? 0) / 100) !== Math.floor(((d.quests.shellDist ?? 0) - dist) / 100)) {
        msg(p, `§7甲羅修行：${Math.floor(d.quests.shellDist)}/500 ブロック`);
      }
    }
    r.shellLast = { x: loc.x, z: loc.z };
    markDirty(p);
  }
}, 20);

export { NAME, BASE, give, hasFamily };
