"""Tiny software renderer used to eyeball generated models (not part of the packs)."""
import math
from PIL import Image, ImageDraw
from model import SCALE


def rot_matrix(rx, ry, rz):
    # Bedrock: X and Y rotations are left-handed relative to a right-handed frame, Z is right-handed.
    ax, ay, az = math.radians(-rx), math.radians(-ry), math.radians(rz)
    cx, sx, cy, sy, cz, sz = math.cos(ax), math.sin(ax), math.cos(ay), math.sin(ay), math.cos(az), math.sin(az)
    Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
    Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
    Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]

    def mm(a, b):
        return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    return mm(Rz, mm(Ry, Rx))


def apply(m, p):
    return [sum(m[i][k] * p[k] for k in range(3)) for i in range(3)]


def transform_point(p, chain):
    """chain: list of (pivot, matrix) from innermost to outermost."""
    for piv, m in chain:
        q = [p[i] - piv[i] for i in range(3)]
        q = apply(m, q)
        p = [q[i] + piv[i] for i in range(3)]
    return p


def render(model, tex, yaw=30, pitch=10, size=360, anim=None):
    anim = anim or {}
    bones = {b.name: b for b in model.bones}
    quads = []
    for b in model.bones:
        chain = []
        cur = b
        while cur:
            r = list(cur.rotation or [0, 0, 0])
            if cur.name in anim:
                r = [r[i] + anim[cur.name][i] for i in range(3)]
            if any(r):
                chain.append((cur.pivot, rot_matrix(*r)))
            cur = bones.get(cur.parent) if cur.parent else None
        for c in b.cubes:
            uvx, uvy = c.shared_uv if c.shared_uv is not None else c.uv
            w, h, d = c.size
            rw, rh, rd = c.real_size
            ox, oy, oz = c.origin
            inf = c.inflate
            x0, y0, z0 = ox - inf, oy - inf, oz - inf
            x1, y1, z1 = ox + rw + inf, oy + rh + inf, oz + rd + inf
            cm = [(c.pivot or c.origin, rot_matrix(*c.rotation))] if c.rotation else []
            # face: (corner origin, u-axis vector, v-axis vector, uv rect)
            faces = [
                ((x0, y1, z0), (x1 - x0, 0, 0), (0, -(y1 - y0), 0), (uvx + d, uvy + d, w, h)),            # north
                ((x1, y1, z1), (-(x1 - x0), 0, 0), (0, -(y1 - y0), 0), (uvx + 2 * d + w, uvy + d, w, h)),  # south
                ((x0, y1, z1), (0, 0, -(z1 - z0)), (0, -(y1 - y0), 0), (uvx, uvy + d, d, h)),              # -x side
                ((x1, y1, z0), (0, 0, z1 - z0), (0, -(y1 - y0), 0), (uvx + d + w, uvy + d, d, h)),         # +x side
                ((x0, y1, z1), (x1 - x0, 0, 0), (0, 0, -(z1 - z0)), (uvx + d, uvy, w, d)),                # up
                ((x0, y0, z0), (x1 - x0, 0, 0), (0, 0, z1 - z0), (uvx + d + w, uvy, w, d)),               # down
            ]
            for corner, ua, va, (fu, fv, fw, fh) in faces:
                if fw <= 0 or fh <= 0:
                    continue
                nu, nv = fw * SCALE, fh * SCALE
                for j in range(nv):
                    for i in range(nu):
                        col = tex.getpixel((int(fu * SCALE + i), int(fv * SCALE + j)))
                        if col[3] < 20:
                            continue
                        pts = []
                        for (a, bb) in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)):
                            p = [corner[k] + ua[k] * a / nu + va[k] * bb / nv for k in range(3)]
                            for piv, mtx in cm:
                                q = apply(mtx, [p[k] - piv[k] for k in range(3)])
                                p = [q[k] + piv[k] for k in range(3)]
                            p = transform_point(p, chain)
                            pts.append(p)
                        quads.append((pts, col))
    # camera: looking from the front (-z) toward +z, rotated by yaw/pitch
    cy_, sy_ = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    cp, sp = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))

    def cam(p):
        x, y, z = p
        x, z = x * cy_ - z * sy_, x * sy_ + z * cy_
        y, z = y * cp - z * sp, y * sp + z * cp
        return x, y, z
    allp = [cam(p) for q, _ in quads for p in q]
    if not allp:
        return Image.new("RGB", (size, size), (40, 40, 50))
    minx = min(p[0] for p in allp); maxx = max(p[0] for p in allp)
    miny = min(p[1] for p in allp); maxy = max(p[1] for p in allp)
    sc = (size * 0.9) / max(maxx - minx, maxy - miny, 1)
    img = Image.new("RGB", (size, size), (60, 64, 80))
    dr = ImageDraw.Draw(img)
    proj = []
    for q, col in quads:
        cq = [cam(p) for p in q]
        depth = sum(p[2] for p in cq) / 4
        pts = [((p[0] - (minx + maxx) / 2) * sc + size / 2, size / 2 - (p[1] - (miny + maxy) / 2) * sc) for p in cq]
        proj.append((depth, pts, col))
    proj.sort(key=lambda t: -t[0])
    for _, pts, col in proj:
        dr.polygon(pts, fill=col[:3])
    return img


def sheet(items, cols=4, size=300):
    rows = (len(items) + cols - 1) // cols
    out = Image.new("RGB", (cols * size, rows * size), (30, 30, 40))
    for i, im in enumerate(items):
        out.paste(im.resize((size, size)), ((i % cols) * size, (i // cols) * size))
    return out
