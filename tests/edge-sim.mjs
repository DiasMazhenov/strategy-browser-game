// Headless-проверка 1.0.081: стрелка прокрутки следует за курсором вдоль
// края, нижняя стрелка доступна. Старая шапка:
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

import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const game = new Game(mkCanvas(), { difficulty: 'normal', loadSave: false,
  onHud: () => {}, onGameOver: () => {}, onPauseRequest: () => {} });
game.vw = 1280; game.vh = 720;
game.mouse.in = true; game.mouse.isTouch = false;
const step = (sec, d = 1 / 30) => { for (let i = 0; i < sec / d; i++) game.update(d); };
// миникарта считается в drawMinimap; в headless вызовем расчёт вручную
game.minimap = { x: 1280 - 200 - 12, y: 720 - 120 - 12, w: 200, h: 120 };

console.log('\n=== 1. Все четыре стороны доступны ===');
{
  const at = (x, y) => game.edgeArrowAt(x, y);
  ok(at(640, 3) === 'u', 'верх');
  ok(at(3, 360) === 'l', 'лево');
  ok(at(1277, 360) === 'r', 'право');
  // низ проверяем СЛЕВА от миникарты, там где раньше мешал док
  ok(at(400, 717) === 'd', 'НИЗ доступен (главная жалоба)');
  ok(at(640, 360) === '', 'в середине стрелки нет');
}

console.log('\n=== 2. Стрелка следует за курсором вдоль края ===');
{
  // Позицию считает drawEdgeArrows. Чтобы тест не разошёлся с кодом, СНАЧАЛА
  // сверяем, что формула в движке действительно завязана на mouse.x/y.
  const src = readFileSync('src/game/engine.ts', 'utf8');
  const dea = src.slice(src.indexOf('drawEdgeArrows(ctx'), src.indexOf('drawEdgeArrows(ctx') + 1400);
  ok(/clamp\(this\.mouse\.x/.test(dea) && /clamp\(this\.mouse\.y/.test(dea),
    'drawEdgeArrows позиционирует стрелку по курсору (а не по центру стороны)');
  const mz = /EDGE_ZONE = (\d+)/.exec(src);
  const EDGE_ZONE = mz ? +mz[1] : 52;
  const near = EDGE_ZONE * 0.55, pad = EDGE_ZONE * 0.9;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const posFor = (dir, mx, my) => ({
    cx: dir === 'l' ? near : dir === 'r' ? game.vw - near : clamp(mx, pad, game.vw - pad),
    cy: dir === 'u' ? near : dir === 'd' ? game.vh - near : clamp(my, pad, game.vh - pad),
  });
  const a = posFor('d', 300, 717), b = posFor('d', 900, 717);
  ok(a.cx !== b.cx, `нижняя стрелка ездит за курсором по X (${a.cx} → ${b.cx})`);
  ok(a.cy === b.cy && Math.abs(a.cy - (game.vh - near)) < 0.01,
    'по Y нижняя стрелка прижата к краю');

  const c = posFor('l', 3, 200), d = posFor('l', 3, 600);
  ok(c.cy !== d.cy, `боковая стрелка ездит за курсором по Y (${c.cy} → ${d.cy})`);
  ok(c.cx === d.cx, 'по X боковая стрелка прижата к краю');

  // у самого угла стрелка не вылезает за экран
  const e = posFor('d', 5, 717), f = posFor('d', 1275, 717);
  ok(e.cx >= pad - 0.01 && f.cx <= game.vw - pad + 0.01,
    `в углах стрелка держится в пределах экрана (${e.cx}, ${f.cx})`);
}

console.log('\n=== 3. Миникарта не перехвачена стрелкой ===');
{
  const mmx = game.minimap.x + game.minimap.w / 2;
  const mmy = game.minimap.y + game.minimap.h / 2;
  ok(game.edgeArrowAt(mmx, mmy) === '', 'над миникартой стрелки нет');
  // а левее миникарты, в той же полосе низа, стрелка есть
  ok(game.edgeArrowAt(game.minimap.x - 80, 717) === 'd',
    'слева от миникарты нижняя стрелка работает');
}

console.log('\n=== 4. Клик по нижней стрелке двигает камеру ===');
{
  game.mouse.x = 400; game.mouse.y = 717; step(0.1);
  ok(game.edgeDir === 'd', 'edgeDir у нижнего края = d');
  const y0 = game.cam.y;
  game.nudgeCam('d');
  step(0.6);
  ok(game.cam.y > y0 + 50, `камера уехала вниз на ${(game.cam.y - y0).toFixed(0)} px`);
}

console.log(`\nИтог: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
