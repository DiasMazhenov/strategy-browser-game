// Контактный лист: процедурный юнит и его PNG-эталон рядом, в одном масштабе.
// Нужен потому, что сравнивать арт числами (профиль ширины, палитра) можно
// сколь угодно долго и всё равно получить фигуру, которой метрика довольна, а
// глаз — нет. Здесь обе картинки стоят бок о бок: слева процедурный рендер,
// справа настоящий спрайт, вытянутый по высоте до того же роста.
//
// Текст не пишем: рантайм-мок канваса не умеет fillText. Порядок юнитов
// фиксирован (см. KEYS) и записан в context.md.
//
// Запуск: node scripts/proc-preview.cjs kz_XXX 2   (для каждого юнита)
//         node scripts/contact.cjs
const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG } = require('./proc-preview.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tmp-preview');
const KEYS = ['villager', 'swordsman', 'archer', 'spearman', 'monk', 'trader', 'scout', 'knight',
  'cavalry', 'horsearcher', 'camelry', 'wolf', 'sheep', 'cow', 'deer', 'catapult', 'ram', 'falconet'];

/** Габарит непрозрачной части. */
function bbox(img) {
  const { width: W, height: H, data } = img;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] > 40) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function scaleTo(img, k) {
  const { width: W, height: H, data } = img;
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(W - 1, Math.floor((x / w) * W)), sy = Math.min(H - 1, Math.floor((y / h) * H));
    const si = (sy * W + sx) * 4, di = (y * w + x) * 4;
    out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
  }
  return { width: w, height: h, data: out };
}
function blit(dst, DW, DH, src, dx, dy) {
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const X = dx + x, Y = dy + y; if (X < 0 || Y < 0 || X >= DW || Y >= DH) continue;
    const si = (y * src.width + x) * 4, di = (Y * DW + X) * 4;
    const a = src.data[si + 3] / 255;
    if (a <= 0) continue;
    dst[di] = src.data[si] * a + dst[di] * (1 - a);
    dst[di + 1] = src.data[si + 1] * a + dst[di + 1] * (1 - a);
    dst[di + 2] = src.data[si + 2] * a + dst[di + 2] * (1 - a);
    dst[di + 3] = Math.min(255, src.data[si + 3] + dst[di + 3]);
  }
}

const CELLW = 300, CELLH = 320, COLS = 2, PAD = 16, TOP = 16;
const pairs = KEYS.map((k) => {
  const p = path.join(OUT, `kz_${k}_proc.png`);
  const r = path.join(OUT, `kz_${k}_ref_scaled.png`);
  return { k, proc: fs.existsSync(p) ? p : null, ref: fs.existsSync(r) ? r : null };
}).filter((p) => p.proc);
const rows = Math.ceil(pairs.length / COLS);
const W = COLS * CELLW + (COLS + 1) * PAD, H = rows * CELLH + (rows + 1) * PAD + TOP;
const sheet = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) { sheet[i * 4] = 12; sheet[i * 4 + 1] = 20; sheet[i * 4 + 2] = 16; sheet[i * 4 + 3] = 255; }

pairs.forEach((p, i) => {
  const cx = PAD + (i % COLS) * (CELLW + PAD), cy = TOP + PAD + Math.floor(i / COLS) * (CELLH + PAD);
  // рамка клетки
  for (let x = cx; x < cx + CELLW; x++) { for (const y of [cy, cy + CELLH - 1]) { const j = (y * W + x) * 4; sheet[j] = 40; sheet[j + 1] = 60; sheet[j + 2] = 48; } }
  const proc = decodePNG(p.proc);
  const pb = bbox(proc);
  const ref = p.ref ? decodePNG(p.ref) : null;
  const rb = ref ? bbox(ref) : null;
  // общая высота: берём за эталон рост спрайта, подгоняем обе картинки под неё
  const targetH = Math.min(CELLH - 40, Math.max(pb ? pb.h : 100, rb ? rb.h * 2 : 0));
  if (pb) {
    const s = scaleTo(proc, targetH / pb.h);
    blit(sheet, W, H, s, cx + 10, cy + CELLH - 20 - s.height);
  }
  if (rb) {
    const s = scaleTo(ref, targetH / rb.h);
    blit(sheet, W, H, s, cx + 20 + (pb ? scaleTo(proc, targetH / pb.h).width : 0), cy + CELLH - 20 - s.height);
  }
  // метка: есть эталон — зелёная полоса слева, нет — серая
  const c = rb ? [80, 200, 120] : [120, 120, 120];
  for (let y = cy + 8; y < cy + 16; y++) for (let x = cx + 8; x < cx + 20; x++) { const j = (y * W + x) * 4; sheet[j] = c[0]; sheet[j + 1] = c[1]; sheet[j + 2] = c[2]; }
});
const file = path.join(OUT, 'contact.png');
fs.writeFileSync(file, encodePNG(W, H, sheet));
console.log(`контактный лист: ${file} (${W}×${H})`);
console.log('порядок юнитов (слева направо, сверху вниз):');
pairs.forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. ${p.k}${p.ref ? '  — процедурный слева, спрайт справа' : '  — только процедурный (спрайта нет)'}`));
