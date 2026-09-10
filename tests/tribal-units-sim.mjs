// Уникальные юниты племён за сюзеренитет (п.38), 1.0.114: определения, гейт найма,
// боевые таблицы, перекраска кадров, мирза-строитель.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../src/game/config.ts', import.meta.url), 'utf8');
const px = readFileSync(new URL('../src/game/pixelart.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Определения ===');
ok(/camelry:     \{ name: 'Верблюжий лучник'/.test(cfg) && /tribeOf: 'khwarezm'/.test(cfg), 'хорезмский верблюжий лучник (конюшня)');
ok(/oghuzguard:  \{ name: 'Огузский ширбаш'/.test(cfg) && /tribeOf: 'oghuz'/.test(cfg), 'огузский тяжёлый найзагер (казармы)');
ok(/druzhinnik:  \{ name: 'Дружинник'/.test(cfg) && /tribeOf: 'russia'/.test(cfg), 'славянский дружинник (казармы)');
ok(/mirza:       \{ name: 'Бухарский мирза'/.test(cfg) && /tribeOf: 'bukhara'/.test(cfg) && /bld: 'towncenter'/.test(cfg), 'бухарский мирза-строитель (ставка)');
ok(/Найм открыт при сюзеренитете/.test(cfg), 'условие найма описано в подсказке');

console.log('\n=== 2. Гейт сюзеренитета ===');
ok(/const tribeOf = \(d as unknown as \{ tribeOf\?: string \}\)\.tribeOf;/.test(eng), 'читаем tribeOf из определения');
ok(/if \(this\.suzerain\(tribeOf\) !== 'player'\)/.test(eng), 'найм только при сюзеренитете игрока');
ok(/Нужен сюзеренитет у «\$\{ndef\?\.name \?\? tribeOf\}» \(6 посланников\)/.test(eng), 'внятная ошибка с именем народа');

console.log('\n=== 3. Боевые таблицы ===');
ok(/'horsearcher' \|\| k === 'camelry'\) return 'pierce';/.test(eng), 'camelry: тип урона pierce');
ok(/k === 'camelry'\) return 'cav';/.test(eng), 'camelry: класс брони cav (контры работают)');
ok(/k === 'oghuzguard' \|\| k === 'druzhinnik'\) return 'inf';/.test(eng), 'ширбаш/дружинник: пехота');
ok(/'falconet', 'camelry', 'oghuzguard', 'druzhinnik'\];/.test(eng), 'контры показываются в UI (COUNTER_SHOW)');

console.log('\n=== 4. Арт и строительство ===');
ok(/TRIBE_SPRITE: Partial<Record<string, UnitKey>> = \{ camelry: 'cavalry', oghuzguard: 'spearman', druzhinnik: 'swordsman', mirza: 'villager' \};/.test(px), 'кадры базовых родов');
ok(/u\.key === 'camelry'\) drawIm = tintedFrame\(im, anKey \+ '\|cm', '#b45309', 0\.30\);/.test(px), 'охра Хорезма; бордо/сталь/изумруд рядом');
ok(/u\.key === 'camelry' \|\| u\.key === 'trader' \|\| herder;/.test(px), 'camelry верхом (mounted)');
ok(/u\.key !== 'mirza'\) continue;[\s\S]{0,120}helpers \+= 2;/.test(eng), 'мирза строит как двое шаруа');
ok(/u\.key === 'camelry' \|\| u\.key === 'trader' \|\| herder;/.test(px) && /const hk = \(u\.key === 'horsearcher' \|\| u\.key === 'camelry' \? 'cavalry'/.test(px), 'HP-полоса по кадру базового рода');

console.log('\n=== 5. Док найма ===');
ok(/if \(!suz\) return null;   \/\/ племенной юнит появляется в доке только за сюзеренитет \(п\.38\)/.test(app), 'кнопки появляются только при сюзеренитете');
ok(/\?\.suzerain === 'player';/.test(app) || /suzerain === 'player'/.test(app), 'проверка сюзеренитета из hud.nations');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
