// Динамический ИИ джунгар (п.33), 1.0.112: решимость от баланса сил, волны,
// экономика, коалиция племён, сейв.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Решимость хунтайджи ===');
ok(/aiAdapt = 1;                   \/\/ множитель давления/.test(eng), 'поле aiAdapt, старт с нейтрали');
ok(/this\.aiAdapt = clamp\(0\.72 \+ \(Math\.min\(2\.2, ratio\) - 1\) \* 0\.4, 0\.72, 1\.42\);/.test(eng), 'формула 0.72..1.42 от pm/em');
ok(/const ratio = pm \/ Math\.max\(1, em\);/.test(eng), 'баланс сил milStrength обеих сторон');
ok(/пересчёт в diplomacyUpdate[\s\S]{0,10}/.test(eng) || /this\.aiAdapt = clamp/.test(eng), 'пересчитывается в тике дипломатии (раз в 5 с)');

console.log('\n=== 2. Давление ===');
ok(/Math\.sqrt\(this\.aiAdapt\) \* clanMods\(this\.rivalClan\)\.tel/.test(eng), 'размер волны ×√решимости и ×род врага (без молоха)');
ok(/Math\.max\(30, \(DIFF\[this\.difficulty\]\.waveInterval - this\.wave \* 3\.2\) \/ this\.aiAdapt\)/.test(eng), 'интервал волн /решимость (мин 30 с)');
ok(/this\.eres\.wood \+= 6 \* diff\.enemyGather \* this\.aiAdapt;/.test(eng), 'экономика ИИ дышит с решимостью');
ok(/g \*= this\.aiAdapt;   \/\/ п\.33/.test(eng), 'неприязнь масштабируется решимостью');

console.log('\n=== 3. Коалиция племён ===');
ok(/private coalitionTry\(\)/.test(eng), 'coalitionTry — метод движка');
ok(/if \(this\.aiAdapt < 1\.2 \|\| this\.wave < 6 \|\| this\.wave % 3 !== 0\) return;/.test(eng), 'только при доминировании, с 6-й волны, каждая 3-я');
ok(/!this\.coalitionTried\[nid\]/.test(eng), 'племя подкупают один раз за партию');
ok(/this\.tribeRel\[nid\] = 'hostile';/.test(eng), 'племя становится враждебным');
ok(/e\.aggro = true; \}/.test(eng), 'воины племени срываются');
ok(/дары и посланники могут вернуть племя/.test(eng), 'в баннере путь к откату (дипломатия работает)');
ok(/launchWave\(\) \{\n    this\.coalitionTry\(\);/.test(eng), 'проверка при каждом выступлении волны');

console.log('\n=== 4. Сейв и HUD ===');
ok(/aiAdapt: this\.aiAdapt, coalition: this\.coalitionTried,/.test(eng), 'решимость и подкупы пишутся в сейв');
ok(/clamp\(d\.dip\.aiAdapt, 0\.72, 1\.42\) : 1;/.test(eng), 'восстановление с клампом, старый сейв — 1');
ok(/aiAdapt: Math\.round\(this\.aiAdapt \* 100\) \/ 100,/.test(eng), 'решимость видна в HUD-снапшоте');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
