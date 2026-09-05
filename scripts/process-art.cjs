// Одноразовый пост-процессор сгенерированных спрайтов:
// 1) декодирует PNG (RGB/RGBA, 8-bit)
// 2) убирает запечённый фон (шахматка/белый) — flood fill от краёв по палитре фона
// 3) доедает мягкие тени у силуэта, не трогая чёрный контур
// 4) обрезает по содержимому и уменьшает box-average до целевой высоты
// 5) кодирует обратно PNG (RGBA, filter 0)
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

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
  const stride = W * ch;
  const out = Buffer.alloc(H * stride);
  let p = 0;
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < H; y++) {
    const f = raw[p++];
    const line = raw.slice(p, p + stride); p += stride;
    const cur = Buffer.from(line);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      if (f === 1) cur[x] = (cur[x] + a) & 255;
      else if (f === 2) cur[x] = (cur[x] + b) & 255;
      else if (f === 3) cur[x] = (cur[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        cur[x] = (cur[x] + pr) & 255;
      }
    }
    cur.copy(out, y * stride);
    cur.copy(prev);
  }
  return { W, H, ch, data: out };
}

function encodePNG(W, H, rgba) {
  const stride = W * 4;
  const raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const comp = zlib.deflateSync(raw, { level: 9 });
  const chunk = (typ, body) => {
    const b = Buffer.alloc(12 + body.length);
    b.writeUInt32BE(body.length, 0);
    b.write(typ, 4);
    body.copy(b, 8);
    const crc = crc32(Buffer.concat([Buffer.from(typ), body]));
    b.writeUInt32BE(crc, 8 + body.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', comp), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const CRC_T = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_T[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function process(job) {
  const src = path.join('src/assets/sprites', job.f);
  let { W, H, ch, data } = decodePNG(src);
  // предобрезка прямоугольником (доли от 0..1) — например, средний кусок длинной стены
  if (job.crop) {
    const c = job.crop;
    const x0 = Math.round(W * c[0]), x1 = Math.round(W * c[1]);
    const y0 = c[2] != null ? Math.round(H * c[2]) : 0, y1 = c[3] != null ? Math.round(H * c[3]) : H;
    const nw = x1 - x0, nh = y1 - y0;
    const nd = Buffer.alloc(nw * nh * ch);
    for (let y = 0; y < nh; y++) data.copy(nd, y * nw * ch, (y0 + y) * W * ch + x0 * ch, (y0 + y) * W * ch + x1 * ch);
    W = nw; H = nh; data = nd;
  }
  const px = (x, y) => { const i = (y * W + x) * ch; return [data[i], data[i + 1], data[i + 2]]; };
  const dist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

  // палитра фона: усреднённые цвета четырёх угловых блоков (в углах гарантированно фон)
  const palette = [];
  const corner = (cx, cy) => {
    let r = 0, g = 0, b = 0, n = 0;
    const R = 24;
    for (let y = cy; y < cy + R; y++) for (let x = cx; x < cx + R; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const c = px(x, y); r += c[0]; g += c[1]; b += c[2]; n++;
    }
    palette.push([Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
  };
  corner(2, 2); corner(W - 26, 2); corner(2, H - 26); corner(W - 26, H - 26);
  const isBgColor = (c) => { for (const p of palette) if (dist(c, p) < job.tol) return true; return false; };

  // flood fill от границ
  const bg = new Uint8Array(W * H);
  const stack = [];
  const tryPush = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const idx = y * W + x;
    if (bg[idx]) return;
    if (isBgColor(px(x, y))) { bg[idx] = 1; stack.push(idx); }
  };
  for (let x = 0; x < W; x += 2) { tryPush(x, 0); tryPush(x, H - 1); }
  for (let y = 0; y < H; y += 2) { tryPush(0, y); tryPush(W - 1, y); }
  while (stack.length) {
    const idx = stack.pop();
    const x = idx % W, y = (idx / W) | 0;
    tryPush(x + 1, y); tryPush(x - 1, y); tryPush(x, y + 1); tryPush(x, y - 1);
  }
  // доесть запечённые тени: серые пиксели 40..125, соседствующие с фоном (чёрный контур <40 не трём)
  for (let iter = 0; iter < 10; iter++) {
    let changed = false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (bg[idx]) continue;
      const c = px(x, y);
      const mn = Math.min(c[0], c[1], c[2]), mx = Math.max(c[0], c[1], c[2]);
      if (mx - mn > 22 || mx < 40 || mx > 125) continue;
      const near = bg[idx - 1] || bg[idx + 1] || bg[idx - W] || bg[idx + W] ||
        bg[idx - W - 1] || bg[idx - W + 1] || bg[idx + W - 1] || bg[idx + W + 1];
      if (near) { bg[idx] = 1; changed = true; }
    }
    if (!changed) break;
  }

  // удалить мелкие изолированные компоненты (остатки шахматки/соринки), оставив связный силуэт
  {
    const lbl = new Int32Array(W * H);
    const sizes = [0];
    const stk = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (bg[idx] || lbl[idx]) continue;
      const id = sizes.length; sizes.push(0);
      stk.length = 0; stk.push(idx); lbl[idx] = id;
      while (stk.length) {
        const j = stk.pop(); sizes[id]++;
        const jx = j % W, jy = (j / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = jx + dx, ny = jy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const k = ny * W + nx;
          if (!bg[k] && !lbl[k]) { lbl[k] = id; stk.push(k); }
        }
      }
    }
    let best = 1;
    for (let i = 2; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
    const minComp = job.minComp ?? 2000;
    for (let i = 0; i < W * H; i++) {
      if (!bg[i] && lbl[i] !== best && sizes[lbl[i]] < minComp) bg[i] = 1;
    }
  }

  // bbox содержимого
  let x0 = W, y0 = H, x1 = 0, y1 = 0, found = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!bg[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; found = true; }
  }
  if (!found) throw new Error('nothing left for ' + job.f);
  const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
  const scale = job.h / chh;
  const dw = Math.max(1, Math.round(cw * scale)), dh = Math.max(1, Math.round(chh * scale));

  // box-average downscale
  const out = Buffer.alloc(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = y0 + Math.floor(dy / scale), sy1 = Math.max(sy0 + 1, y0 + Math.floor((dy + 1) / scale));
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = x0 + Math.floor(dx / scale), sx1 = Math.max(sx0 + 1, x0 + Math.floor((dx + 1) / scale));
      let sr = 0, sg = 0, sb = 0, sa = 0, n = 0, cn = 0;
      for (let sy = sy0; sy < Math.min(sy1, H); sy++) for (let sx = sx0; sx < Math.min(sx1, W); sx++) {
        const opaque = bg[sy * W + sx] ? 0 : 1;
        const c = px(sx, sy);
        sa += opaque; n++;
        if (opaque) { sr += c[0]; sg += c[1]; sb += c[2]; cn++; }
      }
      const o = (dy * dw + dx) * 4;
      if (cn > 0 && sa / n > 0.35) {
        out[o] = Math.round(sr / cn); out[o + 1] = Math.round(sg / cn); out[o + 2] = Math.round(sb / cn);
        out[o + 3] = Math.round((sa / n) * 255);
      } else { out[o + 3] = 0; }
    }
  }
  // пост-чистка уже уменьшенного спрайта: бахрома фона + мелкие отдельные куски
  erodeFringe(out, dw, dh);
  removeSmallOpaque(out, dw, dh, job.outMin ?? 55);
  fs.writeFileSync(src, encodePNG(dw, dh, out));
  const a = anchorOf(out, dw, dh);
  console.log(job.f, `cropped ${cw}x${chh} -> ${dw}x${dh}`, `anchor ${JSON.stringify(a)} baseW=${dw}`);
}

