"""Humanoid character builder: body proportions, painted clothes, faces, hairstyles and extra parts."""
from model import Model, Face, mul, mix, rgb, spiky, solid, SCALE

BUILDS = {
    #          head   body          arm          leg
    "normal": (8, (8, 12, 4), (4, 12, 4), (4, 12, 4)),
    "big": (8, (10, 14, 6), (5, 14, 5), (5, 13, 5)),
    "huge": (9, (13, 16, 8), (6, 16, 6), (6, 14, 6)),
    "tall": (8, (8, 14, 4), (4, 14, 4), (4, 16, 4)),
    "short": (8, (8, 10, 4), (3, 10, 3), (4, 9, 4)),
    "kid": (8, (7, 8, 4), (3, 8, 3), (3, 7, 3)),
    "tiny": (8, (6, 7, 4), (2, 7, 2), (2, 5, 2)),
    "fat": (8, (12, 12, 9), (4, 11, 4), (5, 9, 5)),
    "ape": (10, (14, 15, 10), (6, 18, 6), (6, 11, 6)),
    "bighead": (10, (8, 13, 5), (4, 13, 4), (4, 14, 4)),
}

BLACK = (24, 22, 28)
WHITE = (238, 236, 230)
SKIN = (240, 196, 160)


def dims(build):
    hs, body, arm, leg = BUILDS[build]
    return hs, body, arm, leg


# ---------------------------------------------------------------------------------------------
# painting helpers

def _apply_rows(face, a, b, c, noise=0.04):
    if face.name == "up":
        if a <= 0.0001:
            face.fill(c, noise)
        return
    if face.name == "down":
        if b >= 0.999:
            face.fill(c, noise)
        return
    face.rect(0, int(round(a * face.h)), face.w, int(round(b * face.h)), c, noise)


def part_painter(ops, outline=0.78):
    def p(face):
        for op in ops:
            kind = op[0]
            if kind == "fill":
                face.fill(op[1], op[2] if len(op) > 2 else 0.05)
            elif kind == "rows":
                _apply_rows(face, op[1], op[2], op[3])
            elif kind == "front":
                if face.name == "north":
                    op[1](face)
            elif kind == "back":
                if face.name == "south":
                    op[1](face)
            elif kind == "sides":
                if face.name in ("east", "west"):
                    op[1](face)
            elif kind == "all":
                op[1](face)
            elif kind == "top":
                if face.name == "up":
                    op[1](face)
        if outline:
            face.outline(outline)
    return p


def vneck(color, depth=0.4, width=0.5):
    def fn(f):
        cx = f.w / 2
        hw = f.w * width / 2
        dh = f.h * depth
        for y in range(int(dh)):
            span = hw * (1 - y / dh)
            f.rect(int(cx - span), y, int(cx + span + 0.5), y + 1, color)
    return fn


def symbol(kind, side="left", color_bg=WHITE, color_fg=BLACK, size=0.32, y=0.28):
    """Draw a round emblem. side='left' is the character's left chest (viewer's right)."""
    def fn(f):
        r = f.w * size / 2
        cx = {"left": f.w * 0.70, "right": f.w * 0.30, "center": f.w * 0.5}[side]
        cy = f.h * y
        if kind in ("kame", "kai", "go", "majin_m", "cc", "rr", "goku_kanji", "ma", "z"):
            if kind != "majin_m":
                f.circle(cx, cy, r, color_bg)
            glyph(f, kind, cx, cy, r * 0.8, color_fg)
        elif kind == "potara":
            f.circle(cx, cy, r, (250, 210, 40))
    return fn


def glyph(f, kind, cx, cy, r, c):
    """Tiny pixel glyphs for emblems (kame 亀, kai 界, go 悟, ma 魔, M, CC, RR)."""
    pat = {
        "kame": ["0110", "1111", "0110", "1111", "1001"],
        "kai": ["1111", "1011", "1111", "0110", "1001"],
        "go": ["1011", "1111", "1010", "1111", "1011"],
        "goku_kanji": ["1011", "1111", "1010", "1111", "1011"],
        "ma": ["1111", "1001", "1111", "1010", "1111"],
        "majin_m": ["10001", "11011", "10101", "10001", "10001"],
        "cc": ["0110", "1000", "1000", "1000", "0110"],
        "rr": ["1110", "1010", "1100", "1010", "1001"],
        "z": ["1111", "0010", "0100", "1000", "1111"],
    }[kind]
    rows = len(pat)
    cols = len(pat[0])
    cell = max(1, int(round(2 * r / rows)))
    x0 = int(round(cx - cols * cell / 2))
    y0 = int(round(cy - rows * cell / 2))
    for j, row in enumerate(pat):
        for i, ch in enumerate(row):
            if ch == "1":
                f.rect(x0 + i * cell, y0 + j * cell, x0 + (i + 1) * cell, y0 + (j + 1) * cell, c, noise=0, shade=False)


def armor_front(color, trim, pad=True):
    """Saiyan battle armor drawn over a torso face."""
    def fn(f):
        f.rect(0, 0, f.w, int(f.h * 0.72), color)
        f.rect(0, 0, f.w, max(2, int(f.h * 0.07)), trim)
        f.rect(int(f.w * 0.15), int(f.h * 0.50), int(f.w * 0.85), int(f.h * 0.53), mul(color, 0.85))
        f.rect(int(f.w * 0.15), int(f.h * 0.60), int(f.w * 0.85), int(f.h * 0.63), mul(color, 0.85))
        f.rect(0, int(f.h * 0.72), f.w, int(f.h * 0.75), trim)
    return fn


