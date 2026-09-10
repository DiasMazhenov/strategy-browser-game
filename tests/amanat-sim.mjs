// Аманат и брачные союзы (п.18), 1.0.122 — двор, черты, наследники, предательство.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Двор и черты ===');
ok(/initCourt\(\) \{/.test(eng) && /'Төле би', role: 'biy'/.test(eng), '3 бия при дворе с чертами');
ok(/hasTrait\(t: string\): boolean/.test(eng), 'хелпер черт');
ok(/hasTrait\('Правое слово'\) \? 1\.5 : 1/.test(eng), 'Төле би: авторитет ×1,5');
ok(/hasTrait\('Острый закон'\) \? 0\.024 : 0\.02\)/.test(eng), 'Айтеке би: недовольство тает быстрее');
ok(/hasTrait\('Серебряный язык'\)\) bonus \*= 1\.05;/.test(eng), 'Казыбек би: керуены +5%');
ok(/hasTrait\('Хозяйственная'\)\) m \*= 1\.05;/.test(eng) && /hasTrait\('Воинственная'\)\) ageMult \*= 1\.08;/.test(eng) && /hasTrait\('Гостеприимная'\)\) c \+= 1;/.test(eng), '3 черты супруги работают');

console.log('\n=== 2. Аманат и предательство ===');
ok(/if \(act === 'amanat'\) \{/.test(eng) && /role: 'amanat', nation: nid/.test(eng), 'аманат через дипломатию (дружба, 150 золота)');
ok(/this\.score \+= 300; this\.sound\.coin\(\);/.test(eng), 'аманат и свадьба дают +300 очков');
ok(/betrayal\(nid: string\) \{/.test(eng) && /Аманат мёртв!/.test(eng), 'сценарий предательства');
ok(/this\.tribeRel\[other\] = this\.tribeRel\[other\] === 'friend' \? 'neutral' : 'hostile';   \/\/ молва/.test(eng), 'обвал отношений со всеми');
ok(/−400 очков, −30 авторитета/.test(eng) && /this\.score = Math\.max\(0, this\.score - 400\);/.test(eng) && /this\.authority = Math\.max\(0, this\.authority - 30\);/.test(eng), 'цена предательства: −400 очков, −30 авторитета');
ok(/t\.tribe\) \{\s*\n\s*const nidT = this\.tribeNationAt/.test(eng) || /if \(byOwner === 'player' && t\.tribe\) \{/.test(eng), 'триггер: убит воин племени с аманатом');

console.log('\n=== 3. Свадьба и наследники ===');
ok(/if \(act === 'marry'\) \{/.test(eng) && /this\.suzerain\(nid\) !== 'player'/.test(eng), 'свадьба требует сюзеренитета');
ok(/role: 'spouse', nation: nid, traits: \[trait\]/.test(eng), 'супруга с чертой из трёх');
ok(/sp\.childT && this\.time - sp\.t > 120/.test(eng) && /Родился наследник!/.test(eng), 'наследник рождается через 2 мин');
ok(/this\.time - ch\.t > 240/.test(eng) && /Наследник — батыр!/.test(eng) && /Наследник — бий!/.test(eng), 'через 4 мин: батыр (конь) или бий (+15 авторитета)');
ok(/court: this\.persons\.map\(p => \(\{ name: p\.name, role: p\.role, traits: p\.traits \}\)\),/.test(eng), 'двор в HUD');

console.log('\n=== 4. UI и сейв ===');
ok(/Просить аманат/.test(app) && /Свадебный союз/.test(app), 'кнопки в аудиенции');
ok(/Двор: \{hud\.court\.length\}/.test(app), 'чип двора в HUD');
ok(/persons: this\.persons, personN: this\.personN,/.test(eng), 'двор ездит в сейве');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
