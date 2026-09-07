#!/usr/bin/env python3
"""Постобработка сгенерированных спрайтов скота:
- убрать плоский magenta (#FF00FF) фон по правилу «низкий зелёный канал» (не задевает розовый нос/вымя);
- обрезать по альфа-контуру с небольшим полем;
- уменьшить до целевой высоты ближайшим соседом (чёткий пиксель-арт).
Запуск: python3 scripts/process_livestock.py
"""
import os
from PIL import Image

GEN = "src/assets/sprites/units/_gen"
OUT = "src/assets/sprites/units"

# (файл источника, файл результата, целевая высота в px)
JOBS = [
    ("cow_side_stand.png", "cow.png",   108),
    ("cow_side_walk.png",  "cow_w.png", 108),
    ("cow_front.png",      "cow_f.png", 108),
    ("cow_back.png",       "cow_b.png", 108),
    ("sheep_side_stand.png", "sheep.png",   96),
    ("sheep_side_walk.png",  "sheep_w.png", 96),
    ("sheep_front.png",      "sheep_f.png", 96),
    ("sheep_back.png",       "sheep_b.png", 96),
]


def is_magenta(r, g, b):
    # фон: насыщенный пурпур — R и B высокие, G заметно ниже; ловим и полупрозрачный
    # антиалиасинг-ореол (purple fringe). Розовый нос/вымя имеют высокий зелёный — не трогаем;
    # коричневые пятна имеют b < g — тоже проходят мимо.
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
    # второй проход: подчистить полупрозрачный пурпурный ореол по краю (alpha<255 + пурпурный оттенок)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 250 and r > 80 and b > 80 and g < min(r, b) * 0.8:
                px[x, y] = (r, g, b, 0)
    # обрезка по непрозрачному контуру + поле 6px
    bbox = im.getbbox()
    if bbox:
        l, t, rr, bb = bbox
        pad = 6
        l = max(0, l - pad); t = max(0, t - pad)
        rr = min(w, rr + pad); bb = min(h, bb + pad)
        im = im.crop((l, t, rr, bb))
    # масштаб до целевой высоты ближайшим соседом
    cw, ch = im.size
    scale = target_h / ch
    nw = max(1, round(cw * scale))
    im = im.resize((nw, target_h), Image.NEAREST)
    im.save(os.path.join(OUT, dst))
    print(f"{dst}: {nw}x{target_h}")


if __name__ == "__main__":
    for s, d, th in JOBS:
        process(s, d, th)
    print("done")
