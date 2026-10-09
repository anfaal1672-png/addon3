"""Character catalogue: visuals for every fighter variant (NPCs, allies, enemies, bosses).

Each entry: id -> dict(name, spec, scale, size, ...). The order of CHARACTERS defines the
`dbz:char` property index used by both the resource pack arrays and the scripts.
"""
from humanoid import (gi, arms_preset, legs_preset, symbol, vneck, armor_front, stripe_v, spots, WHITE, BLACK, SKIN)
from model import rgb, mul

ORANGE = rgb("f08a24")
GI_BLUE = rgb("2a4fb4")
NAVY = rgb("1d2a6e")
VEG_BLUE = rgb("2b3fa8")
GOLD = rgb("ffd43a")
SSJ_GOLD = rgb("ffe24a")
SSJ2_GOLD = rgb("fff07a")
GOD_RED = rgb("e0304a")
BLUE_HAIR = rgb("38d6ff")
SILVER = rgb("d8e2f2")
UE_PURPLE = rgb("8a3bd6")
ROSE_PINK = rgb("ff5fa8")
LSSJ_GREEN = rgb("b8f03a")
HAIR_BLACK = rgb("1b1a22")
GREEN_SKIN = rgb("6cbf4a")
PURPLE_GI = rgb("5b2a86")
PINK_BUU = rgb("f7a3c8")
FRIEZA_WHITE = rgb("f2f0f6")
FRIEZA_PURPLE = rgb("8e3fb8")
CELL_GREEN = rgb("4fa75a")
RED = rgb("c8282c")
YELLOW = rgb("f4cf2a")
BROWN = rgb("7a4a2a")
GREY = rgb("8a8f9a")
ARMOR_WHITE = rgb("f1efe6")
ARMOR_TRIM = rgb("d9b23a")
SKIN_TAN = rgb("e3b088")
SKIN_DARK = rgb("c48b5e")

CHARACTERS = []
INDEX = {}


def add(cid, name, spec, scale=1.0, size="normal", aura=1, **kw):
    entry = {"id": cid, "name": name, "spec": spec, "scale": scale, "size": size, "aura": aura}
    entry.update(kw)
    INDEX[cid] = len(CHARACTERS)
    CHARACTERS.append(entry)
    return entry


# ----------------------------------------------------------------------------- Son family

def goku_spec(hair_style="goku", hair_col=HAIR_BLACK, eyes="normal", brows="normal", gi_col=ORANGE, under=GI_BLUE,
              kanji="kai", mouth="normal", front=0.25):
    return {
        "skin": SKIN,
        "head": {"hair": hair_col, "eyes": eyes, "brows": brows, "front": front, "mouth": mouth},
        "torso": gi(gi_col, under, GI_BLUE if gi_col == ORANGE else rgb("8a8a8a"), kanji, kanji),
        "arms": arms_preset(SKIN, band=under),
        "legs": legs_preset(gi_col, GI_BLUE if gi_col == ORANGE else rgb("3a3a44"), 0.28, trim=rgb("d43a2a")),
        "hair": (hair_style, hair_col),
    }


add("goku", "孫悟空", goku_spec(), aura=1)
add("goku_ssj", "孫悟空(超サイヤ人)", goku_spec("ssj", SSJ_GOLD, "ssj", "angry"), aura=2)
add("goku_ssj3", "孫悟空(超サイヤ人3)", goku_spec("ssj3", SSJ_GOLD, "ssj", "ridge"), aura=3)
add("goku_god", "孫悟空(超サイヤ人ゴッド)", goku_spec("goku", GOD_RED, "red", "normal"), aura=4)
add("goku_blue", "孫悟空(超サイヤ人ブルー)", goku_spec("ssj", BLUE_HAIR, "ssj", "angry"), aura=5)
add("goku_ui", "孫悟空(身勝手の極意)", goku_spec("goku", SILVER, "silver", "angry"), aura=6)

GOHAN_GI = {
    "skin": SKIN,
    "head": {"hair": HAIR_BLACK, "front": 0.22},
    "torso": gi(PURPLE_GI, None, RED, None) + [("front", vneck(mul(PURPLE_GI, 0.7), 0.35, 0.45))],
    "arms": arms_preset(SKIN, sleeve=PURPLE_GI, sleeve_len=0.25, band=RED),
    "legs": legs_preset(PURPLE_GI, rgb("6a3a2a"), 0.25),
    "hair": ("gohan", HAIR_BLACK),
}
add("gohan", "孫悟飯", GOHAN_GI)
g2 = dict(GOHAN_GI)
g2["head"] = {"hair": SSJ_GOLD, "front": 0.22, "eyes": "ssj", "brows": "angry"}
g2["hair"] = ("ssj2", SSJ_GOLD)
add("gohan_ssj2", "孫悟飯(超サイヤ人2)", g2, aura=3)
add("goten", "孫悟天", dict(goku_spec("goten"), build="kid"), scale=1.0, size="small")
gt = dict(goku_spec("ssj", SSJ_GOLD, "ssj", "angry"))
gt["build"] = "kid"
add("goten_ssj", "孫悟天(超サイヤ人)", gt, size="small", aura=2)

# ----------------------------------------------------------------------------- Vegeta family