def stripe_v(color, x0, x1):
    def fn(f):
        f.rect(int(f.w * x0), 0, int(f.w * x1), f.h, color)
    return fn


def spots(color, n=6, r=1.2):
    def fn(f):
        for _ in range(n):
            f.circle(f.rng.random() * f.w, f.rng.random() * f.h, r * SCALE, color)
    return fn


# ---------------------------------------------------------------------------------------------
# heads

def head_painter(spec):
    skin = spec.get("skin", SKIN)
    hair = spec.get("hair")
    front_rows = spec.get("front", 0.25)
    side_rows = spec.get("side", 0.45)
    back_rows = spec.get("back", 0.9)
    eyes = spec.get("eyes", "normal")
    brows = spec.get("brows", "normal")
    mouth = spec.get("mouth", "normal")
    extra = spec.get("extra", [])
    eye_col = spec.get("eye_color", BLACK)
    top_col = spec.get("top", hair)

    def p(f):
        f.fill(skin, 0.035)
        if f.name == "up" and top_col:
            f.fill(top_col, 0.06)
        if hair:
            if f.name == "north" and front_rows:
                f.rect(0, 0, f.w, int(f.h * front_rows), hair, 0.06)
                widow = spec.get("widow")
                if widow:
                    # widow's peak
                    for y in range(int(f.h * front_rows), int(f.h * (front_rows + 0.12))):
                        span = (int(f.h * (front_rows + 0.12)) - y)
                        f.rect(int(f.w / 2 - span), y, int(f.w / 2 + span), y + 1, hair, 0.06)
                    f.rect(0, int(f.h * front_rows), int(f.w * 0.12), int(f.h * (front_rows + 0.15)), hair, 0.06)
                    f.rect(int(f.w * 0.88), int(f.h * front_rows), f.w, int(f.h * (front_rows + 0.15)), hair, 0.06)
            if f.name in ("east", "west") and side_rows:
                f.rect(0, 0, f.w, int(f.h * side_rows), hair, 0.06)
                # sideburn toward the back
                f.rect(0 if f.name == "east" else int(f.w * 0.6), 0, int(f.w * 0.4) if f.name == "east" else f.w,
                       int(f.h * min(1, side_rows + 0.25)), hair, 0.06)
            if f.name == "south" and back_rows:
                f.rect(0, 0, f.w, int(f.h * back_rows), hair, 0.06)
        if f.name in ("east", "west"):
            # ear
            ex = int(f.w * 0.45)
            f.rect(ex, int(f.h * 0.45), ex + SCALE, int(f.h * 0.7), mul(skin, 0.82), 0.02)
        if f.name == "north":
            draw_face(f, skin, hair, eyes, brows, mouth, eye_col)
        for fn in extra:
            fn(f)
        f.outline(0.86)
    return p


