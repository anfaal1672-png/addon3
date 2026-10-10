import { system } from "@minecraft/server";
import { V, isValid, chance, rand } from "../core/util.js";
import { particle, deco, sound, shakeArea, afterimage } from "../core/fx.js";
import { emit } from "../core/bus.js";
import { hurt, hold, isKO, isHeld, meleeOf } from "../combat/damage.js";
import { fireBlast } from "../combat/projectiles.js";
import { battlersNear, isEnemy } from "../combat/teams.js";
import { fighters, setPose } from "./fighter.js";
import { profileOf, styleOf } from "./roster.js";
import { face } from "./moves.js";

/* Named combos: short scripted strings of blows that end in something big (a meteor smash into the ground,
 * a throw, a kick across the arena). Each one is a list of timed steps; it stops the moment either side
 * goes down. Allies standing nearby can jump in on the end of one (team follow-up). */

const now = () => system.currentTick;

function alive(e) {
  return e && isValid(e) && !isKO(e);
}

function mult(s) {
  return s.buff && now() < s.buff.until ? s.buff.mult : 1;
}

function kiColor(s) {
  const b = (profileOf(s.cid).atk ?? []).find((a) => a.kind === "blast");
  return b?.color ?? "yellow";
}

/** Run the steps [delay, fn] in order (delays are from the start). A step returning false ends the combo. */
function run(s, target, name, steps, len) {
  const e = s.e;
  s.busyUntil = now() + len;
  s.comboRun = { name, until: now() + len };
  emit("combo", s, name, target);
  let stopped = false;
  for (const [at, fn] of steps) {
    system.runTimeout(() => {
      if (stopped) return;
      if (!alive(e) || !alive(target)) {
        stopped = true;
        s.comboRun = null;
        if (isValid(e) && !isKO(e)) setPose(e, s.flying ? "fly" : "none");
        return;
      }
      if (fn() === false) stopped = true;
    }, at);
  }
  system.runTimeout(() => {
    s.comboRun = null;
    if (alive(e)) setPose(e, s.flying ? "fly" : "none");
  }, len);
}

/** Vanish and reappear at a point, facing the target. */
function appear(e, at, target, color = "white") {
  afterimage(e.dimension, e.location, color);
  try {
    e.teleport(at, { checkForBlocks: true, facingLocation: V.up(target.location, 1.1) });
  } catch {
    // ignore
  }
  sound(e.dimension, "dbb.teleport", at, 0.9, rand(1, 1.3));
}

/** One blow of a combo. big: the finisher (bigger effects, longer hit-stop). */
function blow(s, target, power, knock, big, label) {
  const e = s.e;
  face(e, V.up(target.location, 1.1));
  hurt(target, meleeOf(e) * power * mult(s), e, { knock, hitstop: big ? 5 : 2, label, melee: true });
  const at = V.up(target.location, 1.1);
  particle(e.dimension, "dbb:impact", at, "white", big ? 2.4 : 1.2);
  if (big) {
    particle(e.dimension, "dbb:shockwave", at, "white", 2.6);
    shakeArea(e.dimension, at, 24, 0.5, 0.35);
  }
  sound(e.dimension, big ? "dbb.punch_heavy" : "dbb.punch", at, big ? 1.6 : 1.1, rand(0.9, 1.2));
}

/** Point around the target at an angle (radians), on its level. */
function around(target, ang, r, up = 0) {
  return V.add(target.location, { x: Math.cos(ang) * r, y: up, z: Math.sin(ang) * r });
}

function toward(a, b) {
  return V.sub(b.location, a.location);
}

/** After the target has been sent flying it counts as a slam when it hits something. */
function slamAfter(target, power, delay) {
  system.runTimeout(() => isValid(target) && emit("launched", target, power), delay);
}

/** Leave the target open for a chase (the pinball follow-up in the brain). */
function openChase(s, target, ticks = 26) {
  s.chase = { id: target.id, until: now() + ticks };
  s.chain = 0;
}

/* ======================================================================================= the combos */