def vegeta_spec(hair_col=HAIR_BLACK, eyes="sharp", style="vegeta", armor=True):
    torso = [("fill", VEG_BLUE)]
    if armor:
        torso += [("front", armor_front(ARMOR_WHITE, ARMOR_TRIM)), ("back", armor_front(ARMOR_WHITE, ARMOR_TRIM)),
                  ("sides", armor_front(ARMOR_WHITE, ARMOR_TRIM))]
    return {
        "skin": SKIN,
        "head": {"hair": hair_col, "eyes": eyes, "brows": "angry", "front": 0.2, "widow": True, "mouth": "frown"},
        "torso": torso,
        "arms": arms_preset(VEG_BLUE, glove=ARMOR_WHITE, glove_len=0.3),
        "legs": legs_preset(VEG_BLUE, ARMOR_WHITE, 0.3, trim=ARMOR_TRIM),
        "hair": (style, hair_col),
    }


add("vegeta", "ベジータ", vegeta_spec())
add("vegeta_ssj", "ベジータ(超サイヤ人)", vegeta_spec(SSJ_GOLD, "ssj"), aura=2)
add("vegeta_blue", "ベジータ(超サイヤ人ブルー)", vegeta_spec(BLUE_HAIR, "ssj"), aura=5)
add("vegeta_ue", "ベジータ(我儘の極意)", vegeta_spec(UE_PURPLE, "pink"), aura=7)

TRUNKS = {
    "skin": SKIN,
    "head": {"hair": rgb("b9a6e6"), "front": 0.3, "eyes": "sharp"},
    "torso": [("fill", rgb("1f3f8a")), ("rows", 0.82, 0.92, rgb("e0b030")), ("front", stripe_v(rgb("272727"), 0.38, 0.62)),
              ("front", symbol("cc", "right", size=0.28, y=0.2))],
    "arms": arms_preset(rgb("1f3f8a"), sleeve=rgb("1f3f8a"), sleeve_len=0.3),
    "legs": legs_preset(rgb("3a3a3a"), rgb("e0c070"), 0.3),
    "hair": ("trunks", rgb("b9a6e6")),
    "parts": [("sword_back", {})],
}
add("trunks", "トランクス", TRUNKS)
t2 = dict(TRUNKS)
t2["head"] = {"hair": SSJ_GOLD, "front": 0.25, "eyes": "ssj", "brows": "angry"}
t2["hair"] = ("ssj", SSJ_GOLD)
add("trunks_ssj", "トランクス(超サイヤ人)", t2, aura=2)

# ----------------------------------------------------------------------------- Z fighters

PICCOLO = {
    "skin": GREEN_SKIN,
    "head": {"hair": None, "eyes": "sharp", "brows": "angry", "mouth": "frown", "top": WHITE},
    "torso": gi(PURPLE_GI, None, rgb("3aa0d0"), None),
    "arms": arms_preset(GREEN_SKIN, band=rgb("c03030")) + [("rows", 0.2, 0.42, rgb("e8a0b0"))],
    "legs": legs_preset(PURPLE_GI, rgb("7a4a2a"), 0.22),
    "parts": [("turban", {}), ("cape", {"color": WHITE, "pad": WHITE})],
}
add("piccolo", "ピッコロ", PICCOLO)
OP = dict(PICCOLO)
OP["skin"] = rgb("f08a3a")
OP["head"] = {"hair": None, "eyes": "beast", "brows": "angry", "mouth": "fangs", "top": rgb("f08a3a")}
OP["parts"] = [("antennae", {"color": rgb("f08a3a"), "len": 5})]
OP["build"] = "big"
OP["arms"] = arms_preset(rgb("f08a3a"), band=rgb("c03030")) + [("rows", 0.2, 0.42, rgb("ffb08a"))]
add("piccolo_orange", "オレンジピッコロ", OP, aura=4, size="big")

def krillin_dots(f):
    if f.name == "north":
        for i in range(3):
            for j in range(2):
                f.rect(int(f.w * (0.36 + i * 0.12)), int(f.h * (0.08 + j * 0.12)), int(f.w * (0.36 + i * 0.12)) + 2,
                       int(f.h * (0.08 + j * 0.12)) + 2, (90, 70, 60), shade=False)


