// Главы истории (п.34), 1.0.116: сценарная кампания — 3 главы, задачи, режим, сейв.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../src/game/config.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Определения глав ===');
ok(/export const CAMPAIGNS: CampaignDef\[\] = \[/.test(cfg), 'CAMPAIGNS в config');
ok(/id: 'khanate1465', part: 'Глава I', title: 'Қазақ хандығы', years: '1465'/.test(cfg), 'глава I: основание 1465 (оседлая, 2 юрты/14 душ/век/10 убийств)');
ok(/id: 'jungar1643', part: 'Глава II', title: 'Жоңғар шапқыншылығы', years: '1643'/.test(cfg), 'глава II: джунгары 1643 (кочевая: көш/конюшня/сюзеренитет/20)');
ok(/id: 'anyrakay1726', part: 'Глава III', title: 'Аңырақай шайқасы', years: '1726'/.test(cfg), 'глава III: Аңырақай 1726 (орда/2 сюзерена/ислам/40)');
ok(/mode: 'nomad', units: \[\{ key: 'horsearcher', n: 2 \}\]/.test(cfg), 'глава II учит кочевому циклу, старт с 2 атты-мергенами');
ok(/startAge: 2, give: \{ wood: 600, gold: 300 \}/.test(cfg), 'глава III стартует во 2-м веке с усиленной казной');

console.log('\n=== 2. Механика сценариев ===');
ok(/this\.campStart = opts\.campaign \? CAMPAIGNS\.find\(c => c\.id === opts\.campaign\) : undefined;/.test(eng), 'глава выбирается через опцию конструктора');
ok(/this\.settings\.mode = campDef\.mode;/.test(eng) || /if \(this\.campStart\) this\.applyCampaignStart\(\);/.test(eng), 'старт главы до генерации мира');
ok(/applyCampaignStart\(\)/.test(eng) && /this\.pushBanner\(`\{i:scroll\} \$\{def\.part\}: \$\{def\.title\}`/.test(eng), 'сценарный старт: ресурсы, возраст, юниты, баннер');
ok(/case 'suzerain': return TRIBE_IDS\.filter\(nid => this\.suzerain\(nid\) === 'player'\)\.length >= \(o\.n \?\? 0\);/.test(eng), 'задача-сюзеренитет считается');
ok(/case 'converted': return TRIBE_IDS\.filter\(nid => \(this\.faith\[nid\] \?\? 0\) >= 100\)\.length >= \(o\.n \?\? 0\);/.test(eng), 'задача-обращение по вере ≥100');
ok(/case 'kosh': return this\.koshN >= \(o\.n \?\? 0\);/.test(eng), 'задача-кёш по счётчику перекочёвок');
ok(/this\.koshN\+\+;   \/\/ глава II \(п\.34\)/.test(eng), 'кёш инкрементируется в doKosh');
ok(/if \(all && !this\.over\) this\.finish\('victory'\);/.test(eng) && /o\.done = true; this\.score \+= 200;/.test(eng), 'все задачи выполнены → победа; каждая задача +200 очков');
ok(/this\.updateCampaign\(dt\);       \/\/ главы истории/.test(eng), 'тик кампании подключён рядом с верой');

console.log('\n=== 3. UI и сейв ===');
ok(/camp\?: \{ part: string; title: string; objs: \{ t: string; done: boolean \}\[\] \};   \/\/ глава кампании/.test(eng), 'HudSnapshot.camp');
ok(/campId: this\.camp\?\.id, campTitle: this\.camp\?\.title,/.test(eng), 'статистика знает главу');
ok(/camp: this\.camp \|\| undefined, koshN: this\.koshN,/.test(eng), 'глава сохраняется вместе с партией');
ok(/this\.camp = \(d\.camp \?\? null\) as this\['camp'\];/.test(eng), 'и восстанавливается из сейва');
ok(/Главы истории<\/button>/.test(app) || / Главы истории/.test(app), 'кнопка в меню');
ok(/onPlayCampaign\(c\.id\)/.test(app) && /ПРОЙДЕНО/.test(app), 'карточки глав с отметкой прохождения');
ok(/'khanate-camp-' \+ s\.campId/.test(app), 'победа в главе пишется в localStorage');
ok(/hud\.camp\.objs\.map/.test(app), 'HUD показывает чек-лист главы');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
