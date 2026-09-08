// ── АЛТЫБАКАН ───────────────────────────────────────────────────────────────
// Собирает 4 спрайта из двух сгенерированных кадров:
//   kz_prop_swing      — пустые качели (постоянная декорация у ставки)
//   kz_swing_ride_c/l/r — те же качели с парой, три фазы качания
//
// Люди стоят ПОПЕРЁК доски, лицом по ходу качания: парень спиной к камере,
// девушка лицом к камере. Наклон в стороны генерацией не получался (модель
// возвращала тот же кадр), поэтому боковые фазы строятся поворотом:
// «маятник» (верёвки + доска + пара) вырезается и вращается вокруг точки
// подвеса на перекладине, а опоры остаются неподвижными.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const OUT = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'units', 'kz');

// ── PNG I/O ─────────────────────────────────────────────────────────────────
function readPNG(f) {
  const b = fs.readFileSync(f);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), ct = b[25];
  let idat = [], p = 8;
  while (p < b.length) {
    const len = b.readUInt32BE(p), t = b.toString('ascii', p + 4, p + 8);
    if (t === 'IDAT') idat.push(b.slice(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 4;
  const st = w * ch, o = Buffer.alloc(h * st);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[rp++], ln = raw.slice(rp, rp + st); rp += st;
    for (let x = 0; x < st; x++) {
      const a = x >= ch ? o[y * st + x - ch] : 0, bb = y > 0 ? o[(y - 1) * st + x] : 0;
      const c = (x >= ch && y > 0) ? o[(y - 1) * st + x - ch] : 0;
      let v = ln[x];
      if (ft === 1) v += a; else if (ft === 2) v += bb; else if (ft === 3) v += (a + bb) >> 1;
      else if (ft === 4) {
        const pa = Math.abs(bb - c), pb = Math.abs(a - c), pc = Math.abs(a + bb - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c);
      }
      o[y * st + x] = v & 255;
    }
  }
  if (ch === 4) return { w, h, px: o };
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = o[i * ch];
    rgba[i * 4 + 1] = ch >= 3 ? o[i * ch + 1] : o[i * ch];
    rgba[i * 4 + 2] = ch >= 3 ? o[i * ch + 2] : o[i * ch];
    rgba[i * 4 + 3] = 255;
  }
  return { w, h, px: rgba };
}
const CT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = b => { let c = 0xffffffff; for (const x of b) c = CT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function writePNG(f, w, h, px) {
  const st = w * 4, raw = Buffer.alloc((st + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (st + 1)] = 0; px.copy(raw, y * (st + 1) + 1, y * st, (y + 1) * st); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ch = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc(Buffer.concat([Buffer.from(t), d])), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  fs.writeFileSync(f, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ih), ch('IDAT', idat), ch('IEND', Buffer.alloc(0))]));
}

// ── маджента-фон → прозрачность ─────────────────────────────────────────────
const isMagenta = (px, i) => {
  const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
  return r > 130 && b > 130 && (r - g) > 55 && (b - g) > 55;
};
function dropMagenta(im) {
  const { w, h, px } = im;
  // ВАЖНО: одной заливкой от краёв не обойтись. Между верёвками, под
  // перекладиной и над головами остаётся ЗАМКНУТЫЙ карман фона, до которого
  // заливка не доберётся — поэтому вторым проходом гасим любой магентовый
  // пиксель. В самом спрайте магенты нет, так что это безопасно.
  for (let i = 0; i < w * h; i++) if (isMagenta(px, i)) px[i * 4 + 3] = 0;
  // кайма: полупрозрачные пиксели с розовым отливом у границы прозрачного
  for (let i = 0; i < w * h; i++) {
    if (!px[i * 4 + 3]) continue;
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    if ((r - g) > 38 && (b - g) > 38 && r > 110 && b > 110) {
      const x = i % w, y = (i / w) | 0;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (px[(ny * w + nx) * 4 + 3] === 0) { near = true; break; }
      }
      if (near) px[i * 4 + 3] = 0;
    }
  }
  return im;
}
function bbox(im) {
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    if (im.px[(y * im.w + x) * 4 + 3] <= 16) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function crop(im, bb) {
  const out = Buffer.alloc(bb.w * bb.h * 4);
  for (let y = 0; y < bb.h; y++) for (let x = 0; x < bb.w; x++) {
    const sx = x + bb.x0, sy = y + bb.y0;
    if (sx < 0 || sy < 0 || sx >= im.w || sy >= im.h) continue;
    const s = (sy * im.w + sx) * 4, d = (y * bb.w + x) * 4;
    out[d] = im.px[s]; out[d + 1] = im.px[s + 1]; out[d + 2] = im.px[s + 2]; out[d + 3] = im.px[s + 3];
  }
  return { w: bb.w, h: bb.h, px: out };
}
// уменьшение усреднением: тонкие верёвки не рвутся, как при nearest
function resize(im, nw, nh) {
  const out = Buffer.alloc(nw * nh * 4), fx = im.w / nw, fy = im.h / nh;
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const sx0 = Math.floor(x * fx), sx1 = Math.max(sx0 + 1, Math.ceil((x + 1) * fx));
    const sy0 = Math.floor(y * fy), sy1 = Math.max(sy0 + 1, Math.ceil((y + 1) * fy));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = sy0; sy < sy1 && sy < im.h; sy++) for (let sx = sx0; sx < sx1 && sx < im.w; sx++) {
      const i = (sy * im.w + sx) * 4, al = im.px[i + 3] / 255;
      r += im.px[i] * al; g += im.px[i + 1] * al; b += im.px[i + 2] * al; a += im.px[i + 3]; n++;
    }
    const d = (y * nw + x) * 4;
    if (!n || a / n < 34) { out[d + 3] = 0; continue; }
    const wsum = (a / 255) || 1;
    out[d] = Math.min(255, r / wsum); out[d + 1] = Math.min(255, g / wsum); out[d + 2] = Math.min(255, b / wsum);
    out[d + 3] = 255;
  }
  return { w: nw, h: nh, px: out };
}

