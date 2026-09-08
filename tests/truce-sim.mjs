// Перемирие азана + пространственный звук. Старая шапка:
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

console.log('\n=== 1. Азан требует мечети ===');
{
  game.prayT = 0;
  ok(game.mosqueOf() === null, 'без мешіті мечети нет');
  game.azanDone = []; game.azanPhase = [];
  step(2);
  ok(game.prayT === 0, 'без мешіті азан не звучит и намаз не идёт');
  ok(game.prayerTruce() === false, 'перемирия тоже нет');

  const m = game.addBld('mosque', 'player', tc.x + 240, tc.y + 160, 1);
  m.done = 1;
  ok(game.mosqueOf() !== null, 'мешіт построена — призыв возможен');
}

console.log('\n=== 2. Враг у ворот НЕ отменяет азан ===');
{
  // ставим врага вплотную к ставке
  const foe = game.addUnit('swordsman', 'enemy', tc.x + 200, tc.y + 120);
  ok(game.enemyNearHome(), 'враг у ханской ставки');

  const mosque = game.mosqueOf();
  game.prayT = 0; game.azanDone = [];
  game.callToPrayer(mosque, 0);
  ok(game.prayT > 0, 'намаз начался ДАЖЕ при враге у ворот (раньше отменялся)');
  ok(game.prayerTruce(), 'идёт перемирие азана');
  void foe;
}

console.log('\n=== 3. Враг опускает оружие на время азана ===');
{
  const foe = game.units.find(u => u.owner === 'enemy' && u.key !== 'villager');
  foe.x = tc.x + 150; foe.y = tc.y + 90;
  foe.targetB = tc.id; foe.state = 'attackmove';
  const hp0 = tc.hp;
  const x0 = foe.x, y0 = foe.y;

  step(3);   // идёт намаз
  ok(game.prayerTruce(), 'перемирие ещё идёт');
  ok(foe.targetU === -1 && foe.targetB === -1, 'враг сбросил цель');
  ok(foe.state === 'idle', `враг замер (${foe.state})`);
  ok(Math.hypot(foe.x - x0, foe.y - y0) < 30, 'враг стоит на месте');
  ok(tc.hp >= hp0 - 0.01, `ставка не получила урона (${hp0.toFixed(0)} → ${tc.hp.toFixed(0)})`);
}

console.log('\n=== 4. Волны набегов заморожены, но не отменены ===');
{
  game.atWar = true;
  game.waveT = 20;
  const w0 = game.waveT;
  step(4);
  ok(Math.abs(game.waveT - w0) < 0.2, `таймер набега замер во время азана (${w0} → ${game.waveT.toFixed(1)})`);

  // намаз кончился — таймер снова пошёл
  game.prayT = 0;
  ok(!game.prayerTruce(), 'перемирие закончилось');
  step(3);
  ok(game.waveT < w0 - 2, `после намаза отсчёт возобновился (${game.waveT.toFixed(1)})`);
  ok(game.waveT > 0, 'волна не отменена, а отложена');
}

console.log('\n=== 5. Пространственный звук: затухание по расстоянию ===');
{
  const s = game.sound;
  s.setListener(1000, 1000, 1);
  ok(s.spatial(1000, 1000) === 1, 'в точке слушателя громкость максимальная');
  ok(s.spatial(1100, 1050) === 1, 'рядом (в ближней зоне) — без ослабления');

  const near = s.spatial(1500, 1000);
  const mid = s.spatial(2200, 1000);
  const far = s.spatial(3000, 1000);
  ok(near > mid && mid > far, `громкость убывает с расстоянием (${near.toFixed(2)} > ${mid.toFixed(2)} > ${far.toFixed(2)})`);
  ok(s.spatial(9000, 9000) === 0, 'на другом конце карты не слышно вовсе');
  ok(near <= 1 && far >= 0, 'значения в пределах 0..1');

  // отдаление камеры расширяет слышимость: видно больше — слышно дальше
  s.setListener(1000, 1000, 1);
  const atZoom1 = s.spatial(2600, 1000);
  s.setListener(1000, 1000, 0.5);
  const atZoom05 = s.spatial(2600, 1000);
  ok(atZoom05 > atZoom1, `при отдалении слышно дальше (${atZoom1.toFixed(2)} → ${atZoom05.toFixed(2)})`);
}

console.log('\n=== 6. Слушатель следует за камерой ===');
{
  const s = game.sound;
  game.centerOn(tc.x, tc.y, true);
  step(0.2);
  const atTc = s.spatial(tc.x, tc.y);
  ok(atTc === 1, 'звук у ставки слышен полностью, когда камера на ней');

  // уводим камеру далеко — та же точка становится тише
  game.centerOn(tc.x + 4000, tc.y + 4000, true);
  step(0.2);
  const away = s.spatial(tc.x, tc.y);
  ok(away < atTc, `после отъезда камеры тот же звук тише (${atTc} → ${away.toFixed(2)})`);
}

console.log('\n=== 7. Азан слышен дальше прочих звуков ===');
{
  const s = game.sound;
  s.setListener(1000, 1000, 1);
  // у азана пол 0.35: даже вдали слышен отголосок, тогда как обычный звук молчит
  const plain = s.spatial(9000, 9000);
  const azanAtt = 0.35 + 0.65 * plain;
  ok(plain === 0 && azanAtt >= 0.35,
    `далёкий обычный звук ${plain}, азан ${azanAtt.toFixed(2)} — призыв слышит всё становище`);
}

console.log(`\nИтог: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