add("krillin", "クリリン", {
    "build": "short", "skin": SKIN,
    "head": {"hair": None, "top": SKIN, "mouth": "grin", "extra": [krillin_dots]},
    "torso": gi(ORANGE, GI_BLUE, GI_BLUE, "kame", "kame"),
    "arms": arms_preset(SKIN, band=GI_BLUE),
    "legs": legs_preset(ORANGE, GI_BLUE, 0.28),
}, size="small")
add("tien", "天津飯", {
    "skin": SKIN,
    "head": {"hair": None, "top": SKIN, "eyes": "three", "brows": "angry"},
    "torso": [("fill", rgb("2c8a4a")), ("rows", 0.82, 0.92, RED)],
    "arms": arms_preset(SKIN, band=rgb("2c8a4a")),
    "legs": legs_preset(rgb("f2e8c8"), rgb("4a4a4a"), 0.25),
})
add("yamcha", "ヤムチャ", {
    "skin": SKIN_TAN,
    "head": {"hair": HAIR_BLACK, "front": 0.3, "extra": []},
    "torso": gi(ORANGE, GI_BLUE, GI_BLUE, "kame"),
    "arms": arms_preset(SKIN_TAN, band=GI_BLUE),
    "legs": legs_preset(ORANGE, GI_BLUE, 0.28),
    "hair": ("yamcha", HAIR_BLACK),
})
add("roshi", "亀仙人", {
    "skin": SKIN, "build": "short",
    "head": {"hair": None, "top": SKIN, "eyes": "blank", "mouth": "beard"},
    "torso": [("fill", rgb("e8902a")), ("front", symbol("kame", "center", size=0.5, y=0.45))],
    "arms": arms_preset(SKIN, sleeve=rgb("e8902a"), sleeve_len=0.5),
    "legs": legs_preset(rgb("e8902a"), rgb("6a4a2a"), 0.2),
    "parts": [("shell", {}), ("beard_long", {})],
}, size="small")
add("bulma", "ブルマ", {
    "skin": SKIN,
    "head": {"hair": rgb("39b6d8"), "front": 0.3},
    "torso": [("fill", rgb("e04a6a")), ("front", symbol("cc", "left", size=0.3, y=0.3))],
    "arms": arms_preset(SKIN),
    "legs": legs_preset(rgb("2a4a8a"), rgb("e04a6a"), 0.2),
    "hair": ("bob", rgb("39b6d8")),
})
add("karin", "カリン様", {
    "build": "tiny", "skin": rgb("f4f2ea"),
    "head": {"hair": None, "top": rgb("f4f2ea"), "eyes": "closed", "mouth": "muzzle"},
    "torso": [("fill", rgb("f4f2ea"))],
    "arms": [("fill", rgb("f4f2ea"))],
    "legs": [("fill", rgb("f4f2ea"))],
    "parts": [("cat_ears", {"color": rgb("f4f2ea"), "len": 2.5}), ("tail", {"color": rgb("f4f2ea"), "thick": 1.4}),
              ("staff", {})],
}, size="small")
add("yajirobe", "ヤジロベー", {
    "build": "fat", "skin": SKIN_TAN,
    "head": {"hair": HAIR_BLACK, "front": 0.28},
    "torso": [("fill", rgb("6a8a4a")), ("rows", 0.75, 0.85, rgb("3a3a3a"))],
    "arms": arms_preset(SKIN_TAN, sleeve=rgb("6a8a4a"), sleeve_len=0.3),
    "legs": legs_preset(rgb("7a5a3a"), rgb("3a3a3a"), 0.25),
    "hair": ("short", HAIR_BLACK),
    "parts": [("katana_hip", {})],
}, size="fat")
add("kaio", "界王様", {
    "build": "fat", "skin": rgb("3c6fd0"),
    "head": {"hair": None, "top": rgb("3c6fd0"), "eyes": "blank", "mouth": "grin"},
    "torso": [("fill", rgb("22222a")), ("front", symbol("kai", "center", size=0.5, y=0.4, color_bg=rgb("f0e070")))],
    "arms": arms_preset(rgb("3c6fd0"), sleeve=rgb("22222a"), sleeve_len=0.85),
    "legs": legs_preset(rgb("22222a"), rgb("e0e0e0"), 0.25),
    "parts": [("antennae", {"color": BLACK, "len": 4})],
}, size="fat")
add("bubbles", "バブルス", {
    "build": "tiny", "skin": rgb("5a3a2a"),
    "head": {"hair": None, "top": rgb("5a3a2a"), "mouth": "muzzle", "skin": rgb("5a3a2a")},
    "torso": [("fill", rgb("5a3a2a"))], "arms": [("fill", rgb("5a3a2a"))], "legs": [("fill", rgb("5a3a2a"))],
    "parts": [("monkey_ears", {"color": rgb("e0b090")}), ("tail", {"color": rgb("5a3a2a"), "thick": 1.2})],
}, size="small")
add("gregory", "グレゴリー", {
    "build": "tiny", "skin": rgb("6aa050"),
    "head": {"hair": None, "top": rgb("6aa050"), "eyes": "insect", "mouth": "none"},
    "torso": [("fill", rgb("6aa050"))], "arms": [("fill", rgb("6aa050"))], "legs": [("fill", rgb("6aa050"))],
    "parts": [("wings", {"color": rgb("c8e8b0")}), ("antennae", {"color": rgb("4a7a3a"), "len": 5})],
}, size="small")
add("elder_kai", "老界王神", {
    "build": "short", "skin": rgb("e6b8d8"),
    "head": {"hair": None, "top": rgb("e6b8d8"), "eyes": "closed", "mouth": "beard"},
    "torso": [("fill", rgb("2a3a8a")), ("rows", 0.8, 0.9, rgb("f0e070"))],
    "arms": arms_preset(rgb("e6b8d8"), sleeve=rgb("2a3a8a"), sleeve_len=0.7),
    "legs": legs_preset(rgb("f2f2f2"), rgb("8a5a2a"), 0.2),
    "hair": ("mohawk", WHITE), "parts": [("earrings", {})],
}, size="small")
add("guru", "最長老", {
    "build": "fat", "skin": GREEN_SKIN, "head_size": 10,
    "head": {"hair": None, "top": GREEN_SKIN, "eyes": "closed", "mouth": "normal"},
    "torso": [("fill", WHITE)], "arms": arms_preset(GREEN_SKIN, sleeve=WHITE, sleeve_len=0.6),
    "legs": [("fill", WHITE)], "parts": [("antennae", {"color": GREEN_SKIN, "len": 4})],
}, scale=1.4, size="fat")
add("namekian", "ナメック星人", {
    "skin": GREEN_SKIN,
    "head": {"hair": None, "top": GREEN_SKIN, "eyes": "normal", "mouth": "normal"},
    "torso": [("fill", WHITE), ("rows", 0.82, 0.9, rgb("3a7ad0"))],
    "arms": arms_preset(GREEN_SKIN, sleeve=WHITE, sleeve_len=0.3) + [("rows", 0.35, 0.55, rgb("e8a0b0"))],
    "legs": legs_preset(WHITE, rgb("7a4a2a"), 0.2),
    "parts": [("antennae", {"color": GREEN_SKIN, "len": 3.5})],
})
add("announcer", "アナウンサー", {
    "skin": SKIN,
    "head": {"hair": rgb("f0d060"), "eyes": "blank", "mouth": "grin"},
    "torso": [("fill", rgb("2a2a2a")), ("front", vneck(WHITE, 0.5, 0.4)), ("front", stripe_v(RED, 0.46, 0.54))],
    "arms": arms_preset(SKIN, sleeve=rgb("2a2a2a"), sleeve_len=0.9),
    "legs": legs_preset(rgb("2a2a2a"), BLACK, 0.15),
    "hair": ("short", rgb("f0d060")),
})
add("whis", "ウイス", {
    "build": "tall", "skin": rgb("7f9ccf"),
    "head": {"hair": WHITE, "front": 0.12, "eyes": "normal", "mouth": "normal", "top": WHITE},
    "torso": [("fill", rgb("a0285a")), ("front", stripe_v(rgb("f0d080"), 0.4, 0.6)), ("rows", 0.85, 1.0, BLACK)],
    "arms": arms_preset(rgb("7f9ccf"), sleeve=rgb("a0285a"), sleeve_len=0.85),
    "legs": legs_preset(BLACK, rgb("f0f0f0"), 0.2),
    "hair": ("whis", WHITE), "parts": [("halo_ring", {}), ("staff", {})],
}, size="tall")
add("beerus", "ビルス", {
    "skin": rgb("7a5aa0"),
    "head": {"hair": None, "top": rgb("7a5aa0"), "eyes": "cat", "brows": "ridge", "mouth": "frown"},
    "torso": [("fill", rgb("7a5aa0")), ("rows", 0.0, 0.25, rgb("f0d060")), ("rows", 0.72, 1.0, BLACK)],
    "arms": arms_preset(rgb("7a5aa0"), band=rgb("f0d060")),
    "legs": legs_preset(rgb("1a1a2a"), rgb("f0d060"), 0.2),
    "parts": [("cat_ears", {"color": rgb("7a5aa0"), "len": 5}), ("tail", {"color": rgb("7a5aa0"), "thick": 1.4})],
}, aura=7)

