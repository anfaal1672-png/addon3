import { system, world } from "@minecraft/server";
import { CHARS } from "../gen/catalog.js";
import { settings } from "../core/settings.js";
import { V, isValid, pick, rand, fmtPL } from "../core/util.js";
import { particle, sound, flash, boom, msg, title } from "../core/fx.js";
import { on, emit } from "../core/bus.js";
import { isKO, hurt, powerOf } from "../combat/damage.js";
import { isBattler, teamOf, huntSlots, preySlots, TEAMS, TEAM_STYLE, SLOTS } from "../combat/teams.js";
import { setDigRule } from "../combat/terrain.js";
import { clearAll, cleanupStray } from "../combat/projectiles.js";
import { fighters, spawnFighter, leaveBattle, setPose, setAura, speak, charName, hpFrac, revive } from "../fighters/fighter.js";
import { setGate } from "../fighters/ai.js";
import { profileOf, rivalLines } from "../fighters/roster.js";
import { buildStage, snapshot, restore, groundY, inArea, outOfRing, stageName, STAGES } from "./stage.js";
import { bindMatch as camBind, releaseAll, winnerShot, introShot, cut } from "./camera.js";
import { bindMatch as hudBind, say, bigTitle, viewers } from "./hud.js";
import { recordResult } from "./records.js";

/* Matches: set-up (stage, fighters), the intro and countdown, watching for knock-outs / ring-outs / time-outs,
 * the final blow and the result, and tournaments built out of 1-on-1 matches. One match runs at a time. */

const now = () => system.currentTick;

/** @type {any} */
let current = null;
export function currentMatch() {
  return current;
}
camBind(() => current);
hudBind(() => current);

/** The roster that can be picked in menus (everyone but the training dummy). */
export const ROSTER = CHARS.map((c) => c.id).filter((id) => id !== "training_dummy");

export const MODE_NAME = { duel: "1対1", team: "チーム戦", royale: "バトルロイヤル", boss: "ボス戦", tournament: "トーナメント", random: "ランダム対戦", free: "自由バトル" };

function newMatch(cfg) {
  const m = {
    id: `m${now()}`, mode: cfg.mode, dim: cfg.dim, center: cfg.center, stage: cfg.stage ?? "here", info: null, sides: [], state: "building",
    paused: false, snap: cfg.snap ?? null, cfg, stat: { maxCombo: 0, maxDamage: 0, finisher: null, mode: MODE_NAME[cfg.mode] ?? "" },
    fightTick: 0, startTick: now(), lastBlow: new Map(), free: cfg.mode === "free", ids: new Set(), finishing: false,
    entities() {
      const out = [];
      for (const id of this.ids) {
        const e = world.getEntity(id);
        if (e && isValid(e)) out.push(e);
      }
      return out;
    },
    active() {
      return this.entities().filter((e) => !isKO(e) && isBattler(e));
    },
  };
  return m;
}

/* ------------------------------------------------------------------------------- AI gate & dig rule */

setGate((e) => {
  const m = current;
  if (!m) return true;
  if (!m.ids.has(e.id)) return true;
  return m.state === "fight" && !m.paused;
});

setDigRule((dim, loc) => {
  const m = current;
  if (!m || m.free || m.stage === "here") return true;
  return dim.id === m.dim.id && inArea(m.center, loc);
});

/* ------------------------------------------------------------------------------- starting */

/** Final form at the end of a character's transformation chain. */
function finalForm(cid) {
  let id = cid;
  for (let i = 0; i < 6; i++) {
    const forms = profileOf(id).forms;
    if (!forms || !forms.length) break;
    id = forms[forms.length - 1].to;
  }
  return id;
}

/**
 * cfg: mode, sides: [{ cids: [...], hpMult?, label? }], stage, noForms, startFinal, hpMult
 * Starts in front of the player.
 */
