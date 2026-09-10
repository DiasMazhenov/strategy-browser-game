// Жырау: генерируемый дастан (п.19), 1.0.123 — хроника, строфы, Зал Легенд.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Лента деяний ===');
ok(/chronicle: string\[\] = \[\];   \/\/ лента деяний/.test(eng), 'хроника в движке');
ok((eng.match(/this\.chronicle\.push/g) || []).length >= 12, '≥12 источников строк (законы, кёш, керуен, саботаж, аманат…)');
ok(/chronicle: this\.chronicle\.slice\(-24\),   \/\/ жырау \(п\.19\)/.test(eng), 'хроника уходит в GameStats');
ok(/Хан вступил в \$\{this\.age\}-й век/.test(eng), 'века в хронике');
ok(/Ұлы көш: аул откочевал/.test(eng) && /Мавзолей хана встал над степью/.test(eng), 'кёш и мавзолей в хронике');

console.log('\n=== 2. Дастан ===');
ok(/function genDastan\(over: GameStats, heroName: string\): string/.test(eng + app) || /function genDastan\(over: GameStats, heroName: string\): string/.test(app), 'генератор дастана');
ok((app.match(/pool\.push\(/g) || []).length >= 9, '≥10 шаблонов строф (пул + интро + аутро)');
ok(/const picked = pool\.slice\(0, Math\.min\(7, pool\.length\)\);/.test(eng + app), 'уникальные строфы без повторов');
ok(/dastan\?: \{ kills: number; razed: number; built: number;/.test(eng), 'статистика для строф в GameStats');

console.log('\n=== 3. Зал Легенд ===');
ok(/const DASTAN_LS = 'khanate-dastans';/.test(app), 'своё хранилище дастанов');
ok(/function loadDastans\(\)/.test(app), 'загрузка из localStorage');
ok(/Дастаны жырау \(\{dst\.length\}\)/.test(app), 'список дастанов в Зале Легенд');
ok(/Сохранить дастан/.test(app) && /navigator\.clipboard\.writeText\(dastan\)/.test(app), 'сохранение и копирование на экране финала');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
