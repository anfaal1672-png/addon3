"""Non-humanoid models: ki blasts, beams, dragons, dinosaur, vehicles, blocks and wearable attachables."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter
from model import Model, Face, solid, spiky, rgb, mul, mix, SCALE
from humanoid import build_humanoid, arms_preset, legs_preset, WHITE, BLACK

# ---------------------------------------------------------------------------------------------- ki colours
KI_COLORS = [
    ("blue", (230, 248, 255), (40, 150, 255)),
    ("yellow", (255, 255, 230), (255, 210, 40)),
    ("purple", (250, 230, 255), (170, 60, 255)),
    ("green", (240, 255, 230), (80, 230, 70)),
    ("red", (255, 235, 235), (240, 40, 50)),
    ("pink", (255, 235, 250), (255, 90, 200)),
    ("white", (255, 255, 255), (200, 220, 255)),
    ("orange", (255, 245, 225), (255, 140, 30)),
    ("dark", (230, 200, 255), (60, 10, 90)),
    ("cyan", (235, 255, 255), (40, 230, 230)),
    ("gold", (255, 252, 220), (255, 190, 30)),
    ("black_rose", (255, 210, 235), (190, 20, 110)),
]


def _shared(m, uv):
    for b in m.bones:
        for c in b.cubes:
            c.shared_uv = uv


def _orb(m, bone, r, uv, cy=0.0):
    s = 2 * r
    m.cube(bone, (-r, cy - r, -r), (s, s, s), None)
    for rot in ([45, 0, 0], [0, 45, 0], [0, 0, 45]):
        m.cube(bone, (-r * 0.92, cy - r * 0.92, -r * 0.92), (s * 0.92, s * 0.92, s * 0.92), None, rotation=rot, pivot=[0, cy, 0])
    for c in m.bone_map[bone].cubes:
        c.shared_uv = uv


def orb_model():
    m = Model("geometry.dbz.ki_orb", 64, 64, bounds=(4, 4, (0, 0, 0)))
    m.bone("root", None, (0, 0, 0))
    m.bone("scale", "root", (0, 0, 0))
    m.bone("core", "scale", (0, 0, 0))
    m.bone("glow", "scale", (0, 0, 0))
    _orb(m, "core", 2, [0, 0])
    _orb(m, "glow", 3.6, [0, 16])
    return m


def disc_model():
    m = Model("geometry.dbz.ki_disc", 64, 64, bounds=(4, 2, (0, 0, 0)))
    m.bone("root", None, (0, 0, 0))
    m.bone("scale", "root", (0, 0, 0))
    m.bone("core", "scale", (0, 0, 0))
    m.bone("glow", "scale", (0, 0, 0))
    for ang in (0, 30, 60, 90, 120, 150):
        m.cube("core", (-6, -0.4, -2.2), (12, 0.8, 4.4), None, rotation=[0, ang, 0], pivot=[0, 0, 0])
        m.cube("glow", (-7.5, -0.9, -2.8), (15, 1.8, 5.6), None, rotation=[0, ang, 0], pivot=[0, 0, 0])
    for c in m.bone_map["core"].cubes:
        c.shared_uv = [0, 0]
    for c in m.bone_map["glow"].cubes:
        c.shared_uv = [0, 16]
    return m


def beam_model():
    """Beam: root > aim (pitch/yaw) > body (scaled along -Z by length) and tip (moved to the end)."""
    m = Model("geometry.dbz.beam", 64, 64, bounds=(96, 96, (0, 0, 0)))
    m.bone("root", None, (0, 0, 0))
    m.bone("aim", "root", (0, 0, 0))
    m.bone("body", "aim", (0, 0, 0))
    m.bone("body_glow", "aim", (0, 0, 0))
    m.bone("tip", "aim", (0, 0, 0))
    m.bone("tip_glow", "tip", (0, 0, 0))
    m.bone("base", "aim", (0, 0, 0))
    m.cube("body", (-2.5, -2.5, -16), (5, 5, 16), None)
    m.cube("body", (-2.0, -2.0, -16), (4, 4, 16), None, rotation=[0, 0, 45], pivot=[0, 0, 0])
    m.cube("body_glow", (-4.5, -4.5, -16), (9, 9, 16), None)
    m.cube("body_glow", (-4.0, -4.0, -16), (8, 8, 16), None, rotation=[0, 0, 45], pivot=[0, 0, 0])
    for c in m.bone_map["body"].cubes:
        c.shared_uv = [0, 0]
    for c in m.bone_map["body_glow"].cubes:
        c.shared_uv = [0, 0]
    _orb(m, "tip", 4.5, [0, 32])
    _orb(m, "tip_glow", 7, [0, 32])
    _orb(m, "base", 4, [0, 32])
    return m


def ki_texture(core, edge, spiral=False):
    """64x64-unit texture: [0,0] beam strip, [0,16] glow, [0,32] orb. Painted at 2x."""
    S = SCALE
    img = Image.new("RGBA", (64 * S, 64 * S), (0, 0, 0, 0))
    px = img.load()
    for y in range(64 * S):
        for x in range(64 * S):
            region = y // (16 * S)
            ly = (y % (16 * S)) / (16 * S)
            lx = (x % (16 * S)) / (16 * S)
            d = max(abs(lx - 0.5), abs(ly - 0.5)) * 2  # 0 center .. 1 edge
            if region in (0, 2, 3):
                t = min(1, d ** 2.2)
                c = mix(core, edge, t * 0.75)
                if spiral and region == 0:
                    if int((x / S + y / S * 0.9)) % 8 < 2:
                        c = mix(c, (170, 60, 255), 0.75)
                px[x, y] = c + (255,)
            else:
                t = d
                c = mix(edge, core, (1 - t) * 0.5)
                px[x, y] = c + (int(200 * (1 - t * 0.6)),)
    return img


# ---------------------------------------------------------------------------------------------- dragons
def scale_painter(base, belly, noise=0.06):
    def p(f):
        f.fill(base, noise)
        for yy in range(0, f.h, 3):
            for xx in range((yy // 3) % 2 * 2, f.w, 4):
                f.set(xx, yy, mul(base, 0.75))
        if f.name == "down":
            f.fill(belly, noise)
            for yy in range(0, f.h, 3):
                f.rect(0, yy, f.w, yy + 1, mul(belly, 0.8), shade=False)
        f.outline(0.75)
    return p


def shenron_model(identifier="geometry.dbz.shenron", body_col=rgb("2f8a3a"), belly=rgb("e6d27a"), horn=rgb("f2e6c8"),
                  eye=(230, 30, 30)):
    m = Model(identifier, 128, 128, bounds=(10, 10, (0, 4, 0)))
    m.bone("root", None, (0, 0, 0))
    segs = 18
    P = scale_painter(body_col, belly)
    prev = None
    pts = []
    for i in range(segs):
        t = i / (segs - 1)
        ang = math.radians(i * 38)
        R = 16 * (1 - t * 0.55)
        x = R * math.sin(ang)
        z = R * math.cos(ang)
        y = 2 + i * 4.2
        pts.append((x, y, z))
    for i, (x, y, z) in enumerate(pts):
        nx, ny, nz = pts[min(i + 1, segs - 1)]
        if i == segs - 1:
            px_, py_, pz_ = pts[i - 1]
            nx, ny, nz = x + (x - px_), y + (y - py_), z + (z - pz_)
        dx, dy, dz = nx - x, ny - y, nz - z
        yaw = math.degrees(math.atan2(dx, -dz))
        pitch = math.degrees(math.atan2(dy, math.hypot(dx, dz)))
        th = 8.5 - i * 0.18
        name = f"seg{i}"
        m.bone(name, "root", (round(x, 2), round(y, 2), round(z, 2)))
        m.cube(name, (x - th / 2, y - th / 2, z - th * 0.55), (th, th, th * 1.25), P,
               rotation=[round(pitch, 1), round(-yaw, 1), 0], pivot=[round(x, 2), round(y, 2), round(z, 2)])
        # back spikes
        m.cube(name, (x - 0.6, y + th / 2 - 0.5, z - 1.5), (1.2, 2.6, 3), solid(rgb("e8a040")),
               rotation=[round(pitch, 1), round(-yaw, 1), 0], pivot=[round(x, 2), round(y, 2), round(z, 2)])
    hx, hy, hz = pts[-1]
    hy += 5
    m.bone("head", "root", (round(hx, 2), round(hy, 2), round(hz, 2)))

    def headp(f):
        f.fill(body_col, 0.05)
        if f.name == "north":
            f.rect(int(f.w * 0.12), int(f.h * 0.25), int(f.w * 0.35), int(f.h * 0.45), eye, shade=False)
            f.rect(int(f.w * 0.65), int(f.h * 0.25), int(f.w * 0.88), int(f.h * 0.45), eye, shade=False)
            f.rect(int(f.w * 0.12), int(f.h * 0.15), int(f.w * 0.4), int(f.h * 0.22), mul(body_col, 0.6), shade=False)
            f.rect(int(f.w * 0.6), int(f.h * 0.15), int(f.w * 0.88), int(f.h * 0.22), mul(body_col, 0.6), shade=False)
        f.outline(0.75)
    m.cube("head", (hx - 6, hy - 4, hz - 6), (12, 10, 12), headp)
    m.cube("head", (hx - 4, hy - 4, hz - 14), (8, 6, 8), solid(body_col, outline=0.75))
    m.cube("head", (hx - 3.5, hy - 6.5, hz - 13), (7, 2.5, 8), solid(mul(body_col, 0.8), outline=0.7))
    m.cube("head", (hx - 4.2, hy - 4.5, hz - 13.6), (8.4, 0.8, 1), solid(WHITE))
    for sx in (-1, 1):
        # antlers
        m.cube("head", (hx + sx * 3.5 - 0.8, hy + 5, hz + 1), (1.6, 10, 1.6), solid(horn, outline=0.7),
               rotation=[-30, 0, -sx * 20], pivot=[hx + sx * 3.5, hy + 5, hz + 2])
        m.cube("head", (hx + sx * 5.5 - 0.6, hy + 9, hz + 4), (1.2, 5, 1.2), solid(horn, outline=0.7),
               rotation=[-10, 0, -sx * 55], pivot=[hx + sx * 5.5, hy + 9, hz + 4])
        # whiskers
        m.cube("head", (hx + sx * 4 - 0.4, hy - 3, hz - 13), (0.8, 0.8, 18), solid(rgb("e8e0d0")),
               rotation=[25, sx * 35, 0], pivot=[hx + sx * 4, hy - 3, hz - 13])
        # mane
        m.cube("head", (hx + sx * 6 - 1, hy - 2, hz - 2), (2, 7, 8), spiky(rgb("e86a2a")),
               rotation=[-25, 0, -sx * 30], pivot=[hx + sx * 6, hy, hz])
    # arms
    ax, ay, az = pts[segs - 5]
    for sx in (-1, 1):
        nm = "arm_r" if sx < 0 else "arm_l"
        m.bone(nm, "root", (round(ax + sx * 4, 2), round(ay, 2), round(az, 2)))
        m.cube(nm, (ax + sx * 4 - 1.5, ay - 8, az - 1.5), (3, 9, 3), P, rotation=[-35, 0, -sx * 25],
               pivot=[ax + sx * 4, ay, az])
        m.cube(nm, (ax + sx * 4 - 2, ay - 10, az - 6), (4, 2, 4), solid(horn), rotation=[-35, 0, -sx * 25],
               pivot=[ax + sx * 4, ay, az])
    return m


def porunga_model():
    G = rgb("4aa040")
    spec = {
        "build": "huge", "skin": G,
        "head": {"hair": None, "top": G, "eyes": "beast", "brows": "angry", "mouth": "fangs"},
        "torso": [("fill", G), ("rows", 0.8, 1.0, rgb("3a3aa0"))],
        "arms": arms_preset(G, band=rgb("e0b030")),
        "legs": legs_preset(rgb("3a3aa0"), G, 0.3),
        "parts": [("horns", {"color": rgb("f0e0c0"), "len": 6, "spread": 30}),
                  ("cat_ears", {"color": G, "len": 3.5})],
    }
    return build_humanoid("geometry.dbz.porunga", spec)


# ---------------------------------------------------------------------------------------------- dinosaur
def dino_model():
    m = Model("geometry.dbz.dinosaur", 128, 128, bounds=(5, 4, (0, 1.5, 0)))
    skin, belly = rgb("6a8a3a"), rgb("d8c890")
    P = scale_painter(skin, belly)
    m.bone("root", None, (0, 0, 0))
    m.bone("body", "root", (0, 22, 0))
    m.cube("body", (-6, 16, -10), (12, 13, 20), P)
    m.bone("neck", "body", (0, 26, -9))
    m.cube("neck", (-4, 22, -15), (8, 9, 8), P, rotation=[-25, 0, 0], pivot=[0, 26, -9])
    m.bone("head", "neck", (0, 30, -14))

    def headp(f):
        P(f)
        if f.name in ("east", "west"):
            f.rect(int(f.w * 0.25), int(f.h * 0.2), int(f.w * 0.35), int(f.h * 0.35), (240, 200, 40), shade=False)
    m.cube("head", (-5, 28, -26), (10, 9, 13), headp)
    m.bone("jaw", "head", (0, 28, -14))
    m.cube("jaw", (-4.5, 24.5, -25), (9, 3.5, 12), P)
    for i in range(5):
        m.cube("jaw", (-4 + i * 2, 27.5, -25), (1, 1.4, 1), solid(WHITE))
    m.bone("tail1", "body", (0, 24, 10))
    m.cube("tail1", (-4, 19, 9), (8, 9, 12), P)
    m.bone("tail2", "tail1", (0, 23, 20))
    m.cube("tail2", (-2.5, 20, 20), (5, 6, 12), P)
    m.bone("tail3", "tail2", (0, 23, 31))
    m.cube("tail3", (-1.5, 21, 31), (3, 3.5, 10), P)
    for sx, nm in ((-1, "rightLeg"), (1, "leftLeg")):
        m.bone(nm, "root", (sx * 5, 18, 0))
        m.cube(nm, (sx * 5 - 2.5 - (0 if sx < 0 else 0), 6, -3), (5, 13, 7), P)
        m.cube(nm, (sx * 5 - 2, 0, -5), (4, 6, 5), P)
        m.cube(nm, (sx * 5 - 2.5, 0, -8), (5, 2, 4), solid(mul(skin, 0.7)))
    for sx, nm in ((-1, "rightArm"), (1, "leftArm")):
        m.bone(nm, "body", (sx * 5, 23, -8))
        m.cube(nm, (sx * 5 - 1, 18, -10), (2, 6, 2), P, rotation=[-30, 0, 0], pivot=[sx * 5, 23, -8])
    return m


# ---------------------------------------------------------------------------------------------- vehicles
def kintoun_model():
    m = Model("geometry.dbz.kintoun", 64, 64, bounds=(3, 2, (0, 0.3, 0)))
    m.bone("root", None, (0, 0, 0))
    m.bone("cloud", "root", (0, 0, 0))
    rng = random.Random(4)
    c1, c2 = rgb("ffd84a"), rgb("ffb12a")

    def cp(f):
        f.fill(c1, 0.03, grad=0.3)
        for _ in range(f.w * f.h // 12):
            x, y = rng.randrange(f.w), rng.randrange(f.h)
            f.set(x, y, mix(c1, c2, 0.6))
    puffs = [(0, 3, 0, 10), (-7, 2.5, 2, 8), (7, 2.5, -1, 8), (-3, 2, -7, 7), (4, 2, 7, 7), (-10, 1.5, -5, 5),
             (11, 1.5, 4, 5), (0, 5, 1, 6), (-4, 4.5, 3, 5), (13, 1, -6, 4)]
    for x, y, z, s in puffs:
        m.cube("cloud", (x - s / 2, y - s / 3, z - s / 2), (s, s * 0.6, s), cp)
    return m


def aircar_model():
    m = Model("geometry.dbz.aircar", 128, 128, bounds=(5, 3, (0, 0.6, 0)))
    m.bone("root", None, (0, 0, 0))
    body, trim, glass = rgb("f2f2ee"), rgb("e8a020"), (120, 200, 240)

    def bp(f):
        f.fill(body, 0.03)
        if f.name in ("east", "west"):
            f.rect(int(f.w * 0.4), int(f.h * 0.3), int(f.w * 0.6), int(f.h * 0.7), (40, 60, 160), shade=False)
            f.rect(int(f.w * 0.43), int(f.h * 0.38), int(f.w * 0.57), int(f.h * 0.62), WHITE, shade=False)
        f.outline(0.75)
    m.cube("root", (-9, 3, -16), (18, 7, 32), bp)
    m.cube("root", (-8, 10, -6), (16, 1, 14), solid(rgb("8a4a2a")))
    m.cube("root", (-8.5, 10, -10), (17, 5, 1), solid(glass + (180,), 0.0))
    m.cube("root", (-9.2, 1, -16.2), (18.4, 2.5, 32.4), solid(trim))
    for sx in (-1, 1):
        m.cube("root", (sx * 10 - 1.5, 2, -14), (3, 4, 6), solid(rgb("4a4a4a")))
        m.cube("root", (sx * 10 - 1.5, 2, 8), (3, 4, 6), solid(rgb("4a4a4a")))
    return m


def spaceship_model():
    m = Model("geometry.dbz.spaceship", 128, 128, bounds=(8, 8, (0, 3, 0)))
    m.bone("root", None, (0, 0, 0))
    hull, band, win = rgb("f0f0ea"), rgb("e8a020"), (80, 160, 220)

    def hp(f):
        f.fill(hull, 0.03)
        if f.name == "north":
            f.rect(int(f.w * 0.35), int(f.h * 0.35), int(f.w * 0.65), int(f.h * 0.6), win, shade=False)
            f.rect(int(f.w * 0.4), int(f.h * 0.7), int(f.w * 0.6), int(f.h * 0.82), (40, 60, 160), shade=False)
        f.outline(0.8)
    for i, (r, y0, h) in enumerate(((14, 8, 6), (17, 14, 10), (14, 24, 6), (9, 30, 4))):
        for ang in (0, 45):
            m.cube("root", (-r, y0, -r), (2 * r, h, 2 * r), hp, rotation=[0, ang, 0], pivot=[0, y0, 0])
    m.cube("root", (-17.6, 18, -17.6), (35.2, 2, 35.2), solid(band))
    for ang in (0, 120, 240):
        a = math.radians(ang)
        x, z = 12 * math.sin(a), 12 * math.cos(a)
        m.cube("root", (x - 1.5, 0, z - 1.5), (3, 9, 3), solid(rgb("9a9aa8")))
        m.cube("root", (x - 3, 0, z - 3), (6, 1, 6), solid(rgb("6a6a78")))
    return m


# ---------------------------------------------------------------------------------------------- blocks
def dragonball_block(stars, size, identifier, kind="earth"):
    """Round orange orb with stars; block geometry is centred on x/z and starts at y=0."""
    m = Model(identifier, 64, 64, bounds=(2, 2, (0, 0.5, 0)), seed=identifier)
    m.bone("root", None, (0, 0, 0))
    r = size / 2
    star = (220, 30, 20)
    base = rgb("ff9a1a") if kind != "super" else rgb("ffb21a")
    if kind == "namek":
        base = rgb("ffa82a")

    def bp(f):
        f.fill(base, 0.02, shade=True)
        # glossy highlight
        f.rect(int(f.w * 0.15), int(f.h * 0.12), int(f.w * 0.35), int(f.h * 0.25), mix(base, WHITE, 0.6), shade=False)
        if f.name in ("north", "south", "east", "west"):
            draw_stars(f, stars, star)
    k = 0.72
    m.cube("root", (-r, r - r * k, -r * k), (size, size * k, size * k), bp)
    m.cube("root", (-r * k, 0, -r * k), (size * k, size, size * k), bp)
    m.cube("root", (-r * k, r - r * k, -r), (size * k, size * k, size), bp)
    return m


STAR_LAYOUT = {
    1: [(0.5, 0.5)], 2: [(0.33, 0.4), (0.67, 0.6)], 3: [(0.5, 0.3), (0.3, 0.65), (0.7, 0.65)],
    4: [(0.32, 0.32), (0.68, 0.32), (0.32, 0.68), (0.68, 0.68)],
    5: [(0.5, 0.25), (0.25, 0.48), (0.75, 0.48), (0.35, 0.75), (0.65, 0.75)],
    6: [(0.3, 0.25), (0.7, 0.25), (0.25, 0.5), (0.75, 0.5), (0.3, 0.75), (0.7, 0.75)],
    7: [(0.5, 0.2), (0.25, 0.38), (0.75, 0.38), (0.5, 0.5), (0.25, 0.65), (0.75, 0.65), (0.5, 0.82)],
}


def draw_stars(f, n, col):
    r = max(1.6, min(f.w, f.h) * (0.2 if n <= 2 else 0.15))
    for (u, v) in STAR_LAYOUT[n]:
        cx, cy = u * f.w, v * f.h
        for y in range(f.h):
            for x in range(f.w):
                dx, dy = x + 0.5 - cx, y + 0.5 - cy
                ang = math.atan2(dy, dx)
                rr = r * (0.55 + 0.45 * math.cos(5 * (ang + math.pi / 2)))
                if math.hypot(dx, dy) <= rr:
                    f.set(x, y, col)


def gravity_machine_model():
    m = Model("geometry.dbz.gravity_machine", 64, 64, bounds=(2, 2, (0, 0.5, 0)))
    m.bone("root", None, (0, 0, 0))

    def cp(f):
        f.fill(rgb("d8d8e0"), 0.03)
        if f.name == "north":
            f.rect(int(f.w * 0.15), int(f.h * 0.1), int(f.w * 0.85), int(f.h * 0.45), (20, 40, 30), shade=False)
            f.rect(int(f.w * 0.25), int(f.h * 0.2), int(f.w * 0.75), int(f.h * 0.33), (60, 240, 120), shade=False)
            for i in range(4):
                f.rect(int(f.w * (0.15 + i * 0.19)), int(f.h * 0.6), int(f.w * (0.27 + i * 0.19)), int(f.h * 0.72),
                       [(230, 50, 50), (240, 200, 40), (60, 160, 240), (60, 220, 90)][i], shade=False)
        f.outline(0.7)
    m.cube("root", (-5, 0, -4), (10, 4, 8), solid(rgb("6a6a78")))
    m.cube("root", (-4, 4, -2), (8, 11, 4), cp)
    return m


def zsword_block_model():
    m = Model("geometry.dbz.zsword_stone", 64, 64, bounds=(2, 3, (0, 1, 0)))
    m.bone("root", None, (0, 0, 0))
    m.cube("root", (-7, 0, -7), (14, 6, 14), solid(rgb("8a8a8a"), 0.1, outline=0.7))
    m.cube("root", (-5, 6, -5), (10, 3, 10), solid(rgb("7a7a7a"), 0.1, outline=0.7))
    m.cube("root", (-1, 9, -0.5), (2, 14, 1), solid(rgb("e0e4ee")))
    m.cube("root", (-3, 23, -1), (6, 1.5, 2), solid(rgb("e0b030")))
    m.cube("root", (-0.8, 24.5, -0.8), (1.6, 5, 1.6), solid(rgb("3a2a6a")))
    return m


# ---------------------------------------------------------------------------------------------- attachables
def attach_base(identifier, w=64, h=64):
    m = Model(identifier, w, h, bounds=(2, 3, (0, 1, 0)))
    m.bone("root", None, (0, 0, 0))
    m.bone("waist", "root", (0, 12, 0))
    m.bone("body", "waist", (0, 24, 0))
    m.bone("head", "body", (0, 24, 0))
    m.bone("rightArm", "body", (-5, 22, 0))
    m.bone("leftArm", "body", (5, 22, 0))
    m.bone("rightLeg", "root", (-1.9, 12, 0))
    m.bone("leftLeg", "root", (1.9, 12, 0))
    return m


def scouter_attachable():
    m = attach_base("geometry.dbz.scouter_worn", 32, 32)
    m.cube("head", (-5.2, 27, -1.5), (1.2, 3.5, 3.5), solid(rgb("d8d8d8")))
    m.cube("head", (-5.2, 28.5, -5), (1.0, 1, 4), solid(rgb("d8d8d8")))
    m.cube("head", (-5.0, 27.5, -5.3), (3.6, 2.6, 0.4), solid((60, 230, 90)))
    return m


def turban_attachable():
    m = attach_base("geometry.dbz.turban_worn", 64, 64)

    def tp(f):
        f.fill(WHITE, 0.03)
        if f.name not in ("up", "down"):
            f.rect(0, int(f.h * 0.6), f.w, int(f.h * 0.85), rgb("6e2a8c"))
        f.outline(0.8)
    m.cube("head", (-4.8, 28, -4.8), (9.6, 5, 9.6), tp)
    m.cube("head", (-4.4, 33, -4.4), (8.8, 1, 8.8), solid(WHITE))
    return m


def cape_attachable():
    m = attach_base("geometry.dbz.cape_worn", 64, 64)
    m.bone("dbz_cape", "body", (0, 24, 2.5))
    m.cube("dbz_cape", (-6, 2, 2.6), (12, 22, 0.8), solid(WHITE, 0.03, grad=0.15, outline=0.8), rotation=[-6, 0, 0],
           pivot=[0, 24, 2.6])
    for sx in (-1, 1):
        m.cube("body", ((4 - 1.6) if sx > 0 else (-4 - 1.6), 22.4, -2.8), (3.2, 2.4, 5.6), solid(WHITE, outline=0.8))
    return m


def shell_attachable():
    m = attach_base("geometry.dbz.shell_worn", 64, 64)

    def sp(f):
        f.fill((60, 140, 70), 0.05)
        for yy in range(0, f.h, 4 * SCALE):
            f.rect(0, yy, f.w, yy + 1, (40, 90, 40), shade=False)
        for xx in range(0, f.w, 4 * SCALE):
            f.rect(xx, 0, xx + 1, f.h, (40, 90, 40), shade=False)
        f.outline(0.6)
    m.cube("body", (-5, 13, 2.2), (10, 11, 4), sp)
    m.cube("body", (-4.6, 22, -2.6), (1.2, 1.2, 5), solid(rgb("8a5a2a")))
    m.cube("body", (3.4, 22, -2.6), (1.2, 1.2, 5), solid(rgb("8a5a2a")))
    return m


def panties_attachable():
    m = attach_base("geometry.dbz.panties_worn", 32, 32)

    def pp(f):
        f.fill(rgb("ffd0e8"), 0.03)
        if f.name == "north":
            f.rect(int(f.w * 0.4), int(f.h * 0.2), int(f.w * 0.6), int(f.h * 0.5), rgb("ff6aa8"), shade=False)
        f.outline(0.85)
    m.cube("head", (-4.6, 29, -4.6), (9.2, 3.6, 9.2), pp)
    return m


def armor_texture(layer, top=None, under=None, belt=None, pants=None, boots=None, wrist=None, symbol_col=None,
                  skin_arms=True, glove=None, armor=None, trim=None):
    """Paint a 64x32 humanoid armor layout at 2x. layer 1: chest/arms/boots, layer 2: leggings."""
    S = 2
    img = Image.new("RGBA", (64 * S, 32 * S), (0, 0, 0, 0))
    from humanoid import part_painter, vneck as _v, symbol as _sym, armor_front as _af

    def paint_box(u, v, w, h, d, painter):
        regions = {"up": (u + d, v, w, d), "down": (u + d + w, v, w, d), "east": (u, v + d, d, h),
                   "north": (u + d, v + d, w, h), "west": (u + d + w, v + d, d, h), "south": (u + 2 * d + w, v + d, w, h)}
        for name, (fx, fy, fw, fh) in regions.items():
            f = Face(name, fw * S, fh * S, random.Random(fx * 7 + fy))
            painter(f)
            img.paste(f.img, (fx * S, fy * S), f.img)
    if layer == 1:
        if top:
            ops = [("fill", top)]
            if under:
                ops += [("front", _v(under, 0.42, 0.55)), ("back", _v(under, 0.18, 0.5))]
            if armor:
                ops += [("front", _af(armor, trim)), ("back", _af(armor, trim))]
            if belt:
                ops.append(("rows", 0.8, 0.95, belt))
            if symbol_col:
                ops.append(("front", _sym(symbol_col[0], "left", color_bg=symbol_col[1])))
                ops.append(("back", _sym(symbol_col[0], "center", color_bg=symbol_col[1], size=0.55, y=0.35)))
            paint_box(16, 16, 8, 12, 4, part_painter(ops))
            arm_ops = []
            if not skin_arms:
                arm_ops.append(("fill", top))
            if wrist:
                arm_ops.append(("rows", 0.72, 1.0, wrist))
            if glove:
                arm_ops.append(("rows", 0.7, 1.0, glove))
            if arm_ops:
                paint_box(40, 16, 4, 12, 4, part_painter(arm_ops, outline=0))
        if boots:
            paint_box(0, 16, 4, 12, 4, part_painter([("rows", 0.68, 1.0, boots)], outline=0))
    else:
        if pants:
            ops = [("fill", pants)]
            if belt:
                ops.append(("rows", 0.8, 0.95, belt))
            paint_box(16, 16, 8, 12, 4, part_painter([("rows", 0.62, 1.0, pants)] + ([("rows", 0.8, 0.95, belt)] if belt else []), outline=0))
            paint_box(0, 16, 4, 12, 4, part_painter([("fill", pants)]))
    return img
