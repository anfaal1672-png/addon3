import { MolangVariableMap, world } from "@minecraft/server";
import { AURA_RGB, KI_RGB } from "../gen/catalog.js";
import { cmd, V } from "./util.js";

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

export function sound(dim, id, loc, volume = 1, pitch = 1) {
  try {
    dim.playSound(id, loc, { volume, pitch });
  } catch {
    // ignore
  }
}

export function psound(player, id, volume = 1, pitch = 1) {
  try {
    player.playSound(id, { volume, pitch });
  } catch {
    // ignore
  }
}

export function shake(player, intensity = 0.4, seconds = 0.4) {
  cmd(player, `camerashake add @s ${intensity.toFixed(2)} ${seconds.toFixed(2)} positional`);
}

export function shakeArea(dim, loc, radius, intensity, seconds) {
  for (const p of dim.getPlayers({ location: loc, maxDistance: radius })) {
    const d = V.dist(p.location, loc);
    shake(p, intensity * (1 - d / (radius * 1.2)), seconds);
  }
}

export function title(player, text, sub = "", stay = 40) {
  try {
    player.onScreenDisplay.setTitle(text, { subtitle: sub, fadeInDuration: 5, stayDuration: stay, fadeOutDuration: 10 });
  } catch {
    // ignore
  }
}

export function flash(player, color = { red: 1, green: 1, blue: 1 }, hold = 0.1) {
  try {
    player.camera.fade({ fadeColor: color, fadeTime: { fadeInTime: 0.05, holdTime: hold, fadeOutTime: 0.4 } });
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
  world.sendMessage(text);
}

export function say(player, speaker, text) {
  msg(player, `§e${speaker}§r「${text}」`);
}

/** Explosion visuals (no damage). */
export function boom(dim, loc, color, size) {
  particle(dim, "dbz:explosion_core", loc, color, size);
  particle(dim, "dbz:explosion_smoke", loc, "white", size);
  particle(dim, "dbz:shockwave", V.up(loc, 0.2), color, size);
  particle(dim, "dbz:dust_rise", loc, "white", size);
  sound(dim, size >= 5 ? "dbz.big_explosion" : "dbz.explosion", loc, Math.min(4, 1 + size * 0.3), size >= 5 ? 0.8 : 1.0);
  shakeArea(dim, loc, 12 + size * 4, Math.min(1.5, 0.2 + size * 0.12), 0.4 + size * 0.05);
}

export function afterimage(dim, loc, color = "white") {
  particle(dim, "dbz:afterimage", loc, color, 1);
}
