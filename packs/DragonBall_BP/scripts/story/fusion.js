import { system, world, GameMode } from "@minecraft/server";
import { getData, rt } from "../core/data.js";
import { powerOf } from "../core/stats.js";
import { V, isValid, chance } from "../core/util.js";
import { particle, sound, title, msg, say, flash, shakeArea } from "../core/fx.js";
import { on } from "../core/bus.js";
import { fighters, spawnFighter } from "../npc/fighters.js";
import { refreshVisuals, setPose } from "../combat/forms.js";
import { applyPassives } from "../core/stats.js";
import { setFighterPL } from "../combat/damage.js";
import { CHARS, CHAR_INDEX } from "../gen/catalog.js";

const BASE = (cid) => cid.replace(/_(ssj3|ssj2|ssj|god|blue|ui|ue)$/, "");
const N = (cid) => CHARS[CHAR_INDEX[cid]]?.name ?? cid;

function fusionName(partner, mode) {
  if (partner === "goku" || partner === "vegeta") return mode === "dance" ? "ゴジータ" : "ベジット";
  return `フュージョン戦士（${N(partner)}）`;
}

on("fusionRequest", (p, allyEntity, mode) => {
  const r = rt(p);
  if (r.fusion) {
    msg(p, "§7もう合体している！");
    return;
  }
  if (!isValid(allyEntity)) return;
  const s = fighters.get(allyEntity.id);
  if (!s) return;
  const partner = BASE(s.cid);
  if (mode === "potara") {
    msg(p, "§eポタラを片耳ずつつけた…！");
    startFusion(p, { partnerCid: partner, partnerEntity: allyEntity, mode, fail: false });
    return;
  }
  // fusion dance
  title(p, "§eフュー…", "§7しゃがまず、動かずにタイミングを合わせろ！", 30);
  setPose(p, "fusion", 60);
  setPose(allyEntity, "fusion");
  const start = p.location;
  system.runTimeout(() => title(p, "§eジョン…", "", 20), 25);
  system.runTimeout(() => {
    if (!isValid(p) || !isValid(allyEntity)) return;
    title(p, "§eはっ！！", "", 20);
    const moved = V.dist(start, p.location) > 0.6 || p.isSneaking;
    const fail = moved || chance(0.12);
    startFusion(p, { partnerCid: partner, partnerEntity: allyEntity, mode, fail });
  }, 50);
});

function startFusion(p, o) {
  const r = rt(p);
  const d = getData(p);
  const partnerPL = powerOf(p) * 0.8;
  const base = (powerOf(p) + partnerPL) / Math.max(1, powerOf(p));
  const mult = o.fail ? 0.5 : base * (o.mode === "dance" ? 5 : 7);
  const seconds = o.mode === "dance" ? 300 : 600;
  const name = o.fail ? "失敗した合体戦士" : fusionName(o.partnerCid, o.mode);
  r.fusion = {
    name, mult, mode: o.mode, fail: o.fail, partnerCid: o.partnerCid, partnerPlayer: o.partnerPlayer ?? null,
    body: o.fail ? (Math.random() < 0.5 ? "fusion_fat" : "gogeta") : o.mode === "dance" ? "gogeta" : "vegito",
    style: o.mode === "dance" ? "goku" : "vegeta", until: system.currentTick + seconds * 20,
  };
  if (o.partnerEntity && isValid(o.partnerEntity)) {
    try {
      o.partnerEntity.remove();
    } catch {
      // ignore
    }
  }
  sound(p.dimension, "dbz.fusion", p.location, 2.5);
  particle(p.dimension, "dbz:explosion_core", V.up(p.location, 1), "cyan", 5);
  particle(p.dimension, "dbz:shockwave", p.location, "white", 5);
  shakeArea(p.dimension, p.location, 30, 0.8, 1.0);
  flash(p, { red: 1, green: 1, blue: 1 }, 0.2);
  if (o.fail) r.fusion.thin = r.fusion.body === "gogeta";
  refreshVisuals(p);
  applyPassives(p);
  if (o.fail) {
    r.fusion.thin = r.fusion.body === "gogeta";
    title(p, "§c合体失敗…！", r.fusion.thin ? "§7ガリガリのヨボヨボになってしまった…" : "§7太った姿になってしまった…", 60);
  } else {
    title(p, `§b${name}！！`, `§f合体時間：${seconds / 60}分`, 60);
  }
}

