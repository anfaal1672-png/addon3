import { system, world, ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { getData, markDirty, rt } from "../core/data.js";
import { addExp, powerOf } from "../core/stats.js";
import { V, isValid, rand, fmtPL, compass } from "../core/util.js";
import { particle, sound, title, msg, say, shakeArea, psound } from "../core/fx.js";
import { on, emit } from "../core/bus.js";
import { spawnFighter, fighters } from "../npc/fighters.js";
import { statsFor } from "../npc/chars.js";
import { CHARS, CHAR_INDEX } from "../gen/catalog.js";
import { grantFlag } from "../combat/forms.js";
import { learnTech } from "../combat/techniques.js";
import { SITES, getLayout, siteAt, travelTo } from "../world/sites.js";

const N = (cid) => CHARS[CHAR_INDEX[cid]]?.name ?? cid;

/** Story chapters in order. where: null = anywhere (near the player), or a site id. */
export const CHAPTERS = [
  { saga: "サイヤ人編", id: "raditz", name: "ラディッツ襲来", rec: 8, where: null,
    foes: [{ cid: "raditz", boss: true }], intro: ["ラディッツ", "カカロットの仲間か…？ 戦闘力たったの5か、ゴミめ。"],
    reward: { exp: 600, items: [["dbz:senzu", 2]] } },
  { saga: "サイヤ人編", id: "nappa", name: "サイバイマンとナッパ", rec: 14, where: null,
    foes: [{ cid: "saibaman", n: 4 }, { cid: "nappa", boss: true }], intro: ["ナッパ", "ベジータ、こいつら全員ぶっ殺してもいいんだろ？"],
    reward: { exp: 1200, items: [["dbz:senzu", 2]] } },
  { saga: "サイヤ人編", id: "vegeta", name: "サイヤ人の王子ベジータ", rec: 20, where: null,
    foes: [{ cid: "vegeta", boss: true, forms: [{ at: 0.3, to: "oozaru", heal: true }] }], intro: ["ベジータ", "サイヤ人の王子の力、思い知らせてやる！"],
    reward: { exp: 2500, items: [["dbz:senzu", 3], ["dbz:scouter", 1]] } },
  { saga: "フリーザ編", id: "ginyu", name: "ギニュー特戦隊", rec: 28, where: "namek",
    foes: [{ cid: "guldo" }, { cid: "recoome" }, { cid: "burter" }, { cid: "jeice" }, { cid: "ginyu", boss: true }, { cid: "frieza_soldier", n: 3 }],
    intro: ["ギニュー", "リクーム！ バータ！ ジース！ グルド！ そしてギニュー！ 我らギニュー特戦隊！！"],
    reward: { exp: 5000, items: [["dbz:senzu", 3]] } },
  { saga: "フリーザ編", id: "frieza", name: "宇宙の帝王フリーザ", rec: 40, where: "namek",
    foes: [{ cid: "frieza1", boss: true }], intro: ["フリーザ", "私の戦闘力は53万です。ですがもちろんフルパワーであなたと戦う気はありませんからご心配なく…"],
    reward: { exp: 12000, items: [["dbz:senzu", 4]], flags: [], bossTech: ["death_beam"] } },
  { saga: "人造人間・セル編", id: "android19", name: "人造人間19号・20号", rec: 43, where: "red_ribbon",
    foes: [{ cid: "android19", boss: true }, { cid: "android20", boss: true }, { cid: "rr_robot", n: 2 }], intro: ["ドクター・ゲロ", "孫悟空の仲間か… エネルギーを吸い取ってくれる。"],
    reward: { exp: 15000, items: [["dbz:senzu", 3]] } },
  { saga: "人造人間・セル編", id: "android17", name: "人造人間17号・18号・16号", rec: 47, where: "red_ribbon",
    foes: [{ cid: "android17", boss: true }, { cid: "android18", boss: true }, { cid: "android16", boss: true }], intro: ["人造人間17号", "暇つぶしにちょうどいいや。"],
    reward: { exp: 20000, items: [["dbz:senzu", 3]] } },
  { saga: "人造人間・セル編", id: "cell", name: "完全体セル", rec: 56, where: null,
    foes: [{ cid: "cell1", boss: true, forms: [{ at: 0.25, to: "cell2", heal: true }, { at: 0.2, to: "cell", heal: true }] }],
    intro: ["セル", "17号と18号を吸収すれば、私は完全体になれる…！"], reward: { exp: 30000, items: [["dbz:senzu", 4]] } },
  { saga: "人造人間・セル編", id: "cell_games", name: "セルゲーム", rec: 62, where: "cell_games",
    foes: [{ cid: "cell_jr", n: 5 }, { cid: "cell", boss: true }], intro: ["セル", "ようこそ、セルゲームへ。さあ、私を楽しませてくれ。"],
    reward: { exp: 45000, items: [["dbz:senzu", 5]] } },
  { saga: "魔人ブウ編", id: "babidi", name: "バビディの手下", rec: 64, where: null,
    foes: [{ cid: "spopovich" }, { cid: "yamu" }, { cid: "dabura", boss: true }], intro: ["ダーブラ", "暗黒魔界の王、ダーブラだ。バビディ様のために死んでもらう。"],
    reward: { exp: 55000, items: [["dbz:senzu", 4]] } },
  { saga: "魔人ブウ編", id: "buu", name: "魔人ブウ", rec: 75, where: null,
    foes: [{ cid: "buu_fat", boss: true }], intro: ["魔人ブウ", "ブウ、おまえをお菓子にして食べる！"],
    reward: { exp: 90000, items: [["dbz:senzu", 5]] } },
  { saga: "劇場版", id: "broly", name: "伝説の超サイヤ人ブロリー", rec: 72, where: null,
    foes: [{ cid: "broly", boss: true }], intro: ["ブロリー", "カカロットォォォーーーッ！！"],
    reward: { exp: 100000, items: [["dbz:senzu", 5], ["dbz:broly_pants", 1]], flags: ["broly_down"] } },
  { saga: "神と神", id: "beerus", name: "破壊神ビルス", rec: 92, where: "beerus",
    foes: [{ cid: "beerus", boss: true, yield: 0.3 }], intro: ["ビルス", "超サイヤ人ゴッドってのを探してるんだけど… 君、知らない？"],
    reward: { exp: 200000, items: [["minecraft:cake", 3]], flags: ["beerus_ok"] } },
  { saga: "復活のF", id: "golden", name: "ゴールデンフリーザ", rec: 97, where: null,
    foes: [{ cid: "frieza_soldier", n: 6 }, { cid: "frieza_golden", boss: true }], intro: ["フリーザ", "4ヶ月の修行の成果、見せてあげましょう… これが私の新たな姿です！"],
    reward: { exp: 300000, items: [["dbz:senzu", 5]], flags: ["golden_frieza_down"], bossTech: ["supernova"] } },
  { saga: "未来トランクス編", id: "black", name: "ゴクウブラック", rec: 113, where: null,
    foes: [{ cid: "goku_black", boss: true }], intro: ["ゴクウブラック", "人間ども… 正義の名のもとに、この世界から消えてもらおう。"],
    reward: { exp: 450000, items: [["dbz:senzu", 5]] } },
  { saga: "未来トランクス編", id: "zamasu", name: "合体ザマス", rec: 118, where: null,
    foes: [{ cid: "zamasu", boss: true }], intro: ["ザマス", "我こそが正義、我こそが世界…！"],
    reward: { exp: 600000, items: [["dbz:senzu", 5]] } },
  { saga: "宇宙サバイバル編", id: "hit", name: "伝説の殺し屋ヒット", rec: 122, where: "top",
    foes: [{ cid: "hit", boss: true }], intro: ["ヒット", "依頼は受けた。…時飛ばし。"],
    reward: { exp: 800000, items: [["dbz:senzu", 5]] } },
  { saga: "宇宙サバイバル編", id: "jiren", name: "力の大会 ジレン", rec: 132, where: "top",
    foes: [{ cid: "jiren", boss: true }], intro: ["ジレン", "強さこそがすべてだ。"],
    reward: { exp: 1500000, items: [["dbz:senzu", 8]], flags: ["jiren_down"] } },
];

const active = new Map(); // player id -> {chapter, foes:Set<id>, center, startTick}

export function currentChapter(p) {
  const d = getData(p);
  return CHAPTERS[d.saga] ?? null;
}

export async function storyMenu(p) {
  const d = getData(p);
  const ch = currentChapter(p);
  const f = new ActionFormData().title("§6ストーリー");
  let body = "";
  for (let i = 0; i < CHAPTERS.length; i++) {
    const c = CHAPTERS[i];
    const mark = i < d.saga ? "§a✔" : i === d.saga ? "§e▶" : "§8・";
    body += `${mark} §7[${c.saga}] §f${c.name} §7(目安Lv.${c.rec})\n`;
  }
  if (!ch) {
    f.body(body + "\n§6すべてのストーリーをクリアした！ おめでとう！\n§7（ボスとはもう一度戦える）");
    f.button("ボスと再戦する");
    f.button("閉じる");
    const r = await f.show(p);
    if (!r.canceled && r.selection === 0) await rematchMenu(p);
    return;
  }
  let where = "§7場所：どこでも（その場で戦う）";
  if (ch.where) {
    const L = getLayout()[ch.where];
    const dx = L.x - p.location.x;
    const dz = L.z - p.location.z;
    where = `§7場所：§e${SITES[ch.where].name}` + (SITES[ch.where].planet ? "§7（宇宙船で行ける）" : `§7（${Math.round(Math.sqrt(dx * dx + dz * dz))}m ${compass(dx, dz)}）`);
  }
  f.body(`${body}\n§e次の戦い：§f${ch.name}\n${where}\n§7あなたの戦闘力：${fmtPL(powerOf(p))}`);
  f.button(`§c挑む：${ch.name}`);
  f.button("ボスと再戦する");
  f.button("閉じる");
  const r = await f.show(p);
  if (r.canceled) return;
  if (r.selection === 0) startChapter(p, ch);
  if (r.selection === 1) await rematchMenu(p);
}

async function rematchMenu(p) {
  const d = getData(p);
  const done = CHAPTERS.slice(0, d.saga);
  if (!done.length) {
    msg(p, "§7まだ倒したボスがいない。");
    return;
  }
  const f = new ActionFormData().title("ボスと再戦");
  for (const c of done) f.button(c.name);
  const r = await f.show(p);
  if (r.canceled) return;
  startChapter(p, done[r.selection], true);
}

export function startChapter(p, ch, rematch = false) {
  if (active.has(p.id)) {
    msg(p, "§7いまは戦闘中だ！");
    return;
  }
  if (ch.where) {
    const here = p.dimension.id === "minecraft:overworld" ? siteAt(p.location, 60) : null;
    if (here !== ch.where) {
      const def = SITES[ch.where];
      if (def.planet) {
        msg(p, `§e${def.name}§fで戦う必要がある。宇宙船（ホイポイカプセル）で向かおう。`);
        if (getData(p).visited[ch.where]) msg(p, "§7（一度行った場所なので、瞬間移動でも行ける）");
      } else {
        const L = getLayout()[ch.where];
        msg(p, `§e${def.name}§fへ向かおう：X=${L.x} Z=${L.z}`);
      }
      return;
    }
  }
  const dim = p.dimension;
  const center = p.location;
  const view = p.getViewDirection();
  const ahead = V.add(center, V.mul({ x: view.x, y: 0, z: view.z }, 12));
  const foes = new Set();
  const lvBoost = rematch ? Math.max(0, getData(p).level - ch.rec) : 0;
  let i = 0;
  for (const f of ch.foes) {
    for (let k = 0; k < (f.n ?? 1); k++) {
      const ang = (i++ / 6) * Math.PI * 2;
      const loc = V.add(ahead, { x: Math.cos(ang) * (f.boss ? 0 : 4), y: 1.5, z: Math.sin(ang) * (f.boss ? 0 : 4) });
      try {
        const top = dim.getTopmostBlock({ x: loc.x, z: loc.z });
        if (top && Math.abs(top.location.y - center.y) < 12) loc.y = top.location.y + 1.1;
      } catch {
        // ignore
      }
      const st = statsFor(f.cid);
      const e = spawnFighter(f.cid, dim, loc, { role: "enemy", boss: !!f.boss, level: st.prof.rec + lvBoost, forms: f.forms, tag: `saga_${p.id}` });
      if (!e) continue;
      foes.add(e.id);
      if (f.yield) e.addTag(`yield_${Math.round(f.yield * 100)}`);
      particle(dim, "dbz:pillar", loc, "white", 1);
    }
  }
  active.set(p.id, { ch, foes, center, startTick: system.currentTick, rematch });
  sound(dim, "dbz.boss", center, 2.5);
  shakeArea(dim, center, 40, 0.6, 1.0);
  title(p, `§c${ch.name}`, `§7${ch.saga}`, 60);
  system.runTimeout(() => isValid(p) && say(p, ch.intro[0], ch.intro[1]), 40);
}

function finishChapter(p, won) {
  const st = active.get(p.id);
  if (!st) return;
  active.delete(p.id);
  for (const id of st.foes) {
    const e = world.getEntity(id);
    if (e) {
      particle(e.dimension, "dbz:pillar", e.location, "white", 1);
      try {
        e.remove();
      } catch {
        // ignore
      }
    }
  }
  if (!won) {
    title(p, "§c敗北…", "§7もっと修行してから挑もう", 60);
    return;
  }
  const d = getData(p);
  const ch = st.ch;
  title(p, "§6勝利！！", `§e${ch.name} クリア`, 70);
  sound(p.dimension, "dbz.levelup", p.location, 2);
  particle(p.dimension, "dbz:pillar", p.location, "gold", 1);
  const rw = ch.reward;
  addExp(p, (rw.exp ?? 0) * (st.rematch ? 0.4 : 1));
  if (!st.rematch) {
    for (const [id, n] of rw.items ?? []) {
      try {
        p.dimension.spawnItem(new ItemStack(id, n), V.up(p.location, 1));
      } catch {
        // ignore
      }
    }
  }
  for (const fl of rw.flags ?? []) grantFlag(p, fl);
  for (const t of rw.bossTech ?? []) learnTech(p, t);
  if (!d.bosses.includes(ch.id)) d.bosses.push(ch.id);
  if (!st.rematch && CHAPTERS[d.saga]?.id === ch.id) {
    d.saga++;
    const next = CHAPTERS[d.saga];
    if (next) msg(p, `§e次の戦い：${next.name}（目安Lv.${next.rec}）― ドラゴンメニューの「ストーリー」から挑める。`);
  }
  markDirty(p);
  emit("chapterCleared", p, ch.id);
}

on("entityKilled", (dead) => {
  for (const [pid, st] of active) {
    if (st.foes.delete(dead.id) && st.foes.size === 0) {
      const p = world.getEntity(pid);
      if (p) finishChapter(p, true);
      else active.delete(pid);
    }
  }
});

on("damaged", (target) => {
  // bosses that only need to be "acknowledged" (Beerus)
  if (target?.typeId !== "dbz:fighter") return;
  const tag = target.getTags().find((t) => t.startsWith("yield_"));
  if (!tag) return;
  try {
    const h = target.getComponent("minecraft:health");
    if (h.currentValue / h.effectiveMax > Number(tag.slice(6)) / 100) return;
  } catch {
    return;
  }
  for (const [pid, st] of active) {
    if (st.foes.has(target.id)) {
      const p = world.getEntity(pid);
      st.foes.delete(target.id);
      if (p) say(p, N(fighters.get(target.id)?.cid ?? "beerus"), "ふーん… なかなかやるじゃないか。今日はこのくらいにしておいてあげるよ。");
      if (st.foes.size === 0 && p) finishChapter(p, true);
    }
  }
});

on("playerDied", (p) => {
  if (active.has(p.id)) finishChapter(p, false);
});

system.runInterval(() => {
  for (const [pid, st] of active) {
    const p = world.getEntity(pid);
    if (!p) {
      active.delete(pid);
      continue;
    }
    if (V.dist(p.location, st.center) > 140) {
      msg(p, "§7戦場から離れすぎた…");
      finishChapter(p, false);
      continue;
    }
    for (const id of [...st.foes]) {
      const e = world.getEntity(id);
      if (!e || !isValid(e)) st.foes.delete(id);
      else if (V.dist(e.location, st.center) > 100) {
        try {
          e.teleport(V.up(p.location, 2));
        } catch {
          // ignore
        }
      }
    }
    if (st.foes.size === 0) finishChapter(p, true);
  }
}, 40);

export function inBattle(p) {
  return active.has(p.id);
}
