"""Builds the Dragon Ball battle addon (characters only, fights to watch) from the main addon's generated packs.

The main generator (build.py) must have run first: character models, textures, aura, ki visuals, particles and
sounds are copied from packs/DragonBall_RP with every "dbz" renamed to "dbb", so both addons can be installed
side by side. The behaviour pack (fighter entity, items) is generated here; the scripts are hand-written.

Usage: python3 tools/gen/build_battle.py
"""
import json
import os
import re
import shutil
import sys
import zipfile

sys.path.insert(0, os.path.dirname(__file__))
from PIL import ImageDraw  # noqa: E402
from common import ROOT, write_json, write_text, stable_uuid  # noqa: E402
import characters as CH  # noqa: E402
import battle_icons as BI  # noqa: E402
import battle_sounds as BS  # noqa: E402
import sounds as SND  # noqa: E402
import icons as IC  # noqa: E402

SRC_RP = os.path.join(ROOT, "packs", "DragonBall_RP")
SRC_BP = os.path.join(ROOT, "packs", "DragonBall_BP")
RP = os.path.join(ROOT, "packs", "DragonBattle_RP")
BP = os.path.join(ROOT, "packs", "DragonBattle_BP")
VERSION = [1, 0, 0]
MIN_ENGINE = [1, 26, 30]
ITEM_FMT = "1.21.60"

TEAMS = ["red", "blue", "green", "yellow", "purple", "orange", "cyan", "white"]
SLOTS = 8
FLAG_TEAMS = ["red", "blue", "green", "yellow"]
LANG = {}


def rename(text):
    return text.replace("dbz", "dbb")


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def copy_text(src_rel, dst_rel=None):
    text = rename(read(os.path.join(SRC_RP, src_rel)))
    write_text(os.path.join(RP, rename(dst_rel or src_rel)), text)
    return text


def copy_file(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)


def clean():
    keep = os.path.join(BP, "scripts")
    for pack in (RP, BP):
        if not os.path.isdir(pack):
            continue
        for name in os.listdir(pack):
            full = os.path.join(pack, name)
            if full == keep:
                gen = os.path.join(full, "gen")
                if os.path.isdir(gen):
                    shutil.rmtree(gen)
                continue
            if name == "sounds" and pack == RP:
                continue  # keep the rendered battle sounds; they are only re-rendered when missing
            shutil.rmtree(full) if os.path.isdir(full) else os.remove(full)


# =============================================================================================== resource pack
def build_rp():
    copied = []
    for rel in ("models/entity/dbz_characters.geo.json", "models/entity/dbz_aura.geo.json", "models/entity/dbz_ki.geo.json",
                "entity/dbz_fighter.entity.json", "entity/dbz_ki_blast.entity.json", "entity/dbz_beam.entity.json",
                "animations/dbz.animation.json", "animation_controllers/dbz.animation_controllers.json",
                "render_controllers/dbz.render_controllers.json"):
        copied.append(copy_text(rel))
    for fn in sorted(os.listdir(os.path.join(SRC_RP, "particles"))):
        copied.append(copy_text(f"particles/{fn}"))
    # every texture the copied files point at
    for path in sorted(set(re.findall(r'"(textures/[^"]+)"', "\n".join(copied)))):
        src = os.path.join(SRC_RP, path.replace("dbb", "dbz") + ".png")
        if os.path.exists(src):
            copy_file(src, os.path.join(RP, path + ".png"))
    # spawn egg icons and the shared item atlas
    item_tex = {}
    for iid, _name, icon, _comps, _cat in ITEMS:
        rel = f"textures/items/dbb/{iid}"
        if isinstance(icon, str):
            copy_file(os.path.join(SRC_RP, icon + ".png"), os.path.join(RP, rel + ".png"))
        else:
            save_icon(icon, rel)
        item_tex[f"dbb_{iid}"] = {"textures": rel}
    write_json(os.path.join(RP, "textures/item_texture.json"),
               {"resource_pack_name": "dbb", "texture_name": "atlas.items", "texture_data": item_tex})
    # sounds: the main addon's set plus the battle extras
    defs = json.loads(rename(read(os.path.join(SRC_RP, "sounds/sound_definitions.json"))))["sound_definitions"]
    for fn in os.listdir(os.path.join(SRC_RP, "sounds/dbz")):
        copy_file(os.path.join(SRC_RP, "sounds/dbz", fn), os.path.join(RP, "sounds/dbb", fn))
    for name, (fn, vol) in BS.SOUNDS.items():
        out = os.path.join(RP, "sounds/dbb", f"{name}.ogg")
        if not os.path.exists(out):
            SND.write_ogg(fn(), out)
        defs[f"dbb.{name}"] = {"category": "player", "max_distance": 96.0 if name in ("gong", "cheer", "rumble") else 64.0,
                               "sounds": [{"name": f"sounds/dbb/{name}", "volume": vol, "load_on_low_memory": True}]}
    write_json(os.path.join(RP, "sounds/sound_definitions.json"), {"format_version": "1.20.20", "sound_definitions": defs})