function endFusion(p, reason = "時間切れ") {
  const r = rt(p);
  const f = r.fusion;
  if (!f) return;
  r.fusion = null;
  refreshVisuals(p);
  applyPassives(p);
  particle(p.dimension, "dbz:explosion_smoke", p.location, "white", 2);
  sound(p.dimension, "dbz.capsule", p.location, 1.5);
  msg(p, `§7合体が解けた（${reason}）。`);
  if (f.partnerCid) {
    const loc = V.add(p.location, { x: 1.5, y: 0.5, z: 0 });
    const e = spawnFighter(f.partnerCid, p.dimension, loc, { role: "ally", owner: p, level: getData(p).level, tag: `ally_${p.id}` });
    if (e) setFighterPL(e, powerOf(p) * 0.8);
  }
  if (f.partnerPlayer) {
    const o = /** @type {any} */ (world.getEntity(f.partnerPlayer));
    if (o && o.typeId === "minecraft:player") {
      try {
        o.setGameMode(GameMode.Survival);
        o.teleport(V.add(p.location, { x: 1.5, y: 0.2, z: 0 }));
      } catch {
        // ignore
      }
      rt(o).fusedInto = null;
      msg(o, "§7合体が解けた。");
    }
  }
}

/* player + player Potara */
const pending = new Map();

on("potaraUse", (p) => {
  const now = system.currentTick;
  if (rt(p).fusion) {
    msg(p, "§7もう合体している！");
    return;
  }
  for (const [id, t] of pending) {
    if (id === p.id || now - t > 100) continue;
    const o = /** @type {any} */ (world.getEntity(id));
    if (!o || o.typeId !== "minecraft:player" || V.dist(o.location, p.location) > 6) continue;
    pending.delete(id);
    // the first one becomes the body
    const host = o;
    const guest = p;
    const hostPL = powerOf(host);
    const guestPL = powerOf(guest);
    rt(host).fusion = null;
    startFusion(host, { partnerCid: null, mode: "potara", fail: false, partnerPlayer: guest.id });
    rt(host).fusion.mult = ((hostPL + guestPL) / Math.max(1, hostPL)) * 7;
    rt(host).fusion.name = `ポタラ合体（${host.name}＋${guest.name}）`;
    rt(guest).fusedInto = host.id;
    try {
      guest.setGameMode(GameMode.Spectator);
    } catch {
      // ignore
    }
    msg(guest, `§b${host.name}と合体した！ 合体中は${host.name}の体の中から見守る。`);
    return;
  }
  // with an NPC ally
  for (const s of fighters.values()) {
    if (s.role !== "ally" || s.owner !== p.id || !isValid(s.e)) continue;
    const base = BASE(s.cid);
    if ((base === "goku" || base === "vegeta") && V.dist(s.e.location, p.location) < 6) {
      startFusion(p, { partnerCid: base, partnerEntity: s.e, mode: "potara", fail: false });
      return;
    }
  }
  pending.set(p.id, now);
  msg(p, "§eポタラを片耳につけた。§7近く（6ブロック以内）の悟空かベジータの仲間、または他のプレイヤーがポタラを使うと合体する。");
});

system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const r = rt(p);
    if (r.fusion) {
      if (system.currentTick > r.fusion.until) endFusion(p);
      else if (r.fusion.partnerPlayer) {
        const g = world.getEntity(r.fusion.partnerPlayer);
        if (!g) endFusion(p, "相手がいなくなった");
        else {
          try {
            g.teleport(V.up(p.location, 0.5), { dimension: p.dimension });
          } catch {
            // ignore
          }
        }
      }
    }
    if (r.fusedInto && !world.getEntity(r.fusedInto)) {
      r.fusedInto = null;
      try {
        p.setGameMode(GameMode.Survival);
      } catch {
        // ignore
      }
    }
  }
}, 2);

on("playerDied", (p) => {
  if (rt(p).fusion) endFusion(p, "やられた");
});

export function fusionRemaining(p) {
  const f = rt(p).fusion;
  return f ? Math.max(0, Math.floor((f.until - system.currentTick) / 20)) : 0;
}

export { endFusion };
