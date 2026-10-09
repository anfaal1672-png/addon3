"""32x32 pixel-art item icons and block textures, drawn procedurally."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter
from model import rgb, mul, mix

N = 32


def canvas():
    return Image.new("RGBA", (N, N), (0, 0, 0, 0))


def outline(img, col=(20, 16, 24, 255)):
    """Add a 1px dark outline around opaque pixels."""
    px = img.load()
    out = img.copy()
    po = out.load()
    for y in range(N):
        for x in range(N):
            if px[x, y][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < N and 0 <= yy < N and px[xx, yy][3] > 0:
                        po[x, y] = col
                        break
    return out


def shaded_circle(d, cx, cy, r, base, light=(255, 255, 255), hl=True):
    for y in range(N):
        for x in range(N):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            dist = math.hypot(dx, dy)
            if dist <= r:
                t = max(0.0, (dx + dy) / (2 * r) + 0.15)
                c = mul(base, 1.15 - 0.5 * t)
                d.point((x, y), fill=c + (255,))
    if hl:
        d.ellipse((cx - r * 0.6, cy - r * 0.65, cx - r * 0.1, cy - r * 0.2), fill=mix(base, light, 0.65) + (255,))


def star(d, cx, cy, r, col):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=col)


def dragonball_icon(n, base=rgb("ff9a1a"), big=False):
    img = canvas()
    d = ImageDraw.Draw(img)
    r = 13 if not big else 14.5
    shaded_circle(d, 16, 16, r, base)
    from misc_models import STAR_LAYOUT
    sr = 3.6 if n <= 2 else 2.8
    for (u, v) in STAR_LAYOUT[n]:
        star(d, 8 + u * 16, 8 + v * 16, sr, (210, 20, 20, 255))
    return outline(img)


def orb_icon(core, edge, label=None):
    img = canvas()
    d = ImageDraw.Draw(img)
    for i in range(14, 0, -1):
        t = i / 14
        c = mix(core, edge, t)
        d.ellipse((16 - i, 16 - i, 16 + i, 16 + i), fill=c + (int(255 * (1.05 - t * 0.6)),))
    if label:
        draw_label(d, label)
    return img


FONT = {
    "A": ["0110", "1001", "1111", "1001", "1001"],
    "B": ["1110", "1001", "1110", "1001", "1110"],
    "C": ["0111", "1000", "1000", "1000", "0111"],
    "D": ["1110", "1001", "1001", "1001", "1110"],
}


def draw_label(d, ch):
    pat = FONT[ch]
    x0, y0 = 11, 9
    for j, row in enumerate(pat):
        for i, c in enumerate(row):
            if c == "1":
                d.rectangle((x0 + i * 2.5, y0 + j * 3, x0 + i * 2.5 + 2, y0 + j * 3 + 2), fill=(20, 20, 30, 255))


def flame_icon(col_core, col_edge):
    img = canvas()
    d = ImageDraw.Draw(img)
    for i, (w, h, c) in enumerate(((13, 26, col_edge), (9, 20, mix(col_edge, col_core, 0.5)), (5, 13, col_core))):
        d.polygon([(16, 31 - h - 2), (16 + w, 30 - h * 0.35), (16 + w * 0.7, 30), (16 - w * 0.7, 30), (16 - w, 30 - h * 0.35)],
                  fill=c + (255,))
    return outline(img)


def bolt_icon():
    img = canvas()
    d = ImageDraw.Draw(img)
    d.polygon([(18, 2), (7, 18), (15, 18), (11, 30), (25, 12), (17, 12), (22, 2)], fill=(255, 220, 40, 255))
    d.polygon([(18, 4), (10, 17), (15, 17)], fill=(255, 250, 200, 255))
    return outline(img)


def guard_icon():
    img = canvas()
    d = ImageDraw.Draw(img)
    skin = (240, 196, 160, 255)
    d.polygon([(4, 8), (9, 4), (28, 23), (23, 28)], fill=skin)
    d.polygon([(28, 8), (23, 4), (4, 23), (9, 28)], fill=mul(skin[:3], 0.85) + (255,))
    d.rectangle((3, 22, 9, 29), fill=(42, 79, 180, 255))
    d.rectangle((23, 22, 29, 29), fill=(42, 79, 180, 255))
    return outline(img)


def menu_icon():
    img = dragonball_icon(4)
    d = ImageDraw.Draw(img)
    d.rectangle((19, 19, 31, 31), fill=(40, 40, 60, 255))
    for i in range(3):
        d.rectangle((21, 21 + i * 3, 29, 22 + i * 3), fill=(240, 240, 255, 255))
    return img


def senzu_icon():
    img = canvas()
    d = ImageDraw.Draw(img)
    d.ellipse((7, 9, 25, 23), fill=(120, 190, 60, 255))
    d.ellipse((9, 10, 18, 16), fill=(180, 230, 110, 255))
    d.arc((7, 9, 25, 23), 200, 330, fill=(70, 120, 30, 255))
    d.line((16, 11, 16, 21), fill=(90, 150, 40, 255))
    return outline(img)


def scouter_icon():
    img = canvas()
    d = ImageDraw.Draw(img)
    d.rectangle((4, 12, 12, 22), fill=(220, 220, 225, 255))
    d.rectangle((12, 15, 22, 18), fill=(200, 200, 205, 255))
    d.polygon([(18, 8), (29, 9), (29, 20), (18, 18)], fill=(60, 230, 90, 210))
    d.line((19, 10, 27, 11), fill=(200, 255, 210, 255))
    return outline(img)


def radar_icon():
    img = canvas()
    d = ImageDraw.Draw(img)
    d.ellipse((3, 5, 29, 31), fill=(230, 230, 235, 255))
    d.ellipse((6, 8, 26, 28), fill=(30, 70, 50, 255))
    for r in (4, 8):
        d.ellipse((16 - r, 18 - r, 16 + r, 18 + r), outline=(70, 200, 120, 255))
    d.line((6, 18, 26, 18), fill=(70, 200, 120, 255))
    d.line((16, 8, 16, 28), fill=(70, 200, 120, 255))
    d.ellipse((19, 12, 22, 15), fill=(255, 200, 40, 255))
    d.rectangle((14, 2, 18, 6), fill=(200, 200, 205, 255))
    return outline(img)


def capsule_icon(col=(240, 240, 235), band=(230, 160, 40), num=None):
    img = canvas()
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((6, 11, 26, 21), radius=5, fill=col + (255,))
    d.rectangle((15, 11, 17, 21), fill=band + (255,))
    d.rectangle((23, 13, 26, 19), fill=(200, 60, 40, 255))
    d.line((8, 13, 13, 13), fill=(255, 255, 255, 255))
    if num is not None:
        d.rectangle((8, 15, 12, 18), fill=num + (255,))
    return outline(img)


def staff_icon(col=(200, 40, 40)):
    img = canvas()
    d = ImageDraw.Draw(img)
    d.line((5, 27, 27, 5), fill=col + (255,), width=3)
    d.line((5, 27, 8, 24), fill=(240, 200, 40, 255), width=4)
    d.line((24, 8, 27, 5), fill=(240, 200, 40, 255), width=4)
    return outline(img)


def sword_icon(blade=(225, 230, 240), guard=(230, 180, 40), grip=(60, 40, 100)):
    img = canvas()
    d = ImageDraw.Draw(img)
    d.polygon([(26, 3), (29, 3), (29, 6), (12, 23), (9, 20)], fill=blade + (255,))
    d.line((26, 4, 11, 19), fill=(255, 255, 255, 255))
    d.line((6, 18, 14, 26), fill=guard + (255,), width=3)
    d.line((4, 28, 10, 22), fill=grip + (255,), width=3)
    return outline(img)


def potara_icon():
    img = canvas()
    d = ImageDraw.Draw(img)
    for cx in (10, 22):
        d.ellipse((cx - 4, 5, cx + 4, 13), fill=(250, 210, 40, 255))
        d.ellipse((cx - 5, 15, cx + 5, 27), fill=(60, 200, 90, 255))
        d.ellipse((cx - 3, 17, cx, 21), fill=(170, 250, 180, 255))
        d.line((cx, 12, cx, 16), fill=(250, 210, 40, 255), width=2)
    return outline(img)


def meat_icon(cooked=False):
    img = canvas()
    d = ImageDraw.Draw(img)
    meat = (200, 60, 60) if not cooked else (150, 80, 40)
    d.line((5, 27, 12, 20), fill=(240, 235, 220, 255), width=4)
    d.ellipse((3, 25, 8, 30), fill=(240, 235, 220, 255))
    d.ellipse((10, 4, 29, 23), fill=meat + (255,))
    d.ellipse((13, 7, 22, 14), fill=mul(meat, 1.25) + (255,))
    return outline(img)


def gi_icon(top, under=None, kind="chest", trim=None, symbol=True):
    img = canvas()
    d = ImageDraw.Draw(img)
    if kind == "chest":
        d.polygon([(6, 5), (12, 3), (16, 7), (20, 3), (26, 5), (29, 13), (24, 14), (24, 29), (8, 29), (8, 14), (3, 13)],
                  fill=top + (255,))
        if under:
            d.polygon([(12, 3), (16, 12), (20, 3)], fill=under + (255,))
        if trim:
            d.rectangle((8, 24, 24, 26), fill=trim + (255,))
        if symbol:
            d.ellipse((17, 13, 22, 18), fill=(245, 245, 240, 255))
            d.point((19, 15), fill=(20, 20, 20, 255))
    elif kind == "legs":
        d.polygon([(7, 4), (25, 4), (27, 29), (18, 29), (16, 14), (14, 29), (5, 29)], fill=top + (255,))
        if trim:
            d.rectangle((7, 4, 25, 7), fill=trim + (255,))
    elif kind == "feet":
        for x0 in (4, 18):
            d.polygon([(x0, 8), (x0 + 7, 8), (x0 + 8, 22), (x0 + 11, 25), (x0 + 11, 29), (x0, 29)], fill=top + (255,))
            if trim:
                d.rectangle((x0, 8, x0 + 7, 10), fill=trim + (255,))
    elif kind == "armor":
        d.polygon([(4, 6), (12, 4), (20, 4), (28, 6), (27, 12), (24, 13), (24, 27), (8, 27), (8, 13), (5, 12)], fill=(240, 238, 230, 255))
        d.rectangle((4, 4, 10, 8), fill=(220, 180, 60, 255))
        d.rectangle((22, 4, 28, 8), fill=(220, 180, 60, 255))
        d.rectangle((8, 20, 24, 21), fill=(200, 200, 190, 255))
        d.rectangle((8, 24, 24, 27), fill=(220, 180, 60, 255))
    return outline(img)


def turban_icon():
    img = canvas()
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((5, 8, 27, 26), radius=6, fill=(245, 245, 245, 255))
    d.rectangle((5, 19, 27, 23), fill=(110, 40, 140, 255))
    return outline(img)


def cape_icon():
    img = canvas()
    d = ImageDraw.Draw(img)
    d.polygon([(8, 4), (24, 4), (29, 29), (3, 29)], fill=(245, 245, 245, 255))
    d.rectangle((5, 3, 11, 8), fill=(235, 235, 235, 255))
    d.rectangle((21, 3, 27, 8), fill=(235, 235, 235, 255))
    return outline(img)


def shell_icon():
    img = canvas()
    d = ImageDraw.Draw(img)
    d.ellipse((4, 4, 28, 28), fill=(60, 140, 70, 255))
    for (x, y) in ((11, 11), (21, 11), (16, 17), (11, 22), (21, 22)):
        d.regular_polygon((x, y, 4), 6, fill=(90, 170, 90, 255), outline=(40, 90, 40, 255))
    return outline(img)


def panties_icon():
    img = canvas()
    d = ImageDraw.Draw(img)
    d.polygon([(4, 8), (28, 8), (24, 18), (18, 25), (14, 25), (8, 18)], fill=(255, 210, 230, 255))
    d.polygon([(14, 8), (18, 8), (16, 12)], fill=(255, 100, 160, 255))
    return outline(img)


def hammer_icon():
    img = canvas()
    d = ImageDraw.Draw(img)
    d.line((8, 28, 20, 12), fill=(130, 90, 50, 255), width=3)
    d.polygon([(14, 4), (26, 4), (30, 12), (18, 16)], fill=(150, 150, 160, 255))
    return outline(img)


def tail_icon():
    img = canvas()
    d = ImageDraw.Draw(img)
    d.arc((4, 4, 28, 28), 30, 300, fill=(106, 62, 34, 255), width=5)
    return outline(img)


def cloud_icon():
    img = canvas()
    d = ImageDraw.Draw(img)
    for (x, y, r) in ((10, 18, 7), (18, 15, 8), (25, 19, 6), (15, 21, 6)):
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 216, 74, 255))
    d.ellipse((12, 10, 20, 15), fill=(255, 240, 160, 255))
    return outline(img)


def water_icon():
    img = canvas()
    d = ImageDraw.Draw(img)
    d.rectangle((12, 3, 20, 7), fill=(150, 100, 60, 255))
    d.polygon([(10, 8), (22, 8), (26, 16), (26, 29), (6, 29), (6, 16)], fill=(210, 230, 255, 200))
    d.rectangle((8, 18, 24, 27), fill=(120, 190, 255, 220))
    return outline(img)


def dummy_icon():
    img = canvas()
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((9, 6, 23, 28), radius=5, fill=(176, 138, 90, 255))
    d.rectangle((9, 12, 23, 13), fill=(106, 74, 42, 255))
    d.rectangle((9, 21, 23, 22), fill=(106, 74, 42, 255))
    d.line((16, 1, 16, 6), fill=(80, 80, 80, 255), width=2)
    return outline(img)


def weight_gi_icon():
    return gi_icon((70, 70, 90), (40, 40, 50), "chest", trim=(150, 150, 160), symbol=False)


# ---------------------------------------------------------------------- block textures (16x16 @2x = 32)
def block_tex(base, noise=0.08, seed=1, pattern=None):
    rng = random.Random(seed)
    img = Image.new("RGBA", (N, N))
    px = img.load()
    for y in range(N):
        for x in range(N):
            n = 1 + (rng.random() - 0.5) * 2 * noise
            px[x, y] = mul(base, n) + (255,)
    if pattern == "tile":
        d = ImageDraw.Draw(img)
        d.rectangle((0, 0, N - 1, N - 1), outline=mul(base, 0.85) + (255,))
        d.line((0, 15, N, 15), fill=mul(base, 0.88) + (255,))
        d.line((15, 0, 15, N), fill=mul(base, 0.88) + (255,))
    return img


def grass_side(top, dirt, seed=2):
    img = block_tex(dirt, 0.1, seed)
    px = img.load()
    rng = random.Random(seed)
    for x in range(N):
        h = 6 + rng.randint(0, 5)
        for y in range(h):
            px[x, y] = mul(top, 1 + (rng.random() - 0.5) * 0.15) + (255,)
    return img


def leaves_tex(col, seed=3):
    rng = random.Random(seed)
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    px = img.load()
    for y in range(N):
        for x in range(N):
            if rng.random() < 0.82:
                px[x, y] = mul(col, 0.75 + rng.random() * 0.45) + (255,)
    return img
