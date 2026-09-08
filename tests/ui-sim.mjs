// Headless-проверка 1.0.078 на НАСТОЯЩЕМ движке: стрелки прокрутки,
// курсоры действий, плашка ресурса, очередь построек Shift+клик.
// Старая шапка:
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

console.log('\n=== 1. Камера НЕ едет сама от курсора у края ===');
{
  game.mouse.in = true; game.mouse.isTouch = false;
  game.mouse.x = 3; game.mouse.y = 360;          // курсор вплотную к левому краю
  const x0 = game.cam.x, y0 = game.cam.y;
  step(2);
  ok(Math.abs(game.cam.x - x0) < 0.5 && Math.abs(game.cam.y - y0) < 0.5,
    `камера стоит при курсоре у края (сдвиг ${Math.abs(game.cam.x - x0).toFixed(2)} px за 2 с)`);
  ok(game.edgeDir === 'l', `у левого края показана стрелка влево (edgeDir='${game.edgeDir}')`);

  game.mouse.x = 1277; step(0.1);
  ok(game.edgeDir === 'r', 'у правого края — стрелка вправо');
  game.mouse.y = 3; step(0.1);
  ok(game.edgeDir === 'u', 'у верхнего края — стрелка вверх');
  game.mouse.x = 640; game.mouse.y = 717; step(0.1);
  ok(game.edgeDir === 'd', 'у нижнего края — стрелка вниз');
  game.mouse.x = 640; game.mouse.y = 360; step(0.1);
  ok(game.edgeDir === '', 'в середине экрана стрелок нет');
}

console.log('\n=== 2. Клик по стрелке прокручивает камеру ===');
{
  game.mouse.x = 3; game.mouse.y = 360; step(0.1);
  const x0 = game.cam.x;
  game.nudgeCam('l');
  step(0.6);                                     // докат
  ok(game.cam.x < x0 - 50, `клик влево сдвинул камеру на ${(x0 - game.cam.x).toFixed(0)} px`);

  const x1 = game.cam.x;
  game.nudgeCam('r');
  step(0.6);
  ok(game.cam.x > x1 + 50, 'клик вправо двигает в обратную сторону');

  const y1 = game.cam.y;
  game.nudgeCam('u'); step(0.6);
  ok(game.cam.y < y1 - 50, 'клик вверх двигает камеру вверх');
  game.nudgeCam('d'); step(0.6);
  ok(Math.abs(game.cam.y - y1) < 60, 'клик вниз возвращает примерно назад');

  // докат конечен — камера не уезжает бесконечно
  const x2 = game.cam.x;
  step(3);
  ok(Math.abs(game.cam.x - x2) < 1, 'после доката камера останавливается');
}

console.log('\n=== 3. Курсор зависит от цели под мышью ===');
{
  const tc = game.blds.find(b => b.owner === 'player' && b.key === 'towncenter');
  const vill = game.units.find(u => u.owner === 'player' && u.key === 'villager');
  // мир → экран, чтобы навести «мышь» на конкретный объект
  const toScreen = (wx, wy) => {
    const [ix, iy] = [wx - wy, (wx + wy) * 0.5];   // toIso() из iso.ts
    return { x: game.vw / 2 + (ix - game.camIsoX()) * game.cam.zoom,
             y: game.vh / 2 + (iy - game.camIsoY()) * game.cam.zoom };
  };
  game.centerOn(tc.x, tc.y, true);

  // лес: находим ближайший узел дерева и наводимся на него
  const wood = game.nodes.filter(n => n.kind === 'wood' && n.amount > 0)
    .sort((a, b) => Math.hypot(a.x - tc.x, a.y - tc.y) - Math.hypot(b.x - tc.x, b.y - tc.y))[0];
  game.centerOn(wood.x, wood.y, true);
  game.clearSel(); game.selected.add(vill.id);
  let s = toScreen(wood.x, wood.y);
  let k = game.cursorFor(s.x, s.y);
  ok(k === 'wood', `над лесом с шаруа — топор (получено '${k}')`);

  // без выделения тот же лес не даёт курсор добычи
  game.clearSel();
  k = game.cursorFor(s.x, s.y);
  ok(k !== 'wood', `без выделения над лесом курсор не топор (получено '${k}')`);

  // золото
  const gold = game.nodes.filter(n => n.kind === 'gold' && n.amount > 0)[0];
  if (gold) {
    game.centerOn(gold.x, gold.y, true);
    game.clearSel(); game.selected.add(vill.id);
    s = toScreen(gold.x, gold.y);
    k = game.cursorFor(s.x, s.y);
    ok(k === 'gold', `над золотом — кирка (получено '${k}')`);
  } else ok(true, 'золотых жил на карте нет — проверка пропущена');

  // ягоды
  const food = game.nodes.filter(n => n.kind === 'food' && n.amount > 0)[0];
  if (food) {
    game.centerOn(food.x, food.y, true);
    game.clearSel(); game.selected.add(vill.id);
    s = toScreen(food.x, food.y);
    k = game.cursorFor(s.x, s.y);
    ok(k === 'food', `над ягодником — корзина (получено '${k}')`);
  } else ok(true, 'ягодников нет — проверка пропущена');

  // враг → сабля
  game.centerOn(tc.x, tc.y, true);
  const foe = game.units.find(u => u.owner === 'enemy');
  if (foe) {
    foe.x = tc.x + 60; foe.y = tc.y;
    game.clearSel(); game.selected.add(vill.id);
    s = toScreen(foe.x, foe.y);
    k = game.cursorFor(s.x, s.y);
    ok(k === 'attack', `над врагом — сабля (получено '${k}')`);
  } else ok(true, 'врагов рядом нет — проверка пропущена');

  // режим постройки → молоток
  game.placement = 'house';
  ok(game.cursorFor(640, 360) === 'build', 'в режиме постройки — молоток');
  game.placement = null;

  // над стрелкой прокрутки курсор нейтральный, чтобы не путать с приказом
  ok(game.cursorFor(3, 360) === 'default', 'над стрелкой прокрутки курсор обычный');
}

