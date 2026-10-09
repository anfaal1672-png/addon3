"""Static checks across both packs: every referenced file/identifier must exist."""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RP = os.path.join(ROOT, "packs", "DragonBall_RP")
BP = os.path.join(ROOT, "packs", "DragonBall_BP")
errors = []


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def walk(base, ext=".json"):
    for r, _, files in os.walk(base):
        for f in files:
            if f.endswith(ext):
                yield os.path.join(r, f)


# 1. every JSON parses
for pack in (RP, BP):
    for f in walk(pack):
        try:
            load(f)
        except Exception as e:  # noqa
            errors.append(f"invalid json {f}: {e}")

# 2. geometry identifiers
geos = set()
for f in walk(os.path.join(RP, "models")):
    for g in load(f).get("minecraft:geometry", []):
        geos.add(g["description"]["identifier"])
vanilla_geo = {"geometry.humanoid.custom", "geometry.cape", "geometry.humanoid.armor.chestplate", "geometry.humanoid.armor.leggings",
               "geometry.humanoid.armor.boots", "geometry.humanoid.armor.helmet", "geometry.humanoid.customSlim"}


def tex_exists(path):
    return os.path.exists(os.path.join(RP, path + ".png")) or path.startswith("textures/entity/steve") or path.startswith("textures/entity/cape") \
        or path.startswith("textures/misc")


rcs = load(os.path.join(RP, "render_controllers", "dbz.render_controllers.json"))["render_controllers"]
anims = load(os.path.join(RP, "animations", "dbz.animation.json"))["animations"]
ctrls = load(os.path.join(RP, "animation_controllers", "dbz.animation_controllers.json"))["animation_controllers"]

for f in walk(os.path.join(RP, "entity")):
    d = load(f)["minecraft:client_entity"]["description"]
    for k, t in d.get("textures", {}).items():
        if not tex_exists(t):
            errors.append(f"{os.path.basename(f)}: missing texture {t}")
    for k, g in d.get("geometry", {}).items():
        if g not in geos and g not in vanilla_geo:
            errors.append(f"{os.path.basename(f)}: missing geometry {g}")
    for entry in d.get("render_controllers", []):
        name = entry if isinstance(entry, str) else list(entry.keys())[0]
        if name.startswith("controller.render.dbz"):
            if name not in rcs:
                errors.append(f"{os.path.basename(f)}: missing rc {name}")
                continue
            rc = rcs[name]
            blob = json.dumps(rc)
            for kind, key in (("Geometry", "geometry"), ("Texture", "textures"), ("Material", "materials")):
                for ref in re.findall(kind + r"\.([A-Za-z0-9_]+)", blob):
                    if ref not in d.get(key, {}):
                        errors.append(f"{os.path.basename(f)}: rc {name} uses {kind}.{ref} not defined")
    for k, a in d.get("animations", {}).items():
        if a.startswith("animation.dbz") and a not in anims:
            errors.append(f"{os.path.basename(f)}: missing animation {a}")
        if a.startswith("controller.animation.dbz") and a not in ctrls:
            errors.append(f"{os.path.basename(f)}: missing controller {a}")
    for entry in d.get("scripts", {}).get("animate", []):
        name = entry if isinstance(entry, str) else list(entry.keys())[0]
        if name not in d.get("animations", {}):
            errors.append(f"{os.path.basename(f)}: animate uses unknown key {name}")

# controllers reference animation keys that must exist on users (player & fighter)
for cname, c in ctrls.items():
    for sname, st in c["states"].items():
        for a in st.get("animations", []):
            for f in ("entity/player.entity.json", "entity/dbz_fighter.entity.json"):
                d = load(os.path.join(RP, f))["minecraft:client_entity"]["description"]
                if a not in d["animations"]:
                    errors.append(f"{f}: controller {cname} needs animation key {a}")

# 3. attachables
for f in walk(os.path.join(RP, "attachables")):
    d = load(f)["minecraft:attachable"]["description"]
    for t in d["textures"].values():
        if not tex_exists(t):
            errors.append(f"{os.path.basename(f)}: missing texture {t}")
    for g in d["geometry"].values():
        if g not in geos and g not in vanilla_geo:
            errors.append(f"{os.path.basename(f)}: missing geometry {g}")

# 4. items <-> icons, blocks <-> terrain
item_tex = load(os.path.join(RP, "textures", "item_texture.json"))["texture_data"]
for k, v in item_tex.items():
    if not tex_exists(v["textures"]):
        errors.append(f"item texture missing {v['textures']}")
items = set()
for f in walk(os.path.join(BP, "items")):
    it = load(f)["minecraft:item"]
    items.add(it["description"]["identifier"])
    icon = it["components"].get("minecraft:icon")
    if icon not in item_tex:
        errors.append(f"item {it['description']['identifier']} icon {icon} not in item_texture.json")
terrain = load(os.path.join(RP, "textures", "terrain_texture.json"))["texture_data"]
for k, v in terrain.items():
    if not tex_exists(v["textures"]):
        errors.append(f"terrain texture missing {v['textures']}")
