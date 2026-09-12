// Headless-проверка 1.0.137: камера и мини-карта на телефоне.
//
// Проверяем поведение, а не разметку: гоним в движок настоящие pDown/pMove/pUp
// с pointerType 'touch' на canvas 414×896 и смотрим, что делает камера.
// Три вещи, из-за которых «перемещение работало неправильно»:
//   1) мини-карта перехватывала касание и телепортировала камеру — в правом
//      нижнем углу панорамы не было вовсе;
//   2) стены и ворота нельзя было тянуть: палец всегда двигал камеру;
//   3) после отрыва пальца камера вставала мгновенно — без доката.
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
function mkCanvas(w = 414, h = 896) {
  return { width: w, height: h, style: {}, getContext: () => mkCtx(),
    addEventListener: () => {}, removeEventListener: () => {}, setPointerCapture: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }), toDataURL: () => '' };
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
// иконки рисуются через Path2D — в Node его нет
g.Path2D = class { constructor() {} addPath() {} moveTo() {} lineTo() {} closePath() {} arc() {} rect() {} bezierCurveTo() {} quadraticCurveTo() {} };
g.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });

const dir = mkdtempSync(join(tmpdir(), 'mcam-'));
const outfile = join(dir, 'engine.mjs');
await build({ entryPoints: ['src/game/engine.ts'], bundle: true, format: 'esm', platform: 'neutral',
  outfile, loader: { '.png': 'text', '.jpg': 'text', '.mp3': 'text', '.webp': 'text' }, logLevel: 'silent' });
const { Game } = await import('file://' + outfile);

const W = 414, H = 896;                      // iPhone XR/11 в CSS-пикселях
let hud = null;
const game = new Game(mkCanvas(W, H), { difficulty: 'normal', loadSave: false,
  onHud: (h) => { hud = h; }, onGameOver: () => {}, onPauseRequest: () => {} });
game.vw = W; game.vh = H;
const ctx = mkCtx();
game.drawMinimap(ctx);                       // заодно двигатель кладёт rect карты в game.minimap

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const T = (x, y, extra = {}) => ({ pointerId: 1, clientX: x, clientY: y, button: 0,
  pointerType: 'touch', shiftKey: false, preventDefault() {}, stopPropagation() {}, ...extra });
const tap = (x, y) => { game.pDown(T(x, y)); game.pUp(T(x, y)); };
const drag = (x0, y0, x1, y1, steps = 4) => {
  game.pDown(T(x0, y0));
  for (let i = 1; i <= steps; i++) game.pMove(T(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps));
  game.pUp(T(x1, y1));
};

console.log('\n=== 1. Мини-карта на телефоне — чип, а не панель ===');
{
  const mm = game.minimap;
  ok(Math.round(mm.w) === 96, `ширина чипа 96px (получилось ${Math.round(mm.w)})`);
  ok(mm.x >= 0 && mm.x + mm.w <= W && mm.y >= 0 && mm.y + mm.h <= H, 'чип целиком влезает в экран');
  ok(mm.y + mm.h <= H - 100, `чип поднят над доком (низ ${Math.round(mm.y + mm.h)} из ${H})`);
  const x0 = game.cam.x, y0 = game.cam.y;
  tap(mm.x + mm.w / 2, mm.y + mm.h / 2);
  ok(Math.abs(game.cam.x - x0) < 1 && Math.abs(game.cam.y - y0) < 1,
    'касание чипа не телепортирует камеру (раньше прыгало сразу)');
  ok(game.minimapOpen === true, 'тап по чипу раскрывает карту');
}

console.log('\n=== 2. Протяжка от чипа двигает камеру ===');
{
  game.minimapOpen = false;
  game.drawMinimap(ctx);
  const mm = game.minimap;
  const x0 = game.cam.x, y0 = game.cam.y;
  drag(mm.x + 10, mm.y + 10, mm.x - 60, mm.y - 60);
  const moved = Math.hypot(game.cam.x - x0, game.cam.y - y0);
  ok(game.minimapOpen === false, 'протяжка не раскрывает карту (это не тап)');
  ok(moved > 20, `камера поехала за пальцем (${moved.toFixed(0)} ед.)`);
  ok(moved < 3000, 'камера не улетела на другой край мира');
}

console.log('\n=== 3. Раскрытая карта: внутри — перелёт, снаружи — закрыть ===');
{
  game.minimapOpen = true;
  game.drawMinimap(ctx);
  const mm = game.minimap;
  ok(mm.w > 300, `раскрытая карта шире чипа (${Math.round(mm.w)}px)`);
  ok(mm.h <= H * 0.5 + 1, `карта не выше половины экрана (${Math.round(mm.h)} из ${H})`);
  tap(mm.x + mm.w / 2, mm.y + mm.h / 2);
  ok(Math.abs(game.cam.x - 24000) < 300 && Math.abs(game.cam.y - 24000) < 300,
    `тап в центр карты — камера в центре мира (${Math.round(game.cam.x)}, ${Math.round(game.cam.y)})`);
  ok(game.minimapOpen === true, 'карта осталась раскрытой');
  tap(12, 200);
  ok(game.minimapOpen === false, 'тап вне карты закрывает её');
}

