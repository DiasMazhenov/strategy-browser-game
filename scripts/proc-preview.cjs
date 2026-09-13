// Рендер ПРОЦЕДУРНЫХ юнитов в PNG и сравнение с настоящими спрайтами.
//
// Зачем: править арт, не видя результата, нельзя. Зрения у агента нет, поэтому
// вместо «посмотри и скажи» здесь численное сравнение: силуэт (ширина по
// строкам), центр тяжести, палитра и яркость процедурного юнита сверяются с
// эталонным PNG-спрайтом из src/assets/sprites/units/kz. Если профиль ширины
// процедурного крестьянина совпадает с kz_villager.png — фигура похожа; если
// палитра беднее втрое — значит не хватает полутонов.
//
// Запуск: node scripts/proc-preview.cjs [юнит] [зум]
//   node scripts/proc-preview.cjs kz_villager 1
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'tmp-preview');

// ── минимальный Canvas2D на pngjs-подобном буфере ───────────────────────────
function makeCanvas(w, h) {
  const data = Buffer.alloc(w * h * 4, 0);
  return { width: w, height: h, data };
}

function parseColor(c) {
  if (typeof c !== 'string') return null;
  if (c[0] === '#') {
    const hex = c.slice(1);
    if (hex.length === 3) return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16), 255];
    if (hex.length === 6) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255];
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(c.trim());
  if (m) {
    const p = m[1].split(',').map(s => parseFloat(s));
    return [p[0] | 0, p[1] | 0, p[2] | 0, Math.round((p[3] == null ? 1 : p[3]) * 255)];
  }
  return [255, 0, 255, 255];
}

