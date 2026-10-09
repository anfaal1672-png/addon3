import { system, world, ItemStack, WeatherType, EntityComponentTypes } from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";
import { worldGet, worldSet, getData, markDirty, rt, settings } from "../core/data.js";
import { V, isValid, rand, randInt, compass, arrowFor, cmd, fmtPL } from "../core/util.js";
import { particle, sound, title, msg, shakeArea, psound, broadcast } from "../core/fx.js";
import { addExp, MAX_LEVEL, maxKi } from "../core/stats.js";
import { getLayout, SITES, siteAt } from "./sites.js";
import { surfaceY, loaded, set } from "./build.js";
import { onBlockInteract } from "../core/interact.js";
import { addHudLine } from "../core/hud.js";
import { FORMS, RACES, formsForRace } from "../combat/formsData.js";
import { TECHS } from "../combat/techData.js";
import { grantFlag, refreshVisuals, revertForm, checkUnlocks } from "../combat/forms.js";
import { learnTech, autoLearn } from "../combat/techniques.js";
import { emit } from "../core/bus.js";

const SETS = {
  earth: { prefix: "dragonball", dragon: 0, name: "神龍", wishes: 1, ballName: "ドラゴンボール", scale: 3.6 },
  namek: { prefix: "namek_ball", dragon: 1, name: "ポルンガ", wishes: 3, ballName: "ナメック星のドラゴンボール", scale: 2.6 },
  super: { prefix: "super_ball", dragon: 2, name: "超神龍", wishes: 1, ballName: "超ドラゴンボール", scale: 7.0 },
};
const KANJI = "一二三四五六七";

let state = null;

function load() {
  if (state) return state;
  state = worldGet("dbz:balls", null);
  if (!state) {
    state = {};
    for (const k of Object.keys(SETS)) state[k] = { stoneDay: -1, balls: [] };
    for (const k of Object.keys(SETS)) scatter(k);
  }
  return state;
}

function save() {
  worldSet("dbz:balls", state);
}

function scatterPoint(set) {
  const L = getLayout();
  if (set === "namek") {
    const c = L.namek;
    const a = rand(0, Math.PI * 2);
    const r = rand(30, 160);
    return { x: Math.floor(c.x + Math.cos(a) * r), z: Math.floor(c.z + Math.sin(a) * r), site: "namek" };
  }
  const s = world.getDefaultSpawnLocation();
  const a = rand(0, Math.PI * 2);
  const r = set === "far" ? rand(1200, 2200) : rand(250, 1100);
  return { x: Math.floor(s.x + Math.cos(a) * r), z: Math.floor(s.z + Math.sin(a) * r), site: null };
}

function scatter(set) {
  const st = state[set];
  st.balls = [];
  const used = ["kai", "beerus", "top", "namek"];
  for (let n = 1; n <= 7; n++) {
    let pt;
    if (set === "super" && n <= 4) {
      const w = used[n - 1];
      const c = getLayout()[w];
      const rr = w === "namek" ? rand(40, 170) : rand(3, (SITES[w].radius ?? 16) - 6);
      const a = rand(0, Math.PI * 2);
      pt = { x: Math.floor(c.x + Math.cos(a) * rr), z: Math.floor(c.z + Math.sin(a) * rr), site: w };
    } else {
      pt = scatterPoint(set === "super" ? "far" : set);
    }
    st.balls.push({ n, state: "world", x: pt.x, y: null, z: pt.z, placed: false, site: pt.site });
  }
}

export function ballItem(set, n) {
  return `dbz:${SETS[set].prefix}_${n}`;
}

function parseBall(typeId) {
  const m = /^dbz:(dragonball|namek_ball|super_ball)_([1-7])$/.exec(typeId);
  if (!m) return null;
  const set = m[1] === "dragonball" ? "earth" : m[1] === "namek_ball" ? "namek" : "super";
  return { set, n: Number(m[2]) };
}

function isStone(set) {
  return load()[set].stoneDay > world.getDay();
}

/* ------------------------------------------------------------------------------------- placement */

