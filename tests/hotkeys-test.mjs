// Проверка горячих клавиш движка: дублей нет, Home/N на месте (1.0.101).
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0;
const ok = (c, m) => { n++; if (!c) { f++; console.log('FAIL', m); } };

const start = src.indexOf('onKeyDown = (e: KeyboardEvent)');
const end = src.indexOf('onKeyUp =', start);
const body = src.slice(start, end);
ok(start > 0 && end > start, 'найден onKeyDown');

// ключи веток вида `k === 'x'` — считаем только буквы/цифры (спец-клавиши могут повторяться в guard-ах)
const keys = [...body.matchAll(/k === '([^']+)'/g)].map(m => m[1]).filter(k => /^[0-9a-zа-я.+=_-]$/i.test(k));
const seen = new Map();
for (const k of keys) seen.set(k, (seen.get(k) ?? 0) + 1);
// допустимые повторы: ' ', escape и guard-и обрабатываются раньше; буквы должны быть уникальны
const dups = [...seen].filter(([k, c]) => c > 1 && /^[a-zа-я]$/i.test(k)).map(([k]) => k);
ok(dups.length === 0, `нет дублей букв в onKeyDown${dups.length ? ': ' + dups.join(',') : ''}`);
ok(body.includes("k === 'home'") && body.includes('centerTC()'), 'Home ведёт камеру к ставке');
ok(/k === 'n'[^\n]*toggleMute/.test(body), 'N переключает звук');
ok(/k === 'm'[^\n]*enterPlacement\('mosque'\)/.test(body), 'M по-прежнему мечеть');
ok(!/Выключить звук'\} \(M\)/.test(app) && /Выключить звук'\} \(N\)/.test(app), 'подсказка в паузе — (N)');
ok(/Home/.test(app.slice(app.indexOf('HowRow'))), 'устав упоминает Home');

console.log(`hotkeys: ${n - f}/${n}`);
process.exit(f ? 1 : 0);