export function startMatch(p, cfg, reuse = null) {
  if (current) endMatch(current, true);
  const dim = p.dimension;
  const view = p.getViewDirection();
  const flat = V.norm({ x: view.x, y: 0, z: view.z });
  // staged fights are built well clear of the player: the stage clears everything within R of its center
  const off = cfg.stage === "here" ? 14 : 38;
  const cx = Math.floor(p.location.x + flat.x * off);
  const cz = Math.floor(p.location.z + flat.z * off);
  const center = reuse?.center ?? { x: cx, y: groundY(dim, cx, cz, Math.floor(p.location.y)), z: cz };
  const m = newMatch(Object.assign({}, cfg, { dim, center }));
  m.tournament = cfg.tournament ?? null;
  current = m;
  for (const v of viewers(m)) msg(v, `§6${MODE_NAME[cfg.mode] ?? "試合"}§f の準備中… §7（${stageName(cfg.stage)}）`);
  if (reuse) {
    m.snap = reuse.snap;
    m.info = reuse.info;
    system.run(() => spawnAll(m));
    return m;
  }
  if (settings().restore) m.snap = snapshot(dim, center);
  buildStage(dim, center, cfg.stage, (info) => {
    if (current !== m) return;
    m.info = info;
    spawnAll(m);
  });
  return m;
}

function spawnAll(m) {
  const cfg = m.cfg;
  const n = cfg.sides.length;
  const total = cfg.sides.reduce((a, s) => a + s.cids.length, 0);
  const radius = m.info?.ring ? Math.min(6, m.info.ring.half * 0.6) : 9;
  cfg.sides.forEach((side, i) => {
    const team = TEAMS[i % TEAMS.length];
    const entry = { team, ids: [], cids: [], label: side.label ?? null };
    const ang = (i / n) * Math.PI * 2;
    const dir = { x: Math.cos(ang), y: 0, z: Math.sin(ang) };
    const perp = { x: -dir.z, y: 0, z: dir.x };
    side.cids.forEach((cid0, j) => {
      const cid = cfg.startFinal ? finalForm(cid0) : cid0;
      const k = side.cids.length;
      const pos = V.add(V.add(m.center, V.mul(dir, radius)), V.mul(perp, (j - (k - 1) / 2) * 2.6));
      const y = m.stage === "here" ? groundY(m.dim, Math.floor(pos.x), Math.floor(pos.z), m.center.y) : m.info?.top ?? m.center.y;
      const e = spawnFighter(cid, m.dim, { x: pos.x + 0.5, y, z: pos.z + 0.5 }, {
        team, intro: true, noForms: !!cfg.noForms, hpMult: (side.hpMult ?? 1) * (cfg.hpMult ?? settings().hpMult),
        boss: total <= 4 || !!side.boss, match: m.id,
      });
      if (!e) return;
      entry.ids.push(e.id);
      entry.cids.push(cid0);
      m.ids.add(e.id);
      try {
        e.triggerEvent("dbb:freeze");
        e.teleport(e.location, { facingLocation: V.up(m.center, 1) });
      } catch {
        // ignore
      }
    });
    m.sides.push(entry);
  });
  m.state = "intro";
  intro(m);
}

/* ------------------------------------------------------------------------------- intro & countdown */

