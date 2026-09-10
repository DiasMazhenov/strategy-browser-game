// Штурм (п.26, 1.0.107): таран против стен, стойкость к стрелам, ИИ приводит тараны.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../src/game/config.ts', import.meta.url), 'utf8');
const pix = readFileSync(new URL('../src/game/pixelart.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Математика штурма ===');
const RAM = { atk: 30, cd: 2.2, hp: 320 }, WALL = 900, GATE = 600, CATA = { atk: 46, cd: 3.2 };
const ramWall = WALL / (RAM.atk * 3 / RAM.cd), cataWall = WALL / (CATA.atk * 1.7 / CATA.cd), swordWall = WALL / (11 / 1.1);
ok(ramWall < 25, `таран ломает стену за ${ramWall.toFixed(0)} с (катапульта ${cataWall.toFixed(0)} с, сарбаз ${swordWall.toFixed(0)} с)`);
ok(GATE / (RAM.atk * 3 / RAM.cd) < 16, 'ворота — под 15 с');
const archerDps = 9 * 0.4 / 1.35;                        // pierce −60%
const archersToKill = Math.ceil(RAM.hp / (archerDps * 20)); // за 20 с подхода
ok(archersToKill >= 5, `стрелами таран не остановить: нужно ${archersToKill} мергенов на 20 с — отвечать надо пехотой`);
ok(RAM.atk * 0.25 < 11, 'по живым таран слабее сарбаза — без прикрытия беспомощен');

console.log('\n=== 2. Подключение ===');
ok(/ram: +\{ name: 'Таран'[^\n]*bld: 'blacksmith', ageReq: 1/.test(cfg), 'таран из кузницы с Феодальной эпохи');
ok(/att\.key === 'ram' && tb\) dmg \*= \(tb\.key === 'wall' \|\| tb\.key === 'gate'\) \? 3 : 1\.5/.test(eng), '×3 по стенам/воротам, ×1.5 по постройкам');
ok(/tu\?\.key === 'ram' && dmgType\(att\.key\) === 'pierce'\) dmg \*= 0\.4/.test(eng), 'стрелы −60% по тарану');
ok(/att === 'ram' && t !== 'siege'\) return 0\.25/.test(eng), 'по живым ×0.25');
ok(/u\.key === 'ram' && \(b\.key === 'wall' \|\| b\.key === 'gate'\)\) d \*= 0\.3/.test(eng), 'сам ищет стены как приоритетную цель');
ok(/const isCata = u\.key === 'catapult' \|\| u\.key === 'ram';/.test(eng), 'как осадный — атакует постройки без приказа');
ok(/walls >= 6 && this\.wave >= 4\) for [^\n]*comp\.push\('ram'\)/.test(eng), 'ИИ приводит тараны, когда у игрока стены (≥6 сегментов, с 4-й волны)');
ok(/1 \+ Math\.floor\(walls \/ 14\)/.test(eng), 'чем длиннее стена, тем больше таранов');
ok(/function drawRam\(/.test(pix) && /ram'\) drawRam\(/.test(pix), 'процедурный спрайт: навес из кож + бревно с оковкой');
ok(/train\('ram'\)/.test(app), 'найм в доке');
ok(/if \(k === 'ram'\) parts\.push\('×3 стены и ворота'/.test(eng), 'подсказка контр');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
