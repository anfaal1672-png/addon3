"""Builds both packs (resource + behavior) except the hand-written scripts, then packages a .mcaddon.

Usage: python3 tools/gen/build.py
"""
import copy
import json
import os
import shutil
import sys
import zipfile

sys.path.insert(0, os.path.dirname(__file__))
from common import ROOT, BP, RP, write_json, write_text, stable_uuid, LANG  # noqa: E402
from model import geo_file, SCALE  # noqa: E402
from humanoid import build_humanoid  # noqa: E402
import eggs as EG  # noqa: E402
import characters as CH  # noqa: E402
import player_visuals as PV  # noqa: E402
import misc_models as MM  # noqa: E402
import icons as IC  # noqa: E402
import particles as PT  # noqa: E402
import sounds as SND  # noqa: E402

VANILLA = os.path.join(ROOT, "tools", "vanilla")
VERSION = [1, 0, 5]
MIN_ENGINE = [1, 26, 30]
# True when there is no real entity to read properties from: UI previews, and persona renders that have no
# actor at all. query.property / query.has_property log "does not have an actor" there, while query.is_alive
# (which the vanilla player definition evaluates every frame) quietly returns 0.
NO_ACTOR = "(query.is_in_ui || !query.is_alive)"
ENTITY_FMT = "1.21.50"
ITEM_FMT = "1.21.60"
BLOCK_FMT = "1.21.90"

HP_TIERS = [20, 30, 40, 60, 80, 100, 150, 200, 300, 400, 500, 700, 1000, 1500, 2000, 3000, 4000, 6000, 8000]
SIZES = {
    "small": (0.5, 1.3), "normal": (0.6, 1.9), "big": (0.8, 2.2), "huge": (1.0, 2.6),
    "fat": (0.9, 1.9), "tall": (0.6, 2.3), "giant": (2.6, 6.0),
}
POSES = ["none", "charge", "beam_charge", "beam_fire", "one_hand", "overhead", "forehead", "fly", "guard",
         "transform", "meditate", "rush", "fusion", "down", "fly_fast", "throw"]