function intro(m) {
  const all = m.entities();
  let delay = 10;
  if (all.length <= 4) {
    const rival = all.length === 2 ? rivalLines(fighters.get(all[0].id)?.cid ?? "", fighters.get(all[1].id)?.cid ?? "") : null;
    all.forEach((e, i) => {
      system.runTimeout(() => {
        if (current !== m || !isValid(e)) return;
        const s = fighters.get(e.id);
        if (!s) return;
        introShot(e, 40);
        setAura(e, true, s.cid);
        particle(e.dimension, "dbb:shockwave", e.location, "white", 2);
        sound(e.dimension, "dbb.aura_burst", e.location, 1.5);
        const st = TEAM_STYLE[teamOf(e) ?? "white"];
        bigTitle(m, `${st.color}§l${charName(s.cid)}`, `§7戦闘力 ${fmtPL(powerOf(e))}`, 32);
        speak(s, "start", rival ? rival[i] : undefined);
        system.runTimeout(() => isValid(e) && setAura(e, false, s.cid), 30);
      }, delay);
      delay += 42;
    });
  } else {
    system.runTimeout(() => {
      if (current !== m) return;
      bigTitle(m, `§6§l${MODE_NAME[m.mode] ?? "バトル"}`, `§7${all.length}人の戦士が集結！`, 40);
      for (const e of all) {
        const s = fighters.get(e.id);
        if (s && Math.random() < 0.35) speak(s, "start");
      }
    }, delay);
    delay += 50;
  }
  system.runTimeout(() => {
    if (current !== m) return;
    cut(70, () => V.add(m.center, { x: 0, y: 9, z: -14 }), () => V.up(m.center, 1.5));
    say(m, pick(["さあ、いよいよ試合開始です！", "両者にらみ合う…！ 会場は静まり返っている！", "どんな戦いになるのか、目が離せません！"]), 0, true);
  }, delay);
  for (let i = 3; i >= 1; i--) {
    const k = 4 - i;
    system.runTimeout(() => {
      if (current !== m) return;
      for (const p of viewers(m)) {
        title(p, `§e§l${i}`, "", 12);
        try {
          p.playSound("dbb.countdown", { volume: 1 });
        } catch {
          // ignore
        }
      }
    }, delay + 10 + k * 18);
  }
  system.runTimeout(() => {
    if (current !== m) return;
    for (const p of viewers(m)) {
      title(p, "§c§lファイト！！", "", 20);
      try {
        p.playSound("dbb.gong", { volume: 1 });
      } catch {
        // ignore
      }
    }
    release(m);
  }, delay + 10 + 4 * 18);
}

function release(m) {
  m.state = "fight";
  m.fightTick = now();
  for (const e of m.entities()) {
    const s = fighters.get(e.id);
    if (s) {
      s.intro = false;
      s.started = now();
    }
    try {
      e.triggerEvent("dbb:unfreeze");
    } catch {
      // ignore
    }
  }
}

/* ------------------------------------------------------------------------------- watching the fight */

on("hurt", (victim, attacker, amount, opts) => {
  const m = current;
  if (!m || !m.ids.has(victim.id)) return;
  const label = opts.label ?? (opts.beam ? "気功波" : opts.melee ? "打撃" : opts.area ? "爆発" : "気弾");
  m.lastBlow.set(victim.id, { label, by: attacker?.id });
});

on("fighterDown", (e) => {
  const m = current;
  if (!m || !m.ids.has(e.id)) return;
  m.stat.finisher = m.lastBlow.get(e.id)?.label ?? m.stat.finisher;
  m.lastDown = e.location;
  system.run(() => check(m));
});

on("fighterGone", () => {
  if (current) system.run(() => check(current));
});

function timeLimit(m) {
  return (m.mode === "tournament" ? 180 : 300) * 20;
}

system.runInterval(() => {
  const m = current;
  if (!m) return;
  if (m.free) {
    checkFree(m);
    return;
  }
  if (m.state !== "fight" || m.paused) return;
  for (const e of m.active()) {
    if (m.info?.ring && (m.cfg.ringOut ?? true) && outOfRing(m.center, m.info, e.location)) {
      m.stat.finisher = "場外";
      bigTitle(m, "§c§l場外！！", `§7${charName(fighters.get(e.id)?.cid ?? "")}`, 30);
      say(m, `${charName(fighters.get(e.id)?.cid ?? "")}、場外ーっ！！`, 0, true);
      hurt(e, 1e9, undefined, { raw: true, unblockable: true });
    }
  }
  if (now() - m.fightTick > timeLimit(m)) decide(m);
  else check(m);
}, 10);

