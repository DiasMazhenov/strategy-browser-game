// Род джунгар (п.12, 1.0.131): враг тоже выходит под своей таңбой.
// Проверяем НА ЖИВОМ ДВИЖКЕ (не по исходнику): жеребьёвку, бонусы вражеской
// конницы и башен, сохранение/загрузку и совместимость со старыми сейвами.
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const g = globalThis;
function mkCtx() {
  const noop = () => {};
  return new Proxy({}, {
    get: (_t, p) => {
      if (p === 'canvas') return mkCanvas();
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (p === 'getImageData') return (_x, _y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (p === 'createPattern') return () => null;
      return noop;
    }, set: () => true,
  });
}
function mkCanvas() {
  return { width: 1280, height: 720, style: {}, getContext: () => mkCtx(),
    addEventListener: () => {}, removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }), toDataURL: () => '' };
}
g.addEventListener = () => {}; g.removeEventListener = () => {}; g.window = g;
g.document = { createElement: (t) => (t === 'canvas' ? mkCanvas() : { style: {}, addEventListener: () => {}, appendChild: () => {} }),
  addEventListener: () => {}, removeEventListener: () => {}, body: { appendChild: () => {}, style: {} }, documentElement: { style: {} } };
g.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
g.devicePixelRatio = 1; g.requestAnimationFrame = () => 0; g.cancelAnimationFrame = () => {};
g.performance = g.performance ?? { now: () => Date.now() };
g.localStorage = { _v: null, getItem() { return this._v; }, setItem(_k, v) { this._v = v; }, removeItem() { this._v = null; } };
g.Image = class { constructor() { this.width = 64; this.height = 64; this.naturalWidth = 64; this.naturalHeight = 64; this.complete = true; } set src(_v) {} get src() { return ''; } };
g.Audio = class { play() { return Promise.resolve(); } pause() {} addEventListener() {} load() {} };
g.AudioContext = class { createGain() { return { connect: () => {}, gain: { value: 0, setValueAtTime: () => {} } }; }
  createOscillator() { return { connect: () => {}, start: () => {}, stop: () => {}, frequency: { value: 0, setValueAtTime: () => {} } }; }
  get destination() { return {}; } get currentTime() { return 0; } resume() {} };
g.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return mkCtx(); } };
g.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });

const dir = mkdtempSync(join(tmpdir(), 'rival-'));
const outfile = join(dir, 'engine.mjs');
await build({ stdin: {
    contents: `export { Game } from './src/game/engine';\nexport { CLANS, clanMods, randomClan, RIVAL_NOTE } from './src/game/clans';\nexport { clanBldCost, clanUnitCost, BUILDING_DEFS, UNIT_DEFS } from './src/game/config';`,
    resolveDir: process.cwd(), loader: 'ts', sourcefile: 'rival-entry.ts',
  },
  bundle: true, format: 'esm', platform: 'neutral', outfile,
  loader: { '.png': 'text', '.jpg': 'text', '.mp3': 'text', '.webp': 'text' }, logLevel: 'silent' });
const { Game, CLANS, clanMods, clanBldCost, clanUnitCost, BUILDING_DEFS, UNIT_DEFS } = await import('file://' + outfile);

let n = 0, f = 0;
const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

const IDS = CLANS.map(c => c.id);
function mkGame(opts = {}) {
  let hud = null;
  const game = new Game(mkCanvas(), { difficulty: 'normal', loadSave: false,
    onHud: (h) => { hud = h; }, onGameOver: () => {}, onPauseRequest: () => {}, ...opts });
  game.vw = 1280; game.vh = 720;
  return { game, hud: () => { game.pushHud(); return hud; } };
}


// Замеряем, сколько реально даёт каждый род, и ищем перекосы.
//
// ВАЖНО: карта при каждом запуске новая, поэтому сравнивать «прогнал партию за
// Арғын» и «прогнал за Дулата» нельзя — разница выйдет из рельефа, а не из рода.
// Мерим в ОДНОЙ партии: переключаем game.settings.clan и снимаем показания с
// одного и того же крестьянина. Так сравнимо, быстро и без шума.

const game = mkGame({ settings: { clan: 'argyn', difficulty: 'normal' } }).game;
const v = game.units.find(u => u.owner === 'player' && u.key === 'villager');
const wasWkind = v.wkind;

