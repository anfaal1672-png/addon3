import { system, world } from "@minecraft/server";
import { CHARS, CHAR_INDEX, HP_TIERS, AURA } from "../gen/catalog.js";
import { statsFor, profileOf } from "./chars.js";
import { settings, rt, getData } from "../core/data.js";
import { V, clamp, isValid, chance, rand, pick } from "../core/util.js";
import { particle, sound, title, afterimage, shakeArea, msg } from "../core/fx.js";
import { setFighterPL, isHostile, hurt, powerOfAny } from "../combat/damage.js";
import { fireBlast, fireBeam, explode, blastsNear, activeBeamOf } from "../combat/projectiles.js";
import { setPose } from "../combat/forms.js";
import { emit, on } from "../core/bus.js";
import { findBattleTarget } from "../battle/core.js";

/** id -> AI state */
export const fighters = new Map();

function tierFor(hp) {
  for (const t of HP_TIERS) if (t >= hp) return t;
  return HP_TIERS[HP_TIERS.length - 1];
}

function prop(e, k) {
  try {
    return e.getDynamicProperty(k);
  } catch {
    return undefined;
  }
}

/**
 * Spawn a character.
 * opts: role ('npc'|'enemy'|'spar'|'ally'|'passive'|'dummy'), boss, level, owner (player), name, hpMult, plMult, home, tag
 */
export function spawnFighter(cid, dim, loc, opts = {}) {
  const idx = CHAR_INDEX[cid];
  if (idx === undefined) return null;
  let e;
  try {
    e = dim.spawnEntity("dbz:fighter", loc);
  } catch {
    return null;
  }
  setupFighter(e, cid, opts);
  return e;
}

export function setupFighter(e, cid, opts = {}) {
  const c = CHARS[CHAR_INDEX[cid]];
  const st = statsFor(cid, opts.level);
  const role = opts.role ?? "npc";
  const diff = settings().difficulty;
  let hp = st.hp * (opts.hpMult ?? 1);
  if (role === "enemy") hp *= Math.sqrt(diff);
  const pl = st.pl * (opts.plMult ?? 1);
  try {
    e.setProperty("dbz:char", CHAR_INDEX[cid]);
    e.setProperty("dbz:scale", c.scale);
    e.setProperty("dbz:aura", 0);
    e.triggerEvent(`dbz:size_${c.size}`);
    e.triggerEvent(`dbz:hp_${tierFor(hp)}`);
    e.triggerEvent(`dbz:role_${role}`);
    if (opts.boss) e.triggerEvent("dbz:boss_on");
    if (opts.mob) e.triggerEvent("dbz:mob");
    e.setDynamicProperty("dbz:cid", cid);
    e.setDynamicProperty("dbz:melee", st.melee);
    e.setDynamicProperty("dbz:role", role);
    e.setDynamicProperty("dbz:boss", !!opts.boss);
    if (opts.owner) e.setDynamicProperty("dbz:owner", opts.owner.id);
    if (opts.tag) e.addTag(opts.tag);
    if (opts.home) e.setDynamicProperty("dbz:home", JSON.stringify(opts.home));
    e.nameTag = opts.name ?? (role === "enemy" && opts.boss ? `§c${c.name}` : role === "ally" ? `§a${c.name}` : c.name);
  } catch {
    // ignore
  }
  setFighterPL(e, pl);
  const s = { id: e.id, e, cid, role, cd: {}, flying: false, charge: null, home: opts.home ?? null, owner: opts.owner?.id ?? null,
    boss: !!opts.boss, stun: 0, lastTp: 0, transforming: 0, level: opts.level ?? profileOf(cid).rec, tick: 0, sparWith: opts.sparWith ?? null,
    forms: opts.forms ?? null, noForms: !!opts.noForms };
  fighters.set(e.id, s);
  return s;
}

/** Re-attach AI to fighters that were saved with the world. */
export function adopt(e) {
  if (!isValid(e) || e.typeId !== "dbz:fighter" || fighters.has(e.id)) return;
  const cid = prop(e, "dbz:cid");
  if (typeof cid !== "string") return;
  const role = prop(e, "dbz:role") ?? "npc";
  let home = null;
  try {
    const h = prop(e, "dbz:home");
    home = typeof h === "string" ? JSON.parse(h) : null;
  } catch {
    home = null;
  }
  const st = statsFor(cid);
  const pl = prop(e, "dbz:pl");
  setFighterPL(e, typeof pl === "number" ? pl : st.pl);
  fighters.set(e.id, { id: e.id, e, cid, role, cd: {}, flying: false, charge: null, home, owner: prop(e, "dbz:owner") ?? null,
    boss: prop(e, "dbz:boss") === true, stun: 0, lastTp: 0, transforming: 0, level: profileOf(cid).rec, tick: 0, sparWith: null });
}

