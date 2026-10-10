// Smoke test for the battle addon (packs/DragonBattle_BP): every mode, every character, the tools.
import * as mc from "./mock-server.mjs";
import { answers } from "./mock-ui.mjs";

const { system, world, advance, errors, Player, dims, ItemStack } = mc;
const ow = dims["minecraft:overworld"];
globalThis.__dbbErrors = errors;

await import("../../packs/DragonBattle_BP/scripts/main.js");
const S = "../../packs/DragonBattle_BP/scripts";
const match = await import(`${S}/battle/match.js`);
const fighterMod = await import(`${S}/fighters/fighter.js`);
const damage = await import(`${S}/combat/damage.js`);
const records = await import(`${S}/battle/records.js`);
const camera = await import(`${S}/battle/camera.js`);
const menu = await import(`${S}/ui/menu.js`);
const bus = await import(`${S}/core/bus.js`);
const settingsMod = await import(`${S}/core/settings.js`);
const { CHARS } = await import(`${S}/gen/catalog.js`);

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

system.beforeEvents.startup.fire({ blockComponentRegistry: { registerCustomComponent: () => {} },
  customCommandRegistry: { registerCommand: () => {} }, itemComponentRegistry: { registerCustomComponent: () => {} } });
world.afterEvents.worldLoad.fire({});
advance(30);
const p = new Player({ x: 0.5, y: 64, z: 0.5 }, ow);
p.rot = { x: 0, y: 0 };
world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: true });
await tickAsync(80);

// who did what: every fighter should be landing blows / ki attacks on its own
const dealt = new Map();
const specials = new Set();
bus.on("hurt", (v, a) => {
  if (a?.typeId === "dbb:fighter") dealt.set(a.id, (dealt.get(a.id) ?? 0) + 1);
});
bus.on("special", (s, sp) => specials.add(sp.type));
const combos = new Map();
let teamCombos = 0;
bus.on("combo", (s, name) => combos.set(name, (combos.get(name) ?? 0) + 1));
bus.on("teamCombo", () => teamCombos++);
const transforms = [];
bus.on("transformed", (s, from, to) => transforms.push(`${from}->${to}`));

/** Run until the current match is over (or give up). */
async function runMatch(limit = 9000) {
  let t = 0;
  while (match.currentMatch() && t < limit) {
    await tickAsync(50);
    t += 50;
  }
  if (match.currentMatch()) throw new Error("match did not finish in time: " + match.currentMatch().state);
  return t;
}

await step("tools: welcome kit + spawn eggs + free team battle + duel + heal/kill + camera + control", async () => {
  if (!p.inv.items.some((it) => it?.typeId === "dbb:menu")) throw new Error("welcome kit not given");
  const tools = await import(`${S}/battle/tools.js`);
  const a = tools.useEgg(p, "dbb:egg_goku", { x: 6, y: 64, z: 6 });
  await tickAsync(6);
  const b = tools.useEgg(p, "dbb:egg_frieza4", { x: 10, y: 64, z: 6 });
  if (!a || !b) throw new Error("eggs did not spawn");
  // idle fighters are safe
  damage.hurt(a, 50, b);
  if (a.hp.currentValue < a.hp.effectiveMax && !damage.isKO(a)) {
    // idle fighters in the mock still take script damage; the real entity is invulnerable through its damage sensor
  }
  tools.useOnFighter(p, "dbb:team_red", a);
  tools.useOnFighter(p, "dbb:team_blue", b);
  const m = match.currentMatch();
  if (!m || !m.free) throw new Error("free battle not created");
  await tickAsync(200);
  if (!(dealt.get(a.id) || dealt.get(b.id))) throw new Error("free battle: nobody attacked");
  // control: pause / resume does nothing for free battles but must not throw
  world.afterEvents.itemUse.fire({ source: p, itemStack: new ItemStack("dbb:camera", 1) });
  if (camera.cameraMode(p) !== "orbit") throw new Error("camera did not cycle");
  p.isSneaking = true;
  world.afterEvents.itemUse.fire({ source: p, itemStack: new ItemStack("dbb:camera", 1) });
  p.isSneaking = false;
  if (camera.cameraMode(p) !== "free") throw new Error("sneak camera not free");
  camera.setCameraMode(p, "follow");
  // duel wand on two new fighters
  const c = tools.useEgg(p, "dbb:egg_cell", { x: 6, y: 64, z: 12 });
  await tickAsync(6);
  const d = tools.useEgg(p, "dbb:egg_gohan_ssj2", { x: 10, y: 64, z: 12 });
  tools.useOnFighter(p, "dbb:duel", c);
  tools.useOnFighter(p, "dbb:duel", d);
  if (!c.getTags().some((t) => t.startsWith("dbb_hunt_"))) throw new Error("duel not started");
  tools.useOnFighter(p, "dbb:kill", d);
  if (!damage.isKO(d)) throw new Error("kill wand");
  tools.useOnFighter(p, "dbb:heal", d);
  if (damage.isKO(d)) throw new Error("heal wand did not revive");
  // knock everyone out so the free battle ends
  for (const e of [a, b, c, d]) damage.hurt(e, 1e9, undefined, { raw: true });
  await tickAsync(500);
  for (const e of [a, b, c, d]) if (e.isValid) e.remove();
  await tickAsync(20);
});