// якорь: низ спрайта — точка опоры (копыта/передний угол фундамента)
function anchorOf(buf, W, H) {
  let by = -1;
  for (let y = H - 1; y >= 0 && by < 0; y--) for (let x = 0; x < W; x++) if (buf[(y * W + x) * 4 + 3] > 110) { by = y; break; }
  let sx = 0, n = 0;
  for (let x = 0; x < W; x++) if (buf[(by * W + x) * 4 + 3] > 110) { sx += x; n++; }
  return { ax: Math.round(n ? sx / n : W / 2), ay: by + 1, w: W, h: H, baseW: W };
}

// центр масс непрозрачных пикселей (для посадки диагональных стен по центру клетки)
function centerOf(buf, W, H) {
  let sx = 0, sy = 0, n = 0, by = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    if (buf[o + 3] < 128) continue;
    sx += x; sy += y; n++; if (y > by) by = y;
  }
  return { cx: n ? sx / n : W / 2, cy: n ? sy / n : H / 2, bottom: by < 0 ? H : by };
}

// съесть остаточный ЧИСТО белый фон по кромке силуэта (бежевый камень не трогаем)
function erodeFringe(buf, W, H) {
  for (let pass = 0; pass < 1; pass++) {
    const kill = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * 4;
      if (buf[o + 3] === 0) continue;
      const mn = Math.min(buf[o], buf[o + 1], buf[o + 2]);
      const mx = Math.max(buf[o], buf[o + 1], buf[o + 2]);
      // только почти чисто-белый и почти серый (остатки фона), не бежевый камень
      if (mn > 243 && (mx - mn) < 12) {
        const t = y > 0 ? buf[((y - 1) * W + x) * 4 + 3] : 0;
        const b2 = y < H - 1 ? buf[((y + 1) * W + x) * 4 + 3] : 0;
        const l = x > 0 ? buf[(y * W + x - 1) * 4 + 3] : 0;
        const r = x < W - 1 ? buf[(y * W + x + 1) * 4 + 3] : 0;
        if (t === 0 || b2 === 0 || l === 0 || r === 0) kill.push(o);
      }
    }
    for (const o of kill) { buf[o + 3] = 0; buf[o] = buf[o + 1] = buf[o + 2] = 0; }
  }
}