def save_png(img, rel_path, base=RP):
    path = os.path.join(base, rel_path + ".png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)


# =============================================================================================== poses
def pose_animations(prefix):
    tx = "query.target_x_rotation"
    shake = "math.sin(query.life_time * 2200) * 0.35"
    A = {
        "charge": {"rightarm": {"rotation": [15, 0, -20]}, "leftarm": {"rotation": [15, 0, 20]},
                   "body": {"rotation": [8, 0, 0]}, "rightleg": {"rotation": [0, 0, -8]}, "leftleg": {"rotation": [0, 0, 8]},
                   "root": {"position": [shake, 0, 0]}},
        "beam_charge": {"rightarm": {"rotation": [-35, 0, -12]}, "leftarm": {"rotation": [-55, 0, -42]},
                        "body": {"rotation": [0, 25, 0]}, "rightleg": {"rotation": [-10, 0, -10]}, "leftleg": {"rotation": [12, 0, 6]}},
        "beam_fire": {"rightarm": {"rotation": [f"-90 + {tx}", 0, 8]}, "leftarm": {"rotation": [f"-90 + {tx}", 0, -8]},
                      "rightleg": {"rotation": [-12, 0, -8]}, "leftleg": {"rotation": [14, 0, 6]},
                      "root": {"position": [shake, 0, 0]}},
        "one_hand": {"rightarm": {"rotation": [f"-90 + {tx}", 0, 0]}, "leftarm": {"rotation": [10, 0, 10]}},
        "overhead": {"rightarm": {"rotation": [-172, 0, 14]}, "leftarm": {"rotation": [-172, 0, -14]}, "head": {"rotation": [-15, 0, 0]}},
        "forehead": {"rightarm": {"rotation": [-135, 0, 28]}, "leftarm": {"rotation": [10, 0, 10]}},
        "fly": {"root": {"rotation": [72, 0, 0], "position": [0, 12, 14]}, "rightarm": {"rotation": [8, 0, -6]},
                "leftarm": {"rotation": [8, 0, 6]}, "head": {"rotation": [-55, 0, 0]},
                "rightleg": {"rotation": ["math.sin(query.life_time * 300) * 6", 0, 0]},
                "leftleg": {"rotation": ["-math.sin(query.life_time * 300) * 6", 0, 0]}},
        "fly_fast": {"root": {"rotation": [85, 0, 0], "position": [0, 12, 15]}, "rightarm": {"rotation": [-175, 0, 4]},
                     "leftarm": {"rotation": [10, 0, 6]}, "head": {"rotation": [-70, 0, 0]}},
        "guard": {"rightarm": {"rotation": [-100, 0, 42]}, "leftarm": {"rotation": [-92, 0, -42]}, "body": {"rotation": [6, 0, 0]}},
        "transform": {"rightarm": {"rotation": [0, 0, -28]}, "leftarm": {"rotation": [0, 0, 28]}, "head": {"rotation": [-25, 0, 0]},
                      "body": {"rotation": [-8, 0, 0]}, "rightleg": {"rotation": [0, 0, -10]}, "leftleg": {"rotation": [0, 0, 10]},
                      "root": {"position": ["math.sin(query.life_time * 2600) * 0.6", 0, 0]}},
        "meditate": {"rightleg": {"rotation": [-88, 0, 22]}, "leftleg": {"rotation": [-88, 0, -22]},
                     "rightarm": {"rotation": [-28, 0, -8]}, "leftarm": {"rotation": [-28, 0, 8]},
                     "root": {"position": [0, "math.sin(query.life_time * 90) * 0.8 - 2", 0]}},
        "rush": {"rightarm": {"rotation": ["-90 + math.sin(query.life_time * 2800) * 35", 0, 0]},
                 "leftarm": {"rotation": ["-90 - math.sin(query.life_time * 2800) * 35", 0, 0]},
                 "body": {"rotation": [10, 0, 0]}},
        "fusion": {"rightarm": {"rotation": [0, 0, -95]}, "leftarm": {"rotation": [0, 0, 95]}, "leftleg": {"rotation": [-35, 0, 10]}},
        "down": {"root": {"rotation": [-85, 0, 0], "position": [0, 2, 0]}},
        "throw": {"rightarm": {"rotation": [-165, 0, 0]}, "leftarm": {"rotation": [-20, 0, 15]}},
    }
    anims = {}
    for i, name in enumerate(POSES):
        if name == "none":
            continue
        bones = dict(A[name])
        if "head" in bones:
            bones["dbz_head"] = bones["head"]
        anims[f"animation.{prefix}.pose.{name}"] = {"loop": True, "bones": bones}
    states = {"default": {"transitions": [{f"p{i}": f"{NO_ACTOR} ? 0.0 : query.property('dbz:pose') == {i}"} for i in range(1, len(POSES))],
                          "blend_transition": 0.15}}
    for i, name in enumerate(POSES):
        if name == "none":
            continue
        states[f"p{i}"] = {"animations": [f"{prefix}_pose_{name}"],
                           "transitions": [{"default": f"{NO_ACTOR} ? 1.0 : query.property('dbz:pose') != {i}"}], "blend_transition": 0.15}
    ctrl = {f"controller.animation.{prefix}.pose": {"initial_state": "default", "states": states}}
    keys = {f"{prefix}_pose_{name}": f"animation.{prefix}.pose.{name}" for name in POSES if name != "none"}
    return anims, ctrl, keys


# =============================================================================================== resource pack
def build_rp(data):
    geos = []
    rcs = {}
    anims = {}
    ctrls = {}

    # ---------------------------------------------------------------- characters
    char_tex = []
    for c in CH.CHARACTERS:
        m = build_humanoid(f"geometry.dbz.ch.{c['id']}", c["spec"])
        # A bone called "head" makes the engine derive an armor locator from its pivot; with many
        # differently sized geometries on one entity those locators clash, so fighters use "dbz_head".
        for b in m.bones:
            if b.name == "head":
                b.name = "dbz_head"
            if b.parent == "head":
                b.parent = "dbz_head"
        img = m.render_texture()
        save_png(img, f"textures/entity/dbz/ch/{c['id']}")
        if c["id"] not in NO_EGG:
            EGG_ICONS[c["id"]] = EG.egg_icon(m, img)
        geos.append(m)
        char_tex.append(c["id"])
    write_json(os.path.join(RP, "models/entity/dbz_characters.geo.json"), geo_file(geos))

    # ---------------------------------------------------------------- aura & spark textures/geo
    for name, core, edge in PV.AURA_COLORS[1:]:
        save_png(PV.aura_texture(core, edge, seed=hash(name) % 1000), f"textures/entity/dbz/aura/{name}")
    save_png(PV.spark_texture(), "textures/entity/dbz/aura/spark")
    write_json(os.path.join(RP, "models/entity/dbz_aura.geo.json"),
               {"format_version": "1.16.0", "minecraft:geometry": [PV.aura_model(), PV.spark_model()]})

    aura_tex_list = ["Texture.aura_" + n for n, _, _ in PV.AURA_COLORS[1:]]
    aura_arr = [aura_tex_list[0]] + aura_tex_list  # index 0 never rendered
    uv_anim = {"offset": [0.0, "math.mod(math.floor(query.life_time * 12.0), 4.0) * 0.25"], "scale": [1.0, 1.0]}
    rcs["controller.render.dbz.aura"] = {
        "arrays": {"textures": {"Array.aura": aura_arr}},
        "geometry": "Geometry.dbz_aura", "materials": [{"*": "Material.dbz_aura"}],
        "textures": ["Array.aura[" + NO_ACTOR + " ? 0 : query.property('dbz:aura')]"], "uv_anim": uv_anim, "ignore_lighting": True,
    }
    rcs["controller.render.dbz.spark"] = {
        "geometry": "Geometry.dbz_spark", "materials": [{"*": "Material.dbz_aura"}], "textures": ["Texture.aura_spark"],
        "uv_anim": {"offset": [0.0, "math.mod(math.floor(query.life_time * 16.0), 4.0) * 0.25"], "scale": [1.0, 1.0]},
        "ignore_lighting": True,
    }

    # ---------------------------------------------------------------- fighter client entity
    p_anims, p_ctrl, p_keys = pose_animations("dbz")
    anims.update(p_anims)
    anims["animation.dbz.fighter.look"] = {"loop": True, "bones": {"dbz_head": {
        "relative_to": {"rotation": "entity"}, "rotation": ["query.target_x_rotation", "query.target_y_rotation", 0.0]}}}
    ctrls.update(p_ctrl)
    rcs["controller.render.dbz.fighter"] = {
        "arrays": {"geometries": {"Array.geo": [f"Geometry.ch_{c}" for c in char_tex]},
                   "textures": {"Array.tex": [f"Texture.ch_{c}" for c in char_tex]}},
        "geometry": "Array.geo[query.property('dbz:char')]", "materials": [{"*": "Material.default"}],
        "textures": ["Array.tex[query.property('dbz:char')]"],
    }
    fighter_desc = {
        "identifier": "dbz:fighter",
        "materials": {"default": "entity_alphatest", "dbz_aura": "entity_beam_additive"},
        "textures": dict({f"ch_{c}": f"textures/entity/dbz/ch/{c}" for c in char_tex},
                         **{f"aura_{n}": f"textures/entity/dbz/aura/{n}" for n, _, _ in PV.AURA_COLORS[1:]},
                         aura_spark="textures/entity/dbz/aura/spark"),
        "geometry": dict({f"ch_{c}": f"geometry.dbz.ch.{c}" for c in char_tex}, dbz_aura="geometry.dbz.aura",
                         dbz_spark="geometry.dbz.spark"),
        "scripts": {
            "scale": "query.property('dbz:scale')",
            "pre_animation": ["variable.tcos0 = (math.cos(query.modified_distance_moved * 38.17) * query.modified_move_speed) * 57.3;"],
            "animate": ["dbz_look", {"move": "query.property('dbz:pose') == 0"},
                        {"attack.rotations": "variable.attack_time > 0"}, "bob", "dbz_pose_ctrl"],
        },
        "animations": dict({"dbz_look": "animation.dbz.fighter.look",
                            "move": "animation.humanoid.move", "attack.rotations": "animation.humanoid.attack.rotations",
                            "bob": "animation.humanoid.bob", "dbz_pose_ctrl": "controller.animation.dbz.pose"}, **p_keys),
        "render_controllers": ["controller.render.dbz.fighter",
                               {"controller.render.dbz.aura": "query.property('dbz:aura') > 0"},
                               {"controller.render.dbz.spark": "query.property('dbz:spark')"}],
        "enable_attachables": False,
    }
    write_json(os.path.join(RP, "entity/dbz_fighter.entity.json"),
               {"format_version": "1.10.0", "minecraft:client_entity": {"description": fighter_desc}})

    # ---------------------------------------------------------------- player visuals
    hair_models = PV.hair_models()
    for name, col in PV.HAIR_COLORS[1:]:
        save_png(PV.hair_texture(col), f"textures/entity/dbz/hair/{name}")
    ovs = PV.overlay_models()
    for oid, m, img in ovs:
        save_png(img, f"textures/entity/dbz/overlay/{oid}")
    tail = PV.tail_model()
    save_png(tail.render_texture(), "textures/entity/dbz/tail")
    ooz, t_brown, t_gold = PV.oozaru_models()
    save_png(t_brown, "textures/entity/dbz/oozaru")
    save_png(t_gold, "textures/entity/dbz/oozaru_golden")
    write_json(os.path.join(RP, "models/entity/dbz_player.geo.json"),
               geo_file(hair_models + [m for _, m, _ in ovs] + [tail, ooz]))

    rcs["controller.render.dbz.hair"] = {
        "arrays": {"geometries": {"Array.geo": [f"Geometry.dbz_hair_{s}" for s in PV.HAIR_STYLES]},
                   "textures": {"Array.tex": ["Texture.dbz_hair_" + PV.HAIR_COLORS[1][0]] +
                                [f"Texture.dbz_hair_{n}" for n, _ in PV.HAIR_COLORS[1:]]}},
        "geometry": "Array.geo[" + NO_ACTOR + " ? 0 : query.property('dbz:hair_style')]", "materials": [{"*": "Material.dbz_solid"}],
        "textures": ["Array.tex[" + NO_ACTOR + " ? 0 : query.property('dbz:hair')]"], "ignore_lighting": True,
    }
    ov_ids = [o for o, _, _ in ovs]
    rcs["controller.render.dbz.overlay"] = {
        "arrays": {"geometries": {"Array.geo": [f"Geometry.dbz_ov_{ov_ids[0]}"] + [f"Geometry.dbz_ov_{o}" for o in ov_ids]},
                   "textures": {"Array.tex": [f"Texture.dbz_ov_{ov_ids[0]}"] + [f"Texture.dbz_ov_{o}" for o in ov_ids]}},
        "geometry": "Array.geo[" + NO_ACTOR + " ? 0 : query.property('dbz:body')]", "materials": [{"*": "Material.dbz_solid"}],
        "textures": ["Array.tex[" + NO_ACTOR + " ? 0 : query.property('dbz:body')]"],
    }
    rcs["controller.render.dbz.tail"] = {"geometry": "Geometry.dbz_tail", "materials": [{"*": "Material.dbz_solid"}],
                                         "textures": ["Texture.dbz_tail"]}
    rcs["controller.render.dbz.oozaru"] = {
        "arrays": {"textures": {"Array.tex": ["Texture.dbz_oozaru", "Texture.dbz_oozaru", "Texture.dbz_oozaru_golden"]}},
        "geometry": "Geometry.dbz_oozaru", "materials": [{"*": "Material.dbz_solid"}],
        "textures": ["Array.tex[" + NO_ACTOR + " ? 0 : query.property('dbz:model')]"],
    }
    build_player_rp(p_keys, ov_ids)

    # ---------------------------------------------------------------- ki blast / beam
    for name, core, edge in MM.KI_COLORS:
        save_png(MM.ki_texture(core, edge), f"textures/entity/dbz/ki/{name}")
        save_png(MM.ki_texture(core, edge, spiral=True), f"textures/entity/dbz/ki/{name}_spiral")
    orb, disc, beam = MM.orb_model(), MM.disc_model(), MM.beam_model()
    write_json(os.path.join(RP, "models/entity/dbz_ki.geo.json"), geo_file([orb, disc, beam]))
    ki_tex = {f"ki_{n}": f"textures/entity/dbz/ki/{n}" for n, _, _ in MM.KI_COLORS}
    ki_tex.update({f"ki_{n}_spiral": f"textures/entity/dbz/ki/{n}_spiral" for n, _, _ in MM.KI_COLORS})
    ki_arr = [f"Texture.ki_{n}" for n, _, _ in MM.KI_COLORS]
    ki_arr_sp = [f"Texture.ki_{n}_spiral" for n, _, _ in MM.KI_COLORS]
    rcs["controller.render.dbz.ki_core"] = {
        "arrays": {"geometries": {"Array.geo": ["Geometry.orb", "Geometry.disc"]}, "textures": {"Array.tex": ki_arr}},
        "geometry": "Array.geo[query.property('dbz:shape')]", "materials": [{"*": "Material.core"}],
        "textures": ["Array.tex[query.property('dbz:color')]"], "part_visibility": [{"*": True}, {"glow": False}],
        "ignore_lighting": True,
    }
    rcs["controller.render.dbz.ki_glow"] = {
        "arrays": {"geometries": {"Array.geo": ["Geometry.orb", "Geometry.disc"]}, "textures": {"Array.tex": ki_arr}},
        "geometry": "Array.geo[query.property('dbz:shape')]", "materials": [{"*": "Material.glow"}],
        "textures": ["Array.tex[query.property('dbz:color')]"], "part_visibility": [{"*": True}, {"core": False}],
        "ignore_lighting": True,
    }
    anims["animation.dbz.ki.orb"] = {"loop": True, "bones": {
        "scale": {"scale": ["query.property('dbz:size') * (1 + math.sin(query.life_time * 1400) * 0.06)"] * 3,
                  "rotation": [0, "query.life_time * (query.property('dbz:shape') == 1 ? 1440 : 240)", 0]}}}
    write_json(os.path.join(RP, "entity/dbz_ki_blast.entity.json"), {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "dbz:ki_blast",
        "materials": {"core": "entity_alphatest", "glow": "entity_beam_additive"},
        "textures": ki_tex, "geometry": {"orb": "geometry.dbz.ki_orb", "disc": "geometry.dbz.ki_disc"},
        "scripts": {"animate": ["spin"]}, "animations": {"spin": "animation.dbz.ki.orb"},
        "render_controllers": ["controller.render.dbz.ki_core", "controller.render.dbz.ki_glow"],
    }}})
    rcs["controller.render.dbz.beam_core"] = {
        "arrays": {"textures": {"Array.tex": ki_arr, "Array.sp": ki_arr_sp}},
        "geometry": "Geometry.beam", "materials": [{"*": "Material.core"}],
        "textures": ["query.property('dbz:spiral') ? Array.sp[query.property('dbz:color')] : Array.tex[query.property('dbz:color')]"],
        "part_visibility": [{"*": True}, {"body_glow": False}, {"tip_glow": False}],
        "uv_anim": {"offset": ["query.life_time * 3.0", 0.0], "scale": [1.0, 1.0]}, "ignore_lighting": True,
    }
    rcs["controller.render.dbz.beam_glow"] = {
        "arrays": {"textures": {"Array.tex": ki_arr}},
        "geometry": "Geometry.beam", "materials": [{"*": "Material.glow"}],
        "textures": ["Array.tex[query.property('dbz:color')]"],
        "part_visibility": [{"*": False}, {"body_glow": True}, {"tip_glow": True}], "ignore_lighting": True,
    }
    W = "query.property('dbz:width')"
    L = "query.property('dbz:len')"
    pulse = "(1 + math.sin(query.life_time * 2000) * 0.07)"
    anims["animation.dbz.beam"] = {"loop": True, "bones": {
        "aim": {"rotation": ["query.property('dbz:pitch')", "query.property('dbz:yaw')", 0]},
        "body": {"scale": [f"{W} * {pulse}", f"{W} * {pulse}", L]},
        "body_glow": {"scale": [f"{W} * {pulse}", f"{W} * {pulse}", L]},
        "tip": {"position": [0, 0, f"-16 * {L}"], "scale": f"{W} * 1.1"},
        "tip_glow": {"position": [0, 0, f"-16 * {L}"], "scale": f"{W} * {pulse}"},
        "base": {"scale": f"{W} * 0.9"},
    }}
    write_json(os.path.join(RP, "entity/dbz_beam.entity.json"), {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "dbz:beam",
        "materials": {"core": "entity_alphatest", "glow": "entity_beam_additive"},
        "textures": ki_tex, "geometry": {"beam": "geometry.dbz.beam"},
        "scripts": {"animate": ["beam"]}, "animations": {"beam": "animation.dbz.beam"},
        "render_controllers": ["controller.render.dbz.beam_core", "controller.render.dbz.beam_glow"],
    }}})
    # make tip_glow a sibling of tip so it can be shown while tip is hidden
    for b in beam.bones:
        if b.name == "tip_glow":
            b.parent = "aim"
    write_json(os.path.join(RP, "models/entity/dbz_ki.geo.json"), geo_file([orb, disc, beam]))

    # ---------------------------------------------------------------- dragons
    shen = MM.shenron_model()
    save_png(shen.render_texture(), "textures/entity/dbz/shenron")
    sup = MM.shenron_model("geometry.dbz.shenron", MM.rgb("e8b020"), MM.rgb("f0e0a0"), MM.rgb("f8f0e0"), (240, 40, 40))
    save_png(sup.render_texture(), "textures/entity/dbz/super_shenron")
    por = MM.porunga_model()
    save_png(por.render_texture(), "textures/entity/dbz/porunga")
    write_json(os.path.join(RP, "models/entity/dbz_dragons.geo.json"), geo_file([shen, por]))
    seg_bones = {f"seg{i}": {"rotation": [f"math.sin(query.life_time * 90 + {i * 25}) * 3", f"math.cos(query.life_time * 70 + {i * 30}) * 2", 0]}
                 for i in range(18)}
    seg_bones["head"] = {"rotation": ["math.sin(query.life_time * 60) * 4", "math.sin(query.life_time * 40) * 6", 0]}
    anims["animation.dbz.shenron.idle"] = {"loop": True, "bones": seg_bones}
    anims["animation.dbz.porunga.idle"] = {"loop": True, "bones": {
        "body": {"rotation": ["math.sin(query.life_time * 60) * 2", 0, 0]},
        "rightarm": {"rotation": [-20, 0, -15]}, "leftarm": {"rotation": [-20, 0, 15]},
        "head": {"rotation": ["math.sin(query.life_time * 45) * 4", 0, 0]}}}
    rcs["controller.render.dbz.dragon"] = {
        "arrays": {"geometries": {"Array.geo": ["Geometry.shenron", "Geometry.porunga", "Geometry.shenron"]},
                   "textures": {"Array.tex": ["Texture.shenron", "Texture.porunga", "Texture.super"]}},
        "geometry": "Array.geo[query.property('dbz:variant')]", "materials": [{"*": "Material.default"}],
        "textures": ["Array.tex[query.property('dbz:variant')]"], "ignore_lighting": True,
    }
    write_json(os.path.join(RP, "entity/dbz_dragon.entity.json"), {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "dbz:dragon",
        "materials": {"default": "entity_alphatest"},
        "textures": {"shenron": "textures/entity/dbz/shenron", "porunga": "textures/entity/dbz/porunga",
                     "super": "textures/entity/dbz/super_shenron"},
        "geometry": {"shenron": "geometry.dbz.shenron", "porunga": "geometry.dbz.porunga"},
        "scripts": {"scale": "query.property('dbz:scale')",
                    "animate": [{"shen": "query.property('dbz:variant') != 1"}, {"poru": "query.property('dbz:variant') == 1"}]},
        "animations": {"shen": "animation.dbz.shenron.idle", "poru": "animation.dbz.porunga.idle"},
        "render_controllers": ["controller.render.dbz.dragon"],
    }}})

    # ---------------------------------------------------------------- dinosaur & vehicles
    dino = MM.dino_model()
    save_png(dino.render_texture(), "textures/entity/dbz/dinosaur")
    kin, car, ship = MM.kintoun_model(), MM.aircar_model(), MM.spaceship_model()
    for m, n in ((kin, "kintoun"), (car, "aircar"), (ship, "spaceship")):
        save_png(m.render_texture(), f"textures/entity/dbz/{n}")
    write_json(os.path.join(RP, "models/entity/dbz_misc.geo.json"), geo_file([dino, kin, car, ship]))
    anims["animation.dbz.dino.walk"] = {"loop": True, "bones": {
        "rightleg": {"rotation": ["math.cos(query.modified_distance_moved * 20) * 28 * query.modified_move_speed", 0, 0]},
        "leftleg": {"rotation": ["-math.cos(query.modified_distance_moved * 20) * 28 * query.modified_move_speed", 0, 0]},
        "tail1": {"rotation": [0, "math.sin(query.life_time * 120) * 8", 0]},
        "tail2": {"rotation": [0, "math.sin(query.life_time * 120 - 40) * 10", 0]},
        "tail3": {"rotation": [0, "math.sin(query.life_time * 120 - 80) * 12", 0]},
        "jaw": {"rotation": ["variable.attack_time > 0 ? 25 : math.max(0, math.sin(query.life_time * 50) * 6)", 0, 0]},
        "head": {"rotation": ["query.target_x_rotation * 0.5", "query.target_y_rotation * 0.5", 0]}}}
    anims["animation.dbz.vehicle.bob"] = {"loop": True, "bones": {"root": {"position": [0, "math.sin(query.life_time * 120) * 0.8", 0]}}}
    anims["animation.dbz.kintoun.bob"] = {"loop": True, "bones": {"cloud": {"position": [0, "math.sin(query.life_time * 150) * 0.6", 0],
                                                                           "rotation": [0, "math.sin(query.life_time * 40) * 4", 0]}}}
    simple = [("dbz:dinosaur", "dinosaur", "geometry.dbz.dinosaur", "animation.dbz.dino.walk"),
              ("dbz:kintoun", "kintoun", "geometry.dbz.kintoun", "animation.dbz.kintoun.bob"),
              ("dbz:aircar", "aircar", "geometry.dbz.aircar", "animation.dbz.vehicle.bob"),
              ("dbz:spaceship", "spaceship", "geometry.dbz.spaceship", None)]
    for ident, tex, geo, anim in simple:
        desc = {"identifier": ident, "materials": {"default": "entity_alphatest"},
                "textures": {"default": f"textures/entity/dbz/{tex}"}, "geometry": {"default": geo},
                "render_controllers": ["controller.render.default"]}
        if anim:
            desc["scripts"] = {"animate": ["a"]}
            desc["animations"] = {"a": anim}
        write_json(os.path.join(RP, f"entity/dbz_{tex}.entity.json"),
                   {"format_version": "1.10.0", "minecraft:client_entity": {"description": desc}})

    write_json(os.path.join(RP, "render_controllers/dbz.render_controllers.json"),
               {"format_version": "1.10.0", "render_controllers": rcs})
    write_json(os.path.join(RP, "animations/dbz.animation.json"), {"format_version": "1.10.0", "animations": anims})
    write_json(os.path.join(RP, "animation_controllers/dbz.animation_controllers.json"),
               {"format_version": "1.10.0", "animation_controllers": ctrls})

    # ---------------------------------------------------------------- particles
    save_png(PT.atlas(), "textures/particle/dbz_particles")
    for ident, body in PT.defs().items():
        write_json(os.path.join(RP, "particles", ident.split(":")[1] + ".json"), body)

    # ---------------------------------------------------------------- fogs
    fogs = {"namek": ("#7fd28a", 18, 110), "kai": ("#f2d27a", 10, 70), "beerus": ("#a77ad8", 12, 80),
            "space": ("#14102a", 6, 60), "htc": ("#ffffff", 4, 40), "gravity": ("#d84a4a", 8, 60),
            "summon": ("#203a2a", 8, 70), "top": ("#3a2a6a", 10, 90)}
    for name, (col, start, end) in fogs.items():
        write_json(os.path.join(RP, f"fogs/dbz_{name}.json"), {"format_version": "1.16.100", "minecraft:fog_settings": {
            "description": {"identifier": f"dbz:{name}"},
            "distance": {"air": {"fog_start": start, "fog_end": end, "fog_color": col, "render_distance_type": "fixed"},
                         "weather": {"fog_start": start, "fog_end": end, "fog_color": col, "render_distance_type": "fixed"}}}})

    # ---------------------------------------------------------------- sounds
    write_json(os.path.join(RP, "sounds/sound_definitions.json"),
               {"format_version": "1.20.20", "sound_definitions": SND.build(RP)})