/** Two jabs, an uppercut that launches, then appear above and hammer it down into the ground. */
function meteorSmash(s, target) {
  const e = s.e;
  const name = "メテオスマッシュ";
  run(s, target, name, [
    [0, () => { setPose(e, "one_hand"); blow(s, target, 0.5, { dir: toward(e, target), h: 0.1, v: 0.02 }, false, name); }],
    [4, () => blow(s, target, 0.5, { dir: toward(e, target), h: 0.1, v: 0.02 }, false, name)],
    [8, () => {
      setPose(e, "overhead");
      blow(s, target, 0.9, { dir: toward(e, target), h: 0.15, v: 1.15 }, false, name);
      deco(e.dimension, "dbb:dust_rise", e.location, "white", 1.6);
    }],
    [19, () => {
      appear(e, V.add(target.location, { x: rand(-0.4, 0.4), y: 2.2, z: rand(-0.4, 0.4) }), target);
      setPose(e, "overhead");
    }],
    [23, () => {
      blow(s, target, 1.7, { dir: toward(e, target), h: 0.2, v: -2.4 }, true, name);
      slamAfter(target, 2.3, 7);
    }],
  ], 34);
}

/** Blink all around the target, hitting from every side, then one kick sends it across the arena. */
function afterimageRush(s, target) {
  const e = s.e;
  const name = "残像拳ラッシュ";
  const n = 5 + Math.floor(rand(0, 3));
  const base = Math.atan2(e.location.z - target.location.z, e.location.x - target.location.x);
  const steps = [];
  for (let i = 0; i < n; i++) {
    steps.push([i * 3, () => {
      const ang = base + (i * Math.PI * 2) / n + rand(-0.3, 0.3);
      appear(e, around(target, ang, 1.4, s.flying ? rand(-0.4, 0.6) : 0), target);
      setPose(e, i % 2 ? "rush" : "one_hand");
      hold(target, 4);
      blow(s, target, 0.4, { dir: toward(e, target), h: 0.05, v: 0.02 }, false, name);
    }]);
  }
  steps.push([n * 3 + 3, () => {
    appear(e, around(target, base, 1.5), target);
    setPose(e, "one_hand");
    blow(s, target, 1.6, { dir: toward(e, target), h: 2.6, v: 0.45 }, true, name);
    openChase(s, target);
  }]);
  run(s, target, name, steps, n * 3 + 12);
}

/** Punches, a kick that knocks it back, a volley of ki blasts after it, and appear behind it to strike it back. */
function kiCombo(s, target) {
  const e = s.e;
  const name = "気弾連撃";
  const color = kiColor(s);
  const steps = [
    [0, () => { setPose(e, "rush"); blow(s, target, 0.45, { dir: toward(e, target), h: 0.1, v: 0.02 }, false, name); }],
    [3, () => blow(s, target, 0.45, { dir: toward(e, target), h: 0.1, v: 0.02 }, false, name)],
    [6, () => { setPose(e, "one_hand"); blow(s, target, 0.8, { dir: toward(e, target), h: 1.5, v: 0.3 }, false, name); }],
  ];
  for (let i = 0; i < 4; i++) {
    steps.push([14 + i * 3, () => {
      const from = e.getHeadLocation();
      const d = V.norm(V.sub(V.up(target.location, 1 + rand(-0.3, 0.3)), from));
      setPose(e, i % 2 ? "one_hand" : "throw");
      fireBlast(e, { color, size: 0.6, speed: 2.2, power: meleeOf(e) * 0.9 * mult(s), radius: 1.2, dir: d, from: V.add(from, V.mul(d, 0.8)),
        homing: true, life: 30 });
      sound(e.dimension, "dbb.blast", e.location, 0.9, rand(1, 1.3));
    }]);
  }
  steps.push([28, () => {
    const away = V.norm({ x: target.location.x - e.location.x, y: 0, z: target.location.z - e.location.z });
    appear(e, V.add(target.location, V.mul(away, 1.5)), target);
    setPose(e, "one_hand");
    blow(s, target, 1.4, { dir: V.mul(away, -1), h: 2.2, v: 0.5 }, true, name);
    openChase(s, target);
  }]);
  run(s, target, name, steps, 38);
}

