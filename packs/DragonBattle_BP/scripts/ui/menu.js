import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";
import { settings, saveSettings } from "../core/settings.js";
import { msg } from "../core/fx.js";
import { charName } from "../fighters/fighter.js";
import { STAGES } from "../battle/stage.js";
import { currentMatch, startMatch, startTournament, randomBattle, randomCid, endMatch, togglePause, ROSTER, MODE_NAME } from "../battle/match.js";
import { rankingText, lastText, resetRecords } from "../battle/records.js";
import { cameraMode, setCameraMode, MODES, MODE_NAME as CAM_NAME } from "../battle/camera.js";
import { giveTools } from "../battle/tools.js";

/* Battle menu: build a match, change settings, look at records. */

const PICK = ["§7ランダム", ...ROSTER.map((id) => charName(id))];
const STAGE_NAMES = STAGES.map((s) => s.name);

function cidAt(i, taken = []) {
  return i > 0 ? ROSTER[i - 1] : randomCid(taken);
}

/** Stage, transformation and strength options shared by every mode. */
function addCommon(f, stageDefault = 0) {
  f.dropdown("ステージ", STAGE_NAMES, { defaultValueIndex: stageDefault });
  f.toggle("途中で変身する", { defaultValue: true });
  f.toggle("最初から最終形態で戦う", { defaultValue: false });
  f.slider("体力の倍率（×0.5〜×3）", 1, 6, { valueStep: 1, defaultValue: Math.round(settings().hpMult * 2) });
  f.toggle("強さを互角にする（どの組み合わせでも良い勝負に）", { defaultValue: settings().balance });
}

function readCommon(v, i) {
  const s = settings();
  s.balance = !!v[i + 4];
  saveSettings();
  return { stage: STAGES[v[i]]?.id ?? "ring", noForms: !v[i + 1], startFinal: !!v[i + 2], hpMult: (Number(v[i + 3]) || 2) / 2 };
}

export async function battleMenu(p) {
  const m = currentMatch();
  const f = new ActionFormData().title("§6ドラゴンボール バトル");
  const body = [];
  if (m && m.state !== "done") body.push(`§a試合中：${MODE_NAME[m.mode] ?? ""}${m.paused ? " §c（一時停止中）" : ""}`);
  body.push(`§7カメラ：${CAM_NAME[cameraMode(p)]}`);
  f.body(body.join("\n"));
  const acts = [];
  const add = (label, fn) => {
    f.button(label);
    acts.push(fn);
  };
  add("§l1対1", () => duelMenu(p));
  add("§lチーム戦", () => teamMenu(p));
  add("§lバトルロイヤル", () => royaleMenu(p));
  add("§lボス戦", () => bossMenu(p));
  add("§lトーナメント（天下一武道会）", () => tournamentMenu(p));
  add("§lランダム対戦", () => randomBattle(p));
  if (m && m.state !== "done") {
    add(m.paused ? "試合を再開する" : "試合を一時停止する", () => togglePause(m));
    add("§c試合を終わらせる", () => endMatch(m, true));
  }
  add("カメラ切り替え", () => cameraMenu(p));
  add("設定", () => settingsMenu(p));
  add("記録・ランキング", () => recordsMenu(p));
  add("道具を受け取る", () => giveTools(p));
  add("遊び方", () => helpMenu(p));
  const r = await f.show(p);
  if (r.canceled || r.selection === undefined) return;
  await acts[r.selection]?.();
}

async function duelMenu(p) {
  const f = new ModalFormData().title("1対1");
  f.dropdown("1人目", PICK, { defaultValueIndex: 1 + ROSTER.indexOf("goku") });
  f.dropdown("2人目", PICK, { defaultValueIndex: 1 + ROSTER.indexOf("vegeta") });
  addCommon(f, 1);
  const r = await f.show(p);
  if (r.canceled || !r.formValues) return;
  const v = r.formValues;
  const a = cidAt(Number(v[0]));
  const b = cidAt(Number(v[1]), [a]);
  startMatch(p, Object.assign({ mode: "duel", sides: [{ cids: [a] }, { cids: [b] }] }, readCommon(v, 2)));
}

