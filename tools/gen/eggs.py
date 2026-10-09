"""Spawn-egg icons: the character's own head, rendered from its model, set on an egg tinted with its colours."""
import math
from collections import Counter
from PIL import Image, ImageDraw
import preview as PV
from model import mul, mix

N = 32


def _bone_render(model, tex, names, yaw, pitch, size, children=True):
    """Render only the given bones (and, optionally, their children) to an RGBA image, tightly cropped."""
    keep = set(names)
    changed = children
    while changed:
        changed = False
        for b in model.bones:
            if b.parent in keep and b.name not in keep:
                keep.add(b.name)
                changed = True
    saved = [(b, b.cubes) for b in model.bones]
    for b in model.bones:
        if b.name not in keep:
            b.cubes = []
    try:
        img = PV.render(model, tex, yaw=yaw, pitch=pitch, size=size, bg=None)
    finally:
        for b, cubes in saved:
            b.cubes = cubes
    box = img.getbbox()
    return img.crop(box) if box else img


def _dominant(img, skip=()):
    cnt = Counter()
    for r, g, b, a in img.getdata():
        if a < 200:
            continue
        q = (r // 24 * 24 + 12, g // 24 * 24 + 12, b // 24 * 24 + 12)
        if any(sum(abs(q[i] - s[i]) for i in range(3)) < 60 for s in skip):
            continue
        cnt[q] += 1
    return cnt.most_common(1)[0][0] if cnt else (200, 200, 200)


def _egg_mask(cx, cy, rx, ry):
    """Egg outline: narrower on top."""
    m = Image.new("L", (N, N), 0)
    px = m.load()
    for y in range(N):
        for x in range(N):
            dy = (y + 0.5 - cy) / ry
            k = 1.0 - 0.18 * max(-dy, 0)  # taper toward the top
            dx = (x + 0.5 - cx) / (rx * k)
            if dx * dx + dy * dy <= 1.0:
                px[x, y] = 255
    return m


def egg_icon(model, tex, head_bone="dbz_head", body_bone="body"):
    head = _bone_render(model, tex, [head_bone], yaw=22, pitch=8, size=256)
    body = _bone_render(model, tex, [body_bone], yaw=0, pitch=0, size=128, children=False)
    legs = _bone_render(model, tex, ["rightLeg", "leftLeg"], yaw=0, pitch=0, size=128, children=False)
    shell = _dominant(body)
    spot = _dominant(legs, skip=[shell])
    if spot == (200, 200, 200):
        spot = _dominant(head, skip=[shell])

    out = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    mask = _egg_mask(16, 17.5, 11.5, 13.5)
    shade = Image.new("RGBA", (N, N))
    sp = shade.load()
    for y in range(N):
        for x in range(N):
            t = (x - 8) / 24 + (y - 6) / 30
            sp[x, y] = mul(shell, 1.18 - 0.45 * max(0.0, min(1.0, t))) + (255,)
    d = ImageDraw.Draw(shade)
    for (sx, sy, r) in ((9, 9, 2.2), (22, 12, 1.8), (10, 25, 2.0), (23, 26, 2.4), (16, 6, 1.4)):
        d.ellipse((sx - r, sy - r, sx + r, sy + r), fill=mul(spot, 0.95) + (255,))
    d.ellipse((9, 6, 13, 11), fill=mix(shell, (255, 255, 255), 0.6) + (255,))
    out.paste(shade, (0, 0), mask)

    # head portrait, scaled to fit, centred slightly low
    hw, hh = head.size
    s = min(15 / hw, 16 / hh)
    w, h = max(1, round(hw * s)), max(1, round(hh * s))
    small = head.resize((w, h), Image.LANCZOS)
    a = small.split()[3].point(lambda v: 255 if v > 110 else 0)
    small.putalpha(a)
    out.alpha_composite(small, ((N - w) // 2, 29 - h))

    # 1px dark outline around everything
    px = out.load()
    res = out.copy()
    pr = res.load()
    for y in range(N):
        for x in range(N):
            if px[x, y][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < N and 0 <= yy < N and px[xx, yy][3] > 0:
                        pr[x, y] = (24, 18, 28, 255)
                        break
    return res
