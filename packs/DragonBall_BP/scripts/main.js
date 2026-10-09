/* Dragon Ball addon — entry point. Wires item controls, per-player loops, joining and death. */
import { system, world } from "@minecraft/server";
import "./core/interact.js";
import { getData, markDirty, rt, saveNow, forgetPlayer } from "./core/data.js";
import { maxKi, applyPassives, addExp, powerOf } from "./core/stats.js";
import { renderHud } from "./core/hud.js";
import { particle, sound, msg, title, psound } from "./core/fx.js";
import { V, safe, isValid } from "./core/util.js";
import { on } from "./core/bus.js";
import { RACES } from "./combat/formsData.js";
import { refreshVisuals, transformUp, revertForm, formSecond, checkOozaru, checkUnlocks, setPose, auraColorName, endOozaru } from "./combat/forms.js";
import { startCast, releaseCast, tickCast, endCast, tickRush, autoLearn } from "./combat/techniques.js";
import { flightTick, stopFlight } from "./combat/movement.js";
import { checkZenkai } from "./combat/damage.js";
import { cleanupStray } from "./combat/projectiles.js";
import "./combat/melee.js";
import { adoptAll } from "./npc/fighters.js";
import "./npc/masters.js";
import "./world/sites.js";
import { regionTick } from "./world/regions.js";
import "./world/dragonballs.js";
import "./world/spawner.js";
import { giveKit, useHandlers, KIT } from "./items/items.js";
import "./items/vehicles.js";
import "./items/eggs.js";
import "./battle/battle.js";
import "./story/sagas.js";
import "./story/fusion.js";
import "./story/tournament.js";
import { mainMenu, raceMenu, helpMenu } from "./ui/menu.js";
import { onCommand } from "./core/interact.js";

/* ===================================================================================== item controls */

const SKILL = { "dbz:skill_1": 0, "dbz:skill_2": 1, "dbz:skill_3": 2, "dbz:skill_4": 3 };

world.afterEvents.itemStartUse.subscribe((ev) => {
  const p = ev.source;
  const id = ev.itemStack?.typeId;
  const d = getData(p);
  if (!d.race) {
    if (id && KIT.includes(id)) raceMenu(p);
    return;
  }
  const r = rt(p);
  if (id === "dbz:ki_charge") {
    if (p.isSneaking) {
      r.hiddenKi = !r.hiddenKi;
      r.chargeIgnored = true;
      msg(p, r.hiddenKi ? "§8気を消した。（スカウターや敵に見つかりにくい）" : "§f気を解放した。");
      refreshVisuals(p);
      return;
    }
    r.charging = true;
    r.chargeIgnored = false;
    r.chargeTicks = 0;
    sound(p.dimension, "dbz.charge", p.location, 1.2);
    refreshVisuals(p);
  } else if (id in SKILL) {
    startCast(p, SKILL[id]);
  } else if (id === "dbz:guard") {
    r.guard = true;
    r.guardStart = Date.now();
    r.guardStartTick = system.currentTick;
    setPose(p, "guard");
    applyPassives(p);
    sound(p.dimension, "dbz.guard", p.location, 0.6, 1.3);
  }
});

function stopUse(p, id) {
  const r = rt(p);
  if (id === "dbz:ki_charge") {
    r.charging = false;
    setPose(p, "none");
    refreshVisuals(p);
  } else if (id in SKILL) {
    if (r.casting) releaseCast(p);
  } else if (id === "dbz:guard") {
    r.guard = false;
    setPose(p, "none");
    applyPassives(p);
  }
}

world.afterEvents.itemStopUse.subscribe((ev) => stopUse(ev.source, ev.itemStack?.typeId));
world.afterEvents.itemReleaseUse.subscribe((ev) => stopUse(ev.source, ev.itemStack?.typeId));

world.afterEvents.itemUse.subscribe((ev) => {
  const p = ev.source;
  const id = ev.itemStack?.typeId;
  if (!id) return;
  const d = getData(p);
  if (id === "dbz:menu") {
    if (!d.race) raceMenu(p);
    else mainMenu(p);
    return;
  }
  if (!d.race) return;
  if (id === "dbz:transform") {
    if (p.isSneaking) {
      if (rt(p).oozaru) endOozaru(p);
      else revertForm(p);
    } else transformUp(p);
    return;
  }
  const h = useHandlers[id];
  if (h) h(p);
});

world.afterEvents.playerHotbarSelectedSlotChange.subscribe((ev) => {
  const r = rt(ev.player);
  if (r.casting) endCast(ev.player);
  if (r.charging) {
    r.charging = false;
    refreshVisuals(ev.player);
  }
  if (r.guard) {
    r.guard = false;
    applyPassives(ev.player);
  }
});

/* ===================================================================================== per-tick loop */