world.afterEvents.entityLoad.subscribe((ev) => adopt(ev.entity));
world.afterEvents.entityRemove.subscribe((ev) => fighters.delete(ev.removedEntityId));
on("stunned", (e, ticks) => {
  const s = fighters.get(e.id);
  if (s) s.stun = ticks;
});

export function setRole(e, role) {
  const s = fighters.get(e.id);
  try {
    e.triggerEvent(`dbz:role_${role}`);
    e.setDynamicProperty("dbz:role", role);
  } catch {
    // ignore
  }
  if (s) s.role = role;
}

export function setChar(e, cid, heal = true) {
  const s = fighters.get(e.id);
  const c = CHARS[CHAR_INDEX[cid]];
  if (!c) return;
  const st = statsFor(cid, s?.role === "ally" ? s.level : undefined);
  try {
    e.setProperty("dbz:char", CHAR_INDEX[cid]);
    e.setProperty("dbz:scale", c.scale);
    e.triggerEvent(`dbz:size_${c.size}`);
    e.setDynamicProperty("dbz:cid", cid);
    e.setDynamicProperty("dbz:melee", st.melee);
    if (heal) {
      let hp = st.hp;
      if (s?.role === "enemy") hp *= Math.sqrt(settings().difficulty);
      e.triggerEvent(`dbz:hp_${tierFor(hp)}`);
    }
    if (s?.boss) e.nameTag = `§c${c.name}`;
    else if (s?.role === "ally") e.nameTag = `§a${c.name}`;
    else e.nameTag = c.name;
  } catch {
    // ignore
  }
  if (s?.role !== "ally") setFighterPL(e, st.pl);
  if (s) s.cid = cid;
}

/* ===================================================================================== AI */

function hpFrac(e) {
  try {
    const h = e.getComponent("minecraft:health");
    return h.currentValue / h.effectiveMax;
  } catch {
    return 1;
  }
}

function findTarget(s) {
  const e = s.e;
  const dim = e.dimension;
  if (s.role === "battle") return findBattleTarget(e);
  if (s.role === "ally") {
    const owner = s.owner ? world.getEntity(s.owner) : null;
    const center = owner && isValid(owner) ? owner.location : e.location;
    let best = null;
    let bd = 22 * 22;
    for (const x of dim.getEntities({ location: center, maxDistance: 22, families: ["monster"] })) {
      if (!isHostile(e, x)) continue;
      const d = V.dist2(x.location, e.location);
      if (d < bd) {
        bd = d;
        best = x;
      }
    }
    return best;
  }
  if (s.role === "enemy" || s.role === "spar") {
    if (s.sparWith) {
      const p = world.getEntity(s.sparWith);
      return p && isValid(p) ? p : null;
    }
    let best = null;
    let bd = 40 * 40;
    for (const x of dim.getEntities({ location: e.location, maxDistance: 40 })) {
      if (x.typeId !== "minecraft:player" && !x.matches({ families: ["dbz_ally"] })) continue;
      if (x.typeId === "minecraft:player") {
        try {
          const gm = x.getGameMode();
          if (gm === "Creative" || gm === "Spectator") continue;
        } catch {
          // ignore
        }
        if (rt(x).hiddenKi && V.dist2(x.location, e.location) > 100) continue;
      }
      const d = V.dist2(x.location, e.location);
      if (d < bd) {
        bd = d;
        best = x;
      }
    }
    return best;
  }
  return null;
}

function face(e, loc) {
  try {
    e.teleport(e.location, { facingLocation: loc });
  } catch {
    // ignore
  }
}

function moveFly(s, target) {
  const e = s.e;
  const want = V.add(target.location, { x: 0, y: 1.5, z: 0 });
  const to = V.sub(want, e.location);
  const dist = V.len(to);
  const prof = profileOf(s.cid);
  const sp = (prof.fast ? 0.5 : 0.32) * (dist > 6 ? 1 : 0.4);
  try {
    e.clearVelocity();
    if (dist > 2.2) e.applyImpulse(V.mul(V.norm(to), sp));
  } catch {
    // ignore
  }
}

