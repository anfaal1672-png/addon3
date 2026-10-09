import { system, world } from "@minecraft/server";
import { settings } from "../core/settings.js";
import { V, isValid, rand } from "../core/util.js";
import { particle, deco, sound, shakeArea } from "../core/fx.js";
import { on, emit } from "../core/bus.js";

/* Craters, ground cracks, debris, and fighters slamming into the ground or walls. */

const UNBREAKABLE = new Set(["minecraft:bedrock", "minecraft:barrier", "minecraft:command_block", "minecraft:chain_command_block",
  "minecraft:repeating_command_block", "minecraft:structure_block", "minecraft:end_portal_frame", "minecraft:end_portal",
  "minecraft:portal", "minecraft:reinforced_deepslate", "minecraft:chest", "minecraft:barrel", "minecraft:light_block"]);

/** @type {(dim: any, loc: any) => boolean} areas that must never be dug (e.g. outside the current stage) */
let allowed = () => true;
export function setDigRule(fn) {
  allowed = fn;
}

/** Bowl-shaped hole with scorched rim. */
export function carve(dim, center, radius) {
  if (!settings().terrain || radius < 1 || !allowed(dim, center)) return;
  const c = V.floor(center);
  const r = Math.ceil(radius);
  system.runJob((function* () {
    let n = 0;
    for (let y = r; y >= -r; y--) {
      for (let x = -r; x <= r; x++) {
        for (let z = -r; z <= r; z++) {
          const d2 = x * x + y * y * 1.4 + z * z;
          if (d2 > radius * radius) continue;
          const loc = { x: c.x + x, y: c.y + y, z: c.z + z };
          try {
            const b = dim.getBlock(loc);
            if (!b || b.isAir || UNBREAKABLE.has(b.typeId)) continue;
            if (d2 > (radius - 1.2) * (radius - 1.2) && y < 0) {
              if (Math.random() < 0.4 && !b.isLiquid) b.setType(Math.random() < 0.5 ? "minecraft:coarse_dirt" : "minecraft:basalt");
            } else if (!b.isLiquid) {
              b.setType("minecraft:air");
            }
          } catch {
            // unloaded
          }
          if (++n % 48 === 0) yield;
        }
      }
    }
  })());
}

/** Cracked, scorched ground in a ring (no holes): power-ups, landings, shock waves. */
export function crackGround(dim, center, radius) {
  if (!settings().terrain || !allowed(dim, center)) return;
  const c = V.floor(center);
  system.runJob((function* () {
    let n = 0;
    for (let i = 0; i < radius * 7; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(0.5, radius);
      const x = c.x + Math.round(Math.cos(a) * d);
      const z = c.z + Math.round(Math.sin(a) * d);
      for (let y = c.y + 1; y >= c.y - 3; y--) {
        try {
          const b = dim.getBlock({ x, y, z });
          if (!b || b.isAir || b.isLiquid || UNBREAKABLE.has(b.typeId)) continue;
          b.setType(pickCrack());
        } catch {
          // ignore
        }
        break;
      }
      if (++n % 24 === 0) yield;
    }
  })());
}

function pickCrack() {
  const r = Math.random();
  return r < 0.4 ? "minecraft:coarse_dirt" : r < 0.7 ? "minecraft:cobblestone" : r < 0.88 ? "minecraft:gravel" : "minecraft:basalt";
}

/** Dust, rock bits and a thud where something heavy hits the ground. */
export function impactFx(dim, loc, size = 1) {
  particle(dim, "dbb:impact", V.up(loc, 0.6), "white", 1.5 + size);
  particle(dim, "dbb:shockwave", V.up(loc, 0.15), "white", 1 + size);
  deco(dim, "dbb:dust_rise", loc, "white", 1 + size);
  deco(dim, "dbb:pop_smoke", loc, "white", 1 + size * 0.5);
  sound(dim, "dbb.impact", loc, 1 + size * 0.4, 1.1 - Math.min(0.4, size * 0.08));
  shakeArea(dim, loc, 20 + size * 6, 0.3 + size * 0.15, 0.35);
}

/* ------------------------------------------------------------------------------- slamming into things */

const flying = new Map(); // id -> { since, power, lastSpeed }

on("launched", (e, power) => flying.set(e.id, { since: system.currentTick, power, lastSpeed: 0 }));

system.runInterval(() => {
  const t = system.currentTick;
  for (const [id, f] of flying) {
    const e = world.getEntity(id);
    if (!e || !isValid(e) || t - f.since > 40) {
      flying.delete(id);
      continue;
    }
    let v;
    try {
      v = e.getVelocity();
    } catch {
      flying.delete(id);
      continue;
    }
    const speed = Math.hypot(v.x, v.y, v.z);
    if (t - f.since >= 2 && f.lastSpeed > 0.55 && speed < f.lastSpeed * 0.35) {
      flying.delete(id);
      const size = Math.min(3, f.power * 0.9);
      impactFx(e.dimension, e.location, size);
      if (f.power >= 1.9) carve(e.dimension, V.up(e.location, 0.5), Math.min(3.2, 1.2 + f.power * 0.6));
      else crackGround(e.dimension, V.up(e.location, -1), 2 + f.power);
      emit("slammed", e, size);
      continue;
    }
    f.lastSpeed = speed;
  }
}, 1);