# ----------------------------------------------------------------------------- Villains

add("raditz", "ラディッツ", dict(vegeta_spec(HAIR_BLACK, "sharp", "raditz"), build="big"), size="big")
add("nappa", "ナッパ", {
    "build": "huge", "skin": SKIN_TAN,
    "head": {"hair": None, "top": SKIN_TAN, "eyes": "sharp", "brows": "angry", "mouth": "mustache"},
    "torso": [("fill", rgb("2a2a3a")), ("front", armor_front(ARMOR_WHITE, rgb("8a5a2a"))),
              ("back", armor_front(ARMOR_WHITE, rgb("8a5a2a")))],
    "arms": arms_preset(SKIN_TAN, band=rgb("2a2a3a")),
    "legs": legs_preset(rgb("2a2a3a"), ARMOR_WHITE, 0.3),
}, size="huge")
add("saibaman", "サイバイマン", {
    "build": "tiny", "skin": rgb("5aa040"), "head_size": 9,
    "head": {"hair": None, "top": rgb("5aa040"), "eyes": "red", "mouth": "fangs",
             "extra": [spots(rgb("3a7a2a"), 5, 1.0)]},
    "torso": [("fill", rgb("5aa040")), ("all", spots(rgb("3a7a2a"), 4, 1.0))],
    "arms": [("fill", rgb("5aa040"))], "legs": [("fill", rgb("5aa040"))],
}, size="small")
add("ginyu", "ギニュー", {
    "build": "big", "skin": rgb("8a5aa8"),
    "head": {"hair": None, "top": rgb("8a5aa8"), "eyes": "sharp", "brows": "angry"},
    "torso": [("fill", BLACK), ("front", armor_front(ARMOR_WHITE, rgb("e0b030"))), ("back", armor_front(ARMOR_WHITE, rgb("e0b030")))],
    "arms": arms_preset(rgb("8a5aa8"), glove=WHITE, glove_len=0.3),
    "legs": legs_preset(BLACK, WHITE, 0.3, trim=rgb("e0b030")),
    "parts": [("horns", {"color": rgb("4a2a5a"), "len": 3.5, "spread": 10})],
}, size="big")
add("recoome", "リクーム", {
    "build": "huge", "skin": SKIN_TAN,
    "head": {"hair": rgb("d04020"), "eyes": "sharp", "mouth": "grin", "front": 0.15},
    "torso": [("fill", BLACK), ("front", armor_front(ARMOR_WHITE, rgb("e0b030")))],
    "arms": arms_preset(SKIN_TAN, glove=WHITE), "legs": legs_preset(BLACK, WHITE, 0.3),
    "hair": ("recoome", rgb("d04020")),
}, size="huge")
add("burter", "バータ", {
    "build": "tall", "skin": rgb("3a7ad0"),
    "head": {"hair": None, "top": rgb("3a7ad0"), "eyes": "red", "mouth": "frown"},
    "torso": [("fill", BLACK), ("front", armor_front(ARMOR_WHITE, rgb("e0b030")))],
    "arms": arms_preset(rgb("3a7ad0"), glove=WHITE), "legs": legs_preset(BLACK, WHITE, 0.3),
}, size="tall")
add("jeice", "ジース", {
    "skin": rgb("d84a3a"),
    "head": {"hair": WHITE, "eyes": "sharp", "mouth": "grin"},
    "torso": [("fill", BLACK), ("front", armor_front(ARMOR_WHITE, rgb("e0b030")))],
    "arms": arms_preset(rgb("d84a3a"), glove=WHITE), "legs": legs_preset(BLACK, WHITE, 0.3),
    "hair": ("jeice", WHITE),
})
add("guldo", "グルド", {
    "build": "tiny", "skin": rgb("6ab050"), "head_size": 9,
    "head": {"hair": None, "top": rgb("6ab050"), "eyes": "four", "mouth": "frown"},
    "torso": [("fill", BLACK), ("front", armor_front(ARMOR_WHITE, rgb("e0b030")))],
    "arms": arms_preset(rgb("6ab050")), "legs": legs_preset(BLACK, WHITE, 0.3),
}, size="small")


