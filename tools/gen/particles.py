"""Particle atlas + particle effect definitions. Colours are passed from scripts via variable.color."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

ATLAS = 128  # pixels, painted at 2x into 256
TEX = "textures/particle/dbz_particles"

# sprite rects in atlas units (x, y, w, h)
SPRITES = {
    "glow": (0, 0, 32, 32),
    "spark": (32, 0, 16, 16),
    "smoke": (48, 0, 32, 32),
    "ring": (80, 0, 48, 48),
    "star": (0, 32, 32, 32),
    "silhouette": (32, 16, 16, 32),
    "streak": (48, 32, 32, 8),
    "bolt": (96, 48, 16, 32),
    "rock": (112, 48, 8, 8),
    "plus": (80, 48, 16, 16),
    "line": (48, 40, 8, 24),
}


def atlas():
    S = 2
    img = Image.new("RGBA", (ATLAS * S, ATLAS * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def rect(name):
        x, y, w, h = SPRITES[name]
        return x * S, y * S, w * S, h * S

    # glow: radial white
    x, y, w, h = rect("glow")
    for r in range(w // 2, 0, -1):
        a = int(255 * (1 - r / (w / 2)) ** 1.6)
        d.ellipse((x + w / 2 - r, y + h / 2 - r, x + w / 2 + r, y + h / 2 + r), fill=(255, 255, 255, a))
    # spark: small bright core
    x, y, w, h = rect("spark")
    for r in range(w // 2, 0, -1):
        a = int(255 * (1 - r / (w / 2)) ** 0.8)
        d.ellipse((x + w / 2 - r, y + h / 2 - r, x + w / 2 + r, y + h / 2 + r), fill=(255, 255, 255, a))
    # smoke puff
    x, y, w, h = rect("smoke")
    rng = random.Random(5)
    sm = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sm)
    for _ in range(14):
        cx, cy, r = rng.uniform(0.3, 0.7) * w, rng.uniform(0.3, 0.7) * h, rng.uniform(0.15, 0.3) * w
        g = rng.randint(200, 255)
        sd.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(g, g, g, 110))
    sm = sm.filter(ImageFilter.GaussianBlur(3))
    img.paste(sm, (x, y), sm)
    # ring
    x, y, w, h = rect("ring")
    for r in range(w // 2, 0, -1):
        k = r / (w / 2)
        a = int(255 * max(0, 1 - abs(k - 0.85) / 0.15))
        if a:
            d.ellipse((x + w / 2 - r, y + h / 2 - r, x + w / 2 + r, y + h / 2 + r), outline=(255, 255, 255, a), width=1)
    # star (impact)
    x, y, w, h = rect("star")
    pts = []
    for i in range(16):
        ang = i * math.pi / 8
        rr = (w / 2) * (1.0 if i % 2 == 0 else 0.35)
        pts.append((x + w / 2 + rr * math.cos(ang), y + h / 2 + rr * math.sin(ang)))
    d.polygon(pts, fill=(255, 255, 255, 255))
    # silhouette (humanoid)
    x, y, w, h = rect("silhouette")
    u = w / 16
    for (a, b, c, e) in ((5, 0, 11, 7), (4, 7, 12, 19), (1, 7, 4, 19), (12, 7, 15, 19), (4, 19, 8, 32), (8, 19, 12, 32)):
        d.rectangle((x + a * u, y + b * u, x + c * u - 1, y + e * u - 1), fill=(255, 255, 255, 200))
    # streak
    x, y, w, h = rect("streak")
    for i in range(w):
        a = int(255 * (i / w) ** 1.5)
        d.line((x + i, y + h / 2 - 2, x + i, y + h / 2 + 2), fill=(255, 255, 255, a))
    # bolt
    x, y, w, h = rect("bolt")
    pts = [(x + w * 0.6, y), (x + w * 0.2, y + h * 0.45), (x + w * 0.5, y + h * 0.45), (x + w * 0.3, y + h),
           (x + w * 0.85, y + h * 0.38), (x + w * 0.55, y + h * 0.38), (x + w * 0.85, y)]
    d.polygon(pts, fill=(255, 255, 255, 255))
    # rock
    x, y, w, h = rect("rock")
    d.polygon([(x + 2, y + 4), (x + 6, y + 1), (x + 14, y + 3), (x + 15, y + 11), (x + 9, y + 15), (x + 2, y + 12)],
              fill=(120, 105, 90, 255))
    # plus sparkle
    x, y, w, h = rect("plus")
    d.rectangle((x + w / 2 - 1, y, x + w / 2 + 1, y + h), fill=(255, 255, 255, 255))
    d.rectangle((x, y + h / 2 - 1, x + w, y + h / 2 + 1), fill=(255, 255, 255, 255))
    # line (speed line)
    x, y, w, h = rect("line")
    for j in range(h):
        a = int(255 * math.sin(math.pi * j / h))
        d.line((x + w / 2 - 1, y + j, x + w / 2 + 1, y + j), fill=(255, 255, 255, a))
    return img


def uv(name):
    x, y, w, h = SPRITES[name]
    return {"texture_width": ATLAS, "texture_height": ATLAS, "uv": [x, y], "uv_size": [w, h]}


COLOR = ["variable.color.r", "variable.color.g", "variable.color.b", 1.0]


def tint(alpha_curve=None, fade=True):
    if not fade:
        return {"color": COLOR}
    return {"color": {"interpolant": "variable.particle_age / variable.particle_lifetime",
                      "gradient": {"0.0": COLOR, "0.7": COLOR,
                                   "1.0": ["variable.color.r", "variable.color.g", "variable.color.b", 0.0]}}}


def effect(ident, material, components):
    return {"format_version": "1.10.0", "particle_effect": {
        "description": {"identifier": ident, "basic_render_parameters": {"material": material, "texture": TEX}},
        "components": components}}


def defs():
    add = "particles_add"
    blend = "particles_blend"
    E = {}
    E["dbz:ki_spark"] = effect("dbz:ki_spark", add, {
        "minecraft:emitter_rate_instant": {"num_particles": 6},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 0.7, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.35 + variable.particle_random_1 * 0.3"},
        "minecraft:particle_initial_speed": 1.5,
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 3, 0], "linear_drag_coefficient": 2},
        "minecraft:particle_appearance_billboard": {"size": ["0.12 * (1 - variable.particle_age / variable.particle_lifetime)", "0.12 * (1 - variable.particle_age / variable.particle_lifetime)"],
                                                    "facing_camera_mode": "rotate_xyz", "uv": uv("spark")},
        "minecraft:particle_appearance_tinting": tint(),
    })
    E["dbz:aura_rise"] = effect("dbz:aura_rise", add, {
        "minecraft:emitter_rate_instant": {"num_particles": 8},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_disc": {"radius": 0.6, "plane_normal": "y", "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.5 + variable.particle_random_1 * 0.4"},
        "minecraft:particle_initial_speed": "2 + variable.particle_random_2 * 2",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 2, 0], "linear_drag_coefficient": 1},
        "minecraft:particle_appearance_billboard": {"size": ["0.25 * (1 - variable.particle_age / variable.particle_lifetime)", "0.5 * (1 - variable.particle_age / variable.particle_lifetime)"],
                                                    "facing_camera_mode": "lookat_y", "uv": uv("glow")},
        "minecraft:particle_appearance_tinting": tint(),
    })
    E["dbz:dust_rise"] = effect("dbz:dust_rise", blend, {
        "minecraft:emitter_rate_instant": {"num_particles": 5},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_disc": {"radius": 2.5, "plane_normal": "y", "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "1.0 + variable.particle_random_1"},
        "minecraft:particle_initial_speed": "1.5 + variable.particle_random_2 * 2.5",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -2, 0], "linear_drag_coefficient": 0.5},
        "minecraft:particle_motion_collision": {"collision_radius": 0.1, "coefficient_of_restitution": 0.3},
        "minecraft:particle_appearance_billboard": {"size": [0.12, 0.12], "facing_camera_mode": "rotate_xyz", "uv": uv("rock")},
        "minecraft:particle_appearance_lighting": {},
    })
    E["dbz:charge_orb"] = effect("dbz:charge_orb", add, {
        "minecraft:emitter_rate_instant": {"num_particles": 10},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 1.4, "surface_only": True, "direction": "inwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.3},
        "minecraft:particle_initial_speed": 4.5,
        "minecraft:particle_appearance_billboard": {"size": [0.1, 0.1], "facing_camera_mode": "rotate_xyz", "uv": uv("spark")},
        "minecraft:particle_appearance_tinting": tint(),
    })
    E["dbz:glow_burst"] = effect("dbz:glow_burst", add, {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.35},
        "minecraft:particle_appearance_billboard": {"size": ["variable.size * (0.3 + variable.particle_age / variable.particle_lifetime)", "variable.size * (0.3 + variable.particle_age / variable.particle_lifetime)"],
                                                    "facing_camera_mode": "rotate_xyz", "uv": uv("glow")},
        "minecraft:particle_appearance_tinting": tint(),
    })
    E["dbz:explosion_core"] = effect("dbz:explosion_core", add, {
        "minecraft:emitter_rate_instant": {"num_particles": 3},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": "variable.size * 0.2", "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.6 + variable.particle_random_1 * 0.4"},
        "minecraft:particle_initial_speed": 0.5,
        "minecraft:particle_appearance_billboard": {"size": ["variable.size * (0.4 + 1.2 * math.sqrt(variable.particle_age / variable.particle_lifetime))", "variable.size * (0.4 + 1.2 * math.sqrt(variable.particle_age / variable.particle_lifetime))"],
                                                    "facing_camera_mode": "rotate_xyz", "uv": uv("glow")},
        "minecraft:particle_appearance_tinting": tint(),
    })
    E["dbz:explosion_smoke"] = effect("dbz:explosion_smoke", blend, {
        "minecraft:emitter_rate_instant": {"num_particles": "6 + variable.size * 2"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": "variable.size * 0.5", "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "1.6 + variable.particle_random_1 * 1.2"},
        "minecraft:particle_initial_speed": "variable.size * 0.8",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.8, 0], "linear_drag_coefficient": 1.6},
        "minecraft:particle_appearance_billboard": {"size": ["variable.size * 0.35 * (1 + variable.particle_age)", "variable.size * 0.35 * (1 + variable.particle_age)"],
                                                    "facing_camera_mode": "rotate_xyz", "uv": uv("smoke")},
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": "variable.particle_age / variable.particle_lifetime",
                                                            "gradient": {"0.0": [0.55, 0.5, 0.45, 0.9], "1.0": [0.35, 0.33, 0.32, 0.0]}}},
        "minecraft:particle_appearance_lighting": {},
    })
    E["dbz:shockwave"] = effect("dbz:shockwave", add, {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.45},
        "minecraft:particle_appearance_billboard": {"size": ["variable.size * 2.2 * math.sqrt(variable.particle_age / variable.particle_lifetime)", "variable.size * 2.2 * math.sqrt(variable.particle_age / variable.particle_lifetime)"],
                                                    "facing_camera_mode": "emitter_transform_xz", "uv": uv("ring")},
        "minecraft:particle_appearance_tinting": tint(),
    })
    E["dbz:impact"] = effect("dbz:impact", add, {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.18},
        "minecraft:particle_initial_spin": {"rotation": "variable.particle_random_1 * 360"},
        "minecraft:particle_appearance_billboard": {"size": ["variable.size * (0.5 + variable.particle_age / variable.particle_lifetime)", "variable.size * (0.5 + variable.particle_age / variable.particle_lifetime)"],
                                                    "facing_camera_mode": "rotate_xyz", "uv": uv("star")},
        "minecraft:particle_appearance_tinting": tint(),
    })
    E["dbz:afterimage"] = effect("dbz:afterimage", add, {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": [0, 0.95, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.5},
        "minecraft:particle_appearance_billboard": {"size": [0.55, 1.0], "facing_camera_mode": "lookat_y", "uv": uv("silhouette")},
        "minecraft:particle_appearance_tinting": tint(),
    })
    E["dbz:trail"] = effect("dbz:trail", add, {
        "minecraft:emitter_rate_instant": {"num_particles": 2},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": "variable.size * 0.2"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.4},
        "minecraft:particle_appearance_billboard": {"size": ["variable.size * 0.5 * (1 - variable.particle_age / variable.particle_lifetime)", "variable.size * 0.5 * (1 - variable.particle_age / variable.particle_lifetime)"],
                                                    "facing_camera_mode": "rotate_xyz", "uv": uv("glow")},
        "minecraft:particle_appearance_tinting": tint(),
    })
    E["dbz:lightning"] = effect("dbz:lightning", add, {
        "minecraft:emitter_rate_instant": {"num_particles": 2},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_box": {"half_dimensions": [0.5, 0.9, 0.5], "offset": [0, 1.0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.12},
        "minecraft:particle_initial_spin": {"rotation": "variable.particle_random_2 * 360"},
        "minecraft:particle_appearance_billboard": {"size": [0.25, 0.5], "facing_camera_mode": "rotate_xyz", "uv": uv("bolt")},
        "minecraft:particle_appearance_tinting": {"color": [0.7, 0.9, 1.0, 1.0]},
    })
    E["dbz:sparkle"] = effect("dbz:sparkle", add, {
        "minecraft:emitter_rate_instant": {"num_particles": 3},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 0.6},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.6},
        "minecraft:particle_initial_speed": 0.2,
        "minecraft:particle_appearance_billboard": {"size": ["0.15 * math.sin(180 * variable.particle_age / variable.particle_lifetime)", "0.15 * math.sin(180 * variable.particle_age / variable.particle_lifetime)"],
                                                    "facing_camera_mode": "rotate_xyz", "uv": uv("plus")},
        "minecraft:particle_appearance_tinting": tint(fade=False),
    })
    E["dbz:speed_lines"] = effect("dbz:speed_lines", add, {
        "minecraft:emitter_rate_instant": {"num_particles": 8},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 1.2, "direction": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.25},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_appearance_billboard": {"size": [0.04, 0.6], "facing_camera_mode": "lookat_direction",
                                                    "direction": {"mode": "custom", "custom_direction": ["variable.dir.x", "variable.dir.y", "variable.dir.z"]},
                                                    "uv": uv("line")},
        "minecraft:particle_appearance_tinting": tint(),
    })
    E["dbz:gather"] = effect("dbz:gather", add, {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"direction": ["variable.dir.x", "variable.dir.y", "variable.dir.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 1.0},
        "minecraft:particle_initial_speed": "variable.speed",
        "minecraft:particle_appearance_billboard": {"size": [0.2, 0.2], "facing_camera_mode": "rotate_xyz", "uv": uv("glow")},
        "minecraft:particle_appearance_tinting": tint(),
    })
    E["dbz:pop_smoke"] = effect("dbz:pop_smoke", blend, {
        "minecraft:emitter_rate_instant": {"num_particles": 18},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 1.0, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.8 + variable.particle_random_1 * 0.6"},
        "minecraft:particle_initial_speed": 3,
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 3, "linear_acceleration": [0, 0.5, 0]},
        "minecraft:particle_appearance_billboard": {"size": ["0.8 + variable.particle_age", "0.8 + variable.particle_age"], "facing_camera_mode": "rotate_xyz", "uv": uv("smoke")},
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": "variable.particle_age / variable.particle_lifetime",
                                                            "gradient": {"0.0": [1, 1, 1, 0.9], "1.0": [0.9, 0.9, 0.9, 0.0]}}},
    })
    E["dbz:pillar"] = effect("dbz:pillar", add, {
        "minecraft:emitter_rate_instant": {"num_particles": 12},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_disc": {"radius": 0.4, "plane_normal": "y", "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.8},
        "minecraft:particle_initial_speed": "8 + variable.particle_random_1 * 10",
        "minecraft:particle_appearance_billboard": {"size": [0.35, 1.6], "facing_camera_mode": "lookat_y", "uv": uv("glow")},
        "minecraft:particle_appearance_tinting": tint(),
    })
    return E
