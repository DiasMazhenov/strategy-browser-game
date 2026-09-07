// Нарезка полосы кадров, когда под фигурами есть тёмная линия-базлайн (она склеивает
// связные компоненты). Сегментируем по КОЛОНКАМ: столбцы, где почти все пиксели — magenta
// фон (или тёмная линия у нижней кромки), считаются промежутками.
// Запуск: node scripts/split-strip-cols.cjs <rawStem> <count> <outName1> ...
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
  console.error('usage: split-strip-cols.cjs <rawStem> <count> <outName1> ...'); process.exit(1);
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
// тёмная линия-базлайн у нижней кромки кадра (почти чёрные пиксели в нижних 12%)
const isBaseline = (x, y) => y > H * 0.86 && (() => { const i = (y * W + x) * ch; return data[i] < 90 && data[i + 1] < 80 && data[i + 2] < 95; })();
const solid = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  solid[i] = (!isMag(i * ch) && !isBaseline(x, y)) ? 1 : 0;
}
// колонки-«промежутки»: доля solid < 3%
const colSolid = new Float32Array(W);
for (let x = 0; x < W; x++) { let n = 0; for (let y = 0; y < H; y++) n += solid[y * W + x]; colSolid[x] = n / H; }
const isGap = (x) => colSolid[x] < 0.03;
// найти диапазоны фигур
const bands = [];
let x = 0;
while (x < W) {
  while (x < W && isGap(x)) x++;
  if (x >= W) break;
  const x0 = x;
  while (x < W && !isGap(x)) x++;
  const x1 = x - 1;
  // bbox по y
  let y0 = H, y1 = 0;
  for (let yy = 0; yy < H; yy++) for (let xx = x0; xx <= x1; xx++) if (solid[yy * W + xx]) { if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
  if (x1 - x0 + 1 >= 24) bands.push({ x0, x1, y0, y1 });
}
console.log(`found ${bands.length} bands in ${rawStem}`);
bands.forEach((b, i) => console.log(`  band${i}: x[${b.x0}-${b.x1}] y[${b.y0}-${b.y1}]`));
if (bands.length !== count) { console.error('band count mismatch'); process.exit(1); }

const hs = bands.map(b => b.y1 - b.y0 + 1).sort((a, b) => a - b);
const bodyH = hs.length % 2 ? hs[(hs.length - 1) / 2] : (hs[hs.length / 2 - 1] + hs[hs.length / 2]) / 2;
const scale = BODY_H / bodyH;

bands.forEach((f, idx) => {
  const name = names[idx];
  const pad = 3;
  const sx0 = Math.max(0, f.x0 - pad), sx1 = Math.min(W - 1, f.x1 + pad);
  const sy0 = Math.max(0, f.y0 - pad), sy1 = Math.min(H - 1, f.y1 + pad);
  const cw = sx1 - sx0 + 1, chh = sy1 - sy0 + 1;
  const dw = Math.max(1, Math.round(cw * scale));
  const dh = Math.max(BODY_H, Math.round(chh * scale));
  const out = Buffer.alloc(dw * dh * 4);
  const bodyScaled = Math.round(chh * scale);
  const outTop = dh - bodyScaled;
  const colAt = (xx, yy) => { const i = (yy * W + xx) * ch; return [data[i], data[i + 1], data[i + 2]]; };
  for (let dy = 0; dy < dh; dy++) {
    const srcY = dy - outTop;
    for (let dx = 0; dx < dw; dx++) {
      const o = (dy * dw + dx) * 4;
      if (srcY < 0 || srcY >= chh) continue;
      const sy = sy0 + Math.min(chh - 1, Math.floor((srcY + 0.5) / scale));
      const sxp = sx0 + Math.min(cw - 1, Math.floor((dx + 0.5) / scale));
      if (!solid[sy * W + sxp]) continue;
      const c = colAt(sxp, sy); out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
    }
  }
  const isFringe = (o) => { const r = out[o], g = out[o + 1], b = out[o + 2]; return r > g + 28 && b > g + 22; };
  for (let i = 0; i < dw * dh; i++) { const o = i * 4; if (out[o + 3] === 0) continue;
    if (out[o] > 190 && out[o + 2] > 190 && out[o + 1] < 120) out[o + 3] = 0;
  }
  for (let pass = 0; pass < 4; pass++) { const kill = [];
    for (let y = 0; y < dh; y++) for (let xx = 0; xx < dw; xx++) { const o = (y * dw + xx) * 4; if (out[o + 3] === 0) continue;
      const ne = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].some(([dx2,dy2]) => { const nx=xx+dx2,ny=y+dy2; return nx<0||ny<0||nx>=dw||ny>=dh||out[(ny*dw+nx)*4+3]===0; });
      if (ne && isFringe(o)) kill.push(o);
    }
    for (const o of kill) out[o + 3] = 0;
  }
  let by = -1; for (let y = dh - 1; y >= 0 && by < 0; y--) for (let xx = 0; xx < dw; xx++) if (out[(y * dw + xx) * 4 + 3] > 110) { by = y; break; }
  const footTop = Math.max(0, by - Math.round(BODY_H * 0.14));
  let sxv = 0, nn = 0;
  for (let y = footTop; y <= by; y++) for (let xx = 0; xx < dw; xx++) if (out[(y * dw + xx) * 4 + 3] > 110) { sxv += xx; nn++; }
  const ax = Math.round((nn ? sxv / nn : dw / 2) * 10) / 10;
  fs.writeFileSync(path.join(OUT, name + '.png'), encodePNG(dw, dh, out));
  console.log(`  "${name}": { "ax": ${ax}, "ay": ${by + 1}, "baseW": ${dw}, "w": ${dw}, "h": 150 },  // canvas ${dw}x${dh}`);
});
console.log('cols strip done', rawStem);
