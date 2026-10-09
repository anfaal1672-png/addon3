// Smoke test: load the addon scripts against the mock API and drive the main features for a while.
import * as mc from "./mock-server.mjs";
import { answers } from "./mock-ui.mjs";

const { system, world, advance, errors, Player, dims, ItemStack } = mc;
const ow = dims["minecraft:overworld"];
globalThis.__dbzErrors = errors;

await import("../../packs/DragonBall_BP/scripts/main.js");
const data = await import("../../packs/DragonBall_BP/scripts/core/data.js");
const forms = await import("../../packs/DragonBall_BP/scripts/combat/forms.js");
const tech = await import("../../packs/DragonBall_BP/scripts/combat/techniques.js");
const fighters = await import("../../packs/DragonBall_BP/scripts/npc/fighters.js");
const sagas = await import("../../packs/DragonBall_BP/scripts/story/sagas.js");
const sites = await import("../../packs/DragonBall_BP/scripts/world/sites.js");
const stats = await import("../../packs/DragonBall_BP/scripts/core/stats.js");
const menu = await import("../../packs/DragonBall_BP/scripts/ui/menu.js");
const proj = await import("../../packs/DragonBall_BP/scripts/combat/projectiles.js");

function step(label, fn) {
  const before = errors.length;
  try {
    fn();
  } catch (e) {
    errors.push(e);
  }
  if (errors.length > before) console.log(`✗ ${label}`);
  else console.log(`✓ ${label}`);
}

// startup / world load
system.beforeEvents.startup.fire({
  blockComponentRegistry: { registerCustomComponent: () => {} },
  customCommandRegistry: { registerCommand: () => {}, registerEnum: () => {} },
  itemComponentRegistry: { registerCustomComponent: () => {} },
});
world.afterEvents.worldLoad.fire({});
advance(30);

const p = new Player({ x: 0.5, y: 63, z: 0.5 }, ow);
world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: true });
advance(5);

step("race selection", () => {
  const d = data.getData(p);
  d.race = "saiyan";
  d.tail = true;
  d.level = 60;
  d.stats = { str: 40, ki: 40, vit: 40, spd: 30, def: 20 };
  d.forms = ["ssj", "ssj2", "ssj3"];
  d.techs = Object.keys((tech.TECHS));
  d.slots = ["kamehameha", "ki_blast", "kienzan", "genkidama"];
  d.ki = 5000;
});
advance(40);

step("transform up x3 + revert", () => {
  forms.transformUp(p);
  advance(40);
  forms.transformUp(p);
  advance(40);
  if (data.rt(p).form !== "ssj2") throw new Error("expected ssj2, got " + data.rt(p).form);
  forms.cycleKaioken(p);
  advance(25);
  forms.revertForm(p);
});

step("flight", () => {
  p.isOnGround = false;
  data.rt(p).airTicks = 5;
  world.afterEvents.playerButtonInput.fire({ player: p, button: "Jump", newButtonState: "Pressed" });
  p.mv = { x: 0, y: 1 };
  p.isSprinting = true;
  advance(30);
  if (!data.rt(p).flying) throw new Error("not flying");
  p.isSprinting = false;
  p.mv = { x: 0, y: 0 };
  p.isOnGround = true;
  advance(20);
});

step("dash (double sneak)", () => {
  world.afterEvents.playerButtonInput.fire({ player: p, button: "Sneak", newButtonState: "Pressed" });
  advance(2);
  world.afterEvents.playerButtonInput.fire({ player: p, button: "Sneak", newButtonState: "Pressed" });
  advance(5);
});

const enemy = fighters.spawnFighter("frieza1", ow, { x: 10, y: 63, z: 0.5 }, { role: "enemy", boss: true });
step("enemy AI ticks", () => {
  p.rot = { x: 0, y: -90 }; // look toward +x
  advance(100);
});

step("charge + kamehameha", () => {
  world.afterEvents.itemStartUse.fire({ source: p, itemStack: new ItemStack("dbz:skill_1"), useDuration: 0 });
  advance(45);
  world.afterEvents.itemStopUse.fire({ source: p, itemStack: new ItemStack("dbz:skill_1") });
  advance(60);
});

step("ki blast + kienzan + genki dama", () => {
  world.afterEvents.itemStartUse.fire({ source: p, itemStack: new ItemStack("dbz:skill_2"), useDuration: 0 });
  advance(3);
  world.afterEvents.itemStartUse.fire({ source: p, itemStack: new ItemStack("dbz:skill_3"), useDuration: 0 });
  advance(35);
  world.afterEvents.itemStopUse.fire({ source: p, itemStack: new ItemStack("dbz:skill_3") });
  advance(40);
  world.afterEvents.itemStartUse.fire({ source: p, itemStack: new ItemStack("dbz:skill_4"), useDuration: 0 });
  advance(60);
  world.afterEvents.itemStopUse.fire({ source: p, itemStack: new ItemStack("dbz:skill_4") });
  advance(100);
});