def build_player_rp(p_keys, ov_ids):
    with open(os.path.join(VANILLA, "player_rp.json")) as f:
        pl = json.load(f)
    d = pl["minecraft:client_entity"]["description"]
    d["materials"].update({"dbz_solid": "entity_alphatest", "dbz_aura": "entity_beam_additive"})
    tex = d["textures"]
    for n, _ in PV.HAIR_COLORS[1:]:
        tex[f"dbz_hair_{n}"] = f"textures/entity/dbz/hair/{n}"
    for n, _, _ in PV.AURA_COLORS[1:]:
        tex[f"aura_{n}"] = f"textures/entity/dbz/aura/{n}"
    tex["aura_spark"] = "textures/entity/dbz/aura/spark"
    for o in ov_ids:
        tex[f"dbz_ov_{o}"] = f"textures/entity/dbz/overlay/{o}"
    tex["dbz_tail"] = "textures/entity/dbz/tail"
    tex["dbz_oozaru"] = "textures/entity/dbz/oozaru"
    tex["dbz_oozaru_golden"] = "textures/entity/dbz/oozaru_golden"
    geo = d["geometry"]
    for s in PV.HAIR_STYLES:
        geo[f"dbz_hair_{s}"] = f"geometry.dbz.hair.{s}"
    for o in ov_ids:
        geo[f"dbz_ov_{o}"] = f"geometry.dbz.overlay.{o}"
    geo["dbz_tail"] = "geometry.dbz.tail"
    geo["dbz_oozaru"] = "geometry.dbz.oozaru"
    geo["dbz_aura"] = "geometry.dbz.aura"
    geo["dbz_spark"] = "geometry.dbz.spark"
    # every query.property use is behind a NO_ACTOR ternary (only the taken branch is evaluated)
    d["scripts"]["scale"] = NO_ACTOR + " ? 0.9375 : 0.9375 * query.property('dbz:scale')"
    pre = d["scripts"].setdefault("pre_animation", [])
    if not any("melee_spear_equipped" in x for x in pre):
        pre.append("variable.melee_spear_equipped = query.equipped_item_any_tag('slot.weapon.mainhand', 'minecraft:is_spear');")
    # variables the game's own player definition provides but the sample copy lacks
    init = d["scripts"].setdefault("initialize", [])
    defaults = {"first_person_item_rotation_factor": 1.0}
    for side in ("fp", "tp"):
        for kind in ("use", "attack"):
            for part in ("item_position_x", "item_position_y", "item_position_z", "item_rotation_x", "item_rotation_y",
                         "item_rotation_z", "arm_rotation_x", "arm_rotation_y", "arm_rotation_z", "attachable_rotation_z",
                         "attachable_position_z"):
                defaults[f"{side}_melee_spear_{kind}_{part}"] = 0.0
    defaults["tp_melee_spear_base_arm_rotation_x"] = -30.0
    text = json.dumps(d)
    for k, v in defaults.items():
        if f"variable.{k} =" not in text and f"v.{k} =" not in text:
            init.append(f"variable.{k} = {v};")
    d["scripts"]["animate"].append({"dbz_pose_ctrl": NO_ACTOR + " ? 0.0 : !variable.is_first_person"})
    d["animations"]["dbz_pose_ctrl"] = "controller.animation.dbz.pose"
    d["animations"].update(p_keys)
    third = "!variable.is_first_person && !variable.map_face_icon && !query.is_spectator"
    new_rc = []
    for entry in d["render_controllers"]:
        if isinstance(entry, dict) and "controller.render.player.third_person" in entry:
            entry = {"controller.render.player.third_person": "(" + entry["controller.render.player.third_person"] +
                     ") && (" + NO_ACTOR + " ? 1.0 : query.property('dbz:model') == 0)"}
        new_rc.append(entry)
    def guard(cond):
        return f"{NO_ACTOR} ? 0.0 : ({third} && {cond})"
    new_rc += [
        {"controller.render.dbz.overlay": guard("query.property('dbz:body') > 0 && query.property('dbz:model') == 0")},
        {"controller.render.dbz.hair": guard("query.property('dbz:hair') > 0 && query.property('dbz:model') == 0")},
        {"controller.render.dbz.tail": guard("query.property('dbz:tail') && query.property('dbz:model') == 0")},
        {"controller.render.dbz.oozaru": guard("query.property('dbz:model') > 0")},
        {"controller.render.dbz.aura": guard("query.property('dbz:aura') > 0")},
        {"controller.render.dbz.spark": guard("query.property('dbz:spark')")},
    ]
    d["render_controllers"] = new_rc
    write_json(os.path.join(RP, "entity/player.entity.json"), pl)