system.runInterval(() => {
  const t = system.currentTick;
  for (const p of world.getAllPlayers()) {
    const d = getData(p);
    if (!d.race) continue;
    const r = rt(p);
    safe(() => flightTick(p), "flight");
    safe(() => tickCast(p), "cast");
    safe(() => tickRush(p), "rush");
    if (r.charging) safe(() => chargeTick(p, d, r), "charge");
    if (r.poseUntil && t > r.poseUntil) {
      r.poseUntil = 0;
      if (!r.casting && !r.charging && !r.guard && !r.flying) setPose(p, "none");
    }
    if (t % 4 === 0) safe(() => renderHud(p), "hud");
    if (t % 10 === 0) {
      safe(() => applyPassives(p), "passives");
      safe(() => regionTick(p), "region");
      safe(() => passiveKi(p, d, r), "ki");
    }
    if (t % 20 === 0) {
      safe(() => formSecond(p), "form");
      safe(() => checkOozaru(p), "oozaru");
      safe(() => checkZenkai(p), "zenkai");
      safe(() => formAura(p, r), "aura");
    }
    if (t % 100 === 0) {
      safe(() => {
        autoLearn(p);
        checkUnlocks(p);
        refreshVisuals(p);
      }, "unlocks");
    }
  }
}, 1);

function chargeTick(p, d, r) {
  r.chargeTicks++;
  const mk = maxKi(d);
  const before = d.ki;
  d.ki = Math.min(mk, d.ki + mk * 0.011 + 0.8 + (r.form ? 0.6 : 0));
  setPose(p, "charge");
  const col = auraColorName(p);
  if (r.chargeTicks % 2 === 0) particle(p.dimension, "dbz:aura_rise", p.location, col, 1);
  if (r.chargeTicks % 5 === 0) particle(p.dimension, "dbz:dust_rise", p.location, "white", 1);
  if (r.form && r.chargeTicks % 7 === 0) particle(p.dimension, "dbz:lightning", p.location, "white", 1);
  if (r.chargeTicks % 50 === 0) sound(p.dimension, "dbz.charge", p.location, 1.2);
  if (r.chargeTicks % 20 === 0) {
    d.train.chargeSec++;
    addExp(p, 0.4, true);
  }
  if (before < mk && d.ki >= mk) psound(p, "dbz.learn", 0.5, 1.8);
}

function passiveKi(p, d, r) {
  if (r.charging || r.flying || r.casting) return;
  const mk = maxKi(d);
  const regen = (0.004 * mk + 0.4) * (d.race === "namek" ? 1.4 : 1) * (r.gear?.kiRegen ? 1.5 : 1);
  d.ki = Math.min(mk, d.ki + regen);
}

function formAura(p, r) {
  if (!r.form && !r.kaioken) return;
  particle(p.dimension, "dbz:ki_spark", V.up(p.location, 1), auraColorName(p), 1);
  if (r.vis?.["dbz:spark"]) particle(p.dimension, "dbz:lightning", p.location, "white", 1);
}

/* ===================================================================================== join / leave / death */

world.afterEvents.playerSpawn.subscribe((ev) => {
  const p = ev.player;
  const d = getData(p);
  const r = rt(p);
  if (ev.initialSpawn) {
    r.vis = {};
    system.runTimeout(() => {
      if (!isValid(p)) return;
      if (!d.race) {
        title(p, "§6§lドラゴンボール", "§fの世界へようこそ！", 60);
        system.runTimeout(() => isValid(p) && raceMenu(p), 60);
      } else {
        refreshVisuals(p);
        applyPassives(p);
        giveKit(p, true);
        msg(p, `§6[ドラゴンボール] §fおかえり！ ${RACES[d.race].name} Lv.${d.level}（メニュー：8番のアイテム / /dbz:dbmenu）`);
      }
    }, 40);
  } else {
    // respawn after death
    r.dead = false;
    d.ki = maxKi(d) * 0.5;
    giveKit(p, true);
    system.runTimeout(() => {
      if (!isValid(p)) return;
      r.vis = {};
      refreshVisuals(p);
      applyPassives(p);
    }, 10);
  }
});

on("playerDied", (p) => {
  const r = rt(p);
  const d = getData(p);
  r.dead = true;
  r.charging = false;
  r.casting = null;
  r.guard = false;
  r.kaioken = 0;
  r.form = null;
  r.rushTicks = 0;
  if (r.oozaru) endOozaru(p);
  stopFlight(p);
  d.deaths++;
  markDirty(p);
});

world.beforeEvents.playerLeave.subscribe((ev) => {
  const id = ev.player.id;
  system.run(() => forgetPlayer(id));
});

/* ===================================================================================== commands & startup */

onCommand("dbz:dbmenu", (p) => mainMenu(p));
onCommand("dbz:dbkit", (p) => giveKit(p));
onCommand("dbz:dbhelp", (p) => helpMenu(p, 0));

world.afterEvents.worldLoad.subscribe(() => {
  system.runTimeout(() => {
    adoptAll();
    for (const id of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) cleanupStray(world.getDimension(id));
  }, 20);
});

// save everyone periodically (in addition to the dirty-save loop)
system.runInterval(() => {
  for (const p of world.getAllPlayers()) saveNow(p);
}, 1200);
