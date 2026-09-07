// Уменьшение портретов правителей до 256×256 (чистый JS, bilinear), лёгкие PNG.
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const DIR = path.join(__dirname, '..', 'src', 'assets', 'portraits');
const OUT = 256;

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

for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith('.png')) continue;
  const fp = path.join(DIR, f);
  const { W, H, ch, data } = decodePNG(fp);
  if (W === OUT && H === OUT) continue;
  // кроп в квадрат: центр по X; для вертикальных кадров лицо в верхней трети — берём чуть выше центра
  const side = Math.min(W, H);
  const cx0 = Math.floor((W - side) / 2);
  const cy0 = H > W ? Math.floor((H - side) * 0.28) : Math.floor((H - side) / 2);
  const out = Buffer.alloc(OUT * OUT * 4);
  const at = (x, y, k) => { const xx = cx0 + Math.min(side - 1, Math.max(0, x)), yy = cy0 + Math.min(side - 1, Math.max(0, y)); return data[(yy * W + xx) * ch + k]; };
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    const sx = (x + 0.5) * side / OUT - 0.5, sy = (y + 0.5) * side / OUT - 0.5;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    const o = (y * OUT + x) * 4;
    for (let k = 0; k < 3; k++) {
      const v = at(x0, y0, k) * (1 - fx) * (1 - fy) + at(x0 + 1, y0, k) * fx * (1 - fy)
              + at(x0, y0 + 1, k) * (1 - fx) * fy + at(x0 + 1, y0 + 1, k) * fx * fy;
      out[o + k] = Math.round(v);
    }
    out[o + 3] = ch === 4 ? Math.round(at(x0, y0, 3) * (1 - fx) * (1 - fy) + at(x0 + 1, y0, 3) * fx * (1 - fy) + at(x0, y0 + 1, 3) * (1 - fx) * fy + at(x0 + 1, y0 + 1, 3) * fx * fy) : 255;
  }
  fs.writeFileSync(fp, encodePNG(OUT, OUT, out));
  console.log('resized', f, `${W}x${H} -> ${OUT}x${OUT}`);
}
