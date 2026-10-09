import { system, world } from "@minecraft/server";
import { CHARS, CHAR_INDEX, HP_TIERS, POSE } from "../gen/catalog.js";
import { statsFor, profileOf, styleOf, lineFor } from "./roster.js";
import { settings } from "../core/settings.js";
import { V, clamp, isValid, chance, rand } from "../core/util.js";
import { particle, deco, sound, shakeArea, afterimage, watchers, msg } from "../core/fx.js";
import { emit, on } from "../core/bus.js";
import { setPL, powerOf, hold, isKO, clearKO, setDefenseHook, hurt } from "../combat/damage.js";
import { crackGround } from "../combat/terrain.js";
import { setTeam, clearBattleTags, TEAM_STYLE, teamOf } from "../combat/teams.js";

/* Fighter entities: spawning, state, transformations, knock-outs, guarding and dodging. */

/** id -> AI state */
export const fighters = new Map();

export function charName(cid) {
  const c = CHARS[CHAR_INDEX[cid]];
  return c ? c.name : "戦士";
}

export function setPose(e, name) {
  try {
    e.setProperty("dbb:pose", POSE[name] ?? 0);
  } catch {
    // ignore
  }
}

export function setAura(e, on, cid) {
  try {
    e.setProperty("dbb:aura", on ? (CHARS[CHAR_INDEX[cid]]?.aura ?? 1) : 0);
  } catch {
    // ignore
  }
}

function tierFor(hp) {
  for (const t of HP_TIERS) if (t >= hp) return t;
  return HP_TIERS[HP_TIERS.length - 1];
}

/**
 * Spawn a character.
 * opts: team (enters battle right away), hpMult, noForms, boss (boss bar), intro (frozen until released)
 */
export function spawnFighter(cid, dim, loc, opts = {}) {
  if (CHAR_INDEX[cid] === undefined) return null;
  let e;
  try {
    e = dim.spawnEntity("dbb:fighter", loc);
  } catch {
    return null;
  }
  setupFighter(e, cid, opts);
  return e;
}

export function setupFighter(e, cid, opts = {}) {
  const st = statsFor(cid);
  const hp = Math.max(10, st.hp * (opts.hpMult ?? settings().hpMult));
  try {
    e.setProperty("dbb:char", CHAR_INDEX[cid]);
    e.setProperty("dbb:scale", CHARS[CHAR_INDEX[cid]].scale);
    e.setProperty("dbb:aura", 0);
    e.triggerEvent(`dbb:size_${CHARS[CHAR_INDEX[cid]].size}`);
    e.triggerEvent(`dbb:hp_${tierFor(hp)}`);
    e.setDynamicProperty("dbb:cid", cid);
    e.setDynamicProperty("dbb:melee", st.melee);
    e.setDynamicProperty("dbb:maxhp", hp);
  } catch {
    // ignore
  }
  system.run(() => {
    try {
      e.getComponent("minecraft:health")?.resetToMaxValue();
    } catch {
      // ignore
    }
  });
  setPL(e, st.pl);
  const s = newState(e, cid, opts);
  fighters.set(e.id, s);
  label(s);
  if (opts.team) enterBattle(e, opts.team);
  else setRole(e, "idle");
  if (opts.boss) bossBar(e, true);
  return s;
}

function newState(e, cid, opts) {
  return {
    id: e.id, e, cid, origin: cid, tick: 0, cd: {}, busyUntil: 0, flying: false, flyUntil: 0, act: null, charge: null,
    transforming: 0, buff: null, stun: 0, guardUntil: 0, chase: null, chain: 0, lastMove: system.currentTick, lastPos: e.location,
    noForms: !!opts.noForms, formsDone: new Set(), pinchSaid: false, awakened: false, started: system.currentTick, intro: !!opts.intro,
    targetId: null, targetUntil: 0, match: opts.match ?? null, firstTransform: true, combo: { target: null, count: 0, last: 0 },
  };
}