function setFlying(s, on) {
  if (s.flying === on) return;
  s.flying = on;
  try {
    s.e.triggerEvent(on ? "dbz:fly_on" : "dbz:fly_off");
  } catch {
    // ignore
  }
  setPose(s.e, on ? "fly" : "none");
}

function teleportBehind(s, target) {
  const e = s.e;
  const back = V.norm(target.getViewDirection());
  const dest = V.sub(target.location, V.mul({ x: back.x, y: 0, z: back.z }, 2));
  afterimage(e.dimension, e.location, "white");
  try {
    e.teleport(dest, { facingLocation: V.up(target.location, 1.2) });
  } catch {
    // ignore
  }
  sound(e.dimension, "dbz.dash", dest, 1);
}

function dodge(s) {
  const e = s.e;
  const side = { x: rand(-1, 1), y: 0, z: rand(-1, 1) };
  const dest = V.add(e.location, V.mul(V.norm(side), 3));
  afterimage(e.dimension, e.location, "white");
  try {
    e.teleport(dest, { checkForBlocks: true });
  } catch {
    // ignore
  }
}

function auraFor(cid) {
  const c = CHARS[CHAR_INDEX[cid]];
  return c?.aura ?? 1;
}

function useAttack(s, target, atk) {
  const e = s.e;
  const head = e.getHeadLocation();
  const aim = V.up(target.location, 1.1);
  face(e, aim);
  const dir = V.norm(V.sub(aim, head));
  if (atk.kind === "blast" || atk.kind === "ball" || atk.kind === "disc") {
    if (atk.charge && atk.kind === "ball") {
      startCharge(s, atk, target);
      return;
    }
    fireBlast(e, { color: atk.color, size: atk.size, speed: atk.speed, power: atk.power, radius: atk.radius, dir,
      from: V.add(head, V.mul(dir, 0.8)), homing: atk.kind === "disc", pierce: atk.kind === "disc", guided: false,
      shape: atk.kind === "disc" ? 1 : 0, life: 60 });
    setPose(e, "one_hand");
    system.runTimeout(() => isValid(e) && setPose(e, s.flying ? "fly" : "none"), 8);
    sound(e.dimension, "dbz.blast", e.location, 1);
  } else if (atk.kind === "beam") {
    startCharge(s, atk, target);
  } else if (atk.kind === "aoe") {
    setPose(e, "transform");
    explode(e.dimension, V.up(e.location, 1), atk.radius, atk.power, e, atk.color);
    system.runTimeout(() => isValid(e) && setPose(e, "none"), 10);
  }
}

function startCharge(s, atk, target) {
  s.charge = { atk, ticks: 0, target: target.id };
  setPose(s.e, atk.kind === "ball" ? "overhead" : "beam_charge");
  try {
    s.e.setProperty("dbz:aura", auraFor(s.cid));
  } catch {
    // ignore
  }
  sound(s.e.dimension, "dbz.beam_charge", s.e.location, 1.5);
  if (atk.name) {
    for (const p of s.e.dimension.getPlayers({ location: s.e.location, maxDistance: 40 })) {
      try {
        p.onScreenDisplay.setActionBar(`§c${CHARS[CHAR_INDEX[s.cid]].name}：「${atk.name}！！」`);
      } catch {
        // ignore
      }
    }
  }
}

function tickCharge(s) {
  const c = s.charge;
  const e = s.e;
  c.ticks++;
  const target = world.getEntity(c.target);
  if (!isValid(target)) {
    s.charge = null;
    return;
  }
  const aim = V.up(target.location, 1.1);
  face(e, aim);
  const head = e.getHeadLocation();
  const dir = V.norm(V.sub(aim, head));
  if (c.ticks % 2 === 0) particle(e.dimension, "dbz:charge_orb", V.add(head, V.mul(dir, 0.8)), c.atk.color, 1);
  if (c.ticks >= (c.atk.charge ?? 30)) {
    s.charge = null;
    const pw = c.atk.power;
    if (c.atk.kind === "beam") {
      fireBeam(e, { color: c.atk.color, width: c.atk.width, range: c.atk.range ?? 30, power: pw, pierce: c.atk.pierce,
        spiral: c.atk.spiral, candy: c.atk.candy, duration: 26, firePose: "beam_fire" });
    } else {
      fireBlast(e, { color: c.atk.color, size: c.atk.size, speed: c.atk.speed, power: pw, radius: c.atk.radius, dir,
        from: V.up(e.location, 3.5), life: 80 });
      setPose(e, "throw");
    }
    system.runTimeout(() => {
      if (!isValid(e)) return;
      try {
        e.setProperty("dbz:aura", 0);
      } catch {
        // ignore
      }
      setPose(e, s.flying ? "fly" : "none");
    }, 30);
  }
}