step("ki charge item", () => {
  world.afterEvents.itemStartUse.fire({ source: p, itemStack: new ItemStack("dbz:ki_charge"), useDuration: 0 });
  advance(40);
  world.afterEvents.itemStopUse.fire({ source: p, itemStack: new ItemStack("dbz:ki_charge") });
});

step("melee combo", () => {
  const e2 = fighters.spawnFighter("saibaman", ow, { x: 2, y: 63, z: 0.5 }, { role: "enemy" });
  for (let i = 0; i < 6; i++) {
    world.afterEvents.entityHitEntity.fire({ damagingEntity: p, hitEntity: e2 });
    e2.hp.currentValue -= 1;
    world.afterEvents.entityHurt.fire({ hurtEntity: e2, damage: 1, damageSource: { cause: "entityAttack", damagingEntity: p } });
    advance(4);
  }
  advance(20);
});

step("guard + just guard", () => {
  world.afterEvents.itemStartUse.fire({ source: p, itemStack: new ItemStack("dbz:guard"), useDuration: 0 });
  advance(1);
  const atk = fighters.spawnFighter("raditz", ow, { x: 1.5, y: 63, z: 0.5 }, { role: "enemy" });
  p.hp.currentValue -= 2;
  world.afterEvents.entityHurt.fire({ hurtEntity: p, damage: 2, damageSource: { cause: "entityAttack", damagingEntity: atk } });
  advance(5);
  world.afterEvents.itemStopUse.fire({ source: p, itemStack: new ItemStack("dbz:guard") });
});

step("beam struggle", () => {
  const foe = fighters.spawnFighter("goku", ow, { x: 20, y: 63, z: 0.5 }, { role: "enemy" });
  foe.rot = { x: 0, y: 90 };
  proj.fireBeam(foe, { color: "blue", width: 1, range: 40, power: 30, duration: 60 });
  proj.fireBeam(p, { color: "purple", width: 1, range: 40, power: 30, duration: 60 });
  for (let i = 0; i < 40; i++) {
    proj.registerMash(p);
    advance(1);
  }
  advance(200);
});

step("story chapter start/finish", () => {
  data.getData(p).saga = 0;
  for (const s of [...fighters.fighters.values()]) s.e.remove();
  p.hp.effectiveMax = 2000;
  p.hp.currentValue = 2000;
  sagas.startChapter(p, sagas.CHAPTERS[0]);
  console.log("  inBattle:", sagas.inBattle(p), "tagged:", [...fighters.fighters.values()].filter((s) => s.e.hasTag(`saga_${p.id}`)).map((s) => s.cid + ":" + s.e.hp.currentValue));
  advance(60);
  console.log("  after60 inBattle:", sagas.inBattle(p), "tagged:", [...fighters.fighters.values()].filter((s) => s.e.hasTag(`saga_${p.id}`)).map((s) => s.cid + ":" + s.e.hp.currentValue + ":" + s.e.isValid));
  for (const s of fighters.fighters.values()) if (s.e.hasTag(`saga_${p.id}`)) s.e.applyDamage(99999, { damagingEntity: p });
  advance(60);
  if (data.getData(p).saga !== 1) throw new Error("saga did not advance: " + p.messages.slice(-4).join(" / "));
});

step("site building (all)", () => {
  const L = sites.getLayout();
  for (const id of Object.keys(sites.SITES)) sites.buildSite(id, ow);
  advance(400);
  for (const id of Object.keys(sites.SITES)) if (!L[id].built) throw new Error("not built: " + id);
});

step("oozaru", () => {
  forms.startOozaru(p);
  advance(30);
  forms.endOozaru(p);
});

step("menus (canceled)", async () => {
  await menu.mainMenu(p);
});
answers.push({ selection: 0 });
step("main menu -> status", () => menu.mainMenu(p));
advance(10);

step("player death", () => {
  p.applyDamage(9999, {});
  advance(5);
  world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: false });
  advance(20);
});

step("long run 600 ticks", () => advance(600));

console.log("HUD:", (p.lastActionBar ?? "").split("\n")[0]);
console.log("PL:", stats.powerOf(p), "deaths:", p.deaths ?? 0, p.killers);
if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  const seen = new Set();
  for (const e of errors) {
    const k = String(e?.stack ?? e).split("\n").slice(0, 3).join("\n");
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(k, "\n");
  }
  process.exit(1);
}
console.log("\nall good");