function sideAlive(m, side) {
  return side.ids.filter((id) => {
    const e = world.getEntity(id);
    return e && isValid(e) && !isKO(e) && isBattler(e);
  }).length;
}

function check(m) {
  if (m.free || m.state !== "fight" || m.finishing) return;
  const alive = m.sides.filter((s) => sideAlive(m, s) > 0);
  if (alive.length <= 1) finish(m, alive[0] ?? null);
}

/** Time is up: the side with the most health left wins. */
function decide(m) {
  if (m.finishing) return;
  let best = null;
  let bestScore = -1;
  for (const side of m.sides) {
    let score = 0;
    for (const id of side.ids) {
      const e = world.getEntity(id);
      if (e && isValid(e) && !isKO(e)) score += hpFrac(e);
    }
    if (score > bestScore) {
      bestScore = score;
      best = side;
    }
  }
  bigTitle(m, "§e§l時間切れ！", "§7判定で勝敗を決めます", 40);
  say(m, "時間切れー！ 判定です！", 0, true);
  m.stat.finisher = "判定";
  for (const side of m.sides) {
    if (side === best) continue;
    for (const id of side.ids) {
      const e = world.getEntity(id);
      if (e && isValid(e) && !isKO(e)) hurt(e, 1e9, undefined, { raw: true, unblockable: true });
    }
  }
  finish(m, best);
}

/* ------------------------------------------------------------------------------- the result */

function finish(m, side) {
  if (m.finishing) return;
  m.finishing = true;
  m.state = "result";
  const secs = Math.round((now() - m.fightTick) / 20);
  const winners = side ? side.ids.map((id) => world.getEntity(id)).filter((e) => e && isValid(e)) : [];
  // the final blow: a white flash, a blast where the loser fell, everyone frozen for a beat
  for (const p of viewers(m)) flash(p, { red: 1, green: 1, blue: 1 }, 0.12);
  if (m.lastDown) boom(m.dim, V.up(m.lastDown, 1), "white", 3);
  for (const e of winners) {
    try {
      e.triggerEvent("dbb:freeze");
    } catch {
      // ignore
    }
  }
  if (winners[0]) winnerShot(winners[0], 90);
  system.runTimeout(() => {
    const team = side ? TEAM_STYLE[side.team] : null;
    const names = winners.map((e) => charName(fighters.get(e.id)?.cid ?? ""));
    const head = !side ? "§7引き分け…" : winners.length === 1 ? `§6§l勝者：${names[0]}！！` : `${team.color}§l${side.label ?? team.name + "チーム"}の勝利！！`;
    bigTitle(m, head, `§7決め技：${m.stat.finisher ?? "-"}　試合時間 ${secs}秒`, 70);
    sound(m.dim, "dbb.cheer", m.center, 3);
    for (const e of winners) {
      const s = fighters.get(e.id);
      if (!s) continue;
      setAura(e, true, s.cid);
      setPose(e, "none");
      particle(e.dimension, "dbb:aura_rise", e.location, "gold", 1.5);
      speak(s, "win");
    }
    say(m, side ? `決着ーっ！！ ${names.join("、")}の勝利だーっ！！` : "なんと相打ち！ 引き分けだー！", 0, true);
    const wc = side ? side.cids : [];
    const lc = m.sides.filter((x) => x !== side).flatMap((x) => x.cids);
    m.stat.secs = secs;
    if (m.mode !== "free") recordResult(wc, lc, m.stat);
    emit("matchOver", m, side);
  }, 22);
  system.runTimeout(() => {
    clearAll();
    if (m.tournament) tournamentNext(m, side);
    else endMatch(m, false);
  }, 150);
}

