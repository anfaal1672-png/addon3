import { system, world } from "@minecraft/server";
import { settings } from "../core/settings.js";
import { V, isValid } from "../core/util.js";
import { msg } from "../core/fx.js";
import { on } from "../core/bus.js";

/* Spectator camera. Modes per player: follow (keeps the action framed), orbit (circles the fight), free (own eyes).
 * With automatic cuts on, big moments (signature moves, transformations, beam struggles, the final blow) get
 * their own shot for a moment, like an anime cut. */

export const MODES = ["follow", "orbit", "free"];
export const MODE_NAME = { follow: "追従", orbit: "周回", free: "自由" };

const modeOf = new Map(); // player id -> mode
let shot = null; // { until, at: () => Vector3, look: () => Vector3 }
let focus = { a: null, b: null, until: 0 };
/** @type {() => any} returns the running match (or null) */
let currentMatch = () => null;

export function bindMatch(fn) {
  currentMatch = fn;
}

export function cameraMode(p) {
  return modeOf.get(p.id) ?? "follow";
}

export function setCameraMode(p, mode) {
  modeOf.set(p.id, mode);
  if (mode === "free") clearCam(p);
  msg(p, `§bカメラ：${MODE_NAME[mode]}`);
}

export function cycleCamera(p) {
  const i = MODES.indexOf(cameraMode(p));
  setCameraMode(p, MODES[(i + 1) % MODES.length]);
}

function clearCam(p) {
  try {
    p.camera.clear();
  } catch {
    // ignore
  }
}

export function releaseAll() {
  for (const p of world.getAllPlayers()) clearCam(p);
  shot = null;
}

/** A cinematic cut for `ticks` ticks (ignored when automatic cuts are off). */
export function cut(ticks, at, look) {
  if (!settings().autoCam) return;
  shot = { until: system.currentTick + ticks, at, look };
}

/** Prefer framing these two for a while (they just traded blows). */
export function setFocus(a, b) {
  focus = { a: a?.id ?? null, b: b?.id ?? null, until: system.currentTick + 60 };
}

function ent(id) {
  if (!id) return null;
  const e = world.getEntity(id);
  return e && isValid(e) ? e : null;
}

function pair(m) {
  if (system.currentTick < focus.until) {
    const a = ent(focus.a);
    const b = ent(focus.b);
    if (a && b) return [a, b];
  }
  const act = m.active();
  if (act.length >= 2) {
    act.sort((x, y) => V.dist2(x.location, m.center) - V.dist2(y.location, m.center));
    return [act[0], act[1]];
  }
  if (act.length === 1) return [act[0], act[0]];
  const all = m.entities();
  return all.length ? [all[0], all[0]] : null;
}

/** Nudge the camera out of solid blocks. */
function open(dim, loc) {
  let p = loc;
  for (let i = 0; i < 8; i++) {
    try {
      const b = dim.getBlock(p);
      if (!b || b.isAir || b.isLiquid) return p;
    } catch {
      return p;
    }
    p = V.up(p, 1);
  }
  return p;
}

let orbitAngle = 0;
const camAt = new Map(); // player id -> last camera position

system.runInterval(() => {
  const m = currentMatch();
  if (!m || m.state === "done") return;
  const t = system.currentTick;
  orbitAngle += 0.05;
  const pr = pair(m);
  if (!pr) return;
  const [a, b] = pr;
  const mid = V.lerp(V.up(a.location, 1.2), V.up(b.location, 1.2), 0.5);
  const sep = V.dist(a.location, b.location);
  const line = sep > 0.5 ? V.norm(V.sub(b.location, a.location)) : { x: 1, y: 0, z: 0 };
  const side = { x: -line.z, y: 0, z: line.x };
  const dist = Math.max(8, Math.min(30, sep * 0.95 + 7));
  const active = shot && t < shot.until ? shot : null;
  if (shot && !active) shot = null;
  for (const p of m.dim.getPlayers({ location: m.center, maxDistance: 220 })) {
    const mode = cameraMode(p);
    if (mode === "free") continue;
    let at;
    let look;
    if (active) {
      at = active.at();
      look = active.look();
    } else if (mode === "orbit") {
      at = V.add(mid, { x: Math.cos(orbitAngle) * dist, y: 4 + sep * 0.15, z: Math.sin(orbitAngle) * dist });
      look = mid;
    } else {
      // keep the camera on the side it's already on so it doesn't flip across the fighters
      const prev = camAt.get(p.id);
      const s2 = prev && V.dot(V.sub(prev, mid), side) < 0 ? V.mul(side, -1) : side;
      at = V.add(V.add(mid, V.mul(s2, dist)), { x: 0, y: 3 + sep * 0.12, z: 0 });
      look = mid;
    }
    if (!at || !look) continue;
    at = open(m.dim, at);
    camAt.set(p.id, at);
    try {
      p.camera.setCamera("minecraft:free", { location: at, facingLocation: look, easeOptions: { easeTime: active ? 0.35 : 0.2, easeType: "Linear" } });
    } catch {
      // ignore
    }
  }
}, 3);

