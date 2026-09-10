// Лагеря бандитов (п.25, 1.0.106): расстановка, набеги, лут, респавн, сейв.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Расстановка ===');
ok(/const want = 8 \+ \(\(rng\(\) \* 5\) \| 0\);/.test(eng), '8–12 стоянок');
ok(/rad = 2200 \+ rng\(\) \* 2800/.test(eng), 'кольцо 2.2–5 км от баз — разведчик находит, рейды достают');
ok(/dist2\(b\.x, b\.y, x, y\) < 900 \* 900\)\) continue;/.test(eng), 'не ближе 900 px к другим постройкам');
ok(/this\.planBanditCamps\(\);\s*\}\s*\/\/ Стоянки разбойников/.test(eng), 'планируются вместе с племенами');
ok(/mulberry32Like\(\(this\.terrain\.seed \* 2654435761\) >>> 0\)/.test(eng), 'детерминированы сидом мира');

console.log('\n=== 2. Поведение ===');
ok(/g\.bandit = true; g\.campId = hut\.id; g\.aggro = true;/.test(eng), 'разбойники агрессивны сразу (не как племя)');
ok(/if \(v\.key !== 'villager' \|\| v\.owner === 'neutral' \|\| v\.hidden\) continue;/.test(eng), 'цель набега — шаруа ЛЮБОЙ стороны (общая беда)');
ok(/b\.raidT = 110 \+ Math\.random\(\) \* 80;/.test(eng), 'набег раз в 110–190 с');
ok(/if \(gang\.length < 2\) continue;/.test(eng), 'полуразбитая шайка (1 боец) в набег не ходит');
ok(/this\.raiseAlert\(best\.x, best\.y, 'Набег разбойников'\)/.test(eng), 'тревога при набеге на игрока');
ok(/\} else if \(u\.bandit\) \{[\s\S]*?u\.tx = u\.homeX; u\.ty = u\.homeY;/.test(eng), 'после набега возвращаются к юрте');
ok(/!e\.tribe && !e\.bandit && u\.state !== 'attackmove'/.test(eng), 'разбойников бьют в авто-обороне, как волков');

console.log('\n=== 3. Лут и зачистка ===');
ok(/if \(b\.bandit && byOwner !== 'neutral'\) \{/.test(eng), 'лут — кто снёс, тому и достаётся (и джунгарам тоже)');
ok(/roll < 0\.45[\s\S]*?res\.gold \+= g/.test(eng) && /res\.food \+= fd/.test(eng) && /this\.relicsHeld\+\+/.test(eng) && /addUnit\('villager', byOwner/.test(eng), '4 вида добычи: золото / скот / реликвия / пленные');
ok(/roll < 0\.9 && byOwner === 'player'\) \{ this\.relicsHeld\+\+/.test(eng), 'реликвия только игроку (у ИИ нет счётчика)');
ok(/for \(const g of this\.units\) if \(g\.bandit && g\.campId === b\.id\) \{ g\.hp = 0;/.test(eng), 'остатки шайки разбегаются при сносе юрты');
ok(/this\.score \+= 150;/.test(eng), '+150 очков за стоянку');

console.log('\n=== 4. Респавн и сейв ===');
ok(/this\.banditRespawnT = this\.DAY_LEN \* 2;/.test(eng) && /if \(alive < 8\)/.test(eng), 'респавн не чаще 1 стоянки в 2 суток, кап 8');
ok(/bandit: b\.bandit \|\| undefined, raidT: b\.raidT/.test(eng) && /bandit: u\.bandit \|\| undefined, campI:/.test(eng), 'юрты и разбойники пишутся в сейв с привязкой');
ok(/if \(xb\.tribe\) \{ b\.tribe = true;/.test(eng) && /if \(x\.tribe\) \{ u\.tribe = true;/.test(eng), 'попутно: флаги племён теперь тоже переживают загрузку');
ok(/if \(!this\.blds\.some\(b => b\.bandit\)\) this\.planBanditCamps\(\);/.test(eng), 'старый сейв без стоянок — расставляются заново');

console.log('\n=== 5. Визуал ===');
ok(/else if \(b\.bandit\) col = '#1f2937';/.test(eng), 'чёрная метка на мини-карте');
ok(/тёмная юрта: затемнение поверх спрайта/.test(eng) && /drawIcon\(ctx, 'skull'/.test(eng), 'затемнённая юрта с чёрным бунчуком и черепом');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
