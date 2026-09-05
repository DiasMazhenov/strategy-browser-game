// Проверка посадки: спрайты + ромбы сетки + кольцо выделения + юниты.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const art = fs.readFileSync(path.join(__dirname, '..', 'src', 'game', 'sprite-art.ts'), 'utf8');
const grab = (name) => JSON.parse(art.split(`export const ${name}`)[1].split('=')[1].split(';')[0]);
const AN = grab('SPR_ANCHORS');
const UA = grab('UNIT_ANCHORS');
const SIZES = { towncenter: 120, house: 56, barracks: 92, stable: 92, blacksmith: 80, market: 72, tower: 56, farm: 72 };
const UH = { villager: 46, swordsman: 48, archer: 46, spearman: 50, knight: 60, cavalry: 60, catapult: 46, monk: 44, wolf: 34 };

const W = 1400, H = 900;
const out = new PNG({ width: W, height: H });
const px = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = c[3]; };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, [46, 92, 42, 255]);

const blit = (file, dx, dy, dw, dh) => {
  const img = PNG.sync.read(fs.readFileSync(file));
  for (let sy = 0; sy < img.height; sy++) for (let sx = 0; sx < img.width; sx++) {
    const si = (sy * img.width + sx) * 4, a = img.data[si + 3];
    if (a < 16) continue;
    const tx = dx + sx * dw / img.width, ty = dy + sy * dh / img.height, aa = a / 255;
    const X = Math.round(tx), Y = Math.round(ty);
    if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const di = (Y * W + X) * 4;
    out.data[di] = img.data[si] * aa + out.data[di] * (1 - aa);
    out.data[di + 1] = img.data[si + 1] * aa + out.data[di + 1] * (1 - aa);
    out.data[di + 2] = img.data[si + 2] * aa + out.data[di + 2] * (1 - aa);
    out.data[di + 3] = 255;
  }
};
const line = (x0, y0, x1, y1, c, wd = 2) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; for (let o = -Math.floor(wd / 2); o <= Math.floor(wd / 2); o++) px(x + o, y, c); }
};
// полукольцо: back=true — дальняя кромка (left→top→right), false — ближняя (right→bot→left)
const ringHalf = (ix, iy, hw, hh, c, back) => {
  const top = [ix, iy - hh], right = [ix + hw, iy], bot = [ix, iy + hh], left = [ix - hw, iy];
  const pts = back ? [left, top, right] : [right, bot, left];
  for (let i = 0; i < pts.length - 1; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, 3);
};

const SPR = path.join(__dirname, '..', 'src', 'assets', 'sprites');
// одно здание с кольцом выделения (как в игре: back под спрайт, front поверх)
{
  const key = 'towncenter', ix = 360, iy = 430, S = SIZES[key];
  ringHalf(ix, iy, S * 1.03, S * 1.03 / 2, [246, 212, 124, 255], true);
  const a = AN[key], scale = 2 * S * 1.02 / a.baseW;
  blit(path.join(SPR, `${key}.png`), ix - a.ax * scale, iy + S / 2 - a.ay * scale, a.w * scale, a.h * scale);
  ringHalf(ix, iy, S * 1.03, S * 1.03 / 2, [246, 212, 124, 255], false);
}

// все 9 юнитов рядом (опорная нога на земле)
const ukeys = ['villager', 'swordsman', 'archer', 'spearman', 'knight', 'cavalry', 'catapult', 'monk', 'wolf'];
ukeys.forEach((key, i) => {
  const col = i % 5, row = (i / 5) | 0;
  const ix = 720 + col * 130, iy = 320 + row * 230;
  const a = UA[key]; if (!a) return;
  const Hh = UH[key], scale = Hh / a.h;
  blit(path.join(SPR, 'units', `${key}.png`), ix - a.ax * scale, iy + 8 - a.ay * scale, a.w * scale, Hh);
  // красная точка опоры
  px(ix, iy + 8, [239, 68, 68, 255]); px(ix + 1, iy + 8, [239, 68, 68, 255]);
});

fs.writeFileSync(path.join(__dirname, 'iso-check.png'), PNG.sync.write(out));
console.log('ok');