def draw_face(f, skin, hair, eyes, brows, mouth, eye_col):
    w, h = f.w, f.h
    u = w / 16.0  # face designed on a 16x16 grid
    v = h / 16.0

    def R(x0, y0, x1, y1, c, noise=0.0):
        f.rect(int(round(x0 * u)), int(round(y0 * v)), int(round(x1 * u)), int(round(y1 * v)), c, noise=noise, shade=False)

    dark = mul(skin, 0.55)
    brow_col = mul(hair, 0.7) if hair else mul(skin, 0.5)
    ey = 8
    if eyes in ("normal", "sharp", "ssj", "red", "android", "glow", "cat", "silver", "pink"):
        pupil = {"normal": eye_col, "sharp": eye_col, "ssj": (20, 170, 170), "red": (200, 20, 40),
                 "android": (40, 90, 200), "glow": (250, 250, 255), "cat": (240, 200, 40),
                 "silver": (190, 200, 220), "pink": (220, 60, 140)}[eyes]
        white = (250, 250, 250) if eyes not in ("glow",) else (220, 240, 255)
        if eyes == "cat":
            white = (250, 230, 120)
        # eyes: viewer-left eye spans x 3..6, right eye 10..13
        for x0 in (3, 10):
            R(x0, ey, x0 + 3, ey + 2, white)
        inner_l, inner_r = 5, 10
        if eyes == "sharp":
            R(inner_l, ey, inner_l + 1, ey + 2, pupil)
            R(inner_r, ey, inner_r + 1, ey + 2, pupil)
        else:
            R(inner_l - 0.5, ey, inner_l + 1, ey + 2, pupil)
            R(inner_r, ey, inner_r + 1.5, ey + 2, pupil)
        R(3, ey - 0.5, 6, ey, BLACK)
        R(10, ey - 0.5, 13, ey, BLACK)
    elif eyes == "blank":  # sunglasses
        R(2, ey - 1, 14, ey + 2, (20, 20, 26))
        R(3, ey - 0.5, 5, ey, (120, 120, 140))
        R(10, ey - 0.5, 12, ey, (120, 120, 140))
    elif eyes == "small":  # Buu style
        R(4, ey, 6, ey + 1.5, BLACK)
        R(10, ey, 12, ey + 1.5, BLACK)
    elif eyes == "closed":
        R(3, ey + 1, 6, ey + 1.6, BLACK)
        R(10, ey + 1, 13, ey + 1.6, BLACK)
    elif eyes == "four":
        for x0 in (2, 5.5, 9, 12.5):
            R(x0, ey - 1, x0 + 2, ey + 1, (250, 250, 250))
            R(x0 + 0.6, ey - 0.6, x0 + 1.4, ey + 0.6, (180, 20, 40))
    elif eyes == "insect":
        R(2, ey - 1, 6, ey + 2, (120, 40, 160))
        R(10, ey - 1, 14, ey + 2, (120, 40, 160))
        R(3, ey - 0.5, 4, ey + 0.5, (230, 200, 250))
        R(11, ey - 0.5, 12, ey + 0.5, (230, 200, 250))
    elif eyes == "visor":
        R(1, ey - 1, 15, ey + 2, (230, 40, 40))
        R(2, ey - 0.5, 14, ey, (255, 160, 160))
    elif eyes == "beast":
        R(3, ey, 6, ey + 2, (200, 30, 30))
        R(10, ey, 13, ey + 2, (200, 30, 30))
    if eyes == "three":
        for x0 in (3, 10):
            R(x0, ey, x0 + 3, ey + 2, (250, 250, 250))
        R(4.5, ey, 6, ey + 2, BLACK)
        R(10, ey, 11.5, ey + 2, BLACK)
        R(7, 4.5, 9, 6.5, (250, 250, 250))
        R(7.5, 4.8, 8.5, 6.2, BLACK)
    # brows
    if brows == "normal":
        R(3, ey - 2, 6, ey - 1.2, brow_col)
        R(10, ey - 2, 13, ey - 1.2, brow_col)
    elif brows == "angry":
        R(3, ey - 2.4, 4.5, ey - 1.6, brow_col)
        R(4.5, ey - 2, 6.5, ey - 1.2, brow_col)
        R(11.5, ey - 2.4, 13, ey - 1.6, brow_col)
        R(9.5, ey - 2, 11.5, ey - 1.2, brow_col)
    elif brows == "ridge":  # SSJ3 / alien brow ridge
        R(2.5, ey - 2, 13.5, ey - 1.3, mul(skin, 0.72))
    # nose
    if mouth not in ("muzzle", "beak"):
        R(7.5, 10.5, 8.5, 11.5, mul(skin, 0.8))
    # mouth
    if mouth == "normal":
        R(6, 13, 10, 13.7, dark)
    elif mouth == "grin":
        R(5.5, 12.5, 10.5, 14, (250, 250, 250))
        R(5.5, 12.5, 10.5, 12.9, dark)
    elif mouth == "frown":
        R(6, 13.2, 10, 13.8, dark)
        R(5.5, 13.8, 6, 14.4, dark)
        R(10, 13.8, 10.5, 14.4, dark)
    elif mouth == "mustache":
        R(4.5, 12, 11.5, 13.3, (30, 26, 24))
        R(4.5, 13.3, 5.5, 15, (30, 26, 24))
        R(10.5, 13.3, 11.5, 15, (30, 26, 24))
    elif mouth == "beard":
        R(3, 12, 13, 16, (245, 245, 245), noise=0.05)
        R(4.5, 11.5, 11.5, 12.4, (245, 245, 245))
        R(6.5, 12.6, 9.5, 13.2, dark)
    elif mouth == "fangs":
        R(5.5, 12.5, 10.5, 14, (60, 20, 20))
        R(6, 12.5, 7, 13.5, WHITE)
        R(9, 12.5, 10, 13.5, WHITE)
    elif mouth == "muzzle":
        R(3.5, 10.5, 12.5, 15.5, mix(skin, (240, 210, 180), 0.6))
        R(6, 11, 7, 12, BLACK)
        R(9, 11, 10, 12, BLACK)
        R(5, 14, 11, 14.6, dark)
    elif mouth == "beak":
        R(5, 11, 11, 14, (240, 160, 40))


# ---------------------------------------------------------------------------------------------
# hair

def spike(m, bone, base, length, thick, rot, painter, segs=3):
    """Tapered spike that grows along local +Y from `base`, rotated around `base`."""
    x, y, z = base
    plan = [(1.0, 0.45), (0.68, 0.33), (0.38, 0.22)][:segs]
    off = 0.0
    for tf, lf in plan:
        t = max(0.8, thick * tf)
        L = max(0.6, length * lf)
        m.cube(bone, (x - t / 2, y + off, z - t / 2), (t, L + 0.3, t), painter,
               rotation=list(rot), pivot=[x, y, z])
        off += L


