// Превращает AI-пиксель-арт зданий (raw/<key>_raw.png, белый фон) в игровые
// спрайты с прозрачным фоном и ОБМЕРОМ ИЗО-ФУНДАМЕНТА для точной посадки на ромб клетки.
// Запуск: node scripts/build-sprites.cjs  (для отсутствующих raw — пропуск)
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '..', 'raw');
const OUT = path.join(__dirname, '..', 'src', 'assets', 'sprites');
const KEYS = ['towncenter', 'house', 'barracks', 'stable', 'blacksmith', 'market', 'tower', 'farm'];
const MAXDIM = 380; // макс. размер после ужатия (пиксели)

function load(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

// 1) заливка фона от краёв (near-white), 4-связно
function cutBackground(img) {
  const { width: W, height: H, data } = img;
  const bg = new Uint8Array(W * H);
  const stack = [];
  const isWhite = (i) => data[i] > 228 && data[i + 1] > 228 && data[i + 2] > 228;
  const push = (x, y) => { const i = y * W + x; if (!bg[i] && isWhite(i * 4)) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % W, y = (i / W) | 0;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }
  for (let i = 0; i < W * H; i++) if (bg[i]) data[i * 4 + 3] = 0;
  return img;
}

// 2) удалить мелкие «соринки» (отдельные компоненты меньше порога)
function dropSpecks(img, minArea) {
  const { width: W, height: H, data } = img;
  const seen = new Uint8Array(W * H);
  const opaque = (i) => data[i * 4 + 3] > 30;
  const comps = [];
  for (let i = 0; i < W * H; i++) {
    if (seen[i] || !opaque(i)) continue;
    const stack = [i]; seen[i] = 1; const cells = [];
    while (stack.length) {
      const c = stack.pop(); cells.push(c);
      const x = c % W, y = (c / W) | 0;
      const nb = [c - 1, c + 1, c - W, c + W];
      for (const n of nb) {
        if (n < 0 || n >= W * H || seen[n] || !opaque(n)) continue;
        seen[n] = 1; stack.push(n);
      }
      void x; void y;
    }
    comps.push(cells);
  }
  for (const c of comps) if (c.length < minArea) for (const i of c) data[i * 4 + 3] = 0;
  return comps.length;
}

// 3) кроп до непрозрачного bbox
function crop(img) {
  const { width: W, height: H, data } = img;
  let x0 = W, y0 = H, x1 = 0, y1 = 0, found = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] > 30) {
      found = true;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (!found) return img;
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = new PNG({ width: cw, height: ch });
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const si = ((y + y0) * W + (x + x0)) * 4, di = (y * cw + x) * 4;
    out.data[di] = data[si]; out.data[di + 1] = data[si + 1]; out.data[di + 2] = data[si + 2]; out.data[di + 3] = data[si + 3];
  }
  return out;
}

// nearest-neighbor ужатие
function downscale(img, maxDim) {
  const k = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (k >= 1) return img;
  const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(img.width - 1, (x / k) | 0), sy = Math.min(img.height - 1, (y / k) | 0);
    const si = (sy * img.width + sx) * 4, di = (y * w + x) * 4;
    out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1]; out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = img.data[si + 3];
  }
  return out;
}

// 4) обмер изо-фундамента: самая широкая строка в нижних 45% + самая нижняя точка
function measureFooting(img) {
  const { width: W, height: H, data } = img;
  const op = (x, y) => data[(y * W + x) * 4 + 3] > 40;
  let bottom = -1;
  for (let y = H - 1; y >= 0; y--) {
    let n = 0; for (let x = 0; x < W; x++) if (op(x, y)) n++;
    if (n >= 2) { bottom = y; break; }
  }
  const bandTop = Math.round(bottom - (bottom) * 0.45);
  let bestW = 0, ax = W / 2;
  for (let y = bandTop; y <= bottom; y++) {
    let l = W, r = -1;
    for (let x = 0; x < W; x++) if (op(x, y)) { if (x < l) l = x; if (x > r) r = x; }
    if (r - l + 1 > bestW) { bestW = r - l + 1; ax = (l + r) / 2; }
  }
  return { ax, ay: bottom, baseW: bestW, w: W, h: H };
}