system.runInterval(() => {
  load();
  const ow = world.getDimension("minecraft:overworld");
  const L = getLayout();
  for (const p of world.getAllPlayers()) {
    if (p.dimension.id !== "minecraft:overworld") continue;
    for (const set of Object.keys(SETS)) {
      if (isStone(set)) continue;
      for (const b of state[set].balls) {
        if (b.state !== "world" || b.placed) continue;
        if (Math.abs(p.location.x - b.x) > 40 || Math.abs(p.location.z - b.z) > 40) continue;
        if (b.site && !L[b.site]?.built) continue;
        if (!loaded(ow, b.x, 64, b.z)) continue;
        let y = surfaceY(ow, b.x, b.z, 70);
        if (b.site && b.site !== "namek") {
          const c = L[b.site];
          y = (b.site === "kai" ? c.top ?? c.y + 14 : c.y + 1);
          const top = surfaceY(ow, b.x, b.z, y);
          if (top > y && top < y + 20) y = top;
        }
        try {
          const blk = ow.getBlock({ x: b.x, y, z: b.z });
          if (blk && (blk.isAir || blk.isLiquid || blk.typeId.includes("grass") || blk.typeId.includes("snow"))) blk.setType(ballItem(set, b.n));
          else continue;
        } catch {
          continue;
        }
        b.y = y;
        b.placed = true;
        save();
        particle(ow, "dbz:pillar", { x: b.x + 0.5, y, z: b.z + 0.5 }, "orange", 1);
      }
    }
  }
}, 40);

world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const info = parseBall(ev.brokenBlockPermutation.type.id);
  if (!info) return;
  load();
  const b = state[info.set].balls.find((x) => x.n === info.n);
  if (b) {
    b.state = "taken";
    b.placed = false;
    save();
  }
  sound(ev.player.dimension, "dbz.learn", ev.player.location, 1, 1.4);
  title(ev.player, `§6${KANJI[info.n - 1]}星球`, `§e${SETS[info.set].ballName}を手に入れた！`, 40);
  addExp(ev.player, 30);
});

world.afterEvents.playerPlaceBlock.subscribe((ev) => {
  const info = parseBall(ev.block.typeId);
  if (!info) return;
  load();
  const b = state[info.set].balls.find((x) => x.n === info.n);
  const loc = ev.block.location;
  if (b) {
    b.state = "world";
    b.placed = true;
    b.x = loc.x;
    b.y = loc.y;
    b.z = loc.z;
    b.site = null;
    save();
  }
  const near = gatherNear(ev.block.dimension, loc, info.set);
  if (near.length >= 7) {
    msg(ev.player, `§6七つの${SETS[info.set].ballName}が揃った！ §fボールを使用（右クリック／長押し）すると${SETS[info.set].name}を呼び出せる。`);
    for (const pos of near) particle(ev.block.dimension, "dbz:glow_burst", V.add(pos, { x: 0.5, y: 0.5, z: 0.5 }), "orange", 2);
    sound(ev.block.dimension, "dbz.wish", loc, 1);
  }
});

function gatherNear(dim, loc, set) {
  const found = new Map();
  for (let dx = -6; dx <= 6; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dz = -6; dz <= 6; dz++) {
        try {
          const b = dim.getBlock({ x: loc.x + dx, y: loc.y + dy, z: loc.z + dz });
          const info = b && parseBall(b.typeId);
          if (info && info.set === set && !found.has(info.n)) found.set(info.n, b.location);
        } catch {
          // ignore
        }
      }
    }
  }
  return [...found.values()];
}

/* ------------------------------------------------------------------------------------- summoning */

let summoning = false;

onBlockInteract(/^dbz:(dragonball|namek_ball|super_ball)_[1-7]$/, async (p, block) => {
  const info = parseBall(block.typeId);
  if (!info || summoning) return;
  const near = gatherNear(block.dimension, block.location, info.set);
  if (near.length < 7) {
    msg(p, `§7${SETS[info.set].ballName}はまだ${near.length}個しか揃っていない。7個を近く（6ブロック以内）に並べよう。`);
    return;
  }
  const f = new MessageFormData().title(`§6${SETS[info.set].name}を呼び出す`)
    .body(info.set === "namek" ? "「タッカラプト ポッポルンガ プピリットパロ」\n\n呪文を唱えますか？" : "「出でよ、神龍！！ そして願いを叶えたまえ！」\n\n呪文を唱えますか？")
    .button1("唱える").button2("やめる");
  const r = await f.show(p);
  if (r.canceled || r.selection !== 0) return;
  summon(p, info.set, near, block.dimension);
});

