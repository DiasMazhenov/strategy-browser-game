#!/usr/bin/env python3
"""Постобработка спрайтов казашки-работницы: убрать magenta-фон, обрезать,
уменьшить до целевой высоты (150px, как у kz-юнитов) ближайшим соседом."""
import os
from PIL import Image

GEN = "src/assets/sprites/units/_gen"
OUT = "src/assets/sprites/units/kz"

JOBS = [
    ("kzf_side_stand.png", "kz_fem.png",       150),
    ("kzf_side_walk.png",  "kz_fem_w.png",     150),
    ("kzf_front.png",      "kz_fem_f.png",     150),
    ("kzf_back.png",       "kz_fem_b.png",     150),
    ("kzf_gather.png",     "kz_fem_gather.png", 150),
    ("kzf_milk.png",       "kz_fem_milk.png",   130),
]


def is_magenta(r, g, b):
    return (r > 90 and b > 90 and g < min(r, b) * 0.74 and (min(r, b) - g) > 40)


def process(src, dst, target_h):
    im = Image.open(os.path.join(GEN, src)).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if is_magenta(r, g, b):
                px[x, y] = (r, g, b, 0)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 250 and r > 80 and b > 80 and g < min(r, b) * 0.8:
                px[x, y] = (r, g, b, 0)
    bbox = im.getbbox()
    if bbox:
        l, t, rr, bb = bbox
        pad = 6
        im = im.crop((max(0, l - pad), max(0, t - pad),
                      min(w, rr + pad), min(h, bb + pad)))
    cw, ch = im.size
    scale = target_h / ch
    nw = max(1, round(cw * scale))
    im = im.resize((nw, target_h), Image.NEAREST)
    os.makedirs(OUT, exist_ok=True)
    im.save(os.path.join(OUT, dst))
    print(f"{dst}: {nw}x{target_h}")


if __name__ == "__main__":
    for s, d, th in JOBS:
        process(s, d, th)
    print("done")
