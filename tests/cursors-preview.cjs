// Превью курсоров: складывает 32×32 иконки в ряд на тёмном фоне (как на карте),
// рядом — тот же курсор, увеличенный ×3, чтобы видеть пиксели.
// Запуск: node tests/cursors-preview.cjs → tests/cursors.png
const fs = require('fs');
const path = require('path');
const M = require('../scripts/make-altybakan.cjs');

const DIR = path.join(__dirname, '..', 'src', 'assets', 'cursors');
const names = ['attack', 'wood', 'gold', 'food', 'fish', 'build', 'move'];
const S = 16, Z = 6, PAD = 8;
const cellW = S + PAD + S * Z + PAD * 2;
const W = cellW * names.length, H = S * Z + PAD * 2;
const px = Buffer.alloc(W * H * 4);

// фон — как трава/степь в игре, чтобы оценить читаемость
for (let i = 0; i < W * H; i++) {
  px[i * 4] = 58; px[i * 4 + 1] = 74; px[i * 4 + 2] = 44; px[i * 4 + 3] = 255;
}

function blit(im, ox, oy, zoom) {
  for (let y = 0; y < im.h * zoom; y++) for (let x = 0; x < im.w * zoom; x++) {
    const sx = (x / zoom) | 0, sy = (y / zoom) | 0;
    const s = (sy * im.w + sx) * 4;
    const a = im.px[s + 3] / 255;
    if (a < 0.02) continue;
    const dx = ox + x, dy = oy + y;
    if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
    const d = (dy * W + dx) * 4;
    for (let k = 0; k < 3; k++) px[d + k] = Math.round(px[d + k] * (1 - a) + im.px[s + k] * a);
  }
}

names.forEach((n, i) => {
  const f = path.join(DIR, n + '.png');
  if (!fs.existsSync(f)) return;
  const im = M.readPNG(f);
  const ox = i * cellW + PAD;
  blit(im, ox, PAD + (S * Z - S) / 2, 1);          // как увидит игрок (1:1)
  blit(im, ox + S + PAD, PAD, Z);                   // крупно
});

const out = path.join(__dirname, 'cursors.png');
M.writePNG(out, W, H, px);
console.log(`tests/cursors.png — ${names.join(' | ')}`);
console.log('в каждой паре: слева 32px (как в игре), справа ×3');
