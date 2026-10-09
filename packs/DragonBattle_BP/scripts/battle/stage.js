import { system, world, BlockVolume, StructureSaveMode } from "@minecraft/server";
import { rand } from "../core/util.js";

/* Battle stages, built from vanilla blocks around a center point, and saving / restoring the ground there
 * so the world can be put back the way it was after a match. */

export const STAGES = [
  { id: "ring", name: "天下一武道会のリング", ringOut: true },
  { id: "wasteland", name: "荒野" },
  { id: "namek", name: "ナメック星" },
  { id: "cellring", name: "セルゲームのリング", ringOut: true },
  { id: "beerus", name: "破壊神ビルスの星" },
  { id: "top", name: "力の大会の武舞台", ringOut: true },
  { id: "htc", name: "精神と時の部屋" },
  { id: "here", name: "今いる場所（ステージを作らない）" },
];

export const R = 28; // half size of the area a stage occupies
const DOWN = 6;
const UP = 34;

/** Ground height at x,z (first solid block from above, +1). */
export function groundY(dim, x, z, fallback) {
  try {
    const b = dim.getTopmostBlock({ x, z });
    if (b) return b.location.y + 1;
  } catch {
    // ignore
  }
  return fallback;
}

function fill(dim, from, to, block) {
  // split so no single fill is larger than the engine allows
  const lo = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), z: Math.min(from.z, to.z) };
  const hi = { x: Math.max(from.x, to.x), y: Math.max(from.y, to.y), z: Math.max(from.z, to.z) };
  const sx = hi.x - lo.x + 1;
  const sz = hi.z - lo.z + 1;
  const layers = Math.max(1, Math.floor(32000 / (sx * sz)));
  for (let y = lo.y; y <= hi.y; y += layers) {
    try {
      dim.fillBlocks(new BlockVolume({ x: lo.x, y, z: lo.z }, { x: hi.x, y: Math.min(hi.y, y + layers - 1), z: hi.z }), block,
        { ignoreChunkBoundErrors: true });
    } catch {
      // unloaded / out of the world
    }
  }
}