/** Tear down: remove the fighters, put the stage back, give the camera back. */
export function endMatch(m, abort) {
  if (!m) return;
  if (current === m) current = null;
  m.state = "done";
  clearAll();
  for (const e of m.entities()) {
    try {
      e.remove();
    } catch {
      // ignore
    }
  }
  cleanupStray(m.dim);
  try {
    for (const it of m.dim.getEntities({ type: "minecraft:item", location: m.center, maxDistance: 40 })) it.remove();
  } catch {
    // ignore
  }
  if (m.snap && (!m.tournament || abort || m.tournament.done)) {
    const snap = m.snap;
    system.runTimeout(() => restore(snap), 2);
  }
  releaseAll();
  if (abort) for (const p of viewers(m)) msg(p, "§7試合を終了しました。");
}

/* ------------------------------------------------------------------------------- pause */

export function togglePause(m) {
  if (!m || m.state !== "fight") return false;
  m.paused = !m.paused;
  for (const e of m.active()) {
    try {
      if (m.paused) {
        e.triggerEvent("dbb:freeze");
        e.triggerEvent("dbb:bt_clear");
        e.clearVelocity();
      } else {
        e.triggerEvent("dbb:unfreeze");
        const t = teamOf(e);
        if (t) e.triggerEvent(`dbb:bt_${t}`);
      }
    } catch {
      // ignore
    }
  }
  bigTitle(m, m.paused ? "§c§l一時停止" : "§a§l再開！", "", 20);
  return true;
}

/* ------------------------------------------------------------------------------- tournaments */

/** entrants: character ids (8 or 16). Each round's matches run one after another on the same stage. */
export function startTournament(p, entrants, opts) {
  const list = [...entrants];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  const t = { round: 1, queue: [], winners: [], all: list, opts, done: false, player: p.id, n: 0 };
  for (let i = 0; i < list.length; i += 2) t.queue.push([list[i], list[i + 1]]);
  announceBracket(p, t);
  nextBout(p, t, null);
}

function roundName(t) {
  const left = t.queue.length + t.winners.length;
  if (left === 1 && t.queue.length === 1) return "決勝戦";
  if (t.queue.length + t.winners.length === 2) return "準決勝";
  return `${t.round}回戦`;
}

function announceBracket(p, t) {
  const lines = [`§6§l天下一武道会 ${roundName(t)}`];
  t.queue.forEach(([a, b], i) => lines.push(`§f第${i + 1}試合：§e${charName(a)} §7vs §e${charName(b)}`));
  for (const pl of p.dimension.getPlayers({ location: p.location, maxDistance: 200 })) msg(pl, lines.join("\n"));
}

function nextBout(p, t, prev) {
  const pair = t.queue.shift();
  if (!pair) return;
  t.n++;
  const cfg = {
    mode: "tournament", stage: t.opts.stage ?? "ring", sides: [{ cids: [pair[0]] }, { cids: [pair[1]] }], noForms: !!t.opts.noForms,
    startFinal: !!t.opts.startFinal, hpMult: t.opts.hpMult, ringOut: t.opts.ringOut ?? true, tournament: t,
  };
  const reuse = prev ? { center: prev.center, info: prev.info, snap: prev.snap } : null;
  const m = startMatch(p, cfg, reuse);
  for (const v of viewers(m)) msg(v, `§6${roundName(t)} §f第${t.n}試合：§e${charName(pair[0])} §7vs §e${charName(pair[1])}`);
}

function tournamentNext(m, side) {
  const t = m.tournament;
  const winner = side?.cids[0] ?? m.sides[Math.floor(rand(0, m.sides.length))].cids[0];
  t.winners.push(winner);
  // clear the ring for the next bout
  for (const e of m.entities()) {
    try {
      e.remove();
    } catch {
      // ignore
    }
  }
  const p = world.getEntity(t.player) ?? world.getAllPlayers()[0];
  if (!p) {
    t.done = true;
    endMatch(m, true);
    return;
  }
  if (!t.queue.length) {
    if (t.winners.length === 1) {
      t.done = true;
      for (const v of viewers(m)) title(v, "§6§l優勝！！", `§e${charName(winner)}`, 80);
      say(m, `天下一武道会、優勝は… ${charName(winner)}だーーっ！！`, 0, true);
      sound(m.dim, "dbb.cheer", m.center, 3);
      endMatch(m, false);
      return;
    }
    t.round++;
    for (let i = 0; i < t.winners.length; i += 2) t.queue.push([t.winners[i], t.winners[i + 1] ?? t.winners[i]]);
    t.winners = [];
    t.n = 0;
    announceBracket(p, t);
  }
  current = null;
  nextBout(p, t, m);
}