# =============================================================================================== behavior pack
def prop_int(lo, hi, default=0):
    return {"type": "int", "range": [lo, hi], "default": default, "client_sync": True}


def prop_float(lo, hi, default=0.0):
    return {"type": "float", "range": [lo, hi], "default": default, "client_sync": True}


def prop_bool(default=False):
    return {"type": "bool", "default": default, "client_sync": True}


def build_player_bp():
    with open(os.path.join(VANILLA, "player_bp.json")) as f:
        pl = json.load(f)
    e = pl["minecraft:entity"]
    e["description"]["properties"] = {
        "dbz:hair": prop_int(0, len(PV.HAIR_COLORS) - 1),
        "dbz:hair_style": prop_int(0, len(PV.HAIR_STYLES) - 1),
        "dbz:aura": prop_int(0, len(PV.AURA_COLORS) - 1),
        "dbz:body": prop_int(0, len(PV.OVERLAYS) - 1),
        "dbz:model": prop_int(0, 2),
        "dbz:scale": prop_float(0.5, 6.0, 1.0),
        "dbz:pose": prop_int(0, len(POSES) - 1),
        "dbz:tail": prop_bool(),
        "dbz:spark": prop_bool(),
    }
    write_json(os.path.join(BP, "entities/player.json"), pl)


def entity(identifier, components, groups=None, events=None, properties=None, spawnable=False, summonable=True):
    desc = {"identifier": identifier, "is_spawnable": spawnable, "is_summonable": summonable}
    if properties:
        desc["properties"] = properties
    body = {"description": desc, "components": components}
    if groups:
        body["component_groups"] = groups
    if events:
        body["events"] = events
    return {"format_version": ENTITY_FMT, "minecraft:entity": body}