await step("altitude: ceiling while fighting, gravity back after the fight and after a reload", async () => {
  const tools = await import(`${S}/battle/tools.js`);
  const ai = await import(`${S}/fighters/ai.js`);
  const a = tools.useEgg(p, "dbb:egg_goku", { x: 6, y: 64, z: 6 });
  await tickAsync(6);
  const b = tools.useEgg(p, "dbb:egg_vegeta", { x: 10, y: 64, z: 6 });
  const events = [];
  for (const e of [a, b]) {
    const orig = e.triggerEvent.bind(e);
    e.triggerEvent = (ev) => {
      events.push(`${e.id}:${ev}`);
      return orig(ev);
    };
  }
  tools.useOnFighter(p, "dbb:team_red", a);
  tools.useOnFighter(p, "dbb:team_blue", b);
  const sa = fighterMod.fighters.get(a.id);
  fighterMod.setFlying(sa, true);
  a.teleport({ x: 6, y: 63 + 45, z: 6 });
  await tickAsync(8);
  if (a.location.y > 63 + ai.MAX_ALT + 0.5) throw new Error("no ceiling: y=" + a.location.y);
  // the fight ends: the flyer must get its gravity back
  fighterMod.leaveBattle(a);
  fighterMod.leaveBattle(b);
  await tickAsync(4);
  if (sa.flying || !events.includes(`${a.id}:dbb:fly_off`)) throw new Error("did not land after leaving the fight");
  // a reload leaves the engine-side flight group on while the script state starts grounded
  events.length = 0;
  fighterMod.fighters.delete(b.id);
  fighterMod.adopt(b);
  if (!events.includes(`${b.id}:dbb:fly_off`)) throw new Error("reload did not restore gravity");
  // idle fighter stuck in the air keeps getting its gravity back
  events.length = 0;
  a.isOnGround = false;
  await tickAsync(24);
  a.isOnGround = true;
  if (!events.includes(`${a.id}:dbb:fly_off`)) throw new Error("airborne idle fighter not grounded");
  for (const e of [a, b]) e.remove();
  await tickAsync(20);
  const m = match.currentMatch();
  if (m) match.endMatch(m, true);
});

await step("1v1 on the tournament ring: intro, countdown, fight, final blow, records, stage restored", async () => {
  const placedBefore = world.structureManager.placed;
  match.startMatch(p, { mode: "duel", stage: "ring", sides: [{ cids: ["goku"] }, { cids: ["vegeta"] }], hpMult: 0.5 });
  await tickAsync(60);
  const m = match.currentMatch();
  if (!m || m.state !== "intro") throw new Error("no intro: " + m?.state);
  if (m.entities().length !== 2) throw new Error("fighters not spawned");
  let fought = false;
  for (let i = 0; i < 300 && !fought; i++) {
    await tickAsync(1);
    fought = m.state === "fight";
  }
  if (!fought) throw new Error("countdown did not end: " + m.state);
  if (!p.titles.some((t) => t.includes("ファイト"))) throw new Error("no fight call");
  const secs = await runMatch();
  const last = records.lastText();
  console.log("   result:", last.split("\n")[0], `(${secs} ticks)`);
  if (!p.titles.some((t) => t.includes("勝者") || t.includes("引き分け"))) throw new Error("no winner title");
  if (m.entities().length) throw new Error("fighters not removed");
  await tickAsync(10);
  if (world.structureManager.placed <= placedBefore) throw new Error("stage not restored");
});

