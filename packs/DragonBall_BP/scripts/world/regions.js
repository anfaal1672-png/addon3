import { system, world } from "@minecraft/server";
import { getData, markDirty, rt, worldGet, worldSet } from "../core/data.js";
import { addExp, gearInfo } from "../core/stats.js";
import { SITES, getLayout, siteAt, terraformNamek, travelTo } from "./sites.js";
import { V, cmd, isValid } from "../core/util.js";
import { particle, msg, title, psound, sound } from "../core/fx.js";
import { setPose } from "../combat/forms.js";

/* Gravity rooms: fixed one at Capsule Corp + capsules placed by players. */
export function gravityRooms() {
  const L = getLayout();
  const out = [];
  const cc = L.capsule_corp;
  if (cc?.built && cc.y !== null) out.push({ x: cc.x + 18, y: cc.y, z: cc.z + 6, r: 6 });
  for (const g of worldGet("dbz:gravRooms", [])) out.push(g);
  return out;
}

export function addGravityRoom(loc) {
  const list = worldGet("dbz:gravRooms", []);
  list.push({ x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z), r: 5 });
  worldSet("dbz:gravRooms", list.slice(-16));
}

export function removeGravityRoom(loc) {
  const list = worldGet("dbz:gravRooms", []).filter((g) => V.dist(g, loc) > 3);
  worldSet("dbz:gravRooms", list);
}

function inGravityRoom(p) {
  if (p.dimension.id !== "minecraft:overworld") return false;
  for (const g of gravityRooms()) {
    if (Math.abs(p.location.x - g.x - 0.5) <= g.r && Math.abs(p.location.z - g.z - 0.5) <= g.r && p.location.y >= g.y - 1 && p.location.y <= g.y + g.r + 2) return true;
  }
  return false;
}

function setFog(p, id) {
  const r = rt(p);
  if (r.fog === id) return;
  if (r.fog) cmd(p, "fog @s remove dbz_region");
  if (id) cmd(p, `fog @s push dbz:${id} dbz_region`);
  r.fog = id;
}

function effect(p, id, amp, dur = 30) {
  try {
    if (amp < 0) return;
    p.addEffect(id, dur, { amplifier: amp, showParticles: false });
  } catch {
    // ignore
  }
}

/** Runs every 10 ticks per player. */
export function regionTick(p) {
  const d = getData(p);
  const r = rt(p);
  if (!d.race) return;
  const L = getLayout();
  const site = p.dimension.id === "minecraft:overworld" ? siteAt(p.location) : null;
  let fog = site ? SITES[site].fog ?? null : null;
  let expMult = 1;
  const gear = r.gear ?? gearInfo(p);
  expMult += gear.weight * 0.35;
  // gravity room
  const grav = inGravityRoom(p) ? d.gravity ?? 10 : 1;
  r.gravity = grav;
  if (grav > 1) {
    const amp = Math.min(5, Math.floor(Math.log2(grav) / 1.6));
    effect(p, "slowness", amp);
    effect(p, "mining_fatigue", Math.min(2, Math.floor(amp / 2)));
    expMult *= 1 + Math.log10(grav) * 1.2;
    if (grav >= 50) fog = "gravity";
    if (grav > d.train.gravityBest) {
      d.train.gravityBest = grav;
      markDirty(p);
    }
    if (system.currentTick % 40 === 0) addExp(p, 0.3 * Math.sqrt(grav), true);
    // too much gravity for your level hurts
    if (grav > d.level * 6 + 20 && system.currentTick % 20 === 0) {
      try {
        const h = p.getComponent("minecraft:health");
        h.setCurrentValue(Math.max(1, h.currentValue - 1));
        r.hudMsg = "§c重力に体が耐えられない…！";
        r.hudMsgUntil = Date.now() + 1000;
      } catch {
        // ignore
      }
    }
  }
  if (site === "kai") {
    effect(p, "slowness", 1);
    expMult *= 2;
    if (system.currentTick % 20 === 0) d.train.kaiSec++;
    if (system.currentTick % 40 === 0) addExp(p, 0.6, true);
  }
  if (site === "htc") {
    expMult *= 3;
    if (system.currentTick % 20 === 0) {
      d.train.htcSec++;
      if (d.train.htcSec % 60 === 0) {
        msg(p, `§f精神と時の部屋で修行中…（外の世界の${Math.floor(d.train.htcSec / 60) * 6}日分）`);
      }
    }
    if (system.currentTick % 40 === 0) addExp(p, 1.2, true);
    // exit pad
    const c = L.htc;
    if (Math.abs(p.location.x - c.x - 0.5) < 1.6 && Math.abs(p.location.z - c.z - 0.5) < 1.6 && p.location.y - c.y < 1.5 && p.isOnGround) {
      leaveHTC(p);
    }
  }
  if (site === "namek" && system.currentTick % 40 === 0) terraformNamek(p);
  if (site === "karin_tower" && L.karin_tower.lookout) enterHTCCheck(p, L);
  r.expMult = expMult;
  r.region = site;
  setFog(p, fog);
  meditation(p, d, r);
  markDirty(p);
}

function enterHTCCheck(p, L) {
  const c = L.karin_tower;
  const ly = c.lookout;
  const x = p.location.x;
  const z = p.location.z;
  if (x >= c.x + 12 && x <= c.x + 15 && z >= c.z - 1 && z <= c.z + 2 && Math.abs(p.location.y - (ly + 1)) < 1.5) {
    const h = L.htc;
    if (!h) return;
    title(p, "§f精神と時の部屋", "§7ここでの1日は、外の世界の1年…", 60);
    travelTo(p, "htc");
  }
}

function leaveHTC(p) {
  const L = getLayout();
  const c = L.karin_tower;
  if (!c?.lookout) return;
  try {
    p.teleport({ x: c.x + 8.5, y: c.lookout + 1.2, z: c.z + 0.5 });
  } catch {
    return;
  }
  const d = getData(p);
  title(p, "§f精神と時の部屋を出た", `§7中で合計 ${Math.floor(d.train.htcSec / 60)} 分（${Math.floor(d.train.htcSec / 60) * 6}日分）修行した`, 60);
}

function meditation(p, d, r) {
  const loc = p.location;
  const moved = !r.lastPos || V.dist(r.lastPos, loc) > 0.05;
  r.lastPos = { x: loc.x, y: loc.y, z: loc.z };
  if (!moved && p.isSneaking && p.isOnGround && !r.casting && !r.charging && !r.flying) {
    r.stillTicks += 10;
  } else {
    if (r.meditating) {
      r.meditating = false;
      setPose(p, "none");
    }
    r.stillTicks = 0;
  }
  if (r.stillTicks >= 60) {
    if (!r.meditating) {
      r.meditating = true;
      msg(p, "§7瞑想を始めた…（気が早く回復し、少しずつ経験値が入る）");
    }
    setPose(p, "meditate", 15);
    d.ki = Math.min(d.ki + 6, 100 + d.stats.ki * 12 + d.level * 2);
    if (system.currentTick % 20 === 0) {
      d.train.meditateSec++;
      addExp(p, d.race === "namek" ? 0.6 : 0.3, true);
    }
    if (system.currentTick % 20 === 0) particle(p.dimension, "dbz:sparkle", { x: loc.x, y: loc.y + 1.2, z: loc.z }, "white", 1);
  }
}

world.afterEvents.playerLeave.subscribe(() => {
  // fog stacks are client side; nothing to clean.
});