async function teamMenu(p) {
  const pre = new ModalFormData().title("チーム戦");
  pre.dropdown("チームの数", ["2チーム", "3チーム", "4チーム"], { defaultValueIndex: 0 });
  pre.dropdown("1チームの人数", ["1人", "2人", "3人", "4人"], { defaultValueIndex: 1 });
  const r0 = await pre.show(p);
  if (r0.canceled || !r0.formValues) return;
  const teams = Number(r0.formValues[0]) + 2;
  const size = Number(r0.formValues[1]) + 1;
  const names = ["赤", "青", "緑", "黄"];
  const f = new ModalFormData().title("チーム戦：メンバー");
  for (let t = 0; t < teams; t++) for (let i = 0; i < size; i++) f.dropdown(`${names[t]}チーム ${i + 1}人目`, PICK, { defaultValueIndex: 0 });
  addCommon(f, 1);
  const r = await f.show(p);
  if (r.canceled || !r.formValues) return;
  const v = r.formValues;
  const sides = [];
  const taken = [];
  for (let t = 0; t < teams; t++) {
    const cids = [];
    for (let i = 0; i < size; i++) {
      const c = cidAt(Number(v[t * size + i]), taken);
      taken.push(c);
      cids.push(c);
    }
    sides.push({ cids, label: `${names[t]}チーム` });
  }
  startMatch(p, Object.assign({ mode: "team", sides }, readCommon(v, teams * size)));
}

async function royaleMenu(p) {
  const pre = new ModalFormData().title("バトルロイヤル");
  pre.dropdown("人数", ["3人", "4人", "5人", "6人", "7人", "8人"], { defaultValueIndex: 3 });
  const r0 = await pre.show(p);
  if (r0.canceled || !r0.formValues) return;
  const n = Number(r0.formValues[0]) + 3;
  const f = new ModalFormData().title("バトルロイヤル：出場者");
  for (let i = 0; i < n; i++) f.dropdown(`${i + 1}人目`, PICK, { defaultValueIndex: 0 });
  addCommon(f, 1);
  const r = await f.show(p);
  if (r.canceled || !r.formValues) return;
  const v = r.formValues;
  const taken = [];
  const sides = [];
  for (let i = 0; i < n; i++) {
    const c = cidAt(Number(v[i]), taken);
    taken.push(c);
    sides.push({ cids: [c], label: charName(c) });
  }
  startMatch(p, Object.assign({ mode: "royale", sides }, readCommon(v, n)));
}

async function bossMenu(p) {
  const pre = new ModalFormData().title("ボス戦");
  pre.dropdown("ボス", PICK, { defaultValueIndex: 1 + ROSTER.indexOf("jiren") });
  pre.dropdown("挑戦者の人数", ["1人", "2人", "3人", "4人", "5人", "6人"], { defaultValueIndex: 3 });
  const r0 = await pre.show(p);
  if (r0.canceled || !r0.formValues) return;
  const boss = cidAt(Number(r0.formValues[0]));
  const n = Number(r0.formValues[1]) + 1;
  const f = new ModalFormData().title("ボス戦：挑戦者");
  for (let i = 0; i < n; i++) f.dropdown(`挑戦者 ${i + 1}人目`, PICK, { defaultValueIndex: 0 });
  addCommon(f, 4);
  const r = await f.show(p);
  if (r.canceled || !r.formValues) return;
  const v = r.formValues;
  const taken = [boss];
  const ch = [];
  for (let i = 0; i < n; i++) {
    const c = cidAt(Number(v[i]), taken);
    taken.push(c);
    ch.push(c);
  }
  startMatch(p, Object.assign({ mode: "boss", sides: [{ cids: [boss], hpMult: 1.5 + n * 0.75, boss: true, label: `ボス：${charName(boss)}` },
    { cids: ch, label: "挑戦者" }] }, readCommon(v, n)));
}

async function tournamentMenu(p) {
  const pre = new ModalFormData().title("トーナメント");
  pre.dropdown("出場人数", ["8人", "16人"], { defaultValueIndex: 0 });
  pre.toggle("出場者をランダムで選ぶ", { defaultValue: true });
  const r0 = await pre.show(p);
  if (r0.canceled || !r0.formValues) return;
  const n = r0.formValues[0] ? 16 : 8;
  const randomPick = !!r0.formValues[1];
  const f = new ModalFormData().title("トーナメント：設定");
  if (!randomPick) for (let i = 0; i < n; i++) f.dropdown(`${i + 1}人目`, PICK, { defaultValueIndex: 0 });
  addCommon(f, 0);
  f.toggle("場外負けあり（リングのステージ）", { defaultValue: true });
  const r = await f.show(p);
  if (r.canceled || !r.formValues) return;
  const v = r.formValues;
  const off = randomPick ? 0 : n;
  const taken = [];
  const entrants = [];
  for (let i = 0; i < n; i++) {
    const c = randomPick ? randomCid(taken) : cidAt(Number(v[i]), taken);
    taken.push(c);
    entrants.push(c);
  }
  const opts = Object.assign(readCommon(v, off), { ringOut: !!v[off + 5] });
  startTournament(p, entrants, opts);
}

