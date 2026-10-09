// Minimal in-memory mock of @minecraft/server for smoke tests (not exhaustive).
export const errors = [];
let tickNo = 0;
const intervals = [];
const timeouts = [];
let nextId = 1;

function makeSignal() {
  const subs = [];
  return { subs, subscribe(fn) { subs.push(fn); return fn; }, unsubscribe() {} , fire(ev) { for (const f of subs) { try { f(ev); } catch (e) { errors.push(e); } } } };
}
function signalBag() {
  return new Proxy({}, { get(t, k) { if (!t[k]) t[k] = makeSignal(); return t[k]; } });
}

export const system = {
  get currentTick() { return tickNo; },
  runInterval(cb, t = 1) { const id = nextId++; intervals.push({ id, cb, t: Math.max(1, t), next: tickNo + Math.max(1, t) }); return id; },
  runTimeout(cb, t = 1) { const id = nextId++; timeouts.push({ id, cb, at: tickNo + Math.max(1, t) }); return id; },
  run(cb) { return this.runTimeout(cb, 1); },
  clearRun(id) { const i = intervals.findIndex((x) => x.id === id); if (i >= 0) intervals.splice(i, 1); const j = timeouts.findIndex((x) => x.id === id); if (j >= 0) timeouts.splice(j, 1); },
  runJob(gen) { const id = nextId++; jobs.push(gen); return id; },
  beforeEvents: signalBag(),
  afterEvents: signalBag(),
};
const jobs = [];

export function advance(n = 1) {
  for (let i = 0; i < n; i++) {
    tickNo++;
    for (const it of intervals.slice()) {
      if (tickNo >= it.next) { it.next = tickNo + it.t; try { it.cb(); } catch (e) { errors.push(e); } }
    }
    for (const t of timeouts.slice()) {
      if (tickNo >= t.at) { timeouts.splice(timeouts.indexOf(t), 1); try { t.cb(); } catch (e) { errors.push(e); } }
    }
    for (const g of jobs.slice()) {
      try { for (let k = 0; k < 50; k++) { const r = g.next(); if (r.done) { jobs.splice(jobs.indexOf(g), 1); break; } } } catch (e) { errors.push(e); jobs.splice(jobs.indexOf(g), 1); }
    }
  }
}

export const EntityDamageCause = { entityAttack: "entityAttack", fall: "fall", magic: "magic", entityExplosion: "entityExplosion" };
export const InputButton = { Jump: "Jump", Sneak: "Sneak" };
export const ButtonState = { Pressed: "Pressed", Released: "Released" };
export const EquipmentSlot = { Head: "Head", Chest: "Chest", Legs: "Legs", Feet: "Feet", Mainhand: "Mainhand", Offhand: "Offhand" };
export const EntityComponentTypes = { Inventory: "minecraft:inventory", Equippable: "minecraft:equippable", Rideable: "minecraft:rideable", Riding: "minecraft:riding", TypeFamily: "minecraft:type_family", Health: "minecraft:health" };
export const GameMode = { Survival: "Survival", Creative: "Creative", Adventure: "Adventure", Spectator: "Spectator" };
export const WeatherType = { Clear: "Clear", Rain: "Rain", Thunder: "Thunder" };
export const CommandPermissionLevel = { Any: 0 };

export class MolangVariableMap { setColorRGB() {} setFloat() {} setVector3() {} }
export class BlockVolume { constructor(a, b) { this.from = a; this.to = b; } }
export class ItemStack {
  constructor(typeId, amount = 1) { this.typeId = typeId; this.amount = amount; this.keepOnDeath = false; this._dur = { damage: 0, maxDurability: 100 }; }
  getComponent(n) { return n === "minecraft:durability" ? this._dur : undefined; }
  setLore() {}
}

const entities = new Map();
const dynamic = new Map();

class Container {
  constructor(size) { this.size = size; this.items = new Array(size).fill(undefined); }
  getItem(i) { return this.items[i]; }
  setItem(i, it) { this.items[i] = it; }
  addItem(it) { const i = this.items.findIndex((x) => !x); if (i < 0) return it; this.items[i] = it; return undefined; }
  get emptySlotsCount() { return this.items.filter((x) => !x).length; }
}

class Block {
  constructor(dim, loc, typeId = "minecraft:air") { this.dimension = dim; this.location = loc; this.typeId = typeId; }
  get isAir() { return this.typeId === "minecraft:air"; }
  get isLiquid() { return this.typeId === "minecraft:water"; }
  setType(t) { this.typeId = typeof t === "string" ? t : t.id; }
  get permutation() { return { withState: () => this.permutation }; }
  setPermutation() {}
}

