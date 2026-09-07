// Универсальная нарезка ПОЛОСЫ кадров казахского юнита (gpt image, magenta #ff00ff фон).
// Раскладка любая: фигуры в ряд / сеткой / столбиком — определяем по пустым полосам
// (ряды и колонки без непрозрачных пикселей). Кадры упорядочиваются слева-направо,
// сверху-вниз (чтение). Если фигур больше N — берём N равномерно.
// Масштаб ОБЩИЙ по полосе: эталон — самая НИЗКАЯ фигура (тело без поднятого инструмента),
// её рост → 150px; кадры с поднятым топором/киркой/руками получают холст выше 150
// (инструмент не обрезается), якорем ay = низ кадра, h = 150 (логический рост тела).
// Запуск: node scripts/split-kz-strip.cjs <rawStem> <count> <outName1> <outName2> ...
//   пример: node scripts/split-kz-strip.cjs kz_villager_chop2 2 kz_villager_chop1 kz_villager_chop2
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const RAW = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'units', 'kz', 'raw');
const OUT = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'units', 'kz');
const BODY_H = 150;

const rawStem = process.argv[2];
const count = parseInt(process.argv[3] || '0', 10);
const names = process.argv.slice(4);
if (!rawStem || !count || names.length !== count) {
  console.error('usage: split-kz-strip.cjs <rawStem> <count> <outName1> ...'); process.exit(1);
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
const isMag = (i) => { const r = data[i], g = data[i + 1], b = data[i + 2]; return r > 170 && b > 150 && g < 120 && (r - g) > 80 && (b - g) > 60; };
const solid = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) solid[i] = isMag(i * ch) ? 0 : 1;

// ── связные компоненты (каждая фигура отделена сплошным magenta-фоном) ──
const lbl = new Int32Array(W * H);
const comps = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const idx = y * W + x;
  if (!solid[idx] || lbl[idx]) continue;
  const id = comps.length;
  comps.push({ n: 0, minX: x, maxX: x, minY: y, maxY: y, sx: 0, sy: 0 });
  const stk = [idx]; lbl[idx] = id + 1;
  while (stk.length) {
    const j = stk.pop(); const c = comps[id]; c.n++;
    const jx = j % W, jy = (j / W) | 0; c.sx += jx; c.sy += jy;
    if (jx < c.minX) c.minX = jx; if (jx > c.maxX) c.maxX = jx;
    if (jy < c.minY) c.minY = jy; if (jy > c.maxY) c.maxY = jy;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = jx + dx, ny = jy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const k = ny * W + nx;
      if (solid[k] && !lbl[k]) { lbl[k] = id + 1; stk.push(k); }
    }
  }
}
// отбрасываем мелкий мусор (< 12% площади крупнейшей компоненты)
const maxN = Math.max(...comps.map(c => c.n));
const figs = comps.filter(c => c.n > maxN * 0.12).map(c => ({
  x0: c.minX, x1: c.maxX, y0: c.minY, y1: c.maxY, cx: c.sx / c.n, cy: c.sy / c.n, n: c.n,
}));
// порядок чтения: ряды сверху-вниз (центры на ~одной трети высоты — один ряд), внутри — слева-направо
const fh = figs.length ? Math.max(...figs.map(f => f.y1 - f.y0)) : H;
figs.sort((a, b) => (Math.abs(a.cy - b.cy) < fh * 0.6 ? a.cx - b.cx : a.cy - b.cy));
console.log(`found ${figs.length} figures in ${rawStem} (comps ${comps.length})`);
figs.forEach((f, i) => console.log(`  fig${i}: x[${f.x0}-${f.x1}] y[${f.y0}-${f.y1}] w${f.x1 - f.x0} h${f.y1 - f.y0}`));
let picked = figs;
if (figs.length > count) {
  picked = [];
  for (let i = 0; i < count; i++) picked.push(figs[Math.round(i * (figs.length - 1) / (count - 1))]);
}
if (picked.length < count) { console.error('need', count, 'figures, got', picked.length); process.exit(1); }

// общий масштаб полосы: рост ТЕЛА = медиана высот фигур (у ходьбы все ~равны; у работы
// кадр замаха выше из-за инструмента над головой, но таких 1 из 2 → медиана берёт тело).
const hs = picked.map(f => f.y1 - f.y0 + 1).sort((a, b) => a - b);
const bodyH = hs.length % 2 ? hs[(hs.length - 1) / 2] : (hs[hs.length / 2 - 1] + hs[hs.length / 2]) / 2;
const scale = BODY_H / bodyH;

