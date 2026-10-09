import { world } from "@minecraft/server";

/* World-wide settings (saved in the world) and small JSON storage helpers. */

const KEY = "dbb:settings";

function defaults() {
  return {
    speed: 1, // 0 slow, 1 normal, 2 fast
    terrain: true, // blocks get destroyed by big hits
    restore: true, // put the stage back after a match
    effects: 1, // 0 light (phones), 1 normal, 2 max
    autoCam: true, // cinematic cuts on big moments
    commentary: true,
    lines: true,
    safety: true, // spectators never get hurt
    hpMult: 1, // 0.5 .. 3
    balance: false, // even out power levels
  };
}

let cache = null;

/** @returns {ReturnType<typeof defaults>} */
export function settings() {
  if (cache) return cache;
  cache = Object.assign(defaults(), worldGet(KEY, {}));
  return cache;
}

export function saveSettings() {
  worldSet(KEY, settings());
}

export function worldGet(key, fallback) {
  try {
    const raw = world.getDynamicProperty(key);
    return typeof raw === "string" ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function worldSet(key, value) {
  try {
    world.setDynamicProperty(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/** Multiplier for cooldowns / pauses from the speed setting. */
export function paceFactor() {
  return [1.45, 1, 0.7][settings().speed] ?? 1;
}

/** 0..1 share of decorative particles to actually spawn. */
export function effectShare() {
  return [0.35, 0.75, 1][settings().effects] ?? 0.75;
}