def hair_cubes(m, style, color, head_box, bone="head"):
    """Add hair geometry for a style. head_box = (x0, y0, z0, size)."""
    if not style:
        return
    x0, y0, z0, s = head_box
    k = s / 8.0
    cx, top, fz, bz = x0 + s / 2, y0 + s, z0, z0 + s  # fz = front (-z) plane
    P = spiky(color)

    def S(base, length, thick, rot, segs=3):
        spike(m, bone, (base[0] * k + cx, base[1] * k + y0, base[2] * k + z0 + s / 2), length * k, thick * k, rot, P, segs)

    def C(o, size):
        m.cube(bone, (o[0] * k + cx, o[1] * k + y0, o[2] * k + z0 + s / 2), [v * k for v in size], P)

    if style in ("goku", "goten", "black", "gohan", "yamcha", "broly"):
        C((-4.5, 5.5, -4.5), (9, 3, 9))
        C((-4.5, 1.0, 1.5), (9, 6.5, 3.2))
        if style == "gohan":
            for bx, rz in ((-1.5, 10), (1.5, -12)):
                S((bx, 8, -4.4), 3.0, 2.0, (165, 0, rz))
            S((0, 8, 0), 5.5, 3.2, (-35, 0, 0))
            for sx in (-1, 1):
                S((sx * 2.8, 7.5, 0.5), 5, 2.8, (-30, 0, sx * -45))
                S((sx * 3.8, 5, 1.5), 4, 2.4, (-15, 0, sx * -80))
            S((0, 3, 3.6), 4, 2.6, (-95, 0, 0))
            return
        bang = [(-3, 12), (-1, 4), (1.2, -6), (3.2, -14)]
        if style == "goten":
            bang = [(-2.5, 10), (0, 0), (2.5, -10)]
        for bx, rz in bang:
            S((bx, 8.2, -4.5), 4.0 if style != "goten" else 3.2, 2.2, (160, 0, rz))
        S((0, 8, 0.5), 7.5, 3.8, (-38, 0, 0))
        for sx in (-1, 1):
            S((sx * 2.8, 7.6, 0.5), 6.5, 3.2, (-30, 0, sx * -42))
            S((sx * 3.9, 5.5, 1.0), 5.5, 2.8, (-12, 0, sx * -78))
            S((sx * 2.5, 2.5, 3.6), 5.0, 2.8, (-100, 0, sx * -32))
            S((sx * 4.2, 3.0, -0.5), 3.5, 2.0, (0, 0, sx * -100))
        S((0, 3.5, 3.6), 5.5, 3.0, (-85, 0, 0))
        if style == "broly":
            S((0, 1.5, 3.8), 6, 3.0, (-120, 0, 0))
    elif style in ("ssj", "ssj2", "rose", "trunks_ssj", "lssj"):
        big = 1.35 if style == "lssj" else 1.0
        C((-4.5, 6, -4.5), (9, 2.6, 9))
        C((-4.4, 1.5, 2.0), (8.8, 6, 2.6))
        S((0, 8, -0.5), 8.5 * big, 4.2, (-8, 0, 0))
        for sx in (-1, 1):
            S((sx * 2.6, 8, -1.5), 7.5 * big, 3.6, (5, 0, sx * -20))
            S((sx * 2.5, 8, 2.0), 7.5 * big, 3.4, (-24, 0, sx * -26))
            S((sx * 4.0, 6, 0.0), 5.5 * big, 2.8, (-5, 0, sx * -58))
            S((sx * 3.5, 4, 2.5), 4.5 * big, 2.4, (-40, 0, sx * -70))
        S((0, 7, 3.2), 7 * big, 3.4, (-42, 0, 0))
        S((0, 4, 3.8), 4.5, 2.6, (-80, 0, 0))
        S((-1.2, 8.3, -4.5), 3.4, 1.8, (165, 0, 8))
        if style == "ssj2":
            S((1.6, 8.0, -4.6), 4.6, 1.6, (172, 0, -4), segs=2)
        else:
            S((2.2, 8.3, -4.5), 3.0, 1.8, (160, 0, -10))
    elif style == "ssj3":
        C((-4.6, 5.5, -4.6), (9.2, 3.2, 9.2))
        C((-5.0, -13, 1.2), (10, 21, 4))
        C((-4.0, -18, 1.8), (8, 6, 3))
        for i, (yy, ln) in enumerate(((6, 7), (2, 7), (-3, 7), (-8, 6), (-13, 6))):
            for sx in (-1, 1):
                S((sx * 4.5, yy, 2.5), ln, 3.2, (-60, 0, sx * -60))
        S((0, 8, 0), 6, 4, (-25, 0, 0))
        for bx, rz in ((-2.5, 12), (0, 0), (2.5, -12)):
            S((bx, 8.2, -4.5), 4.5, 2.2, (165, 0, rz))
    elif style == "ssj4":
        C((-4.6, 5.5, -4.6), (9.2, 3.2, 9.2))
        C((-5.0, -6, 1.5), (10, 14, 3.6))
        for yy in (6, 2, -2, -6):
            for sx in (-1, 1):
                S((sx * 4.2, yy, 2.0), 6, 3.0, (-70, 0, sx * -50))
        S((0, 8, 0.5), 6, 3.6, (-30, 0, 0))
        for bx, rz in ((-2.8, 15), (-0.5, 5), (1.8, -8), (3.4, -16)):
            S((bx, 8.2, -4.5), 4.6, 2.0, (160, 0, rz))
    elif style == "vegeta":
        C((-4.5, 5.5, -4.5), (9, 3, 9))
        C((-4.4, 2.0, 2.0), (8.8, 5.5, 2.6))
        S((0, 8, 0), 11, 5, (-6, 0, 0))
        for sx in (-1, 1):
            S((sx * 2.4, 8, -0.5), 9.5, 4, (2, 0, sx * -16))
            S((sx * 1.5, 8, 2.2), 9.5, 4, (-16, 0, sx * -10))
            S((sx * 3.6, 7, 1.0), 7, 3, (-6, 0, sx * -32))
        S((0, 8, -2.4), 8, 3.4, (6, 0, 0))
    elif style == "trunks":
        C((-4.6, 5.2, -4.6), (9.2, 3.4, 9.2))
        for sx in (-1, 1):
            C((-0.6 + sx * 4.6 - (0 if sx > 0 else 0.4), 1.5, -4.0), (1.0, 6, 8.6))
        C((-4.6, 0.5, 3.6), (9.2, 7.5, 1.0))
        C((-4.6, 6.0, -4.8), (4.5, 2.4, 1.0))
        C((0.2, 6.0, -4.8), (4.4, 2.4, 1.0))
    elif style == "bob":  # Bulma / 18
        C((-4.7, 5.0, -4.7), (9.4, 3.8, 9.4))
        C((-4.9, 0.5, -3.0), (1.2, 7.0, 7.6))
        C((3.7, 0.5, -3.0), (1.2, 7.0, 7.6))
        C((-4.9, 0.0, 3.5), (9.8, 8.0, 1.3))
        C((-4.7, 6.2, -4.9), (9.4, 1.8, 1.0))
    elif style == "a17":
        C((-4.7, 5.0, -4.7), (9.4, 3.8, 9.4))
        C((-4.9, 0.5, -3.5), (1.2, 7.0, 8.0))
        C((3.7, 0.5, -3.5), (1.2, 7.0, 8.0))
        C((-4.9, -0.5, 3.5), (9.8, 9.0, 1.3))
        C((-3.5, 5.5, -4.9), (7, 2.5, 1.0))
    elif style == "raditz":
        C((-4.6, 5.5, -4.6), (9.2, 3.2, 9.2))
        C((-5.4, -26, 1.0), (10.8, 34, 4.4))
        for yy in (4, -2, -8, -14, -20):
            for sx in (-1, 1):
                S((sx * 5.0, yy, 3.0), 5, 3.0, (-60, 0, sx * -55))
        for bx, rz in ((-2.5, 12), (0, 0), (2.5, -12)):
            S((bx, 8.2, -4.5), 3.6, 2.0, (160, 0, rz))
        S((0, 8, 0), 6, 4, (-20, 0, 0))
    elif style == "zamasu":
        C((-1.2, 7.8, -4.2), (2.4, 3.2, 8.6))
    elif style == "mohawk":  # Elder Kai / Android 16 style
        C((-1.5, 7.8, -3.5), (3, 2.6, 8))
    elif style == "whis":
        C((-1.6, 7.8, -1.6), (3.2, 7.5, 3.2))
    elif style == "short":  # Yajirobe / announcer / soldier tuft
        C((-4.5, 5.6, -4.5), (9, 3, 9))
        C((-4.5, 2.5, 2.6), (9, 4, 2))
        for sx in (-1, 0, 1):
            S((sx * 2.5, 8, -3.8), 2.4, 2.0, (150, 0, -sx * 10), segs=2)
    elif style == "gero":
        C((-4.6, 2.0, -4.6), (9.2, 6.8, 9.2))
        C((-4.8, -6.0, 2.0), (9.6, 10, 2.8))
    elif style == "jeice":
        C((-4.6, 5.5, -4.6), (9.2, 3.2, 9.2))
        C((-4.8, -3, 1.8), (9.6, 11, 2.8))
        for sx in (-1, 1):
            C((sx * 4.4 - 0.6, -1, -2.0), (1.2, 8.5, 4.5))
    elif style == "recoome":
        C((-4.5, 5.8, -4.5), (9, 3, 9))
        for sx in (-1, 0, 1):
            S((sx * 2.6, 8, 0), 4.5, 3, (-15, 0, -sx * 25))


