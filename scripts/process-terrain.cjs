// Обработка AI-спрайтов рельефа (горы/холмы): src/assets/sprites/terrain/raw/<name>.png → terrain/<name>.png
// magenta-кеинг flood-fill → крупнейшая компонента → кроп → nearest-neighbor до ЦЕЛЕВОЙ ширины →
// чистка пурпурной каймы. Якорь посадки — низ-центр (основание на центр клетки).
// Запуск: node scripts/process-terrain.cjs
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const RAW = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'terrain', 'raw');
const OUT = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'terrain');
const TARGET_W = { hill_grass: 124, hill_rock: 128 };
const TARGET_H = { peak_snow: 128, peak_rock: 118 };
const MAXH = 200;

function decodePNG(file) {
  const data = fs.readFileSync(file);
  let pos = 8, idat = Buffer.alloc(0), W = 0, H = 0, ct = 0;
  while (pos < data.length) {
    const ln = data.readUInt32BE(pos), typ = data.slice(pos + 4, pos + 8).toString();
    const chunk = data.slice(pos + 8, pos + 8 + ln);
    if (typ === 'IHDR') { W = chunk.readUInt32BE(0); H = chunk.readUInt32BE(4); ct = chunk[9]; }
    else if (typ === 'IDAT') idat = Buffer.concat([idat, chunk]);
    pos += 12 + ln;
  }
  const ch = ct === 6 ? 4 : 3, raw = zlib.inflateSync(idat);
  const stride = W * ch, out = Buffer.alloc(H * stride);
  let p = 0; const prev = Buffer.alloc(stride);
  for (let y = 0; y < H; y++) {
    const f = raw[p++], line = raw.slice(p, p + stride); p += stride; const cur = Buffer.from(line);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if (f === 1) cur[x] = (cur[x] + a) & 255;
      else if (f === 2) cur[x] = (cur[x] + b) & 255;
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

function process(name) {
  const file = path.join(RAW, name + '.png');
  if (!fs.existsSync(file)) { console.log('skip', name); return; }
  const { W, H, ch, data } = decodePNG(file);
  const px = (x, y) => { const i = (y * W + x) * ch; return [data[i], data[i + 1], data[i + 2]]; };
  const isMag = (c) => { const mn = Math.min(c[0], c[2]); return c[0] > 60 && c[2] > 70 && c[1] < mn - 22 && Math.abs(c[0] - c[2]) < 70; };
  const isHotMag = (c) => c[0] > 140 && c[2] > 140 && c[1] < 115 && Math.abs(c[0] - c[2]) < 55;
  const bg = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (isHotMag(px(i % W, (i / W) | 0))) bg[i] = 1;
  const stack = [];
  const push = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; if (!bg[i] && isMag(px(x, y))) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x += 2) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y += 2) { push(0, y); push(W - 1, y); }
  while (stack.length) { const i = stack.pop(); const x = i % W, y = (i / W) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  // крупнейшая связная компонента
  const lbl = new Int32Array(W * H); const sizes = [0]; const stk = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const idx = y * W + x; if (bg[idx] || lbl[idx]) continue;
    const id = sizes.length; sizes.push(0); stk.length = 0; stk.push(idx); lbl[idx] = id;
    while (stk.length) { const j = stk.pop(); sizes[id]++; const jx = j % W, jy = (j / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = jx + dx, ny = jy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const k = ny * W + nx; if (!bg[k] && !lbl[k]) { lbl[k] = id; stk.push(k); } } }
  }
  let best = 1; for (let i = 2; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  const solid = (x, y) => lbl[y * W + x] === best;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (solid(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
  // фундамент: широчайшая непрозрачная строка в нижних 40%
  let baseW = 0, axCrop = (x0 + x1) / 2;
  const bandTop = y1 - Math.round(chh * 0.4);
  for (let y = bandTop; y <= y1; y++) { let l = W, r = -1; for (let x = x0; x <= x1; x++) if (solid(x, y)) { if (x < l) l = x; if (x > r) r = x; } if (r - l + 1 > baseW) { baseW = r - l + 1; axCrop = (l + r) / 2; } }
  // nearest-neighbor до целевой ширины (холмы) или высоты (пики — высокие)
  let scale;
  if (TARGET_H[name]) scale = TARGET_H[name] / chh;
  else scale = (TARGET_W[name] || 120) / cw;
  if (Math.round(chh * scale) > MAXH) scale = MAXH / chh;
  const dw = Math.round(cw * scale), dh = Math.round(chh * scale);
  const dst = Buffer.alloc(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) for (let dx = 0; dx < dw; dx++) {
    const sx = x0 + Math.floor(dx / scale), sy = y0 + Math.floor(dy / scale);
    const di = (dy * dw + dx) * 4;
    if (solid(sx, sy)) { const si = (sy * W + sx) * ch; dst[di] = data[si]; dst[di + 1] = data[si + 1]; dst[di + 2] = data[si + 2]; dst[di + 3] = 255; }
    else dst[di + 3] = 0;
  }
  // удаление пурпурной/магентовой каймы по контуру (антиалиас с фоном): убираем
  // краевые пиксели с преобладанием R&B над G — 5 проходов, чтобы съело бахрому
  const magFringe = (r, g, b) => {
    if (r > 150 && b > 150 && g < 150 && (r - g) > 40 && (b - g) > 40) return true; // яркая магента
    if (r > 70 && b > 70 && (r - g) > 26 && (b - g) > 26 && g < 110) return true;    // тёмный пурпур
    return false;
  };
  for (let pass = 0; pass < 5; pass++) {
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const i = (y * dw + x) * 4; if (dst[i + 3] === 0) continue;
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= dw || ny >= dh || dst[(ny * dw + nx) * 4 + 3] === 0) { edge = true; break; } }
      if (edge && magFringe(dst[i], dst[i + 1], dst[i + 2])) dst[i + 3] = 0;
    }
  }
  // глобально вырезаем яркие магента-пиксели в любом месте (остатки фона внутри силуэта)
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const i = (y * dw + x) * 4; if (dst[i + 3] === 0) continue;
    if (dst[i] > 165 && dst[i + 2] > 165 && dst[i + 1] < 150 && Math.abs(dst[i] - dst[i + 2]) < 60) dst[i + 3] = 0;
  }
  // деспилл: у оставшихся контурных пикселей гасим избыток пурпура (подтягиваем G к min(R,B))
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const i = (y * dw + x) * 4; if (dst[i + 3] === 0) continue;
    let edge = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= dw || ny >= dh || dst[(ny * dw + nx) * 4 + 3] === 0) { edge = true; break; } }
    if (edge) { const mn = Math.min(dst[i], dst[i + 2]); if (dst[i + 1] < mn - 10) dst[i + 1] = mn - 10; }
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name + '.png'), encodePNG(dw, dh, dst));
  console.log(`${name}: ${dw}x${dh}, anchor ax=${((axCrop - x0) * scale).toFixed(0)} ay=${((y1 - y0) * scale).toFixed(0)} baseW=${Math.round(baseW * scale)}`);
}

for (const k of new Set([...Object.keys(TARGET_W), ...Object.keys(TARGET_H)])) process(k);
