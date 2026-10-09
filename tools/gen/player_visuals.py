"""Player transformation visuals: hair, aura, sparks, body overlays, tail and the great ape model."""
import math
import random
from PIL import Image, ImageFilter
from model import Model, solid, spiky, rgb, mul, mix, SCALE
from humanoid import hair_cubes, build_humanoid, gi, arms_preset, legs_preset, armor_front, symbol, vneck, stripe_v, \
    WHITE, BLACK
import characters as C

# ------------------------------------------------------------------ hair
HAIR_STYLES = ["goku", "ssj", "ssj2", "ssj3", "ssj4", "lssj", "vegeta", "gohan", "trunks"]
HAIR_COLORS = [
    ("none", (0, 0, 0)),
    ("black", C.HAIR_BLACK),
    ("gold", C.SSJ_GOLD),
    ("pale_gold", C.SSJ2_GOLD),
    ("red", C.GOD_RED),
    ("cyan", C.BLUE_HAIR),
    ("silver", C.SILVER),
    ("purple", C.UE_PURPLE),
    ("pink", C.ROSE_PINK),
    ("green_gold", C.LSSJ_GREEN),
    ("lavender", rgb("b9a6e6")),
    ("white", rgb("f4f4f4")),
]


def player_skeleton(m):
    m.bone("root", None, (0, 0, 0))
    m.bone("waist", "root", (0, 12, 0))
    m.bone("body", "waist", (0, 24, 0))
    m.bone("head", "body", (0, 24, 0))


def hair_models():
    models = []
    for style in HAIR_STYLES:
        m = Model(f"geometry.dbz.hair.{style}", 64, 64, bounds=(3, 4, (0, 1.5, 0)))
        player_skeleton(m)
        hair_cubes(m, style, (0, 0, 0), (-4, 24, -4, 8))
        for b in m.bones:
            for c in b.cubes:
                c.shared_uv = [0, 0]
        models.append(m)
    return models


def hair_texture(color):
    m = Model("tmp", 64, 64, seed=str(color))
    img = Image.new("RGBA", (64 * SCALE, 64 * SCALE))
    from model import Face
    f = Face("north", 64 * SCALE, 64 * SCALE, random.Random(7))
    spiky(color)(f)
    # brighten the tips (upper part of each spike texture is the base after box mapping; keep uniform-ish)
    img.paste(f.img, (0, 0))
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255)
    return img


# ------------------------------------------------------------------ aura
AURA_COLORS = [
    ("none", (0, 0, 0), (0, 0, 0)),
    ("white", (235, 240, 255), (160, 190, 255)),
    ("gold", (255, 238, 120), (255, 170, 20)),
    ("gold_bright", (255, 250, 170), (255, 200, 40)),
    ("red", (255, 140, 130), (220, 20, 40)),
    ("cyan", (190, 250, 255), (30, 160, 255)),
    ("silver", (245, 248, 255), (150, 170, 220)),
    ("purple", (230, 170, 255), (120, 40, 210)),
    ("green", (220, 255, 160), (60, 200, 40)),
    ("rose", (255, 190, 220), (230, 40, 130)),
    ("pink", (255, 200, 235), (240, 90, 190)),
    ("violet", (220, 180, 255), (110, 40, 160)),
    ("golden", (255, 245, 170), (240, 160, 30)),
    ("dark", (160, 120, 200), (30, 10, 50)),
    ("orange", (255, 210, 150), (250, 110, 20)),
    ("blue_kaioken", (150, 230, 255), (230, 30, 60)),
    ("white_hot", (255, 255, 255), (200, 220, 255)),
]
AURA_FRAMES = 4