async function summon(p, set, ballsPos, dim) {
  summoning = true;
  const S = SETS[set];
  const center = V.lerp(ballsPos[0], ballsPos[3] ?? ballsPos[0], 0.5);
  const c = { x: center.x + 0.5, y: center.y, z: center.z + 0.5 };
  const prevTime = world.getTimeOfDay();
  try {
    world.setTimeOfDay(18000);
    dim.setWeather(WeatherType.Thunder, 2400);
  } catch {
    // ignore
  }
  for (const pl of dim.getPlayers({ location: c, maxDistance: 80 })) cmd(pl, "fog @s push dbz:summon dbz_summon");
  sound(dim, "dbz.summon", c, 4);
  for (let i = 0; i < 40; i++) {
    await wait(2);
    for (const b of ballsPos) particle(dim, "dbz:glow_burst", V.add(b, { x: 0.5, y: 0.5, z: 0.5 }), "orange", 1.5 + (i % 10) * 0.2);
    if (i % 10 === 0) particle(dim, "dbz:pillar", c, "gold", 1);
  }
  for (const b of ballsPos) set_air(dim, b);
  particle(dim, "dbz:explosion_core", V.up(c, 2), "gold", 8);
  shakeArea(dim, c, 60, 1.0, 2.0);
  let dragon;
  try {
    dragon = dim.spawnEntity("dbz:dragon", V.up(c, 1));
    dragon.setProperty("dbz:variant", S.dragon);
    dragon.setProperty("dbz:scale", 0.3);
    dragon.nameTag = S.name;
  } catch {
    summoning = false;
    return;
  }
  for (let i = 1; i <= 30; i++) {
    await wait(1);
    try {
      dragon.setProperty("dbz:scale", 0.3 + (S.scale - 0.3) * (i / 30));
    } catch {
      // ignore
    }
    if (i % 5 === 0) particle(dim, "dbz:explosion_core", V.up(c, 2 + i * 0.4), "gold", 3);
  }
  sound(dim, "dbz.roar", c, 4, set === "super" ? 0.6 : 0.85);
  for (const pl of dim.getPlayers({ location: c, maxDistance: 80 })) {
    title(pl, `§a${S.name}`, set === "namek" ? "§f「願いを言え… 3つまで叶えてやろう」" : set === "super" ? "§f「さあ願いを言え。どんな願いでも、ひとつだけ叶えてやろう」" : "§f「さあ願いを言え。どんな願いもひとつだけ叶えてやろう…」", 80);
  }
  await wait(60);
  let wishes = S.wishes;
  while (wishes > 0 && isValid(p)) {
    const done = await wishMenu(p, set, S.wishes - wishes + 1, S.wishes);
    if (done === "cancel") {
      // keep waiting: re-ask once more
      const again = await wishMenu(p, set, S.wishes - wishes + 1, S.wishes);
      if (again === "cancel") break;
    }
    wishes--;
    if (wishes > 0) await wait(30);
  }
  for (const pl of dim.getPlayers({ location: c, maxDistance: 80 })) title(pl, `§a${S.name}`, "§f「願いは叶えてやった。さらばだ」", 60);
  sound(dim, "dbz.wish", c, 3);
  await wait(50);
  for (let i = 30; i >= 0; i--) {
    await wait(1);
    try {
      dragon.setProperty("dbz:scale", 0.2 + (S.scale - 0.2) * (i / 30));
    } catch {
      // ignore
    }
  }
  particle(dim, "dbz:explosion_core", V.up(c, 3), "gold", 6);
  try {
    dragon.remove();
  } catch {
    // ignore
  }
  // balls scatter into the sky
  for (let i = 0; i < 7; i++) {
    const dir = V.norm({ x: Math.cos((i / 7) * Math.PI * 2), y: 1.4, z: Math.sin((i / 7) * Math.PI * 2) });
    particle(dim, "dbz:gather", V.up(c, 1), "orange", 1, { dir, speed: 30 });
  }
  load();
  const days = settings().dbDays * (set === "super" ? 2 : 1);
  state[set].stoneDay = world.getDay() + days;
  scatter(set);
  save();
  for (const pl of dim.getPlayers({ location: c, maxDistance: 80 })) {
    msg(pl, `§7${S.ballName}は世界中に飛び散り、${days}日間は石になって使えない。`);
    cmd(pl, "fog @s remove dbz_summon");
  }
  try {
    world.setTimeOfDay(prevTime);
    dim.setWeather(WeatherType.Clear, 1200);
  } catch {
    // ignore
  }
  summoning = false;
}

function set_air(dim, pos) {
  set(dim, pos.x, pos.y, pos.z, "minecraft:air");
}

function wait(t) {
  return new Promise((res) => system.runTimeout(() => res(undefined), t));
}

/* ------------------------------------------------------------------------------------- wishes */

