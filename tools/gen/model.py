"""Geometry builder with automatic box-UV allocation and per-face painting.

Coordinates follow Bedrock geometry conventions:
  * front of a model is the -Z (north) face, which is the region at (u+d, v+d) of a box UV;
  * the character's right side is -X (rightArm lives at negative X);
  * on a front texture, the left half is the character's right side (as seen by a viewer);
  * a positive X rotation tilts the +Y axis toward the front (-Z).
Textures are painted at `SCALE` pixels per UV unit so faces get twice the usual detail.
"""
import math
import random
from PIL import Image

SCALE = 2


def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(round(v))))


def mul(c, f):
    return (clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f)) + tuple(c[3:4])


def mix(a, b, t):
    return tuple(clamp(a[i] * (1 - t) + b[i] * t) for i in range(3))


def rgb(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


FACE_SHADE = {"up": 1.12, "down": 0.68, "north": 1.0, "south": 0.84, "east": 0.92, "west": 0.92}


class Face:
    """A paintable face: w,h in pixels (already scaled)."""

    def __init__(self, name, w, h, rng):
        self.name = name
        self.w = w
        self.h = h
        self.img = Image.new("RGBA", (max(w, 1), max(h, 1)), (0, 0, 0, 0))
        self.px = self.img.load()
        self.rng = rng

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            if len(c) == 3:
                c = c + (255,)
            self.px[x, y] = c

    def get(self, x, y):
        return self.px[x, y]

    def fill(self, c, noise=0.05, shade=True, grad=0.0):
        f = FACE_SHADE[self.name] if shade else 1.0
        for y in range(self.h):
            g = 1.0 + grad * (0.5 - y / max(1, self.h - 1))
            for x in range(self.w):
                n = 1.0 + (self.rng.random() - 0.5) * 2 * noise
                self.set(x, y, mul(c, f * n * g))

    def rect(self, x0, y0, x1, y1, c, noise=0.04, shade=True):
        """Fill [x0,x1) x [y0,y1) in pixel coords (clipped)."""
        f = FACE_SHADE[self.name] if shade else 1.0
        for y in range(max(0, y0), min(self.h, y1)):
            for x in range(max(0, x0), min(self.w, x1)):
                n = 1.0 + (self.rng.random() - 0.5) * 2 * noise
                self.set(x, y, mul(c, f * n))

    def rows(self, y0, y1, c, noise=0.04):
        self.rect(0, y0, self.w, y1, c, noise)

    def outline(self, factor=0.75):
        for x in range(self.w):
            for y in (0, self.h - 1):
                p = self.px[x, y]
                if p[3]:
                    self.px[x, y] = mul(p[:3], factor) + (p[3],)
        for y in range(self.h):
            for x in (0, self.w - 1):
                p = self.px[x, y]
                if p[3]:
                    self.px[x, y] = mul(p[:3], factor) + (p[3],)

    def circle(self, cx, cy, r, c, shade=True):
        f = FACE_SHADE[self.name] if shade else 1.0
        for y in range(self.h):
            for x in range(self.w):
                if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                    self.set(x, y, mul(c, f))


class Cube:
    def __init__(self, origin, size, painter, rotation=None, pivot=None, inflate=0.0, mirror=False):
        self.origin = list(origin)
        self.size = [int(math.ceil(s)) if s > 0 else 0 for s in size]
        self.real_size = list(size)
        self.painter = painter
        self.rotation = rotation
        self.pivot = pivot
        self.inflate = inflate
        self.mirror = mirror
        self.uv = None
        self.shared_uv = None


class Bone:
    def __init__(self, name, parent=None, pivot=(0, 0, 0), rotation=None):
        self.name = name
        self.parent = parent
        self.pivot = list(pivot)
        self.rotation = rotation
        self.cubes = []


class Model:
    def __init__(self, identifier, tex_w=128, tex_h=128, bounds=(2, 3, (0, 1.5, 0)), seed=None):
        self.identifier = identifier
        self.tex_w = tex_w
        self.tex_h = tex_h
        self.bounds = bounds
        self.bones = []
        self.bone_map = {}
        self.rng = random.Random(seed if seed is not None else identifier)

    def bone(self, name, parent=None, pivot=(0, 0, 0), rotation=None):
        if name in self.bone_map:
            return self.bone_map[name]
        b = Bone(name, parent, pivot, rotation)
        self.bones.append(b)
        self.bone_map[name] = b
        return b

    def cube(self, bone, origin, size, painter, **kw):
        c = Cube(origin, size, painter, **kw)
        self.bone_map[bone].cubes.append(c)
        return c

    # ---------------------------------------------------------------- uv packing
    def _pack(self):
        cubes = [c for b in self.bones for c in b.cubes if c.shared_uv is None]
        cubes.sort(key=lambda c: -(c.size[2] + c.size[1]))
        while cubes and max(2 * (c.size[0] + c.size[2]) for c in cubes) > self.tex_w:
            self.tex_w *= 2
        x = y = 0
        shelf_h = 0
        for c in cubes:
            w = 2 * (c.size[0] + c.size[2])
            h = c.size[2] + c.size[1]
            w = max(w, 1)
            h = max(h, 1)
            if x + w > self.tex_w:
                x = 0
                y += shelf_h
                shelf_h = 0
            if y + h > self.tex_h:
                # grow the texture vertically
                self.tex_h *= 2
            c.uv = [x, y]
            x += w
            shelf_h = max(shelf_h, h)
        while y + shelf_h > self.tex_h:
            self.tex_h *= 2

    def render_texture(self):
        self._pack()
        img = Image.new("RGBA", (self.tex_w * SCALE, self.tex_h * SCALE), (0, 0, 0, 0))
        for b in self.bones:
            for c in b.cubes:
                if c.shared_uv is not None:
                    continue
                w, h, d = c.size
                u, v = c.uv
                regions = {
                    "up": (u + d, v, w, d),
                    "down": (u + d + w, v, w, d),
                    "east": (u, v + d, d, h),
                    "north": (u + d, v + d, w, h),
                    "west": (u + d + w, v + d, d, h),
                    "south": (u + 2 * d + w, v + d, w, h),
                }
                for name, (fx, fy, fw, fh) in regions.items():
                    if fw <= 0 or fh <= 0:
                        continue
                    face = Face(name, fw * SCALE, fh * SCALE, self.rng)
                    c.painter(face)
                    img.paste(face.img, (fx * SCALE, fy * SCALE))
        return img

    # ---------------------------------------------------------------- json
    def to_json(self):
        bones = []
        for b in self.bones:
            jb = {"name": b.name, "pivot": b.pivot}
            if b.parent:
                jb["parent"] = b.parent
            if b.rotation:
                jb["rotation"] = b.rotation
            cubes = []
            for c in b.cubes:
                jc = {"origin": [round(o, 3) for o in c.origin],
                      "size": [round(s, 3) for s in c.real_size],
                      "uv": c.shared_uv if c.shared_uv is not None else c.uv}
                if c.inflate:
                    jc["inflate"] = c.inflate
                if c.rotation:
                    jc["rotation"] = c.rotation
                    jc["pivot"] = c.pivot if c.pivot else c.origin
                if c.mirror:
                    jc["mirror"] = True
                cubes.append(jc)
            if cubes:
                jb["cubes"] = cubes
            bones.append(jb)
        bw, bh, off = self.bounds
        return {
            "description": {
                "identifier": self.identifier,
                "texture_width": self.tex_w,
                "texture_height": self.tex_h,
                "visible_bounds_width": bw,
                "visible_bounds_height": bh,
                "visible_bounds_offset": list(off),
            },
            "bones": bones,
        }


def geo_file(models):
    return {"format_version": "1.12.0", "minecraft:geometry": [m.to_json() if isinstance(m, Model) else m for m in models]}


# -------------------------------------------------------------------- painters

def solid(color, noise=0.05, grad=0.0, outline=0.0):
    def p(f):
        f.fill(color, noise=noise, grad=grad)
        if outline:
            f.outline(outline)
    return p


def bands(layers, noise=0.04, sides_only=False, outline=0.0):
    """layers: list of (fraction_from_top_start, fraction_end, color) for side faces.
    Top face uses the first layer color, bottom the last."""
    def p(f):
        if f.name == "up":
            f.fill(layers[0][2], noise)
            return
        if f.name == "down":
            f.fill(layers[-1][2], noise)
            return
        for a, b, c in layers:
            f.rect(0, int(round(a * f.h)), f.w, int(round(b * f.h)), c, noise)
        if outline:
            f.outline(outline)
    return p


def spiky(color, noise=0.06):
    """Hair painter with strands (darker vertical lines) and a lighter tip."""
    def p(f):
        f.fill(color, noise=noise, grad=0.35)
        for x in range(0, f.w, 3):
            for y in range(f.h):
                if f.rng.random() < 0.55:
                    q = f.get(x, y)
                    f.set(x, y, mul(q[:3], 0.82))
        f.outline(0.7)
    return p
