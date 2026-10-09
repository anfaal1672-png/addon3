"""Icons for the mob battle tools: wands with a coloured head, and team flags."""
from PIL import ImageDraw
from icons import canvas, outline, shaded_circle
from model import mul, mix

HANDLE = (120, 82, 48)
TEAM_COLORS = {"red": (220, 50, 50), "blue": (50, 100, 230), "green": (60, 180, 70), "yellow": (240, 200, 40)}


def _handle(d, x0=6, y0=26, x1=18, y1=14):
    """A diagonal wooden handle from bottom-left toward the head."""
    for i in range(13):
        t = i / 12
        x = round(x0 + (x1 - x0) * t)
        y = round(y0 + (y1 - y0) * t)
        d.rectangle((x, y, x + 1, y + 1), fill=mul(HANDLE, 1.1 - 0.3 * t) + (255,))


def wand_icon(kind):
    img = canvas()
    d = ImageDraw.Draw(img)
    _handle(d)
    if kind == "duel":  # two crossed blades
        for (a, b, col) in (((14, 6), (26, 18), (230, 70, 70)), ((26, 6), (14, 18), (80, 130, 240))):
            d.line((a, b), fill=col + (255,), width=2)
        d.rectangle((19, 11, 21, 13), fill=(250, 230, 120, 255))
    elif kind == "group":  # three heads
        for (cx, cy, col) in ((17, 9, (240, 120, 60)), (24, 8, (240, 200, 60)), (21, 15, (230, 80, 80))):
            shaded_circle(d, cx, cy, 3.4, col)
    elif kind == "heal":
        shaded_circle(d, 21, 11, 7, (90, 210, 110))
        d.rectangle((19.5, 6.5, 22.5, 15.5), fill=(255, 255, 255, 255))
        d.rectangle((16.5, 9.5, 25.5, 12.5), fill=(255, 255, 255, 255))
    elif kind == "kill":
        shaded_circle(d, 21, 11, 7, (60, 40, 60))
        d.line((17, 7, 25, 15), fill=(240, 60, 60, 255), width=2)
        d.line((25, 7, 17, 15), fill=(240, 60, 60, 255), width=2)
    elif kind == "buff":
        shaded_circle(d, 21, 11, 7, (240, 140, 40))
        d.polygon(((21, 5), (26, 11), (23, 11), (23, 16), (19, 16), (19, 11), (16, 11)), fill=(255, 245, 200, 255))
    return outline(img)


def flag_icon(team):
    col = TEAM_COLORS[team]
    img = canvas()
    d = ImageDraw.Draw(img)
    d.rectangle((7, 4, 8, 28), fill=HANDLE + (255,))
    d.rectangle((6, 3, 9, 4), fill=(220, 200, 120, 255))
    for y in range(6, 20):
        wave = 1 if (y // 3) % 2 else 0
        d.line((9, y, 25 + wave, y), fill=mul(col, 1.15 - 0.25 * (y - 6) / 14) + (255,))
    d.polygon(((9, 20), (25, 20), (17, 24)), fill=mul(col, 0.8) + (255,))
    d.rectangle((14, 10, 19, 14), fill=mix(col, (255, 255, 255), 0.7) + (255,))
    return outline(img)


def battle_menu_icon():
    img = canvas()
    d = ImageDraw.Draw(img)
    shaded_circle(d, 16, 16, 12, (70, 70, 90), hl=False)
    d.line((9, 9, 23, 23), fill=(230, 230, 240, 255), width=3)
    d.line((23, 9, 9, 23), fill=(230, 230, 240, 255), width=3)
    d.rectangle((7, 21, 11, 25), fill=(230, 70, 70, 255))
    d.rectangle((21, 21, 25, 25), fill=(80, 130, 240, 255))
    return outline(img)