/** A blow, vanish behind for an elbow, back in front for a knee, then a spinning kick. */
function vanishStrike(s, target) {
  const e = s.e;
  const name = "背後取り";
  let fwd = V.norm({ x: target.location.x - e.location.x, y: 0, z: target.location.z - e.location.z });
  run(s, target, name, [
    [0, () => { setPose(e, "one_hand"); blow(s, target, 0.6, { dir: fwd, h: 0.3, v: 0.05 }, false, name); }],
    [6, () => {
      fwd = V.norm({ x: target.location.x - e.location.x, y: 0, z: target.location.z - e.location.z });
      appear(e, V.add(target.location, V.mul(fwd, 1.4)), target);
      setPose(e, "rush");
      blow(s, target, 0.8, { dir: V.mul(fwd, -1), h: 0.5, v: 0.1 }, false, name);
    }],
    [12, () => {
      appear(e, V.sub(target.location, V.mul(fwd, 1.4)), target);
      setPose(e, "overhead");
      blow(s, target, 0.8, { dir: fwd, h: 0.2, v: 0.75 }, false, name);
    }],
    [19, () => {
      appear(e, V.add(V.sub(target.location, V.mul(fwd, 1.3)), { x: 0, y: 0.6, z: 0 }), target);
      setPose(e, "one_hand");
      blow(s, target, 1.6, { dir: fwd, h: 2.5, v: 0.4 }, true, name);
      openChase(s, target);
    }],
  ], 30);
}

/** Grab it, swing it round and round, and hurl it away. */
function giantSwing(s, target) {
  const e = s.e;
  const name = "ジャイアントスイング";
  const center = e.location;
  let ang = Math.atan2(target.location.z - center.z, target.location.x - center.x);
  const steps = [[0, () => {
    setPose(e, "throw");
    blow(s, target, 0.5, { dir: toward(e, target), h: 0.05, v: 0.02 }, false, name);
    sound(e.dimension, "dbb.whoosh", e.location, 1.2, 0.8);
  }]];
  for (let i = 1; i <= 8; i++) {
    steps.push([3 + i * 2, () => {
      ang += 0.85;
      hold(target, 4);
      try {
        target.teleport(V.add(center, { x: Math.cos(ang) * 1.9, y: 0.6, z: Math.sin(ang) * 1.9 }), { checkForBlocks: true });
      } catch {
        // ignore
      }
      face(e, V.up(target.location, 1));
      if (i % 2 === 0) deco(e.dimension, "dbb:dust_rise", e.location, "white", 1.4);
      if (i % 3 === 0) sound(e.dimension, "dbb.whoosh", e.location, 1, 0.9 + i * 0.05);
    }]);
  }
  steps.push([21, () => {
    const tangent = { x: -Math.sin(ang), y: 0, z: Math.cos(ang) };
    blow(s, target, 1.8, { dir: tangent, h: 2.8, v: 0.5 }, true, name);
    openChase(s, target, 30);
  }]);
  run(s, target, name, steps, 30);
}

/** In the air: hit it from below, from the side, from above, and spike it into the ground. */
function airCombo(s, target) {
  const e = s.e;
  const name = "空中連撃";
  const base = Math.atan2(e.location.z - target.location.z, e.location.x - target.location.x);
  run(s, target, name, [
    [0, () => { setPose(e, "rush"); hold(target, 4); blow(s, target, 0.5, { dir: toward(e, target), h: 0.05, v: 0.02 }, false, name); }],
    [4, () => {
      appear(e, around(target, base + 2, 1.4, -0.8), target);
      hold(target, 4);
      blow(s, target, 0.5, { dir: toward(e, target), h: 0.05, v: 0.02 }, false, name);
    }],
    [8, () => {
      appear(e, around(target, base + 4, 1.4, 0.6), target);
      hold(target, 4);
      blow(s, target, 0.6, { dir: toward(e, target), h: 0.05, v: 0.02 }, false, name);
    }],
    [13, () => {
      appear(e, V.add(target.location, { x: 0.3, y: 2.3, z: 0.3 }), target);
      setPose(e, "overhead");
    }],
    [16, () => {
      blow(s, target, 1.7, { dir: toward(e, target), h: 0.2, v: -2.6 }, true, name);
      slamAfter(target, 2.4, 7);
    }],
  ], 26);
}

