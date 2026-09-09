// Контактный лист всех векторных иконок игры (src/game/iconset.ts).
// Использование: node scripts/build-icon-sheet.cjs [out.svg]
// Собирает SVG-сетку «иконка + имя»; для растра — любой SVG-рендерер.
// Скрипт дев-инструмент: PNG/SVG лист в git не коммитим.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const out = process.argv[2] || path.join(os.tmpdir(), 'icon-sheet.svg');

// собираем iconset.ts в cjs, чтобы достать реестр без браузера
const bundle = path.join(os.tmpdir(), 'iconset.bundle.cjs');
execFileSync(path.join(ROOT, 'node_modules', '.bin', 'esbuild'),
  [path.join(ROOT, 'src', 'game', 'iconset.ts'), '--bundle', '--format=cjs', '--platform=node', `--outfile=${bundle}`],
  { stdio: 'inherit' });
const lib = require(bundle);

const names = lib.ICON_NAMES;
const COLS = 10, CELL = 86, PAD = 14;
const rows = Math.ceil(names.length / COLS);
const W = COLS * CELL + PAD * 2, H = rows * CELL + PAD * 2;

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let g = '';
names.forEach((n, i) => {
  const cx = PAD + (i % COLS) * CELL, cy = PAD + Math.floor(i / COLS) * CELL;
  const def = lib.ICONS[n];
  const parts = def.parts.map(p => {
    const fill = p.f === 'cur' ? '#f6d47c' : (p.f || 'none');
    const stroke = p.s === 'none' ? 'none' : (p.s === 'cur' ? '#f6d47c' : (p.s || '#f6d47c'));
    return `<path d="${p.d}" fill="${fill}" stroke="${stroke}" stroke-width="${p.w ?? 1.7}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
  g += `<g transform="translate(${cx + 13},${cy + 8})"><g transform="scale(2.5)">${parts}</g></g>`
    + `<text x="${cx + CELL / 2}" y="${cy + CELL - 8}" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#9fb6a8">${esc(n)}</text>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
  + `<rect width="${W}" height="${H}" fill="#161a17"/>${g}</svg>`;
fs.writeFileSync(out, svg);
console.log(`icon sheet: ${names.length} icons → ${out} (${W}×${H})`);