def aura_model():
    """Ring of flame planes around the body (per-face UV, uses 16x32 per frame)."""
    planes = []
    for ring, (radius, count, h0, height, width, tilt) in enumerate(((8.5, 8, -2, 42, 14, 10), (6.0, 6, 0, 36, 12, 6))):
        for i in range(count):
            ang = 360.0 * (i + 0.5 * ring) / count
            a = math.radians(ang)
            cx, cz = radius * math.sin(a), radius * math.cos(a)
            planes.append({
                "origin": [round(cx - width / 2, 3), h0, round(cz, 3)],
                "size": [width, height, 0],
                "pivot": [round(cx, 3), h0, round(cz, 3)],
                "rotation": [-tilt, round(ang, 2), 0],
                "uv": {"north": {"uv": [0, 0], "uv_size": [16, 32]}, "south": {"uv": [16, 0], "uv_size": [-16, 32]}},
            })
    return {
        "description": {"identifier": "geometry.dbz.aura", "texture_width": 16, "texture_height": 32 * AURA_FRAMES,
                        "visible_bounds_width": 4, "visible_bounds_height": 4, "visible_bounds_offset": [0, 1.2, 0]},
        "bones": [{"name": "root", "pivot": [0, 0, 0]}, {"name": "dbz_aura", "parent": "root", "pivot": [0, 0, 0], "cubes": planes}],
    }


def spark_model():
    planes = []
    for i in range(6):
        ang = 60.0 * i + 15
        a = math.radians(ang)
        cx, cz = 5.5 * math.sin(a), 5.5 * math.cos(a)
        planes.append({
            "origin": [round(cx - 7, 3), 2, round(cz, 3)], "size": [14, 30, 0],
            "pivot": [round(cx, 3), 2, round(cz, 3)], "rotation": [0, round(ang, 2), 0],
            "uv": {"north": {"uv": [0, 0], "uv_size": [16, 32]}, "south": {"uv": [16, 0], "uv_size": [-16, 32]}},
        })
    return {
        "description": {"identifier": "geometry.dbz.spark", "texture_width": 16, "texture_height": 32 * AURA_FRAMES,
                        "visible_bounds_width": 3, "visible_bounds_height": 3, "visible_bounds_offset": [0, 1.2, 0]},
        "bones": [{"name": "root", "pivot": [0, 0, 0]}, {"name": "dbz_spark", "parent": "root", "pivot": [0, 0, 0], "cubes": planes}],
    }


def aura_texture(core, edge, seed=1):
    """4 vertical frames of rising flame tongues, 16x32 units each, painted at 4x."""
    S = 4
    W, H = 16 * S, 32 * S
    img = Image.new("RGBA", (W, H * AURA_FRAMES), (0, 0, 0, 0))
    rng = random.Random(seed)
    for fr in range(AURA_FRAMES):
        frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        px = frame.load()
        tongues = [(rng.uniform(0.05, 0.95), rng.uniform(0.5, 1.0), rng.uniform(0.14, 0.26)) for _ in range(9)]
        for y in range(H):
            t = y / H  # 0 top, 1 bottom
            for x in range(W):
                u = x / W
                inten = 0.0
                for cx, height, wid in tongues:
                    top = 1 - height
                    if t < top:
                        continue
                    k = (t - top) / max(0.01, height)
                    w = wid * (0.25 + 0.75 * k)
                    sway = 0.04 * math.sin((t * 9 + fr * 1.6 + cx * 10))
                    d = abs(u - cx - sway) / w
                    if d < 1:
                        inten = max(inten, (1 - d) ** 1.4 * min(1, k * 2.5))
                # fade near the bottom edge and sides
                inten *= min(1.0, (1 - t) * 6) * min(1.0, u * 6, (1 - u) * 6)
                if inten <= 0.02:
                    continue
                col = mix(edge, core, min(1, inten * 1.3))
                a = int(255 * min(1, inten * 1.2))
                px[x, y] = (int(col[0] * inten + col[0] * 0.2), int(col[1] * inten + col[1] * 0.2),
                            int(col[2] * inten + col[2] * 0.2), a)
        frame = frame.filter(ImageFilter.GaussianBlur(1.2))
        img.paste(frame, (0, fr * H))
    return img