# ---------------------------------------------------------------------------------------------
# extra parts

def add_part(m, kind, opts, ctx):
    hs, body, arm, leg, H = ctx["hs"], ctx["body"], ctx["arm"], ctx["leg"], ctx
    head_y = ctx["head_y"]
    s = hs
    color = opts.get("color", (200, 200, 200))
    P = solid(color, outline=0.78)
    if kind == "tail":
        import math as _m
        m.bone("tail", "waist", (0, ctx["leg_h"] + 1, body[2] / 2))
        x, y, z = 0.0, ctx["leg_h"] + 1.0, body[2] / 2 - 0.5
        L = opts.get("length", 6)
        t = opts.get("thick", 2.2)
        angles = opts.get("angles", [-35, -15, 15, 45, 75])
        for i, a in enumerate(angles):
            tt = max(1.0, t * (1 - i * 0.1))
            m.cube("tail", (x - tt / 2, y - tt / 2, z), (tt, tt, L + 0.6), P, rotation=[a, 0, 0], pivot=[x, y, z])
            y += L * _m.sin(_m.radians(a))
            z += L * _m.cos(_m.radians(a))
        if opts.get("stinger"):
            m.cube("tail", (x - 1.2, y - 1.2, z - 0.5), (2.4, 2.4, 3), solid((230, 120, 40)))
    elif kind == "antennae":
        for sx in (-1, 1):
            bx = sx * 1.8
            m.cube("head", (bx - 0.5, head_y + s, -s / 2 + 1.5), (1, opts.get("len", 4), 1), P,
                   rotation=[25, 0, -sx * 15], pivot=[bx, head_y + s, -s / 2 + 2])
            m.cube("head", (bx - 0.8, head_y + s + opts.get("len", 4) - 0.6, -s / 2 + 0.2), (1.6, 1.6, 1.6), P,
                   rotation=[25, 0, -sx * 15], pivot=[bx, head_y + s, -s / 2 + 2])
    elif kind == "turban":
        band = opts.get("band", (110, 40, 140))

        def tp(f):
            f.fill(WHITE, 0.03)
            if f.name not in ("up", "down"):
                f.rect(0, int(f.h * 0.62), f.w, int(f.h * 0.85), band)
            f.outline(0.8)
        m.cube("head", (-s / 2 - 0.6, head_y + s * 0.45, -s / 2 - 0.6), (s + 1.2, s * 0.65, s + 1.2), tp)
        m.cube("head", (-s / 2 - 0.2, head_y + s * 1.1, -s / 2 - 0.2), (s + 0.4, 1.2, s + 0.4), solid(WHITE, 0.03))
        for sx in (-1, 1):
            m.cube("head", (sx * 1.6 - 0.5, head_y + s * 1.05, -s / 2 - 0.2), (1, 3.5, 1), solid(ctx["skin"]),
                   rotation=[30, 0, -sx * 12], pivot=[sx * 1.6, head_y + s * 1.05, -s / 2])
    elif kind == "cape":
        m.bone("cape", "body", (0, ctx["body_top"], body[2] / 2 + 0.5))
        length = opts.get("length", ctx["body_top"] - 2)

        def cp(f):
            f.fill(color, 0.04, grad=0.15)
            f.outline(0.75)
        m.cube("cape", (-body[0] / 2 - 1, ctx["body_top"] - length, body[2] / 2 + 0.3), (body[0] + 2, length, 0.8), cp,
               rotation=[-8, 0, 0], pivot=[0, ctx["body_top"], body[2] / 2 + 0.3])
        if opts.get("shoulders", True):
            for sx in (-1, 1):
                m.cube("body", ((body[0] / 2 - 1.6) if sx > 0 else (-body[0] / 2 - 1.6),
                                ctx["body_top"] - 1.6, -body[2] / 2 - 0.8),
                       (3.2, 2.2, body[2] + 1.6), solid(opts.get("pad", WHITE)))
    elif kind == "shoulder_pads":
        for sx in (-1, 1):
            ax = sx * (body[0] / 2 + arm[0] / 2)
            m.cube("rightArm" if sx < 0 else "leftArm", (ax - arm[0] / 2 - 1, ctx["body_top"] - 3.0, -arm[2] / 2 - 1),
                   (arm[0] + 2, 3.6, arm[2] + 2), solid(color, outline=0.7))
    elif kind == "horns":
        L = opts.get("len", 4)
        for sx in (-1, 1):
            hx = sx * (s / 2)
            m.cube("head", (hx - 1 + (1 if sx > 0 else 0), head_y + s * 0.62, -1), (2, 2, 2), P)
            m.cube("head", (hx + sx * 1.0 - 0.8, head_y + s * 0.65, -0.8), (1.6, L, 1.6), P,
                   rotation=[-opts.get("back", 10), 0, -sx * opts.get("spread", 20)],
                   pivot=[hx + sx * 1.0, head_y + s * 0.65, 0])
    elif kind == "dome":
        m.cube("head", (-s / 2 + 0.3, head_y + s - 0.4, -s / 2 + 1), (s - 0.6, opts.get("h", 2.5), s - 1.6),
               solid(color, outline=0.8))
    elif kind == "long_head":  # Frieza third form
        m.cube("head", (-s / 2 + 1, head_y + s * 0.5, -0.5), (s - 2, s * 0.7, s + 3), solid(color, outline=0.8),
               rotation=[-25, 0, 0], pivot=[0, head_y + s * 0.6, 0])
        m.cube("head", (-s / 2 + 2, head_y + s * 0.9, s / 2 + 1), (s - 4, 3, 4), solid(opts.get("tip", color)),
               rotation=[-25, 0, 0], pivot=[0, head_y + s * 0.6, 0])
    elif kind == "crest":  # Cell crown
        for sx in (-1, 1):
            m.cube("head", (sx * (s / 2 - 0.5) - 0.5, head_y + s * 0.6, -s / 2 + 0.5), (1, s * 0.7, s - 1),
                   solid(color, outline=0.7), rotation=[0, 0, -sx * 18], pivot=[sx * (s / 2 - 0.5), head_y + s * 0.6, 0])
        m.cube("head", (-1, head_y + s - 0.2, -s / 2 + 1), (2, 1.6, s - 2), solid(color))
    elif kind == "wings":
        for sx in (-1, 1):
            m.cube("body", (sx * 2.5 - (4 if sx > 0 else 0) + (0 if sx > 0 else 0), ctx["body_top"] - 10,
                            body[2] / 2 + 0.2), (4, 10, 0.8), solid(color, outline=0.6),
                   rotation=[-10, 0, sx * 25], pivot=[sx * 1.5, ctx["body_top"] - 1, body[2] / 2])
    elif kind == "shell":  # Roshi's turtle shell
        def sp(f):
            f.fill((60, 140, 70), 0.05)
            for yy in range(0, f.h, 4 * SCALE):
                f.rect(0, yy, f.w, yy + 1, (40, 90, 40), shade=False)
            for xx in range(0, f.w, 4 * SCALE):
                f.rect(xx, 0, xx + 1, f.h, (40, 90, 40), shade=False)
            f.outline(0.6)
        m.cube("body", (-body[0] / 2 - 0.5, ctx["leg_h"] + 1, body[2] / 2), (body[0] + 1, body[1] - 1, 3.5), sp)
    elif kind == "staff":
        m.cube("rightArm", (-body[0] / 2 - arm[0] / 2 - 0.5, ctx["leg_h"] - 6, -arm[2] / 2 - 1.5),
               (1, 26, 1), solid((200, 200, 210)))
        m.cube("rightArm", (-body[0] / 2 - arm[0] / 2 - 1.5, ctx["leg_h"] + 19, -arm[2] / 2 - 2.5),
               (3, 3, 3), solid((80, 200, 230)))
    elif kind == "sword_back":
        m.cube("body", (-0.5, ctx["leg_h"] + 3, body[2] / 2 + 0.4), (1.2, 16, 1.0), solid((190, 195, 210)),
               rotation=[0, 0, 35], pivot=[0, ctx["leg_h"] + 8, body[2] / 2])
        m.cube("body", (-1.5, ctx["leg_h"] + 3, body[2] / 2 + 0.3), (3.2, 4.5, 1.3), solid((120, 70, 40)),
               rotation=[0, 0, 35], pivot=[0, ctx["leg_h"] + 8, body[2] / 2])
    elif kind == "halo_ring":  # Whis / angel neck ring
        r = s / 2 + 2
        for ang in (0, 45, 90, 135):
            m.cube("body", (-r, ctx["body_top"] + 0.5, -0.5), (2 * r, 0.8, 1), solid((120, 220, 240)),
                   rotation=[0, ang, 0], pivot=[0, ctx["body_top"] + 0.9, 0])
    elif kind == "cat_ears":
        for sx in (-1, 1):
            m.cube("head", (sx * 2.5 - 1.25, head_y + s - 0.5, -0.5), (2.5, opts.get("len", 4), 1.5), P,
                   rotation=[0, 0, -sx * 12], pivot=[sx * 2.5, head_y + s, 0])
    elif kind == "monkey_ears":
        for sx in (-1, 1):
            m.cube("head", (sx * (s / 2) + (0 if sx > 0 else -1.5), head_y + s * 0.45, -0.5), (1.5, 2.5, 1.5), P)
    elif kind == "beard_long":
        m.cube("head", (-2.5, head_y - 4, -s / 2 - 0.6), (5, 5, 1.2), solid(WHITE, 0.04))
    elif kind == "scarf":
        m.cube("body", (-body[0] / 2 - 0.3, ctx["body_top"] - 1.8, -body[2] / 2 - 0.3), (body[0] + 0.6, 2, body[2] + 0.6),
               solid(color))
        m.cube("body", (1.0, ctx["body_top"] - 6, -body[2] / 2 - 0.6), (2, 5, 0.6), solid(color))
    elif kind == "hat":
        m.cube("head", (-s / 2 - 0.6, head_y + s - 1.2, -s / 2 - 0.6), (s + 1.2, opts.get("h", 3), s + 1.2),
               solid(color, outline=0.75))
        if opts.get("brim"):
            m.cube("head", (-s / 2 - 1.6, head_y + s - 1.4, -s / 2 - 1.6), (s + 3.2, 0.6, s + 3.2), solid(color))
    elif kind == "helmet":
        m.cube("head", (-s / 2 - 0.5, head_y + s * 0.55, -s / 2 - 0.5), (s + 1, s * 0.55, s + 1), solid(color, outline=0.7))
    elif kind == "scouter":
        m.cube("head", (-s / 2 - 1.0, head_y + s * 0.35, -1.5), (1.0, 3, 3), solid((210, 210, 210)))
        m.cube("head", (-s / 2 - 0.6, head_y + s * 0.4, -s / 2 - 1.2), (3.5, 2.4, 0.4), solid((60, 230, 90)))
    elif kind == "belly":
        m.cube("body", (-body[0] / 2 + 0.5, ctx["leg_h"] + 1, -body[2] / 2 - 2), (body[0] - 1, body[1] * 0.6, 2.5),
               solid(color, outline=0.85))
    elif kind == "head_tentacle":  # Buu antenna
        n = opts.get("n", 4)
        for i in range(n):
            m.cube("head", (-1.0 + 0.1 * i, head_y + s + i * 1.6 - 0.4, -1.0 + i * 1.3), (2 - 0.25 * i, 2.2, 2 - 0.25 * i), P,
                   rotation=[-20 * i, 0, 0], pivot=[0, head_y + s, 0])
    elif kind == "ridges":
        for sx in (-1, 1):
            m.cube("head", (sx * 2 - 0.7, head_y + s - 0.5, -s / 2 + 1), (1.4, 1.4, s - 1), solid(color))
    elif kind == "muzzle":
        m.cube("head", (-s / 4, head_y + 0.5, -s / 2 - 2.5), (s / 2, s * 0.35, 2.6), solid(color, outline=0.75))
    elif kind == "earrings":  # Potara
        for sx in (-1, 1):
            m.cube("head", (sx * (s / 2 + 0.2) - 0.5, head_y + 1.5, -0.5), (1, 1.4, 1), solid((250, 210, 40)))
    elif kind == "wristbands":
        pass
    elif kind == "katana_hip":
        m.cube("body", (body[0] / 2 + 0.2, ctx["leg_h"] - 4, -1), (1, 12, 1.2), solid((60, 40, 30)),
               rotation=[30, 0, 0], pivot=[body[0] / 2, ctx["leg_h"] + 1, 0])
    elif kind == "insect_body":
        pass


