// Headless-проверка 1.0.080: кликабельные гексы — обводка при наведении
// и приказ идти в центр клетки. Старая шапка:
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

// геометрия гексов — те же формулы, что в iso.ts (flat-top, HS=20)
const HS = 20, S3 = HS * Math.sqrt(3);
const hexCenterWorld = (q, r) => [HS * 1.5 * q, S3 * (q / 2 + r)];
const hexRound = (q, r) => {
  const x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dz > dy) rz = -rx - ry;
  return [rx, rz];
};
const worldToHex = (wx, wy) => hexRound((2 / 3 * wx) / HS, (-1 / 3 * wx + (Math.sqrt(3) / 3) * wy) / HS);
const toScreen = (wx, wy) => {
  const ix = wx - wy, iy = (wx + wy) * 0.5;
  return { x: game.vw / 2 + (ix - game.camIsoX()) * game.cam.zoom,
           y: game.vh / 2 + (iy - game.camIsoY()) * game.cam.zoom };
};

const tc = game.blds.find(b => b.owner === 'player' && b.key === 'towncenter');
game.centerOn(tc.x, tc.y, true);

console.log('\n=== 1. Гекс под курсором определяется ===');
{
  game.mouse.in = true; game.mouse.isTouch = false;
  // наводимся на центр экрана и сверяем гекс с ожидаемым по геометрии
  game.mouse.x = 640; game.mouse.y = 360;
  step(0.1);
  ok(game.hoverHex !== null, 'при наведении на землю гекс подсвечен');
  const w = game.screenToWorld(640, 360);
  const [eq, er] = worldToHex(w.x, w.y);
  ok(game.hoverHex.q === eq && game.hoverHex.r === er,
    `гекс совпадает с геометрией iso.ts (${game.hoverHex.q},${game.hoverHex.r} = ${eq},${er})`);

  // соседняя точка внутри той же клетки → тот же гекс
  game.mouse.x = 646; game.mouse.y = 363; step(0.05);
  const same = game.hoverHex.q === eq && game.hoverHex.r === er;
  // дальняя точка → другой гекс
  game.mouse.x = 900; game.mouse.y = 500; step(0.05);
  const other = game.hoverHex.q !== eq || game.hoverHex.r !== er;
  ok(same && other, 'мелкое смещение курсора не меняет гекс, крупное — меняет');
}

console.log('\n=== 2. Подсветка гаснет там, где клик значит другое ===');
{
  game.mouse.x = 640; game.mouse.y = 360; step(0.05);
  ok(game.hoverHex !== null, 'над обычной землёй подсветка есть');

  game.placement = 'house'; step(0.05);
  ok(game.hoverHex === null, 'в режиме постройки гекс не подсвечен (там призрак здания)');
  game.placement = null;

  game.mouse.x = 3; game.mouse.y = 360; step(0.05);
  ok(game.hoverHex === null, 'над стрелкой прокрутки подсветки нет');
  game.mouse.x = 640; game.mouse.y = 360; step(0.05);

  game.box = { x0: 0, y0: 0, x1: 50, y1: 50 }; step(0.05);
  ok(game.hoverHex === null, 'во время рамки выделения подсветки нет');
  game.box = null;

  game.mouse.isTouch = true; step(0.05);
  ok(game.hoverHex === null, 'на тач-экране подсветки нет');
  game.mouse.isTouch = false; step(0.05);
}

