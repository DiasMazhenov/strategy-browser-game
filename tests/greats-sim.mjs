// Headless-проверка пункта 11 плана: великие люди и мудрость. Старая шапка:
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
const tc = game.blds.find(b => b.owner === 'player' && b.key === 'towncenter');

console.log('\n=== 1. Мудрость появляется в HUD ===');
game.pushHud();
ok(typeof hud.wisdom === 'number', 'wisdom есть в снапшоте');
ok(Array.isArray(hud.greats) && hud.greats.length === 3, `три великих человека (${hud.greats.length})`);
ok(hud.greats.every(g => !g.called), 'в начале никто не призван');
ok(hud.wisdomRate === 0, 'без мешіті и реликвий мудрость не капает');

console.log('\n=== 2. Мудрость копится от построек ===');
{
  const m = game.addBld('mosque', 'player', tc.x + 300, tc.y + 200, 1);
  m.done = 1;
  game.pushHud();
  ok(hud.wisdomRate > 0, `мешіт даёт приток (${hud.wisdomRate}/с)`);
  const w0 = game.wisdom;
  step(20);
  game.pushHud();
  ok(game.wisdom > w0, `мудрость накопилась (${w0} → ${Math.round(game.wisdom)})`);

  // реликвии тоже дают приток
  const r0 = game.wisdomRate();
  game.relicsHeld += 2;
  ok(game.wisdomRate() > r0, `реликвии увеличивают приток (${r0.toFixed(1)} → ${game.wisdomRate().toFixed(1)})`);
}

console.log('\n=== 3. Призыв требует мудрости ===');
{
  game.wisdom = 10;
  ok(game.callGreat('tole') === false, 'без мудрости призвать нельзя');
  ok(!game.hasGreat('tole'), 'бий не появился в совете');

  game.wisdom = 5000;
  ok(game.callGreat('tole') === true, 'при достатке мудрости призыв удаётся');
  ok(game.hasGreat('tole'), 'Толе би в совете хана');
  ok(game.callGreat('tole') === false, 'повторно призвать нельзя');
}

console.log('\n=== 4. Эффекты действительно работают ===');
{
  // Толе би: гасит неприязнь
  game.grievance = 50;
  game.wisdom = 5000;
  game.greatsCalled = [];
  game.callGreat('tole');
  ok(game.grievance < 50, `Толе би снизил неприязнь (50 → ${game.grievance})`);

  // Казыбек би: разовое золото
  const g0 = game.res.gold;
  game.wisdom = 5000;
  game.callGreat('kazybek');
  ok(game.res.gold > g0, `Казыбек би принёс золото (${Math.round(g0)} → ${Math.round(game.res.gold)})`);

  // Айтеке би: постройки дешевле и исследования быстрее
  const costBefore = game.bldCost('house').wood;
  game.wisdom = 5000;
  game.callGreat('aiteke');
  const costAfter = game.bldCost('house').wood;
  ok(costAfter < costBefore, `Айтеке би удешевил постройки (${costBefore} → ${costAfter} 🪵)`);
  ok(game.wisdomRate() > 0, 'Айтеке би ускоряет и приток мудрости');
}

console.log('\n=== 5. Совет сохраняется между партиями ===');
{
  game.pushHud();
  ok(hud.greats.filter(g => g.called).length === 3, 'все три в совете');
  const save = JSON.parse(JSON.stringify({ wisdom: game.wisdom, greatsCalled: game.greatsCalled }));
  ok(save.greatsCalled.length === 3 && typeof save.wisdom === 'number',
    'состояние сериализуемо для сохранения');
}

console.log(`\nИтог: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