def spark_texture(seed=3):
    S = 4
    W, H = 16 * S, 32 * S
    img = Image.new("RGBA", (W, H * AURA_FRAMES), (0, 0, 0, 0))
    rng = random.Random(seed)
    from PIL import ImageDraw
    for fr in range(AURA_FRAMES):
        frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(frame)
        for _ in range(2):
            if rng.random() < 0.35:
                continue
            x = rng.uniform(0.15, 0.85) * W
            y = rng.uniform(0.0, 0.3) * H
            pts = [(x, y)]
            for _ in range(7):
                x += rng.uniform(-0.18, 0.18) * W
                y += rng.uniform(0.06, 0.12) * H
                pts.append((max(1, min(W - 2, x)), min(H - 1, y)))
            d.line(pts, fill=(120, 200, 255, 255), width=5)
            d.line(pts, fill=(240, 250, 255, 255), width=2)
        frame = frame.filter(ImageFilter.GaussianBlur(0.6))
        img.paste(frame, (0, fr * H))
    return img


# ------------------------------------------------------------------ body overlays (player)
SK = (240, 196, 160)


def overlay_spec(torso, arms, legs, head, parts=(), skin=SK):
    return {"skin": skin, "head": head, "torso": torso, "arms": arms, "legs": legs, "parts": list(parts),
            "inflate": 0.3, "head_inflate": 0.56, "arm_pivot_x": 5, "leg_pivot_x": 1.9, "leg_x": 0.1}


G = C.GREEN_SKIN
FW, FP = C.FRIEZA_WHITE, C.FRIEZA_PURPLE
PINK = C.PINK_BUU
FUR = rgb("b0282a")