def build_entities():
    nchars = len(CH.CHARACTERS)
    # ------------------------------------------------------------------ fighter
    groups = {}
    events = {}
    for name, (w, h) in SIZES.items():
        groups[f"dbz:size_{name}"] = {"minecraft:collision_box": {"width": w, "height": h}}
    size_names = [f"dbz:size_{n}" for n in SIZES]
    for name in SIZES:
        events[f"dbz:size_{name}"] = {"add": {"component_groups": [f"dbz:size_{name}"]},
                                      "remove": {"component_groups": [g for g in size_names if g != f"dbz:size_{name}"]}}
    for hp in HP_TIERS:
        groups[f"dbz:hp_{hp}"] = {"minecraft:health": {"value": hp, "max": hp}}
    hp_names = [f"dbz:hp_{hp}" for hp in HP_TIERS]
    for hp in HP_TIERS:
        events[f"dbz:hp_{hp}"] = {"add": {"component_groups": [f"dbz:hp_{hp}"]},
                                  "remove": {"component_groups": [g for g in hp_names if g != f"dbz:hp_{hp}"]}}
    talk = {"minecraft:interact": {"interactions": [{"on_interact": {"filters": {"test": "is_family", "subject": "other", "value": "player"},
                                                                     "event": "dbz:interacted", "target": "self"},
                                                     "interact_text": "action.interact.dbz_talk", "swing": True}]}}
    enemy_targets = {"minecraft:behavior.nearest_attackable_target": {
        "priority": 2, "must_see": False, "reselect_targets": True, "within_radius": 40,
        "entity_types": [{"filters": {"any_of": [{"test": "is_family", "subject": "other", "value": "player"},
                                                 {"test": "is_family", "subject": "other", "value": "dbz_ally"}]},
                          "max_dist": 40}]},
        "minecraft:behavior.hurt_by_target": {"priority": 1},
        "minecraft:behavior.melee_box_attack": {"priority": 3, "speed_multiplier": 1.25, "track_target": True},
        "minecraft:attack": {"damage": 3},
        "minecraft:behavior.random_stroll": {"priority": 7, "speed_multiplier": 0.8},
        "minecraft:behavior.look_at_player": {"priority": 8, "look_distance": 12}}
    groups["dbz:role_npc"] = dict({"minecraft:type_family": {"family": ["dbz_fighter", "dbz_npc", "mob"]},
                                   "minecraft:behavior.look_at_player": {"priority": 2, "look_distance": 8, "probability": 0.8},
                                   "minecraft:behavior.random_look_around": {"priority": 5},
                                   "minecraft:behavior.random_stroll": {"priority": 6, "speed_multiplier": 0.5, "xz_dist": 3, "interval": 200},
                                   "minecraft:damage_sensor": {"triggers": {"cause": "all", "deals_damage": "no"}}}, **talk)
    groups["dbz:role_enemy"] = dict({"minecraft:type_family": {"family": ["dbz_fighter", "dbz_enemy", "monster", "mob"]}}, **enemy_targets)
    groups["dbz:role_spar"] = dict({"minecraft:type_family": {"family": ["dbz_fighter", "dbz_spar", "mob"]}}, **enemy_targets)
    groups["dbz:role_ally"] = dict({
        "minecraft:type_family": {"family": ["dbz_fighter", "dbz_ally", "mob"]},
        "minecraft:behavior.nearest_attackable_target": {
            "priority": 2, "must_see": False, "reselect_targets": True, "within_radius": 24,
            "entity_types": [{"filters": {"all_of": [{"any_of": [{"test": "is_family", "subject": "other", "value": "monster"},
                                                                 {"test": "is_family", "subject": "other", "value": "dbz_enemy"}]},
                                                     {"test": "is_family", "subject": "other", "operator": "!=", "value": "creeper"}]},
                              "max_dist": 24}]},
        "minecraft:behavior.melee_box_attack": {"priority": 3, "speed_multiplier": 1.3, "track_target": True},
        "minecraft:attack": {"damage": 4},
        "minecraft:behavior.random_stroll": {"priority": 8, "speed_multiplier": 0.7},
        "minecraft:behavior.look_at_player": {"priority": 7, "look_distance": 10},
        "minecraft:damage_sensor": {"triggers": [
            {"on_damage": {"filters": {"test": "is_family", "subject": "other", "value": "player"}}, "deals_damage": "no"},
            {"cause": "fall", "deals_damage": "no"}]}}, **talk)
    groups["dbz:role_passive"] = {"minecraft:type_family": {"family": ["dbz_fighter", "dbz_passive", "mob"]},
                                  "minecraft:behavior.random_stroll": {"priority": 4, "speed_multiplier": 1.4, "interval": 20},
                                  "minecraft:behavior.panic": {"priority": 1, "speed_multiplier": 1.6},
                                  "minecraft:damage_sensor": {"triggers": {"cause": "all", "deals_damage": "no"}}}
    groups["dbz:role_dummy"] = {"minecraft:type_family": {"family": ["dbz_fighter", "dbz_dummy"]},
                                "minecraft:movement": {"value": 0}, "minecraft:knockback_resistance": {"value": 1.0},
                                "minecraft:damage_sensor": {"triggers": [{"cause": "fall", "deals_damage": "no"},
                                                                         {"cause": "suffocation", "deals_damage": "no"}]}}
    roles = ["npc", "enemy", "spar", "ally", "passive", "dummy"]
    for r in roles:
        events[f"dbz:role_{r}"] = {"add": {"component_groups": [f"dbz:role_{r}"]},
                                   "remove": {"component_groups": [f"dbz:role_{o}" for o in roles if o != r]}}
    groups["dbz:boss"] = {"minecraft:boss": {"should_darken_sky": False, "hud_range": 64}}
    events["dbz:boss_on"] = {"add": {"component_groups": ["dbz:boss"]}}
    events["dbz:boss_off"] = {"remove": {"component_groups": ["dbz:boss"]}}
    groups["dbz:mob"] = {"minecraft:despawn": {"despawn_from_distance": {"min_distance": 48, "max_distance": 96}}}
    events["dbz:mob"] = {"add": {"component_groups": ["dbz:mob"]}}
    groups["dbz:flying"] = {"minecraft:physics": {"has_gravity": False}, "minecraft:can_fly": {}}
    events["dbz:fly_on"] = {"add": {"component_groups": ["dbz:flying"]}}
    events["dbz:fly_off"] = {"remove": {"component_groups": ["dbz:flying"]}}
    groups["dbz:frozen"] = {"minecraft:movement": {"value": 0}}
    events["dbz:freeze"] = {"add": {"component_groups": ["dbz:frozen"]}}
    events["dbz:unfreeze"] = {"remove": {"component_groups": ["dbz:frozen"]}}
    events["dbz:interacted"] = {}
    events["minecraft:entity_spawned"] = {"add": {"component_groups": ["dbz:size_normal", "dbz:hp_20", "dbz:role_npc"]}}
    fighter = entity("dbz:fighter", {
        "minecraft:type_family": {"family": ["dbz_fighter", "mob"]},
        "minecraft:health": {"value": 20, "max": 20},
        "minecraft:collision_box": {"width": 0.6, "height": 1.9},
        "minecraft:physics": {}, "minecraft:pushable": {"is_pushable": True, "is_pushable_by_piston": True},
        "minecraft:movement": {"value": 0.3}, "minecraft:movement.basic": {},
        "minecraft:navigation.walk": {"can_path_over_water": True, "avoid_damage_blocks": True, "can_open_doors": True},
        "minecraft:jump.static": {}, "minecraft:can_climb": {},
        "minecraft:follow_range": {"value": 48, "max": 64},
        "minecraft:nameable": {"always_show": False, "allow_name_tag_renaming": False},
        "minecraft:knockback_resistance": {"value": 0.4},
        "minecraft:breathable": {"total_supply": 15, "suffocate_time": 0, "breathes_water": True},
        "minecraft:damage_sensor": {"triggers": [{"cause": "fall", "deals_damage": "no"}]},
        "minecraft:behavior.float": {"priority": 0},
        "minecraft:conditional_bandwidth_optimization": {},
        "minecraft:is_hidden_when_invisible": {},
        "minecraft:persistent": {},
    }, groups, events, {
        "dbz:char": prop_int(0, nchars - 1), "dbz:aura": prop_int(0, len(PV.AURA_COLORS) - 1),
        "dbz:pose": prop_int(0, len(POSES) - 1), "dbz:scale": prop_float(0.2, 8.0, 1.0), "dbz:spark": prop_bool(),
    })
    write_json(os.path.join(BP, "entities/dbz_fighter.json"), fighter)

    # ------------------------------------------------------------------ projectiles (script-driven)
    inert = {
        "minecraft:type_family": {"family": ["dbz_fx", "inanimate"]},
        "minecraft:collision_box": {"width": 0.25, "height": 0.25},
        "minecraft:physics": {"has_gravity": False, "has_collision": False},
        "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
        "minecraft:damage_sensor": {"triggers": {"cause": "all", "deals_damage": "no"}},
        "minecraft:health": {"value": 1, "max": 1},
        "minecraft:body_rotation_blocked": {},
        "minecraft:timer": {"looping": False, "time": 75, "randomInterval": False, "time_down_event": {"event": "dbz:expire"}},
        "minecraft:conditional_bandwidth_optimization": {"default_values": {"max_optimized_distance": 160, "max_dropped_ticks": 0,
                                                                            "use_motion_prediction_hints": True}},
    }
    expire_groups = {"dbz:despawn": {"minecraft:instant_despawn": {}}}
    expire_events = {"dbz:expire": {"add": {"component_groups": ["dbz:despawn"]}}}
    write_json(os.path.join(BP, "entities/dbz_ki_blast.json"), entity("dbz:ki_blast", copy.deepcopy(inert), expire_groups, expire_events, {
        "dbz:color": prop_int(0, len(MM.KI_COLORS) - 1), "dbz:shape": prop_int(0, 1), "dbz:size": prop_float(0.1, 12.0, 1.0)}))
    write_json(os.path.join(BP, "entities/dbz_beam.json"), entity("dbz:beam", copy.deepcopy(inert), expire_groups, expire_events, {
        "dbz:color": prop_int(0, len(MM.KI_COLORS) - 1), "dbz:len": prop_float(0.0, 80.0, 0.5),
        "dbz:width": prop_float(0.1, 8.0, 1.0), "dbz:pitch": prop_float(-180.0, 180.0, 0.0),
        "dbz:yaw": prop_float(-360.0, 360.0, 0.0), "dbz:spiral": prop_bool()}))

    # ------------------------------------------------------------------ dragon
    dragon_c = copy.deepcopy(inert)
    del dragon_c["minecraft:timer"]
    dragon_c["minecraft:collision_box"] = {"width": 1.0, "height": 2.0}
    dragon_c["minecraft:persistent"] = {}
    dragon_c["minecraft:nameable"] = {"always_show": False}
    write_json(os.path.join(BP, "entities/dbz_dragon.json"), entity("dbz:dragon", dragon_c, None, None, {
        "dbz:variant": prop_int(0, 2), "dbz:scale": prop_float(0.1, 12.0, 1.0)}))

    # ------------------------------------------------------------------ dinosaur
    write_json(os.path.join(BP, "entities/dbz_dinosaur.json"), entity("dbz:dinosaur", {
        "minecraft:type_family": {"family": ["dbz_dinosaur", "monster", "mob"]},
        "minecraft:health": {"value": 60, "max": 60}, "minecraft:attack": {"damage": 7},
        "minecraft:collision_box": {"width": 1.6, "height": 2.4},
        "minecraft:physics": {}, "minecraft:pushable": {"is_pushable": True},
        "minecraft:movement": {"value": 0.28}, "minecraft:movement.basic": {}, "minecraft:jump.static": {},
        "minecraft:navigation.walk": {"avoid_water": True}, "minecraft:follow_range": {"value": 24},
        "minecraft:behavior.nearest_attackable_target": {"priority": 2, "within_radius": 12, "must_see": True,
                                                         "entity_types": [{"filters": {"test": "is_family", "subject": "other", "value": "player"}, "max_dist": 12}]},
        "minecraft:behavior.hurt_by_target": {"priority": 1},
        "minecraft:behavior.melee_box_attack": {"priority": 3, "speed_multiplier": 1.3},
        "minecraft:behavior.random_stroll": {"priority": 6, "speed_multiplier": 0.8},
        "minecraft:behavior.look_at_player": {"priority": 7, "look_distance": 10},
        "minecraft:loot": {"table": "loot_tables/entities/dbz_dinosaur.json"},
        "minecraft:experience_reward": {"on_death": "15"},
        "minecraft:despawn": {"despawn_from_distance": {"min_distance": 48, "max_distance": 96}},
        "minecraft:knockback_resistance": {"value": 0.6},
        "minecraft:breathable": {"total_supply": 15, "suffocate_time": 0},
    }))
    write_json(os.path.join(BP, "loot_tables/entities/dbz_dinosaur.json"), {"pools": [{"rolls": 1, "entries": [
        {"type": "item", "name": "dbz:dino_meat", "weight": 1, "functions": [{"function": "set_count", "count": {"min": 2, "max": 4}}]}]}]})

    # ------------------------------------------------------------------ vehicles
    def vehicle(ident, seats, w, h, interact_text, extra=None):
        comps = {
            "minecraft:type_family": {"family": ["dbz_vehicle", "inanimate"]},
            "minecraft:collision_box": {"width": w, "height": h},
            "minecraft:physics": {"has_gravity": False},
            "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
            "minecraft:damage_sensor": {"triggers": {"cause": "all", "deals_damage": "no"}},
            "minecraft:health": {"value": 20, "max": 20},
            "minecraft:persistent": {},
            "minecraft:rideable": {"seat_count": len(seats), "family_types": ["player"], "interact_text": interact_text,
                                   "pull_in_entities": False, "seats": [{"position": s} for s in seats]},
            "minecraft:movement": {"value": 0.0}, "minecraft:knockback_resistance": {"value": 1.0},
            "minecraft:nameable": {},
        }
        if extra:
            comps.update(extra)
        return entity(ident, comps)
    write_json(os.path.join(BP, "entities/dbz_kintoun.json"), vehicle("dbz:kintoun", [[0, 0.25, 0]], 1.4, 0.5, "action.interact.dbz_ride"))
    write_json(os.path.join(BP, "entities/dbz_aircar.json"), vehicle("dbz:aircar", [[0, 0.55, -0.1], [0, 0.55, 0.6]], 1.4, 0.8, "action.interact.dbz_ride"))
    write_json(os.path.join(BP, "entities/dbz_spaceship.json"), vehicle("dbz:spaceship", [[0, 1.2, 0]], 2.4, 2.4, "action.interact.dbz_board"))
    build_player_bp()