function checkForms(s) {
  const prof = profileOf(s.cid);
  const forms = s.forms ?? prof.forms;
  if (!forms || s.noForms || s.role === "ally") return;
  const f = hpFrac(s.e);
  for (const fm of forms) {
    if (f <= fm.at) {
      transformFighter(s, fm.to, fm.heal !== false);
      return;
    }
  }
}

export function transformFighter(s, to, heal = true) {
  const e = s.e;
  if (s.forms) s.forms = s.forms.filter((f) => f.to !== to);
  s.transforming = 34;
  setPose(e, "transform");
  try {
    e.triggerEvent("dbz:freeze");
    e.setProperty("dbz:aura", auraFor(to));
  } catch {
    // ignore
  }
  sound(e.dimension, "dbz.transform", e.location, 3);
  const name = CHARS[CHAR_INDEX[to]].name;
  for (const p of e.dimension.getPlayers({ location: e.location, maxDistance: 60 })) title(p, `§c${name}`, "§7さらに力を解放した…！", 40);
  system.runTimeout(() => {
    if (!isValid(e)) return;
    setChar(e, to, heal);
    try {
      e.triggerEvent("dbz:unfreeze");
    } catch {
      // ignore
    }
    particle(e.dimension, "dbz:explosion_core", V.up(e.location, 1), "white", 4);
    particle(e.dimension, "dbz:shockwave", e.location, "white", 5);
    sound(e.dimension, "dbz.aura_burst", e.location, 3);
    shakeArea(e.dimension, e.location, 40, 0.8, 0.8);
    setPose(e, "none");
    emit("fighterTransformed", e, to);
  }, 30);
}

function aiStep(s) {
  const e = s.e;
  if (!isValid(e)) {
    fighters.delete(s.id);
    return;
  }
  s.tick++;
  const prof = profileOf(s.cid);
  if (s.transforming > 0) {
    s.transforming -= 2;
    particle(e.dimension, "dbz:aura_rise", e.location, "white", 1);
    if (s.transforming % 6 === 0) particle(e.dimension, "dbz:lightning", e.location, "white", 1);
    return;
  }
  if (s.stun > 0) {
    s.stun -= 2;
    return;
  }
  if (s.role === "npc" || s.role === "passive" || s.role === "dummy") {
    if (s.home && s.tick % 40 === 0 && V.dist(e.location, s.home) > 14) {
      try {
        e.teleport(s.home);
      } catch {
        // ignore
      }
    }
    if (s.cid === "gregory" && s.tick % 6 === 0) {
      try {
        e.clearVelocity();
        e.applyImpulse({ x: rand(-0.6, 0.6), y: rand(-0.05, 0.25), z: rand(-0.6, 0.6) });
      } catch {
        // ignore
      }
    }
    return;
  }
  if (prof.regen && s.tick % 20 === 0) {
    try {
      const h = e.getComponent("minecraft:health");
      h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + h.effectiveMax * prof.regen));
    } catch {
      // ignore
    }
  }
  if (s.charge) {
    tickCharge(s);
    return;
  }
  if (s.role === "ally") return allyStep(s, prof);
  checkForms(s);
  const target = findTarget(s);
  if (!target) {
    if (s.flying && s.tick % 20 === 0) setFlying(s, false);
    if (s.home && s.tick % 60 === 0 && V.dist(e.location, s.home) > 30) {
      try {
        e.teleport(s.home);
      } catch {
        // ignore
      }
    }
    return;
  }
  combatStep(s, prof, target);
}

