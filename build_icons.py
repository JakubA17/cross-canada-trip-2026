"""Generate all PWA icon assets — no external image APIs, pure PIL.
Minimal mark: gradient sky (indigo -> gold, echoing the sun/golden-hour
theme), a sun on the horizon, two mountain silhouettes, a road.
"""
from PIL import Image, ImageDraw
import math

OUT = "icons"

TOP = (24, 40, 74)      # deep indigo (night/mountain)
BOTTOM = (255, 173, 74)  # golden hour orange
SUN = (255, 224, 158)
ROAD = (244, 245, 247)

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def make_icon(size, maskable=False, corner_radius_ratio=0.22):
    img = Image.new("RGB", (size, size), TOP)
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        c = lerp(TOP, BOTTOM, t ** 1.3)
        for x in range(size):
            px[x, y] = c

    draw = ImageDraw.Draw(img, "RGBA")

    # safe-zone scale: maskable icons need content within ~80% center circle
    scale = 0.62 if maskable else 0.80
    cx, cy = size / 2, size * (0.60 if maskable else 0.56)
    s = size * scale

    # sun (glow + disc), sitting on the horizon
    sun_r = s * 0.22
    sun_cy = cy - s * 0.05
    for i in range(6, 0, -1):
        alpha = int(28 * (i / 6))
        r = sun_r * (1 + i * 0.14)
        draw.ellipse([cx - r, sun_cy - r, cx + r, sun_cy + r], fill=SUN + (alpha,))
    draw.ellipse([cx - sun_r, sun_cy - sun_r, cx + sun_r, sun_cy + sun_r], fill=SUN + (255,))

    # horizon line
    hy = cy + s * 0.14
    draw.line([cx - s * 0.5, hy, cx + s * 0.5, hy], fill=(255, 255, 255, 130), width=max(2, int(size * 0.012)))

    # mountains (two overlapping triangles), silhouetted against the sky
    mtn_color = (13, 18, 33, 235)
    m1 = [(cx - s * 0.52, hy), (cx - s * 0.12, hy - s * 0.42), (cx + s * 0.20, hy)]
    m2 = [(cx - s * 0.06, hy), (cx + s * 0.30, hy - s * 0.55), (cx + s * 0.55, hy)]
    draw.polygon(m2, fill=mtn_color)
    draw.polygon(m1, fill=(9, 13, 24, 255))

    # road: a simple converging perspective road with a center dash
    road_top_w = s * 0.06
    road_bot_w = s * 0.30
    ry_top = hy
    ry_bot = cy + s * 0.5
    draw.polygon([
        (cx - road_top_w, ry_top), (cx + road_top_w, ry_top),
        (cx + road_bot_w, ry_bot), (cx - road_bot_w, ry_bot),
    ], fill=(20, 22, 29, 255))
    # center dashes
    dash_n = 4
    for i in range(dash_n):
        t0 = i / dash_n
        t1 = t0 + 0.5 / dash_n
        y0 = ry_top + (ry_bot - ry_top) * t0
        y1 = ry_top + (ry_bot - ry_top) * t1
        w0 = 1 + (road_bot_w * 0.05) * t0
        draw.line([(cx, y0), (cx, y1)], fill=ROAD + (230,), width=max(1, int(size * 0.008 * (0.5 + t0))))

    if not maskable:
        # round the corners for the "any" purpose icons
        mask = Image.new("L", (size, size), 0)
        mdraw = ImageDraw.Draw(mask)
        r = int(size * corner_radius_ratio)
        mdraw.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
        rounded = Image.new("RGBA", (size, size))
        rounded.paste(img, (0, 0), mask)
        return rounded

    return img.convert("RGBA")


import os
os.makedirs(OUT, exist_ok=True)

make_icon(192).save(f"{OUT}/icon-192.png")
make_icon(512).save(f"{OUT}/icon-512.png")
make_icon(192, maskable=True).save(f"{OUT}/icon-maskable-192.png")
make_icon(512, maskable=True).save(f"{OUT}/icon-maskable-512.png")
make_icon(180, corner_radius_ratio=0.0).save(f"{OUT}/apple-touch-icon.png")  # iOS applies its own mask
make_icon(32, corner_radius_ratio=0.18).save(f"{OUT}/favicon-32.png")

print("icons written:", os.listdir(OUT))