# =============================================================================================== items & blocks
ITEMS = []        # (id, name, icon, components, category)
ITEM_GROUPS = {}  # id -> creative inventory group
EGG_ICONS = {}    # character id -> spawn egg icon (filled while building the character models)
NO_EGG = {"training_dummy"}  # placed as a block instead
ATTACHABLES = []  # (id, geometry_kind, texture_path, geometry_id)
BLOCKS = []


def item(iid, name, icon_img, components=None, category="items", stack=64):
    comps = {"minecraft:icon": f"dbz_{iid}", "minecraft:display_name": {"value": name},
             "minecraft:max_stack_size": stack}
    if components:
        comps.update(components)
    ITEMS.append((iid, name, icon_img, comps, category))


def hold_use(anim="none", move=0.35):
    return {"minecraft:food": {"nutrition": 0, "saturation_modifier": 0, "can_always_eat": True},
            "minecraft:use_modifiers": {"use_duration": 3600, "movement_modifier": move},
            "minecraft:use_animation": anim}


def wearable(slot, protection):
    return {"minecraft:wearable": {"slot": slot, "protection": protection}, "minecraft:enchantable": {"slot": slot.replace("slot.armor.", "armor_").replace("armor_chest", "armor_torso"), "value": 10},
            "minecraft:durability": {"max_durability": 400}}


def define_items():
    k = PV.AURA_COLORS
    item("ki_charge", "気溜め（長押し）", IC.flame_icon((255, 250, 220), (80, 160, 255)), hold_use("none", 0.2), "equipment", 1)
    for i, (L, col) in enumerate((("A", (255, 230, 120)), ("B", (120, 200, 255)), ("C", (255, 140, 140)), ("D", (170, 255, 150)))):
        item(f"skill_{i + 1}", f"技スロット{L}（長押しで溜め）", IC.orb_icon((255, 255, 255), col, L), hold_use("none", 0.3), "equipment", 1)
    item("transform", "変身（しゃがみ+使用で解除）", IC.bolt_icon(), {"minecraft:cooldown": {"category": "dbz_transform", "duration": 0.6}}, "equipment", 1)
    item("guard", "ガード（長押し）", IC.guard_icon(), hold_use("block", 0.4), "equipment", 1)
    item("menu", "ドラゴンメニュー", IC.menu_icon(), {"minecraft:cooldown": {"category": "dbz_menu", "duration": 0.4}}, "equipment", 1)

    item("senzu", "仙豆", IC.senzu_icon(), {"minecraft:food": {"nutrition": 20, "saturation_modifier": 1.2, "can_always_eat": True},
                                           "minecraft:use_modifiers": {"use_duration": 0.6, "movement_modifier": 1.0},
                                           "minecraft:use_animation": "eat"}, "items", 16)
    item("sacred_water", "超聖水", IC.water_icon(), {"minecraft:food": {"nutrition": 0, "saturation_modifier": 0, "can_always_eat": True},
                                                    "minecraft:use_modifiers": {"use_duration": 1.2, "movement_modifier": 1.0},
                                                    "minecraft:use_animation": "drink"}, "items", 1)
    item("dino_meat", "恐竜の肉", IC.meat_icon(False), {"minecraft:food": {"nutrition": 6, "saturation_modifier": 0.4},
                                                     "minecraft:use_modifiers": {"use_duration": 1.6, "movement_modifier": 0.35},
                                                     "minecraft:use_animation": "eat"})
    item("cooked_dino_meat", "焼いた恐竜の肉", IC.meat_icon(True), {"minecraft:food": {"nutrition": 14, "saturation_modifier": 1.0},
                                                                "minecraft:use_modifiers": {"use_duration": 1.6, "movement_modifier": 0.35},
                                                                "minecraft:use_animation": "eat"})
    item("dragon_radar", "ドラゴンレーダー", IC.radar_icon(), {"minecraft:cooldown": {"category": "dbz_radar", "duration": 0.5}}, "equipment", 1)
    item("capsule_house", "ホイポイカプセル（家）", IC.capsule_icon(num=(90, 200, 90)), {}, "equipment", 1)
    item("capsule_gravity", "ホイポイカプセル（重力室）", IC.capsule_icon(num=(220, 60, 60)), {}, "equipment", 1)
    item("capsule_aircar", "ホイポイカプセル（エアカー）", IC.capsule_icon(num=(60, 120, 230)), {}, "equipment", 1)
    item("capsule_spaceship", "ホイポイカプセル（宇宙船）", IC.capsule_icon(num=(240, 200, 40)), {}, "equipment", 1)
    item("kintoun", "筋斗雲を呼ぶ", IC.cloud_icon(), {"minecraft:cooldown": {"category": "dbz_kintoun", "duration": 2}}, "equipment", 1)
    item("nyoibo", "如意棒", IC.staff_icon(), {"minecraft:damage": 7, "minecraft:hand_equipped": True,
                                             "minecraft:cooldown": {"category": "dbz_nyoibo", "duration": 0.8},
                                             "minecraft:durability": {"max_durability": 2000}}, "equipment", 1)
    item("z_sword", "Zソード", IC.sword_icon(), {"minecraft:damage": 16, "minecraft:hand_equipped": True,
                                              "minecraft:durability": {"max_durability": 300}}, "equipment", 1)
    item("potara", "ポタラ", IC.potara_icon(), {"minecraft:cooldown": {"category": "dbz_fusion", "duration": 3}}, "items", 1)
    item("gregory_hammer", "グレゴリー用ハンマー", IC.hammer_icon(), {"minecraft:damage": 2, "minecraft:hand_equipped": True}, "equipment", 1)
    item("saiyan_tail", "サイヤ人の尻尾", IC.tail_icon(), {}, "items", 1)
    item("training_dummy", "修行用サンドバッグ", IC.dummy_icon(), {}, "items", 16)
    item("senzu_seed", "仙豆の苗（カリン塔産）", IC.senzu_icon(), {}, "items", 64)

    # wearables ---------------------------------------------------------------
    O, B = CH.ORANGE, CH.GI_BLUE

    def armor_set(base, name, layer1, layer2, icon_col, under=None, trim=None, prot=(5, 4, 2), sym=True, chest_icon=None):
        save_png(layer1, f"textures/models/armor/dbz_{base}_1")
        save_png(layer2, f"textures/models/armor/dbz_{base}_2")
        item(f"{base}_top", f"{name}（上）", chest_icon or IC.gi_icon(icon_col, under, "chest", trim, sym),
             wearable("slot.armor.chest", prot[0]), "equipment", 1)
        item(f"{base}_pants", f"{name}（下）", IC.gi_icon(icon_col, None, "legs", trim), wearable("slot.armor.legs", prot[1]), "equipment", 1)
        item(f"{base}_boots", f"{name}（靴）", IC.gi_icon(B if base != "saiyan" else (240, 238, 230), None, "feet", trim),
             wearable("slot.armor.feet", prot[2]), "equipment", 1)
        ATTACHABLES.append((f"{base}_top", "chest", f"textures/models/armor/dbz_{base}_1", None))
        ATTACHABLES.append((f"{base}_pants", "legs", f"textures/models/armor/dbz_{base}_2", None))
        ATTACHABLES.append((f"{base}_boots", "feet", f"textures/models/armor/dbz_{base}_1", None))

    armor_set("kame", "亀仙流の道着",
              MM.armor_texture(1, top=O, under=B, belt=B, boots=B, wrist=B, symbol_col=("kame", (245, 245, 240))),
              MM.armor_texture(2, pants=O, belt=B), O, B, B)
    armor_set("kai", "界王の道着",
              MM.armor_texture(1, top=O, under=B, belt=B, boots=B, wrist=B, symbol_col=("kai", (245, 245, 240))),
              MM.armor_texture(2, pants=O, belt=B), O, B, B, prot=(6, 5, 2))
    armor_set("saiyan", "サイヤ人の戦闘服",
              MM.armor_texture(1, top=CH.VEG_BLUE, armor=CH.ARMOR_WHITE, trim=CH.ARMOR_TRIM, boots=CH.ARMOR_WHITE,
                               glove=CH.ARMOR_WHITE, skin_arms=False),
              MM.armor_texture(2, pants=CH.VEG_BLUE), CH.VEG_BLUE, prot=(8, 6, 3), chest_icon=IC.gi_icon(CH.VEG_BLUE, None, "armor"))
    armor_set("weighted", "重りの道着",
              MM.armor_texture(1, top=(70, 70, 90), under=(40, 40, 50), belt=(150, 150, 160), boots=(60, 60, 70)),
              MM.armor_texture(2, pants=(70, 70, 90), belt=(150, 150, 160)), (70, 70, 90), (40, 40, 50), (150, 150, 160),
              prot=(4, 3, 1), sym=False)
    save_png(MM.armor_texture(2, pants=(245, 245, 240), belt=(230, 180, 40)), "textures/models/armor/dbz_broly_2")
    item("broly_pants", "ブロリーのズボン", IC.gi_icon((245, 245, 240), None, "legs", (230, 180, 40)),
         wearable("slot.armor.legs", 6), "equipment", 1)
    ATTACHABLES.append(("broly_pants", "legs", "textures/models/armor/dbz_broly_2", None))

    custom = [
        ("scouter", "スカウター", IC.scouter_icon(), "slot.armor.head", 1, MM.scouter_attachable()),
        ("piccolo_turban", "ピッコロのターバン", IC.turban_icon(), "slot.armor.head", 3, MM.turban_attachable()),
        ("piccolo_cape", "ピッコロのマント（重い）", IC.cape_icon(), "slot.armor.chest", 5, MM.cape_attachable()),
        ("turtle_shell", "亀の甲羅（修行用）", IC.shell_icon(), "slot.armor.chest", 3, MM.shell_attachable()),
        ("gal_panties", "ギャルのパンティー", IC.panties_icon(), "slot.armor.head", 0, MM.panties_attachable()),
    ]
    att_geos = []
    for iid, name, ic, slot, prot, m in custom:
        tex = m.render_texture()
        save_png(tex, f"textures/models/dbz/{iid}")
        att_geos.append(m)
        item(iid, name, ic, wearable(slot, prot), "equipment", 1)
        ATTACHABLES.append((iid, "custom", f"textures/models/dbz/{iid}", m.identifier))
    write_json(os.path.join(RP, "models/entity/dbz_attachables.geo.json"), geo_file(att_geos))

    # dragon balls -----------------------------------------------------------------
    kinds = (("dragonball", "星球", 7.0, "earth", MM.rgb("ff9a1a")), ("namek_ball", "ナメック星の", 11.0, "namek", MM.rgb("ffa82a")),
             ("super_ball", "超ドラゴンボール", 15.0, "super", MM.rgb("ffb21a")))
    kanji = "一二三四五六七"
    geos = []
    for prefix, label, size, kind, col in kinds:
        geo_id = f"geometry.dbz.{prefix}"
        m = MM.dragonball_block(1, size, geo_id, kind)
        geos.append(m)
        for n in range(1, 8):
            mm = MM.dragonball_block(n, size, geo_id, kind)
            save_png(mm.render_texture(), f"textures/blocks/dbz/{prefix}_{n}")
            if prefix == "dragonball":
                name = f"{kanji[n - 1]}星球（ドラゴンボール）"
            elif prefix == "namek_ball":
                name = f"ナメック星のドラゴンボール（{kanji[n - 1]}星球）"
            else:
                name = f"超ドラゴンボール（{kanji[n - 1]}星球）"
            bid = f"{prefix}_{n}"
            item(bid, name, IC.dragonball_icon(n, col, big=kind != "earth"), {"minecraft:block_placer": {"block": f"dbz:{bid}"}},
                 "items", 1)
            half = size / 2
            BLOCKS.append({
                "id": bid, "name": name, "geometry": geo_id, "texture": f"dbz_block_{bid}",
                "texture_path": f"textures/blocks/dbz/{bid}", "light": 9, "collision": [-half, 0, -half, size, min(16, size), size],
                "loot": bid, "map_color": "#ff9a1a", "render": "alpha_test", "hardness": 0.2,
            })
    gm = MM.gravity_machine_model()
    save_png(gm.render_texture(), "textures/blocks/dbz/gravity_machine")
    zs = MM.zsword_block_model()
    save_png(zs.render_texture(), "textures/blocks/dbz/zsword_stone")
    geos += [gm, zs]
    BLOCKS.append({"id": "gravity_machine", "name": "重力装置", "geometry": "geometry.dbz.gravity_machine",
                   "texture": "dbz_block_gravity_machine", "texture_path": "textures/blocks/dbz/gravity_machine",
                   "light": 6, "collision": [-5, 0, -4, 10, 15, 8], "loot": None, "map_color": "#d8d8e0", "render": "alpha_test", "hardness": -1})
    BLOCKS.append({"id": "zsword_stone", "name": "Zソードが刺さった岩", "geometry": "geometry.dbz.zsword_stone",
                   "texture": "dbz_block_zsword_stone", "texture_path": "textures/blocks/dbz/zsword_stone",
                   "light": 4, "collision": [-7, 0, -7, 14, 9, 14], "loot": None, "map_color": "#8a8a8a", "render": "alpha_test", "hardness": -1})
    write_json(os.path.join(RP, "models/blocks/dbz_blocks.geo.json"), geo_file(geos))
    # simple full blocks
    save_png(IC.block_tex(MM.rgb("5fcf9a"), 0.1, 3), "textures/blocks/dbz/namek_grass_top")
    save_png(IC.grass_side(MM.rgb("5fcf9a"), MM.rgb("9a7a5a")), "textures/blocks/dbz/namek_grass_side")
    save_png(IC.block_tex(MM.rgb("9a7a5a"), 0.12, 4), "textures/blocks/dbz/namek_dirt")
    save_png(IC.leaves_tex(MM.rgb("3aa8c0")), "textures/blocks/dbz/ajisa_leaves")
    save_png(IC.block_tex(MM.rgb("f4f4f6"), 0.02, 5, "tile"), "textures/blocks/dbz/htc_floor")
    save_png(IC.block_tex(MM.rgb("e8e2d8"), 0.04, 6, "tile"), "textures/blocks/dbz/lookout_tile")
    save_png(IC.block_tex(MM.rgb("8ad06a"), 0.1, 7), "textures/blocks/dbz/kai_grass")
    BLOCKS.append({"id": "namek_grass", "name": "ナメック星の草", "full": {"up": "dbz_namek_grass_top", "down": "dbz_namek_dirt", "side": "dbz_namek_grass_side"},
                   "textures": {"dbz_namek_grass_top": "textures/blocks/dbz/namek_grass_top", "dbz_namek_grass_side": "textures/blocks/dbz/namek_grass_side",
                                "dbz_namek_dirt": "textures/blocks/dbz/namek_dirt"}, "loot": "self", "map_color": "#5fcf9a", "hardness": 0.6, "light": 0})
    BLOCKS.append({"id": "ajisa_leaves", "name": "アジッサの葉", "full": {"*": "dbz_ajisa_leaves"}, "render": "alpha_test",
                   "textures": {"dbz_ajisa_leaves": "textures/blocks/dbz/ajisa_leaves"}, "loot": "self", "map_color": "#3aa8c0", "hardness": 0.2, "light": 0})
    # one spawn egg per character; the script spawns the fighter (dbz:egg_<character id>)
    for c in CH.CHARACTERS:
        if c["id"] in EGG_ICONS:
            item(f"egg_{c['id']}", f"{c['name']}のスポーンエッグ", EGG_ICONS[c["id"]], None, "nature")
            ITEM_GROUPS[f"egg_{c['id']}"] = "minecraft:itemGroup.name.mobEgg"
    BLOCKS.append({"id": "htc_floor", "name": "精神と時の部屋の床", "full": {"*": "dbz_htc_floor"},
                   "textures": {"dbz_htc_floor": "textures/blocks/dbz/htc_floor"}, "loot": None, "map_color": "#ffffff", "hardness": -1, "light": 15})
    BLOCKS.append({"id": "lookout_tile", "name": "神殿のタイル", "full": {"*": "dbz_lookout_tile"},
                   "textures": {"dbz_lookout_tile": "textures/blocks/dbz/lookout_tile"}, "loot": "self", "map_color": "#e8e2d8", "hardness": 2.0, "light": 0})
    BLOCKS.append({"id": "kai_grass", "name": "界王星の芝生", "full": {"*": "dbz_kai_grass"},
                   "textures": {"dbz_kai_grass": "textures/blocks/dbz/kai_grass"}, "loot": "self", "map_color": "#8ad06a", "hardness": 0.6, "light": 0})