const anchors = {};
for (const key of KEYS) {
  const rawPath = path.join(RAW, `${key}_raw.png`);
  if (!fs.existsSync(rawPath)) { console.log(`skip ${key} (no raw)`); continue; }
  let img = load(rawPath);
  cutBackground(img);
  dropSpecks(img, Math.floor(img.width * img.height * 0.0006));
  img = crop(img);
  img = downscale(img, MAXDIM);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${key}.png`), PNG.sync.write(img));
  const m = measureFooting(img);
  anchors[key] = { ax: +m.ax.toFixed(1), ay: m.ay, baseW: m.baseW, w: m.w, h: m.h };
  console.log('bld', key.padEnd(12), `${m.w}x${m.h}`, 'anchor', `ax=${m.ax.toFixed(0)} ay=${m.ay}`, 'baseW', m.baseW);
}

// ── Юниты: u_<key>_raw.png → units/<key>.png (боковой вид, опорная точка = ноги).
//    Кадр ходьбы: u_<key>_w_raw.png → units/<key>_w.png ──
const UKEYS = ['villager', 'swordsman', 'archer', 'spearman', 'knight', 'cavalry', 'catapult', 'monk', 'wolf'];
const UDIR = path.join(OUT, 'units');
const uanchors = {};
const processUnit = (rawKey, anchorKey) => {
  let img = load(path.join(RAW, `u_${rawKey}_raw.png`));
  cutBackground(img);
  dropSpecks(img, Math.floor(img.width * img.height * 0.0008));
  img = crop(img);
  img = downscale(img, 150); // юниты мелкие
  fs.mkdirSync(UDIR, { recursive: true });
  fs.writeFileSync(path.join(UDIR, `${rawKey}.png`), PNG.sync.write(img));
  // опора: центр по X, низ по Y (ноги/земля)
  uanchors[anchorKey] = { ax: +(img.width / 2).toFixed(1), ay: img.height - 1, baseW: img.width, w: img.width, h: img.height };
  console.log('unit', rawKey.padEnd(14), `${img.width}x${img.height}`);
};
for (const key of UKEYS) {
  if (!fs.existsSync(path.join(RAW, `u_${key}_raw.png`))) { console.log(`skip unit ${key} (no raw)`); continue; }
  processUnit(key, key);
  // второй кадр шага
  for (const suf of ['_w', '_walk2']) {
    if (fs.existsSync(path.join(RAW, `u_${key}${suf}_raw.png`))) processUnit(key + suf, key + suf);
  }
}

const ts = `// АВТОГЕНЕРАЦИЯ: scripts/build-sprites.cjs — якоря изо-фундамента спрайтов.
// Здания: ax,ay — точка спрайта, садящаяся на переднюю кромку ромба клетки; baseW — ширина фундамента.
// Юниты: ax — центр по X, ay — низ (ноги); w,h — размеры.
export interface SprAnchor { ax: number; ay: number; baseW: number; w: number; h: number }
export const SPR_ANCHORS: Record<string, SprAnchor> = ${JSON.stringify(anchors, null, 2)};
export const UNIT_ANCHORS: Record<string, SprAnchor> = ${JSON.stringify(uanchors, null, 2)};
// целевая высота юнита на экране (iso px)
export const UNIT_TARGET_H: Record<string, number> = {
  villager: 46, swordsman: 48, archer: 46, spearman: 50, knight: 60, cavalry: 60, catapult: 46, monk: 44, wolf: 34,
};
`;
fs.writeFileSync(path.join(__dirname, '..', 'src', 'game', 'sprite-art.ts'), ts);
console.log('sprite-art.ts written');