/** A teammate standing by jumps in on the end of a combo and smashes the target again. */
function teamFollow(s, target, delay) {
  system.runTimeout(() => {
    if (!alive(s.e) || !alive(target)) return;
    const t = now();
    // anyone not in the middle of a special / combo / transformation can break off and jump in
    const ally = battlersNear(target.dimension, target.location, 18).find((x) => {
      if (x.id === s.id || x.typeId !== "dbb:fighter" || isKO(x) || isEnemy(s.e, x) || !isEnemy(x, target) || isHeld(x)) return false;
      const xs = fighters.get(x.id);
      return !!xs && !xs.act && !xs.comboRun && !(xs.transforming > 0) && !(xs.stun > 0);
    });
    if (!ally) return;
    const as = fighters.get(ally.id);
    let v = { x: 0, y: 0, z: 0 };
    try {
      v = target.getVelocity();
    } catch {
      // ignore
    }
    const dir = V.norm(v.x || v.z ? { x: v.x, y: 0, z: v.z } : toward(s.e, target));
    const name = "連携攻撃";
    as.busyUntil = t + 14;
    emit("teamCombo", s, as, target);
    appear(ally, V.add(V.add(target.location, V.mul(v, 4)), V.mul(dir, 1.6)), target);
    system.runTimeout(() => {
      if (!alive(ally) || !alive(target)) return;
      setPose(ally, "overhead");
      const down = chance(0.5);
      blow(as, target, 1.4, { dir: V.mul(dir, -1), h: down ? 0.3 : 2.2, v: down ? -2.2 : 0.5 }, true, name);
      if (down) slamAfter(target, 2.2, 7);
      else openChase(as, target);
      system.runTimeout(() => alive(ally) && setPose(ally, as.flying ? "fly" : "none"), 8);
    }, 3);
  }, delay);
}

/* ======================================================================================= choosing */

/** fn: the combo; len: about how long it runs (for the team follow-up); w: how much this fighter likes it here. */
const COMBOS = [
  { fn: meteorSmash, len: 34, w: (s, ts) => (ts?.flying ? 0.3 : 1) },
  { fn: afterimageRush, len: 32, w: (s) => 0.6 + (profileOf(s.cid).tp ? 0.6 : 0) + (profileOf(s.cid).fast ? 0.4 : 0) },
  { fn: kiCombo, len: 38, w: (s) => 0.4 + styleOf(s.cid).range },
  { fn: vanishStrike, len: 30, w: (s) => 0.6 + styleOf(s.cid).guard * 0.6 },
  { fn: giantSwing, len: 30, w: (s, ts) => (ts?.flying ? 0.1 : styleOf(s.cid).aggro > 0.8 ? 1.4 : 0.4) },
  { fn: airCombo, len: 26, w: (s, ts) => (s.flying && ts?.flying ? 2 : 0) },
];

/** Maybe start a named combo (returns true if one started). */
export function tryCombo(s, target, pace) {
  const t = now();
  if (s.comboRun || t < (s.cd.combo ?? (s.started ?? 0) + 60)) return false;
  const style = styleOf(s.cid);
  if (!chance(0.3 + style.aggro * 0.25)) return false;
  const ts = fighters.get(target.id);
  if (ts?.act || isHeld(target)) return false;
  // from a few blocks away: close the gap in a blink first
  if (V.dist(s.e.location, target.location) > 3) {
    const back = V.norm({ x: s.e.location.x - target.location.x, y: 0, z: s.e.location.z - target.location.z });
    appear(s.e, V.add(target.location, V.mul(back, 1.5)), target);
  }
  const pool = COMBOS.map((c) => ({ c, w: c.w(s, ts) })).filter((x) => x.w > 0);
  let r = rand(0, pool.reduce((a, x) => a + x.w, 0));
  let pick = pool[pool.length - 1].c;
  for (const x of pool) {
    r -= x.w;
    if (r <= 0) {
      pick = x.c;
      break;
    }
  }
  s.cd.combo = t + Math.floor(rand(80, 150) * pace);
  pick.fn(s, target);
  if (chance(0.55)) teamFollow(s, target, pick.len - 4);
  return true;
}
