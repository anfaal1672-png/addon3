import { system, world, InputButton, ButtonState } from "@minecraft/server";
import { getData, rt, settings } from "../core/data.js";
import { kiCostMult, addExp } from "../core/stats.js";
import { V, clamp, isValid } from "../core/util.js";
import { particle, sound, afterimage, shakeArea, msg } from "../core/fx.js";
import { setPose, refreshVisuals } from "./forms.js";
import { tryChase } from "./melee.js";
import { registerMash, carve } from "./projectiles.js";
import { hurt, isHostile } from "./damage.js";

/* ------------------------------------------------------------------------------- input */

world.afterEvents.playerButtonInput.subscribe((ev) => {
  const p = ev.player;
  const d = getData(p);
  if (!d.race) return;
  const r = rt(p);
  if (ev.newButtonState !== ButtonState.Pressed) return;
  if (ev.button === InputButton.Jump) {
    registerMash(p);
    if (!r.flying && !p.isOnGround && r.airTicks > 2 && !r.oozaru && !p.isFlying) startFlight(p);
  } else if (ev.button === InputButton.Sneak) {
    const now = system.currentTick;
    if (now - r.lastSneak <= 7) {
      r.lastSneak = -100;
      if (!tryChase(p)) dash(p);
    } else {
      r.lastSneak = now;
    }
  }
});

/* ------------------------------------------------------------------------------- flight */

export function startFlight(p) {
  const d = getData(p);
  const r = rt(p);
  if (d.ki < 5) {
    msg(p, "§c気が足りなくて飛べない！");
    return;
  }
  r.flying = true;
  r.groundTicks = 0;
  particle(p.dimension, "dbz:shockwave", p.location, "white", 1.5);
  sound(p.dimension, "dbz.dash", p.location, 0.8, 0.8);
  try {
    p.addEffect("slow_falling", 40, { amplifier: 0, showParticles: false });
  } catch {
    // ignore
  }
}

export function stopFlight(p) {
  const r = rt(p);
  if (!r.flying) return;
  r.flying = false;
  r.fastFly = false;
  setPose(p, "none");
  refreshVisuals(p);
  try {
    p.addEffect("slow_falling", 30, { amplifier: 0, showParticles: false });
  } catch {
    // ignore
  }
}

function speedOf(d) {
  return clamp(0.42 + d.stats.spd * 0.005 + d.level * 0.0015, 0.42, 1.25);
}

export function flightTick(p) {
  const d = getData(p);
  const r = rt(p);
  const onGround = p.isOnGround;
  r.airTicks = onGround ? 0 : r.airTicks + 1;
  // landing impact tracking
  const vel = p.getVelocity();
  if (!onGround) r.fallSpeed = Math.min(r.fallSpeed, vel.y);
  if (onGround && r.fallSpeed < -1.05) landingImpact(p, r.fallSpeed);
  if (onGround) r.fallSpeed = 0;
  if (!r.flying) return;
  if (r.oozaru || p.isFlying) {
    stopFlight(p);
    return;
  }
  let jump = false;
  let sneak = false;
  let mv = { x: 0, y: 0 };
  try {
    jump = p.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
    sneak = p.inputInfo.getButtonState(InputButton.Sneak) === ButtonState.Pressed;
    mv = p.inputInfo.getMovementVector();
  } catch {
    // ignore
  }
  if (onGround) {
    r.groundTicks++;
    if ((sneak || r.groundTicks > 6) && !jump) {
      stopFlight(p);
      return;
    }
  } else {
    r.groundTicks = 0;
  }
  const fast = p.isSprinting && mv.y > 0.3;
  r.fastFly = fast;
  const base = speedOf(d) * (fast ? 2.2 : 1);
  const view = p.getViewDirection();
  const rot = p.getRotation();
  const yr = (rot.y * Math.PI) / 180;
  const left = { x: Math.cos(yr), y: 0, z: Math.sin(yr) };
  let dir = V.add(V.mul(view, mv.y), V.mul(left, mv.x));
  let vy = dir.y * base;
  if (jump) vy = Math.max(vy, base * 0.7);
  if (sneak && !onGround) vy = Math.min(vy, -base * 0.7);
  const vx = dir.x * base;
  const vz = dir.z * base;
  try {
    p.applyKnockback({ x: vx, z: vz }, vy);
  } catch {
    // ignore
  }
  // ki drain
  const moving = Math.abs(mv.x) + Math.abs(mv.y) > 0.1 || jump || sneak;
  const drain = (fast ? 0.45 : moving ? 0.12 : 0.05) * kiCostMult(d);
  d.ki -= drain;
  if (d.ki <= 0) {
    d.ki = 0;
    msg(p, "§c気が尽きて舞空術が切れた！");
    stopFlight(p);
    return;
  }
  // visuals
  if (fast) {
    setPose(p, "fly_fast", 3);
    if (system.currentTick % 2 === 0) {
      particle(p.dimension, "dbz:trail", V.up(p.location, 0.9), "white", 1.2);
      particle(p.dimension, "dbz:speed_lines", V.up(p.location, 1), "white", 1, { dir: view });
    }
    if (system.currentTick % 30 === 0) sound(p.dimension, "dbz.wind", p.location, 0.7);
  } else if (moving && mv.y > 0.3) {
    setPose(p, "fly", 3);
  } else if (!r.casting && !r.charging) {
    setPose(p, "none");
  }
  if (system.currentTick % 20 === 0) {
    refreshVisuals(p);
    if (fast) d.train.runDist += 20;
  }
  try {
    if (system.currentTick % 20 === 0) p.addEffect("slow_falling", 30, { amplifier: 0, showParticles: false });
  } catch {
    // ignore
  }
}