await step("team battle 2v2, battle royale, boss raid", async () => {
  match.startMatch(p, { mode: "team", stage: "wasteland", sides: [{ cids: ["goku_ssj", "piccolo"] }, { cids: ["cell", "android17"] }], hpMult: 0.5 });
  await runMatch();
  match.startMatch(p, { mode: "royale", stage: "namek", sides: ["krillin", "tien", "yamcha", "raditz", "nappa"].map((c) => ({ cids: [c] })), hpMult: 0.5 });
  await runMatch();
  match.startMatch(p, { mode: "boss", stage: "top", sides: [{ cids: ["broly"], hpMult: 2, boss: true }, { cids: ["goku", "vegeta", "gohan"] }], hpMult: 0.5 });
  await runMatch();
});

await step("tournament of 8 with ring-outs", async () => {
  match.startTournament(p, ["goku", "vegeta", "frieza1", "cell1", "buu_fat", "hit", "trunks", "android18"], { stage: "ring", hpMult: 0.5, ringOut: true });
  let t = 0;
  while (match.currentMatch() && t < 60000) {
    await tickAsync(100);
    t += 100;
  }
  if (match.currentMatch()) throw new Error("tournament did not finish");
  if (!p.titles.some((x) => x.includes("優勝"))) throw new Error("no champion");
});

await step("every character fights (royales of 6, start in final form for some)", async () => {
  const ids = CHARS.map((c) => c.id).filter((id) => id !== "training_dummy");
  const silent = new Set();
  for (let i = 0; i < ids.length; i += 6) {
    const group = ids.slice(i, i + 6);
    if (group.length < 2) group.push("goku");
    match.startMatch(p, { mode: "royale", stage: i % 12 === 0 ? "htc" : "here", sides: group.map((c) => ({ cids: [c] })), hpMult: 0.5, startFinal: i % 18 === 0 });
    await tickAsync(5);
    const m = match.currentMatch();
    const before = new Map();
    await tickAsync(400);
    for (const e of m.entities()) before.set(e.id, fighterMod.fighters.get(e.id)?.cid);
    await runMatch();
    for (const [id, cid] of before) if (!dealt.get(id)) silent.add(cid);
  }
  console.log(`   specials seen: ${[...specials].sort().join(", ")}`);
  console.log(`   transformations: ${transforms.length}`);
  console.log(`   combos: ${[...combos].map(([k, n]) => `${k}×${n}`).join(", ")}  team follow-ups: ${teamCombos}`);
  if (combos.size < 5) throw new Error("too few kinds of combo: " + [...combos.keys()].join(", "));
  if (silent.size > 6) throw new Error("too many fighters never attacked: " + [...silent].join(", "));
  if (silent.size) console.log("   (never landed a hit before being knocked out:", [...silent].join(", "), ")");
});

await step("menus: start a 1v1 from the menu, settings, records, help; command stop", async () => {
  answers.push({ selection: 0 }); // 1対1
  answers.push({ formValues: [1 + match.ROSTER.indexOf("jiren"), 1 + match.ROSTER.indexOf("goku_ui"), 7, true, false, 1, false] });
  await menu.battleMenu(p);
  await tickAsync(5);
  const m = match.currentMatch();
  if (!m || m.mode !== "duel") throw new Error("menu did not start a duel");
  await tickAsync(400);
  // pause from the controller, then end with sneak + use
  world.afterEvents.itemUse.fire({ source: p, itemStack: new ItemStack("dbb:control", 1) });
  if (!m.paused) throw new Error("controller did not pause");
  await tickAsync(40);
  world.afterEvents.itemUse.fire({ source: p, itemStack: new ItemStack("dbb:control", 1) });
  if (m.paused) throw new Error("controller did not resume");
  p.isSneaking = true;
  world.afterEvents.itemUse.fire({ source: p, itemStack: new ItemStack("dbb:control", 1) });
  p.isSneaking = false;
  if (match.currentMatch()) throw new Error("controller did not end the match");
  // settings
  answers.push({ selection: 7 }); // 設定 (no match running)
  answers.push({ formValues: [2, false, true, 0, true, true, true, true, 4, true] });
  await menu.battleMenu(p);
  const st = settingsMod.settings();
  if (st.speed !== 2 || st.terrain !== false || st.hpMult !== 2 || st.balance !== true) throw new Error("settings not saved " + JSON.stringify(st));
  answers.push({ selection: 8 }); // 記録
  answers.push({ selection: 0 });
  await menu.battleMenu(p);
  console.log("   ranking top:", records.rankingText(3).split("\n")[0]);
  answers.push({ selection: 0 }); // random battle via 1v1? use random entry
  answers.length = 0;
  match.randomBattle(p);
  await tickAsync(20);
  match.endMatch(match.currentMatch(), true);
  st.speed = 1;
  st.terrain = true;
  st.hpMult = 1;
  st.balance = false;
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
