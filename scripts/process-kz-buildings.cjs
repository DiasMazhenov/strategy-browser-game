// Обработка AI-спрайтов зданий казахской расы: src/assets/sprites/kz/raw/kz_<key>_raw.png → kz/<key>.png
// magenta-кеинг flood-fill → крупнейшая компонента → удаление тёмной тени-диска под основанием →
// кроп → обмер изо-фундамента → nearest-neighbor до ЦЕЛЕВОЙ ширины фундамента (как у штатных зданий) →
// чистка каймы → якори для sprite-art.ts. Запуск: node scripts/process-kz-buildings.cjs
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const RAW = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'kz', 'raw');
const OUT = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'kz');
// целевая ширина изо-фундамента (baseW) — как у штатных зданий, чтобы посадка/коллизии совпадали
const TARGET_BASEW = {
  towncenter: 307, house: 347, barracks: 364, tower: 153,
  farm: 370, stable: 379, market: 360, blacksmith: 370,
};
const MAXDIM = 380;

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

// обмер фундамента: самая широкая непрозрачная строка в нижних 45% (как в build-sprites.cjs)
function measureFooting(buf, W, H) {
  const op = (x, y) => buf[(y * W + x) * 4 + 3] > 40;
  let bottom = -1;
  for (let y = H - 1; y >= 0; y--) { let n = 0; for (let x = 0; x < W; x++) if (op(x, y)) n++; if (n >= 2) { bottom = y; break; } }
  if (bottom < 0) return { ax: W / 2, ay: H - 1, baseW: W };
  const bandTop = Math.round(bottom - bottom * 0.45);
  let bestW = 0, ax = W / 2;
  for (let y = bandTop; y <= bottom; y++) {
    let l = W, r = -1; for (let x = 0; x < W; x++) if (op(x, y)) { if (x < l) l = x; if (x > r) r = x; }
    if (r - l + 1 > bestW) { bestW = r - l + 1; ax = (l + r) / 2; }
  }
  return { ax, ay: bottom, baseW: bestW };
}