function combatStep(s, prof, target) {
  const e = s.e;
  const dist = V.dist(e.location, target.location);
  const dy = target.location.y - e.location.y;
  const now = system.currentTick;
  // flying
  if (prof.fly && (dy > 2.5 || (target.typeId === "minecraft:player" && rt(target).flying))) setFlying(s, true);
  else if (s.flying && dy < 1 && s.tick % 10 === 0) setFlying(s, false);
  if (s.flying) moveFly(s, target);
  // dodge incoming blasts
  const dodgeChance = (prof.dodge ?? 0.1) * 0.5;
  if (s.tick % 4 === 0) {
    for (const b of blastsNear(e.location, 3.2)) {
      if (b.ownerId === e.id) continue;
      if (chance(dodgeChance)) {
        dodge(s);
        break;
      }
    }
  }
  // self destruct Saibamen
  if (prof.selfDestruct && dist < 2.2 && chance(0.05)) {
    explode(e.dimension, e.location, 3, 30, e, "green");
    try {
      e.kill();
    } catch {
      // ignore
    }
    return;
  }
  // time skip / teleports
  if (prof.tp && dist > 4 && now - s.lastTp > 120 && chance(0.06)) {
    s.lastTp = now;
    teleportBehind(s, target);
    return;
  }
  if (prof.timeStop && dist < 12 && now - (s.cd.ts ?? 0) > 300 && chance(0.05)) {
    s.cd.ts = now;
    try {
      target.addEffect("slowness", 60, { amplifier: 6, showParticles: false });
      target.addEffect("mining_fatigue", 60, { amplifier: 2, showParticles: false });
    } catch {
      // ignore
    }
    if (target.typeId === "minecraft:player") msg(target, "§d体が…動かない！（グルドの超能力）");
    return;
  }
  if (prof.bodyChange && hpFrac(e) < 0.35 && !s.cd.body && target.typeId === "minecraft:player") {
    s.cd.body = now;
    bodyChange(s, target);
    return;
  }
  // ranged attacks
  const atks = prof.atk ?? [];
  if (atks.length && dist > 3.5 && dist < 34 && s.tick % 4 === 0) {
    const ready = atks.filter((a, i) => now - (s.cd[i] ?? -999) > a.cd * (s.boss ? 0.8 : 1.2));
    if (ready.length && chance(s.boss ? 0.4 : 0.22)) {
      const a = pick(ready);
      s.cd[atks.indexOf(a)] = now;
      useAttack(s, target, a);
      return;
    }
  }
  // dash in
  if (!s.flying && dist > 6 && dist < 24 && chance(0.05)) {
    const to = V.norm(V.sub(target.location, e.location));
    try {
      e.applyImpulse({ x: to.x * 1.4, y: 0.25, z: to.z * 1.4 });
    } catch {
      // ignore
    }
    afterimage(e.dimension, e.location, "white");
  }
}

/* --------------------------------------------------------------------------------- allies */

function allyStep(s, prof) {
  const e = s.e;
  const owner = s.owner ? world.getEntity(s.owner) : null;
  if (!owner || !isValid(owner)) return;
  const dOwner = V.dist(e.location, owner.location);
  // follow
  if (dOwner > 40 || owner.dimension.id !== e.dimension.id) {
    try {
      e.teleport(V.add(owner.location, { x: rand(-2, 2), y: 0.5, z: rand(-2, 2) }), { dimension: owner.dimension });
    } catch {
      // ignore
    }
    return;
  }
  const ro = rt(owner);
  // mirror the owner's power-ups visually
  if (s.tick % 20 === 0) mirrorOwnerForm(s, owner);
  // rescue with senzu
  if (s.tick % 10 === 0) {
    try {
      const h = owner.getComponent("minecraft:health");
      const now = system.currentTick;
      if (h.currentValue / h.effectiveMax < 0.25 && now - (s.cd.senzu ?? -99999) > 6000) {
        s.cd.senzu = now;
        h.resetToMaxValue();
        getData(owner).ki = getData(owner).ki + 200;
        msg(owner, `§a${CHARS[CHAR_INDEX[s.cid]].name}「ほら、仙豆だ！ 食え！」`);
        sound(owner.dimension, "dbz.senzu", owner.location, 1);
        particle(owner.dimension, "dbz:sparkle", V.up(owner.location, 1), "green", 1);
      }
    } catch {
      // ignore
    }
  }
  const target = findTarget(s) ?? (ro.lastTargetId ? world.getEntity(ro.lastTargetId) : null);
  if (target && isValid(target) && isHostile(e, target)) {
    combatStep(s, prof, target);
    return;
  }
  // idle follow: fly when owner flies
  if (ro.flying || owner.location.y - e.location.y > 3) {
    setFlying(s, true);
    const want = V.add(owner.location, V.mul(owner.getViewDirection(), -2.5));
    const to = V.sub(V.up(want, 1), e.location);
    try {
      e.clearVelocity();
      if (V.len(to) > 1.5) e.applyImpulse(V.mul(V.norm(to), Math.min(1.2, V.len(to) * 0.12)));
    } catch {
      // ignore
    }
    setPose(e, V.len(to) > 6 ? "fly_fast" : "fly");
  } else {
    if (s.flying) setFlying(s, false);
    if (dOwner > 6 && s.tick % 10 === 0) {
      const to = V.norm(V.sub(owner.location, e.location));
      try {
        e.applyImpulse({ x: to.x * 0.6, y: 0.1, z: to.z * 0.6 });
      } catch {
        // ignore
      }
    }
  }
}

