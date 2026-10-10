import { system, world } from "@minecraft/server";
import { AURA } from "../gen/catalog.js";
import { V, clamp, isValid, chance, rand } from "../core/util.js";
import { particle, deco, sound, shakeArea, afterimage, watchers, flash } from "../core/fx.js";
import { emit } from "../core/bus.js";
import { paceFactor } from "../core/settings.js";
import { hurt, hold, isKO, meleeOf, powerOf } from "../combat/damage.js";
import { fireBlast, fireBeam, explode, blastsNear, deflect } from "../combat/projectiles.js";
import { crackGround, carve, impactFx } from "../combat/terrain.js";
import { battlersNear, isEnemy } from "../combat/teams.js";
import { fighters, setPose, setAura, speak, hpFrac } from "./fighter.js";

/* Everything a fighter can do to another: blows, rushes, clashes of fists, chases, ki attacks and the
 * signature moves with their wind-ups. Each action runs as s.act, stepped every AI tick (2 game ticks). */

const now = () => system.currentTick;

/** Turn to face a point without killing momentum. */
export function face(e, loc) {
  const d = V.sub(loc, e.getHeadLocation ? e.getHeadLocation() : e.location);
  const yaw = (Math.atan2(-d.x, d.z) * 180) / Math.PI;
  const pitch = (-Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180) / Math.PI;
  try {
    e.setRotation({ x: clamp(pitch, -89, 89), y: yaw });
  } catch {
    try {
      e.teleport(e.location, { facingLocation: loc });
    } catch {
      // ignore
    }
  }
}

function mult(s) {
  return s.buff && now() < s.buff.until ? s.buff.mult : 1;
}

function alive(t) {
  return t && isValid(t) && !isKO(t);
}

/* ======================================================================================= blows */

/** One heavy blow, or a rush of several with afterimages; the last sends the target flying. */
export function rushCombo(s, target, hits, opts = {}) {
  const e = s.e;
  s.busyUntil = now() + hits * 4 + 6;
  setPose(e, hits > 1 ? "rush" : "one_hand");
  for (let i = 0; i < hits; i++) {
    const last = i === hits - 1;
    system.runTimeout(() => {
      if (!isValid(e) || !alive(target) || isKO(e) || V.dist(e.location, target.location) > 5) return;
      if (hits > 3 && i % 2 === 1 && !last) {
        // flicker around the target between blows
        afterimage(e.dimension, e.location, "white");
        const side = V.norm({ x: rand(-1, 1), y: 0, z: rand(-1, 1) });
        try {
          e.teleport(V.add(target.location, V.mul(side, 1.6)), { checkForBlocks: true });
        } catch {
          // ignore
        }
      }
      face(e, V.up(target.location, 1.1));
      const dir = V.sub(target.location, e.location);
      const h = last ? (opts.launch ?? (hits > 1 ? 2.2 : 1.3)) : 0.2;
      hurt(target, meleeOf(e) * (last ? 1.5 : 0.65) * mult(s), e,
        { knock: { dir, h, v: last ? (opts.up ?? 0.45) : 0.05 }, hitstop: last ? 4 : 1, label: opts.name, melee: true });
      const at = V.up(target.location, 1.1);
      particle(e.dimension, "dbb:impact", at, "white", last ? 2.2 : 1);
      if (last) {
        particle(e.dimension, "dbb:shockwave", at, "white", 2.2);
        if (h >= 2) s.chase = { id: target.id, until: now() + 26 };
      }
      sound(e.dimension, last ? "dbb.punch_heavy" : "dbb.punch", at, 1.2);
      if (last) system.runTimeout(() => isValid(e) && setPose(e, s.flying ? "fly" : "none"), 6);
    }, i * 4);
  }
}

