// Төл: прирост и выпас стада (п.14), 1.0.118 — приплод, истощение, шерсть, войлок.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Приплод и выпас ===');
ok(/telBirth\(\) \{   \/\/ приплод/.test(eng) && /birth\('sheep', sheep\.length, 12\); birth\('cow', cows\.length, 8\);/.test(eng), 'приплод: овцы до 12, коровы до 8');
ok(/this\.telBirth\(\);   \/\/ төл \(п\.14\)/.test(eng), 'приплод на смене суток');
ok(/pen\.grazeDep = atPen > 0 \? Math\.min\(1, dep \+ 0\.006 \* atPen\) : Math\.max\(0, dep - 0\.004\);/.test(eng), 'истощение у загона, отдых на дальнем выпасе');
ok(/pen\.grazeDep > 0\.75 && herd\.length >= 4 && Math\.random\(\) < 0\.02\)/.test(eng), 'перевыпас → риск поветрия');
ok(/m \*= 1 - 0\.5 \* \(pen\.grazeDep \?\? 0\);/.test(eng), 'молочность падает с истощением (до −50%)');
ok(/b\.grazeDep = 0;   \/\/ көш: свежая трава \(п\.14\)/.test(eng), 'көш обновляет дёрн');
ok(/grazeDep: b\.grazeDep \?\? null/.test(eng) && /typeof \(bd as unknown as \{ grazeDep\?: number \| null \}\)\.grazeDep/.test(eng), 'grazeDep ездит в сейве');

console.log('\n=== 2. Шерсть и войлок ===');
ok(/this\.wool = Math\.min\(999, this\.wool \+ 0\.045 \* Math\.min\(sheepAll, 12\)\);/.test(eng), 'овцы дают шерсть (кап 12 голов)');
ok(/craftFelt\(kind: 'yurts' \| 'armor'\)/.test(eng), 'два войлочных апгрейда');
ok(/this\.feltYurts = true; this\.score \+= 150;/.test(eng) && /Войлочные юрты!/.test(eng), 'изоляция юрт за 12 шерсти');
ok(/u\.maxHp = Math\.round\(u\.maxHp \* 1\.12\); u\.hp = Math\.min\(u\.maxHp, Math\.round\(u\.hp \* 1\.12\)\);/.test(eng), 'доспехи: конница +12% HP');
ok(/key === 'camelry'\) && this\.feltArmor\) ageMult \*= 1\.12;/.test(eng) || /this\.feltArmor\) ageMult \*= 1\.12;/.test(eng), 'доспехи работают и на новом найме');
ok(/this\.wool = typeof d\.wool === 'number' \? d\.wool : 0;/.test(eng), 'шерсть/войлок в сейве');

console.log('\n=== 3. UI ===');
ok(/hud\.sel\.bkey === 'pen' && hud\.sel\.penUpg/.test(app), 'панель «Төл — выпас и войлок» у загона');
ok(/craftFelt\('yurts'\)/.test(app) && /craftFelt\('armor'\)/.test(app), 'кнопки крафта войлока');
ok(/hud\?\.tel\?\.hasPen/.test(app), 'чип шерсти в HUD');
ok(/penUpg\?: \{ dep: number; wool: number;/.test(eng), 'penUpg в SelSnapshot');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
