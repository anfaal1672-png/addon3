import { system, world, EntityComponentTypes, InputButton, ButtonState } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { getData, rt } from "../core/data.js";
import { V, isValid } from "../core/util.js";
import { particle, sound, msg, title, flash } from "../core/fx.js";
import { SITES, travelTo, getLayout } from "../world/sites.js";

/* Kinto'un, the air car and the Capsule Corp spaceship are all steered by script. */

const SPEED = { "dbz:kintoun": 1.15, "dbz:aircar": 0.8, "dbz:spaceship": 0.5 };

function riderOf(v) {
  try {
    const r = v.getComponent(EntityComponentTypes.Rideable);
    return r?.getRiders()?.[0];
  } catch {
    return undefined;
  }
}

system.runInterval(() => {
  for (const dim of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"].map((d) => world.getDimension(d))) {
    for (const p of dim.getPlayers()) {
      let v;
      try {
        v = p.getComponent(EntityComponentTypes.Riding)?.entityRidingOn;
      } catch {
        v = undefined;
      }
      if (!v || !SPEED[v.typeId]) continue;
      steer(v, p);
    }
  }
}, 1);

function steer(v, p) {
  let mv = { x: 0, y: 0 };
  let jump = false;
  try {
    mv = p.inputInfo.getMovementVector();
    jump = p.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
  } catch {
    // ignore
  }
  const view = p.getViewDirection();
  const sp = SPEED[v.typeId] * (p.isSprinting ? 1.6 : 1);
  let vel = V.mul(view, mv.y * sp);
  const rot = p.getRotation();
  const yr = (rot.y * Math.PI) / 180;
  vel = V.add(vel, V.mul({ x: Math.cos(yr), y: 0, z: Math.sin(yr) }, mv.x * sp * 0.6));
  if (jump) vel.y += sp * 0.6;
  try {
    v.clearVelocity();
    v.applyImpulse(vel);
    v.setRotation({ x: 0, y: rot.y });
  } catch {
    // ignore
  }
  if (v.typeId === "dbz:kintoun" && system.currentTick % 3 === 0 && V.len(vel) > 0.2) {
    particle(v.dimension, "dbz:trail", v.location, "gold", 1.2);
  }
  if (v.typeId === "dbz:aircar" && system.currentTick % 4 === 0 && V.len(vel) > 0.2) {
    particle(v.dimension, "dbz:trail", V.up(v.location, 0.3), "cyan", 0.6);
  }
}

/** Kinto'un only carries the pure of heart. */
world.afterEvents.playerInteractWithEntity.subscribe((ev) => {
  const v = ev.target;
  const p = ev.player;
  if (v.typeId === "dbz:kintoun") {
    const d = getData(p);
    if (d.karma < -10) {
      system.runTimeout(() => {
        try {
          v.getComponent(EntityComponentTypes.Rideable)?.ejectRiders();
        } catch {
          // ignore
        }
        msg(p, "§e筋斗雲は心が清らかでないと乗れない…（悪いことをしすぎた）");
      }, 2);
    }
  }
  if (v.typeId === "dbz:spaceship") {
    system.runTimeout(() => shipMenu(p, v), 10);
  }
});

export function summonKintoun(p) {
  const d = getData(p);
  const dim = p.dimension;
  const from = V.add(V.up(p.location, 12), V.mul(p.getViewDirection(), -20));
  let k;
  try {
    for (const old of dim.getEntities({ type: "dbz:kintoun", location: p.location, maxDistance: 64 })) old.remove();
    k = dim.spawnEntity("dbz:kintoun", from);
  } catch {
    return;
  }
  sound(dim, "dbz.wind", p.location, 1.5);
  msg(p, "§e「筋斗雲ーーーっ！！」");
  let t = 0;
  const run = system.runInterval(() => {
    t++;
    if (!isValid(k) || !isValid(p) || t > 60) {
      system.clearRun(run);
      return;
    }
    const want = V.add(p.location, { x: 0, y: -0.2, z: 0 });
    const to = V.sub(want, k.location);
    if (V.len(to) < 1.5) {
      system.clearRun(run);
      try {
        k.clearVelocity();
        k.teleport(V.up(p.location, -0.1));
        if (d.karma >= -10) k.getComponent(EntityComponentTypes.Rideable)?.addRider(p);
        else msg(p, "§e筋斗雲は心が清らかでないと乗れない…");
      } catch {
        // ignore
      }
      return;
    }
    try {
      k.clearVelocity();
      k.applyImpulse(V.mul(V.norm(to), Math.min(1.6, V.len(to) * 0.3)));
    } catch {
      // ignore
    }
    particle(k.dimension, "dbz:trail", k.location, "gold", 1.2);
  }, 1);
}

