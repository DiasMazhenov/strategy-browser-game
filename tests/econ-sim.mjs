// Headless-проверка пункта 6 плана: сводка экономики в HUD. Старая шапка:
//   казан      — постоянно в 2-3 клетках от ханской ставки
//   алтыбакан  — постоянно в 7-8 клетках
//   плашка волны — скрыта в мирное время, видна в войну
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
g.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
g.Image = class { constructor() { this.width = 64; this.height = 64; this.naturalWidth = 64; this.naturalHeight = 64; this.complete = true; } set src(_v) {} get src() { return ''; } };
g.Audio = class { play() { return Promise.resolve(); } pause() {} addEventListener() {} load() {} };
g.AudioContext = class { createGain() { return { connect: () => {}, gain: { value: 0, setValueAtTime: () => {} } }; }
  createOscillator() { return { connect: () => {}, start: () => {}, stop: () => {}, frequency: { value: 0, setValueAtTime: () => {} } }; }
  get destination() { return {}; } get currentTime() { return 0; } resume() {} };
g.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return mkCtx(); } };
g.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });

const dir = mkdtempSync(join(tmpdir(), 'camp-'));
const outfile = join(dir, 'engine.mjs');
await build({ entryPoints: ['src/game/engine.ts'], bundle: true, format: 'esm', platform: 'neutral',
  outfile, loader: { '.png': 'text', '.jpg': 'text', '.mp3': 'text', '.webp': 'text' }, logLevel: 'silent' });
const { Game } = await import('file://' + outfile);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

let hud = null;
const game = new Game(mkCanvas(), { difficulty: 'normal', loadSave: false,
  onHud: (h) => { hud = h; }, onGameOver: () => {}, onPauseRequest: () => {} });
game.vw = 1280; game.vh = 720;
const step = (sec, d = 1 / 30) => { for (let i = 0; i < sec / d; i++) game.update(d); };

console.log('\n=== 1. Сводка приходит в HUD ===');
step(1); game.pushHud();
ok(!!hud.econ, 'econ есть в снапшоте');
const vills = game.units.filter(u => u.owner === 'player' && u.key === 'villager').length;
ok(hud.econ.total === vills, `total = число шаруа (${hud.econ.total} = ${vills})`);

console.log('\n=== 2. Сумма частей равна целому ===');
{
  const sum = hud.econ.wood + hud.econ.food + hud.econ.gold + hud.econ.build
    + hud.econ.idle + hud.econ.rest;
  ok(sum === hud.econ.total, `wood+food+gold+build+idle+rest = total (${sum} = ${hud.econ.total})`);
  ok(Object.values(hud.econ).every(v => v >= 0), 'нет отрицательных значений');
}

console.log('\n=== 3. Цифры отражают реальную занятость ===');
{
  // отправим троих на лес и проверим, что счётчик вырос
  const wood = game.nodes.filter(n => n.kind === 'wood' && n.amount > 0)[0];
  const free = game.units.filter(u => u.owner === 'player' && u.key === 'villager' && !u.resting).slice(0, 3);
  free.forEach(v => game.orderGather(v, wood.id));
  step(2); game.pushHud();
  ok(hud.econ.wood >= 3, `после приказа на лес на дереве ≥3 шаруа (${hud.econ.wood})`);

  // несущий груз домой всё ещё числится за промыслом (считаем по намерению)
  const carrier = free[0];
  carrier.state = 'return'; carrier.carry = { type: 'wood', amt: 10 };
  game.pushHud();
  ok(hud.econ.wood >= 3, 'несущий груз домой не выпадает из сводки (state=return)');
}

console.log('\n=== 4. Процент простоя ===');
{
  ok(hud.econ.idlePct >= 0 && hud.econ.idlePct <= 100, `idlePct в пределах 0..100 (${hud.econ.idlePct})`);
  // считается от работоспособных, а не от всех: отдыхающие ночью не «простой»
  const able = hud.econ.total - hud.econ.rest;
  const expect = able > 0 ? Math.round((hud.econ.idle / able) * 100) : 0;
  ok(hud.econ.idlePct === expect, `idlePct считается от работоспособных (${hud.econ.idlePct} = ${expect})`);

  // искусственно отправим всех отдыхать — процент не должен стать 100
  const all = game.units.filter(u => u.owner === 'player' && u.key === 'villager');
  all.forEach(u => { u.resting = true; });
  game.pushHud();
  ok(hud.econ.idlePct === 0, `когда все отдыхают, простой 0 %, а не 100 % (${hud.econ.idlePct})`);
  ok(hud.econ.rest === all.length, `все учтены как отдыхающие (${hud.econ.rest})`);
  all.forEach(u => { u.resting = false; });
}

console.log('\n=== 5. Клик по строке выделяет шаруа промысла ===');
{
  const wood = game.nodes.filter(n => n.kind === 'wood' && n.amount > 0)[0];
  const free = game.units.filter(u => u.owner === 'player' && u.key === 'villager' && !u.resting).slice(0, 4);
  free.forEach(v => game.orderGather(v, wood.id));
  step(1); game.pushHud();
  const nWood = hud.econ.wood;

  game.tradeSelect('wood');
  ok(game.selected.size === nWood,
    `выделено ровно столько, сколько показано в сводке (${game.selected.size} = ${nWood})`);

  // выделены именно дровосеки
  const sel = [...game.selected].map(id => game.units.find(u => u.id === id));
  ok(sel.every(u => u && u.key === 'villager'), 'выделены только шаруа');

  game.tradeSelect('build');
  const nBuild = hud.econ.build;
  ok(game.selected.size === nBuild, `стройка: выделено ${game.selected.size}, в сводке ${nBuild}`);
}

console.log(`\nИтог: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
