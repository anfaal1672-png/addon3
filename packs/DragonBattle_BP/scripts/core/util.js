import { system, world } from "@minecraft/server";

export const V = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  mul: (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s }),
  len: (a) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z),
  dist: (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2),
  dist2: (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2,
  hdist: (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2),
  norm: (a) => {
    const l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) || 1;
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  },
  dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
  lerp: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }),
  floor: (a) => ({ x: Math.floor(a.x), y: Math.floor(a.y), z: Math.floor(a.z) }),
  up: (a, h) => ({ x: a.x, y: a.y + h, z: a.z }),
  zero: () => ({ x: 0, y: 0, z: 0 }),
};

/** Minecraft yaw (degrees, 0 = +Z) to a horizontal unit vector. */
export function yawDir(yaw) {
  const r = (yaw * Math.PI) / 180;
  return { x: -Math.sin(r), y: 0, z: Math.cos(r) };
}

/** Direction vector to Minecraft yaw/pitch. */
export function dirToRot(d) {
  const yaw = (Math.atan2(-d.x, d.z) * 180) / Math.PI;
  const pitch = (-Math.atan2(d.y, Math.sqrt(d.x * d.x + d.z * d.z)) * 180) / Math.PI;
  return { yaw, pitch };
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;

/** Format a power level the Japanese way: 12,345 / 1.2億 / 3.4兆. */
export function fmtPL(n) {
  n = Math.floor(n);
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "兆";
  if (n >= 1e8) return (n / 1e8).toFixed(2) + "億";
  if (n >= 1e5) return (n / 1e4).toFixed(1) + "万";
  return n.toLocaleString("en-US");
}

export function bar(frac, len, on = "|", off = "|", onColor = "§b", offColor = "§8") {
  frac = clamp(frac, 0, 1);
  const n = Math.round(frac * len);
  return onColor + on.repeat(n) + offColor + off.repeat(len - n);
}

export function safe(fn, label = "dbb") {
  try {
    return fn();
  } catch (e) {
    if (DEBUG) console.warn(`[${label}] ${e}\n${e?.stack ?? ""}`);
    /** @type {any} */ (globalThis).__dbbErrors?.push(e);
    return undefined;
  }
}

export const DEBUG = false;

export function isValid(e) {
  try {
    return !!e && e.isValid;
  } catch {
    return false;
  }
}

export function tick() {
  return system.currentTick;
}

export function allPlayers() {
  return world.getAllPlayers();
}

export function cmd(entity, command) {
  try {
    entity.runCommand(command);
    return true;
  } catch {
    return false;
  }
}

export function dimCmd(dim, command) {
  try {
    dim.runCommand(command);
    return true;
  } catch {
    return false;
  }
}

/** 8-way arrow for a relative angle in degrees (0 = straight ahead). */
export function arrowFor(relDeg) {
  const a = ((relDeg % 360) + 360) % 360;
  const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  return arrows[Math.round(a / 45) % 8];
}

export function compass(dx, dz) {
  const ang = (Math.atan2(dx, -dz) * 180) / Math.PI;
  const names = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
  return names[Math.round((((ang % 360) + 360) % 360) / 45) % 8];
}

export function sleep(ticks) {
  return new Promise((res) => system.runTimeout(() => res(undefined), ticks));
}

export function chunkKey(x, z) {
  return `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
}
