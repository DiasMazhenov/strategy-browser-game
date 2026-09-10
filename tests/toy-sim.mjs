// Той: байга, көкпар и асык (п.20), 1.0.124 — расписание, мини-игры, награды.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Расписание и цена пропуска ===');
ok(/if \(this\.dayNum % 3 === 0 && this\.time - this\.lastCombatT > 90\) this\.toyDue = true;/.test(eng), 'каждые 3 суток мира');
ok(/this\.lastCombatT = this\.time;   \/\/ той \(п\.20\) назначают только в мирное время/.test(eng), 'бой отменяет той');
ok(/Той пропущен', 'Бии обижены: авторитет хана тает/.test(eng) && /this\.authority = Math\.max\(0, this\.authority - 10\);/.test(eng), 'пропуск = −10 авторитета');

console.log('\n=== 2. Награды ===');
ok(/toyBet\(n: number\): boolean \{/.test(eng) && /this\.res\.gold -= n; this\.pushHud\(\); return true;/.test(eng), 'ставка списывает золото');
ok(/toyReward\(kind: 'baiga' \| 'kokpar' \| 'asyq', amount: number\)/.test(eng), '3 награды');
ok(/this\.toyJoy = 1; this\.toyDue = false;/.test(eng), 'радость тоя гасит флаг');
ok(/this\.score \+= 150; this\.authorithy|this\.score \+= 150; this\.authority = Math\.min\(100, this\.authorithy \+ 5\)/.test(eng) || /this\.score \+= 150; this\.authority = Math\.min\(100, this\.authority \+ 5\);/.test(eng), 'престиж: +150 очков, +5 авторитета');
ok(/if \(this\.toyJoy > 0\) m \*= 1 \+ 0\.05 \* this\.toyJoy;/.test(eng), 'темп работ: до +5% добычи');
ok(/this\.toyJoy = Math\.max\(0, this\.toyJoy - 0\.01\);/.test(eng), 'веселье стихает со временем');
ok(/toy: \{ due: this\.toyDue, joy: Math\.round\(this\.toyJoy \* 100\) \},/.test(eng), 'HUD знает о тое');

console.log('\n=== 3. Мини-игры в App ===');
ok(/function ToyModal\(\{ onClose, act \}/.test(app), 'модалка тоя с колбэком');
ok(/'baiga', 'Байга', 'Ставка 50 золота на скакуна/.test(app), 'байга: ставка на скакуна');
ok(/Рывок \{Math\.min\(round \+ 1, 3\)\}\/3/.test(app), 'көкпар: 3 рывка за тушей');
ok(/Бросить асыки \(30 золота\)/.test(app), 'асык: кости против бия');
ok(/ТОЙ!/.test(app) && /hud\?\.toy\?\.due/.test(app), 'золотая кнопка праздника по флагу');
ok(/gm\.toyBet\(amount \?\? 0\)/.test(app) && /gm\.toyReward\(kind, amount \?\? 0\)/.test(app), 'модалка бьёт в движок');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