def write_items_blocks():
    item_tex = {}
    for iid, name, icon_img, comps, cat in ITEMS:
        save_png(icon_img, f"textures/items/dbz/{iid}")
        item_tex[f"dbz_{iid}"] = {"textures": f"textures/items/dbz/{iid}"}
        write_json(os.path.join(BP, f"items/{iid}.json"), {"format_version": ITEM_FMT, "minecraft:item": {
            "description": {"identifier": f"dbz:{iid}", "menu_category": dict({"category": cat},
                                                                             **({"group": ITEM_GROUPS[iid]} if iid in ITEM_GROUPS else {}))},
            "components": comps}})
        LANG.add(f"item.dbz:{iid}.name", name)
        LANG.add(f"item.dbz:{iid}", name)
    write_json(os.path.join(RP, "textures/item_texture.json"),
               {"resource_pack_name": "dbz", "texture_name": "atlas.items", "texture_data": item_tex})

    for iid, kind, tex, geo in ATTACHABLES:
        if kind == "custom":
            desc = {"identifier": f"dbz:{iid}", "materials": {"default": "entity_alphatest"},
                    "textures": {"default": tex}, "geometry": {"default": geo},
                    "render_controllers": ["controller.render.default"]}
            if "head" in geo or iid in ("scouter", "piccolo_turban", "gal_panties"):
                desc["scripts"] = {"parent_setup": "variable.helmet_layer_visible = 0.0;"}
        else:
            g = {"chest": "geometry.humanoid.armor.chestplate", "legs": "geometry.humanoid.armor.leggings",
                 "feet": "geometry.humanoid.armor.boots"}[kind]
            setup = {"chest": "variable.chest_layer_visible = 0.0;", "legs": "variable.leg_layer_visible = 0.0;",
                     "feet": "variable.boot_layer_visible = 0.0;"}[kind]
            desc = {"identifier": f"dbz:{iid}", "materials": {"default": "armor"}, "textures": {"default": tex},
                    "geometry": {"default": g}, "scripts": {"parent_setup": setup},
                    "render_controllers": ["controller.render.dbz.armor"]}
        write_json(os.path.join(RP, f"attachables/dbz_{iid}.json"), {"format_version": "1.10.0", "minecraft:attachable": {"description": desc}})
    rc_path = os.path.join(RP, "render_controllers/dbz.render_controllers.json")
    with open(rc_path) as f:
        rc = json.load(f)
    rc["render_controllers"]["controller.render.dbz.armor"] = {"geometry": "Geometry.default", "materials": [{"*": "Material.default"}],
                                                               "textures": ["Texture.default"]}
    write_json(rc_path, rc)

    terrain = {}
    blocks_json = {"format_version": [1, 1, 0]}
    for b in BLOCKS:
        comps = {"minecraft:display_name": b["name"], "minecraft:map_color": b["map_color"],
                 "minecraft:light_emission": b.get("light", 0)}
        if b.get("hardness", 1) < 0:
            comps["minecraft:destructible_by_mining"] = False
            comps["minecraft:destructible_by_explosion"] = False
        else:
            comps["minecraft:destructible_by_mining"] = {"seconds_to_destroy": b["hardness"]}
            comps["minecraft:destructible_by_explosion"] = {"explosion_resistance": 2}
        if "geometry" in b:
            comps["dbz:interact"] = {}
            comps["minecraft:geometry"] = b["geometry"]
            comps["minecraft:material_instances"] = {"*": {"texture": b["texture"], "render_method": b["render"]}}
            x, y, z, w, h, d = b["collision"]
            comps["minecraft:collision_box"] = {"origin": [x, y, z], "size": [w, h, d]}
            comps["minecraft:selection_box"] = {"origin": [x, y, z], "size": [w, h, d]}
            terrain[b["texture"]] = {"textures": b["texture_path"]}
        else:
            comps["minecraft:geometry"] = "minecraft:geometry.full_block"
            mi = {}
            for face, tex in b["full"].items():
                key = {"side": "*", "up": "up", "down": "down"}.get(face, face)
                mi[key] = {"texture": tex, "render_method": b.get("render", "opaque")}
            comps["minecraft:material_instances"] = mi
            for tk, tp in b["textures"].items():
                terrain[tk] = {"textures": tp}
        if b["loot"] == "self":
            comps["minecraft:loot"] = f"loot_tables/blocks/dbz_{b['id']}.json"
            write_json(os.path.join(BP, f"loot_tables/blocks/dbz_{b['id']}.json"),
                       {"pools": [{"rolls": 1, "entries": [{"type": "item", "name": f"dbz:{b['id']}"}]}]})
        elif b["loot"]:
            comps["minecraft:loot"] = f"loot_tables/blocks/dbz_{b['loot']}.json"
            write_json(os.path.join(BP, f"loot_tables/blocks/dbz_{b['loot']}.json"),
                       {"pools": [{"rolls": 1, "entries": [{"type": "item", "name": f"dbz:{b['loot']}"}]}]})
        else:
            comps["minecraft:loot"] = "loot_tables/empty.json"
        write_json(os.path.join(BP, f"blocks/{b['id']}.json"), {"format_version": BLOCK_FMT, "minecraft:block": {
            "description": {"identifier": f"dbz:{b['id']}", "menu_category": {"category": "items" if "ball" in b["id"] else "construction"}},
            "components": comps}})
        blocks_json[f"dbz:{b['id']}"] = {"sound": "stone" if "grass" not in b["id"] else "grass"}
        LANG.add(f"tile.dbz:{b['id']}.name", b["name"])
        if b["loot"] == "self":
            # placeable item form for full blocks is the block itself
            pass
    write_json(os.path.join(BP, "loot_tables/empty.json"), {"pools": []})
    write_json(os.path.join(RP, "textures/terrain_texture.json"),
               {"resource_pack_name": "dbz", "texture_name": "atlas.terrain", "padding": 8, "num_mip_levels": 4,
                "texture_data": terrain})
    write_json(os.path.join(RP, "blocks.json"), blocks_json)