console.log('\n=== 3. Клик по гексу отправляет отряд в ЦЕНТР клетки ===');
{
  const vill = game.units.find(u => u.owner === 'player' && u.key === 'villager');
  vill.resting = false; vill.herder = false;
  game.clearSel(); game.selected.add(vill.id);

  // цель — гекс в стороне от базы
  const target = { x: tc.x + 420, y: tc.y + 260 };
  const [q, r] = worldToHex(target.x, target.y);
  const [cx, cy] = hexCenterWorld(q, r);

  game.handleTap(target.x, target.y, false);
  ok(vill.state === 'move' || vill.state === 'attackmove',
    `шаруа получил приказ идти (состояние '${vill.state}')`);

  // цель приказа — центр гекса, а не точка клика
  const dTargetToCenter = Math.hypot(vill.tx - cx, vill.ty - cy);
  ok(dTargetToCenter <= 30,
    `цель привязана к центру гекса (отклонение ${dTargetToCenter.toFixed(1)} px, разброс строя ≤30)`);

  const dClickToCenter = Math.hypot(target.x - cx, target.y - cy);
  ok(dClickToCenter > 0.5,
    `точка клика НЕ совпадала с центром (${dClickToCenter.toFixed(1)} px) — привязка сработала`);

  // И ЮНИТ РЕАЛЬНО ДОХОДИТ. Мерим минимальное расстояние за проход, а не
  // конечное: шаруа, дойдя до пустого гекса, штатно уходит на ближайший ресурс
  // (рабочий не простаивает) — конечная точка ничего не скажет о приказе.
  let best = Math.hypot(vill.x - cx, vill.y - cy);
  for (let i = 0; i < 30 * 30; i++) {
    game.update(1 / 30);
    best = Math.min(best, Math.hypot(vill.x - cx, vill.y - cy));
  }
  ok(best < 90, `шаруа дошёл до гекса (минимум ${best.toFixed(0)} px от центра)`);
  ok(game.hexPing.t >= 0, 'вспышка приказа отработала');

  // Воин на пустом гексе ОСТАЁТСЯ стоять: у него нет работы, которая уведёт.
  const sold = game.addUnit('swordsman', 'player', tc.x + 80, tc.y + 80);
  game.clearSel(); game.selected.add(sold.id);
  const t2 = { x: tc.x - 300, y: tc.y - 420 };
  const [q2, r2] = worldToHex(t2.x, t2.y);
  const [c2x, c2y] = hexCenterWorld(q2, r2);
  game.handleTap(t2.x, t2.y, false);
  step(30);
  const dSold = Math.hypot(sold.x - c2x, sold.y - c2y);
  ok(dSold < 90, `сарбаз пришёл на гекс и остался (${dSold.toFixed(0)} px от центра)`);
}

console.log('\n=== 4. Клик по объектам не перехватывается гексом ===');
{
  const vill = game.units.find(u => u.owner === 'player' && u.key === 'villager');
  const wood = game.nodes.filter(n => n.kind === 'wood' && n.amount > 0)[0];
  game.clearSel(); game.selected.add(vill.id);
  game.handleTap(wood.x, wood.y, false);
  ok(vill.nodeId === wood.id || vill.state === 'gather',
    'клик по ресурсу — по-прежнему приказ добывать, а не «идти на гекс»');

  // клик по своему зданию — выделение здания
  game.clearSel();
  game.handleTap(tc.x, tc.y, false);
  ok(game.selBld === tc.id, 'клик по своей ставке выделяет её, а не двигает отряд');
}

console.log('\n=== 5. Отряд из нескольких юнитов идёт на гекс ===');
{
  const vills = game.units.filter(u => u.owner === 'player' && u.key === 'villager').slice(0, 3);
  vills.forEach(v => { v.resting = false; v.herder = false; });
  game.clearSel(); vills.forEach(v => game.selected.add(v.id));
  const target = { x: tc.x - 380, y: tc.y + 300 };
  const [q, r] = worldToHex(target.x, target.y);
  const [cx, cy] = hexCenterWorld(q, r);
  game.handleTap(target.x, target.y, false);
  const moving = vills.filter(v => v.state === 'move' || v.state === 'attackmove').length;
  ok(moving === vills.length, `все ${vills.length} юнита получили приказ (идут: ${moving})`);
  const spread = vills.map(v => Math.hypot(v.tx - cx, v.ty - cy));
  ok(Math.max(...spread) <= 40,
    `цели всех юнитов у центра гекса (макс. отклонение ${Math.max(...spread).toFixed(1)} px)`);
}

console.log(`\nИтог: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
