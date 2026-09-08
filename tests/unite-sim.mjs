// Headless-проверка пункта 9 плана: победа «Объединение степи». Старая шапка:
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

let hud = null, over = null;
const game = new Game(mkCanvas(), { difficulty: 'normal', loadSave: false,
  onHud: (h) => { hud = h; }, onGameOver: (s) => { over = s; }, onPauseRequest: () => {} });
game.vw = 1280; game.vh = 720;
const step = (sec, d = 1 / 30) => { for (let i = 0; i < sec / d; i++) game.update(d); };
// Племена НЕ записаны в tribeRel до первой встречи — читаем канонический список
// прямо из nations.ts (Node не грузит .ts, поэтому парсим id регуляркой).
const natSrc = readFileSync('src/game/nations.ts', 'utf8');
// id и kind лежат на РАЗНЫХ строках объекта, поэтому идём по тексту:
// запоминаем последний встреченный id и фиксируем его, когда встретим kind:'tribe'.
const TRIBES = [];
{
  let lastId = null;
  for (const line of natSrc.split('\n')) {
    const mi = /^\s*id:\s*'([\w-]+)'/.exec(line);
    if (mi) { lastId = mi[1]; continue; }
    if (/^\s*kind:\s*'tribe'/.test(line) && lastId) { TRIBES.push(lastId); lastId = null; }
  }
}
if (!TRIBES.length) { console.log('  FAIL не удалось прочитать список племён'); process.exit(1); }
console.log('  (племён в игре: ' + TRIBES.length + ')');

// делаем игрока сюзереном n племён: посланников больше, чем у джунгар
function makeSuzerain(n) {
  let done = 0;
  for (const nid of TRIBES) {
    if (done >= n) { game.envoys[nid] = 0; game.rivalEnvoys[nid] = 0; continue; }
    game.tribeMet[nid] = true;
    game.tribeRel[nid] = 'friend';
    game.envoys[nid] = 9; game.rivalEnvoys[nid] = 0;
    done++;
  }
  return done;
}

console.log('\n=== 1. Механика сюзеренитета читается ===');
{
  game.pushHud();
  ok(!!hud.unite, 'unite есть в HUD');
  ok(hud.unite.need === 5, `нужно ${hud.unite.need} народов`);
  ok(hud.unite.hold === 180, `удержать ${hud.unite.hold} с`);
  ok(hud.unite.have === 0, 'в начале партии сюзеренитета нет');
}

console.log('\n=== 2. Отсчёт идёт только при собранном союзе ===');
{
  const got = makeSuzerain(4);          // на один меньше, чем нужно
  game.pushHud();
  ok(hud.unite.have === Math.min(4, got), `под рукой ${hud.unite.have} народов (нужно 5)`);
  step(10); game.pushHud();
  ok(hud.unite.t === 0, 'при нехватке народов отсчёт не идёт');

  makeSuzerain(5);
  step(5); game.pushHud();
  ok(hud.unite.have >= 5, `союз собран: ${hud.unite.have}`);
  ok(hud.unite.t > 0, `отсчёт пошёл (${hud.unite.t} с)`);
}

console.log('\n=== 3. Распад союза откатывает прогресс, а не обнуляет ===');
{
  step(20); game.pushHud();
  const before = hud.unite.t;
  ok(before > 20, `накоплено ${before} с`);

  makeSuzerain(3);                       // союз распался
  step(4); game.pushHud();
  const after = hud.unite.t;
  ok(after < before, `прогресс откатывается (${before} → ${after})`);
  ok(after > 0, 'но не обнуляется мгновенно — одна потеря не стирает всё');
  ok(before - after <= 4, `откат медленнее набора (потеряно ${(before - after).toFixed(0)} с за 4 с)`);
}

console.log('\n=== 4. Враждебное племя не засчитывается ===');
{
  makeSuzerain(5);
  game.pushHud();
  const withAll = hud.unite.have;
  const first = Object.keys(game.tribeRel)[0];
  game.tribeRel[first] = 'hostile';
  game.pushHud();
  ok(hud.unite.have === withAll - 1,
    `враждебное племя выпадает из союза (${withAll} → ${hud.unite.have})`);
  game.tribeRel[first] = 'friend';
}

console.log('\n=== 5. Удержание союза приводит к победе ===');
{
  makeSuzerain(7);
  game.uniteT = game.UNITE_HOLD - 2;     // почти удержали
  step(4);
  ok(game.over === 'victory', `победа дипломатией (${game.over})`);
  // onGameOver вызывается через setTimeout(900) — ждём реального таймера,
  // прокрутка игровых кадров его не приблизит
  await new Promise(r => setTimeout(r, 1100));
  ok(over !== null, 'колбэк onGameOver вызван');
  ok(over && over.result === 'victory', 'результат передан в UI');
}

console.log(`\nИтог: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
