// Керуен: караваны и живой рынок (п.16), 1.0.120 — товары, маршруты, цены, засада.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Товары и цены ===');
ok(/kervenP: Record<'wool' \| 'grain' \| 'horses', number> = \{ wool: 26, grain: 18, horses: 42 \};/.test(eng), '3 товара с базовыми ценами');
ok(/const drift = \(\) => 0\.8 \+ Math\.random\(\) \* 0\.4;/.test(eng), 'цены дышат каждый день');
ok(/26 \* drift\(\) \* \(this\.isWinter\(\) \? 1\.35 : 1\)/.test(eng), 'шерсть дороже зимой');
ok(/18 \* drift\(\) \* \(this\.season\(\) === 0 \? 1\.25 : 1\)/.test(eng), 'зерно дороже весной');
ok(/42 \* drift\(\) \* \(this\.rivalMet \? 1\.25 : 1\)/.test(eng), 'кони дороже в войну');

console.log('\n=== 2. Маршруты и риск ===');
ok(/sendCaravan\(good: 'wool' \| 'grain' \| 'horses', route: 'city' \| 'tribe'\)/.test(eng), '2 маршрута: город и племя');
ok(/u\.trGold = Math\.round\(u\.trGold \* \(0\.8 \+ this\.kervenP\[u\.trGood\] \/ 40\) \* \(u\.trRoute === 'city' \? 1\.2 : 1\)\);/.test(eng), 'живая цена × город-премия 1,2');
ok(/b\.bandit && b\.done >= 0\.5 && dist2\(b\.x, b\.y, u\.x, u\.y\) < 240 \* 240/.test(eng), 'засада у разбойничьих лагерей');
ok(/dist2\(e\.x, e\.y, u\.x, u\.y\) < 320 \* 320\);/.test(eng) && /Эскорт отогнал грабителей!/.test(eng), 'эскорт батыром = ноль потерь');
ok(/Керуен разграблен — товар потерян!/.test(eng) && /u\.trGood = undefined; u\.trRoute = undefined;   \/\/ везёт пустым/.test(eng), 'без эскорта — груз потерян');
ok(/this\.tribeRel\[u\.trNation\] = 'friend';   \/\/ караван греет отношения/.test(eng), 'приход каравана греет племя');
ok(/good === 'wool' && this\.wool < 6/.test(eng) && /good === 'grain' && this\.res\.food < 80/.test(eng) && /good === 'horses' && this\.res\.gold < 120/.test(eng), 'товар стоит ресурса (шерсть из п.14)');

console.log('\n=== 3. UI ===');
ok(/hud\.sel\.bkey === 'market' && hud\.sel\.kerven/.test(app), 'панель керуена у базара');
ok(/sendCaravan\(gk, 'tribe'\)/.test(app) && /sendCaravan\(gk, 'city'\)/.test(app), '6 кнопок: 3 товара × 2 маршрута');
ok(/керуена|Керуен \(п\.16\)/.test(app), 'цены видны в панели');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