function landingImpact(p, vy) {
  const r = rt(p);
  const d = getData(p);
  if (d.level < 5) return;
  const power = clamp(-vy, 1, 4);
  const dim = p.dimension;
  particle(dim, "dbz:shockwave", V.up(p.location, 0.1), "white", power * 1.4);
  particle(dim, "dbz:dust_rise", p.location, "white", power);
  sound(dim, "dbz.punch_heavy", p.location, 1 + power * 0.3, 0.6);
  shakeArea(dim, p.location, 10, 0.25 * power, 0.3);
  for (const e of dim.getEntities({ location: p.location, maxDistance: 2 + power, excludeFamilies: ["dbz_fx", "inanimate"] })) {
    if (e.id === p.id || !isHostile(p, e)) continue;
    hurt(e, 3 * power, p, { knock: { dir: V.sub(e.location, p.location), h: 0.6 * power, v: 0.4 } });
  }
  if (settings().terrain && power >= 2.6) carve(dim, V.up(p.location, -1), 1.8);
  r.fallSpeed = 0;
}

/* ------------------------------------------------------------------------------- dash */

export function dash(p) {
  const d = getData(p);
  const r = rt(p);
  if (r.oozaru || r.rushTicks) return;
  const cost = 6 * kiCostMult(d);
  if (d.ki < cost) return;
  d.ki -= cost;
  const view = p.getViewDirection();
  const flat = r.flying ? view : V.norm({ x: view.x, y: 0, z: view.z });
  const head = p.getHeadLocation();
  let dist = 7 + Math.min(5, d.stats.spd * 0.05);
  try {
    const hit = p.dimension.getBlockFromRay(head, flat, { maxDistance: dist + 1, includePassableBlocks: false, includeLiquidBlocks: false });
    if (hit) dist = Math.max(0, V.dist(head, hit.block.location) - 1.5);
  } catch {
    // ignore
  }
  if (dist < 1) return;
  const from = p.location;
  const dest = V.add(from, V.mul(flat, dist));
  afterimage(p.dimension, from, "white");
  particle(p.dimension, "dbz:speed_lines", V.up(from, 1), "white", 1, { dir: flat });
  try {
    p.teleport(dest, { keepVelocity: false, checkForBlocks: true });
  } catch {
    return;
  }
  sound(p.dimension, "dbz.dash", from, 1);
  addExp(p, 0.1, true);
}

/* ------------------------------------------------------------------------------- instant transmission */

export function transmitTo(p, loc, dim, facing) {
  const d = getData(p);
  const cost = 30 * kiCostMult(d);
  if (d.ki < cost) {
    msg(p, "§c気が足りない！");
    return false;
  }
  d.ki -= cost;
  setPose(p, "forehead", 14);
  sound(p.dimension, "dbz.teleport", p.location, 1.2);
  particle(p.dimension, "dbz:pillar", p.location, "white", 1);
  system.runTimeout(() => {
    if (!isValid(p)) return;
    afterimage(p.dimension, p.location, "white");
    try {
      p.teleport(loc, { dimension: dim ?? p.dimension, facingLocation: facing, checkForBlocks: false });
    } catch {
      return;
    }
    system.run(() => {
      sound(p.dimension, "dbz.teleport", p.location, 1.2, 1.3);
      particle(p.dimension, "dbz:pillar", p.location, "white", 1);
    });
  }, 12);
  return true;
}