def frieza(form):
    base = {"skin": FRIEZA_WHITE, "torso": [("fill", FRIEZA_WHITE)], "arms": [("fill", FRIEZA_WHITE)],
            "legs": [("fill", FRIEZA_WHITE)],
            "parts": [("tail", {"color": FRIEZA_WHITE, "thick": 2.6, "length": 7})]}
    if form == 1:
        base["head"] = {"hair": None, "top": FRIEZA_PURPLE, "eyes": "red", "brows": "none", "mouth": "frown"}
        base["torso"] = [("fill", rgb("3a2a5a")), ("front", armor_front(ARMOR_WHITE, rgb("6a4a8a")))]
        base["parts"] += [("horns", {"color": rgb("2a2a2a"), "len": 3, "spread": 5}), ("dome", {"color": FRIEZA_PURPLE})]
        base["build"] = "short"
    elif form == 2:
        base["head"] = {"hair": None, "top": FRIEZA_PURPLE, "eyes": "red", "brows": "none", "mouth": "fangs"}
        base["parts"] += [("horns", {"color": rgb("2a2a2a"), "len": 6, "spread": 0, "back": -15}),
                          ("dome", {"color": FRIEZA_PURPLE})]
        base["torso"] = [("fill", FRIEZA_WHITE), ("rows", 0.1, 0.5, FRIEZA_PURPLE)]
        base["build"] = "big"
    elif form == 3:
        base["head"] = {"hair": None, "top": FRIEZA_PURPLE, "eyes": "red", "brows": "none", "mouth": "frown"}
        base["parts"] += [("long_head", {"color": FRIEZA_WHITE, "tip": FRIEZA_PURPLE})]
        base["torso"] = [("fill", FRIEZA_WHITE), ("rows", 0.1, 0.4, FRIEZA_PURPLE)]
        base["build"] = "tall"
    elif form in (4, 5):
        base["head"] = {"hair": None, "top": FRIEZA_PURPLE, "eyes": "red", "brows": "none", "mouth": "normal"}
        base["parts"] += [("dome", {"color": FRIEZA_PURPLE, "h": 2})]
        base["torso"] = [("fill", FRIEZA_WHITE), ("front", lambda f: f.circle(f.w / 2, f.h * 0.3, f.w * 0.15, FRIEZA_PURPLE))]
        base["arms"] = arms_preset(FRIEZA_WHITE, glove=FRIEZA_PURPLE, glove_len=0.2) + [("rows", 0.0, 0.12, FRIEZA_PURPLE)]
        base["legs"] = legs_preset(FRIEZA_WHITE, FRIEZA_PURPLE, 0.2)
        if form == 5:
            gold = rgb("f6c83a")
            base["skin"] = gold
            base["torso"] = [("fill", gold), ("front", lambda f: f.circle(f.w / 2, f.h * 0.3, f.w * 0.15, FRIEZA_PURPLE))]
            base["arms"] = arms_preset(gold, glove=FRIEZA_PURPLE, glove_len=0.2)
            base["legs"] = legs_preset(gold, FRIEZA_PURPLE, 0.2)
            base["head"]["skin"] = gold
            base["parts"][0] = ("tail", {"color": gold, "thick": 2.6, "length": 7})
    return base


add("frieza1", "フリーザ(第一形態)", frieza(1), aura=11, size="small")
add("frieza2", "フリーザ(第二形態)", frieza(2), aura=11, size="big")
add("frieza3", "フリーザ(第三形態)", frieza(3), aura=11, size="tall")
add("frieza4", "フリーザ(最終形態)", frieza(4), aura=11)
add("frieza_golden", "ゴールデンフリーザ", frieza(5), aura=12)