function setRole(e, role) {
  try {
    e.triggerEvent(`dbb:role_${role}`);
  } catch {
    // ignore
  }
}

export function bossBar(e, on) {
  try {
    e.triggerEvent(on ? "dbb:boss_on" : "dbb:boss_off");
  } catch {
    // ignore
  }
}

/** Name tag in team colors. */
export function label(s) {
  const t = teamOf(s.e);
  const color = t ? TEAM_STYLE[t]?.color ?? "§f" : "§f";
  try {
    s.e.nameTag = isKO(s.e) ? `§7${charName(s.cid)}（ダウン）` : `${color}${charName(s.cid)}`;
  } catch {
    // ignore
  }
}

/** Put a fighter on a team and let it fight. */
export function enterBattle(e, team) {
  const s = fighters.get(e.id);
  clearKO(e);
  setTeam(e, team);
  setRole(e, "battle");
  try {
    e.triggerEvent(`dbb:bt_${team}`);
  } catch {
    // ignore
  }
  if (s) {
    s.act = null;
    s.charge = null;
    s.started = system.currentTick;
    s.lastTeam = team;
    label(s);
  }
}

/** Back to standing around (and safe from harm). */
export function leaveBattle(e) {
  const s = fighters.get(e.id);
  clearBattleTags(e);
  try {
    e.triggerEvent("dbb:bt_clear");
  } catch {
    // ignore
  }
  setRole(e, "idle");
  if (s) {
    s.act = null;
    s.charge = null;
    setFlying(s, false);
    setAura(e, false, s.cid);
    setPose(e, "none");
    label(s);
  }
}

export function setFlying(s, on) {
  if (s.flying === on) return;
  s.flying = on;
  try {
    s.e.triggerEvent(on ? "dbb:fly_on" : "dbb:fly_off");
  } catch {
    // ignore
  }
  setPose(s.e, on ? "fly" : "none");
}

/** Swap the model / stats to another form, keeping the health fraction (plus a heal when transforming). */
export function setChar(s, cid, healFrac = 0) {
  const e = s.e;
  const h = e.getComponent("minecraft:health");
  const frac = h ? h.currentValue / h.effectiveMax : 1;
  const st = statsFor(cid);
  const hp = Math.max(10, st.hp * settings().hpMult);
  try {
    e.setProperty("dbb:char", CHAR_INDEX[cid]);
    e.setProperty("dbb:scale", CHARS[CHAR_INDEX[cid]].scale);
    e.triggerEvent(`dbb:size_${CHARS[CHAR_INDEX[cid]].size}`);
    e.triggerEvent(`dbb:hp_${tierFor(hp)}`);
    e.setDynamicProperty("dbb:cid", cid);
    e.setDynamicProperty("dbb:melee", st.melee);
    e.setDynamicProperty("dbb:maxhp", hp);
  } catch {
    // ignore
  }
  setPL(e, st.pl);
  s.cid = cid;
  system.run(() => {
    try {
      const hh = e.getComponent("minecraft:health");
      hh.setCurrentValue(clamp((Math.min(1, frac + healFrac)) * hh.effectiveMax, 1, hh.effectiveMax));
    } catch {
      // ignore
    }
  });
  label(s);
}

export function hpFrac(e) {
  try {
    const h = e.getComponent("minecraft:health");
    return h.currentValue / h.effectiveMax;
  } catch {
    return 1;
  }
}

/** Short speech bubble in chat for everyone watching. */
export function speak(s, kind, text) {
  if (!settings().lines) return;
  const line = text ?? lineFor(s.cid, kind);
  if (!line) return;
  for (const p of watchers(s.e.dimension, s.e.location, 140)) msg(p, `§e${charName(s.cid)}§r「${line}」`);
}

/* ------------------------------------------------------------------------------- transformation */