export function spawnVehicle(p, type) {
  const loc = V.add(p.location, V.mul({ x: p.getViewDirection().x, y: 0, z: p.getViewDirection().z }, 3));
  try {
    p.dimension.spawnEntity(type, V.up(loc, 0.6));
  } catch {
    return false;
  }
  particle(p.dimension, "dbz:pop_smoke", loc, "white", 1);
  sound(p.dimension, "dbz.capsule", loc, 1.2);
  return true;
}

/** Re-capture a vehicle (sneak + use the capsule while looking at it, handled by items.js). */
export function nearestVehicle(p, type, range = 6) {
  try {
    return p.dimension.getEntities({ type, location: p.location, maxDistance: range })[0];
  } catch {
    return undefined;
  }
}

async function shipMenu(p, ship) {
  if (!isValid(ship)) return;
  const d = getData(p);
  const dests = [["earth", "地球（世界のはじまりの場所）"], ["namek", "ナメック星"], ["kai", "界王星"], ["beerus", "破壊神ビルスの星"], ["top", "力の大会の会場"]];
  const f = new ActionFormData().title("§b宇宙船").body("§f行き先を選んでください。\n§7（乗ったまま移動します。帰りも宇宙船で戻れます）");
  for (const [, name] of dests) f.button(name);
  f.button("§7降りる");
  const r = await f.show(p);
  if (r.canceled || r.selection === undefined || r.selection >= dests.length) return;
  const [id, name] = dests[r.selection];
  // liftoff
  title(p, "§b発進！", `§f${name}へ`, 40);
  sound(ship.dimension, "dbz.beam_fire", ship.location, 2, 0.5);
  for (let i = 0; i < 30; i++) {
    system.runTimeout(() => {
      if (!isValid(ship)) return;
      try {
        ship.clearVelocity();
        ship.applyImpulse({ x: 0, y: 0.6, z: 0 });
      } catch {
        // ignore
      }
      particle(ship.dimension, "dbz:explosion_smoke", ship.location, "white", 2);
    }, i);
  }
  system.runTimeout(() => {
    if (!isValid(p)) return;
    flash(p, { red: 0.05, green: 0.05, blue: 0.15 }, 1.2);
    try {
      ship.remove();
    } catch {
      // ignore
    }
    const arrive = () => {
      try {
        const loc = V.add(p.location, { x: 4, y: 0.5, z: 0 });
        p.dimension.spawnEntity("dbz:spaceship", loc);
      } catch {
        // ignore
      }
    };
    if (id === "earth") {
      const s = world.getDefaultSpawnLocation();
      const cc = getLayout().capsule_corp;
      const target = cc ? { x: cc.x - 30, y: 200, z: cc.z } : { x: s.x, y: 200, z: s.z };
      try {
        p.teleport(target, { dimension: world.getDimension("minecraft:overworld") });
        p.addEffect("slow_falling", 600, { amplifier: 0, showParticles: false });
      } catch {
        // ignore
      }
      title(p, "§a地球", "§7に帰ってきた", 40);
      system.runTimeout(() => {
        try {
          const top = p.dimension.getTopmostBlock({ x: target.x, z: target.z });
          if (top) p.teleport({ x: target.x, y: top.location.y + 1.5, z: target.z });
          arrive();
        } catch {
          // ignore
        }
      }, 60);
    } else {
      travelTo(p, id, arrive);
    }
  }, 32);
}

export { SITES };