ANDROID_EYES = "android"
add("android17", "人造人間17号", {
    "skin": SKIN, "head": {"hair": HAIR_BLACK, "eyes": ANDROID_EYES, "front": 0.3},
    "torso": [("fill", BLACK), ("front", symbol("rr", "left", color_bg=RED, color_fg=WHITE, size=0.26))],
    "arms": arms_preset(SKIN, sleeve=rgb("2a4a7a"), sleeve_len=0.6),
    "legs": legs_preset(rgb("2a4a7a"), rgb("e8e8d8"), 0.2),
    "hair": ("a17", HAIR_BLACK), "parts": [("scarf", {"color": rgb("f07a2a")})],
})
add("android18", "人造人間18号", {
    "skin": SKIN, "head": {"hair": rgb("f6e080"), "eyes": ANDROID_EYES, "front": 0.3},
    "torso": [("fill", rgb("e8e8f0")), ("front", stripe_v(BLACK, 0.0, 0.3)), ("front", stripe_v(BLACK, 0.7, 1.0))],
    "arms": arms_preset(SKIN, sleeve=rgb("e8e8f0"), sleeve_len=0.8),
    "legs": legs_preset(rgb("3a5aa0"), rgb("6a4a2a"), 0.2),
    "hair": ("bob", rgb("f6e080")),
})
add("android16", "人造人間16号", {
    "build": "huge", "skin": SKIN_TAN, "head": {"hair": rgb("e0602a"), "eyes": ANDROID_EYES, "front": 0.1},
    "torso": [("fill", rgb("3a6a3a")), ("front", armor_front(rgb("4a8a4a"), rgb("2a4a2a")))],
    "arms": arms_preset(SKIN_TAN, glove=rgb("3a6a3a")), "legs": legs_preset(rgb("4a4a4a"), rgb("3a6a3a"), 0.3),
    "hair": ("mohawk", rgb("e0602a")),
}, size="huge")
add("android19", "人造人間19号", {
    "build": "fat", "skin": rgb("f2f2f2"), "head": {"hair": None, "top": rgb("f2f2f2"), "eyes": ANDROID_EYES},
    "torso": [("fill", rgb("6a7a6a")), ("rows", 0.75, 0.85, rgb("e0b030"))],
    "arms": arms_preset(rgb("f2f2f2"), glove=rgb("6a7a6a")), "legs": legs_preset(rgb("6a7a6a"), rgb("4a4a4a"), 0.3),
    "parts": [("hat", {"color": rgb("6a7a6a"), "h": 2})],
}, size="fat")
add("android20", "人造人間20号(ドクター・ゲロ)", {
    "skin": SKIN, "head": {"hair": WHITE, "eyes": ANDROID_EYES, "mouth": "mustache", "front": 0.12},
    "torso": [("fill", rgb("d8d0b0")), ("front", symbol("rr", "left", color_bg=RED, color_fg=WHITE, size=0.26))],
    "arms": arms_preset(SKIN, sleeve=rgb("d8d0b0"), sleeve_len=0.8), "legs": legs_preset(rgb("2a2a2a"), BLACK, 0.2),
    "hair": ("gero", WHITE), "parts": [("hat", {"color": rgb("e8e0c8"), "h": 2.5, "brim": True})],
})


def cell(form):
    green = CELL_GREEN
    spec = {"skin": green, "head": {"hair": None, "top": green, "eyes": "pink", "brows": "ridge",
                                    "extra": [spots(rgb("1f3f25"), 6, 0.8)]},
            "torso": [("fill", green), ("all", spots(rgb("1f3f25"), 10, 1.0)), ("rows", 0.85, 1.0, BLACK)],
            "arms": [("fill", green), ("all", spots(rgb("1f3f25"), 4, 0.9))],
            "legs": [("fill", rgb("f0f0f0")), ("rows", 0.0, 0.6, green), ("all", spots(rgb("1f3f25"), 3, 0.9))],
            "parts": [("crest", {"color": rgb("2a5a30")}), ("wings", {"color": rgb("1a1a1a")})]}
    if form == 1:
        spec["build"] = "tall"
        spec["head"] = {"hair": None, "top": green, "eyes": "insect", "mouth": "beak"}
        spec["parts"] = [("crest", {"color": rgb("2a5a30")}), ("wings", {"color": rgb("1a1a1a")}),
                         ("tail", {"color": green, "thick": 2.4, "length": 8, "stinger": True})]
    elif form == 2:
        spec["build"] = "big"
        spec["head"]["mouth"] = "beak"
        spec["parts"].append(("tail", {"color": green, "thick": 2.4, "length": 7, "stinger": True}))
    return spec


add("cell1", "セル(第一形態)", cell(1), size="tall", aura=1)
add("cell2", "セル(第二形態)", cell(2), size="big", aura=1)
add("cell", "セル(完全体)", cell(3), aura=2)
add("cell_super", "パーフェクトセル", cell(3), aura=3)
add("cell_jr", "セルジュニア", dict(cell(3), build="tiny", skin=rgb("3a8ad0")), size="small", aura=1)