function makeCtx(cv) {
  const st = { fill: '#000', stroke: '#000', lw: 1, alpha: 1, op: 'source-over' };
  let pathPts = [];
  let cur = null;                       // текущая точка path
  let fillGrad = null;                  // активный градиент заливки
  const stack = [];
  // матрица: [a, b, c, d, e, f] (scale/translate достаточно)
  let m = [1, 0, 0, 1, 0, 0];
  const xf = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  const blend = (x, y, col) => {
    if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return;
    const i = (y * cv.width + x) * 4;
    // 'source-in' (нужен для маски контура): красим только там, где уже есть
    // непрозрачный слой, и сохраняем его альфу
    if (st.op === 'source-in' || st.op === 'source-atop') {
      if (cv.data[i + 3] < 8) return;
      // красим по силуэту, альфу берём из существующего слоя, а цвет смешиваем
      // с учётом альфы самого источника (иначе полупрозрачный градиент
      // заливает кадр целиком и всё становится чёрным)
      const aa = col[3] / 255, ia = 1 - aa;
      cv.data[i] = col[0] * aa + cv.data[i] * ia;
      cv.data[i + 1] = col[1] * aa + cv.data[i + 1] * ia;
      cv.data[i + 2] = col[2] * aa + cv.data[i + 2] * ia;
      return;
    }
    const a = (col[3] / 255) * st.alpha;
    if (a <= 0) return;
    const ia = 1 - a;
    cv.data[i] = col[0] * a + cv.data[i] * ia;
    cv.data[i + 1] = col[1] * a + cv.data[i + 1] * ia;
    cv.data[i + 2] = col[2] * a + cv.data[i + 2] * ia;
    cv.data[i + 3] = Math.min(255, cv.data[i + 3] + col[3] * a);
  };
  // заливка полигона построчным сканированием
  const fillPoly = (pts, colorAt) => {
    if (pts.length < 3) return;
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(cv.height - 1, Math.ceil(y1)); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(cv.width - 1, Math.floor(xs[k + 1])); x++) {
          blend(x, y, colorAt ? colorAt(y) : [0, 0, 0, 255]);
        }
      }
    }
  };

  const ctx = {
    canvas: cv,
    set fillStyle(v) { if (typeof v === 'object' && v && v.__grad) { fillGrad = v; } else { fillGrad = null; st.fill = v; } },
    get fillStyle() { return st.fill; },
    set strokeStyle(v) { st.stroke = v; }, get strokeStyle() { return st.stroke; },
    set lineWidth(v) { st.lw = v; }, get lineWidth() { return st.lw; },
    set globalAlpha(v) { st.alpha = v; }, get globalAlpha() { return st.alpha; },
    set globalCompositeOperation(v) { st.op = v; }, get globalCompositeOperation() { return st.op; },
    imageSmoothingEnabled: true, imageSmoothingQuality: 'high',
    lineJoin: 'round', lineCap: 'round',
    createLinearGradient(x0, y0, x1, y1) {
      return {
        __grad: true, stops: [], x0, y0, x1, y1,
        addColorStop(o, c) { this.stops.push([o, parseColor(c)]); },
        at(y) {
          const t = Math.max(0, Math.min(1, (y - y0) / ((y1 - y0) || 1)));
          const s = this.stops;
          if (!s.length) return [255, 0, 255, 255];
          let a = s[0], b = s[s.length - 1];
          for (let i = 0; i + 1 < s.length; i++) if (t >= s[i][0] && t <= s[i + 1][0]) { a = s[i]; b = s[i + 1]; break; }
          const u = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
          return [a[1][0] + (b[1][0] - a[1][0]) * u, a[1][1] + (b[1][1] - a[1][1]) * u,
            a[1][2] + (b[1][2] - a[1][2]) * u, a[1][3] + (b[1][3] - a[1][3]) * u];
        },
      };
    },
    createRadialGradient() { return this.createLinearGradient(0, 0, 0, 1); },
    createPattern() { return null; },
    save() { stack.push([m.slice(), st.alpha, st.fill, st.stroke, st.lw]); },
    restore() { const s = stack.pop(); if (s) { m = s[0]; st.alpha = s[1]; st.fill = s[2]; st.stroke = s[3]; st.lw = s[4]; } },
    translate(x, y) { m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; },
    scale(x, y) { m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; },
    rotate() {}, setTransform(a, b, c, d, e, f) { m = [a, b, c, d, e, f]; },
    beginPath() { pathPts = []; cur = null; },
    closePath() {},
    moveTo(x, y) { cur = xf(x, y); pathPts.push([cur]); },
    lineTo(x, y) { const p = xf(x, y); if (!pathPts.length) pathPts.push([p]); else pathPts[pathPts.length - 1].push(p); },
    arc(cx, cy, r, a0, a1) {
      const pts = [];
      const n = 24;
      for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push(xf(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
      pathPts.push(pts);
    },
    ellipse(cx, cy, rx, ry, _rot, a0, a1) {
      const pts = []; const n = 32;
      for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push(xf(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry)); }
      pathPts.push(pts);
    },
    rect(x, y, w, h) { const p = [xf(x, y), xf(x + w, y), xf(x + w, y + h), xf(x, y + h)]; pathPts.push(p); },
    roundRect(x, y, w, h) { this.rect(x, y, w, h); },
    quadraticCurveTo() {}, bezierCurveTo() {}, addPath() {},
    fill() {
      const g = fillGrad;
      const flat = pathPts.flat();
      if (g) fillPoly(flat, (y) => g.at(y));
      else { const c = parseColor(st.fill); fillPoly(flat, () => c); }
    },
    stroke() {
      const lw = st.lw, c = parseColor(st.stroke);
      for (const seg of pathPts) for (let i = 0; i + 1 < seg.length; i++) {
        const [x0, y0] = seg[i], [x1, y1] = seg[i + 1];
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
          const r = lw / 2;
          for (let dy = -r; dy <= r; dy += 0.5) for (let dx = -r; dx <= r; dx += 0.5) blend(Math.round(x + dx), Math.round(y + dy), c);
        }
      }
    },
    fillRect(x, y, w, h) {
      const p0 = xf(x, y), p1 = xf(x + w, y), p2 = xf(x + w, y + h), p3 = xf(x, y + h);
      const g = fillGrad;
      if (g) fillPoly([p0, p1, p2, p3], (yy) => g.at(yy));
      else fillPoly([p0, p1, p2, p3], () => parseColor(st.fill));
    },
    strokeRect() {}, clearRect() {}, clip() {},
    // Как в браузере: при УМЕНЬШЕНИИ черновика (а он всегда рисуется с запасом
    // ×4) включается билинейная фильтрация — именно она даёт сглаженные края и
    // сотни промежуточных оттенков. nearest (как было) занижал палитру в разы.
    drawImage(img0, dx, dy, dw, dh) {
      const src = img0.__cv || img0;
      const sw = src.width, sh = src.height;
      const w = dw == null ? sw : dw, h = dh == null ? sh : dh;
      const smooth = this.imageSmoothingEnabled && (w < sw || h < sh);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!smooth) {
          const sx = Math.min(sw - 1, Math.floor((x / w) * sw)), sy = Math.min(sh - 1, Math.floor((y / h) * sh));
          const si = (sy * sw + sx) * 4;
          if (src.data[si + 3] <= 2) continue;
          blend(Math.round(dx + x), Math.round(dy + y), [src.data[si], src.data[si + 1], src.data[si + 2], src.data[si + 3]]);
          continue;
        }
        const fx = (x + 0.5) / w * sw - 0.5, fy = (y + 0.5) / h * sh - 0.5;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0;
        let r = 0, g = 0, b = 0, a = 0, wsum = 0;
        for (let j = 0; j <= 1; j++) for (let i = 0; i <= 1; i++) {
          const sx = Math.max(0, Math.min(sw - 1, x0 + i)), sy = Math.max(0, Math.min(sh - 1, y0 + j));
          const wgt = (i ? tx : 1 - tx) * (j ? ty : 1 - ty);
          const si = (sy * sw + sx) * 4;
          r += src.data[si] * wgt; g += src.data[si + 1] * wgt; b += src.data[si + 2] * wgt;
          a += src.data[si + 3] * wgt; wsum += wgt;
        }
        if (a <= 2) continue;
        blend(Math.round(dx + x), Math.round(dy + y), [r / wsum, g / wsum, b / wsum, a / wsum]);
      }
    },
    // настоящая работа с пикселями: иначе «зерно» из pixelart.ts в прогоне молчит
    getImageData(x, y, w, h) {
      const out = new Uint8ClampedArray(w * h * 4);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const si = ((y + j) * cv.width + (x + i)) * 4, di = (j * w + i) * 4;
        if (y + j < 0 || y + j >= cv.height || x + i < 0 || x + i >= cv.width) continue;
        out[di] = cv.data[si]; out[di + 1] = cv.data[si + 1]; out[di + 2] = cv.data[si + 2]; out[di + 3] = cv.data[si + 3];
      }
      return { data: out, width: w, height: h };
    },
    putImageData(img, dx, dy) {
      for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) {
        const si = (j * img.width + i) * 4, di = ((dy + j) * cv.width + (dx + i)) * 4;
        if (dy + j < 0 || dy + j >= cv.height || dx + i < 0 || dx + i >= cv.width) continue;
        cv.data[di] = img.data[si]; cv.data[di + 1] = img.data[si + 1]; cv.data[di + 2] = img.data[si + 2]; cv.data[di + 3] = img.data[si + 3];
      }
    }, measureText() { return { width: 10 }; }, fillText() {}, setLineDash() {},
  };
  return ctx;
}