/** Both fighters trade blows at blinding speed; shock waves; one finally breaks through. */
export function fistClash(s, t) {
  const a = s.e;
  const b = t.e;
  const len = 24 + Math.floor(rand(0, 16));
  s.busyUntil = now() + len + 8;
  t.busyUntil = now() + len + 8;
  setPose(a, "rush");
  setPose(b, "rush");
  emit("fistClash", s, t);
  let k = 0;
  const step = () => {
    if (!isValid(a) || !isValid(b) || isKO(a) || isKO(b)) return;
    k += 2;
    const mid = V.lerp(V.up(a.location, 1.2), V.up(b.location, 1.2), 0.5);
    face(a, V.up(b.location, 1.2));
    face(b, V.up(a.location, 1.2));
    particle(a.dimension, "dbb:impact", V.add(mid, { x: rand(-0.5, 0.5), y: rand(-0.4, 0.4), z: rand(-0.5, 0.5) }), "white", 1.3);
    if (k % 4 === 0) sound(a.dimension, "dbb.punch", mid, 1.3, rand(0.9, 1.3));
    if (k % 6 === 0) {
      particle(a.dimension, "dbb:shockwave", mid, "white", 2.5);
      deco(a.dimension, "dbb:dust_rise", V.up(mid, -1.2), "white", 1.5);
      shakeArea(a.dimension, mid, 24, 0.35, 0.3);
    }
    if (k % 8 === 0) afterimage(a.dimension, a.location, "white");
    if (k < len) {
      system.runTimeout(step, 2);
      return;
    }
    // the stronger one (with luck) lands the decisive blow
    const pa = Math.log10(powerOf(a) + 10) * rand(0.8, 1.25);
    const pb = Math.log10(powerOf(b) + 10) * rand(0.8, 1.25);
    const [w, l, ws] = pa >= pb ? [a, b, s] : [b, a, t];
    sound(a.dimension, "dbb.clash", mid, 2.5);
    hurt(l, meleeOf(w) * 2.2 * mult(ws), w, { knock: { dir: V.sub(l.location, w.location), h: 2.4, v: 0.5 }, hitstop: 5, label: "打ち合い" });
    ws.chase = { id: l.id, until: now() + 26 };
    setPose(a, "none");
    setPose(b, "none");
    emit("fistClashEnd", ws, l);
  };
  system.runTimeout(step, 2);
}

/** Catch up with a target that was just sent flying and hit it again (pinball). */
export function pursue(s, target) {
  const e = s.e;
  let v = { x: 0, y: 0, z: 0 };
  try {
    v = target.getVelocity();
  } catch {
    // ignore
  }
  const ahead = V.add(target.location, V.mul(v, 5));
  const dir = V.norm(v.x || v.z ? v : V.sub(target.location, e.location));
  const dest = V.add(ahead, V.mul(dir, 1.6));
  afterimage(e.dimension, e.location, "white");
  sound(e.dimension, "dbb.whoosh", e.location, 1.2);
  try {
    e.teleport(dest, { checkForBlocks: true, facingLocation: V.up(target.location, 1) });
  } catch {
    // ignore
  }
  s.busyUntil = now() + 8;
  system.runTimeout(() => {
    if (!isValid(e) || !alive(target)) return;
    const back = V.sub(target.location, e.location);
    const down = chance(0.4);
    hurt(target, meleeOf(e) * 1.3 * mult(s), e,
      { knock: { dir: down ? back : V.mul(back, 1), h: down ? 0.6 : 2.0, v: down ? -1.6 : 0.6 }, hitstop: 4, label: "追撃" });
    particle(e.dimension, "dbb:impact", V.up(target.location, 1), "white", 2.4);
    particle(e.dimension, "dbb:shockwave", V.up(target.location, 1), "white", 2);
    sound(e.dimension, "dbb.punch_heavy", target.location, 1.5);
    emit("pursuit", s, target);
  }, 3);
  s.chain = (s.chain ?? 0) + 1;
  s.chase = s.chain < 3 ? { id: target.id, until: now() + 22 } : null;
}

/** Dash in fast, leaving an afterimage. */
export function dashTo(s, target, power = 1.8) {
  const e = s.e;
  const to = V.norm(V.sub(target.location, e.location));
  afterimage(e.dimension, e.location, "white");
  try {
    if (s.flying) e.clearVelocity();
    e.applyImpulse({ x: to.x * power, y: s.flying ? to.y * power : 0.3, z: to.z * power });
  } catch {
    // ignore
  }
  sound(e.dimension, "dbb.dash", e.location, 0.8);
}