console.log('\n=== 4. Стена и ворота: палец тянет линию, а не камеру ===');
{
  // стена стоит дерева — без ресурсов движок режим просто не включит
  game.res.wood = 9999; game.res.food = 9999; game.res.gold = 9999;
  game.enterPlacement('wall');
  // rect карты в движке обновляется на отрисовке — в игре она каждый кадр,
  // в тесте её надо позвать руками после смены состояния
  game.drawMinimap(ctx);
  ok(game.placement === 'wall', 'режим постройки стены включён');
  const x0 = game.cam.x, y0 = game.cam.y;
  game.pDown(T(200, 400));
  ok(game.wallDrag !== null, 'касание начало линию стены');
  ok(game.panning === null, 'камера при этом не панорамируется');
  game.pMove(T(240, 430));
  const len = game.wallDrag ? Math.hypot(game.wallDrag.x1 - game.wallDrag.x0, game.wallDrag.y1 - game.wallDrag.y0) : 0;
  ok(len > 10, `линия тянется за пальцем (${len.toFixed(0)} ед.)`);
  ok(Math.abs(game.cam.x - x0) < 1 && Math.abs(game.cam.y - y0) < 1, 'камера стоит на месте');
  game.pUp(T(240, 430));
  game.cancelPlacement();
  ok(game.wallDrag === null, 'после отпускания линия закрыта');
}

console.log('\n=== 5. Инерция: камера докатывается после отрыва пальца ===');
{
  game.placement = null; game.wallDrag = null; game.minimapOpen = false;
  game.drawMinimap(ctx);
  const x0 = game.cam.x;
  drag(300, 500, 120, 500, 4);
  ok(Math.abs(game.cam.x - x0) > 10, 'палец сдвинул камеру');
  ok(Math.hypot(game.panGlide.x, game.panGlide.y) > 1,
    `скорость после отрыва сохранена (${Math.hypot(game.panGlide.x, game.panGlide.y).toFixed(0)} ед./с)`);
  const beforeGlide = game.cam.x;
  let t = game.last;            // считать кадры от последнего, иначе dt уйдёт в минус
  for (let i = 0; i < 12; i++) { t += 16; game.frame(t); }
  const glide = Math.abs(game.cam.x - beforeGlide);
  ok(glide > 5, `после отрыва камера докатилась ещё на ${glide.toFixed(0)} ед.`);
  for (let i = 0; i < 90; i++) { t += 16; game.frame(t); }
  ok(game.panGlide.x === 0 && game.panGlide.y === 0, 'докат погас сам, камера не едет вечно');
}

console.log('\n=== 6. «Чистый экран»: карта не рисуется и не ловит тапы ===');
{
  game.uiHidden = true;
  game.drawMinimap(ctx);
  ok(game.minimap.w === 0, 'в чистом экране у карты нулевой rect');
  const chipX = W - 96 - 12, chipY = H - 96 - 12 - 118;
  game.pDown(T(chipX + 40, chipY + 40));
  ok(game.minimapOpen === false, 'тап в стороне карты её не открывает');
  ok(game.pointers.size === 1, 'касание дошло до поля (не съедено картой)');
  game.pUp(T(chipX + 40, chipY + 40));
  game.uiHidden = false;
  game.drawMinimap(ctx);
  ok(game.minimap.w > 0, 'после выхода из чистого экрана карта вернулась');
}

console.log('\n=== 7. Мышь не пострадала: левая кнопка — рамка, ПКМ — панорама ===');
{
  const M = (x, y, button = 0) => ({ pointerId: 7, clientX: x, clientY: y, button,
    pointerType: 'mouse', shiftKey: false, preventDefault() {}, stopPropagation() {} });
  game.panMode = true;                       // по умолчанию именно так
  game.pDown(M(200, 400, 0));
  ok(game.panning === null && game.box !== null, 'левая кнопка рисует рамку, а не панорамирует');
  game.pMove(M(260, 440, 0));
  game.pUp(M(260, 440, 0));
  game.pDown(M(200, 400, 2));
  ok(game.panning !== null, 'правая кнопка по-прежнему панорамирует');
  const x0 = game.cam.x;
  game.pMove(M(240, 400, 2));
  ok(Math.abs(game.cam.x - x0) > 1, 'панорама мышью двигает камеру');
  game.pUp(M(240, 400, 2));
}

console.log(`\nИтог: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