// ── работа с PNG (декод/код, без внешних зависимостей) ──────────────────────
function decodePNG(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, idat = Buffer.alloc(0), W = 0, H = 0, ct = 0, bd = 8;
  while (pos < buf.length) {
    const ln = buf.readUInt32BE(pos);
    const typ = buf.slice(pos + 4, pos + 8).toString();
    const chunk = buf.slice(pos + 8, pos + 8 + ln);
    if (typ === 'IHDR') { W = chunk.readUInt32BE(0); H = chunk.readUInt32BE(4); bd = chunk[8]; ct = chunk[9]; }
    else if (typ === 'IDAT') idat = Buffer.concat([idat, chunk]);
    pos += 12 + ln;
  }
  if (bd !== 8) throw new Error('ожидаю 8 бит на канал');
  const ch = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(idat);
  const stride = W * ch, out = new Uint8Array(W * H * 4);
  let p = 0; const prev = Buffer.alloc(stride);
  for (let y = 0; y < H; y++) {
    const f = raw[p++];
    const line = Buffer.from(raw.slice(p, p + stride)); p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        line[x] = (line[x] + pr) & 255;
      }
    }
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      out[o] = line[x * ch]; out[o + 1] = line[x * ch + 1]; out[o + 2] = line[x * ch + 2];
      out[o + 3] = ch === 4 ? line[x * ch + 3] : 255;
    }
    line.copy(prev);
  }
  return { width: W, height: H, data: out };
}
function encodePNG(W, H, rgba) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  let p = 0;
  for (let y = 0; y < H; y++) {
    raw[p++] = 0;
    for (let x = 0; x < W * 4; x++) raw[p++] = rgba[y * W * 4 + x];
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const chunks = [];
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    chunks.push(len, body, crc);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  chunk('IHDR', ihdr); chunk('IDAT', idat); chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}
let CRC_T = null;
function crc32(buf) {
  if (!CRC_T) {
    CRC_T = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c; }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return c ^ -1;
}