export class Entity {
  constructor(typeId, loc, dim) {
    this.id = String(nextId++);
    this.typeId = typeId;
    this.location = { ...loc };
    this.dimension = dim;
    this.props = {};
    this.dyn = {};
    this.tags = new Set();
    this.nameTag = "";
    this.isValid = true;
    this.isOnGround = true;
    this.isSneaking = false;
    this.isSprinting = false;
    this.rot = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.effects = {};
    this.hp = { currentValue: 20, effectiveMax: 20, setCurrentValue: (v) => { this.hp.currentValue = Math.max(0, Math.min(this.hp.effectiveMax, v)); return true; }, resetToMaxValue: () => { this.hp.currentValue = this.hp.effectiveMax; } };
    this.families = typeId === "minecraft:player" ? ["player"] : typeId === "dbz:fighter" ? ["dbz_fighter", "mob"] : typeId.startsWith("dbz:ki") || typeId === "dbz:beam" ? ["dbz_fx", "inanimate"] : ["mob", "monster"];
    entities.set(this.id, this);
  }
  getProperty(k) { return this.props[k]; }
  setProperty(k, v) { if (v === undefined || (typeof v === "number" && !isFinite(v))) throw new Error(`bad property ${k}=${v}`); this.props[k] = v; }
  getDynamicProperty(k) { return this.dyn[k]; }
  setDynamicProperty(k, v) { this.dyn[k] = v; }
  triggerEvent(e) {
    const m = /^dbz:role_(\w+)$/.exec(e);
    if (m) {
      const r = m[1];
      this.families = ["dbz_fighter", "mob", r === "enemy" ? "dbz_enemy" : r === "ally" ? "dbz_ally" : r === "npc" ? "dbz_npc" : r === "spar" ? "dbz_spar" : r === "dummy" ? "dbz_dummy" : r === "battle" ? "dbz_battler" : "dbz_passive"];
      if (r === "enemy") this.families.push("monster");
    }
    const h = /^dbz:hp_(\d+)$/.exec(e);
    if (h) { this.hp.effectiveMax = Number(h[1]); this.hp.currentValue = Number(h[1]); }
  }
  teleport(loc, opts) { if (!loc || !isFinite(loc.x) || !isFinite(loc.y) || !isFinite(loc.z)) throw new Error("bad teleport " + JSON.stringify(loc)); this.location = { ...loc }; }
  tryTeleport(loc) { this.teleport(loc); return true; }
  applyDamage(n, opts) { if (!isFinite(n)) throw new Error("bad damage " + n); this.hp.currentValue -= n; world.afterEvents.entityHurt.fire({ hurtEntity: this, damage: n, damageSource: { cause: opts?.cause ?? "entityAttack", damagingEntity: opts?.damagingEntity } }); if (this.hp.currentValue <= 0) this.die(opts?.damagingEntity); return true; }
  die(killer) {
    if (!this.isValid) return;
    if (this.typeId === "minecraft:player") {
      world.afterEvents.entityDie.fire({ deadEntity: this, damageSource: { damagingEntity: killer } });
      this.hp.currentValue = this.hp.effectiveMax;
      this.deaths = (this.deaths ?? 0) + 1; (this.killers = this.killers || []).push((killer?.typeId ?? "none") + ":" + (killer?.dyn?.["dbz:cid"] ?? "") + "@" + tickNo);
      return;
    }
    this.isValid = false; entities.delete(this.id); world.afterEvents.entityDie.fire({ deadEntity: this, damageSource: { damagingEntity: killer } });
  }
  kill() { this.die(); return true; }
  remove() { this.isValid = false; entities.delete(this.id); world.afterEvents.entityRemove.fire({ removedEntityId: this.id }); }
  applyImpulse(v) { if (!isFinite(v.x + v.y + v.z)) throw new Error("bad impulse"); this.vel = { ...v }; }
  applyKnockback(h, v) { if (!isFinite(h.x + h.z + v)) throw new Error("bad knockback"); this.vel = { x: h.x, y: v, z: h.z }; }
  clearVelocity() { this.vel = { x: 0, y: 0, z: 0 }; }
  getVelocity() { return { ...this.vel }; }
  getViewDirection() { const r = (this.rot.y * Math.PI) / 180; const pr = (this.rot.x * Math.PI) / 180; return { x: -Math.sin(r) * Math.cos(pr), y: -Math.sin(pr), z: Math.cos(r) * Math.cos(pr) }; }
  getHeadLocation() { return { x: this.location.x, y: this.location.y + 1.62, z: this.location.z }; }
  getRotation() { return { ...this.rot }; }
  setRotation(r) { this.rot = { ...r }; }
  addEffect(id, d, o) { this.effects[id] = { amplifier: o?.amplifier ?? 0, duration: d }; return this.effects[id]; }
  getEffect(id) { return this.effects[id]; }
  removeEffect(id) { delete this.effects[id]; return true; }
  getEffects() { return []; }
  hasTag(t) { return this.tags.has(t); }
  addTag(t) { this.tags.add(t); return true; }
  removeTag(t) { return this.tags.delete(t); }
  getTags() { return [...this.tags]; }
  matches(o) { return !o.families || o.families.some((f) => this.families.includes(f)); }
  runCommand() { return { successCount: 1 }; }
  getComponent(n) {
    if (n === "minecraft:health" || n === "health") return this.hp;
    if (n === "minecraft:type_family") return { getTypeFamilies: () => this.families, hasTypeFamily: (f) => this.families.includes(f) };
    if (n === "minecraft:inventory") return this.inv ? { container: this.inv } : undefined;
    if (n === "minecraft:equippable") return { getEquipment: (s) => this.equip?.[s], setEquipment: (s, it) => { this.equip = this.equip || {}; this.equip[s] = it; } };
    if (n === "minecraft:knockback_resistance") return { value: 0.4 };
    if (n === "minecraft:rideable") return { getRiders: () => [], addRider: () => true, ejectRiders: () => {} };
    if (n === "minecraft:riding") return undefined;
    return undefined;
  }
}

