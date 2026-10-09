import { world, system } from "@minecraft/server";

/* ----------------------------------------------------------------------------------------------
 * Persistent player data (JSON in a dynamic property) + transient runtime state per player.
 * -------------------------------------------------------------------------------------------- */

const KEY = "dbz:data";
const cache = new Map(); // player.id -> data
const dirty = new Set();

export function defaultData() {
  return {
    v: 1,
    race: null,
    level: 1,
    exp: 0,
    points: 0,
    stats: { str: 1, ki: 1, vit: 1, spd: 1, def: 1 },
    ki: 100,
    techs: ["ki_blast"],
    slots: ["ki_blast", null, null, null],
    forms: [],
    target: null,
    hairStyle: "goku",
    showBaseHair: false,
    showRace: true,
    hud: "full",
    tail: false,
    allies: {},
    saga: 0,
    bosses: [],
    quests: {},
    train: { gravityBest: 1, htcSec: 0, kaiSec: 0, meditateSec: 0, ssjSec: 0, runDist: 0, dummyHits: 0, chargeSec: 0 },
    tp: [],
    visited: { earth: true },
    karma: 0,
    immortal: false,
    pu: 0,
    tournament: 0,
    zenkai: 0,
    sacredWater: false,
    kitGiven: false,
    stats_spent: 0,
    deaths: 0,
    kills: 0,
    oozaruDone: false,
  };
}

function migrate(d) {
  const base = defaultData();
  for (const k of Object.keys(base)) {
    if (d[k] === undefined) d[k] = base[k];
  }
  for (const k of Object.keys(base.train)) {
    if (d.train[k] === undefined) d.train[k] = base.train[k];
  }
  for (const k of Object.keys(base.stats)) {
    if (d.stats[k] === undefined) d.stats[k] = 1;
  }
  return d;
}

/**
 * @param {any} p
 * @returns {any}
 */
export function getData(p) {
  let d = cache.get(p.id);
  if (d) return d;
  try {
    const raw = p.getDynamicProperty(KEY);
    d = typeof raw === "string" ? migrate(JSON.parse(raw)) : defaultData();
  } catch {
    d = defaultData();
  }
  cache.set(p.id, d);
  return d;
}

export function markDirty(p) {
  dirty.add(p.id);
}

/** @param {any} p */
export function saveNow(p) {
  const d = cache.get(p.id);
  if (!d) return;
  try {
    p.setDynamicProperty(KEY, JSON.stringify(d));
    dirty.delete(p.id);
  } catch {
    // ignore
  }
}

export function resetData(p) {
  cache.set(p.id, defaultData());
  saveNow(p);
}

export function forgetPlayer(id) {
  cache.delete(id);
  runtime.delete(id);
}

system.runInterval(() => {
  if (!dirty.size) return;
  for (const p of world.getAllPlayers()) {
    if (dirty.has(p.id)) saveNow(p);
  }
}, 100);

/* ---------------------------------------------------------------------------- runtime state */

const runtime = new Map();

/** @returns {any} */
export function rt(p) {
  let r = runtime.get(p.id);
  if (!r) {
    r = {
      flying: false,
      airTicks: 0,
      groundTicks: 0,
      form: null,
      kaioken: 0,
      charging: false,
      chargeTicks: 0,
      casting: null, // {tech, slot, ticks, startTick}
      guard: false,
      guardStart: 0,
      lastSneak: -100,
      comboCount: 0,
      comboTarget: null,
      lastHitTick: -100,
      chaseUntil: 0,
      chaseTarget: null,
      hiddenKi: false,
      lockTicks: 0,
      pose: 0,
      poseUntil: 0,
      hudMsg: "",
      hudMsgUntil: 0,
      fusion: null,
      oozaru: 0,
      lastFall: 0,
      fallSpeed: 0,
      beam: null,
      region: null,
      fog: null,
      gravity: 1,
      inSpar: null,
      lastDamageTick: 0,
      meditateTicks: 0,
      stillTicks: 0,
      lastPos: null,
      lastAuraFx: 0,
      scouterTarget: null,
      menuOpen: false,
      deathTick: 0,
      lastKiCharged: 0,
      rushTicks: 0,
      rushTarget: null,
      cooldowns: {},
      giantForm: false,
      clash: null,
      hp: 0,
    };
    runtime.set(p.id, r);
  }
  return r;
}

/* ---------------------------------------------------------------------------- world settings */

const SKEY = "dbz:settings";
let settingsCache = null;

export function defaultSettings() {
  return {
    difficulty: 1.0,
    terrain: true,
    kiCost: 1.0,
    growth: 1.0,
    pvp: true,
    spawnRate: 1.0,
    dbDays: 3,
    structures: true,
    bossIntro: true,
  };
}

/** @returns {any} */
export function settings() {
  if (settingsCache) return settingsCache;
  try {
    const raw = world.getDynamicProperty(SKEY);
    settingsCache = Object.assign(defaultSettings(), typeof raw === "string" ? JSON.parse(raw) : {});
  } catch {
    settingsCache = defaultSettings();
  }
  return settingsCache;
}

export function saveSettings() {
  try {
    world.setDynamicProperty(SKEY, JSON.stringify(settings()));
  } catch {
    // ignore
  }
}

/* ---------------------------------------------------------------------------- generic world json */

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