function set(dim, loc, block) {
  try {
    dim.getBlock(loc)?.setType(block);
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------------------- save / restore */

/** Copy the stage area into memory structures. Returns a handle for restore(). */
export function snapshot(dim, c) {
  const tiles = [];
  const base = `dbb:stage_${system.currentTick}`;
  let n = 0;
  for (let x = c.x - R; x <= c.x + R; x += 32) {
    for (let z = c.z - R; z <= c.z + R; z += 32) {
      const from = { x, y: c.y - DOWN, z };
      const to = { x: Math.min(c.x + R, x + 31), y: c.y + UP, z: Math.min(c.z + R, z + 31) };
      const id = `${base}_${n++}`;
      try {
        world.structureManager.createFromWorld(id, dim, from, to, { saveMode: StructureSaveMode.Memory, includeEntities: false, includeBlocks: true });
        tiles.push({ id, from });
      } catch {
        // ignore
      }
    }
  }
  return { dim, tiles };
}

/** Put the saved area back and forget the copies. */
export function restore(handle) {
  if (!handle) return;
  for (const t of handle.tiles) {
    try {
      world.structureManager.place(t.id, handle.dim, t.from);
    } catch {
      // ignore
    }
    try {
      world.structureManager.delete(t.id);
    } catch {
      // ignore
    }
  }
  handle.tiles = [];
}

/** Is loc inside a stage area? */
export function inArea(c, loc) {
  return Math.abs(loc.x - c.x) <= R && Math.abs(loc.z - c.z) <= R && loc.y >= c.y - DOWN && loc.y <= c.y + UP;
}

/* ------------------------------------------------------------------------------- builders */

/**
 * Build a stage. Runs as a job; calls done(info) when finished.
 * info: { top: floor y fighters stand on, ring: { half, shape } | null }
 */
export function buildStage(dim, c, id, done) {
  if (id === "here") {
    system.run(() => done({ top: c.y, ring: null }));
    return;
  }
  system.runJob((function* () {
    const lo = { x: c.x - R, z: c.z - R };
    const hi = { x: c.x + R, z: c.z + R };
    // clear the air above and lay a flat base
    for (let y = c.y; y <= c.y + UP; y += 6) {
      fill(dim, { x: lo.x, y, z: lo.z }, { x: hi.x, y: Math.min(c.y + UP, y + 5), z: hi.z }, "minecraft:air");
      yield;
    }
    fill(dim, { x: lo.x, y: c.y - DOWN, z: lo.z }, { x: hi.x, y: c.y - 2, z: hi.z }, "minecraft:stone");
    yield;
    const ground = { ring: "minecraft:grass_block", wasteland: "minecraft:red_sand", namek: "minecraft:warped_nylium",
      cellring: "minecraft:coarse_dirt", beerus: "minecraft:purple_terracotta", top: "minecraft:stone", htc: "minecraft:white_concrete" }[id];
    fill(dim, { x: lo.x, y: c.y - 1, z: lo.z }, { x: hi.x, y: c.y - 1, z: hi.z }, ground ?? "minecraft:grass_block");
    yield;
    let info = { top: c.y, ring: null };
    if (id === "ring") info = yield* ring(dim, c);
    else if (id === "wasteland") yield* wasteland(dim, c);
    else if (id === "namek") yield* namek(dim, c);
    else if (id === "cellring") info = yield* cellRing(dim, c);
    else if (id === "beerus") yield* beerus(dim, c);
    else if (id === "top") info = yield* top(dim, c);
    done(info);
  })());
}

function* ring(dim, c) {
  const h = 9;
  fill(dim, { x: c.x - R, y: c.y - 1, z: c.z - R }, { x: c.x + R, y: c.y - 1, z: c.z + R }, "minecraft:grass_block");
  fill(dim, { x: c.x - h - 3, y: c.y - 1, z: c.z - h - 3 }, { x: c.x + h + 3, y: c.y - 1, z: c.z + h + 3 }, "minecraft:gravel");
  fill(dim, { x: c.x - h, y: c.y, z: c.z - h }, { x: c.x + h, y: c.y, z: c.z + h }, "minecraft:smooth_stone");
  fill(dim, { x: c.x - h + 1, y: c.y, z: c.z - h + 1 }, { x: c.x + h - 1, y: c.y, z: c.z + h - 1 }, "minecraft:polished_andesite");
  fill(dim, { x: c.x - h + 3, y: c.y, z: c.z - h + 3 }, { x: c.x + h - 3, y: c.y, z: c.z + h - 3 }, "minecraft:smooth_stone");
  yield;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = c.x + sx * (h + 4);
    const z = c.z + sz * (h + 4);
    fill(dim, { x, y: c.y, z }, { x, y: c.y + 3, z }, "minecraft:red_concrete");
    set(dim, { x, y: c.y + 4, z }, "minecraft:lantern");
  }
  // stands for the crowd
  for (let i = -R + 2; i <= R - 2; i++) {
    for (const [x, z] of [[c.x + i, c.z - R + 1], [c.x + i, c.z + R - 1], [c.x - R + 1, c.z + i], [c.x + R - 1, c.z + i]]) {
      set(dim, { x, y: c.y, z }, "minecraft:spruce_planks");
      set(dim, { x, y: c.y + 1, z }, "minecraft:spruce_fence");
    }
    if (i % 8 === 0) yield;
  }
  return { top: c.y + 1, ring: { half: h + 0.5, shape: "square" } };
}

function* rockPillar(dim, x, z, base, h, r, blocks) {
  for (let y = 0; y < h; y++) {
    const rr = r * (1 - (y / h) * 0.45);
    for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++) {
      for (let dz = -Math.ceil(rr); dz <= Math.ceil(rr); dz++) {
        if (dx * dx + dz * dz > rr * rr) continue;
        set(dim, { x: x + dx, y: base + y, z: z + dz }, blocks[(y + Math.abs(dx)) % blocks.length]);
      }
    }
    if (y % 3 === 0) yield;
  }
}

function* wasteland(dim, c) {
  const blocks = ["minecraft:terracotta", "minecraft:orange_terracotta", "minecraft:brown_terracotta", "minecraft:red_sandstone"];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand(-0.3, 0.3);
    const d = rand(13, R - 4);
    yield* rockPillar(dim, Math.round(c.x + Math.cos(a) * d), Math.round(c.z + Math.sin(a) * d), c.y, Math.floor(rand(6, 15)), rand(1.6, 3.2), blocks);
  }
  for (let i = 0; i < 18; i++) {
    const x = Math.round(c.x + rand(-R + 2, R - 2));
    const z = Math.round(c.z + rand(-R + 2, R - 2));
    if (Math.hypot(x - c.x, z - c.z) < 7) continue;
    set(dim, { x, y: c.y, z }, "minecraft:cobblestone");
  }
}

function* tree(dim, x, z, base, h, ball) {
  for (let y = 0; y < h; y++) set(dim, { x, y: base + y, z }, "minecraft:stripped_birch_log");
  const cy = base + h + 1;
  for (let dx = -ball; dx <= ball; dx++) {
    for (let dy = -ball; dy <= ball; dy++) {
      for (let dz = -ball; dz <= ball; dz++) {
        if (dx * dx + dy * dy + dz * dz <= ball * ball + 0.5) set(dim, { x: x + dx, y: cy + dy, z: z + dz }, "minecraft:lime_concrete");
      }
    }
  }
  yield;
}

