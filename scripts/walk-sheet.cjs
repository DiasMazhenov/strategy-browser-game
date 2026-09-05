const fs = require('fs'), path = require('path');
const { PNG } = require('pngjs');
const SPR = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'units');
const pairs = [
  ['villager', 'villager_w'], ['swordsman_w', 'swordsman_walk2'],
  ['archer', 'archer_w'], ['spearman', 'spearman_w'], ['knight', 'knight_w'],
  ['cavalry', 'cavalry_w'], ['catapult', 'catapult_w'], ['monk', 'monk_w'], ['wolf', 'wolf_w'],
];
const CW = 220, CH = 190, cols = 5;
const rows = Math.ceil(pairs.length / cols);
const out = new PNG({ width: CW * cols, height: CH * rows });
const px = (x, y, c) => { if (x < 0 || y < 0 || x >= out.width || y >= out.height) return; const i = (y * out.width + x) * 4; out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255; };
for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) px(x, y, [34, 70, 32]);
const blit = (name, ox, oy, H) => {
  const img = PNG.sync.read(fs.readFileSync(path.join(SPR, `${name}.png`)));
  const scale = H / img.height;
  for (let sy = 0; sy < img.height; sy++) for (let sx = 0; sx < img.width; sx++) {
    const si = (sy * img.width + sx) * 4, a = img.data[si + 3];
    if (a < 16) continue;
    const X = Math.round(ox + sx * scale), Y = Math.round(oy + sy * scale);
    if (X < 0 || Y < 0 || X >= out.width || Y >= out.height) continue;
    const di = (Y * out.width + X) * 4;
    out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1]; out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = 255;
  }
};
pairs.forEach(([a, b], i) => {
  const cx = (i % cols) * CW, ry = ((i / cols) | 0) * CH;
  // baseline
  for (let x = cx + 10; x < cx + CW - 10; x++) px(x, ry + CH - 24, [120, 90, 50]);
  blit(a, cx + 16, ry + 6, 150);
  blit(b, cx + CW / 2 + 6, ry + 6, 150);
});
fs.writeFileSync(path.join(__dirname, 'walk-sheet.png'), PNG.sync.write(out));
console.log('ok');
