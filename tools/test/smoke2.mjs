// Second smoke test: dragon balls, masters, fusion, tournament, items, regions.
import * as mc from "./mock-server.mjs";
import { answers } from "./mock-ui.mjs";

const { system, world, advance, errors, Player, dims, ItemStack } = mc;
const ow = dims["minecraft:overworld"];
globalThis.__dbzErrors = errors;

await import("../../packs/DragonBall_BP/scripts/main.js");
const data = await import("../../packs/DragonBall_BP/scripts/core/data.js");
const fighters = await import("../../packs/DragonBall_BP/scripts/npc/fighters.js");
const masters = await import("../../packs/DragonBall_BP/scripts/npc/masters.js");
const sites = await import("../../packs/DragonBall_BP/scripts/world/sites.js");
const regions = await import("../../packs/DragonBall_BP/scripts/world/regions.js");
const items = await import("../../packs/DragonBall_BP/scripts/items/items.js");
const bus = await import("../../packs/DragonBall_BP/scripts/core/bus.js");
const menu = await import("../../packs/DragonBall_BP/scripts/ui/menu.js");

async function step(label, fn) {
  const before = errors.length;
  try {
    await fn();
  } catch (e) {
    errors.push(e);
  }
  console.log(errors.length > before ? `✗ ${label}` : `✓ ${label}`);
}
const tickAsync = async (n) => {
  for (let i = 0; i < n; i++) {
    advance(1);
    await Promise.resolve();
  }
};

system.beforeEvents.startup.fire({ blockComponentRegistry: { registerCustomComponent: (n, c) => (globalThis.__interact = c) },
  customCommandRegistry: { registerCommand: () => {} }, itemComponentRegistry: { registerCustomComponent: () => {} } });
world.afterEvents.worldLoad.fire({});
advance(20);
const p = new Player({ x: 0.5, y: 63, z: 0.5 }, ow);
p.hp.effectiveMax = p.hp.currentValue = 500;

await step("race menu via UI answers", async () => {
  answers.push({ selection: 0 }, { selection: 0 });
  await menu.raceMenu(p);
  await tickAsync(10);
  if (data.getData(p).race !== "saiyan") throw new Error("race not set: " + data.getData(p).race);
  const d = data.getData(p);
  d.level = 95;
  d.stats = { str: 60, ki: 60, vit: 60, spd: 60, def: 60 };
});

await step("status allocation", async () => {
  data.getData(p).points = 10;
  answers.push({ formValues: [2, 2, 2, 2, 2] });
  await menu.mainMenu(p).catch(() => {});
  answers.length = 0;
  answers.push({ selection: 0 }, { formValues: [2, 2, 2, 2, 2] });
  await menu.mainMenu(p);
  await tickAsync(2);
});

await step("build all sites + npc spawn", async () => {
  for (const id of Object.keys(sites.SITES)) sites.buildSite(id, ow);
  await tickAsync(400);
  const n = [...fighters.fighters.values()].length;
  if (n < 10) throw new Error("too few npcs: " + n);
});

await step("talk to every npc (first option)", async () => {
  for (const s of [...fighters.fighters.values()]) {
    if (s.role !== "npc") continue;
    answers.push({ selection: 0 });
    world.afterEvents.playerInteractWithEntity.fire({ player: p, target: s.e });
    await tickAsync(3);
  }
  answers.length = 0;
});

await step("spar with goku and win", async () => {
  const g = [...fighters.fighters.values()].find((s) => s.cid === "goku" && s.role === "npc");
  if (!g) throw new Error("no goku");
  p.location = { x: g.e.location.x + 3, y: g.e.location.y, z: g.e.location.z };
  masters.startSpar(p, g.e, "goku");
  await tickAsync(20);
  const s2 = fighters.fighters.get(g.e.id);
  console.log("   spar state:", s2?.role, s2?.sparWith === p.id, g.e.isValid, g.e.hp.currentValue, g.e.hp.effectiveMax);
  g.e.hp.currentValue = g.e.hp.effectiveMax * 0.1;
  await tickAsync(20);
  console.log("   after:", fighters.fighters.get(g.e.id)?.role, g.e.hp.currentValue, p.messages.slice(-2));
  if (!data.getData(p).quests.spar_goku) throw new Error("spar not won");
});

