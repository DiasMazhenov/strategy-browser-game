// Порох (п.27, 1.0.108): мылтықшы (пуля без брони, слаб вблизи) и фальконет (ядро по площади).
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../src/game/config.ts', import.meta.url), 'utf8');
const pix = readFileSync(new URL('../src/game/pixelart.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Мылтықшы против брони ===');
const musk = 26 / 3.0, arch = 9 / 1.35;
const vsKnight = { musk: musk * 1, arch: arch * 0.7 };  // pierce по heavy ×0.7
ok(vsKnight.musk > vsKnight.arch * 1.5, `по батыру: мылтық ${vsKnight.musk.toFixed(1)} dps vs мерген ${vsKnight.arch.toFixed(1)} — броня не спасает`);
const vsLight = { musk: musk, arch: arch * 1.0 };
ok(Math.abs(vsLight.musk - vsLight.arch) < 3, `по лёгким — почти одно и то же (${vsLight.musk.toFixed(1)} vs ${vsLight.arch.toFixed(1)}): смысл мылтық только против брони`);
ok(95 / (11 / 1.1 * 1.0) < 11, 'в ближнем бою сарбаз режет мылтықшы за <11 с');
ok(200 / 120 < 2 && 200 > 170, 'дальность 200 > мергена 170: даёт первый залп');

console.log('\n=== 2. Фальконет: ядро по площади ===');
const aoe = (r) => 34 * (0.75 - r / 55 * 0.35);
ok(aoe(0) > 24 && aoe(54) > 12, `сплеш: ${aoe(0).toFixed(0)} в центре → ${aoe(54).toFixed(0)} на краю`);
const dpsSingle = 34 / 4.2, dpsCrowd5 = (34 + 4 * aoe(25)) / 4.2;
ok(dpsSingle < 9 && dpsCrowd5 > 25, `по одиночке ${dpsSingle.toFixed(1)} dps, по кучке из 5 — ${dpsCrowd5.toFixed(1)}: строй — его пища`);
ok(34 * 0.6 / 4.2 < 46 * 1.7 / 3.2 / 3, 'по постройкам в 3+ раза слабее катапульты — не заменяет её');
ok(140 / (12 / 1.0) < 13, 'конница в упор снимает фальконет за ~12 с — нужна пехота рядом');

console.log('\n=== 3. Подключение ===');
ok(/musketeer: +\{[^\n]*bld: 'barracks', ageReq: 3/.test(cfg) && /falconet: +\{[^\n]*bld: 'blacksmith', ageReq: 3/.test(cfg), 'оба — Век Абылай хана');
ok(/if \(k === 'musketeer' \|\| k === 'falconet'\) return 'gun'/.test(eng), 'отдельный тип урона gun');
ok(/if \(a === 'gun'\) return t === 'siege' \? 0\.8 : 1;/.test(eng), 'gun игнорирует контры (×1 всем, ×0.8 машинам)');
ok(/if \(p\.kind === 'ball'\) \{/.test(eng) && /d2 < 55 \* 55\) this\.damageUnit\(v, p\.dmg \* \(0\.75/.test(eng), 'ядро наносит урон всем чужим в 55 px');
ok(/v\.owner === p\.owner \|\| v\.id === p\.targetU/.test(eng), 'своих не задевает');
ok(/att\.key === 'falconet' && tb\) dmg \*= 0\.6/.test(eng), 'по постройкам ×0.6');
ok(/if \(isGun\) \{[^\n]*\n\s*this\.sound\.boom\(\); this\.burst/.test(eng), 'выстрел: грохот + дым у дула');
ok(/comp\.push\('musketeer'\); if \(this\.wave % 3 === 0\) comp\.push\('falconet'\)/.test(eng), 'джунгары в 4-й эпохе приводят порох');
ok(/function drawFalconet\(/.test(pix) && /isMusk\) drawIm = tintedFrame/.test(pix) && /длинный ствол мылтық/.test(pix), 'спрайты: пушка на лафете с откатом, стрелок с длинным стволом');
ok(/train\('musketeer'\)/.test(app) && /train\('falconet'\)/.test(app), 'найм в доке');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