async function wishMenu(p, set, idx, total) {
  const d = getData(p);
  const options = [];
  const add = (label, fn) => options.push({ label, fn });
  const lvGain = set === "super" ? 15 : 5;
  const cap = set === "earth" ? 100 : set === "namek" ? 120 : MAX_LEVEL;
  add("§d不老不死にしてくれ", () => {
    d.immortal = true;
    msg(p, "§d不老不死になった！（体力が減ると一瞬で回復し、しばらく無敵になる）");
  });
  add("§6財宝をくれ", () => {
    const items = set === "super"
      ? [["minecraft:diamond_block", 8], ["minecraft:netherite_ingot", 4], ["minecraft:emerald_block", 8], ["minecraft:enchanted_golden_apple", 2]]
      : [["minecraft:diamond", 16], ["minecraft:emerald", 32], ["minecraft:gold_block", 8], ["minecraft:golden_apple", 4]];
    for (const [id, n] of items) give(p, id, n);
    msg(p, "§6空から財宝が降ってきた！");
  });
  const dead = Object.entries(d.allies).filter(([, a]) => /** @type {any} */ (a).dead);
  if (dead.length) {
    add(`§a仲間を生き返らせてくれ（${dead.length}人）`, () => {
      for (const [cid, a] of dead) /** @type {any} */ (a).dead = false;
      emit("alliesRevived", p);
      msg(p, "§a倒れた仲間が生き返った！ 仲間メニューから呼び出せる。");
    });
  }
  add(`§c強くしてくれ（レベル+${lvGain}）`, () => {
    if (d.level >= cap) {
      msg(p, `§7「その願いは私の力を超えている…」（${SETS[set].name}はレベル${cap}以上は上げられない）`);
      return "retry";
    }
    const target = Math.min(cap, d.level + lvGain);
    while (d.level < target) {
      d.level++;
      d.points += d.level % 5 === 0 ? 5 : 3;
    }
    d.ki = maxKi(d);
    autoLearn(p);
    checkUnlocks(p);
    title(p, "§c力がみなぎる…！", `§eLv.${d.level}`, 50);
  });
  // unlock options
  const special = [];
  if (d.race === "saiyan" && d.level >= 90 && !d.forms.includes("god")) special.push(["god_ritual", "超サイヤ人ゴッドの儀式を"]);
  if (d.race === "namek" && d.level >= 95 && !d.forms.includes("orange")) special.push(["orange_wish", "ナメック星人の潜在能力を引き出してくれ"]);
  if (!d.quests.guru && d.level >= 30) special.push(["guru", "眠っている潜在能力を引き出してくれ"]);
  for (const [flag, label] of special) add(`§b${label}`, () => {
    grantFlag(p, flag);
    msg(p, "§b体の奥から力が湧き上がる…！");
  });
  if (d.race === "saiyan" && !d.tail) add("§e尻尾を生やしてくれ", () => {
    d.tail = true;
    refreshVisuals(p);
  });
  add("§b技を教えてくれ", async () => {
    const missing = Object.keys(TECHS).filter((id) => !d.techs.includes(id) && (TECHS[id].learn?.master || TECHS[id].learn?.boss));
    if (!missing.length) {
      msg(p, "§7もう覚える技はない。");
      return "retry";
    }
    const f = new ActionFormData().title("覚えたい技").body("ひとつ選べ。");
    for (const id of missing) f.button(TECHS[id].name);
    const r = await f.show(p);
    if (r.canceled) return "retry";
    learnTech(p, missing[r.selection]);
  });
  add("§a種族を変えてくれ", async () => {
    const ids = Object.keys(RACES).filter((r) => r !== d.race);
    const f = new ActionFormData().title("新しい種族").body("変身はリセットされます（レベルとステータスはそのまま）。");
    for (const id of ids) f.button(`${RACES[id].color}${RACES[id].name}`);
    const r = await f.show(p);
    if (r.canceled) return "retry";
    revertForm(p, true);
    d.race = ids[r.selection];
    d.forms = [];
    d.target = null;
    d.tail = d.race === "saiyan";
    autoLearn(p);
    checkUnlocks(p);
    refreshVisuals(p);
    msg(p, `§a${RACES[d.race].name}に生まれ変わった！`);
  });
  if (set === "namek") {
    add("§2地球へ送ってくれ", () => {
      const s = world.getDefaultSpawnLocation();
      p.teleport({ x: s.x, y: 200, z: s.z });
      p.addEffect("slow_falling", 400, { amplifier: 0, showParticles: false });
    });
  }
  add("§dギャルのパンティーおくれーっ！！", () => {
    give(p, "dbz:gal_panties", 1);
    msg(p, "§d……空からパンティーが降ってきた。");
  });
  add("§7（まだ決めていない）", () => "cancel");
  const f = new ActionFormData().title(`§a${SETS[set].name}への願い（${idx}/${total}）`).body("§f願いをひとつ選べ。");
  for (const o of options) f.button(o.label);
  const res = await f.show(p);
  if (res.canceled) return "cancel";
  const o = options[res.selection];
  const out = await o.fn();
  markDirty(p);
  if (out === "cancel") return "cancel";
  if (out === "retry") return wishMenu(p, set, idx, total);
  sound(p.dimension, "dbz.wish", p.location, 1.5);
  particle(p.dimension, "dbz:pillar", p.location, "gold", 1);
  return "ok";
}

