// Яса — карточки политик (п.32) и эврики (п.39), 1.0.111: слоты, цена мудростью,
// эффекты в точках применения, условия-ускорения, сейв.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../src/game/config.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Яса: карточки и слоты ===');
ok(/export const YASA_POLICIES = \[/.test(eng), '6 карточек описаны данными');
ok(/readonly YASA_SLOTS = 3;/.test(eng), 'активны максимум 3');
ok(/readonly YASA_COST = 30;/.test(eng), 'включение — 30 мудрости');
ok(/if \(this\.yasaCount\(\) >= this\.YASA_SLOTS\)/.test(eng), 'лишнюю ясу не включить');
ok(/if \(this\.wisdom < this\.YASA_COST\)/.test(eng), 'без мудрости не включить');
ok(/delete this\.yasa\[id\];/.test(eng), 'снятие бесплатное');
ok(/\(k === 'o' \|\| k === 'щ'\)/.test(app), 'хоткей O (рус. Щ), дублей нет');

console.log('\n=== 2. Эффекты политик в точках применения ===');
ok(/if \(att\.owner === 'player' && this\.yasaActive\('sonzhar'\)\) dmg \*= 1\.12;/.test(eng), 'Сын жау: атака +12% в strike');
ok(/d\.trainTime \/ \(this\.yasaActive\('teznayza'\) \? 1\.2 : 1\)/.test(eng), 'Тез найза: найм −20% времени');
ok(/if \(this\.yasaActive\('zhorkor'\) && \(u\.carry\.type === 'wood' \|\| u\.carry\.type === 'food'\)\) m \*= 1\.15;/.test(eng), 'Жер қор: дерево/еда +15%');
ok(/1\.2\) \* \(this\.yasaActive\('sauda'\) \? 1\.3 : 1\);/.test(eng), 'Сауда: базар-доход +30%');
ok(/if \(this\.yasaActive\('sauda'\)\) bonus \*= 1\.3;/.test(eng), 'Сауда: караваны +30%');
ok(/if \(this\.yasaActive\('damel'\)\) r \*= 1\.2;/.test(eng), 'Дәмел: мудрость +20%');
ok(/1 \+ 0\.15 \* \(this\.yasaActive\('damel'\) \? 1\.25 : 1\) \* this\.berekePower/.test(eng), 'Дәмел: береке ×1.25');
ok(/clanMods\(this\.settings\.clan\)\.envoy \* \(this\.yasaActive\('aralas'\) \? 0\.5 : 1\)/.test(eng), 'Аралас: посланники и дары −50% (и скидка рода Керей)');

console.log('\n=== 3. Эврики (п.39) ===');
ok(/eureka\?: string; {2}\/\/ условие-ускорение/.test(cfg), 'поле eureka в TechDef');
ok((cfg.match(/eureka: '/g) || []).length === 9, 'у всех 9 техов есть условие');
ok(/techCost\(t: \{ id: string; cost:/.test(eng), 'цена теха считается через techCost');
ok(/if \(t\.id === 'wheelbarrow'\) return \{ wood: 0, food: 0, gold: 0 \};/.test(eng), 'арба по эврике — бесплатно');
ok(/Math\.round\(t\.cost\.gold \* 0\.6\)/.test(eng), 'остальные −40%');
ok(/cost: costTxt\(this\.techCost\(t\)\), time: t\.time, state,/.test(eng), 'досье технологий показывает цену со скидкой');
ok(/sharpBlades: this\.kills >= 25,/.test(eng) && /ironTools: this\.woodGathered >= 800,/.test(eng) && /wheelbarrow: farms >= 3,/.test(eng), 'условия на существующих счётчиках');
ok(/if \(!cond\[id\] \|\| this\.eurekaDone\[id\] \|\| this\.tech\[id\]\) continue;/.test(eng), 'эврика раз и только до изучения');
ok(/\{i:bulb\} Эврика!/.test(eng), 'баннер «Эврика!» при выполнении');
ok(/eureka: t\.eureka, eurekaDone: !!this\.eurekaDone\[t\.id\],/.test(eng), 'UI получает условие и его статус');

console.log('\n=== 4. Сейв ===');
ok(/yasa: this\.yasa, eureka: this\.eurekaDone,/.test(eng), 'яса и эврики пишутся в сейв');
ok(/this\.yasa = d\.yasa && typeof d\.yasa === 'object' \? d\.yasa : \{\};/.test(eng), 'старый сейв без полей — пусто (совместимость)');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
