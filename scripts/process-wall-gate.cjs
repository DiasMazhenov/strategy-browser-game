// Обработка AI-спрайтов казахских СТЕН и ВОРОТ:
// src/assets/sprites/kz/raw/kz_wall_raw.png / kz_gate_raw.png (с magenta-фоном)
// 1) декод PNG  2) вырезка сплошного magenta-фона flood-fill от краёв
// 3) крупнейшая связная компонента (отсекает тень/мусор на фоне)
// 4) обрезка по bbox  5) box-average даунскейл до целевой высоты
// 6) RGBA PNG в ../kz_wall.png / ../kz_gate.png  7) печать размеров/baseW
// Запуск: node scripts/process-wall-gate.cjs
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const RAW = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'kz', 'raw');
const OUT = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'kz');

// целевая высота готового спрайта (px)
const TARGET_H = { kz_wall: 200, kz_gate: 250 };

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
  const ch = ct === 6 ? 4 : ct === 4 ? 2 : 3;
  const raw = zlib.inflateSync(idat);
  const stride = W * ch, out = Buffer.alloc(H * stride);
  let p = 0; const prev = Buffer.alloc(stride);
  for (let y = 0; y < H; y++) {
    const f = raw[p++];
    const line = raw.slice(p, p + stride); p += stride; const cur = Buffer.from(line);
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
  const file = path.join(RAW, name + '_raw.png');
  if (!fs.existsSync(file)) { console.log('skip (missing)', name); return; }
  let { W, H, ch, data } = decodePNG(file);
  const px = (x, y) => { const i = (y * W + x) * ch; return [data[i], data[i + 1], data[i + 2]]; };
  // magenta-фон/ключ: R высокий, B высокий, G низкий. Удаляем ВЕЗДЕ (не только
  // связанный с краем фон), т.к. под аркой/в просветах тоже magenta.
  // magenta-ключ (в т.ч. ТЁМНАЯ тень фона под аркой): R и B высокие И БЛИЗКИЕ друг
  // к другу, оба заметно выше G. Коричневая кладка/тёмный проём не триггерят (там B низкий).
  const isMag = (c) => c[0] > 95 && c[2] > 88 && Math.abs(c[0] - c[2]) < 60 &&
    c[1] < c[0] * 0.62 && c[1] < c[2] * 0.62 && (c[0] - c[1]) > 40 && (c[2] - c[1]) > 40;
  // карта непрозрачных (всё, что не magenta)
  const solid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const x = i % W, y = (i / W) | 0; solid[i] = isMag(px(x, y)) ? 0 : 1; }
  // крупнейшая связная компонента
  const lab = new Int32Array(W * H).fill(-1);
  let best = -1, bestN = 0;
  for (let i = 0; i < W * H; i++) {
    if (!solid[i] || lab[i] >= 0) continue;
    const id = bestN; // unique-ish
    let n = 0; const st = [i]; lab[i] = id;
    while (st.length) { const j = st.pop(); n++; const x = j % W, y = (j / W) | 0;
      const nb = [j + 1, j - 1, j + W, j - W];
      for (const k of nb) { const kx = k % W; if (k < 0 || k >= W * H) continue; if (Math.abs(kx - x) > 1) continue; if (solid[k] && lab[k] < 0) { lab[k] = id; st.push(k); } } }
    if (n > bestN) { bestN = n; best = id; }
  }
  // bbox крупнейшей компоненты
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (lab[i] === best) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
  // box-average даунскейл до TARGET_H
  const TH = TARGET_H[name];
  const scale = TH / chh;
  const TW = Math.round(cw * scale);
  const out = Buffer.alloc(TW * TH * 4);
  for (let oy = 0; oy < TH; oy++) {
    const sy0 = y0 + Math.floor(oy / scale), sy1 = Math.max(sy0 + 1, y0 + Math.floor((oy + 1) / scale));
    for (let ox = 0; ox < TW; ox++) {
      const sx0 = x0 + Math.floor(ox / scale), sx1 = Math.max(sx0 + 1, x0 + Math.floor((ox + 1) / scale));
      let r = 0, g = 0, b = 0, a = 0, n = 0, cn = 0;
      for (let yy = sy0; yy < sy1; yy++) for (let xx = sx0; xx < sx1; xx++) {
        const i = (yy * W + xx);
        const keep = lab[i] === best && solid[i] ? 1 : 0;
        a += keep; n++;
        if (keep) { const c = px(xx, yy); r += c[0]; g += c[1]; b += c[2]; cn++; }
      }
      const o = (oy * TW + ox) * 4;
      // цвет усредняем ТОЛЬКО по непрозрачным пикселям (иначе magenta-бахрома тонирует кромку);
      // альфа = доля непрозрачных в ячейке
      out[o] = cn ? r / cn : 0; out[o + 1] = cn ? g / cn : 0; out[o + 2] = cn ? b / cn : 0;
      out[o + 3] = Math.round((a / n) * 255);
    }
  }
  fs.writeFileSync(path.join(OUT, name + '.png'), encodePNG(TW, TH, out));
  console.log(name, `${TW}x${TH}`, 'baseW=' + TW, 'ax=' + Math.round(TW / 2), 'ay=' + TH);
}

process('kz_wall');
process('kz_gate');