export class Player extends Entity {
  constructor(loc, dim) {
    super("minecraft:player", loc, dim);
    this.name = "Tester";
    this.inv = new Container(36);
    this.selectedSlotIndex = 0;
    this.isFlying = false;
    this.isJumping = false;
    this.commandPermissionLevel = 2;
    this.titles = [];
    this.onScreenDisplay = { setTitle: (t, o) => { this.titles.push(t + " " + (o?.subtitle ?? "")); }, setActionBar: (s) => { this.lastActionBar = s; } };
    this.camera = { fade: () => {}, setCamera: () => {}, clear: () => {} };
    this.inputInfo = { getMovementVector: () => this.mv ?? { x: 0, y: 0 }, getButtonState: (b) => (this.buttons?.[b] ? "Pressed" : "Released") };
    this.hp.currentValue = this.hp.effectiveMax = 20;
    this.messages = [];
  }
  sendMessage(m) { this.messages.push(m); }
  playSound() {}
  getGameMode() { return "Survival"; }
  setGameMode() {}
  spawnParticle() {}
}

class Dimension {
  constructor(id) { this.id = id; this.blocks = new Map(); }
  key(l) { return `${Math.floor(l.x)},${Math.floor(l.y)},${Math.floor(l.z)}`; }
  getBlock(l) { if (!isFinite(l.x + l.y + l.z)) throw new Error("bad block loc"); const k = this.key(l); let b = this.blocks.get(k); if (!b) { b = new Block(this, { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) }, l.y < 63 ? "minecraft:stone" : "minecraft:air"); this.blocks.set(k, b); } return b; }
  getTopmostBlock(xz) { return this.getBlock({ x: xz.x, y: 62, z: xz.z }); }
  getBlockFromRay() { return undefined; }
  getEntitiesFromRay() { return []; }
  spawnEntity(type, loc) { if (!isFinite(loc.x + loc.y + loc.z)) throw new Error("bad spawn loc"); const e = new Entity(type, loc, this); return e; }
  spawnItem() {}
  spawnParticle(id, loc) { if (!isFinite(loc.x + loc.y + loc.z)) throw new Error("bad particle loc " + id); }
  playSound() {}
  setWeather() {}
  runCommand() { return { successCount: 1 }; }
  fillBlocks(v, b) { if (!v.from || !isFinite(v.from.x + v.to.z)) throw new Error("bad fill"); return {}; }
  getBiome() { return { id: "minecraft:plains" }; }
  getEntities(o = {}) {
    return [...entities.values()].filter((e) => e.dimension === this && e.isValid && (!o.type || e.typeId === o.type) &&
      (!o.excludeTypes || !o.excludeTypes.includes(e.typeId)) && (!o.tags || o.tags.every((t) => e.tags.has(t))) && (!o.families || o.families.some((f) => e.families.includes(f))) &&
      (!o.excludeFamilies || !o.excludeFamilies.some((f) => e.families.includes(f))) &&
      (!o.location || !o.maxDistance || Math.hypot(e.location.x - o.location.x, e.location.y - o.location.y, e.location.z - o.location.z) <= o.maxDistance));
  }
  getPlayers(o = {}) { return this.getEntities(o).filter((e) => e.typeId === "minecraft:player"); }
}

const dims = { "minecraft:overworld": new Dimension("minecraft:overworld"), "minecraft:nether": new Dimension("minecraft:nether"), "minecraft:the_end": new Dimension("minecraft:the_end") };

export const world = {
  afterEvents: signalBag(),
  beforeEvents: signalBag(),
  getAllPlayers() { return [...entities.values()].filter((e) => e.typeId === "minecraft:player" && e.isValid); },
  getPlayers() { return this.getAllPlayers(); },
  getDimension(id) { return dims[id] ?? dims["minecraft:overworld"]; },
  getEntity(id) { return entities.get(id); },
  getDynamicProperty(k) { return dynamic.get(k); },
  setDynamicProperty(k, v) { if (typeof v === "string" && v.length > 32767) throw new Error("dynamic property too long " + k); dynamic.set(k, v); },
  getDefaultSpawnLocation() { return { x: 0, y: 64, z: 0 }; },
  getTimeOfDay() { return 18000; },
  setTimeOfDay() {},
  getMoonPhase() { return 0; },
  getDay() { return 3; },
  sendMessage() {},
};

export { dims, entities, Container };