/** Jump back to make room. */
export function leapBack(s, target) {
  const e = s.e;
  const away = V.norm({ x: e.location.x - target.location.x, y: 0, z: e.location.z - target.location.z });
  afterimage(e.dimension, e.location, "white");
  try {
    e.applyImpulse({ x: away.x * 1.6, y: 0.55, z: away.z * 1.6 });
  } catch {
    // ignore
  }
  sound(e.dimension, "dbb.dash", e.location, 0.8);
}

/** Circle around the target. */
export function strafe(s, target) {
  const e = s.e;
  const to = V.norm(V.sub(target.location, e.location));
  const side = chance(0.5) ? { x: -to.z, y: 0, z: to.x } : { x: to.z, y: 0, z: -to.x };
  try {
    e.applyImpulse({ x: side.x * 0.9, y: s.flying ? rand(-0.2, 0.3) : 0.15, z: side.z * 0.9 });
  } catch {
    // ignore
  }
  if (chance(0.4)) afterimage(e.dimension, e.location, "white");
}

/** Vanish and appear behind the target. */
export function teleportBehind(s, target) {
  const e = s.e;
  const back = V.norm(target.getViewDirection());
  const dest = V.sub(target.location, V.mul({ x: back.x, y: 0, z: back.z }, 2));
  afterimage(e.dimension, e.location, "white");
  try {
    e.teleport(dest, { checkForBlocks: true, facingLocation: V.up(target.location, 1.2) });
  } catch {
    // ignore
  }
  sound(e.dimension, "dbb.teleport", dest, 1);
}

/** Bat away an incoming blast. */
export function tryDeflect(s) {
  for (const b of blastsNear(s.e.location, 3.4)) {
    if (b.ownerId === s.id || (b.owner && !isEnemy(s.e, b.owner))) continue;
    const back = b.owner && isValid(b.owner) && chance(0.4) ? V.sub(V.up(b.owner.location, 1), b.pos) : { x: rand(-1, 1), y: rand(0.2, 1), z: rand(-1, 1) };
    setPose(s.e, "one_hand");
    deflect(b, s.e, back);
    system.runTimeout(() => isValid(s.e) && setPose(s.e, s.flying ? "fly" : "none"), 6);
    emit("deflect", s, b);
    return true;
  }
  return false;
}

/* ======================================================================================= everyday ki attacks */

/** Use one of the character's ordinary ki attacks (from the profile's atk list). */
export function kiAttack(s, target, atk) {
  const e = s.e;
  const head = e.getHeadLocation();
  const aim = V.up(target.location, 1.1);
  face(e, aim);
  const dir = V.norm(V.sub(aim, head));
  const pw = atk.power * mult(s);
  if (atk.kind === "blast" || atk.kind === "disc") {
    const n = atk.kind === "disc" ? 1 : 1 + Math.floor(rand(0, 3));
    for (let i = 0; i < n; i++) {
      system.runTimeout(() => {
        if (!isValid(e) || !alive(target)) return;
        const d = V.norm(V.sub(V.up(target.location, 1.1 + rand(-0.4, 0.4)), e.getHeadLocation()));
        fireBlast(e, { color: atk.color, size: atk.size, speed: atk.speed, power: pw, radius: atk.radius, dir: d,
          from: V.add(e.getHeadLocation(), V.mul(d, 0.8)), homing: atk.kind === "disc" || !!atk.homing, pierce: atk.kind === "disc",
          guided: !!atk.guided, shape: atk.kind === "disc" ? 1 : 0, life: 60 });
        setPose(e, "one_hand");
        sound(e.dimension, atk.kind === "disc" ? "dbb.disc" : "dbb.blast", e.location, 1);
      }, i * 4);
    }
    system.runTimeout(() => isValid(e) && setPose(e, s.flying ? "fly" : "none"), n * 4 + 6);
    s.busyUntil = now() + n * 4 + 4;
  } else if (atk.kind === "beam" || atk.kind === "ball") {
    startAct(s, target, { type: atk.kind === "beam" ? "beam" : "ball", name: atk.name ?? null, color: atk.color, power: atk.power,
      width: atk.width ?? 1, charge: Math.max(10, (atk.charge ?? 30) * 0.7), size: atk.size ?? 2.2, speed: atk.speed ?? 1.2,
      radius: atk.radius ?? 5, pierce: atk.pierce, spiral: atk.spiral, candy: atk.candy, minor: true });
  } else if (atk.kind === "aoe") {
    setPose(e, "transform");
    explode(e.dimension, V.up(e.location, 1), atk.radius, pw, e, atk.color);
    system.runTimeout(() => isValid(e) && setPose(e, "none"), 10);
    s.busyUntil = now() + 12;
  }
}