add("dabura", "ダーブラ", {
    "skin": rgb("d03a3a"), "head": {"hair": None, "top": rgb("d03a3a"), "eyes": "sharp", "brows": "angry", "mouth": "frown"},
    "torso": [("fill", rgb("5a2a6a")), ("front", symbol("majin_m", "center", color_fg=BLACK, size=0.5, y=0.4))],
    "arms": arms_preset(rgb("d03a3a"), sleeve=rgb("5a2a6a"), sleeve_len=0.5),
    "legs": legs_preset(rgb("5a2a6a"), rgb("2a2a2a"), 0.3),
    "parts": [("horns", {"color": rgb("2a2a2a"), "len": 3}), ("cape", {"color": rgb("2a1a3a"), "shoulders": False})],
})
add("spopovich", "スポポビッチ", {
    "build": "huge", "skin": SKIN_TAN, "head": {"hair": None, "top": SKIN_TAN, "eyes": "sharp", "mouth": "frown",
                                                 "extra": [lambda f: f.name == "north" and f.rect(int(f.w*0.3), 0, int(f.w*0.7), int(f.h*0.25), BLACK)]},
    "torso": [("fill", rgb("3a3a3a"))], "arms": arms_preset(SKIN_TAN, band=RED),
    "legs": legs_preset(rgb("3a3a3a"), BLACK, 0.2),
}, size="huge")
add("yamu", "ヤム", {
    "build": "short", "skin": SKIN, "head": {"hair": HAIR_BLACK, "eyes": "sharp", "front": 0.2},
    "torso": [("fill", rgb("3a3a8a"))], "arms": arms_preset(SKIN, band=RED),
    "legs": legs_preset(rgb("3a3a8a"), BLACK, 0.2), "hair": ("short", HAIR_BLACK),
}, size="small")


def buu(form):
    pink = PINK_BUU
    if form == "fat":
        return {"build": "fat", "skin": pink, "head": {"hair": None, "top": pink, "eyes": "small", "mouth": "grin"},
                "torso": [("fill", pink), ("rows", 0.0, 0.6, rgb("5a2a6a")), ("front", symbol("majin_m", "center", color_fg=rgb("f0d060"), size=0.4, y=0.35)),
                          ("rows", 0.65, 0.78, rgb("f0d060"))],
                "arms": arms_preset(pink, glove=WHITE, glove_len=0.25),
                "legs": legs_preset(WHITE, rgb("f0d060"), 0.25),
                "parts": [("head_tentacle", {"color": pink, "n": 4}), ("cape", {"color": rgb("5a2a6a"), "shoulders": False}),
                          ("belly", {"color": pink})]}
    if form == "super":
        return {"build": "tall", "skin": pink, "head": {"hair": None, "top": pink, "eyes": "red", "brows": "angry", "mouth": "fangs"},
                "torso": [("fill", BLACK), ("rows", 0.0, 0.7, pink), ("rows", 0.7, 0.82, rgb("f0d060"))],
                "arms": arms_preset(pink, glove=WHITE), "legs": legs_preset(WHITE, rgb("f0d060"), 0.25),
                "parts": [("head_tentacle", {"color": pink, "n": 7})]}
    if form == "gohan":
        s = buu("super")
        s["torso"] = [("fill", rgb("6a2a8a")), ("rows", 0.7, 0.82, rgb("f0d060"))]
        s["arms"] = arms_preset(pink, sleeve=rgb("6a2a8a"), sleeve_len=0.3, glove=WHITE)
        return s
    return {"build": "kid", "skin": pink, "head": {"hair": None, "top": pink, "eyes": "red", "mouth": "fangs"},
            "torso": [("fill", pink), ("rows", 0.7, 0.85, rgb("f0d060"))], "arms": [("fill", pink)],
            "legs": legs_preset(WHITE, rgb("f0d060"), 0.25), "parts": [("head_tentacle", {"color": pink, "n": 5})]}


add("buu_fat", "魔人ブウ(善)", buu("fat"), size="fat", aura=10)
add("buu_super", "魔人ブウ(悪)", buu("super"), size="tall", aura=10)
add("buu_gohan", "魔人ブウ(悟飯吸収)", buu("gohan"), size="tall", aura=10)
add("buu_kid", "魔人ブウ(純粋)", buu("kid"), size="small", aura=10)

BROLY = {
    "build": "big", "skin": SKIN_TAN, "head": {"hair": HAIR_BLACK, "eyes": "sharp", "brows": "angry", "front": 0.25},
    "torso": [("fill", SKIN_TAN), ("front", lambda f: f.rect(int(f.w*0.2), 0, int(f.w*0.8), int(f.h*0.12), rgb("e0b030")))],
    "arms": arms_preset(SKIN_TAN, band=rgb("e0b030")),
    "legs": legs_preset(WHITE, rgb("e0b030"), 0.25, band=RED),
    "hair": ("broly", HAIR_BLACK),
}
add("broly", "ブロリー", BROLY, size="big")
bl = dict(BROLY)
bl["build"] = "huge"
bl["head"] = {"hair": LSSJ_GREEN, "eyes": "glow", "brows": "ridge", "front": 0.25, "mouth": "fangs"}
bl["hair"] = ("lssj", LSSJ_GREEN)
add("broly_lssj", "ブロリー(伝説の超サイヤ人)", bl, size="huge", aura=8)