/** Множитель работы крестьянина при данном роде (добыча и дойка — отдельно). */
function mults(clan) {
  game.settings.clan = clan;
  v.wkind = 'chop';
  const gather = game.workMult(v);
  v.wkind = 'milk';
  const milk = game.workMult(v);
  v.wkind = wasWkind;
  return { gather, milk };
}

const NEUTRAL = 'naiman';   // у Найман нет ни добычи, ни дойки, ни стройки
const M0 = mults(NEUTRAL);

console.log('\n=== 1. Что род даёт в数字的 выражении (живой движок) ===');
const rows = [];
for (const c of CLANS) {
  const m = c.mods, M = mults(c.id);
  const cavHp = Math.round(UNIT_DEFS.cavalry.hp * m.cavHp);
  const towerHp = Math.round(BUILDING_DEFS.tower.hp * m.towerHp);
  rows.push({
    id: c.id, name: c.name,
    gather: (M.gather / M0.gather - 1) * 100,
    milk: (M.milk / M0.milk - 1) * 100,
    train: (1 - 1 / m.train) * 100,                 // «−X% времени»
    pen: (1 - clanBldCost(c.id, 'pen').wood / BUILDING_DEFS.pen.cost.wood) * 100,
    knight: (1 - clanUnitCost(c.id, 'knight').gold / UNIT_DEFS.knight.cost.gold) * 100,
    cavHp: (cavHp / UNIT_DEFS.cavalry.hp - 1) * 100,
    towerHp: (towerHp / BUILDING_DEFS.tower.hp - 1) * 100,
    build: (m.build - 1) * 100,
    wisdom: (m.wisdom - 1) * 100,
    envoy: (1 - m.envoy) * 100,
    caravan: (m.caravan - 1) * 100,
    caravanSpd: (m.caravan - 1) * 100,
    scout: (m.scout - 1) * 100,
    tel: (m.tel - 1) * 100,
  });
}
const H = ['gather', 'milk', 'train', 'pen', 'knight', 'cavHp', 'towerHp', 'build', 'wisdom', 'envoy', 'caravan', 'caravanSpd', 'scout'];
const headLine = { gather: 'добыча', milk: 'дойка', train: 'найм', pen: 'загон', knight: 'батыр', cavHp: 'конHP',
  towerHp: 'башня', build: 'стройка', wisdom: 'мудр.', envoy: 'послы', caravan: 'керДоход', caravanSpd: 'керСкор', scout: 'развед' };
console.log('  род    ' + H.map(k => headLine[k].padStart(7)).join(''));
for (const r of rows) console.log('  ' + r.name.padEnd(7) + H.map(k => (r[k] ? r[k].toFixed(1) : '—').padStart(7)).join(''));

console.log('\n=== 2. Границы и перекосы ===');
{
  const all = CLANS.flatMap(c => ['tel','penCost','caravan','scout','cavHp','knightCost','build','towerHp','wisdom','envoy','gather','train']
    .map(k => Math.abs(c.mods[k] - 1)));
  const worst = Math.max(...all);
  ok(worst <= 0.15 + 1e-9, `ни один множитель не выходит за ±15% (максимум ${(worst * 100).toFixed(1)}%)`);

  // вес домена = как часто он включается в обычной партии
  const W = { gather: 3, train: 2, cavHp: 2, build: 2, towerHp: 1.5, knight: 1.5, caravan: 1.2,
    wisdom: 1.2, pen: 0.9, tel: 0.9, milk: 0.9, scout: 0.7, envoy: 1.0, caravanSpd: 1.0 };   // envoy=1: скидка и на послов, и на дары
  const power = rows.map(r => ({ name: r.name, p: H.concat(['tel']).reduce((s, k) => s + (W[k] ?? 0) * Math.max(0, r[k] ?? 0), 0) }))
    .sort((a, b) => b.p - a.p);
  for (const x of power) console.log(`  ${x.name.padEnd(7)} сила ${x.p.toFixed(1)}`);
  const ratio = power[0].p / power[power.length - 1].p;
  console.log(`  сильный/слабый: ×${ratio.toFixed(2)}`);
  ok(ratio <= 2, `разброс сил родов не больше двукратного (сейчас ×${ratio.toFixed(2)})`);
}

console.log(`\nИтог: ${n - f} ok, ${f} fail`);
process.exit(f ? 1 : 0);