/* ======================================================================================= signature moves */

/** Begin an action (wind-up + payoff), stepped by stepAct. */
export function startAct(s, target, sp) {
  const e = s.e;
  // Buu's candy beam is a thin beam that turns a nearly beaten fighter into sweets
  if (sp.type === "candy") sp = Object.assign({}, sp, { type: "beam", width: 0.4, power: 30, charge: 16, candy: true, chant: null });
  s.act = { sp, target: target.id, t: 0, phase: 0 };
  s.busyUntil = now() + 400;
  if (!sp.minor) {
    emit("special", s, sp, target);
    if (chance(0.5)) speak(s, "special");
  }
  const kind = sp.type;
  if (kind === "beam" || kind === "ball" || kind === "spirit" || kind === "disc" || kind === "kikoho") {
    setAura(e, true, s.cid);
    sound(e.dimension, "dbb.beam_charge", e.location, 2);
  }
}

function endAct(s) {
  s.act = null;
  s.busyUntil = now() + 6;
  if (isValid(s.e)) {
    setPose(s.e, s.flying ? "fly" : "none");
    if (!(s.buff && now() < s.buff.until)) setAura(s.e, false, s.cid);
  }
}

function chantStep(s, sp, t, total) {
  if (!sp.chant || !sp.chant.length) return;
  const n = sp.chant.length;
  const idx = Math.min(n - 1, Math.floor((t / total) * n));
  if (idx !== s.act.chantIdx) {
    s.act.chantIdx = idx;
    if (idx < n - 1 || t >= total) speak(s, "special", sp.chant.slice(0, idx + 1).join(""));
  }
}

