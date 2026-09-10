// Масштаб иконок (1.0.103): единый набор, читаемый минимум, обводка не тоньше пикселя.
import { readFileSync } from 'node:fs';
const ico = readFileSync(new URL('../src/game/Ico.tsx', import.meta.url), 'utf8');
const set = readFileSync(new URL('../src/game/iconset.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. DOM-иконка ===');
ok(/inline-block shrink-0/.test(ico) && /\.filter\(Boolean\)\.join/.test(ico), 'inline-block/shrink-0 всегда, даже с явным className (preflight делает svg block)');
ok(/h-\[max\(1em,12px\)\]/.test(ico), 'размер по умолчанию не опускается ниже 12 px в мелких плашках');
ok(/h-\[max\(1\.05em,12px\)\]/.test(ico), 'иконки в строках {i:…} тоже с нижним порогом');
ok(/const sized = !!className && \/\\b\(h-\|w-\|size-\)\//.test(ico), 'явный размер (h-4 w-4) уважается и порог не мешает');

console.log('\n=== 2. Canvas ===');
ok(/Math\.max\(part\.w \?\? 1\.7, 1\.1 \/ k\)/.test(set), 'обводка на канвасе не тоньше 1.1 px при любом размере иконки');

console.log('\n=== 3. Один набор, без смешения с lucide ===');
ok(/<Res icon=\{<Ico name="wood"/.test(app) && /<Res icon=\{<Ico name="food"/.test(app) && /<Res icon=\{<Ico name="gold"/.test(app), 'ресурсы в шапке — те же пиктограммы, что в стоимостях');
ok(!/<TreePine |<Drumstick |<Coins /.test(app), 'lucide-иконки ресурсов больше не используются');

console.log('\n=== 4. Мелкие плашки не получают безразмерные иконки в text-[8px] ===');
const tiny = [...app.matchAll(/text-\[(\d+(?:\.\d+)?)px\][^>]*>[^<]*<Ico name="[^"]*" \/>/g)].filter(m => parseFloat(m[1]) < 8);
ok(tiny.length === 0, `нет безразмерных иконок в шрифте < 8 px${tiny.length ? ' (' + tiny.length + ')' : ''}`);

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
