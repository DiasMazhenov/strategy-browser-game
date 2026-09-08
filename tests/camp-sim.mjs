// Headless-проверка пунктов 2-4 на НАСТОЯЩЕМ движке:
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

const tc = game.blds.find(b => b.owner === 'player' && b.key === 'towncenter');
const CELL = 32;

console.log('\n=== Казан и алтыбакан у ханской ставки ===');
const props = game.campProps();
ok(props.length === 2, `две декорации (получено ${props.length})`);
for (const p of props) {
  const cells = Math.hypot(p.x - tc.x, p.y - tc.y) / CELL;
  const name = p.kind === 'kazan' ? 'казан' : 'алтыбакан';
  const [lo, hi] = p.kind === 'kazan' ? [2, 3] : [7, 8];
  ok(cells >= lo && cells <= hi, `${name}: ${cells.toFixed(1)} клетки (требуется ${lo}-${hi})`);
}

// декорации обязаны быть НА ПОСТОЯНКЕ — переживать сотни кадров без отдыхающих
const before = JSON.stringify(game.campProps());
for (let i = 0; i < 30 * 120; i++) game.update(1 / 30);
const after = JSON.stringify(game.campProps());
ok(before === after, 'позиция не меняется за 2 минуты игры (объекты постоянные)');
ok(game.campProps().length === 2, 'декорации никуда не исчезли после прогона');

// и не зависят от того, отдыхает ли кто-то
const anyResting = game.units.filter(u => u.resting).length;
ok(game.campProps().length === 2, `стоят независимо от отдыхающих (сейчас отдыхает: ${anyResting})`);

console.log('\n=== Плашка волны ===');
// pushHud() вызывается из frame() раз в 0.12 с; здесь мы крутим update()
// напрямую, поэтому снимок запрашиваем явно.
game.atWar = false;
game.pushHud();
ok(hud !== null, 'HUD получен');
ok(hud.atWar === false, 'в мирное время HudSnapshot.atWar = false → плашка скрыта');

// Объявляем войну. ВАЖНО: за время прогона ИИ может сам запросить мир
// (sueForPeace(auto)), поэтому проверяем снимок сразу, не гоняя лишние кадры.
game.atWar = true;
game.warT = 999; game.peaceT = 0;
game.pushHud();
ok(hud.atWar === true, `в войну atWar = true → плашка показывается (atWar движка: ${game.atWar})`);
ok(typeof hud.nextWave === 'number', `отсчёт до волны есть в снимке (${hud.nextWave}с)`);

console.log(`\nИтог: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