/** Step the running action. Returns false when it's over. */
export function stepAct(s) {
  const a = s.act;
  if (!a) return false;
  const e = s.e;
  const sp = a.sp;
  const target = world.getEntity(a.target);
  if (!alive(target) || isKO(e)) {
    endAct(s);
    return false;
  }
  a.t += 2;
  const t = a.t;
  const head = e.getHeadLocation();
  if (sp.type !== "rush" && sp.type !== "meteor" && sp.type !== "timeskip") face(e, V.up(target.location, 1.1));
  const charge = Math.round((sp.charge ?? 30) * paceFactor());
  switch (sp.type) {
    case "beam": {
      if (a.phase === 0) {
        setPose(e, sp.pose ?? "beam_charge");
        const dir = V.norm(V.sub(V.up(target.location, 1.1), head));
        if (t % 2 === 0) particle(e.dimension, "dbb:charge_orb", V.add(head, V.mul(dir, 0.8)), sp.color, 1 + (sp.width ?? 1) * 0.4);
        if (t % 6 === 0) deco(e.dimension, "dbb:gather", e.location, sp.color, 1.5, { dir: { x: 0, y: 1, z: 0 }, speed: 2 });
        if (!sp.minor && t % 10 === 0) shakeArea(e.dimension, e.location, 30, 0.2 + t / charge * 0.4, 0.4);
        chantStep(s, sp, t, charge);
        if (t >= charge) {
          a.phase = 1;
          a.fired = t;
          fireBeam(e, { color: sp.color, width: (sp.width ?? 1) * (s.buff && now() < s.buff.until ? 1.2 : 1), range: 44, power: sp.power * mult(s),
            pierce: sp.pierce, spiral: sp.spiral, candy: sp.candy, duration: sp.minor ? 22 : 30 + Math.round((sp.width ?? 1) * 4),
            firePose: "beam_fire", name: sp.minor ? null : sp.name, dir });
          if (!sp.minor) emit("specialFire", s, sp, target);
        }
      } else if (t - a.fired > (sp.minor ? 24 : 34 + (sp.width ?? 1) * 4)) {
        endAct(s);
        return false;
      }
      return true;
    }
    case "ball":
    case "spirit": {
      const spirit = sp.type === "spirit";
      const full = spirit ? Math.round(90 * paceFactor()) : charge;
      const size = (spirit ? 6 : sp.size ?? 3) * Math.min(1, t / full);
      const over = V.up(e.location, 2.6 + size * 0.6);
      if (a.phase === 0) {
        setPose(e, "overhead");
        particle(e.dimension, "dbb:charge_orb", over, sp.color, 0.6 + size);
        if (t % 4 === 0) deco(e.dimension, "dbb:gather", over, sp.color, 2, { dir: { x: 0, y: -1, z: 0 }, speed: 3 });
        if (spirit && t % 6 === 0) {
          for (let i = 0; i < 3; i++) {
            deco(e.dimension, "dbb:ki_spark", V.add(over, { x: rand(-12, 12), y: rand(-4, 10), z: rand(-12, 12) }), "cyan", 1);
          }
        }
        if (!sp.minor && t % 10 === 0) shakeArea(e.dimension, e.location, 40, 0.25 + t / full * 0.6, 0.4);
        if (t >= full) {
          a.phase = 1;
          a.fired = t;
          const d = V.norm(V.sub(V.up(target.location, 1), over));
          setPose(e, "throw");
          fireBlast(e, { color: sp.color, size: Math.max(1, size), speed: spirit ? 0.6 : sp.speed ?? 1, power: (sp.power ?? 80) * mult(s),
            radius: spirit ? 14 : sp.radius ?? 8, dir: d, from: over, life: 120, homing: spirit || !!sp.overhead });
          sound(e.dimension, "dbb.blast", over, 3, 0.6);
          if (!sp.minor) emit("specialFire", s, sp, target);
        }
      } else if (t - a.fired > 16) {
        endAct(s);
        return false;
      }
      return true;
    }
    case "disc": {
      if (a.phase === 0) {
        setPose(e, "overhead");
        particle(e.dimension, "dbb:charge_orb", V.up(e.location, 3), sp.color, 1.5);
        if (t >= Math.round(20 * paceFactor())) {
          a.phase = 1;
          const d = V.norm(V.sub(V.up(target.location, 1.1), V.up(e.location, 3)));
          fireBlast(e, { color: sp.color, size: 1.5, speed: 1.4, power: sp.power * mult(s), radius: 2, dir: d, from: V.up(e.location, 3),
            homing: true, pierce: true, shape: 1, life: 80 });
          sound(e.dimension, "dbb.disc", e.location, 2);
          setPose(e, "throw");
          emit("specialFire", s, sp, target);
          a.fired = t;
        }
      } else if (t - a.fired > 12) {
        endAct(s);
        return false;
      }
      return true;
    }
    case "guided": {
      if (t === 2) {
        fireBlast(e, { color: sp.color, size: 1.1, speed: 1.3, power: sp.power * mult(s), radius: 3, from: V.add(head, V.mul(e.getViewDirection(), 1)),
          dir: e.getViewDirection(), guided: true, life: 120 });
        setPose(e, "one_hand");
        emit("specialFire", s, sp, target);
      }
      if (t > 50) {
        endAct(s);
        return false;
      }
      return true;
    }
    case "deathbeam": {
      if (t % 6 === 2 && t <= 20) {
        setPose(e, "one_hand");
        fireBeam(e, { color: sp.color, width: 0.25, range: 46, power: sp.power * mult(s), pierce: true, duration: 5, instant: true,
          name: sp.name, dir: V.norm(V.sub(V.up(target.location, 1.1), head)) });
        sound(e.dimension, "dbb.flash", e.location, 1.4, 1.4);
        if (t === 2) emit("specialFire", s, sp, target);
      }
      if (t > 26) {
        endAct(s);
        return false;
      }
      return true;
    }
    case "barrage": {
      const n = sp.count ?? 12;
      if (t <= n * 2) {
        setPose(e, t % 4 === 0 ? "one_hand" : "throw");
        const d = V.norm(V.sub(V.up(target.location, 1.1 + rand(-0.6, 0.6)), head));
        fireBlast(e, { color: sp.color, size: 0.55, speed: 2.0, power: 7 * mult(s) + (sp.power ?? 0), radius: 1.5,
          dir: V.norm(V.add(d, { x: rand(-0.08, 0.08), y: rand(-0.05, 0.05), z: rand(-0.08, 0.08) })), from: V.add(head, V.mul(d, 0.8)), life: 40 });
        if (t % 4 === 0) sound(e.dimension, "dbb.blast", e.location, 0.9, rand(0.9, 1.2));
        if (t === 2) emit("specialFire", s, sp, target);
        return true;
      }
      if (t === n * 2 + 14) {
        particle(e.dimension, "dbb:explosion_smoke", V.up(target.location, 1), "white", 4);
        if (chance(0.35)) speak(s, "special", "やったか…！？");
      }
      if (t > n * 2 + 18) {
        endAct(s);
        return false;
      }
      return true;
    }
    case "barrier": {
      if (t === 2) {
        setPose(e, "transform");
        hold(e, 14);
        particle(e.dimension, "dbb:glow_burst", V.up(e.location, 1), sp.color, 4);
        particle(e.dimension, "dbb:shockwave", V.up(e.location, 0.5), sp.color, 7);
        sound(e.dimension, "dbb.aura_burst", e.location, 2.5);
        shakeArea(e.dimension, e.location, 40, 0.9, 0.6);
        crackGround(e.dimension, V.up(e.location, -1), 6);
        for (const x of battlersNear(e.dimension, e.location, 8)) {
          if (!isEnemy(e, x)) continue;
          hurt(x, (sp.power ?? 40) * mult(s), e, { knock: { dir: V.sub(x.location, e.location), h: 2.2, v: 0.5 }, area: true, label: sp.name });
        }
        for (const b of blastsNear(e.location, 9)) {
          if (b.ownerId === e.id) continue;
          deflect(b, e, b.owner && isValid(b.owner) ? V.sub(V.up(b.owner.location, 1), b.pos) : V.sub(b.pos, e.location));
        }
        emit("specialFire", s, sp, target);
      }
      if (t > 16) {
        endAct(s);
        return false;
      }
      return true;
    }
    case "kikoho": {
      if (a.phase === 0) {
        setPose(e, "forehead");
        particle(e.dimension, "dbb:charge_orb", V.add(head, V.mul(e.getViewDirection(), 0.8)), sp.color, 1.4);
        if (t >= Math.round(26 * paceFactor())) {
          a.phase = 1;
          a.fired = t;
          speak(s, "special", "気功砲ーっ！！");
          const at = target.location;
          for (let i = 0; i < 4; i++) {
            system.runTimeout(() => {
              particle(e.dimension, "dbb:pillar", at, sp.color, 3);
              explode(e.dimension, V.up(at, 0.5), 5, sp.power * 0.4 * mult(s), e, sp.color);
            }, i * 5);
          }
          carve(e.dimension, at, 4);
          emit("specialFire", s, sp, target);
        }
      } else if (t - a.fired > 24) {
        endAct(s);
        return false;
      }
      return true;
    }
    case "flare": {
      if (t === 2) {
        setPose(e, "forehead");
        speak(s, "special", `${sp.name}！！`);
      }
      if (t === 10) {
        particle(e.dimension, "dbb:glow_burst", V.up(e.location, 1.6), "white", 8);
        sound(e.dimension, "dbb.flash", e.location, 3);
        for (const p of watchers(e.dimension, e.location, 40)) flash(p, { red: 1, green: 1, blue: 0.95 }, 0.15);
        for (const x of battlersNear(e.dimension, e.location, 22)) {
          if (!isEnemy(e, x)) continue;
          const st = fighters.get(x.id);
          if (st) st.stun = 50;
          hold(x, 30);
        }
        emit("specialFire", s, sp, target);
      }
      if (t > 14) {
        endAct(s);
        return false;
      }
      return true;
    }
    case "buff": {
      if (t === 2) {
        setPose(e, "charge");
        hold(e, 16);
        try {
          e.setProperty("dbb:aura", sp.kind === "kaioken" ? AURA.red ?? 1 : AURA.white ?? 1);
        } catch {
          // ignore
        }
        speak(s, "special", `${sp.name}！！`);
        sound(e.dimension, "dbb.aura_burst", e.location, 2.5);
        particle(e.dimension, "dbb:shockwave", e.location, sp.kind === "kaioken" ? "red" : "white", 4);
        crackGround(e.dimension, V.up(e.location, -1), 4);
        s.buff = { mult: sp.kind === "kaioken" ? 1.5 : 1.3, until: now() + 240, kind: sp.kind };
        emit("specialFire", s, sp, target);
      }
      if (t > 16) {
        s.act = null;
        s.busyUntil = now() + 4;
        setPose(e, s.flying ? "fly" : "none");
        return false;
      }
      return true;
    }
    case "regen": {
      if (t === 2) {
        setPose(e, "charge");
        hold(e, 20);
        speak(s, "special", `${sp.name}…`);
      }
      if (t % 4 === 0) particle(e.dimension, "dbb:sparkle", V.up(e.location, rand(0.3, 2)), "green", 1.2);
      if (t === 18) {
        try {
          const h = e.getComponent("minecraft:health");
          h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + h.effectiveMax * 0.3));
        } catch {
          // ignore
        }
        sound(e.dimension, "dbb.senzu", e.location, 1.5);
        emit("specialFire", s, sp, target);
      }
      if (t > 20) {
        endAct(s);
        return false;
      }
      return true;
    }
    case "tpbeam": {
      if (t === 2) {
        speak(s, "special", "瞬間移動…");
        afterimage(e.dimension, e.location, "white");
        sound(e.dimension, "dbb.teleport", e.location, 1.5);
        const side = V.norm({ x: rand(-1, 1), y: 0, z: rand(-1, 1) });
        try {
          e.teleport(V.add(target.location, V.mul(side, 3.5)), { checkForBlocks: true, facingLocation: V.up(target.location, 1.1) });
        } catch {
          // ignore
        }
        setPose(e, "beam_charge");
        setAura(e, true, s.cid);
      }
      if (t === 12) {
        speak(s, "special", "かめはめ波ーっ！！");
        fireBeam(e, { color: sp.color, width: 2, range: 40, power: sp.power * mult(s), duration: 30, name: sp.name,
          dir: V.norm(V.sub(V.up(target.location, 1.1), e.getHeadLocation())) });
        emit("specialFire", s, sp, target);
      }
      if (t > 44) {
        endAct(s);
        return false;
      }
      return true;
    }
    case "meteor": {
      if (t === 2) {
        dashTo(s, target, 2);
        setPose(e, "rush");
      }
      if (t === 6 && V.dist(e.location, target.location) < 5.5) {
        hurt(target, meleeOf(e) * 1.2 * mult(s), e, { knock: { dir: V.sub(target.location, e.location), h: 0.3, v: 1.4 }, hitstop: 3, label: sp.name, melee: true });
        particle(e.dimension, "dbb:impact", V.up(target.location, 1), "white", 2);
        sound(e.dimension, "dbb.punch_heavy", target.location, 1.5);
      }
      if (t === 16) {
        afterimage(e.dimension, e.location, "white");
        sound(e.dimension, "dbb.whoosh", e.location, 1.2);
        try {
          e.teleport(V.up(target.location, 2.6), { checkForBlocks: true, facingLocation: target.location });
        } catch {
          // ignore
        }
        setPose(e, "overhead");
      }
      if (t === 20) {
        if (V.dist(e.location, target.location) < 6) {
          hurt(target, meleeOf(e) * 2.2 * mult(s), e, { knock: { dir: V.sub(target.location, e.location), h: 0.4, v: -2.2 }, hitstop: 5, label: sp.name, melee: true });
          particle(e.dimension, "dbb:shockwave", target.location, sp.color ?? "white", 3);
          sound(e.dimension, "dbb.impact", target.location, 2);
          emit("specialFire", s, sp, target);
          system.runTimeout(() => {
            if (!isValid(target)) return;
            impactFx(target.dimension, target.location, 2.5);
            carve(target.dimension, V.up(target.location, -0.5), 2.8);
          }, 8);
        }
      }
      if (t > 26) {
        endAct(s);
        return false;
      }
      return true;
    }
    case "rush": {
      if (t === 2) {
        dashTo(s, target, 2);
        emit("specialFire", s, sp, target);
      }
      if (t === 6) {
        rushCombo(s, target, 8 + Math.floor(rand(0, 5)), { name: sp.name, launch: 2.6, up: 0.6 });
        s.busyUntil = now() + 60;
      }
      if (t > 60) {
        endAct(s);
        return false;
      }
      return true;
    }
    case "timeskip": {
      if (t === 2) {
        speak(s, "special", `${sp.name}…`);
        for (const p of watchers(e.dimension, e.location, 60)) flash(p, { red: 0.55, green: 0.3, blue: 0.75 }, 0.2);
        hold(target, 26);
        sound(e.dimension, "dbb.teleport", e.location, 2, 0.6);
        emit("specialFire", s, sp, target);
      }
      if (t >= 4 && t <= 20 && t % 4 === 0) {
        const side = V.norm({ x: rand(-1, 1), y: rand(-0.2, 0.4), z: rand(-1, 1) });
        afterimage(e.dimension, e.location, "purple");
        try {
          e.teleport(V.add(target.location, V.mul(side, 1.6)), { checkForBlocks: true, facingLocation: V.up(target.location, 1.1) });
        } catch {
          // ignore
        }
        const last = t === 20;
        hurt(target, meleeOf(e) * (last ? 1.6 : 0.8) * mult(s), e,
          { knock: last ? { dir: V.sub(target.location, e.location), h: 2.2, v: 0.5 } : undefined, unblockable: true, label: sp.name, melee: true });
        particle(e.dimension, "dbb:impact", V.up(target.location, 1.1), "purple", last ? 2.4 : 1.4);
        sound(e.dimension, last ? "dbb.punch_heavy" : "dbb.punch", target.location, 1.3);
      }
      if (t > 22) {
        endAct(s);
        return false;
      }
      return true;
    }
    case "timestop": {
      if (t === 2) {
        speak(s, "special", "時間よ止まれ…！");
        setPose(e, "forehead");
        for (const p of watchers(e.dimension, e.location, 60)) flash(p, { red: 0.5, green: 0.9, blue: 0.5 }, 0.2);
        for (const x of battlersNear(e.dimension, e.location, 26)) {
          if (!isEnemy(e, x)) continue;
          if (powerOf(x) > powerOf(e) * 4 && chance(0.7)) continue;
          hold(x, 50);
          const st = fighters.get(x.id);
          if (st) st.stun = 50;
        }
        emit("specialFire", s, sp, target);
      }
      if (t === 20 && V.dist(e.location, target.location) < 30) rushCombo(s, target, 3);
      if (t > 50) {
        endAct(s);
        return false;
      }
      return true;
    }
    case "selfdestruct": {
      if (hpFrac(e) > 0.35 && t === 2) {
        endAct(s);
        return false;
      }
      if (t === 2) {
        speak(s, "special");
        afterimage(e.dimension, e.location, "green");
        try {
          e.teleport(V.add(target.location, { x: 0.3, y: 0.4, z: 0.3 }), { checkForBlocks: true });
        } catch {
          // ignore
        }
        hold(target, 24);
      }
      if (t % 4 === 0) particle(e.dimension, "dbb:glow_burst", V.up(e.location, 1), "green", 1 + t / 10);
      if (t === 24) {
        explode(e.dimension, V.up(e.location, 0.8), 4, 70, e, "green");
        emit("specialFire", s, sp, target);
        hurt(e, 1e9, undefined, { raw: true, unblockable: true });
      }
      if (t > 24) {
        endAct(s);
        return false;
      }
      return true;
    }
    default:
      endAct(s);
      return false;
  }
}

/** Interrupt whatever s was doing (e.g. knocked out or struck by a big hit). */
export function cancelAct(s) {
  if (s.act) endAct(s);
}