def save_icon(img, rel):
    os.makedirs(os.path.dirname(os.path.join(RP, rel)), exist_ok=True)
    img.save(os.path.join(RP, rel + ".png"))


# =============================================================================================== behaviour pack
def build_entities():
    for name in ("dbz_ki_blast", "dbz_beam"):
        write_text(os.path.join(BP, "entities", rename(name) + ".json"), rename(read(os.path.join(SRC_BP, "entities", name + ".json"))))
    f = json.loads(rename(read(os.path.join(SRC_BP, "entities", "dbz_fighter.json"))))
    ent = f["minecraft:entity"]
    groups = ent["component_groups"]
    events = ent["events"]
    # roles: idle (spawned, waiting) and battle; nothing from the story side
    for g in [g for g in groups if g.startswith("dbb:role_") or g.startswith("dbb:bt_") or g.startswith("dbb:hunt_") or g == "dbb:mob"]:
        del groups[g]
    for e in [e for e in events if e.startswith("dbb:role_") or e.startswith("dbb:bt_") or e.startswith("dbb:hunt_")
              or e in ("dbb:mob", "dbb:interacted")]:
        del events[e]
    groups["dbb:role_idle"] = {
        "minecraft:type_family": {"family": ["dbb_fighter", "dbb_idle", "mob"]},
        "minecraft:behavior.look_at_player": {"priority": 2, "look_distance": 10, "probability": 0.6},
        "minecraft:behavior.random_look_around": {"priority": 5},
        "minecraft:behavior.random_stroll": {"priority": 6, "speed_multiplier": 0.5, "xz_dist": 3, "interval": 240},
        "minecraft:damage_sensor": {"triggers": {"cause": "all", "deals_damage": "no"}}}
    groups["dbb:role_battle"] = {
        "minecraft:type_family": {"family": ["dbb_fighter", "dbb_battler", "mob"]},
        "minecraft:behavior.hurt_by_target": {"priority": 1, "entity_types": {"filters": {
            "test": "is_family", "subject": "other", "value": "dbb_battler"}}},
        "minecraft:behavior.melee_box_attack": {"priority": 3, "speed_multiplier": 1.4, "track_target": True},
        "minecraft:attack": {"damage": 3},
        "minecraft:behavior.random_stroll": {"priority": 8, "speed_multiplier": 0.8}}
    roles = ["idle", "battle"]
    for r in roles:
        events[f"dbb:role_{r}"] = {"add": {"component_groups": [f"dbb:role_{r}"]},
                                   "remove": {"component_groups": [f"dbb:role_{o}" for o in roles if o != r]}}
    chase = []
    for t in TEAMS:
        chase.append(f"dbb:bt_{t}")
        groups[f"dbb:bt_{t}"] = {"minecraft:behavior.nearest_attackable_target": {
            "priority": 2, "must_see": False, "reselect_targets": True, "within_radius": 64,
            "entity_types": [{"filters": {"all_of": [{"test": "has_tag", "subject": "other", "value": "dbb_bt"},
                                                     {"test": "has_tag", "subject": "other", "operator": "!=", "value": f"dbb_t_{t}"}]},
                              "max_dist": 64}]}}
    for k in range(1, SLOTS + 1):
        chase.append(f"dbb:hunt_{k}")
        groups[f"dbb:hunt_{k}"] = {"minecraft:behavior.nearest_attackable_target": {
            "priority": 2, "must_see": False, "reselect_targets": True, "within_radius": 64,
            "entity_types": [{"filters": {"test": "has_tag", "subject": "other", "value": f"dbb_prey_{k}"}, "max_dist": 64}]}}
    for g in chase:
        events[g] = {"add": {"component_groups": [g]}, "remove": {"component_groups": [o for o in chase if o != g]}}
    events["dbb:bt_clear"] = {"remove": {"component_groups": chase}}
    events["minecraft:entity_spawned"] = {"add": {"component_groups": ["dbb:size_normal", "dbb:hp_20", "dbb:role_idle"]}}
    comps = ent["components"]
    comps["minecraft:type_family"] = {"family": ["dbb_fighter", "mob"]}
    comps["minecraft:knockback_resistance"] = {"value": 0.15}
    comps["minecraft:damage_sensor"] = {"triggers": [
        {"cause": c, "deals_damage": "no"} for c in ("fall", "suffocation", "fly_into_wall", "drowning", "lava", "fire", "fire_tick")]}
    comps["minecraft:movement"] = {"value": 0.34}
    write_json(os.path.join(BP, "entities", "dbb_fighter.json"), f)


