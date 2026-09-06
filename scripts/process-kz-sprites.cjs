// Обработка AI-спрайтов казахской расы (src/assets/sprites/units/kz/raw/*_raw.png):
// 1) декод PNG (8-bit RGB/RGBA)
// 2) вырезка сплошного magenta-фона (#ff00ff) flood-fill от краёв по цветовой дистанции
// 3) оставляем крупнейшую связную компоненту (силуэт), мелочь удаляем
// 4) обрезка по bbox
// 5) уменьшение до целевой высоты: nearest-neighbor (чёткий пиксель-арт, без полос)
// 6) чистка magenta-бахромы, кодирование RGBA PNG в ../<name>.png
// 7) печать якорей (ax — центр опоры по нижнему ряду, ay — низ) для sprite-art.ts
// Запуск: node scripts/process-kz-sprites.cjs
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const RAW = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'units', 'kz', 'raw');
const OUT = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'units', 'kz');

// целевая высота кропа (как у штатных спрайтов)
const TARGET_H = {
  kz_villager: 150, kz_swordsman: 150, kz_archer: 150, kz_spearman: 150,
  kz_knight: 128, kz_cavalry: 150, kz_catapult: 81, kz_monk: 150,
};

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
    const f = raw[p++];
    const line = raw.slice(p, p + stride); p += stride;
    const cur = Buffer.from(line);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if (f === 1) cur[x] = (cur[x] + a) & 255;
      else if (f === 2) cur[x] = (cur[x] + b) & 255;
      else if (f === 3) cur[x] = (cur[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        cur[x] = (cur[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
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
  const file = path.join(RAW, name + '_raw.png');
  if (!fs.existsSync(file)) { console.log('skip (missing)', name); return; }
  let { W, H, ch, data } = decodePNG(file);
  const px = (x, y) => { const i = (y * W + x) * ch; return [data[i], data[i + 1], data[i + 2]]; };
  // magenta-фон: R высокий, B высокий, G низкий
  const isMag = (c) => c[0] > 170 && c[2] > 150 && c[1] < 120 && (c[0] - c[1]) > 80 && (c[2] - c[1]) > 60;
  const bg = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; if (!bg[i] && isMag(px(x, y))) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x += 2) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y += 2) { push(0, y); push(W - 1, y); }
  while (stack.length) { const i = stack.pop(); const x = i % W, y = (i / W) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  // крупнейшая связная компонента непрозрачного
  const lbl = new Int32Array(W * H); const sizes = [0]; const stk = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const idx = y * W + x; if (bg[idx] || lbl[idx]) continue;
    const id = sizes.length; sizes.push(0); stk.length = 0; stk.push(idx); lbl[idx] = id;
    while (stk.length) { const j = stk.pop(); sizes[id]++; const jx = j % W, jy = (j / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = jx + dx, ny = jy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const k = ny * W + nx; if (!bg[k] && !lbl[k]) { lbl[k] = id; stk.push(k); } } }
  }
  let best = 1; for (let i = 2; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  for (let i = 0; i < W * H; i++) if (!bg[i] && lbl[i] !== best) bg[i] = 1;
  // bbox
  let x0 = W, y0 = H, x1 = 0, y1 = 0, found = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!bg[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; found = true; };
  if (!found) throw new Error('nothing for ' + name);
  const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
  const targetH = TARGET_H[name] ?? 150;
  const scale = targetH / chh;
  const dw = Math.max(1, Math.round(cw * scale)), dh = targetH;
  // nearest-neighbor (с учётом альфы по bg-карте)
  const out = Buffer.alloc(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    const sy = y0 + Math.min(chh - 1, Math.floor((dy + 0.5) / scale));
    for (let dx = 0; dx < dw; dx++) {
      const sx = x0 + Math.min(cw - 1, Math.floor((dx + 0.5) / scale));
      const o = (dy * dw + dx) * 4;
      if (bg[sy * W + sx]) { out[o + 3] = 0; continue; }
      const c = px(sx, sy);
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
    }
  }
  // 1) удаляем ВСЕ magenta-ish пиксели (и фон, и внутренние зазоры между рукой/оружием/телом):
  //    на персонаже нет чистого magenta (R,B высокие, G сильно ниже) — красная одежда имеет низкий B.
  for (let i = 0; i < dw * dh; i++) {
    const o = i * 4; if (out[o + 3] === 0) continue;
    if (out[o] > 150 && out[o + 2] > 140 && out[o + 1] < out[o] - 40 && out[o + 1] < out[o + 2] - 30) out[o + 3] = 0;
  }
  // 2) контурная кайма: полупрозрачные/тёмно-фиолетовые пиксели у прозрачной кромки
  for (let pass = 0; pass < 2; pass++) {
    const kill = [];
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const o = (y * dw + x) * 4; if (out[o + 3] === 0) continue;
      const nearEmpty = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => { const nx=x+dx,ny=y+dy; return nx<0||ny<0||nx>=dw||ny>=dh||out[(ny*dw+nx)*4+3]===0; });
      if (!nearEmpty) continue;
      // пурпурная кайма (остатки magenta-фона): R и B высокие и близки, G сильно ниже;
      // красная одежда не трогается (у неё B заметно меньше R)
      if (out[o] > 120 && out[o + 2] > 120 && Math.abs(out[o] - out[o + 2]) < 70 && out[o + 1] < (out[o] + out[o + 2]) / 2 - 40) kill.push(o);
    }
    for (const o of kill) out[o + 3] = 0;
  }
  fs.writeFileSync(path.join(OUT, name + '.png'), encodePNG(dw, dh, out));
  // якорь: ay = самый низкий непрозрачный ряд (подошвы/копыта);
  // ax = средний X непрозрачных пикселей нижней полосы (последние ~8 рядов) — центр опоры
  let by = -1; for (let y = dh - 1; y >= 0 && by < 0; y--) for (let x = 0; x < dw; x++) if (out[(y * dw + x) * 4 + 3] > 110) { by = y; break; }
  let sx = 0, n = 0;
  for (let y = Math.max(0, by - 8); y <= by; y++) for (let x = 0; x < dw; x++) if (out[(y * dw + x) * 4 + 3] > 110) { sx += x; n++; }
  const ax = Math.round((n ? sx / n : dw / 2) * 10) / 10;
  console.log(`  "${name}": { "ax": ${ax}, "ay": ${by + 1}, "baseW": ${dw}, "w": ${dw}, "h": ${dh} },`);
}

const names = Object.keys(TARGET_H);
for (const n of names) process(n);
console.log('done');