OVERLAYS = [
    ("none", None),
    ("namek", overlay_spec(gi(C.PURPLE_GI, None, rgb("3aa0d0")), arms_preset(G, band=rgb("c03030")) + [("rows", 0.2, 0.42, rgb("e8a0b0"))],
                           legs_preset(C.PURPLE_GI, rgb("7a4a2a"), 0.22),
                           {"hair": None, "top": G, "skin": G, "eyes": "sharp", "brows": "angry"},
                           [("antennae", {"color": G, "len": 4})], skin=G)),
    ("namek_orange", overlay_spec(gi(C.PURPLE_GI, None, rgb("3aa0d0")), arms_preset(rgb("f08a3a"), band=rgb("c03030")),
                                  legs_preset(C.PURPLE_GI, rgb("7a4a2a"), 0.22),
                                  {"hair": None, "top": rgb("f08a3a"), "skin": rgb("f08a3a"), "eyes": "beast", "brows": "angry", "mouth": "fangs"},
                                  [("antennae", {"color": rgb("f08a3a"), "len": 5})], skin=rgb("f08a3a"))),
    ("majin", overlay_spec([("fill", PINK), ("rows", 0.72, 0.85, rgb("f0d060"))], [("fill", PINK)],
                           legs_preset(WHITE, rgb("f0d060"), 0.25),
                           {"hair": None, "top": PINK, "skin": PINK, "eyes": "red", "mouth": "fangs"},
                           [("head_tentacle", {"color": PINK, "n": 5})], skin=PINK)),
    ("majin_super", overlay_spec([("fill", BLACK), ("rows", 0.0, 0.7, PINK), ("rows", 0.7, 0.82, rgb("f0d060"))],
                                 arms_preset(PINK, glove=WHITE), legs_preset(WHITE, rgb("f0d060"), 0.25),
                                 {"hair": None, "top": PINK, "skin": PINK, "eyes": "red", "brows": "angry", "mouth": "fangs"},
                                 [("head_tentacle", {"color": PINK, "n": 7})], skin=PINK)),
    ("frieza1", overlay_spec([("fill", rgb("3a2a5a")), ("front", armor_front(rgb("f1efe6"), rgb("6a4a8a")))], [("fill", FW)],
                             [("fill", FW)], {"hair": None, "top": FP, "skin": FW, "eyes": "red", "brows": "none"},
                             [("horns", {"color": rgb("2a2a2a"), "len": 3, "spread": 5}), ("dome", {"color": FP}),
                              ("tail", {"color": FW, "thick": 2.4, "length": 6})], skin=FW)),
    ("frieza2", overlay_spec([("fill", FW), ("rows", 0.1, 0.5, FP)], [("fill", FW)], [("fill", FW)],
                             {"hair": None, "top": FP, "skin": FW, "eyes": "red", "brows": "none", "mouth": "fangs"},
                             [("horns", {"color": rgb("2a2a2a"), "len": 6, "spread": 0, "back": -15}), ("dome", {"color": FP}),
                              ("tail", {"color": FW, "thick": 2.4, "length": 6})], skin=FW)),
    ("frieza3", overlay_spec([("fill", FW), ("rows", 0.1, 0.4, FP)], [("fill", FW)], [("fill", FW)],
                             {"hair": None, "top": FP, "skin": FW, "eyes": "red", "brows": "none"},
                             [("long_head", {"color": FW, "tip": FP}), ("tail", {"color": FW, "thick": 2.4, "length": 6})], skin=FW)),
    ("frieza4", overlay_spec([("fill", FW), ("front", lambda f: f.circle(f.w / 2, f.h * 0.3, f.w * 0.15, FP))],
                             arms_preset(FW, glove=FP, glove_len=0.2), legs_preset(FW, FP, 0.2),
                             {"hair": None, "top": FP, "skin": FW, "eyes": "red", "brows": "none"},
                             [("dome", {"color": FP, "h": 2}), ("tail", {"color": FW, "thick": 2.4, "length": 6})], skin=FW)),
    ("frieza_golden", overlay_spec([("fill", rgb("f6c83a")), ("front", lambda f: f.circle(f.w / 2, f.h * 0.3, f.w * 0.15, FP))],
                                   arms_preset(rgb("f6c83a"), glove=FP, glove_len=0.2), legs_preset(rgb("f6c83a"), FP, 0.2),
                                   {"hair": None, "top": FP, "skin": rgb("f6c83a"), "eyes": "red", "brows": "none"},
                                   [("dome", {"color": FP, "h": 2}), ("tail", {"color": rgb("f6c83a"), "thick": 2.4, "length": 6})],
                                   skin=rgb("f6c83a"))),
    ("frieza_black", overlay_spec([("fill", rgb("1c1824")), ("front", lambda f: f.circle(f.w / 2, f.h * 0.3, f.w * 0.15, rgb("c040ff")))],
                                  arms_preset(rgb("1c1824"), glove=rgb("6a2a9a"), glove_len=0.2), legs_preset(rgb("1c1824"), rgb("6a2a9a"), 0.2),
                                  {"hair": None, "top": rgb("6a2a9a"), "skin": rgb("1c1824"), "eyes": "red", "brows": "none"},
                                  [("dome", {"color": rgb("6a2a9a"), "h": 2}), ("tail", {"color": rgb("1c1824"), "thick": 2.4, "length": 6})],
                                  skin=rgb("1c1824"))),
    ("ssj4", overlay_spec([("fill", FUR), ("front", lambda f: f.rect(int(f.w * 0.15), int(f.h * 0.05), int(f.w * 0.85), int(f.h * 0.6), SK)),
                           ("rows", 0.82, 0.95, rgb("e8d040"))],
                          [("fill", FUR), ("rows", 0.78, 1.0, rgb("e8e8f0"))],
                          legs_preset(rgb("2a3a8a"), rgb("2a2a2a"), 0.25),
                          {"hair": C.HAIR_BLACK, "skin": SK, "eyes": "beast", "brows": "ridge", "front": 0.2,
                           "extra": [lambda f: f.name == "north" and f.rect(int(f.w * 0.15), int(f.h * 0.45), int(f.w * 0.85), int(f.h * 0.5), FUR)]})),
    ("vegito", overlay_spec(gi(rgb("2a4fb4"), rgb("f08a24"), WHITE, None), arms_preset(SK, band=rgb("f08a24"), glove=WHITE, glove_len=0.2),
                            legs_preset(rgb("2a4fb4"), WHITE, 0.3, trim=rgb("e8c040")),
                            {"hair": C.HAIR_BLACK, "skin": SK, "eyes": "sharp", "brows": "angry", "front": 0.2, "widow": True},
                            [("earrings", {})])),
    ("gogeta", overlay_spec([("fill", BLACK), ("rows", 0.0, 0.45, rgb("2a3a8a")), ("front", vneck(SK, 0.55, 0.35)),
                             ("rows", 0.78, 0.9, rgb("2a4fb4"))], arms_preset(SK, band=rgb("e8c040")),
                            legs_preset(WHITE, BLACK, 0.25, trim=rgb("e8c040")),
                            {"hair": C.HAIR_BLACK, "skin": SK, "eyes": "sharp", "brows": "angry", "front": 0.22})),
    ("fusion_fat", overlay_spec([("fill", rgb("2a3a8a")), ("front", vneck(SK, 0.4, 0.4)), ("rows", 0.7, 0.85, rgb("2a4fb4"))],
                                arms_preset(SK, band=rgb("e8c040")), legs_preset(WHITE, BLACK, 0.25),
                                {"hair": C.HAIR_BLACK, "skin": SK, "eyes": "small", "mouth": "grin", "front": 0.22},
                                [("belly", {"color": SK})])),
    ("lssj", overlay_spec([("fill", SK), ("front", lambda f: f.rect(int(f.w * 0.2), 0, int(f.w * 0.8), int(f.h * 0.12), rgb("e0b030")))],
                          arms_preset(SK, band=rgb("e0b030")), legs_preset(WHITE, rgb("e0b030"), 0.25, band=C.RED),
                          {"hair": C.LSSJ_GREEN, "skin": SK, "eyes": "glow", "brows": "ridge", "front": 0.2})),
]