add("goku_black", "ゴクウブラック", goku_spec("black", HAIR_BLACK, "sharp", "angry", rgb("3a3a44"), rgb("6a6a7a"), None))
add("goku_black_rose", "ゴクウブラック(ロゼ)", goku_spec("rose", ROSE_PINK, "pink", "angry", rgb("3a3a44"), rgb("6a6a7a"), None), aura=9)
add("zamasu", "ザマス(合体)", {
    "skin": rgb("d0e0d0"), "head": {"hair": WHITE, "eyes": "sharp", "brows": "angry", "front": 0.0, "top": WHITE},
    "torso": [("fill", rgb("f0f0f0")), ("front", stripe_v(rgb("6a2a8a"), 0.42, 0.58))],
    "arms": arms_preset(rgb("d0e0d0"), sleeve=rgb("6a2a8a"), sleeve_len=0.5), "legs": legs_preset(rgb("f0f0f0"), rgb("6a2a8a"), 0.2),
    "hair": ("zamasu", WHITE), "parts": [("earrings", {})],
}, aura=9)
add("hit", "ヒット", {
    "build": "tall", "skin": rgb("8a6ab8"), "head": {"hair": None, "top": rgb("8a6ab8"), "eyes": "sharp", "mouth": "frown"},
    "torso": [("fill", rgb("4a2a6a")), ("front", vneck(BLACK, 0.5, 0.4))],
    "arms": arms_preset(rgb("4a2a6a"), glove=rgb("8a6ab8"), glove_len=0.15),
    "legs": legs_preset(rgb("4a2a6a"), BLACK, 0.2),
    "parts": [("ridges", {"color": rgb("6a4a98")})],
}, size="tall", aura=11)
add("jiren", "ジレン", {
    "build": "bighead", "skin": rgb("b0a8b8"), "head_size": 10,
    "head": {"hair": None, "top": rgb("b0a8b8"), "eyes": "red", "brows": "ridge", "mouth": "frown"},
    "torso": [("fill", RED), ("front", stripe_v(BLACK, 0.3, 0.7)), ("rows", 0.85, 1.0, BLACK)],
    "arms": arms_preset(rgb("b0a8b8"), glove=WHITE, glove_len=0.2), "legs": legs_preset(BLACK, WHITE, 0.25),
    "parts": [("ridges", {"color": rgb("8a8292")})],
}, scale=1.15, size="big", aura=4)

add("frieza_soldier", "フリーザ軍の兵士", {
    "skin": rgb("d08ab0"), "head": {"hair": None, "top": rgb("d08ab0"), "eyes": "sharp", "mouth": "frown"},
    "torso": [("fill", rgb("3a3a5a")), ("front", armor_front(rgb("e8e0d0"), rgb("8a6a3a")))],
    "arms": arms_preset(rgb("d08ab0"), glove=WHITE), "legs": legs_preset(rgb("3a3a5a"), WHITE, 0.3),
    "parts": [("scouter", {})],
})
add("rr_soldier", "レッドリボン軍の兵士", {
    "skin": SKIN, "head": {"hair": HAIR_BLACK, "eyes": "sharp", "front": 0.3},
    "torso": [("fill", rgb("6a5a3a")), ("front", symbol("rr", "left", color_bg=RED, color_fg=WHITE, size=0.26)),
              ("rows", 0.8, 0.9, BLACK)],
    "arms": arms_preset(rgb("6a5a3a"), sleeve=rgb("6a5a3a"), sleeve_len=0.85), "legs": legs_preset(rgb("6a5a3a"), BLACK, 0.3),
    "parts": [("helmet", {"color": rgb("5a6a3a")})],
})
add("rr_robot", "レッドリボン軍のロボット", {
    "build": "huge", "skin": rgb("8a8a9a"), "head": {"hair": None, "top": rgb("6a6a7a"), "eyes": "visor", "mouth": "none"},
    "torso": [("fill", rgb("6a5a8a")), ("front", symbol("rr", "center", color_bg=RED, color_fg=WHITE, size=0.4, y=0.35))],
    "arms": [("fill", rgb("8a8a9a")), ("rows", 0.7, 1.0, rgb("4a4a5a"))], "legs": [("fill", rgb("6a5a8a")), ("rows", 0.7, 1.0, rgb("4a4a5a"))],
}, size="huge", aura=0)

# Great ape (fighter version, Vegeta's Oozaru)
OOZARU = {
    "build": "ape", "skin": rgb("6a3e22"),
    "head": {"hair": rgb("4a2a14"), "top": rgb("4a2a14"), "eyes": "beast", "brows": "angry", "mouth": "muzzle",
             "skin": rgb("e0b088"), "front": 0.3, "side": 0.8, "back": 1.0},
    "torso": [("fill", rgb("4a2a14")), ("front", armor_front(ARMOR_WHITE, ARMOR_TRIM))],
    "arms": [("fill", rgb("4a2a14")), ("rows", 0.85, 1.0, rgb("e0b088"))],
    "legs": [("fill", rgb("4a2a14")), ("rows", 0.85, 1.0, rgb("e0b088"))],
    "parts": [("muzzle", {"color": rgb("e0b088")}), ("tail", {"color": rgb("4a2a14"), "thick": 3.5, "length": 9})],
}
add("oozaru", "大猿", OOZARU, scale=2.6, size="giant", aura=0)
add("training_dummy", "修行用サンドバッグ", {
    "build": "normal", "skin": rgb("b08a5a"),
    "head": {"hair": None, "top": rgb("b08a5a"), "eyes": "closed", "mouth": "none"},
    "torso": [("fill", rgb("b08a5a")), ("rows", 0.3, 0.38, rgb("6a4a2a")), ("rows", 0.7, 0.78, rgb("6a4a2a"))],
    "arms": [("fill", rgb("b08a5a"))], "legs": [("fill", rgb("6a4a2a"))],
}, aura=0)