def recipes():
    def shaped(rid, pattern, key, result, count=1):
        write_json(os.path.join(BP, f"recipes/{rid}.json"), {"format_version": "1.20.10", "minecraft:recipe_shaped": {
            "description": {"identifier": f"dbz:{rid}"}, "tags": ["crafting_table"], "pattern": pattern,
            "key": {k: {"item": v} for k, v in key.items()}, "unlock": {"context": "AlwaysUnlocked"},
            "result": {"item": result, "count": count}}})

    def furnace(rid, inp, out):
        write_json(os.path.join(BP, f"recipes/{rid}.json"), {"format_version": "1.20.10", "minecraft:recipe_furnace": {
            "description": {"identifier": f"dbz:{rid}"}, "tags": ["furnace", "smoker", "campfire", "soul_campfire"],
            "input": inp, "output": out}})
    shaped("training_dummy", ["L", "H", "S"], {"L": "minecraft:leather", "H": "minecraft:hay_block", "S": "minecraft:stick"}, "dbz:training_dummy")
    shaped("kame_top", ["O O", "OBO", "OOO"], {"O": "minecraft:orange_wool", "B": "minecraft:blue_wool"}, "dbz:kame_top")
    shaped("kame_pants", ["OOO", "O O", "O O"], {"O": "minecraft:orange_wool"}, "dbz:kame_pants")
    shaped("kame_boots", ["B B", "B B"], {"B": "minecraft:blue_wool"}, "dbz:kame_boots")
    shaped("weighted_top", ["I I", "IWI", "III"], {"I": "minecraft:iron_block", "W": "minecraft:gray_wool"}, "dbz:weighted_top")
    shaped("weighted_pants", ["IWI", "I I", "I I"], {"I": "minecraft:iron_block", "W": "minecraft:gray_wool"}, "dbz:weighted_pants")
    shaped("weighted_boots", ["W W", "I I"], {"I": "minecraft:iron_block", "W": "minecraft:gray_wool"}, "dbz:weighted_boots")
    shaped("turtle_shell_gear", ["SSS", "SPS", "SSS"], {"S": "minecraft:turtle_scute", "P": "minecraft:leather"}, "dbz:turtle_shell")
    furnace("cooked_dino_meat", "dbz:dino_meat", "dbz:cooked_dino_meat")


# =============================================================================================== data for scripts
def export_script_data():
    lines = ["// Generated by tools/gen/build.py — do not edit by hand.", ""]

    def js(name, value):
        lines.append(f"export const {name} = {json.dumps(value, ensure_ascii=False, indent=2)};")
        lines.append("")
    js("CHARS", [{"id": c["id"], "name": c["name"], "scale": c["scale"], "size": c["size"], "aura": c["aura"]} for c in CH.CHARACTERS])
    js("CHAR_INDEX", {c["id"]: i for i, c in enumerate(CH.CHARACTERS)})
    js("HAIR_STYLE", {s: i for i, s in enumerate(PV.HAIR_STYLES)})
    js("HAIR_COLOR", {n: i for i, (n, _) in enumerate(PV.HAIR_COLORS)})
    js("AURA", {n: i for i, (n, _, _) in enumerate(PV.AURA_COLORS)})
    js("AURA_RGB", {n: [round(e[0] / 255, 3), round(e[1] / 255, 3), round(e[2] / 255, 3)] for (n, c, e) in PV.AURA_COLORS})
    js("OVERLAY", {n: i for i, (n, _) in enumerate(PV.OVERLAYS)})
    js("KI_COLOR", {n: i for i, (n, _, _) in enumerate(MM.KI_COLORS)})
    js("KI_RGB", {n: [round(e[0] / 255, 3), round(e[1] / 255, 3), round(e[2] / 255, 3)] for (n, c, e) in MM.KI_COLORS})
    js("POSE", {n: i for i, n in enumerate(POSES)})
    js("HP_TIERS", HP_TIERS)
    js("SIZES", list(SIZES.keys()))
    write_text(os.path.join(BP, "scripts", "gen", "catalog.js"), "\n".join(lines))


# =============================================================================================== manifests & packaging
def manifests():
    rp_uuid = stable_uuid("rp-header")
    bp_uuid = stable_uuid("bp-header")
    write_json(os.path.join(RP, "manifest.json"), {
        "format_version": 2,
        "header": {"name": "§6ドラゴンボール §fリソース", "description": "ドラゴンボールアドオン（個人用）リソースパック",
                   "uuid": rp_uuid, "version": VERSION, "min_engine_version": MIN_ENGINE},
        "modules": [{"type": "resources", "uuid": stable_uuid("rp-module"), "version": VERSION}],
        "dependencies": [{"uuid": bp_uuid, "version": VERSION}],
    })
    write_json(os.path.join(BP, "manifest.json"), {
        "format_version": 2,
        "header": {"name": "§6ドラゴンボール §fビヘイビア", "description": "ドラゴンボールアドオン（個人用）ビヘイビアパック",
                   "uuid": bp_uuid, "version": VERSION, "min_engine_version": MIN_ENGINE},
        "modules": [{"type": "data", "uuid": stable_uuid("bp-data"), "version": VERSION},
                    {"type": "script", "language": "javascript", "uuid": stable_uuid("bp-script"), "version": VERSION,
                     "entry": "scripts/main.js"}],
        "dependencies": [{"uuid": rp_uuid, "version": VERSION},
                         {"module_name": "@minecraft/server", "version": "2.4.0"},
                         {"module_name": "@minecraft/server-ui", "version": "2.0.0"}],
    })
    icon = IC.dragonball_icon(4).resize((256, 256), 0)
    icon.save(os.path.join(RP, "pack_icon.png"))
    icon.save(os.path.join(BP, "pack_icon.png"))


def lang_common():
    LANG.add("pack.name", "ドラゴンボール")
    LANG.add("pack.description", "ドラゴンボールアドオン")
    LANG.add("action.interact.dbz_talk", "話す")
    LANG.add("action.interact.dbz_ride", "乗る")
    LANG.add("action.interact.dbz_board", "乗り込む")
    LANG.add("entity.dbz:fighter.name", "戦士")
    LANG.add("entity.dbz:ki_blast.name", "気弾")
    LANG.add("entity.dbz:beam.name", "気功波")
    LANG.add("entity.dbz:dragon.name", "神龍")
    LANG.add("entity.dbz:dinosaur.name", "恐竜")
    LANG.add("entity.dbz:kintoun.name", "筋斗雲")
    LANG.add("entity.dbz:aircar.name", "エアカー")
    LANG.add("entity.dbz:spaceship.name", "宇宙船")


def package():
    dist = os.path.join(ROOT, "dist")
    os.makedirs(dist, exist_ok=True)
    out = os.path.join(dist, "DragonBall.mcaddon")
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


def clean():
    keep_scripts = os.path.join(BP, "scripts")
    for pack in (RP, BP):
        if not os.path.isdir(pack):
            continue
        for name in os.listdir(pack):
            full = os.path.join(pack, name)
            if full == keep_scripts:
                gen = os.path.join(full, "gen")
                if os.path.isdir(gen):
                    shutil.rmtree(gen)
                continue
            if os.path.isdir(full):
                shutil.rmtree(full)
            else:
                os.remove(full)


def main():
    clean()
    lang_common()
    build_rp({})
    build_entities()
    define_items()
    write_items_blocks()
    recipes()
    export_script_data()
    manifests()
    LANG.write()
    if "--no-package" not in sys.argv:
        print("packaged:", package())


if __name__ == "__main__":
    main()