/** Transform with a full power-up scene; others hold off while it happens. */
export function transform(s, to) {
  const e = s.e;
  if (CHAR_INDEX[to] === undefined || s.transforming > 0) return;
  const from = s.cid;
  const long = s.firstTransform;
  s.firstTransform = false;
  s.transforming = long ? 64 : 40;
  s.act = null;
  s.charge = null;
  hold(e, s.transforming);
  setPose(e, "transform");
  try {
    e.setProperty("dbb:aura", CHARS[CHAR_INDEX[to]]?.aura ?? 1);
  } catch {
    // ignore
  }
  sound(e.dimension, "dbb.charge", e.location, 2.5);
  sound(e.dimension, "dbb.rumble", e.location, 3);
  speak(s, "transform");
  emit("transformStart", s, from, to);
  const total = s.transforming;
  const step = () => {
    if (!isValid(e) || s.transforming <= 0) return;
    s.transforming -= 2;
    const done = total - s.transforming;
    particle(e.dimension, "dbb:aura_rise", e.location, "white", 1.2);
    if (done % 4 === 0) particle(e.dimension, "dbb:lightning", V.up(e.location, rand(0.5, 2)), "white", 1.2);
    if (done % 6 === 0) {
      deco(e.dimension, "dbb:dust_rise", e.location, "white", 2);
      shakeArea(e.dimension, e.location, 40, 0.3 + done / total, 0.4);
    }
    if (done === Math.floor(total / 2)) crackGround(e.dimension, V.up(e.location, -1), 5);
    if (s.transforming <= 0) {
      setChar(s, to, 0.3);
      particle(e.dimension, "dbb:explosion_core", V.up(e.location, 1), "white", 4);
      particle(e.dimension, "dbb:shockwave", e.location, "white", 6);
      particle(e.dimension, "dbb:glow_burst", V.up(e.location, 1), "gold", 3);
      sound(e.dimension, "dbb.transform", e.location, 3);
      sound(e.dimension, "dbb.aura_burst", e.location, 3);
      shakeArea(e.dimension, e.location, 50, 1.2, 0.9);
      setPose(e, s.flying ? "fly" : "none");
      system.runTimeout(() => isValid(e) && !s.act && setAura(e, false, s.cid), 40);
      emit("transformed", s, from, to);
      return;
    }
    system.runTimeout(step, 2);
  };
  system.runTimeout(step, 2);
}

/* ------------------------------------------------------------------------------- defense */

/** Guarding, dodging and counters, applied to every hit a fighter takes. */
setDefenseHook((target, attacker, amount, opts) => {
  const s = fighters.get(target.id);
  if (!s) return amount;
  const now = system.currentTick;
  if (s.transforming > 0) return amount * 0.15;
  if (opts.unblockable) return amount;
  const prof = profileOf(s.cid);
  const style = styleOf(s.cid);
  // dodge: only against single blows and blasts, not wide beams or explosions
  if (!opts.beam && !opts.area && !s.act && now - (s.cd.dodge ?? -99) > 24 && chance(Math.min(0.55, (prof.dodge ?? 0.1) * 0.6))) {
    s.cd.dodge = now;
    dodgeStep(s, attacker);
    return 0;
  }
  if (now < s.guardUntil) {
    particle(target.dimension, "dbb:impact", V.up(target.location, 1.2), "white", 1.2);
    sound(target.dimension, "dbb.guard", target.location, 1.2);
    // calm and stoic fighters punish a blocked blow
    if (attacker && isValid(attacker) && chance(style.guard * 0.25)) {
      system.runTimeout(() => {
        if (isValid(attacker) && isValid(target) && !isKO(target)) {
          hurt(attacker, (target.getDynamicProperty("dbb:melee") ?? 6) * 1.2, target,
            { knock: { dir: V.sub(attacker.location, target.location), h: 1.4, v: 0.35 }, hitstop: 3, label: "カウンター" });
          emit("counter", s, attacker);
        }
      }, 4);
    }
    return amount * 0.3;
  }
  // a toying villain shrugs off weak hits
  if (attacker && powerOf(target) > powerOf(attacker) * 6 && chance(0.4)) {
    particle(target.dimension, "dbb:impact", V.up(target.location, 1.2), "white", 0.8);
    return amount * 0.2;
  }
  return amount;
});