const ALLY_FORMS = {
  goku: { ssj: "goku_ssj", ssj2: "goku_ssj", ssj3: "goku_ssj3", god: "goku_god", blue: "goku_blue", ui_sign: "goku_ui", ui: "goku_ui" },
  vegeta: { ssj: "vegeta_ssj", ssj2: "vegeta_ssj", ssj3: "vegeta_ssj", god: "vegeta_blue", blue: "vegeta_blue", ue: "vegeta_ue" },
  gohan: { ssj: "gohan_ssj2", ssj2: "gohan_ssj2", ssj3: "gohan_ssj2" },
  trunks: { ssj: "trunks_ssj", ssj2: "trunks_ssj" },
  goten: { ssj: "goten_ssj", ssj2: "goten_ssj" },
};

function baseOf(cid) {
  for (const b of Object.keys(ALLY_FORMS)) {
    if (cid === b || Object.values(ALLY_FORMS[b]).includes(cid)) return b;
  }
  if (cid === "piccolo_orange") return "piccolo";
  return cid;
}

function mirrorOwnerForm(s, owner) {
  const ro = rt(owner);
  const base = baseOf(s.cid);
  const want = (ro.form && ALLY_FORMS[base]?.[ro.form]) || base;
  if (want !== s.cid) {
    setChar(s.e, want, false);
    particle(s.e.dimension, "dbz:explosion_core", V.up(s.e.location, 1), "gold", 2);
    sound(s.e.dimension, "dbz.aura_burst", s.e.location, 1.2);
  }
  try {
    s.e.setProperty("dbz:aura", ro.form || ro.charging ? auraFor(want) : 0);
  } catch {
    // ignore
  }
  // allies keep pace with the owner
  setFighterPL(s.e, powerOfAny(owner) * 0.8);
}

/* --------------------------------------------------------------------------------- specials */

function bodyChange(s, player) {
  const e = s.e;
  title(player, "§dボディチェンジ！！", "§7ギニューと体が入れ替わった！", 50);
  sound(e.dimension, "dbz.fusion", e.location, 2);
  try {
    const hp = player.getComponent("minecraft:health");
    const he = e.getComponent("minecraft:health");
    const pf = hp.currentValue / hp.effectiveMax;
    const ef = he.currentValue / he.effectiveMax;
    hp.setCurrentValue(Math.max(1, hp.effectiveMax * ef));
    he.setCurrentValue(Math.max(1, he.effectiveMax * Math.max(pf, 0.6)));
    const pl = e.location;
    const pp = player.location;
    e.teleport(pp);
    player.teleport(pl);
  } catch {
    // ignore
  }
}

/* --------------------------------------------------------------------------------- loop */

system.runInterval(() => {
  for (const s of fighters.values()) {
    try {
      aiStep(s);
    } catch {
      // ignore single failures
    }
  }
}, 2);

export function adoptAll() {
  for (const id of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
    try {
      for (const e of world.getDimension(id).getEntities({ type: "dbz:fighter" })) adopt(e);
    } catch {
      // ignore
    }
  }
}

export function fightersByTag(tag) {
  const out = [];
  for (const s of fighters.values()) {
    if (isValid(s.e) && s.e.hasTag(tag)) out.push(s.e);
  }
  return out;
}

export { hpFrac, activeBeamOf, clamp };