picked.forEach((f, idx) => {
  const name = names[idx];
  const pad = 3;
  const sx0 = Math.max(0, f.x0 - pad), sx1 = Math.min(W - 1, f.x1 + pad);
  const sy0 = Math.max(0, f.y0 - pad), sy1 = Math.min(H - 1, f.y1 + pad);
  const cw = sx1 - sx0 + 1, chh = sy1 - sy0 + 1;
  // холст = естественная высота фигуры; ноги прижаты к нижней кромке (у всех кадров на
  // одной линии). У замаха холст ВЫШЕ 150 — над головой помещается поднятый инструмент,
  // тело при этом ровно 150 (масштаб общий по медиане роста).
  const dw = Math.max(1, Math.round(cw * scale));
  const dh = Math.max(BODY_H, Math.round(chh * scale));
  const out = Buffer.alloc(dw * dh * 4);
  const bodyScaled = Math.round(chh * scale);
  const outTop = dh - bodyScaled; // 0 для обычных; >0 — если холст выше (страховка)
  const colAt = (x, y) => { const i = (y * W + x) * ch; return [data[i], data[i + 1], data[i + 2]]; };
  for (let dy = 0; dy < dh; dy++) {
    const srcY = dy - outTop; // позиция внутри фигуры (0 — её верх)
    for (let dx = 0; dx < dw; dx++) {
      const o = (dy * dw + dx) * 4;
      if (srcY < 0 || srcY >= chh) { continue; } // запас сверху/нет фигуры — прозрачно
      const sy = sy0 + Math.min(chh - 1, Math.floor((srcY + 0.5) / scale));
      const sx = sx0 + Math.min(cw - 1, Math.floor((dx + 0.5) / scale));
      if (!solid[sy * W + sx]) { continue; }
      const c = colAt(sx, sy); out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
    }
  }
  // чистка magenta/пурпурной каймы по границе с прозрачным (анти-алиас фона):
  // пурпур = и R, и B заметно выше G (у тёплых пикселей фигуры B низкий)
  const isFringe = (o) => {
    const r = out[o], g = out[o + 1], b = out[o + 2];
    return r > g + 28 && b > g + 22;
  };
  // внутренние артефакты чистого magenta (замкнутые внутри фигуры) — удаляем везде
  for (let i = 0; i < dw * dh; i++) { const o = i * 4; if (out[o + 3] === 0) continue;
    if (out[o] > 190 && out[o + 2] > 190 && out[o + 1] < 120) out[o + 3] = 0;
  }
  for (let pass = 0; pass < 4; pass++) { const kill = [];
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) { const o = (y * dw + x) * 4; if (out[o + 3] === 0) continue;
      const ne = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].some(([dx2,dy2]) => { const nx=x+dx2,ny=y+dy2; return nx<0||ny<0||nx>=dw||ny>=dh||out[(ny*dw+nx)*4+3]===0; });
      if (ne && isFringe(o)) kill.push(o);
    }
    for (const o of kill) out[o + 3] = 0;
  }
  // якорь: центр опоры (ступни) — по нижним 12% кадра (зона ног), ay — низ кадра
  let by = -1; for (let y = dh - 1; y >= 0 && by < 0; y--) for (let x = 0; x < dw; x++) if (out[(y * dw + x) * 4 + 3] > 110) { by = y; break; }
  const footTop = Math.max(0, by - Math.round(BODY_H * scale * 0.12));
  let sxv = 0, nn = 0, bx0 = dw, bx1 = 0;
  for (let y = footTop; y <= by; y++) for (let x = 0; x < dw; x++) if (out[(y * dw + x) * 4 + 3] > 110) { sxv += x; nn++; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; }
  // центр: для боковых кадров — по ступням; для анфас/тыл (тело симметрично) — середина холста
  const cent = nn ? sxv / nn : dw / 2;
  const spanC = nn ? (bx0 + bx1) / 2 : dw / 2;
  const footAx = (cent + spanC) / 2;
  const ax = Math.round((process.env.AXMODE === 'center' ? dw / 2 : footAx) * 10) / 10;
  fs.writeFileSync(path.join(OUT, name + '.png'), encodePNG(dw, dh, out));
  console.log(`  "${name}": { "ax": ${ax}, "ay": ${by + 1}, "baseW": ${dw}, "w": ${dw}, "h": 150 },  // canvas ${dw}x${dh}`);
});
console.log('strip done', rawStem);
