import { BlockVolume } from "@minecraft/server";

/* Block-building primitives. All coordinates are integers in world space.
 * Every helper is safe to call on unloaded areas (it simply does nothing there). */

export function fill(dim, x1, y1, z1, x2, y2, z2, block) {
  const a = { x: Math.min(x1, x2), y: Math.max(-63, Math.min(y1, y2)), z: Math.min(z1, z2) };
  const b = { x: Math.max(x1, x2), y: Math.min(318, Math.max(y1, y2)), z: Math.max(z1, z2) };
  if (a.y > b.y) return;
  // split into chunks of <= 32768 blocks
  const sx = b.x - a.x + 1;
  const sy = b.y - a.y + 1;
  const sz = b.z - a.z + 1;
  if (sx * sy * sz > 32000) {
    const mid = Math.floor((a.y + b.y) / 2);
    if (sy > 1) {
      fill(dim, a.x, a.y, a.z, b.x, mid, b.z, block);
      fill(dim, a.x, mid + 1, a.z, b.x, b.y, b.z, block);
      return;
    }
    const mx = Math.floor((a.x + b.x) / 2);
    fill(dim, a.x, a.y, a.z, mx, b.y, b.z, block);
    fill(dim, mx + 1, a.y, a.z, b.x, b.y, b.z, block);
    return;
  }
  try {
    dim.fillBlocks(new BlockVolume(a, b), block);
  } catch {
    // unloaded or invalid
  }
}

export function set(dim, x, y, z, block) {
  try {
    const b = dim.getBlock({ x, y, z });
    if (b) b.setType(block);
  } catch {
    // ignore
  }
}

export function setPerm(dim, x, y, z, block, states) {
  try {
    const b = dim.getBlock({ x, y, z });
    if (!b) return;
    b.setType(block);
    if (states) {
      let perm = b.permutation;
      for (const [k, v] of Object.entries(states)) perm = perm.withState(/** @type {any} */ (k), v);
      b.setPermutation(perm);
    }
  } catch {
    // ignore
  }
}

/** Horizontal filled disc (or ring when inner > 0) at height y. */
export function disc(dim, cx, y, cz, r, block, inner = -1) {
  for (let dx = -Math.floor(r); dx <= Math.floor(r); dx++) {
    const span = Math.floor(Math.sqrt(Math.max(0, r * r - dx * dx)));
    if (inner < 0) {
      fill(dim, cx + dx, y, cz - span, cx + dx, y, cz + span, block);
    } else {
      const ispan = inner * inner - dx * dx > 0 ? Math.floor(Math.sqrt(inner * inner - dx * dx)) : -1;
      if (ispan < 0) {
        fill(dim, cx + dx, y, cz - span, cx + dx, y, cz + span, block);
      } else {
        if (span > ispan) {
          fill(dim, cx + dx, y, cz - span, cx + dx, y, cz - ispan - 1, block);
          fill(dim, cx + dx, y, cz + ispan + 1, cx + dx, y, cz + span, block);
        }
      }
    }
  }
}

export function cylinder(dim, cx, cz, r, y1, y2, block, hollow = false) {
  for (let dx = -Math.floor(r); dx <= Math.floor(r); dx++) {
    const span = Math.floor(Math.sqrt(Math.max(0, r * r - dx * dx)));
    if (!hollow) {
      fill(dim, cx + dx, y1, cz - span, cx + dx, y2, cz + span, block);
    } else {
      const ir = r - 1;
      const ispan = ir * ir - dx * dx > 0 ? Math.floor(Math.sqrt(ir * ir - dx * dx)) : -1;
      if (ispan < 0) fill(dim, cx + dx, y1, cz - span, cx + dx, y2, cz + span, block);
      else {
        fill(dim, cx + dx, y1, cz - span, cx + dx, y2, cz - ispan, block);
        fill(dim, cx + dx, y1, cz + ispan, cx + dx, y2, cz + span, block);
      }
    }
  }
}

