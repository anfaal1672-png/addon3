"""Static checks for the battle addon: every file, id and event the packs and scripts point at must exist."""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RP = os.path.join(ROOT, "packs", "DragonBattle_RP")
BP = os.path.join(ROOT, "packs", "DragonBattle_BP")
errors = []


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def walk(base, ext=".json"):
    for r, _, files in os.walk(base):
        for f in files:
            if f.endswith(ext):
                yield os.path.join(r, f)


for pack in (RP, BP):
    for f in walk(pack):
        try:
            load(f)
        except Exception as e:  # noqa
            errors.append(f"invalid json {f}: {e}")

# nothing from the main addon's namespace may leak in (the two must install side by side)
for pack in (RP, BP):
    for f in list(walk(pack)) + list(walk(pack, ".js")) + list(walk(pack, ".lang")):
        if "dbz" in open(f, encoding="utf-8").read():
            errors.append(f"'dbz' found in {os.path.relpath(f, ROOT)}")

geos = set()
for f in walk(os.path.join(RP, "models")):
    for g in load(f).get("minecraft:geometry", []):
        geos.add(g["description"]["identifier"])
rcs = load(os.path.join(RP, "render_controllers", "dbb.render_controllers.json"))["render_controllers"]
anims = load(os.path.join(RP, "animations", "dbb.animation.json"))["animations"]
ctrls = load(os.path.join(RP, "animation_controllers", "dbb.animation_controllers.json"))["animation_controllers"]


def tex_exists(path):
    return os.path.exists(os.path.join(RP, path + ".png"))


for f in walk(os.path.join(RP, "entity")):
    d = load(f)["minecraft:client_entity"]["description"]
    name = os.path.basename(f)
    for t in d.get("textures", {}).values():
        if not tex_exists(t):
            errors.append(f"{name}: missing texture {t}")
    for g in d.get("geometry", {}).values():
        if g not in geos:
            errors.append(f"{name}: missing geometry {g}")
    for entry in d.get("render_controllers", []):
        rc = entry if isinstance(entry, str) else list(entry.keys())[0]
        if rc not in rcs:
            errors.append(f"{name}: missing render controller {rc}")
            continue
        blob = json.dumps(rcs[rc])
        for kind, key in (("Geometry", "geometry"), ("Texture", "textures"), ("Material", "materials")):
            for ref in re.findall(kind + r"\.([A-Za-z0-9_]+)", blob):
                if ref not in d.get(key, {}):
                    errors.append(f"{name}: {rc} uses {kind}.{ref} which the entity does not define")
    for a in d.get("animations", {}).values():
        if a.startswith("animation.dbb") and a not in anims:
            errors.append(f"{name}: missing animation {a}")
        if a.startswith("controller.animation.dbb") and a not in ctrls:
            errors.append(f"{name}: missing controller {a}")
    for entry in d.get("scripts", {}).get("animate", []):
        k = entry if isinstance(entry, str) else list(entry.keys())[0]
        if k not in d.get("animations", {}):
            errors.append(f"{name}: animate uses unknown key {k}")

for f in walk(os.path.join(RP, "particles")):
    tex = load(f)["particle_effect"]["description"]["basic_render_parameters"]["texture"]
    if not tex_exists(tex):
        errors.append(f"particle texture missing {tex}")

item_tex = load(os.path.join(RP, "textures", "item_texture.json"))["texture_data"]
for v in item_tex.values():
    if not tex_exists(v["textures"]):
        errors.append(f"item texture missing {v['textures']}")
items = set()
for f in walk(os.path.join(BP, "items")):
    it = load(f)["minecraft:item"]
    items.add(it["description"]["identifier"])
    if it["components"].get("minecraft:icon") not in item_tex:
        errors.append(f"{it['description']['identifier']}: icon not in item_texture.json")

sd = load(os.path.join(RP, "sounds", "sound_definitions.json"))["sound_definitions"]
for k, v in sd.items():
    for s in v["sounds"]:
        if not os.path.exists(os.path.join(RP, s["name"] + ".ogg")):
            errors.append(f"sound file missing for {k}: {s['name']}")

particles = {load(f)["particle_effect"]["description"]["identifier"] for f in walk(os.path.join(RP, "particles"))}
fighter = load(os.path.join(BP, "entities", "dbb_fighter.json"))["minecraft:entity"]
events = set(fighter["events"].keys())
groups = set(fighter["component_groups"].keys())
for ev, body in fighter["events"].items():
    for act in ("add", "remove"):
        for g in body.get(act, {}).get("component_groups", []):
            if g not in groups:
                errors.append(f"fighter event {ev} references missing group {g}")
props = set()
for f in walk(os.path.join(BP, "entities")):
    props |= set(load(f)["minecraft:entity"]["description"].get("properties", {}).keys())

script = ""
for f in walk(os.path.join(BP, "scripts"), ".js"):
    script += open(f, encoding="utf-8").read()
for ref in set(re.findall(r'"(dbb\.[a-z_]+)"', script)):
    if ref not in sd:
        errors.append(f"script plays unknown sound {ref}")
for ref in set(re.findall(r'"(dbb:[a-z_0-9]+)"', script)):
    known = items | particles | events | props | {"dbb:fighter", "dbb:ki_blast", "dbb:beam"}
    misc = {"dbb:settings", "dbb:records", "dbb:last", "dbb:cid", "dbb:melee", "dbb:maxhp", "dbb:pl", "dbb:welcomed",
            "dbb:battle", "dbb:bkit", "dbb:bstop", "dbb:bhelp"}
    if ref in known or ref in misc or ref.endswith("_"):
        continue
    errors.append(f"script references unknown id {ref}")
# event names built in scripts from templates
for tmpl in set(re.findall(r'`(dbb:[a-z_]+)\$\{', script)) - {"dbb:stage_"}:
    if not any(e.startswith(tmpl) for e in events | items):
        errors.append(f"script builds ids from {tmpl}… but none exist")
# every team / duel slot the scripts can produce has its chase group
teams = json.loads(re.search(r"export const TEAMS = (\[.*?\]);", open(os.path.join(BP, "scripts", "gen", "catalog.js"), encoding="utf-8").read()).group(1))
for t in teams:
    if f"dbb:bt_{t}" not in events:
        errors.append(f"no chase event for team {t}")
for k in range(1, 9):
    if f"dbb:hunt_{k}" not in events:
        errors.append(f"no chase event for duel slot {k}")

lang = open(os.path.join(RP, "texts", "ja_JP.lang"), encoding="utf-8").read()
for i in items:
    if f"item.{i}.name" not in lang:
        errors.append(f"lang missing for {i}")

if errors:
    print("\n".join(sorted(set(errors))))
    print(f"\n{len(set(errors))} problem(s)")
    sys.exit(1)
print(f"OK: {len(geos)} geometries, {len(items)} items, {len(sd)} sounds, {len(particles)} particles, {len(events)} fighter events")