async function cameraMenu(p) {
  const f = new ActionFormData().title("カメラ").body(`§7今：${CAM_NAME[cameraMode(p)]}`);
  for (const m of MODES) f.button(CAM_NAME[m]);
  const r = await f.show(p);
  if (r.canceled || r.selection === undefined) return;
  setCameraMode(p, MODES[r.selection]);
}

async function settingsMenu(p) {
  const s = settings();
  const f = new ModalFormData().title("設定");
  f.dropdown("戦いの速さ", ["ゆっくり", "ふつう", "速い"], { defaultValueIndex: s.speed });
  f.toggle("地形を壊す", { defaultValue: s.terrain });
  f.toggle("試合のあと地形を元に戻す", { defaultValue: s.restore });
  f.dropdown("エフェクトの量", ["軽め（スマホ向け）", "ふつう", "最大"], { defaultValueIndex: s.effects });
  f.toggle("演出カメラの自動切り替え", { defaultValue: s.autoCam });
  f.toggle("実況を表示", { defaultValue: s.commentary });
  f.toggle("キャラのセリフを表示", { defaultValue: s.lines });
  f.toggle("観戦者に流れ弾が当たらない", { defaultValue: s.safety });
  f.slider("体力の倍率（×0.5〜×3）", 1, 6, { valueStep: 1, defaultValue: Math.round(s.hpMult * 2) });
  f.toggle("強さを互角にする", { defaultValue: s.balance });
  const r = await f.show(p);
  if (r.canceled || !r.formValues) return;
  const v = r.formValues;
  s.speed = Number(v[0]);
  s.terrain = !!v[1];
  s.restore = !!v[2];
  s.effects = Number(v[3]);
  s.autoCam = !!v[4];
  s.commentary = !!v[5];
  s.lines = !!v[6];
  s.safety = !!v[7];
  s.hpMult = (Number(v[8]) || 2) / 2;
  s.balance = !!v[9];
  saveSettings();
  msg(p, "§a設定を保存しました。");
}

async function recordsMenu(p) {
  const f = new ActionFormData().title("記録・ランキング").body(`§l§6最強ランキング§r\n${rankingText()}\n\n§l§6前の試合§r\n${lastText()}`);
  f.button("閉じる");
  f.button("§c記録を消す");
  const r = await f.show(p);
  if (r.selection === 1) {
    const ok = await new MessageFormData().title("記録を消す").body("すべての記録を消します。よろしいですか？").button1("消す").button2("やめる").show(p);
    if (!ok.canceled && ok.selection === 0) {
      resetRecords();
      msg(p, "§7記録を消しました。");
    }
  }
}

export const HELP = [
  "§l§6ドラゴンボール バトルの遊び方§r",
  "§eバトルメニュー§r（アイテム、または /dbb:battle）から試合の種類を選び、キャラとステージを決めると、目の前にステージができて試合が始まります。",
  "§e1対1・チーム戦・バトルロイヤル・ボス戦・トーナメント・ランダム対戦§rがあります。キャラは「ランダム」も選べます。",
  "§eカメラ§r：試合中は自動でカメラが戦いを映します（追従／周回／自由）。カメラ切り替えのアイテムで変えられます。必殺技や変身の瞬間には演出カメラに切り替わります（設定でオフにできます）。",
  "§e試合コントローラー§r：使うと一時停止／再開、しゃがみながら使うと試合を終わらせます。",
  "§eスポーンエッグ§rで出したキャラは、§eチームの旗§rで叩くとチームに入り、違うチームどうしで戦い始めます。§e一騎打ちの杖§rで2人を順に叩くと一騎打ちです。",
  "§e回復の杖§rで回復（ダウンしたキャラも起き上がる）、§e撃破の杖§rでダウンさせられます。",
  "試合のあと、ステージで壊れた地形は元に戻ります（設定で変更可）。",
].join("\n\n");

async function helpMenu(p) {
  await new ActionFormData().title("遊び方").body(HELP).button("閉じる").show(p);
}