ITEMS = []  # (id, name, icon (image or source texture path), components, category)


def item(iid, name, icon, comps=None, cat="equipment", stack=1, group=None):
    c = {"minecraft:icon": f"dbb_{iid}", "minecraft:display_name": {"value": name}, "minecraft:max_stack_size": stack}
    c.update(comps or {})
    ITEMS.append((iid, name, icon, c, (cat, group)))


def camera_icon():
    img = IC.canvas()
    d = ImageDraw.Draw(img)
    d.rectangle((5, 10, 25, 24), fill=(60, 64, 80, 255))
    d.rectangle((9, 7, 15, 10), fill=(60, 64, 80, 255))
    IC.shaded_circle(d, 15, 17, 5.5, (90, 170, 240))
    d.rectangle((21, 12, 23, 13), fill=(240, 200, 60, 255))
    return IC.outline(img)


def control_icon():
    img = IC.canvas()
    d = ImageDraw.Draw(img)
    IC.shaded_circle(d, 16, 16, 12, (230, 80, 70), hl=False)
    d.rectangle((11, 10, 14, 22), fill=(255, 255, 255, 255))
    d.rectangle((18, 10, 21, 22), fill=(255, 255, 255, 255))
    return IC.outline(img)


def define_items():
    item("menu", "バトルメニュー", BI.battle_menu_icon(), {"minecraft:cooldown": {"category": "dbb_menu", "duration": 0.4}})
    item("camera", "カメラ切り替え（しゃがみ＋使用で自由視点）", camera_icon(), {"minecraft:cooldown": {"category": "dbb_cam", "duration": 0.3}})
    item("control", "試合コントローラー（一時停止／しゃがみ＋使用で終了）", control_icon(),
         {"minecraft:cooldown": {"category": "dbb_ctl", "duration": 0.4}})
    for t, name in zip(FLAG_TEAMS, ("赤", "青", "緑", "黄")):
        item(f"team_{t}", f"{name}チームの旗（叩いて加入／しゃがみ叩きで外す）", BI.flag_icon(t))
    item("duel", "一騎打ちの杖（2体を順に叩く）", BI.wand_icon("duel"))
    item("heal", "回復の杖", BI.wand_icon("heal"))
    item("kill", "撃破の杖", BI.wand_icon("kill"))
    for c in CH.CHARACTERS:
        if c["id"] == "training_dummy":
            continue
        item(f"egg_{c['id']}", f"{c['name']}のスポーンエッグ", f"textures/items/dbz/egg_{c['id']}", None, "nature", 64,
             "minecraft:itemGroup.name.mobEgg")