await step("recruit + ally ai + fusion dance + potara", async () => {
  const g = [...fighters.fighters.values()].find((s) => s.cid === "goku");
  masters.recruit(p, g.e, "goku");
  await tickAsync(60);
  const ally = [...fighters.fighters.values()].find((s) => s.role === "ally");
  if (!ally) throw new Error("no ally");
  bus.emit("fusionRequest", p, ally.e, "dance");
  await tickAsync(80);
  if (!data.rt(p).fusion) throw new Error("no fusion");
  data.rt(p).fusion.until = 0;
  await tickAsync(10);
  if (data.rt(p).fusion) throw new Error("fusion did not end");
});

await step("dragon balls: place 7 + summon + wish", async () => {
  for (let n = 1; n <= 7; n++) {
    const b = ow.getBlock({ x: 5 + n, y: 63, z: 5 });
    b.setType(`dbz:dragonball_${n}`);
    world.afterEvents.playerPlaceBlock.fire({ player: p, block: b, dimension: ow });
  }
  answers.push({ selection: 0 });
  globalThis.__interact.onPlayerInteract({ player: p, block: ow.getBlock({ x: 6, y: 63, z: 5 }), face: "Up" });
  answers.push({ selection: 3 });
  await tickAsync(400);
  answers.length = 0;
});

await step("items: radar, capsules, kintoun, nyoibo, dummy", async () => {
  for (const id of Object.keys(items.useHandlers)) {
    p.inv.setItem(p.selectedSlotIndex, new ItemStack(id, 2));
    world.afterEvents.itemUse.fire({ source: p, itemStack: new ItemStack(id, 1) });
    await tickAsync(20);
  }
  world.afterEvents.itemCompleteUse.fire({ source: p, itemStack: new ItemStack("dbz:senzu"), useDuration: 0 });
  world.afterEvents.itemCompleteUse.fire({ source: p, itemStack: new ItemStack("dbz:sacred_water"), useDuration: 0 });
  p.inv.setItem(p.selectedSlotIndex, new ItemStack("dbz:dragon_radar", 1));
  await tickAsync(20);
  console.log("   radar HUD:", (p.lastActionBar ?? "").split("\n").find((l) => l.includes("レーダー")) ?? "(none)");
  p.equip = { Head: new ItemStack("dbz:scouter") };
  await tickAsync(20);
});

await step("regions: htc / kai / gravity room", async () => {
  const L = sites.getLayout();
  for (const id of ["htc", "kai", "namek", "karin_tower"]) {
    p.location = { x: L[id].x + 2, y: (L[id].y ?? 64) + 1, z: L[id].z + 2 };
    await tickAsync(45);
  }
  p.location = { x: L.capsule_corp.x + 18.5, y: L.capsule_corp.y + 0.1, z: L.capsule_corp.z + 6.5 };
  data.getData(p).gravity = 100;
  await tickAsync(45);
  p.location = { x: 0.5, y: 63, z: 0.5 };
});

await step("tournament", async () => {
  const ann = [...fighters.fighters.values()].find((s) => s.cid === "announcer");
  bus.emit("tournamentJoin", p, ann?.e);
  await tickAsync(120);
  for (let r = 0; r < 6; r++) {
    for (const s of [...fighters.fighters.values()]) if (s.tournament && s.e.isValid) s.e.hp.currentValue = 1;
    await tickAsync(100);
  }
  if (!data.getData(p).tournament) throw new Error("did not win tournament: " + p.titles.slice(-6).join(" / "));
});

await step("instant transmission menu + travel", async () => {
  answers.push({ selection: 0 });
  bus.emit("openTransmission", p);
  await tickAsync(40);
  sites.travelTo(p, "kai");
  await tickAsync(60);
});

await step("long idle", async () => tickAsync(600));

if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  const seen = new Set();
  for (const e of errors) {
    const k = String(e?.stack ?? e).split("\n").slice(0, 4).join("\n");
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(k, "\n");
  }
  process.exit(1);
}
console.log("\nall good");
