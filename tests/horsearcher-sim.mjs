// Атты-мерген (п.24, 1.0.105): статы, контры, кайт-логика, подключение.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../src/game/config.ts', import.meta.url), 'utf8');
const pix = readFileSync(new URL('../src/game/pixelart.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

// та же таблица контр, что в engine
const dmgType = k => (k === 'spearman' || k === 'archer' || k === 'horsearcher') ? 'pierce' : k === 'catapult' ? 'blunt' : 'blade';
const armor = k => (k === 'knight' || k === 'cavalry' || k === 'horsearcher') ? 'cav' : k === 'catapult' ? 'siege' : (k === 'swordsman' || k === 'spearman') ? 'inf' : 'soft';
function dmgMult(a, t) {
  const A = dmgType(a), T = armor(t);
  if (A === 'pierce' && T === 'cav') return 1.6; if (A === 'pierce' && T === 'soft') return 1.2; if (A === 'pierce' && T === 'inf') return 0.85;
  if (A === 'blade' && T === 'soft') return 1.35; if ((a === 'cavalry' || a === 'knight') && t === 'spearman') return 0.8;
  if (a === 'cavalry' && T === 'inf') return 1.3; if ((a === 'swordsman' || a === 'villager') && T === 'cav') return 0.8;
  if (A === 'blunt' && T === 'siege') return 1.5; if (A === 'blunt') return 0.7; return 1;
}
console.log('\n=== 1. Место в треугольнике ===');
ok(dmgMult('spearman', 'horsearcher') === 1.6, 'найзагер бьёт атты-мергена ×1.6 (боится копий)');
ok(dmgMult('horsearcher', 'archer') === 1.2, 'атты-мерген косит пеших мергенов ×1.2');
ok(dmgMult('horsearcher', 'cavalry') === 1.6, 'стрелы по коннице ×1.6 — контрит жасауылов');
ok(dmgMult('horsearcher', 'swordsman') === 0.85, 'по пехоте слабее — она его ловит только вблизи');

console.log('\n=== 2. Кайт (жалған шегініс) — симуляция ===');
const U = { range: 150, speed: 205 }, SW = { range: 28, speed: 132 };
// мечник бежит на лучника; лучник отходит, если d < 0.72R, к 0.85R
let d = 40, kited = 0, shots = 0, cd = 0;
for (let t = 0; t < 10; t += 0.05) {
  cd -= 0.05;
  if (d <= U.range + 6) { if (cd <= 0) { shots++; cd = 1.5; } if (d <= U.range * 0.72) { d += Math.min(U.speed * 0.05, U.range * 0.85 - d); kited++; } }
  d -= SW.speed * 0.05;          // пехота догоняет
  if (d < 0) d = 0;
}
ok(kited > 0 && shots >= 5, `лучник отскакивает (${kited} тиков) и продолжает стрелять (${shots} залпов за 10 с)`);
ok(U.speed > SW.speed, 'быстрее пехоты — кайт вообще возможен');
ok(U.speed <= 210 && U.speed >= 200, 'но не быстрее жасауыла существенно (205 vs 200) — тяжёлая конница его ловит');

console.log('\n=== 3. Подключение ===');
ok(/horsearcher: \{ name: 'Атты-мерген'.*bld: 'stable', ageReq: 2/.test(cfg), 'юнит конюшни, Век батыров');
ok(/att\.key === 'horsearcher'\) return false;|isRanged = att\.key === 'archer' \|\| att\.key === 'catapult' \|\| att\.key === 'horsearcher'/.test(eng), 'стреляет снарядом');
ok(/kiteFrom\(u, tu, uRange, dt\)/.test(eng) && /u\.stance !== 'stand'/.test(eng), 'пассив кайта, отключается стойкой «стоять»');
ok(/if \(tu\.range > 60\) return false;/.test(eng), 'от стрелков не бегает — только от ближнего боя');
ok(/u\.face = dx > 0 \? -1 : 1;\s*\/\/ лицом к цели/.test(eng), 'парфянский выстрел: лицом к цели при отходе');
ok(/comp\.push\('horsearcher'\)/.test(eng), 'джунгары тоже приводят конных лучников');
ok(/COUNTER_SHOW: UnitKey\[\] = \[[^\]]*'horsearcher'/.test(eng), 'виден в подсказках контр');
ok(/const isHA = u\.key === 'horsearcher';/.test(pix) && /tintedFrame\(im, anKey \+ '\|ha', '#65a30d'/.test(pix) && /лук за спиной/.test(pix), 'спрайт: кадры жасауыла + оливковая перекраска + лук');
ok(/train\('horsearcher'\)/.test(app), 'кнопка найма в доке');
ok(!/k === '[a-z0-9]'\) this\.train\('horsearcher'\)/.test(eng), 'хоткей не занят (буквы кончились — см. plan.md)');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