def write_items():
    for iid, name, _icon, comps, (cat, group) in ITEMS:
        mc = {"category": cat}
        if group:
            mc["group"] = group
        write_json(os.path.join(BP, "items", f"{iid}.json"), {"format_version": ITEM_FMT, "minecraft:item": {
            "description": {"identifier": f"dbb:{iid}", "menu_category": mc}, "components": comps}})
        LANG[f"item.dbb:{iid}.name"] = name
        LANG[f"item.dbb:{iid}"] = name


def write_catalog():
    text = rename(read(os.path.join(SRC_BP, "scripts", "gen", "catalog.js")))
    text = text.replace("Generated by tools/gen/build.py", "Generated by tools/gen/build_battle.py")
    text += "\nexport const TEAMS = " + json.dumps(TEAMS) + ";\n"
    write_text(os.path.join(BP, "scripts", "gen", "catalog.js"), text)


def write_lang():
    LANG["pack.name"] = "ドラゴンボール バトル"
    LANG["pack.description"] = "キャラクター同士の戦いを観るアドオン"
    LANG["entity.dbb:fighter.name"] = "戦士"
    LANG["entity.dbb:ki_blast.name"] = "気弾"
    LANG["entity.dbb:beam.name"] = "気功波"
    body = "\n".join(f"{k}={v}" for k, v in LANG.items()) + "\n"
    for pack in (RP, BP):
        for code in ("ja_JP", "en_US"):
            write_text(os.path.join(pack, "texts", f"{code}.lang"), body)
        write_json(os.path.join(pack, "texts", "languages.json"), ["ja_JP", "en_US"])


def manifests():
    rp_uuid = stable_uuid("dbb-rp-header")
    bp_uuid = stable_uuid("dbb-bp-header")
    write_json(os.path.join(RP, "manifest.json"), {
        "format_version": 2,
        "header": {"name": "§6ドラゴンボール §cバトル §fリソース", "description": "キャラクター同士の戦いを観るアドオン（個人用）",
                   "uuid": rp_uuid, "version": VERSION, "min_engine_version": MIN_ENGINE},
        "modules": [{"type": "resources", "uuid": stable_uuid("dbb-rp-module"), "version": VERSION}],
        "dependencies": [{"uuid": bp_uuid, "version": VERSION}]})
    write_json(os.path.join(BP, "manifest.json"), {
        "format_version": 2,
        "header": {"name": "§6ドラゴンボール §cバトル §fビヘイビア", "description": "キャラクター同士の戦いを観るアドオン（個人用）",
                   "uuid": bp_uuid, "version": VERSION, "min_engine_version": MIN_ENGINE},
        "modules": [{"type": "data", "uuid": stable_uuid("dbb-bp-data"), "version": VERSION},
                    {"type": "script", "language": "javascript", "uuid": stable_uuid("dbb-bp-script"), "version": VERSION,
                     "entry": "scripts/main.js"}],
        "dependencies": [{"uuid": rp_uuid, "version": VERSION},
                         {"module_name": "@minecraft/server", "version": "2.4.0"},
                         {"module_name": "@minecraft/server-ui", "version": "2.0.0"}]})
    icon = BI.battle_menu_icon().resize((256, 256), 0)
    icon.save(os.path.join(RP, "pack_icon.png"))
    icon.save(os.path.join(BP, "pack_icon.png"))


def package():
    dist = os.path.join(ROOT, "dist")
    os.makedirs(dist, exist_ok=True)
    out = os.path.join(dist, "DragonBattle.mcaddon")
    if os.path.exists(out):
        os.remove(out)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for pack in (BP, RP):
            base = os.path.basename(pack)
            for root, _, files in os.walk(pack):
                for fn in sorted(files):
                    full = os.path.join(root, fn)
                    z.write(full, os.path.join(base, os.path.relpath(full, pack)))
    return out


def main():
    if not os.path.isdir(os.path.join(SRC_RP, "models")):
        sys.exit("run tools/gen/build.py first (the battle addon copies its generated assets)")
    clean()
    define_items()
    build_rp()
    build_entities()
    write_items()
    write_catalog()
    write_lang()
    manifests()
    if "--no-package" not in sys.argv:
        print("packaged:", package())


if __name__ == "__main__":
    main()