/** Upper half sphere (dome). hollow keeps a 1-block shell and clears inside. */
export function dome(dim, cx, cy, cz, r, block, hollow = true, squash = 1.0) {
  const h = Math.ceil(r * squash);
  for (let y = 0; y <= h; y++) {
    const rr = r * Math.sqrt(Math.max(0, 1 - (y / (r * squash)) ** 2));
    if (rr < 0.5) {
      fill(dim, cx, cy + y, cz, cx, cy + y, cz, block);
      continue;
    }
    if (hollow) {
      const yi = y + 1;
      const inner = r - 1.2;
      const ir = inner * Math.sqrt(Math.max(0, 1 - (yi / Math.max(0.1, inner * squash)) ** 2));
      disc(dim, cx, cy + y, cz, rr, block, y === 0 ? -1 : Math.max(-1, ir - 0.3));
      if (ir > 0.8 && y > 0) disc(dim, cx, cy + y, cz, ir - 0.3, "minecraft:air");
    } else {
      disc(dim, cx, cy + y, cz, rr, block);
    }
  }
}

export function sphere(dim, cx, cy, cz, r, block) {
  for (let y = -Math.floor(r); y <= Math.floor(r); y++) {
    const rr = Math.sqrt(Math.max(0, r * r - y * y));
    disc(dim, cx, cy + y, cz, rr, block);
  }
}

/** Flatten a square area: air above `y`, `top` at y-1 and `base` below down to `depth`. */
export function flatten(dim, cx, y, cz, r, top = "minecraft:grass_block", base = "minecraft:dirt", height = 24, depth = 6) {
  fill(dim, cx - r, y, cz - r, cx + r, y + height, cz + r, "minecraft:air");
  fill(dim, cx - r, y - depth, cz - r, cx + r, y - 2, cz + r, base);
  fill(dim, cx - r, y - 1, cz - r, cx + r, y - 1, cz + r, top);
}

export function flattenRound(dim, cx, y, cz, r, top = "minecraft:grass_block", base = "minecraft:dirt", height = 24, depth = 6) {
  cylinder(dim, cx, cz, r, y, y + height, "minecraft:air");
  cylinder(dim, cx, cz, r, y - depth, y - 2, base);
  disc(dim, cx, y - 1, cz, r, top);
}

export function hollowBox(dim, x1, y1, z1, x2, y2, z2, wall, floor = null, roof = null) {
  fill(dim, x1, y1, z1, x2, y2, z2, wall);
  fill(dim, x1 + 1, y1 + 1, z1 + 1, x2 - 1, y2 - 1, z2 - 1, "minecraft:air");
  if (floor) fill(dim, x1, y1, z1, x2, y1, z2, floor);
  if (roof) fill(dim, x1, y2, z1, x2, y2, z2, roof);
}

export function tree(dim, x, y, z, log = "minecraft:oak_log", leaves = "minecraft:oak_leaves", h = 6, r = 2.5) {
  fill(dim, x, y, z, x, y + h - 1, z, log);
  sphere(dim, x, y + h, z, r, leaves);
  fill(dim, x, y, z, x, y + h - 1, z, log);
}

export function palm(dim, x, y, z, h = 8) {
  let cx = x;
  for (let i = 0; i < h; i++) {
    if (i === Math.floor(h / 2)) cx += 1;
    set(dim, cx, y + i, z, "minecraft:jungle_log");
  }
  const top = y + h;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
    set(dim, cx + dx, top - (Math.abs(dx) + Math.abs(dz) >= 3 ? 1 : 0), z + dz, "minecraft:jungle_leaves");
  }
  set(dim, cx, top, z, "minecraft:jungle_leaves");
}

export function surfaceY(dim, x, z, fallback = 64) {
  try {
    const b = dim.getTopmostBlock({ x, z });
    if (!b) return fallback;
    let y = b.location.y;
    // skip foliage
    for (let i = 0; i < 24; i++) {
      const t = dim.getBlock({ x, y, z })?.typeId ?? "";
      if (t.includes("leaves") || t.includes("log") || t.includes("grass") && !t.includes("grass_block") || t.includes("flower") ||
        t.includes("snow_layer") || t.includes("vine") || t === "minecraft:air") {
        y--;
        continue;
      }
      break;
    }
    return y + 1;
  } catch {
    return fallback;
  }
}

export function loaded(dim, x, y, z) {
  try {
    return !!dim.getBlock({ x, y, z });
  } catch {
    return false;
  }
}