// ── разделение на «опоры» и «маятник» ───────────────────────────────────────
// Ниже перекладины маятник (верёвки+доска+пара) — отдельная связная область,
// не касающаяся ног опор. Берём её заливкой из центра доски и от верёвок.
// Ограничение по геометрии: маятник висит ВНУТРИ пролёта между тripodами.
// Без рамки заливка перетекает через точку касания в опоры и уносит их
// (в изо-кадре получалось 86% «маятника» — разваливалась вся конструкция).
function splitPendulum(im, cutY, box) {
  const { w, h, px } = im;
  const mask = new Uint8Array(w * h);
  const opaque = i => px[i * 4 + 3] > 16;
  const seeds = [];
  // верёвки сразу под перекладиной: непрозрачные пробеги в центральной трети
  for (const probe of [cutY + 4, cutY + 10]) {
    let run = null;
    for (let x = Math.floor(w * 0.25); x < Math.floor(w * 0.75); x++) {
      const i = probe * w + x;
      if (opaque(i)) { if (!run) run = [x, x]; else run[1] = x; }
      else if (run) { seeds.push(probe * w + ((run[0] + run[1]) >> 1)); run = null; }
    }
    if (run) seeds.push(probe * w + ((run[0] + run[1]) >> 1));
  }
  // доска и стоящие на ней люди — центральная колонка ближе к низу
  for (const fy of [0.5, 0.58, 0.66, 0.72]) {
    const y = Math.floor(h * fy);
    for (const fx of [0.42, 0.48, 0.54, 0.6]) {
      const i = y * w + Math.floor(w * fx);
      if (opaque(i)) seeds.push(i);
    }
  }
  const lim = box || { x0: 0, x1: w - 1, y1: h - 1 };
  const st = seeds.filter(i => opaque(i));
  while (st.length) {
    const i = st.pop();
    if (i < 0 || i >= w * h || mask[i] || !opaque(i)) continue;
    const y = (i / w) | 0, xx = i % w;
    if (y <= cutY) continue;                 // выше линии реза — это уже рама
    if (xx < lim.x0 || xx > lim.x1 || y > lim.y1) continue;   // вне пролёта
    mask[i] = 1;
    const x = i % w;
    if (x > 0) st.push(i - 1);
    if (x < w - 1) st.push(i + 1);
    if (y > 0) st.push(i - w);
    if (y < h - 1) st.push(i + w);
  }
  const mk = () => ({ w, h, px: Buffer.alloc(w * h * 4) });
  const frame = mk(), pend = mk();
  for (let i = 0; i < w * h; i++) {
    const dst = mask[i] ? pend.px : frame.px;
    for (let k = 0; k < 4; k++) dst[i * 4 + k] = px[i * 4 + k];
  }
  return { frame, pend, mask };
}
// поворот вокруг точки подвеса (обратное отображение, nearest — пиксель-арт)
function rotateAbout(im, cx, cy, ang) {
  const { w, h, px } = im;
  const out = Buffer.alloc(w * h * 4);
  const cos = Math.cos(-ang), sin = Math.sin(-ang);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - cx, dy = y - cy;
    const sx = Math.round(cx + dx * cos - dy * sin);
    const sy = Math.round(cy + dx * sin + dy * cos);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    const s = (sy * w + sx) * 4;
    if (px[s + 3] <= 16) continue;
    const d = (y * w + x) * 4;
    out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2]; out[d + 3] = px[s + 3];
  }
  return { w, h, px: out };
}
function over(base, top) {
  const out = Buffer.from(base.px);
  for (let i = 0; i < base.w * base.h; i++) {
    if (top.px[i * 4 + 3] <= 16) continue;
    for (let k = 0; k < 4; k++) out[i * 4 + k] = top.px[i * 4 + k];
  }
  return { w: base.w, h: base.h, px: out };
}

module.exports = { readPNG, writePNG, dropMagenta, bbox, crop, resize, splitPendulum, rotateAbout, over };