function process(key) {
  const file = path.join(RAW, `kz_${key}_raw.png`);
  if (!fs.existsSync(file)) { console.log('skip', key); return; }
  let { W, H, ch, data } = decodePNG(file);
  const px = (x, y) => { const i = (y * W + x) * ch; return [data[i], data[i + 1], data[i + 2]]; };
  // magenta/пурпур фона (включая тёмно-пурпурный ромб-подложку и кайму): R и B высокие и близкие, G заметно ниже
  const isMag = (c) => { const mn = Math.min(c[0], c[2]); return c[0] > 60 && c[2] > 70 && c[1] < mn - 22 && Math.abs(c[0] - c[2]) < 70; };
  const isPurp = (c) => { const mn = Math.min(c[0], c[2]); return c[0] > 12 && c[2] > 12 && c[1] < mn - 12 && Math.abs(c[0] - c[2]) < 45; };
  const isHotMag = (c) => c[0] > 140 && c[2] > 140 && c[1] < 115 && Math.abs(c[0] - c[2]) < 55;
  // маска фона (magenta): сначала глобально вырезаем яркую заливку, застрявшую внутри силуэта (двор/ниша)
  const bg = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { if (isHotMag(px(i % W, (i / W) | 0))) bg[i] = 1; }
  // затем flood-fill от краёв для остальной magenta/пурпурной подложки
  const stack = [];
  const push = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; if (!bg[i] && isMag(px(x, y))) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x += 2) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y += 2) { push(0, y); push(W - 1, y); }
  while (stack.length) { const i = stack.pop(); const x = i % W, y = (i / W) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  // удалить тёмный диск-тень под основанием: это ТОЛСТАЯ тёмная масса, связанная с кромкой кадра.
  // тонкий чёрный контур/орнамент отсеиваем эрозией (r=2), затем заливкой от краёв, затем возвращаем кромку дилатацией.
  const N = W * H, R = 2;
  const darkMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) { if (bg[i]) continue; const x = i % W, y = (i / W) | 0, c = px(x, y);
    if (Math.max(c[0], c[1], c[2]) < 78) darkMask[i] = 1; }
  const er = new Uint8Array(N);
  for (let y = R; y < H - R; y++) for (let x = R; x < W - R; x++) {
    const i = y * W + x; let ok = true;
    for (let dy = -R; dy <= R && ok; dy++) for (let dx = -R; dx <= R; dx++)
      if (!darkMask[(y + dy) * W + (x + dx)]) { ok = false; break; }
    er[i] = ok ? 1 : 0;
  }
  const core = new Uint8Array(N); const st2 = [];
  const pushC = (i) => { if (er[i] && !core[i]) { core[i] = 1; st2.push(i); } };
  // семена — эрозированные тёмные пиксели в пограничной полосе (толстая тень у кромки кадра)
  for (let x = 0; x < W; x++) for (let y = 0; y <= R + 1; y++) { pushC(y * W + x); pushC((H - 1 - y) * W + x); }
  for (let y = 0; y < H; y++) for (let x = 0; x <= R + 1; x++) { pushC(y * W + x); pushC(y * W + (W - 1 - x)); }
  while (st2.length) { const i = st2.pop(); const x = i % W, y = (i / W) | 0;
    pushC(x + 1, y); pushC(x - 1, y); pushC(x, y + 1); pushC(x, y - 1); }
  for (let i = 0; i < N; i++) { if (bg[i] || !darkMask[i]) continue;
    const x = i % W, y = (i / W) | 0; let hit = false;
    for (let dy = -R; dy <= R && !hit; dy++) for (let dx = -R; dx <= R; dx++)
      if (core[(y + dy < 0 ? 0 : y + dy >= H ? H - 1 : y + dy) * W + (x + dx < 0 ? 0 : x + dx >= W ? W - 1 : x + dx)]) { hit = true; break; }
    if (hit) bg[i] = 1;
  }
  // крупнейшая связная компонента
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
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!bg[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
  // обмер фундамента на кропнутом (в координатах кропа)
  const cropMask = new Uint8Array(cw * chh);
  for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) cropMask[y * cw + x] = bg[(y0 + y) * W + (x0 + x)] ? 0 : 1;
  const tmp = Buffer.alloc(cw * chh * 4);
  for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
    const o = (y * cw + x) * 4;
    if (!cropMask[y * cw + x]) { tmp[o + 3] = 0; continue; }
    const c = px(x0 + x, y0 + y); tmp[o] = c[0]; tmp[o + 1] = c[1]; tmp[o + 2] = c[2]; tmp[o + 3] = 255;
  }
  const foot = measureFooting(tmp, cw, chh);
  const targetBase = TARGET_BASEW[key] ?? 360;
  let scale = targetBase / foot.baseW;
  if (Math.max(cw, chh) * scale > MAXDIM) scale = MAXDIM / Math.max(cw, chh);
  const dw = Math.round(cw * scale), dh = Math.round(chh * scale);
  const out = Buffer.alloc(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    const sy = Math.min(chh - 1, Math.floor((dy + 0.5) / scale));
    for (let dx = 0; dx < dw; dx++) {
      const sx = Math.min(cw - 1, Math.floor((dx + 0.5) / scale));
      const o = (dy * dw + dx) * 4;
      if (!cropMask[sy * cw + sx]) { out[o + 3] = 0; continue; }
      const c = px(x0 + sx, y0 + sy); out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
    }
  }
  const cbuf = (i) => [out[i * 4], out[i * 4 + 1], out[i * 4 + 2], out[i * 4 + 3]];
  // глобально вырезаем ЯРКУЮ magenta, застрявшую внутри силуэта (залитый фоном двор/ниша) — такого цвета в постройках нет
  for (let i = 0; i < dw * dh; i++) { const o = i * 4; if (out[o + 3] === 0) continue;
    if (isHotMag([out[o], out[o + 1], out[o + 2]])) out[o + 3] = 0; }
  // чистка пурпурной каймы: 3 прохода эрозии — пурпурный пиксель рядом с прозрачным удаляется (внутренние фиолетовые детали не трогаем)
  for (let pass = 0; pass < 3; pass++) {
    const kill = new Uint8Array(dw * dh);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const i = y * dw + x, o = i * 4; if (out[o + 3] === 0) continue;
      if (!isPurp(cbuf(i))) continue;
      let nearBg = false;
      for (let dy = -1; dy <= 1 && !nearBg; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= dw || ny >= dh || out[(ny * dw + nx) * 4 + 3] === 0) nearBg = true;
      }
      if (nearBg) kill[i] = 1;
    }
    for (let i = 0; i < dw * dh; i++) if (kill[i]) out[i * 4 + 3] = 0;
  }
  // финальная чистка пыли: удаляем мелкие оторванные непрозрачные компоненты (<8 px) на выводе
  {
    const seen2 = new Uint8Array(dw * dh), dust = new Uint8Array(dw * dh);
    for (let i = 0; i < dw * dh; i++) {
      if (out[i * 4 + 3] === 0 || seen2[i]) continue;
      const comp = []; const qq = [i]; seen2[i] = 1;
      while (qq.length) { const j = qq.pop(); comp.push(j); const cx = j % dw, cy = (j / dw) | 0;
        for (const [ddx, ddy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = cx + ddx, ny = cy + ddy;
          if (nx < 0 || ny < 0 || nx >= dw || ny >= dh) continue; const k = ny * dw + nx;
          if (!seen2[k] && out[k * 4 + 3] !== 0) { seen2[k] = 1; qq.push(k); } } }
      if (comp.length < 8) for (const j of comp) dust[j] = 1;
    }
    for (let i = 0; i < dw * dh; i++) if (dust[i]) out[i * 4 + 3] = 0;
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `kz_${key}.png`), encodePNG(dw, dh, out));
  const m = measureFooting(out, dw, dh);
  console.log(`  "kz_${key}": { "ax": ${+m.ax.toFixed(1)}, "ay": ${m.ay}, "baseW": ${m.baseW}, "w": ${dw}, "h": ${dh} },`);
}

['towncenter', 'house', 'barracks', 'tower', 'farm', 'stable', 'market', 'blacksmith'].forEach(process);
console.log('done');
