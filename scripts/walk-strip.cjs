const fs = require('fs'), path = require('path');
const { PNG } = require('pngjs');
const SPR = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'units');
const art = fs.readFileSync(path.join(__dirname, '..', 'src', 'game', 'sprite-art.ts'), 'utf8');
const UA = JSON.parse(art.split('export const UNIT_ANCHORS')[1].split('=')[1].split(';')[0]);
const targets = process.argv.slice(2);
const keys = targets.length ? targets : ['villager'];
const frames = 8, FW = 130, FH = 190;
const UH = { villager: 46, swordsman: 48, archer: 46, spearman: 50, knight: 60, cavalry: 60, catapult: 46, monk: 44, wolf: 34 };
const WALK_B = { villager: 'villager_w', swordsman: 'swordsman_walk2', archer: 'archer_w', spearman: 'spearman_w', knight: 'knight_w', cavalry: 'cavalry_w', catapult: 'catapult_w', monk: 'monk_w', wolf: 'wolf_w' };
const out = new PNG({ width: FW * frames, height: FH * keys.length });
const setPx = (x, y, c) => { if (x < 0 || y < 0 || x >= out.width || y >= out.height) return; const i = (y * out.width + x) * 4; out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255; };
for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) setPx(x, y, [40, 80, 38]);
const load = (n) => PNG.sync.read(fs.readFileSync(path.join(SPR, `${n}.png`)));
keys.forEach((key, row) => {
  const A = load(key), B = load(WALK_B[key]);
  const aA = UA[key], aB = UA[WALK_B[key]];
  const H = UH[key] ?? 46;
  for (let f = 0; f < frames; f++) {
    const anim = f * 0.9;
    const useB = Math.sin(anim) < 0;
    const im = useB ? B : A, an = useB ? aB : aA;
    const stepAbs = Math.abs(Math.sin(anim));
    const scale = H / an.h;
    const bob = -stepAbs * (key === 'knight' || key === 'cavalry' ? 7 : 4);
    const ox = f * FW + FW / 2, oy = row * FH + FH - 26 + bob;
    const dx = ox - an.ax * scale, dy = oy - an.ay * scale;
    const dw = im.width * scale, dh = H;
    for (let sy = 0; sy < im.height; sy++) for (let sx = 0; sx < im.width; sx++) {
      const si = (sy * im.width + sx) * 4, a = im.data[si + 3];
      if (a < 16) continue;
      const X = Math.round(dx + sx * dw / im.width), Y = Math.round(dy + sy * dh / im.height);
      if (X < 0 || Y < 0 || X >= out.width || Y >= out.height) continue;
      const di = (Y * out.width + X) * 4;
      out.data[di] = im.data[si]; out.data[di + 1] = im.data[si + 1]; out.data[di + 2] = im.data[si + 2]; out.data[di + 3] = 255;
    }
    for (let x = f * FW + 6; x < f * FW + FW - 6; x++) setPx(x, row * FH + FH - 26, [150, 120, 70]);
  }
});
fs.writeFileSync(path.join(__dirname, 'walk-strip.png'), PNG.sync.write(out));
console.log('ok');