# ---------------------------------------------------------------------------------------------
# main builder

def build_humanoid(identifier, spec):
    build = spec.get("build", "normal")
    hs, body, arm, leg = dims(build)
    if "head_size" in spec:
        hs = spec["head_size"]
    leg_h = leg[1]
    body_top = leg_h + body[1]
    head_y = body_top
    total = body_top + hs
    m = Model(identifier, 128, 128, bounds=(max(2, total / 16 * 1.4), max(2.5, total / 16 * 1.6), (0, total / 32, 0)))
    skin = spec.get("skin", SKIN)
    ctx = {"hs": hs, "body": body, "arm": arm, "leg": leg, "leg_h": leg_h, "body_top": body_top,
           "head_y": head_y, "skin": skin}

    m.bone("root", None, (0, 0, 0))
    m.bone("waist", "root", (0, leg_h, 0))
    m.bone("body", "waist", (0, body_top, 0))
    m.bone("head", "body", (0, body_top, 0))
    ax = spec.get("arm_pivot_x", body[0] / 2 + arm[0] / 2)
    m.bone("rightArm", "body", (-ax, body_top - 2, 0))
    m.bone("leftArm", "body", (ax, body_top - 2, 0))
    lpx = spec.get("leg_pivot_x", leg[0] / 2)
    m.bone("rightLeg", "root", (-lpx, leg_h, 0))
    m.bone("leftLeg", "root", (lpx, leg_h, 0))

    head = dict(spec.get("head", {}))
    head.setdefault("skin", skin)
    inf = spec.get("inflate", 0.0)
    hinf = spec.get("head_inflate", inf)
    m.cube("head", (-hs / 2, head_y, -hs / 2), (hs, hs, hs), head_painter(head), inflate=hinf)
    m.cube("body", (-body[0] / 2, leg_h, -body[2] / 2), body, part_painter(spec.get("torso", [("fill", skin)])),
           inflate=inf)
    arms = spec.get("arms", [("fill", skin)])
    m.cube("rightArm", (-body[0] / 2 - arm[0], body_top - arm[1], -arm[2] / 2), arm,
           part_painter(spec.get("arm_r", arms)), inflate=inf)
    m.cube("leftArm", (body[0] / 2, body_top - arm[1], -arm[2] / 2), arm, part_painter(spec.get("arm_l", arms)),
           inflate=inf)
    legs = spec.get("legs", [("fill", skin)])
    lx = spec.get("leg_x", 0)
    m.cube("rightLeg", (-leg[0] + lx, 0, -leg[2] / 2), leg, part_painter(legs), inflate=inf)
    m.cube("leftLeg", (-lx, 0, -leg[2] / 2), leg, part_painter(legs), inflate=inf)

    hair = spec.get("hair")
    if hair:
        style, color = hair
        hair_cubes(m, style, color, (-hs / 2, head_y, -hs / 2, hs))
    for part in spec.get("parts", []):
        kind = part[0]
        opts = part[1] if len(part) > 1 else {}
        add_part(m, kind, opts, ctx)
    return m