blocks = set()
for f in walk(os.path.join(BP, "blocks")):
    b = load(f)["minecraft:block"]
    blocks.add(b["description"]["identifier"])
    c = b["components"]
    for face, mi in c.get("minecraft:material_instances", {}).items():
        if mi["texture"] not in terrain:
            errors.append(f"block {b['description']['identifier']} texture {mi['texture']} missing")
    g = c.get("minecraft:geometry")
    if g and g not in geos and not g.startswith("minecraft:"):
        errors.append(f"block geometry {g} missing")
    loot = c.get("minecraft:loot")
    if loot and not os.path.exists(os.path.join(BP, loot)):
        errors.append(f"loot {loot} missing")

    if "minecraft:material_instances" in c and "minecraft:geometry" not in c:
        errors.append(f"block {b['description']['identifier']} has material instances without geometry")

# 4b. shaped/shapeless recipes need unlock data
for f in walk(os.path.join(BP, "recipes")):
    r = load(f)
    for k in ("minecraft:recipe_shaped", "minecraft:recipe_shapeless"):
        if k in r and "unlock" not in r[k]:
            errors.append(f"recipe {os.path.basename(f)} missing unlock")

# 4c. fighter geometries must not use a bone named "head" (locator clash)
for g in load(os.path.join(RP, "models", "entity", "dbz_characters.geo.json"))["minecraft:geometry"]:
    if any(b["name"] == "head" for b in g["bones"]):
        errors.append(f"{g['description']['identifier']} still has a 'head' bone")

# 5. sounds
sd = load(os.path.join(RP, "sounds", "sound_definitions.json"))["sound_definitions"]
for k, v in sd.items():
    for s in v["sounds"]:
        if not os.path.exists(os.path.join(RP, s["name"] + ".ogg")):
            errors.append(f"sound file missing {s['name']}")

# 6. scripts reference ids that exist
script_text = ""
for f in walk(os.path.join(BP, "scripts"), ".js"):
    with open(f, encoding="utf-8") as fh:
        script_text += fh.read()
for ref in set(re.findall(r'"(dbz\.[a-z_]+)"', script_text)):
    if ref not in sd:
        errors.append(f"script plays unknown sound {ref}")
particles = set()
for f in walk(os.path.join(RP, "particles")):
    particles.add(load(f)["particle_effect"]["description"]["identifier"])
for ref in set(re.findall(r'"(dbz:[a-z_]+)"', script_text)):
    known = items | blocks | particles | {"dbz:fighter", "dbz:ki_blast", "dbz:beam", "dbz:dragon", "dbz:dinosaur", "dbz:kintoun",
                                          "dbz:aircar", "dbz:spaceship", "dbz:interact", "dbz:menu", "dbz:dbmenu", "dbz:dbkit", "dbz:dbhelp"}
    props = {"dbz:data", "dbz:settings", "dbz:sites", "dbz:balls", "dbz:namekChunks", "dbz:gravRooms", "dbz:capsuleHouses",
             "dbz:pl", "dbz:cid", "dbz:melee", "dbz:role", "dbz:boss", "dbz:owner", "dbz:home", "dbz:char", "dbz:scale", "dbz:aura",
             "dbz:pose", "dbz:spark", "dbz:hair", "dbz:hair_style", "dbz:body", "dbz:model", "dbz:tail", "dbz:color", "dbz:shape",
             "dbz:size", "dbz:len", "dbz:width", "dbz:pitch", "dbz:yaw", "dbz:spiral", "dbz:variant", "dbz:freeze", "dbz:unfreeze",
             "dbz:fly_on", "dbz:fly_off", "dbz:boss_on", "dbz:boss_off", "dbz:mob", "dbz:region", "dbz:summon",
             "dbz:bt_clear", "dbz:battle", "dbz:prev_role", "dbz:orig_name", "dbz:dbbattle"}
    if ref not in known and ref not in props and not ref.endswith("_") and not ref.startswith("dbz:role_") and not ref.startswith("dbz:size_"):
        errors.append(f"script references unknown id {ref}")

# 7. entity properties limits
for f in walk(os.path.join(BP, "entities")):
    e = load(f)["minecraft:entity"]
    props = e["description"].get("properties", {})
    if len(props) > 32:
        errors.append(f"{f}: too many properties")
    groups = set(e.get("component_groups", {}).keys())
    for ev, body in e.get("events", {}).items():
        for act in ("add", "remove"):
            for g in body.get(act, {}).get("component_groups", []):
                if g not in groups:
                    errors.append(f"{os.path.basename(f)} event {ev} references missing group {g}")

# 8. lang strings for every item/block
lang = open(os.path.join(RP, "texts", "ja_JP.lang"), encoding="utf-8").read()
for i in items:
    if f"item.{i}.name" not in lang:
        errors.append(f"lang missing for {i}")

if errors:
    print("\n".join(sorted(set(errors))))
    print(f"\n{len(set(errors))} problem(s)")
    sys.exit(1)
print(f"OK: {len(geos)} geometries, {len(items)} items, {len(blocks)} blocks, {len(sd)} sounds, {len(particles)} particles")
