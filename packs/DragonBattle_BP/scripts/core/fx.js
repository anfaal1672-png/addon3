import { MolangVariableMap, world } from "@minecraft/server";
import { AURA_RGB, KI_RGB } from "../gen/catalog.js";
import { cmd, V } from "./util.js";
import { effectShare } from "./settings.js";

/** Color helpers: accept [r,g,b] (0..1) or a key from the ki / aura palettes. */
export function rgbOf(c) {
  if (Array.isArray(c)) return c;
  return KI_RGB[c] ?? AURA_RGB[c] ?? [1, 1, 1];
}

export function vars(color, size = 1, extra = {}) {
  const m = new MolangVariableMap();
  const [r, g, b] = rgbOf(color);
  m.setColorRGB("variable.color", { red: r, green: g, blue: b });
  m.setFloat("variable.size", size);
  if (extra.dir) m.setVector3("variable.dir", extra.dir);
  if (extra.speed !== undefined) m.setFloat("variable.speed", extra.speed);
  return m;
}

export function particle(dim, id, loc, color = "white", size = 1, extra = {}) {
  try {
    dim.spawnParticle(id, loc, vars(color, size, extra));
  } catch {
    // unloaded chunk etc.
  }
}

/** Decorative particle: skipped now and then on lighter effect settings. */
export function deco(dim, id, loc, color = "white", size = 1, extra = {}) {
  if (Math.random() > effectShare()) return;
  particle(dim, id, loc, color, size, extra);
}

export function sound(dim, id, loc, volume = 1, pitch = 1) {
  try {
    dim.playSound(id, loc, { volume, pitch });
  } catch {
    // ignore
  }
}

export function shake(player, intensity = 0.4, seconds = 0.4) {
  cmd(player, `camerashake add @s ${Math.max(0.01, Math.min(4, intensity)).toFixed(2)} ${seconds.toFixed(2)} positional`);
}

export function shakeArea(dim, loc, radius, intensity, seconds) {
  for (const p of dim.getPlayers({ location: loc, maxDistance: radius })) {
    const d = V.dist(p.location, loc);
    shake(p, intensity * (1 - d / (radius * 1.2)), seconds);
  }
}

export function title(player, text, sub = "", stay = 40) {
  try {
    player.onScreenDisplay.setTitle(text, { subtitle: sub, fadeInDuration: 3, stayDuration: stay, fadeOutDuration: 8 });
  } catch {
    // ignore
  }
}

export function actionbar(player, text) {
  try {
    player.onScreenDisplay.setActionBar(text);
  } catch {
    // ignore
  }
}

export function flash(player, color = { red: 1, green: 1, blue: 1 }, hold = 0.05) {
  try {
    player.camera.fade({ fadeColor: color, fadeTime: { fadeInTime: 0.03, holdTime: hold, fadeOutTime: 0.35 } });
  } catch {
    // ignore
  }
}

export function msg(player, text) {
  try {
    player.sendMessage(text);
  } catch {
    // ignore
  }
}

export function broadcast(text) {
  try {
    world.sendMessage(text);
  } catch {
    // ignore
  }
}

/** Players close enough to care about something happening at loc. */
export function watchers(dim, loc, range = 120) {
  try {
    return dim.getPlayers({ location: loc, maxDistance: range });
  } catch {
    return [];
  }
}

/** Explosion visuals (no damage). */
export function boom(dim, loc, color, size) {
  particle(dim, "dbb:explosion_core", loc, color, size);
  particle(dim, "dbb:explosion_smoke", loc, "white", size);
  particle(dim, "dbb:shockwave", V.up(loc, 0.2), color, size);
  deco(dim, "dbb:dust_rise", loc, "white", size);
  sound(dim, size >= 5 ? "dbb.big_explosion" : "dbb.explosion", loc, Math.min(4, 1 + size * 0.3), size >= 5 ? 0.8 : 1.0);
  shakeArea(dim, loc, 14 + size * 4, Math.min(1.6, 0.2 + size * 0.13), 0.4 + size * 0.05);
}

export function afterimage(dim, loc, color = "white") {
  particle(dim, "dbb:afterimage", loc, color, 1);
}