# ---------------------------------------------------------------------------------------------
# clothing presets

def gi(top, under=None, belt=None, symbol_kind=None, back_symbol=None, sleeveless=True, under_front=True):
    ops = [("fill", top)]
    if under and under_front:
        ops.append(("front", vneck(under, 0.42, 0.55)))
        ops.append(("back", vneck(under, 0.18, 0.5)))
    if belt:
        ops.append(("rows", 0.8, 0.93, belt))
    if symbol_kind:
        ops.append(("front", symbol(symbol_kind, "left")))
    if back_symbol:
        ops.append(("back", symbol(back_symbol, "center", size=0.55, y=0.35)))
    return ops


def arms_preset(skin, sleeve=None, sleeve_len=0.0, band=None, glove=None, glove_len=0.25):
    ops = [("fill", skin)]
    if sleeve and sleeve_len > 0:
        ops.append(("rows", 0.0, sleeve_len, sleeve))
    if band:
        ops.append(("rows", 0.72, 1.0, band))
    if glove:
        ops.append(("rows", 1 - glove_len, 1.0, glove))
    return ops


def legs_preset(pants, boots=None, boot_len=0.3, trim=None, band=None):
    ops = [("fill", pants)]
    if band:
        ops.append(("rows", 0.0, 0.08, band))
    if boots:
        ops.append(("rows", 1 - boot_len, 1.0, boots))
        if trim:
            ops.append(("rows", 1 - boot_len, 1 - boot_len + 0.06, trim))
    return ops