def overlay_models():
    out = []
    for oid, spec in OVERLAYS[1:]:
        m = build_humanoid(f"geometry.dbz.overlay.{oid}", spec)
        out.append((oid, m, m.render_texture()))
    return out


# ------------------------------------------------------------------ tail & great ape (player)
def tail_model():
    from humanoid import add_part
    m = Model("geometry.dbz.tail", 32, 32, bounds=(2, 2, (0, 0.8, 0)))
    m.bone("root", None, (0, 0, 0))
    m.bone("waist", "root", (0, 12, 0))
    ctx = {"hs": 8, "body": (8, 12, 4), "arm": (4, 12, 4), "leg": (4, 12, 4), "leg_h": 12, "body_top": 24,
           "head_y": 24, "skin": (0, 0, 0)}
    add_part(m, "tail", {"color": rgb("6a3e22"), "thick": 1.8, "length": 3.2,
                         "angles": [-40, -20, 5, 35, 70, 110]}, ctx)
    return m


def oozaru_models():
    spec = dict(C.OOZARU)
    spec = {k: v for k, v in spec.items()}
    spec["torso"] = [("fill", rgb("4a2a14"))]
    m = build_humanoid("geometry.dbz.oozaru", spec)
    t_brown = m.render_texture()
    golden = dict(spec)
    golden["skin"] = rgb("e8b030")
    golden["head"] = dict(spec["head"], hair=rgb("f0c040"), top=rgb("f0c040"))
    golden["torso"] = [("fill", rgb("f0c040"))]
    golden["arms"] = [("fill", rgb("f0c040")), ("rows", 0.85, 1.0, rgb("e0b088"))]
    golden["legs"] = [("fill", rgb("f0c040")), ("rows", 0.85, 1.0, rgb("e0b088"))]
    golden["parts"] = [("muzzle", {"color": rgb("e0b088")}), ("tail", {"color": rgb("f0c040"), "thick": 3.5, "length": 9})]
    mg = build_humanoid("geometry.dbz.oozaru", golden)
    t_gold = mg.render_texture()
    return m, t_brown, t_gold