// ── метрики силуэта ─────────────────────────────────────────────────────────
function metrics(img) {
  const { width: W, height: H, data } = img;
  const rows = [];
  let area = 0, sx = 0, sy = 0, opaque = 0;
  const colors = new Set();
  let lum = 0;
  for (let y = 0; y < H; y++) {
    let first = -1, last = -1, cnt = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (data[i + 3] > 40) {
        if (first < 0) first = x;
        last = x; cnt++;
        area++; sx += x; sy += y;
        colors.add((data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | (data[i + 2] >> 3));
        lum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        opaque++;
      }
    }
    rows.push({ y, w: cnt, l: first, r: last });
  }
  const top = rows.find(r => r.w > 0), bot = [...rows].reverse().find(r => r.w > 0);
  return {
    W, H, area, colors: colors.size,
    lum: opaque ? lum / opaque : 0,
    fill: area / (W * H),
    top: top ? top.y : H, bottom: bot ? bot.y : 0,
    cx: area ? sx / area : 0, cy: area ? sy / area : 0,
    maxW: Math.max(...rows.map(r => r.w)),
    profile: rows,
  };
}
/** Профиль ширины, приведённый к 20 отсчётам по высоте (сравнимо между спрайтами). */
function profile20(m) {
  const a = m.top, b = m.bottom, span = Math.max(1, b - a);
  const out = [];
  for (let i = 0; i < 20; i++) {
    const y = Math.round(a + (span * i) / 19);
    out.push(m.profile[y] ? m.profile[y].w : 0);
  }
  return out;
}
const norm = (p) => { const mx = Math.max(...p, 1); return p.map(v => +(v / mx).toFixed(2)); };
const diff = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);

module.exports = { makeCanvas, makeCtx, decodePNG, encodePNG, metrics, profile20, norm, diff };

