// Роды-таңба (п.12, 1.0.129): четыре рода, у каждого две пассивки в ±10–15%.
// Проверяем таблицу множителей исполнением (собираем config+clans esbuild'ом) и
// смотрим, что движок реально применяет их в нужных местах.
import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';

let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Сборка модулей родов ===');
const out = await esbuild.build({
  stdin: {
    contents: `
      export { CLANS, CLAN_BY_ID, clanMods, DEFAULT_CLAN } from './src/game/clans';
      export { clanBldCost, clanUnitCost, BUILDING_DEFS, UNIT_DEFS } from './src/game/config';
    `,
    resolveDir: process.cwd(), loader: 'ts', sourcefile: 'clans-entry.ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
});
const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const { CLANS, clanMods, clanBldCost, clanUnitCost, BUILDING_DEFS, UNIT_DEFS } = mod;

ok(CLANS.length === 4, `родов: ${CLANS.length} (${CLANS.map(c => c.name).join(', ')})`);
ok(new Set(CLANS.map(c => c.id)).size === 4, 'id уникальны');
ok(new Set(CLANS.map(c => c.tamga)).size === 4, 'у каждого рода своя таңба');

console.log('\n=== 2. Пассивки: ровно две на род, в ±15% ===');
const NEUTRAL_KEYS = ['tel', 'penCost', 'caravan', 'scout', 'cavHp', 'knightCost', 'build', 'towerHp'];
for (const c of CLANS) {
  const active = NEUTRAL_KEYS.filter(k => c.mods[k] !== 1);
  ok(active.length === 2, `${c.name}: пассивок ${active.length} (${active.join(', ')}) — «${c.perk}»`);
  const worst = Math.max(...NEUTRAL_KEYS.map(k => Math.abs(c.mods[k] - 1)));
  ok(worst <= 0.15 + 1e-9, `${c.name}: максимальное отклонение ${(worst * 100).toFixed(0)}% (держим ±15%)`);
}

console.log('\n=== 3. Конкретные бонусы ===');
const arg = clanMods('argyn');
ok(arg.tel === 1.15, `Арғын: приплод ×${arg.tel} (15% шанс двойни)`);
ok(arg.penCost === 0.85, `Арғын: загоны ×${arg.penCost}`);
const qyp = clanMods('qypshaq');
ok(qyp.caravan === 1.15 && qyp.scout === 1.15, `Қыпшақ: керуен ×${qyp.caravan}, барлаушы ×${qyp.scout}`);
const nai = clanMods('naiman');
ok(nai.cavHp === 1.1 && nai.knightCost === 0.85, `Найман: HP конницы ×${nai.cavHp}, батыр ×${nai.knightCost}`);
const uis = clanMods('uisyn');
ok(uis.build === 1.12 && uis.towerHp === 1.15, `Ұйсын: стройка ×${uis.build}, башни ×${uis.towerHp}`);

console.log('\n=== 4. Неизвестный род (старый сейв) — нейтрально ===');
const unk = clanMods('нет такого');
ok(NEUTRAL_KEYS.every(k => unk[k] === 1), 'неизвестный id → все множители 1');
ok(NEUTRAL_KEYS.every(k => clanMods(undefined)[k] === 1), 'пустой род → все множители 1');

console.log('\n=== 5. Цены: скидка рода и только там ===');
const penBase = BUILDING_DEFS.pen.cost;
const penArg = clanBldCost('argyn', 'pen');
ok(penArg.wood === Math.round(penBase.wood * 0.85), `загон: ${penBase.wood} → ${penArg.wood} дерева для Арғын`);
ok(clanBldCost('naiman', 'pen').wood === penBase.wood, 'для Найман цена загона базовая');
const houseBase = BUILDING_DEFS.house.cost;
ok(clanBldCost('argyn', 'house').wood === houseBase.wood, 'дом не дешевеет ни у кого');
const knBase = UNIT_DEFS.knight.cost;
ok(clanUnitCost('naiman', 'knight').gold === Math.round(knBase.gold * 0.85),
  `батыр: ${knBase.gold} → ${clanUnitCost('naiman', 'knight').gold} золота для Найман`);
ok(clanUnitCost('argyn', 'knight').gold === knBase.gold, 'для Арғын батыр стоит базово');
ok(clanUnitCost('naiman', 'archer').gold === UNIT_DEFS.archer.cost.gold, 'мерген не дешевеет');

console.log('\n=== 6. Движок реально применяет бонусы ===');
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const ico = readFileSync(new URL('../src/game/iconset.ts', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../src/game/config.ts', import.meta.url), 'utf8');
ok((eng.match(/clanMods\(this\.settings\.clan\)/g) || []).length >= 4,
  `движок читает множители рода: ${(eng.match(/clanMods\(this\.settings\.clan\)/g) || []).length} мест`);
ok(/u\.speed \*= cm\.scout/.test(eng), 'барлаушы быстрее (скорость в addUnit)');
ok(/u\.maxHp = Math\.round\(u\.maxHp \* cm\.cavHp\)/.test(eng), 'конница живучее (HP в addUnit)');
ok(/key === 'tower'\) \{\n[\s\S]{0,200}?cm|towerHp/.test(eng) && /clanMods\(this\.settings\.clan\)\.towerHp/.test(eng), 'башни крепче (addBld)');
ok(/b\.owner === 'player'\) rate \*= clanMods/.test(eng), 'стройка быстрее (updateBuildings)');
ok(/bonus \*= clanMods\(this\.settings\.clan\)\.caravan/.test(eng), 'керуен богаче');
ok(/cm\.tel > 1 && rand\(0, 1\) < cm\.tel - 1 \? 2 : 1/.test(eng), 'приплод: шанс двойни');
ok(/clanBldCost\(this\.settings\.clan, key\)/.test(eng) && /bldCost\(key: BuildingKey\)/.test(eng), 'цены построек через единую bldCost');
ok(/clanUnitCost\(this\.settings\.clan, item\.key\)/.test(eng), 'цена найма учитывает род');
ok(/clan: \(\(\) => \{ const c = CLAN_BY_ID/.test(eng), 'HUD отдаёт род игрока');
ok(/drawIcon\(ctx, tg, ix, iy/.test(eng), 'таңба рисуется над ставкой');

console.log('\n=== 7. Выбор рода в меню и в HUD ===');
ok(/ВЫБЕРИ СВОЙ РОД/.test(app) && /updateSettings\(\{ clan: c\.id \}\)/.test(app), 'в меню есть выбор рода');
ok(/clanUnitCost\(clan, k\)/.test(app) && /ucost\(k\)/.test(app), 'док показывает цену с учётом рода');
ok(/hud\?\.clan\?\.tamga/.test(app), 'в HUD бейдж рода');
ok(/clan: ClanId/.test(cfg) && /clan: DEFAULT_CLAN/.test(cfg), 'род — часть настроек (сохраняется)');
ok(['tamga-argyn', 'tamga-qypshaq', 'tamga-naiman', 'tamga-uisyn'].every(k => ico.includes(`'${k}'`)), '4 таңбы в наборе иконок');

console.log(`\nИтог: ${n - f} ok, ${f} fail`);
process.exit(f ? 1 : 0);