console.log('\n=== 4. Плашка ресурса по клику, полоска скрыта ===');
{
  const wood = game.nodes.filter(n => n.kind === 'wood' && n.amount > 0)[0];
  game.clearSel();
  ok(game.selNode === -1, 'по умолчанию ресурс не выбран');
  game.handleTap(wood.x, wood.y, false);
  ok(game.selNode === wood.id, 'клик по лесу выбирает его (плашка появится)');
  game.clearSel();
  ok(game.selNode === -1, 'сброс выделения убирает плашку');

  // выбор ресурса не мешает приказам: клик с выделенным шаруа отдаёт приказ
  const vill = game.units.find(u => u.owner === 'player' && u.key === 'villager');
  game.clearSel(); game.selected.add(vill.id);
  game.handleTap(wood.x, wood.y, false);
  ok(vill.nodeId === wood.id || vill.state === 'gather',
    'с выделенным шаруа клик по лесу — приказ добывать, а не осмотр');
}

console.log('\n=== 5. Очередь построек Shift+клик ===');
{
  game.res.wood = 5000; game.res.food = 5000; game.res.gold = 5000;
  const tc = game.blds.find(b => b.owner === 'player' && b.key === 'towncenter');
  const before = game.blds.length;

  // Три ЗАВЕДОМО свободных места: перебираем кольцо вокруг ставки и берём
  // точки, которые движок сам считает валидными (лес, горы и вода мешают).
  const spots = [];
  for (let r = 300; r <= 900 && spots.length < 3; r += 60) {
    for (let a = 0; a < 6.28 && spots.length < 3; a += 0.22) {
      const x = tc.x + Math.cos(a) * r, y = tc.y + Math.sin(a) * r;
      if (!game.placementValid(x, y, 'house')) continue;
      if (spots.some(s2 => Math.hypot(s2.x - x, s2.y - y) < 190)) continue;
      spots.push({ x, y });
    }
  }
  ok(spots.length === 3, `найдено три свободных места под дома (${spots.length})`);

  // первый дом — без Shift
  game.keys.delete('shift');
  game.placement = 'house';
  game.tryPlace(spots[0].x, spots[0].y);
  const b1 = game.blds[game.blds.length - 1];
  const builder = game.units.find(u => u.buildId === b1.id && u.state === 'build');
  ok(!!builder, 'первый фундамент: шаруа отправлен строить');

  // ещё два — с Shift, они должны уйти В ОЧЕРЕДЬ ТОМУ ЖЕ шаруа
  game.keys.add('shift');
  game.placement = 'house';
  game.tryPlace(spots[1].x, spots[1].y);
  game.placement = 'house';
  game.tryPlace(spots[2].x, spots[2].y);
  game.keys.delete('shift');

  ok(game.blds.length === before + 3, `поставлено три фундамента (${game.blds.length - before})`);
  ok(builder.buildQueue && builder.buildQueue.length === 2,
    `очередь строителя = 2 (получено ${builder.buildQueue ? builder.buildQueue.length : 'нет'})`);

  const others = game.units.filter(u => u.owner === 'player' && u.key === 'villager'
    && u.state === 'build' && u.id !== builder.id);
  ok(others.length === 0,
    `Shift не отвлёк других шаруа (отвлечено: ${others.length})`);

  // достраиваем всё и смотрим, что строитель прошёл очередь до конца
  const ids = [b1.id, ...(builder.buildQueue || [])];
  for (const id of ids) {
    const b = game.blds.find(bb => bb.id === id);
    if (b) b.done = 0.99;
  }
  step(40);
  const doneCount = ids.filter(id => {
    const b = game.blds.find(bb => bb.id === id);
    return b && b.done >= 1;
  }).length;
  ok(doneCount === 3, `все три дома достроены одним шаруа (готово ${doneCount}/3)`);
  ok(!builder.buildQueue || builder.buildQueue.length === 0,
    `очередь опустела (осталось: ${builder.buildQueue ? builder.buildQueue.length : 0}, состояние строителя: ${builder.state})`);
}

console.log(`\nИтог: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
