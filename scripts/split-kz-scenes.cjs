// Нарезка полосы СЦЕН (в отличие от split-kz-strip.cjs, который режет одиночные фигуры).
// Сцена = группа людей рядом (игрок + зрители), которую НЕЛЬЗЯ разделять на части.
// Раскладка определяется по пустым magenta-полосам: сначала строки, потом столбцы;
// каждая ячейка сетки — одна сцена целиком.
// Масштаб ОБЩИЙ: эталон — медианная высота сцены → BODY_H.
// Запуск: node scripts/split-kz-scenes.cjs <rawStem> <rows> <cols> <out1> <out2> ...
//   пример: node scripts/split-kz-scenes.cjs kz_rest_asyk2 2 2 a b c d
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const RAW = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'units', 'kz', 'raw');
const OUT = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'units', 'kz');
const BODY_H = 150;

const rawStem = process.argv[2];
const rows = parseInt(process.argv[3] || '0', 10);
const cols = parseInt(process.argv[4] || '0', 10);
const names = process.argv.slice(5);
if (!rawStem || !rows || !cols) {
  console.error('usage: split-kz-scenes.cjs <rawStem> <rows> <cols> <out1> ...');
  process.exit(1);
}

function decodePNG(file) {
  const data = fs.readFileSync(file);
  let pos = 8, idat = Buffer.alloc(0), W = 0, H = 0, ct = 0;
  while (pos < data.length) {
    const ln = data.readUInt32BE(pos);
    const typ = data.slice(pos + 4, pos + 8).toString();
    const chunk = data.slice(pos + 8, pos + 8 + ln);
    if (typ === 'IHDR') { W = chunk.readUInt32BE(0); H = chunk.readUInt32BE(4); ct = chunk[9]; }
    else if (typ === 'IDAT') idat = Buffer.concat([idat, chunk]);
    pos += 12 + ln;
  }
  const ch = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(idat);
  const stride = W * ch, out = Buffer.alloc(H * stride);
  let p = 0; const prev = Buffer.alloc(stride);
  for (let y = 0; y < H; y++) {
    const f = raw[p++], line = raw.slice(p, p + stride); p += stride; const cur = Buffer.from(line);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if (f === 1) cur[x] = (cur[x] + a) & 255; else if (f === 2) cur[x] = (cur[x] + b) & 255;
      else if (f === 3) cur[x] = (cur[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) { const pp = a + b - c; const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); cur[x] = (cur[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
    }
    cur.copy(out, y * stride); cur.copy(prev);
  }
  return { W, H, ch, data: out };
}
const CRC_T = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_T[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function encodePNG(W, H, rgba) {
  const stride = W * 4, raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const comp = zlib.deflateSync(raw, { level: 9 });
  const chunk = (typ, body) => { const b = Buffer.alloc(12 + body.length); b.writeUInt32BE(body.length, 0); b.write(typ, 4); body.copy(b, 8); b.writeUInt32BE(crc32(Buffer.concat([Buffer.from(typ), body])), 8 + body.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', comp), chunk('IEND', Buffer.alloc(0))]);
}

const file = path.join(RAW, rawStem + '_raw.png');
if (!fs.existsSync(file)) { console.error('missing', file); process.exit(1); }
const { W, H, ch, data } = decodePNG(file);
// строгий magenta — сплошной фон
const isMag = (i) => { const r = data[i], g = data[i + 1], b = data[i + 2]; return r > 170 && b > 150 && g < 120 && (r - g) > 80 && (b - g) > 60; };
// бахрома: полупрозрачные пиксели на границе фигуры «замешаны» с фоном и остаются
// фиолетовыми. В палитре сцен (олива/охра/серый/кость) пурпурного нет, поэтому
// любой пиксель, где R и B заметно выше G, — это грязь от фона.
const isFringe = (i) => { const r = data[i], g = data[i + 1], b = data[i + 2]; return (r - g) > 28 && (b - g) > 28; };
const solid = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) solid[i] = isMag(i * ch) ? 0 : 1;

// профиль занятости по строкам и столбцам
const rowHas = new Uint8Array(H), colHas = new Uint8Array(W);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (solid[y * W + x]) { rowHas[y] = 1; colHas[x] = 1; }

// разбиение оси на N полос по самым широким пустым промежуткам
function bands(has, n, len) {
  const runs = [];             // непрерывные занятые отрезки
  let s = -1;
  for (let i = 0; i < len; i++) {
    if (has[i] && s < 0) s = i;
    else if (!has[i] && s >= 0) { runs.push([s, i - 1]); s = -1; }
  }
  if (s >= 0) runs.push([s, len - 1]);
  if (!runs.length) return [];
  if (runs.length <= n) return runs;
  // склеиваем ближайшие отрезки, пока их не станет n
  while (runs.length > n) {
    let bi = 0, bg = Infinity;
    for (let i = 0; i + 1 < runs.length; i++) {
      const gap = runs[i + 1][0] - runs[i][1];
      if (gap < bg) { bg = gap; bi = i; }
    }
    runs[bi] = [runs[bi][0], runs[bi + 1][1]];
    runs.splice(bi + 1, 1);
  }
  return runs;
}
const rowBands = bands(rowHas, rows, H);
const colBands = bands(colHas, cols, W);
console.log(`сетка ${rowBands.length}x${colBands.length} в ${rawStem}`);

// собираем ячейки в порядке чтения; в каждой уточняем границы по содержимому
const cells = [];
for (const [ry0, ry1] of rowBands) {
  for (const [cx0, cx1] of colBands) {
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let y = ry0; y <= ry1; y++) for (let x = cx0; x <= cx1; x++) {
      if (!solid[y * W + x]) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) continue;
    cells.push({ x0, x1, y0, y1 });
  }
}
cells.forEach((c, i) => console.log(`  сцена${i}: x[${c.x0}-${c.x1}] y[${c.y0}-${c.y1}] w${c.x1 - c.x0 + 1} h${c.y1 - c.y0 + 1}`));
const count = names.length;
if (cells.length < count) { console.error('нужно', count, 'сцен, найдено', cells.length); process.exit(1); }
const picked = cells.slice(0, count);

// общий масштаб: медианная высота сцены → BODY_H
const hs = picked.map(c => c.y1 - c.y0 + 1).slice().sort((a, b) => a - b);
const bodyH = hs.length % 2 ? hs[(hs.length - 1) / 2] : (hs[hs.length / 2 - 1] + hs[hs.length / 2]) / 2;
const scale = BODY_H / bodyH;

// ── Метальщик каждой сцены: по нему выравниваем кадры ─────────────────────
// Ширина сцены гуляет от кадра к кадру (руки вверх, кости в полёте), и если
// класть каждый кадр на свой холст, движок вписывает разные холсты в одну и ту
// же высоту — фигуры «дышат» на каждом кадре. Поэтому считаем общий холст.
function thrower(c) {
  const sceneH = c.y1 - c.y0 + 1;
  const minRun = Math.max(8, Math.round(sceneH * 0.30));
  const colOcc = [];
  for (let x = c.x0; x <= c.x1; x++) {
    let best = 0, run = 0;
    for (let y = c.y0; y <= c.y1; y++) {
      if (solid[y * W + x]) { if (++run > best) best = run; } else run = 0;
    }
    colOcc.push(best >= minRun ? 1 : 0);
  }
  let i = 0;
  while (i < colOcc.length && !colOcc[i]) i++;
  let tx0 = c.x0 + i, tx1 = -1, gap = 0;
  while (i < colOcc.length) {
    if (colOcc[i]) { tx1 = c.x0 + i; gap = 0; }
    else if (++gap > 6) break;
    i++;
  }
  if (tx1 < 0) { tx0 = c.x0; tx1 = c.x1; }
  return (tx0 + tx1) / 2;
}

const PAD = 4;
const metas = picked.map(c => {
  const cx = thrower(c);
  return { c, cx, left: cx - c.x0, right: c.x1 - cx, up: c.y1 - c.y0 };
});
const maxL = Math.max(...metas.map(m => m.left));
const maxR = Math.max(...metas.map(m => m.right));
const maxU = Math.max(...metas.map(m => m.up));

// общий холст в исходных пикселях, якорь = метальщик, низ = линия земли
const cw = Math.ceil(maxL + maxR) + PAD * 2;
const chh = Math.ceil(maxU) + PAD * 2;
const dw = Math.max(1, Math.round(cw * scale));
const dh = Math.max(1, Math.round(chh * scale));
const axOut = (maxL + PAD) * scale;
const ayOut = (maxU + PAD) * scale;

metas.forEach((m, idx) => {
  const name = names[idx];
  const out = Buffer.alloc(dw * dh * 4);
  // origin в исходных координатах: левый-верхний угол общего холста
  const ox = m.cx - maxL - PAD;
  const oy = m.c.y1 - maxU - PAD;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const srcX = Math.round(ox + x / scale);
      const srcY = Math.round(oy + y / scale);
      const di = (y * dw + x) * 4;
      if (srcX < 0 || srcX >= W || srcY < 0 || srcY >= H) { out[di + 3] = 0; continue; }
      // берём только пиксели СВОЕЙ сцены, чтобы не затянуть соседнюю
      if (srcX < m.c.x0 || srcX > m.c.x1 || srcY < m.c.y0 || srcY > m.c.y1) { out[di + 3] = 0; continue; }
      const si = srcY * W + srcX;
      if (!solid[si]) { out[di + 3] = 0; continue; }
      const p = si * ch;
      if (isFringe(p)) { out[di + 3] = 0; continue; }   // фиолетовая кайма от фона
      out[di] = data[p]; out[di + 1] = data[p + 1]; out[di + 2] = data[p + 2]; out[di + 3] = 255;
    }
  }
  fs.writeFileSync(path.join(OUT, name + '.png'), encodePNG(dw, dh, out));
  console.log(`  "${name}": { "ax": ${axOut.toFixed(1)}, "ay": ${Math.round(ayOut)}, "baseW": ${dw}, "w": ${dw}, "h": ${dh} },  // общий холст ${dw}x${dh}`);
});
console.log('scenes done', rawStem);
