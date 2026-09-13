// Антропометрия спрайта: годится ли фигура в люди.
// proc-preview.cjs сравнивает процедурный кадр с эталоном «по профилю ширины» —
// этой метрике можно угодить и уродом (сузил тело вдвое — профиль совпал, а
// получилась голова на палочке). Здесь считаются человеческие доли роста:
// голова, плечи, талия, руки, ноги. Нормы — по настоящему спрайту и по
// натуральной анатомии (голова ≈ 1/6.5 роста, плечи ≈ 1/4).
//
// Запуск: node scripts/anthro.cjs tmp-preview/kz_villager_proc.png
//         node scripts/anthro.cjs <файл> <ещё файл> ...
const fs = require('fs');
const { decodePNG } = require('./proc-preview.cjs');

// Нормы взрослого человека (доли роста). Для пиксель-арта голова допускается
// чуть крупнее натуры — иначе лицо не прочитать, — но не вдвое.
const NORM = { head: [0.11, 0.18], sh: [0.20, 0.32], waist: [0.13, 0.24], legs: [0.42, 0.55] };

function anthro(file) {
  const img = decodePNG(file);
  const { width: W, height: H, data } = img;
  const rows = [];
  for (let y = 0; y < H; y++) {
    let x0 = -1, x1 = -1, n = 0;
    for (let x = 0; x < W; x++) {
      const a = data[(y * W + x) * 4 + 3];
      if (a > 140) { if (x0 < 0) x0 = x; x1 = x; n++; }
    }
    rows.push({ y, w: x1 - x0 + 1, cx: x0 < 0 ? -1 : (x0 + x1) / 2, n });
  }
  const solid = rows.filter((r) => r.w > 0);
  if (!solid.length) return null;
  const top = solid[0].y, bot = solid[solid.length - 1].y;
  const h = bot - top + 1;
  const at = (frac) => {
    const r = rows[Math.min(H - 1, Math.max(0, Math.round(top + h * frac)))];
    return r ? r.w : 0;
  };
  const band = (a, b, fn) => {
    let v = fn === 'max' ? 0 : 1e9;
    for (let f = a; f <= b; f += 0.005) { const w = at(f); if (w > 0) v = fn === 'max' ? Math.max(v, w) : Math.min(v, w); }
    return v === 1e9 ? 0 : v;
  };
  return {
    file: file.split('/').pop(), w: W, h: H, top, bot, grow: h,
    head: band(0, 0.14, 'max'),                 // голова с убором
    sh: band(0.16, 0.36, 'max'),                // плечи (и оружие — оттого потолок выше нормы)
    chest: at(0.3), waist: band(0.42, 0.62, 'min'), hips: band(0.5, 0.62, 'max'),
    legs: at(0.85), maxw: Math.max(...rows.map((r) => r.w)),
  };
}

const rnd = (v) => (Math.round(v * 100) / 100).toFixed(2);
const files = process.argv.slice(2);
if (!files.length) { console.log('нужен PNG'); process.exit(1); }
console.log('файл                        рост  головы  плеч   груди  талии  ног   макс.ширины   доли роста: голова/плечи/талия/ноги');
for (const f of files) {
  if (!fs.existsSync(f)) { console.log(`${f}: нет файла`); continue; }
  const a = anthro(f);
  if (!a) { console.log(`${f}: силуэт не найден`); continue; }
  const d = (v) => rnd(v / a.grow);
  const bad = [];
  const chk = (k, v) => { const [lo, hi] = NORM[k]; const r = v / a.grow; if (r < lo || r > hi) bad.push(`${k} ${rnd(r)} (норма ${lo}–${hi})`); };
  chk('head', a.head); chk('sh', a.sh); chk('waist', a.waist); chk('legs', a.legs);
  console.log(
    `${a.file.padEnd(24)} ${String(a.grow).padStart(4)}  ${String(a.head).padStart(5)}  ${String(a.sh).padStart(5)}  `
    + `${String(a.chest).padStart(5)}  ${String(a.waist).padStart(5)}  ${String(a.legs).padStart(4)}  ${String(a.maxw).padStart(5)}`
    + `        ${d(a.head)} / ${d(a.sh)} / ${d(a.waist)} / ${d(a.legs)}`
    + (bad.length ? `\n    ⚠ вне нормы: ${bad.join('; ')}` : ''),
  );
}
