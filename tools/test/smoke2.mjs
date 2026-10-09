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
const V2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
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

await step("spawn eggs: every character, block click + air, sneak flips role", async () => {
  const { CHARS } = await import("../../packs/DragonBall_BP/scripts/gen/catalog.js");
  const eggs = await import("../../packs/DragonBall_BP/scripts/items/eggs.js");
  const before = fighters.fighters.size;
  let n = 0;
  for (const c of CHARS) {
    if (c.id === "training_dummy") continue;
    const e = eggs.useEgg(p, `dbz:egg_${c.id}`, { x: p.location.x + 3, y: p.location.y, z: p.location.z });
    if (!e) throw new Error("egg did not spawn " + c.id);
    n++;
    await tickAsync(6);
  }
  if (fighters.fighters.size < before + n) throw new Error("eggs did not register fighters");
  // role: villain hostile, hero peaceful, sneaking flips
  const roleOf = (e) => fighters.fighters.get(e.id)?.role;
  await tickAsync(6);
  if (roleOf(eggs.useEgg(p, "dbz:egg_frieza1", p.location)) !== "enemy") throw new Error("frieza egg not hostile");
  await tickAsync(6);
  if (roleOf(eggs.useEgg(p, "dbz:egg_goku", p.location)) !== "npc") throw new Error("goku egg not peaceful");
  await tickAsync(6);
  p.isSneaking = true;
  if (roleOf(eggs.useEgg(p, "dbz:egg_goku", p.location)) !== "enemy") throw new Error("sneak did not flip role");
  p.isSneaking = false;
  // events: block click (consumes one) then an immediate air use is de-duplicated
  await tickAsync(6);
  p.inv.setItem(p.selectedSlotIndex, new ItemStack("dbz:egg_vegeta", 2));
  const size = fighters.fighters.size;
  world.afterEvents.playerInteractWithBlock.fire({ player: p, block: ow.getBlock({ x: 2, y: 62, z: 2 }), blockFace: "Up",
    isFirstEvent: true, itemStack: new ItemStack("dbz:egg_vegeta", 1) });
  world.afterEvents.itemUse.fire({ source: p, itemStack: new ItemStack("dbz:egg_vegeta", 1) });
  if (fighters.fighters.size !== size + 1) throw new Error("block click spawned " + (fighters.fighters.size - size));
  if (p.inv.getItem(p.selectedSlotIndex)?.amount !== 1) throw new Error("egg not consumed");
  await tickAsync(6);
  world.afterEvents.itemUse.fire({ source: p, itemStack: new ItemStack("dbz:egg_vegeta", 1) });
  if (fighters.fighters.size !== size + 2) throw new Error("air use did not spawn");
  console.log(`   spawned ${n} characters from eggs`);
  for (const s of [...fighters.fighters.values()]) if (s.e.isValid && s.e.location && V2(s.e.location, p.location) < 100) s.e.remove();
  await tickAsync(20);
});