// удалить маленькие непрозрачные связные компоненты по альфа-каналу (для уже вырезанных спрайтов)
function removeSmallOpaque(buf, W, H, min) {
  const solid = (i) => buf[i * 4 + 3] > 110;
  const lbl = new Int32Array(W * H);
  const sizes = [0];
  const stk = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const idx = y * W + x;
    if (!solid(idx) || lbl[idx]) continue;
    const id = sizes.length; sizes.push(0);
    stk.length = 0; stk.push(idx); lbl[idx] = id;
    while (stk.length) {
      const j = stk.pop(); sizes[id]++;
      const jx = j % W, jy = (j / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = jx + dx, ny = jy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (solid(k) && !lbl[k]) { lbl[k] = id; stk.push(k); }
      }
    }
  }
  let best = 1;
  for (let i = 2; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  for (let i = 0; i < W * H; i++) {
    if (solid(i) && lbl[i] !== best && sizes[lbl[i]] < min) { buf[i * 4 + 3] = 0; buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = 0; }
  }
}

function cleanOnly(f, outMin) {
  const src = path.join('src/assets/sprites', f);
  const { W, H, data } = decodePNG(src);
  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    buf[i * 4] = data[i * 4] ?? 0; buf[i * 4 + 1] = data[i * 4 + 1] ?? 0; buf[i * 4 + 2] = data[i * 4 + 2] ?? 0; buf[i * 4 + 3] = data[i * 4 + 3] ?? 0;
  }
  erodeFringe(buf, W, H);
  removeSmallOpaque(buf, W, H, outMin);
  fs.writeFileSync(src, encodePNG(W, H, buf));
  console.log(f, `cleaned ${W}x${H}`, JSON.stringify(anchorOf(buf, W, H)));
}

// полная обработка нового спрайта (flood по белому фону + обрезка + чистка)
function processWall(f, h) {
  process({ f, h, tol: 78, outMin: 90 });
}
processWall('wall_b.png', 150);

// пост-чистка уже обработанных спрайтов стен/ворот: убрать белую каёмку, вывести центр масс
function cleanWalls(f, outMin) {
  const src = path.join('src/assets/sprites', f);
  const { W, H, ch, data } = decodePNG(src);
  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    buf[i * 4] = data[i * ch];
    buf[i * 4 + 1] = data[i * ch + 1];
    buf[i * 4 + 2] = data[i * ch + 2];
    buf[i * 4 + 3] = ch === 4 ? data[i * ch + 3] : 255;
  }
  erodeFringe(buf, W, H);
  removeSmallOpaque(buf, W, H, outMin);
  fs.writeFileSync(src, encodePNG(W, H, buf));
  console.log(f, `${W}x${H}`, 'center', JSON.stringify(centerOf(buf, W, H)));
}
for (const f of ['gate_b.png']) cleanWalls(f, 70);