/** Vanish with an afterimage and reappear beside (or behind) the attacker. */
export function dodgeStep(s, attacker) {
  const e = s.e;
  afterimage(e.dimension, e.location, "white");
  sound(e.dimension, "dbb.dash", e.location, 1);
  let dest;
  if (attacker && isValid(attacker) && chance(0.5)) {
    const back = V.norm(V.sub(e.location, attacker.location));
    dest = V.add(attacker.location, V.mul({ x: -back.x, y: 0, z: -back.z }, 2));
  } else {
    const side = V.norm({ x: rand(-1, 1), y: 0, z: rand(-1, 1) });
    dest = V.add(e.location, V.mul(side, 3.5));
  }
  try {
    e.teleport(dest, { checkForBlocks: true, facingLocation: attacker && isValid(attacker) ? V.up(attacker.location, 1.2) : undefined });
  } catch {
    // ignore
  }
  emit("dodged", s, attacker);
}

/* ------------------------------------------------------------------------------- knock-outs */

on("ko", (e, attacker) => {
  const s = fighters.get(e.id);
  if (!s) return;
  s.act = null;
  s.charge = null;
  s.transforming = 0;
  setFlying(s, false);
  setAura(e, false, s.cid);
  clearBattleTags(e);
  try {
    e.triggerEvent("dbb:bt_clear");
    e.triggerEvent("dbb:role_idle");
  } catch {
    // ignore
  }
  setPose(e, "down");
  label(s);
  speak(s, "lose");
  particle(e.dimension, "dbb:explosion_smoke", e.location, "white", 1.5);
  emit("fighterDown", e, attacker, s);
});

on("candied", (e, attacker) => {
  const s = fighters.get(e.id);
  if (s) speak(s, "lose", "お、お菓子に…！？");
  hurt(e, 1e9, attacker, { raw: true, unblockable: true });
  system.runTimeout(() => {
    try {
      if (isValid(e)) e.remove();
    } catch {
      // ignore
    }
  }, 4);
});

/** Pick a fighter up after a knock-out (between tournament rounds, or when a match ends). */
export function revive(e, full = true) {
  const s = fighters.get(e.id);
  clearKO(e);
  try {
    const h = e.getComponent("minecraft:health");
    if (full) h.resetToMaxValue();
  } catch {
    // ignore
  }
  setPose(e, "none");
  if (s) {
    s.act = null;
    s.charge = null;
    s.transforming = 0;
    label(s);
  }
}

/* ------------------------------------------------------------------------------- adopt after reload */

export function adopt(e) {
  if (!isValid(e) || e.typeId !== "dbb:fighter" || fighters.has(e.id)) return;
  const cid = e.getDynamicProperty("dbb:cid");
  if (typeof cid !== "string" || CHAR_INDEX[cid] === undefined) return;
  setPL(e, statsFor(cid).pl);
  const s = newState(e, cid, {});
  fighters.set(e.id, s);
  // a fighter left over from an unfinished match goes back to standing around
  if (teamOf(e)) leaveBattle(e);
  if (isKO(e)) revive(e);
  label(s);
}

world.afterEvents.entityLoad.subscribe((ev) => adopt(ev.entity));
world.afterEvents.entityRemove.subscribe((ev) => fighters.delete(ev.removedEntityId));
world.afterEvents.entityDie.subscribe((ev) => fighters.delete(ev.deadEntity.id));

export function adoptAll() {
  for (const id of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
    try {
      for (const e of world.getDimension(id).getEntities({ type: "dbb:fighter" })) adopt(e);
    } catch {
      // ignore
    }
  }
}
