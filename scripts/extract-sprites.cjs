// Удаляет белый фон и мягкую тень у сырых сгенерированных спрайтов (флуд-заливка от краёв),
// затем кропает по содержимому и сохраняет прозрачный PNG.
// Запуск: node scripts/extract-sprites.cjs  (нужен pngjs: npm i -D pngjs)
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SRC_DIR = path.join(__dirname, '..', 'src', 'assets', 'sprites');

const FILES = [
  { raw: 'towncenter_raw.png', out: 'towncenter.png' },
  { raw: 'house_raw.png', out: 'house.png' },
  { raw: 'barracks_raw.png', out: 'barracks.png' },
  { raw: 'tower_raw.png', out: 'tower.png' },
  { raw: 'farm_raw.png', out: 'farm.png' },
  { raw: 'stable_raw.png', out: 'stable.png' },
  { raw: 'market_raw.png', out: 'market.png' },
  { raw: 'blacksmith_raw.png', out: 'blacksmith.png' },
];

function process(buf) {
  const png = PNG.sync.read(buf);
  const { width: w, height: h, data } = png;
  const removed = new Uint8Array(w * h);

  const idx = (x, y) => y * w + x;
  const isBgEdge = (p) => {
    const i = p * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 10) return true;
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    if (r > 238 && g > 238 && b > 238) return true;            // почти белый
    if (mn > 204 && mx - mn < 36) return true;                 // светло-серый (тень/дым)
    return false;
  };

  // 1) флуд-заливка от всех граничных пикселей
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(idx(x, 0)); stack.push(idx(x, h - 1)); }
  for (let y = 0; y < h; y++) { stack.push(idx(0, y)); stack.push(idx(w - 1, y)); }
  while (stack.length) {
    const p = stack.pop();
    if (removed[p]) continue;
    if (!isBgEdge(p)) continue;
    removed[p] = 1;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }

  // 2) применяем прозрачность + снимаем белый ореол по краю
  // (глобальный чистый белый НЕ удаляем — внутри бывают белые детали, напр. навес рынка)
  let minX = w, minY = h, maxX = -1, maxY = -1;
  const nbr = (p) => {
    const x = p % w, y = (p / w) | 0;
    return (x > 0 && removed[p - 1]) || (x < w - 1 && removed[p + 1]) ||
           (y > 0 && removed[p - w]) || (y < h - 1 && removed[p + w]);
  };
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (removed[p]) { data[i + 3] = 0; continue; }
    // анти-ореол: светлый пиксель, граничащий с фоном → гасим альфу по «белизне»
    if (nbr(p)) {
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum > 205) {
        const na = Math.round(255 * Math.max(0, Math.min(1, (255 - lum) / 50)));
        data[i + 3] = Math.min(data[i + 3], na);
      }
    }
    if (data[i + 3] > 12) {
      const x = p % w, y = (p / w) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }

  // 4) кроп с отступом
  const pad = 4;
  const cx0 = Math.max(0, minX - pad), cy0 = Math.max(0, minY - pad);
  const cx1 = Math.min(w - 1, maxX + pad), cy1 = Math.min(h - 1, maxY + pad);
  const cw = cx1 - cx0 + 1, ch = cy1 - cy0 + 1;
  const out = new PNG({ width: cw, height: ch });
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = ((cy0 + y) * w + (cx0 + x)) * 4;
      const di = (y * cw + x) * 4;
      out.data[di] = data[si]; out.data[di + 1] = data[si + 1];
      out.data[di + 2] = data[si + 2]; out.data[di + 3] = data[si + 3];
    }
  }
  return { buffer: PNG.sync.write(out), width: cw, height: ch };
}

for (const f of FILES) {
  const rawPath = path.join(SRC_DIR, f.raw);
  if (!fs.existsSync(rawPath)) { console.log(`${f.out}: пропуск (нет ${f.raw})`); continue; }
  const raw = fs.readFileSync(rawPath);
  const { buffer, width, height } = process(raw);
  fs.writeFileSync(path.join(SRC_DIR, f.out), buffer);
  console.log(`${f.out}: ${width}x${height}`);
}