await step("mob battle: teams, duel, group hunt, tools, menu", async () => {
  const battle = await import("../../packs/DragonBall_BP/scripts/battle/battle.js");
  const core = await import("../../packs/DragonBall_BP/scripts/battle/core.js");
  const at = (dx) => ({ x: p.location.x + dx, y: p.location.y, z: p.location.z + 4 });
  const hold = (id) => p.inv.setItem(p.selectedSlotIndex, new ItemStack(id, 1));
  const hit = (target) => world.afterEvents.entityHitEntity.fire({ damagingEntity: p, hitEntity: target });
  const roleOf = (e) => fighters.fighters.get(e.id)?.role;
  // team battle: goku + zombie (red) vs frieza + cow (blue)
  const goku = fighters.spawnFighter("goku", ow, at(0));
  const frieza = fighters.spawnFighter("frieza1", ow, at(3));
  const zombie = ow.spawnEntity("minecraft:zombie", at(1));
  const cow = ow.spawnEntity("minecraft:cow", at(2));
  hold("dbz:bt_team_red");
  hit(goku); hit(zombie);
  hold("dbz:bt_team_blue");
  hit(frieza); hit(cow);
  if (roleOf(goku) !== "battle" || roleOf(frieza) !== "battle") throw new Error("fighters not on battle role");
  if (!zombie.nameTag.includes("[赤]") || !cow.nameTag.includes("[青]")) throw new Error("labels: " + zombie.nameTag + " / " + cow.nameTag);
  if (!core.isBattleEnemy(goku, frieza) || core.isBattleEnemy(goku, zombie)) throw new Error("team enemy rule");
  const cowHp = cow.hp.currentValue;
  zombie.location = { ...cow.location, x: cow.location.x - 1 };
  await tickAsync(60);
  if (!(cow.hp.currentValue < cowHp) && cow.isValid) throw new Error("zombie never hit the cow");
  // the two fighters trade ki attacks on their own
  const fHp = frieza.hp.currentValue;
  const gHp = goku.hp.currentValue;
  frieza.location = at(12);
  // ki attacks are random and the mock has no engine melee, so wait until someone lands a hit
  for (let i = 0; i < 40 && frieza.isValid && frieza.hp.currentValue >= fHp && goku.hp.currentValue >= gHp; i++) {
    goku.location = at(0); // nothing walks them apart again after a teleport in the mock
    frieza.location = at(12);
    await tickAsync(50);
  }
  console.log(`   goku ${Math.round(gHp)}→${Math.round(goku.hp.currentValue)}, frieza ${Math.round(fHp)}→${Math.round(frieza.isValid ? frieza.hp.currentValue : 0)}`);
  if (frieza.isValid && frieza.hp.currentValue >= fHp && goku.hp.currentValue >= gHp) throw new Error("fighters never hurt each other");
  // finish the blue team -> red wins
  for (const e of [frieza, cow]) if (e.isValid) e.applyDamage(1e6, { cause: "entityAttack" });
  await tickAsync(40);
  if (!p.titles.some((t) => t.includes("赤チームの勝利"))) throw new Error("no team win: " + p.titles.slice(-3).join(" / "));
  // pause via menu, then resume
  answers.push({ selection: 0 });
  await battle.battleMenu(p);
  if (!core.battleSettings().paused || core.findBattleTarget(goku)) throw new Error("pause failed");
  answers.push({ selection: 0 });
  await battle.battleMenu(p);
  // disband
  answers.push({ selection: 4 });
  await battle.battleMenu(p);
  if (core.isBattler(goku) || roleOf(goku) !== "npc" || goku.nameTag !== "孫悟空") throw new Error("disband: " + roleOf(goku) + " " + goku.nameTag);
  if (zombie.isValid && zombie.nameTag !== "") throw new Error("zombie name not restored: " + zombie.nameTag);
  // duel
  const vegeta = fighters.spawnFighter("vegeta", ow, at(5));
  hold("dbz:bt_duel");
  hit(goku); hit(vegeta);
  if (!core.isBattleEnemy(goku, vegeta) || core.isBattleEnemy(goku, zombie)) throw new Error("duel rule");
  if (core.findBattleTarget(goku)?.id !== vegeta.id) throw new Error("duel target");
  await tickAsync(40);
  vegeta.applyDamage(1e6, { cause: "entityAttack" });
  await tickAsync(40);
  if (!p.titles.some((t) => t.includes("孫悟空の勝ち"))) throw new Error("no duel result: " + p.titles.slice(-3).join(" / "));
  if (core.isBattler(goku) || roleOf(goku) !== "npc") throw new Error("duel winner not released");
  // group hunt: goku + 2 zombies vs a cow
  const z2 = ow.spawnEntity("minecraft:zombie", at(6));
  const prey = ow.spawnEntity("minecraft:cow", at(7));
  hold("dbz:bt_group");
  hit(goku); hit(zombie); hit(z2);
  p.isSneaking = true;
  hit(prey);
  p.isSneaking = false;
  if (core.findBattleTarget(z2)?.id !== prey.id || core.findBattleTarget(prey) === null) throw new Error("hunt targets");
  await tickAsync(40);
  if (prey.isValid) prey.applyDamage(1e6, { cause: "entityAttack" });
  await tickAsync(40);
  if (!p.titles.some((t) => t.includes("標的を倒した"))) throw new Error("no hunt result");
  // wands (on a fresh mob: the first zombie may have fallen in the fights above)
  const z3 = ow.spawnEntity("minecraft:zombie", at(9));
  hold("dbz:bt_team_green");
  hit(z3);
  z3.hp.currentValue = 3;
  hold("dbz:bt_heal");
  hit(z3);
  if (z3.hp.currentValue !== z3.hp.effectiveMax) throw new Error("heal");
  hold("dbz:bt_buff");
  hit(z3);
  if (!z3.effects.strength) throw new Error("buff");
  hold("dbz:bt_kill");
  hit(z3);
  if (z3.isValid) throw new Error("kill");
  // player joins a team with a flag used in the air
  world.afterEvents.itemUse.fire({ source: p, itemStack: new ItemStack("dbz:bt_team_yellow", 1) });
  if (core.teamOf(p) !== "yellow") throw new Error("player join");
  p.isSneaking = true;
  world.afterEvents.itemUse.fire({ source: p, itemStack: new ItemStack("dbz:bt_team_yellow", 1) });
  p.isSneaking = false;
  if (core.isBattler(p)) throw new Error("player leave");
  battle.giveTools(p);
  if (!battle.TOOLS.every((id) => p.inv.items.some((it) => it?.typeId === id))) throw new Error("tools not given");
  for (const e of [goku, z2]) if (e.isValid) e.remove();
  await tickAsync(20);
});

await step("mob battle: fighters side by side punch, knock back and use ki attacks", async () => {
  const battle = await import("../../packs/DragonBall_BP/scripts/battle/battle.js");
  const a = fighters.spawnFighter("goku", ow, { x: p.location.x + 20, y: p.location.y, z: p.location.z });
  const b = fighters.spawnFighter("vegeta", ow, { x: p.location.x + 22.5, y: p.location.y, z: p.location.z });
  battle.joinTeam(a, "red");
  battle.joinTeam(b, "blue");
  let knocked = false;
  let kiUsed = false;
  for (let i = 0; i < 60 && !(knocked && kiUsed); i++) {
    a.location = { x: p.location.x + 20, y: p.location.y, z: p.location.z }; // the mock has no physics: keep them side by side
    b.location = { x: p.location.x + 22.5, y: p.location.y, z: p.location.z };
    a.vel = b.vel = { x: 0, y: 0, z: 0 };
    a.hp.currentValue = a.hp.effectiveMax; // measure how they fight, not who wins
    b.hp.currentValue = b.hp.effectiveMax;
    await tickAsync(10);
    if (Math.abs(a.vel.x) > 0.5 || Math.abs(b.vel.x) > 0.5) knocked = true;
    for (const e of [a, b]) if (Object.keys(fighters.fighters.get(e.id)?.cd ?? {}).some((k) => /^\d+$/.test(k))) kiUsed = true;
  }
  console.log(`   knockback blows ${knocked}, ki attacks ${kiUsed}`);
  if (!knocked) throw new Error("no knockback blows at close range");
  if (!kiUsed) throw new Error("no ki attacks at close range");

  for (const e of [a, b]) if (e.isValid) e.remove();
  await tickAsync(10);
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
