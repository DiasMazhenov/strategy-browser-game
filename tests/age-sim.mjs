// Headless-проверка пункта 10 плана: экран итогов эпохи. Старая шапка:
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

console.log('\n=== 1. До перехода отчёта нет ===');
step(1); game.pushHud();
ok(hud.ageReport === null, 'экран итогов закрыт в начале партии');

console.log('\n=== 2. Переход в эпоху открывает итоги ===');
{
  // имитируем прожитую эпоху: добыча, бой, стройка
  game.time = 300;                       // 5 минут
  game.gotWood = 500; game.gotFood = 400; game.gotGold = 300;
  game.kills = 7; game.razed = 2; game.builtCount = 5; game.score = 1200;
  game.res.food = 99999; game.res.gold = 99999;
  game.ageUp();
  game.pushHud();

  const r = hud.ageReport;
  ok(!!r, 'после ageUp экран итогов открыт');
  ok(r.toName === 'Век жузов', `новая эпоха названа верно (${r.toName})`);
  ok(r.fromName === 'Заря степи', `прежняя эпоха названа верно (${r.fromName})`);
  ok(r.wood === 500 && r.food === 400 && r.gold === 300,
    `добыча за эпоху: ${r.wood}/${r.food}/${r.gold}`);
  ok(r.kills === 7 && r.razed === 2 && r.built === 5,
    `бои и стройка: ${r.kills}/${r.razed}/${r.built}`);
  ok(r.mins === 5, `длительность эпохи ${r.mins} мин`);
  ok(r.unlocks.length > 0, `перечислено открывшееся (${r.unlocks.length} пунктов)`);
  ok(typeof r.powP === 'number' && typeof r.powE === 'number',
    `расклад сил посчитан (${r.powP} против ${r.powE})`);
}

console.log('\n=== 3. Итоги закрываются ===');
{
  game.closeAgeReport();
  game.pushHud();
  ok(hud.ageReport === null, 'кнопка закрывает экран');
}

console.log('\n=== 4. Вторая эпоха считает СВОЮ добычу, а не всю партию ===');
{
  // копим ещё немного и переходим снова
  game.time = 600;                       // прошло ещё 5 минут
  game.gotWood += 200; game.gotFood += 150; game.gotGold += 100;
  game.kills += 3; game.builtCount += 2;
  game.res.food = 99999; game.res.gold = 99999;
  game.ageUp();
  game.pushHud();

  const r = hud.ageReport;
  ok(r.wood === 200 && r.food === 150 && r.gold === 100,
    `добыча ТОЛЬКО за вторую эпоху: ${r.wood}/${r.food}/${r.gold} (а не 700/550/400)`);
  ok(r.kills === 3, `убийства только за эпоху: ${r.kills} (а не 10)`);
  ok(r.built === 2, `постройки только за эпоху: ${r.built} (а не 7)`);
  ok(r.mins === 5, `длительность второй эпохи ${r.mins} мин`);
  ok(r.toName === 'Век батыров', `третья эпоха (${r.toName})`);
  game.closeAgeReport();
}

console.log('\n=== 5. Добыча по видам копится в игре ===');
{
  const g2 = new Game(mkCanvas(), { difficulty: 'normal', loadSave: false,
    onHud: () => {}, onGameOver: () => {}, onPauseRequest: () => {} });
  const w0 = g2.gotWood, f0 = g2.gotFood, gl0 = g2.gotGold;
  // отправим шаруа на лес и дождёмся сдачи груза
  const wood = g2.nodes.filter(n => n.kind === 'wood' && n.amount > 0)[0];
  const vs = g2.units.filter(u => u.owner === 'player' && u.key === 'villager');
  vs.forEach(v => { v.resting = false; g2.orderGather(v, wood.id); });
  for (let i = 0; i < 30 * 120; i++) g2.update(1 / 30);
  ok(g2.gotWood > w0, `дерево копится в gotWood (${w0} → ${Math.round(g2.gotWood)})`);
  ok(g2.gotWood + g2.gotFood + g2.gotGold <= g2.gatheredTotal + 1,
    'сумма по видам не превышает общий gatheredTotal');
  void f0; void gl0;
}

console.log(`\nИтог: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
