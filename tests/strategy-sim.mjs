// Чудеса природы (п.29) и стратегические ресурсы кони/железо (п.30), 1.0.109:
// расстановка, аура, контроль постройкой, требование найма, сейв.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../src/game/config.ts', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Чудеса природы: расстановка ===');
ok(/seed \* 40503\) >>> 0\)/.test(eng), 'детерминированы сидом мира');
ok(/const kinds = Object\.keys\(NAT_WONDER_DEFS\) as NatWonderKind\[\];/.test(eng), 'все 5 чудес из NAT_WONDER_DEFS');
ok(/dist2\(tx, ty, HOME\.x, HOME\.y\) < 1800 \* 1800/.test(eng), 'не вплотную к стартовым базам');
ok(/natWonders\.some\(w => dist2\(w\.x, w\.y, tx, ty\) < 2200 \* 2200\)/.test(eng), 'разнесены между собой (2200+)');
ok(/else this\.planNatWonders\(\);/.test(eng), 'старый сейв без чудес — расставляются заново');

console.log('\n=== 2. Аура благодати ===');
ok(/const WONDER_AURA = 300;/.test(eng), 'радиус ауры 300');
ok(/аура места — работа рядом с ним на 25% быстрее[\s\S]{0,240}m \*= 1\.25; break;/.test(eng), 'работа рядом с чудом +25%');
ok(/p \+= 0\.9 \* \(1 - dw \/ \(WONDER_AURA \* 1\.25\)\)/.test(eng), 'чудо давит лояльность на соседние гексы');
ok(/natSeen\.push\(w\.id\);[\s\S]{0,80}this\.score \+= 150; this\.wisdom \+= 25;/.test(eng), 'открытие: +150 очков и +25 мудрости, один раз');
ok(/drawNatWonder\(w, ix, ey\)/.test(eng), 'процедурный рендер поверх тайла');
ok(/ctx\.fillStyle = '#2dd4bf';[\s\S]{0,80}rotate\(Math\.PI \/ 4\)/.test(eng), 'бирюзовый ромб на мини-карте');

console.log('\n=== 3. Кони и железо: контроль ===');
ok(/kind: 'wood' \| 'gold' \| 'food' \| 'fish' \| 'horse' \| 'iron'/.test(eng), 'новые kind у нод');
ok(/if \(n\.kind === 'horse' \|\| n\.kind === 'iron'\) return;/.test(eng), 'шаруа не добывает стратегические ноды');
ok(/let bd = 420 \* 420;/.test(eng), 'контроль — постройка в 420 px');
ok(/this\.suzerain\('khwarezm'\) === 'player' && this\.envoyLevel\('khwarezm'\) >= 2\) c\+\+;/.test(eng), 'поставки Хорезма (сюзеренитет ур.2) закрывают нехватку');
ok(/addNode\('horse', base\.x \+ 430/.test(eng) && /addNode\('iron', base\.x - 560/.test(eng), 'гарантированный табун и жила у обеих баз');
ok(/if \(p && distHome > 900\) this\.addNode\('horse'/.test(eng) && /if \(p && distHome > 900\) this\.addNode\('iron'/.test(eng), 'дикие табуны/жилы в чанках подальше от стартов');

console.log('\n=== 4. Требование найма ===');
ok(/cavalry: \['horse'\], horsearcher: \['horse'\], knight: \['horse', 'iron'\], musketeer: \['iron'\], falconet: \['iron'\]/.test(eng), 'таблица требований юнитов');
ok(/Стройте у табуна\/жилы или заключите союз с Хорезмом/.test(eng), 'внятная ошибка при нехватке');
ok(/rallyN\.kind !== 'horse' && rallyN\.kind !== 'iron'/.test(eng), 'точка сбора не ставит шаруа на стратегическую ноду');
ok(/Нужен табун коней под контролем/.test(cfg) && /Нужны кони и железо/.test(cfg) && /Нужно железо/.test(cfg), 'требования описаны в подсказках юнитов');

console.log('\n=== 5. Сейв ===');
ok(/natW: this\.natWonders\.map\(w => \(\{ k: w\.kind, x: w\.x, y: w\.y \}\)\), natSeen: this\.natSeen,/.test(eng), 'чудеса и открытость пишутся в сейв');
ok(eng.includes('this.natWonders = d.natW.map(') && eng.includes('id: this.nextId++, kind: x.k'), 'восстановление с новыми id');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
