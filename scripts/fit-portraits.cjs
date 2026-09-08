// Портреты «великих людей» → 256×256, как остальные портреты в игре.
// Кадрируем по центру верхней части (лицо), затем ужимаем усреднением.
const path = require('path');
const M = require('./make-altybakan.cjs');

const SIZE = 256;
const FILES = ['tole_bi', 'kazybek_bi', 'aiteke_bi'];

// квадрат из кадра: берём по меньшей стороне, по вертикали смещаем вверх —
// в портретах лицо в верхней трети, центр кадра срезал бы его
function squareCrop(im) {
  const s = Math.min(im.w, im.h);
  const x0 = Math.round((im.w - s) / 2);
  const y0 = Math.round((im.h - s) * 0.18);
  return M.crop(im, { x0, y0, w: s, h: s });
}

for (const f of FILES) {
  const p = path.join(__dirname, '..', 'src', 'assets', 'portraits', f + '.png');
  const im = M.readPNG(p);
  const sq = squareCrop(im);
  const out = M.resize(sq, SIZE, SIZE);
  M.writePNG(p, out.w, out.h, out.px);
  console.log(`  ${f.padEnd(14)} ${im.w}x${im.h} → ${out.w}x${out.h}`);
}
