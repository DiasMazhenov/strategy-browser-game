// Барлаушы: сеть разведки и саботажа (п.17), 1.0.121 — дозоры, 3 диверсии, контригра.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Дозоры ===');
ok(/placeWatch\(\) \{/.test(eng) && /this\.watchPosts\.length >= 4/.test(eng), 'дозорные точки (макс 4)');
ok(/for \(const w of this\.watchPosts\) mark\(w\.x, w\.y, 300\);   \/\/ дозоры/.test(eng), 'дозоры светят туман постоянно');
ok(/raidSeen: near, raidIn: near \? Math\.max\(0, Math\.ceil\(this\.waveT\)\) : -1/.test(eng), 'состав врага и отсчёт рейда у ставки');

console.log('\n=== 2. Саботаж ===');
ok(/sabotage\(kind: 'supplies' \| 'horses' \| 'envoy'\)/.test(eng), 'три диверсии');
ok(/360 \* 360\) \{ this\.floater\(u\.x, u\.y - 40, 'Подкрасться к ставке джунгар/.test(eng), 'только у ставки джунгар');
ok(/this\.waveT \+= 120;   \/\/ рейд задержан/.test(eng), 'сжечь запас: рейд +2 мин');
ok(/cav\.hp = 0; this\.burst/\.test(eng) && /kind: 'horse', x: u\.x \+ rand\(-30, 30\)/.test(eng), 'угнать табун: −конница, +лошади');
ok(/this\.envoyFreeze\[nid\] = 180;/.test(eng) && /племя 3 минуты недоступно/.test(app), 'перехват посланника: заморозка 180 с');
ok(/!this\.envoyFreeze\[nid\]\)/.test(eng), 'джунгары не вкладываются в замороженное племя');
ok(/if \(this\.envoyFreeze\[nid\] > 0\) return;   \/\/ племя заморожено/.test(eng), 'и набегами не провоцируют');
ok(/u\.sabCd = 90; this\.sound\.research\(\);/.test(eng), 'кулдаун 90 с');

console.log('\n=== 3. Контригра и HUD ===');
ok(/Math\.random\(\) < 0\.22 && this\.watchPosts\.length/.test(eng) && /Бий врага вскрыл сеть!/.test(eng) && /this\.score = Math\.max\(0, this\.score - 100\);/.test(eng), 'бий вскрывает сеть: точки + 100 очков');
ok(/scoutNet: \{ posts: number; raidSeen: boolean; raidIn: number; army: number; cd: number \};/.test(eng), 'разведсводка в HUD');
ok(/Саботаж \(п\.17\)/.test(app) && /placeWatch\(\)/.test(app), 'панель саботажа и кнопка дозора');
ok(/watchPosts: this\.watchPosts, envoyFreeze: this\.envoyFreeze,/.test(eng), 'сеть ездит в сейве');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
