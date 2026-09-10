// Хан орда (п.28), 1.0.115: золотая юрта 3-й эпохи — оборона, дропофф, найм, гарнизон.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../src/game/config.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Определение ===');
ok(/orda:       \{ name: 'Хан орда',/.test(cfg), 'orda в BUILDING_DEFS');
ok(/Золотая орда 3-й эпохи: тяжёлая оборона, точка сдачи добычи, найм батыров и атты-мергенов, гарнизон 12/.test(cfg), 'описание роли орды');
ok(/buildTime: 30, sight: 300, attack: \{ dmg: 14, range: 220, cd: 1\.2 \}, desc: 'Золотая орда/.test(cfg), 'атака как у ставке, возраст 3');

console.log('\n=== 2. Роль столицы кочевника ===');
ok(/if \(!b && altKey\) b = this\.blds\.find\(bl => bl\.owner === 'player' && bl\.key === altKey && bl\.done >= 1 && bl\.queue\.length < 5\);/.test(eng), 'найм с орды как запасной точки');
ok(/const altKey: BuildingKey \| null = \(key === 'knight' \|\| key === 'horsearcher'\) \? 'orda' : null;/.test(eng), 'батыры и атты-мергены — из орды');
ok(/b\.key !== 'towncenter' && b\.key !== 'storehouse' && b\.key !== 'orda'\) continue;   \/\/ орда — тоже дропофф/.test(eng), 'дропофф добычи');
ok(/b\.key === 'orda' \? 12 : b\.key === 'towncenter' \? 10 :/.test(eng), 'гарнизон 12 (больше, чем у ставки)');
ok(/b\.key === 'orda' \? 380 : 200;/.test(eng) && /b\.key === 'orda' \? 2\.5 : b\.key === 'house'/.test(eng), 'зона лояльности как у мавзолея');
ok(/if \(b\.key === 'orda'\) s \+= 90;/.test(eng), 'AI учитывает орду как военную силу');
ok(/if \(b\.key === 'orda' && b\.owner === 'player'\) col = '#fbbf24';/.test(eng), 'золотая метка на миникарте');

console.log('\n=== 3. Арт и док ===');
ok(/drawOrda\(b: Bld, ix: number, iy: number, selected: boolean\)/.test(eng) && /if \(b\.key === 'orda'\) \{ this\.drawOrda\(b, ix, iy, selected\); return; \}/.test(eng), 'процедурный арт подключён');
ok(/шанырак|Керегь|керегь/.test(eng) || /шанырак/.test(eng), 'шанырак в отрисовке');
ok(/Хан орда/.test(app) && /enterPlacement\('orda'\)/.test(app), 'кнопка стройки в доке (век батыров)');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
