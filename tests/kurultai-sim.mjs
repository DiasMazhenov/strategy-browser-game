// Құрылтай: бии и төре (п.13), 1.0.117 — законы, авторитет, недовольство, откочёвка.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../src/game/config.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Законы степи ===');
ok(/export const LAW_DEFS: LawDef\[\] = \[/.test(cfg), 'LAW_DEFS в config');
ok((cfg.match(/id: '(nalog|mobil|toler|asylum|erk|asar)',\s+name: '/g) || []).length === 6, 'ровно 6 законов (≥6 по плану)');
ok(/Асар — взаимопомощь/.test(cfg) && /Степная вольница/.test(cfg), 'асар и вольница в пуле');

console.log('\n=== 2. Ритм совета и голосование ===');
ok(/if \(this\.dayNum % 4 === 0 && !this\.kurultaiDays\.has\(this\.dayNum\)\) \{ this\.kurultaiPending = true;/.test(eng), 'раз в 4 игровых суток');
ok(/if \(this\.kurultaiPending && !this\.event && !this\.over\) this\.spawnKurultai\(\);/.test(eng), 'спавн когда модалка свободна');
ok(/id: 'kurultai', icon: 'scroll', title: 'ҚҰРЫЛТАЙ — совет биев',/.test(eng), 'деф-модалка с биями');
ok(/if \(ev\.id === 'kurultai'\) \{ this\.kurultaiChoice/.test(eng), 'eventChoice ветит курултай');
ok(/Разойтись без решения', desc: 'Бии ропчут: авторитет −10, недовольство \+20'/.test(eng), 'вариант игнора с ценой');
ok(/aulDesertion\(\)/.test(eng) && /u\.owner = 'neutral'; u\.path = undefined;/.test(eng), 'недовольный аул откочёвывает');

console.log('=== 3. Законы работают ===');
ok(/law === 'toler' \? 1\.3 : 1/.test(eng), 'веротерпимость: вера +30%');
ok(/if \(this\.law === 'nalog'\) this\.res\.gold \+= 0\.5;/.test(eng), 'ясак: +0,5 золота/с');
ok(/law === 'mobil' \? 1\.25 : 1\) \/ clanMods\(this\.settings\.clan\)\.train/.test(eng), 'мобилизация: найм ×1,25 (и темп рода)');
ok(/law === 'asylum'\) c \+= 2;/.test(eng), 'убежище: +2 к населению');
ok(/law === 'erk' && u\.owner === 'player' \? 1\.08 : 1/.test(eng), 'вольница: скорость +8% (и авторитет тает вдвое)');
ok(/law === 'asar' \? 1\.15 : 1\)/.test(eng), 'асар: стройка +15%');
ok(/this\.law === 'nalog' \|\| this\.law === 'mobil'\) m \*= 0\.95;/.test(eng), 'цена казны: добыча −5%');
ok(/discontent >= 70\) m \*= 0\.9;/.test(eng), 'озлобленный аул: −10% добычи');

console.log('=== 4. Авторитет и очки ===');
ok(/authority = 50; law: string \| null = null; discontent = 0;/.test(eng), 'старт 50, поля в классе');
ok(/this\.authority = Math\.min\(100, this\.authority \+ 0\.15/.test(eng), 'копится со временем');
ok(/Math\.round\(this\.authorithy|Math\.round\(this\.authority\) \* 3/.test(eng), 'при победе уходит в очки ×3');
ok(/authority: Math\.round\(this\.authorithy|authority: Math\.round\(this\.authority\), lawName/.test(eng), 'HUD получает авторитет/закон/недовольство');
ok(/this\.authorithy = typeof d\.authorithy|this\.authority = typeof d\.authority === 'number' \? d\.authority : 50;/.test(eng), 'сейв/лоад авторитета');
ok(/Авторитет хана \(п\.13\)/.test(app), 'чип авторитета в HUD');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
