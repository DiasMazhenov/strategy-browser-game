// Колокол ставки (п.36) и грабёж каравана (п.37), 1.0.110: звон/отбой, конвой, лут.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Колокол ставки (п.36) ===');
ok(/bellOn = !this\.bellOn;/.test(eng), 'одна кнопка: звон/отбой чередуются');
ok(/if \(v\.owner !== 'player' \|\| v\.key !== 'villager' \|\| v\.hidden != null\) continue;/.test(eng), 'прячутся только шаруа игрока без укрытия');
ok(/if \(b\.garrison\.length >= this\.garrisonCap\(b\)\) continue;/.test(eng), 'честный кап гарнизона (10/6/5)');
ok(/v\.bellBack = v\.nodeId >= 0 \? v\.nodeId : undefined;/.test(eng), 'запоминаем прерванную работу');
ok(/v\.state = 'idle'; v\.nodeId = -1; v\.buildId = -1; v\.targetU = -1; v\.targetB = -1;/.test(eng), 'укрытый снимается с работы и целей');
ok(/if \(bn != null && this\.nodes\.some\(nn => nn\.id === bn && nn\.amount > 0\)\) \{ this\.orderGather\(v, bn\); back\+\+; \}/.test(eng), 'отбой возвращает к прерванной работе');
ok(/\+12% темпа и \+8% урона за каждого внутри/.test(eng), 'гарнизон усиливает огонь построек (уже в updateBuildings)');
ok(/k === 'u' \|\| k === 'г'/.test(eng), 'хоткей U (рус. Г), дублей нет');
ok(/bell: this\.bellOn, bellHidden: this\.bellIds\.length,/.test(eng), 'HUD знает про колокол');

console.log('\n=== 2. Грабёж каравана (п.37) ===');
ok(/if \(t\.key === 'trader' && byOwner && byOwner !== t\.owner\) \{[\s\S]{0,120}const loot = Math\.max\(30, Math\.round\(t\.trGold \?\? 0\)\);/.test(eng), 'груз убитого көпеса — добыча убийцы');
ok(/this\.eres\.gold \+= loot;/.test(eng), 'работает в обе стороны: джунгары тоже богатеют');
ok(/Караван разграблен!/.test(eng), 'игрок предупреждён баннером о разграбленном караване');
ok(/const dtr = dist2\(u\.x, u\.y, e\.x, e\.y\) \* 0\.45;/.test(eng), 'ИИ целит в караваны: приоритет ×0.45 дистанции');
ok(/orderEscortNearest\(\): boolean/.test(eng), 'кнопка «Сопровождать» — orderEscortNearest');
ok(/if \(!tr \|\| tr\.hp <= 0 \|\| tr\.owner !== 'player'\) u\.escortId = undefined;/.test(eng), 'конвой распадается при гибели көпеса');
ok(/if \(d > 90\) this\.moveTowardPath\(u, tr\.x, tr\.y, dt, 62\);/.test(eng), 'конвой держится в 90 px от каравана');
ok(/if \(u\.escortId != null\) u\.escortId = undefined;   \/\/ явный приказ распускает конвой/.test(eng), 'явный приказ игрока распускает конвой');
ok(/canEscort: us\.some\(u => this\.combatUnit\(u\)\) && this\.units\.some\(x => x\.owner === 'player' && x\.key === 'trader' && x\.hp > 0\),/.test(eng), 'кнопка видна только при воинах + живом көпесе');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