function give(p, id, n) {
  try {
    p.dimension.spawnItem(new ItemStack(id, n), V.up(p.location, 2));
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------------------------- radar */

function heldRadar(p) {
  try {
    return p.getComponent(EntityComponentTypes.Inventory).container.getItem(p.selectedSlotIndex)?.typeId === "dbz:dragon_radar";
  } catch {
    return false;
  }
}

function radarTargets(p) {
  load();
  const out = [];
  for (const [set, st] of Object.entries(state)) {
    if (isStone(set)) continue;
    for (const b of st.balls) {
      if (b.state !== "world") continue;
      out.push({ set, n: b.n, x: b.x + 0.5, y: b.y ?? p.location.y, z: b.z + 0.5, approx: b.y === null });
    }
  }
  // balls carried by other players
  for (const o of world.getAllPlayers()) {
    if (o.id === p.id) continue;
    try {
      const inv = o.getComponent(EntityComponentTypes.Inventory).container;
      for (let i = 0; i < inv.size; i++) {
        const it = inv.getItem(i);
        const info = it && parseBall(it.typeId);
        if (info) out.push({ set: info.set, n: info.n, x: o.location.x, y: o.location.y, z: o.location.z, holder: o.name });
      }
    } catch {
      // ignore
    }
  }
  return out;
}

addHudLine((p) => {
  if (!heldRadar(p)) return null;
  const list = radarTargets(p).filter((t) => p.dimension.id === "minecraft:overworld");
  if (!list.length) {
    const stone = Object.keys(SETS).filter(isStone);
    return stone.length ? `§6[レーダー] §7反応なし（石になっている：あと${load()[stone[0]].stoneDay - world.getDay()}日）` : "§6[レーダー] §7反応なし";
  }
  list.sort((a, b) => V.dist2(a, p.location) - V.dist2(b, p.location));
  const t = list[0];
  const dx = t.x - p.location.x;
  const dz = t.z - p.location.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const targetYaw = (Math.atan2(-dx, dz) * 180) / Math.PI;
  const rel = targetYaw - p.getRotation().y;
  const arrow = arrowFor(rel);
  const dy = t.approx ? "" : ` 高さ${t.y - p.location.y >= 0 ? "+" : ""}${Math.round(t.y - p.location.y)}`;
  if (system.currentTick % (dist < 30 ? 10 : 40) === 0) psound(p, "dbz.radar", 0.5, dist < 30 ? 1.4 : 1);
  const name = t.set === "earth" ? `${KANJI[t.n - 1]}星球` : t.set === "namek" ? `ナメック${KANJI[t.n - 1]}星球` : `超${KANJI[t.n - 1]}星球`;
  return `§6[レーダー] §e${name} §f${arrow} ${Math.round(dist)}m（${compass(dx, dz)}）${dy}${t.holder ? ` §7${t.holder}が所持` : ""} §7反応${list.length}`;
});

export async function radarMenu(p) {
  const list = radarTargets(p);
  const f = new ActionFormData().title("§6ドラゴンレーダー");
  let body = "";
  for (const set of Object.keys(SETS)) {
    const st = load()[set];
    body += `\n§e${SETS[set].ballName}§r`;
    if (isStone(set)) {
      body += ` §7石になっている（あと${st.stoneDay - world.getDay()}日）\n`;
      continue;
    }
    body += "\n";
    for (const b of st.balls) {
      const t = list.find((x) => x.set === set && x.n === b.n);
      if (b.state === "taken" && !t) {
        body += ` §7${KANJI[b.n - 1]}星球：誰かが持っている（自分のカバンを確認）\n`;
        continue;
      }
      if (!t) continue;
      const dx = t.x - p.location.x;
      const dz = t.z - p.location.z;
      const where = b.site ? `（${SITES[b.site].name}）` : "";
      body += ` §f${KANJI[b.n - 1]}星球：${Math.round(Math.sqrt(dx * dx + dz * dz))}m ${compass(dx, dz)}${where}\n`;
    }
  }
  f.body(body.trim() + "\n\n§7レーダーを持っていると、画面下に一番近いボールの方向が表示される。");
  f.button("閉じる");
  await f.show(p);
}

export { parseBall };