// ── запуск из командной строки ──────────────────────────────────────────────
(async () => {
  const key = process.argv[2] || 'kz_villager';
  const zoom = Number(process.argv[3] || 1);
  const { execFileSync } = require('child_process');
  // pixelart.ts собираем в CJS: ассеты-заглушки, чтобы бандл не тянул PNG
  const esbuild = require('esbuild');
  const stub = {
    name: 'stub-assets',
    setup(b) {
      b.onResolve({ filter: /\.(png|jpe?g|svg|webp|gif|mp3)$/ }, a => ({ path: a.path, namespace: 'stub-asset' }));
      b.onLoad({ filter: /.*/, namespace: 'stub-asset' }, a => ({ contents: `export default ${JSON.stringify('asset:' + a.path.replace(/^.*\//, ''))};`, loader: 'js' }));
    },
  };
  const out = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/game/pixelart.ts')],
    bundle: true, write: false, format: 'cjs', platform: 'node',
    loader: { '.css': 'empty' }, plugins: [stub],
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
  });
  const code = out.outputFiles[0].text;
  const mod = { exports: {} };
  // минимум браузерного окружения, которого ждёт модуль при загрузке
  global.Image = class { constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; this._src = ''; }
    set src(v) { this._src = String(v); } get src() { return this._src; } addEventListener() {} removeEventListener() {} };
  global.Path2D = class { moveTo() {} lineTo() {} arc() {} arcTo() {} rect() {} roundRect() {} ellipse() {}
    closePath() {} bezierCurveTo() {} quadraticCurveTo() {} addPath() {} };
  // document нужен кэшу кадров ( он создаёт оффскрин-канвас )
  global.document = { createElement: () => { const c = { width: 1, height: 1 }; return { set width(v) { c.width = v; }, get width() { return c.width; }, set height(v) { c.height = v; }, get height() { return c.height; }, get data() { return this.__d; }, getContext() { const cv = makeCanvas(this.width, this.height); this.__cv = cv; return makeCtx(cv); } }; } };
  const fn = new Function('module', 'exports', 'require', code);
  fn(mod, mod.exports, require);
  const pixelart = mod.exports;

  if (key === 'all') {
    // замер фактической высоты фигуры: нужна, чтобы таблица PROC_H в
    // pixelart.ts соответствовала реальному рисунку, а не замыслу
    const keys = ['villager', 'swordsman', 'archer', 'spearman', 'monk', 'trader', 'scout',
      'knight', 'cavalry', 'wolf', 'sheep', 'cow', 'deer', 'catapult', 'ram', 'falconet'];
    console.log('юнит       кадр   верх  низ  высота   цель  raw(ед.)');
    for (const k of keys) {
      const uu = { key: k, owner: 'player', face: 1, anim: 0, atkAnim: 0, state: 'idle', walk: false, level: 0, fmode: 0 };
      const Z = 2, W = 160 * Z, H = 160 * Z;
      const cc = makeCanvas(W, H), cx2 = makeCtx(cc);
      pixelart.drawPixelUnit(cx2, uu, W / 2, H - 20 * Z, 0, false, 0, Z);
      const m = metrics({ width: W, height: H, data: cc.data });
      const h = m.bottom - m.top + 1;
      const target = { villager: 46, swordsman: 48, archer: 46, spearman: 46, knight: 60, cavalry: 60,
        catapult: 46, monk: 44, wolf: 34, trader: 58, sheep: 30, cow: 36, deer: 40, scout: 46, ram: 46, falconet: 46 }[k] || 46;
      const procH = { villager: 34, swordsman: 34, archer: 34, spearman: 34, monk: 34, trader: 34, scout: 34,
        knight: 50, cavalry: 50, horsearcher: 50, camelry: 50, wolf: 22, sheep: 22, cow: 24, deer: 30,
        catapult: 26, ram: 22, falconet: 18 }[k] || 34;
      const fit = target / procH;
      console.log(`${k.padEnd(10)} ${String(m.W).padStart(4)} ${String(m.top).padStart(5)} ${String(m.bottom).padStart(5)} ${String(h).padStart(6)} ${String(target * Z).padStart(6)} ${(h / (fit * Z)).toFixed(1).padStart(8)}`);
    }
    return;
  }
  const unitKey = key.replace(/^kz_/, '');
  const u = {
    key: unitKey, owner: key.startsWith('kz_') ? 'player' : 'enemy', face: 1, anim: 0, atkAnim: 0,
    state: 'idle', walk: false, level: 0, fmode: 0, herder: false,
  };
  // Кадр должен совпадать с игровым габаритом (procBoxFit), иначе крупные
  // фигуры — всадник, катапульта — обрезаются и метрики врут.
  const MOUNTED = ['knight', 'cavalry', 'horsearcher', 'camelry', 'trader'];
  const BIG = ['catapult', 'ram', 'falconet'];
  const bkey = unitKey;
  const W = Math.round((BIG.includes(bkey) ? 84 : MOUNTED.includes(bkey) ? 100 : 64) * zoom) * 2;
  const H = Math.round((BIG.includes(bkey) ? 76 : 72) * zoom) * 2;
  const cv = makeCanvas(W, H);
  const ctx = makeCtx(cv);
  // рисуем «как в бою»: точка под ногами — внизу кадра
  pixelart.drawPixelUnit(ctx, u, W / 2, H - 12 * zoom, 0, false, 0, zoom);
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${key}_proc.png`);
  fs.writeFileSync(file, encodePNG(W, H, cv.data));

  const mine = metrics({ width: W, height: H, data: cv.data });
  const refFile = path.join(ROOT, 'src/assets/sprites/units/kz', `${key}.png`);
  console.log(`\n=== ${key} (процедурный, зум ×${zoom}) ===`);
  console.log(`габарит ${mine.W}×${mine.H}, силуэт строк ${mine.top}…${mine.bottom}, высота ${mine.bottom - mine.top + 1}`);
  console.log(`площадь силуэта ${(mine.fill * 100).toFixed(1)}% кадра, макс. ширина ${mine.maxW}, цветов ${mine.colors}, яркость ${mine.lum.toFixed(0)}`);
  console.log(`профиль ширины (20 отсчётов): ${norm(profile20(mine)).join(' ')}`);
  if (fs.existsSync(refFile)) {
    // ЭТАЛОН НАДО ПРИВЕСТИ К ИГРОВОМУ РАЗМЕРУ: kz_villager.png — исходник
    // 52×150, а в бою он рисуется высотой UNIT_TARGET_H (46). Сравнивать
    // палитру 150-пиксельного исходника с 46-пиксельным процедурным кадром
    // нельзя — у большего кадра цветов всегда больше.
    const rawRef = decodePNG(refFile);
    const targetH = { villager: 46, swordsman: 48, archer: 46, spearman: 46, knight: 60, cavalry: 60,
      catapult: 46, monk: 44, wolf: 34, trader: 58, sheep: 30, cow: 36, deer: 40, scout: 46 }[unitKey] || 46;
    const scale = targetH / rawRef.height;
    const rw = Math.max(1, Math.round(rawRef.width * scale)), rh = Math.max(1, Math.round(rawRef.height * scale));
    const rs = makeCanvas(rw, rh);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const fx = (x + 0.5) / rw * rawRef.width - 0.5, fy = (y + 0.5) / rh * rawRef.height - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      let r = 0, g = 0, b = 0, a = 0, w = 0;
      for (let j = 0; j <= 1; j++) for (let i = 0; i <= 1; i++) {
        const sx = Math.max(0, Math.min(rawRef.width - 1, x0 + i)), sy = Math.max(0, Math.min(rawRef.height - 1, y0 + j));
        const wg = (i ? tx : 1 - tx) * (j ? ty : 1 - ty), si = (sy * rawRef.width + sx) * 4;
        r += rawRef.data[si] * wg; g += rawRef.data[si + 1] * wg; b += rawRef.data[si + 2] * wg;
        a += rawRef.data[si + 3] * wg; w += wg;
      }
      const di = (y * rw + x) * 4;
      rs.data[di] = r / w; rs.data[di + 1] = g / w; rs.data[di + 2] = b / w; rs.data[di + 3] = a / w;
    }
    fs.writeFileSync(path.join(OUT, `${key}_ref_scaled.png`), encodePNG(rw, rh, rs.data));
    const ref = metrics({ width: rw, height: rh, data: rs.data });
    console.log(`\n--- эталон ${key}.png, приведён к ${rh} px (игровой размер) ---`);
    console.log(`габарит ${ref.W}×${ref.H}, силуэт строк ${ref.top}…${ref.bottom}, высота ${ref.bottom - ref.top + 1}`);
    console.log(`площадь силуэта ${(ref.fill * 100).toFixed(1)}% кадра, макс. ширина ${ref.maxW}, цветов ${ref.colors}, яркость ${ref.lum.toFixed(0)}`);
    console.log(`профиль ширины (20 отсчётов): ${norm(profile20(ref)).join(' ')}`);
    console.log(`\nрасхождение профиля: ${diff(norm(profile20(mine)), norm(profile20(ref))).toFixed(3)} (0 — совпадает)`);
    console.log(`отношение цветов: ${(mine.colors / ref.colors).toFixed(2)}×  ·  яркость: ${(mine.lum / ref.lum).toFixed(2)}×`);
  } else console.log(`\nэталона ${refFile} нет — сравнивать не с чем`);
  console.log(`\nPNG: ${path.relative(ROOT, file)}`);
})();