/* ------------------------------------------------------------------------------- automatic cuts */

function behind(e, target, back = 4, up = 1.6) {
  const d = V.norm(V.sub(target.location, e.location));
  return () => (isValid(e) ? V.add(V.sub(e.location, V.mul(d, back)), { x: d.z * 1.5, y: up, z: -d.x * 1.5 }) : undefined);
}

on("special", (s, sp, target) => {
  if (!target || !isValid(target)) return;
  cut(sp.type === "spirit" ? 70 : 40, behind(s.e, target, 4.5, 1.4), () => (isValid(target) ? V.up(target.location, 1) : undefined));
});

on("transformStart", (s) => {
  const e = s.e;
  const base = e.location;
  const d = e.getViewDirection();
  let k = 0;
  cut(s.transforming + 10, () => {
    k += 0.04;
    const ang = Math.atan2(d.z, d.x) + Math.sin(k) * 0.8;
    return V.add(base, { x: Math.cos(ang) * 5, y: 1.5 + k * 0.3, z: Math.sin(ang) * 5 });
  }, () => (isValid(e) ? V.up(e.location, 1.4) : base));
});

on("beamClash", (a, b) => {
  const pa = a.origin;
  const pb = b.origin;
  const mid = V.lerp(pa, pb, 0.5);
  const line = V.norm(V.sub(pb, pa));
  const side = { x: -line.z, y: 0, z: line.x };
  const span = V.dist(pa, pb);
  cut(140, () => V.add(V.add(mid, V.mul(side, span * 0.75 + 8)), { x: 0, y: 3, z: 0 }), () => mid);
});

on("beamClashEnd", () => {
  shot = null;
});

on("fistClash", (s, t) => {
  const a = s.e;
  const b = t.e;
  cut(30, () => {
    if (!isValid(a) || !isValid(b)) return undefined;
    const mid = V.lerp(a.location, b.location, 0.5);
    const line = V.norm(V.sub(b.location, a.location));
    return V.add(mid, { x: -line.z * 4.5, y: 1.4, z: line.x * 4.5 });
  }, () => (isValid(a) && isValid(b) ? V.up(V.lerp(a.location, b.location, 0.5), 1.2) : undefined));
});

on("combo", (s, comboName, target) => {
  const a = s.e;
  if (!target || !isValid(target)) return;
  // a side-on shot that follows the pair, pulled back a little so the whole string stays in view
  const len = Math.max(20, (s.comboRun?.until ?? system.currentTick + 30) - system.currentTick);
  let side = null;
  cut(len, () => {
    if (!isValid(a) || !isValid(target)) return undefined;
    const mid = V.lerp(a.location, target.location, 0.5);
    const line = V.norm(V.sub(target.location, a.location));
    side ??= { x: -line.z, y: 0, z: line.x };
    return V.add(mid, { x: side.x * 6, y: 2.2, z: side.z * 6 });
  }, () => (isValid(a) && isValid(target) ? V.up(V.lerp(a.location, target.location, 0.5), 1.1) : undefined));
});

on("hurt", (victim, attacker) => {
  if (attacker && attacker.typeId === "dbb:fighter" && victim.typeId === "dbb:fighter") setFocus(attacker, victim);
});

/** The winner's close-up after the final blow. */
export function winnerShot(e, ticks = 80) {
  if (!e || !isValid(e)) return;
  const d = e.getViewDirection();
  const base = e.location;
  shot = null;
  // follows the winner down if it was in the air
  const pos = () => (isValid(e) ? e.location : base);
  cut(ticks, () => V.add(pos(), { x: d.x * 4, y: 1.7, z: d.z * 4 }), () => V.up(pos(), 1.5));
}

/** Face-on shot of a fighter (match intros). */
export function introShot(e, ticks = 36) {
  if (!e || !isValid(e)) return;
  const d = e.getViewDirection();
  const base = e.location;
  shot = { until: system.currentTick + ticks, at: () => V.add(base, { x: d.x * 3.6, y: 1.6, z: d.z * 3.6 }), look: () => V.up(base, 1.5) };
}