/* ------------------------------------------------------------------------------- free battles (tools) */

/** The battle the tools add fighters to (created on demand where the fighter stands). */
export function freeMatch(e) {
  if (current && !current.free) {
    current.ids.add(e.id);
    return current;
  }
  if (!current) {
    current = newMatch({ mode: "free", dim: e.dimension, center: e.location, stage: "here" });
    current.state = "fight";
    current.fightTick = now();
  }
  current.ids.add(e.id);
  current.lastActive = now();
  return current;
}

/** Free battles: teams fight until one team is left; each duel slot ends on its own. */
function checkFree(m) {
  const list = m.entities();
  // sides for the HUD
  const bySide = new Map();
  for (const e of list) {
    const t = teamOf(e) ?? fighters.get(e.id)?.lastTeam;
    if (!t) continue;
    if (!bySide.has(t)) bySide.set(t, { team: t, ids: [], cids: [], label: null });
    bySide.get(t).ids.push(e.id);
  }
  m.sides = [...bySide.values()];
  if (list.length) m.center = list[0].location;
  const active = list.filter((e) => !isKO(e) && isBattler(e));
  if (active.length) m.lastActive = now();
  // team fights
  const teams = new Set(active.map((e) => teamOf(e)).filter(Boolean));
  if (teams.size >= 2) m.contested = true;
  else if (m.contested) {
    m.contested = false;
    const [t] = [...teams];
    if (t) bigTitle(m, `${TEAM_STYLE[t].color}§l${TEAM_STYLE[t].name}チームの勝利！！`, "", 60);
    else bigTitle(m, "§7引き分け…", "", 40);
    sound(m.dim, "dbb.cheer", m.center, 2.5);
    for (const e of active) {
      const s = fighters.get(e.id);
      if (s) speak(s, "win");
    }
  }
  // duels
  for (let k = 1; k <= SLOTS; k++) {
    const members = list.filter((e) => huntSlots(e).includes(k) || preySlots(e).includes(k));
    if (!members.length) continue;
    const up = members.filter((e) => !isKO(e) && isBattler(e));
    if (up.length >= 2) continue;
    for (const e of members) {
      if (isKO(e)) continue;
      const s = fighters.get(e.id);
      if (s) {
        bigTitle(m, `§d§l${charName(s.cid)}の勝ち！`, "§7一騎打ち", 60);
        speak(s, "win");
      }
      leaveBattle(e);
    }
  }
  // knocked-out fighters get back up after a while in free battles
  for (const e of list) {
    if (isKO(e) && now() - (fighters.get(e.id)?.koAt ?? now()) > 200) {
      revive(e);
      m.ids.delete(e.id);
    }
  }
  if (!active.length && now() - (m.lastActive ?? 0) > 200) {
    current = null;
    m.state = "done";
    releaseAll();
  }
}

on("fighterDown", (e) => {
  const s = fighters.get(e.id);
  if (s) s.koAt = now();
});

/* ------------------------------------------------------------------------------- quick builders for menus */

export function randomCid(exclude = []) {
  const pool = ROSTER.filter((c) => !exclude.includes(c));
  return pool[Math.floor(Math.random() * pool.length)];
}

export function randomBattle(p) {
  const a = randomCid();
  const b = randomCid([a]);
  const stage = pick(STAGES.filter((s) => s.id !== "here")).id;
  return startMatch(p, { mode: "random", stage, sides: [{ cids: [a] }, { cids: [b] }] });
}