function* namek(dim, c) {
  // shallow blue lakes and round-topped ajisa trees
  for (let i = 0; i < 3; i++) {
    const a = rand(0, Math.PI * 2);
    const d = rand(14, R - 6);
    const px = Math.round(c.x + Math.cos(a) * d);
    const pz = Math.round(c.z + Math.sin(a) * d);
    const r = rand(3, 5);
    for (let dx = -6; dx <= 6; dx++) {
      for (let dz = -6; dz <= 6; dz++) {
        if (dx * dx + dz * dz <= r * r) set(dim, { x: px + dx, y: c.y - 1, z: pz + dz }, "minecraft:water");
      }
    }
    yield;
  }
  for (let i = 0; i < 10; i++) {
    const a = rand(0, Math.PI * 2);
    const d = rand(12, R - 3);
    yield* tree(dim, Math.round(c.x + Math.cos(a) * d), Math.round(c.z + Math.sin(a) * d), c.y, Math.floor(rand(4, 8)), 2);
  }
  yield* rockPillar(dim, c.x + R - 6, c.z - R + 6, c.y, 12, 3.4, ["minecraft:light_gray_terracotta", "minecraft:cyan_terracotta"]);
}

function* cellRing(dim, c) {
  yield* wasteland(dim, c);
  const h = 10;
  fill(dim, { x: c.x - h, y: c.y - 1, z: c.z - h }, { x: c.x + h, y: c.y + 2, z: c.z + h }, "minecraft:air");
  fill(dim, { x: c.x - h, y: c.y - 1, z: c.z - h }, { x: c.x + h, y: c.y, z: c.z + h }, "minecraft:white_concrete");
  for (let x = c.x - h; x <= c.x + h; x += 4) for (let z = c.z - h; z <= c.z + h; z += 4) set(dim, { x, y: c.y, z }, "minecraft:light_gray_concrete");
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    fill(dim, { x: c.x + sx * h, y: c.y + 1, z: c.z + sz * h }, { x: c.x + sx * h, y: c.y + 4, z: c.z + sz * h }, "minecraft:quartz_pillar");
  }
  yield;
  return { top: c.y + 1, ring: { half: h + 0.5, shape: "square" } };
}

function* beerus(dim, c) {
  const blocks = ["minecraft:purpur_block", "minecraft:purple_terracotta", "minecraft:magenta_terracotta"];
  for (let i = 0; i < 7; i++) {
    const a = rand(0, Math.PI * 2);
    const d = rand(13, R - 4);
    yield* rockPillar(dim, Math.round(c.x + Math.cos(a) * d), Math.round(c.z + Math.sin(a) * d), c.y, Math.floor(rand(8, 16)), rand(1.2, 2.4), blocks);
  }
  // the palace pyramid on the far side
  const px = c.x - R + 7;
  const pz = c.z;
  for (let y = 0; y < 6; y++) {
    fill(dim, { x: px - 5 + y, y: c.y + y, z: pz - 5 + y }, { x: px + 5 - y, y: c.y + y, z: pz + 5 - y }, "minecraft:smooth_sandstone");
    yield;
  }
}

function* top(dim, c) {
  // a round arena floating over a drop: fall off and you're out
  const r = 18;
  const lift = 6;
  fill(dim, { x: c.x - R, y: c.y - 1, z: c.z - R }, { x: c.x + R, y: c.y - 1, z: c.z + R }, "minecraft:black_concrete");
  yield;
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > r + 0.5) continue;
      const b = d > r - 1 ? "minecraft:polished_blackstone" : (Math.floor(dx / 3) + Math.floor(dz / 3)) % 2 === 0 ? "minecraft:polished_andesite" : "minecraft:smooth_stone";
      set(dim, { x: c.x + dx, y: c.y + lift, z: c.z + dz }, b);
    }
    if (dx % 4 === 0) yield;
  }
  for (const [dx, dz] of [[0, 0], [8, 8], [-8, 8], [8, -8], [-8, -8]]) {
    fill(dim, { x: c.x + dx, y: c.y, z: c.z + dz }, { x: c.x + dx + 1, y: c.y + lift - 1, z: c.z + dz + 1 }, "minecraft:polished_blackstone_bricks");
  }
  return { top: c.y + lift + 1, ring: { half: r + 0.5, shape: "circle" } };
}

/** True when loc is off the ring (ring-out). */
export function outOfRing(c, info, loc) {
  if (!info?.ring) return false;
  if (loc.y > info.top - 0.6) return false;
  const dx = loc.x - c.x - 0.5;
  const dz = loc.z - c.z - 0.5;
  return info.ring.shape === "circle" ? Math.hypot(dx, dz) > info.ring.half : Math.max(Math.abs(dx), Math.abs(dz)) > info.ring.half;
}

export function stageName(id) {
  return STAGES.find((s) => s.id === id)?.name ?? id;
}
