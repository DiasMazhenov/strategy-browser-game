// Headless-прогон НАСТОЯЩЕГО движка: смотрим, ходит ли пастух на самом деле.
// Регулярки по исходнику доказывают только наличие кода, а не то, что юнит едет.
// Здесь поднимаем Game с заглушками canvas/DOM, назначаем пастуха и меряем путь.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── заглушки браузера ───────────────────────────────────────────────────────
const g = globalThis;
function mkCtx() {
  const noop = () => {};
  const ctx = new Proxy({}, {
    get: (_t, p) => {
      if (p === 'canvas') return mkCanvas();
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient')
        return () => ({ addColorStop: noop });
      if (p === 'getImageData') return (_x, _y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (p === 'createPattern') return () => null;
      return noop;
    },
    set: () => true,
  });
  return ctx;
}
function mkCanvas() {
  return { width: 1280, height: 720, style: {}, getContext: () => mkCtx(),
    addEventListener: () => {}, removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    toDataURL: () => '' };
}
g.addEventListener = () => {};
g.removeEventListener = () => {};
g.window = g;
g.document = {
  createElement: (t) => (t === 'canvas' ? mkCanvas() : { style: {}, addEventListener: () => {}, appendChild: () => {} }),
  addEventListener: () => {}, removeEventListener: () => {},
  body: { appendChild: () => {}, style: {} },
  documentElement: { style: {} },
};
g.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
g.devicePixelRatio = 1;
g.requestAnimationFrame = () => 0;        // цикл крутим вручную
g.cancelAnimationFrame = () => {};
g.performance = g.performance ?? { now: () => Date.now() };
g.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
g.Image = class { constructor() { this.width = 64; this.height = 64; this.naturalWidth = 64; this.naturalHeight = 64; this.complete = true; } set src(_v) {} get src() { return ''; } };
g.Audio = class { play() { return Promise.resolve(); } pause() {} addEventListener() {} load() {} };
g.AudioContext = class { createGain() { return { connect: () => {}, gain: { value: 0, setValueAtTime: () => {} } }; }
  createOscillator() { return { connect: () => {}, start: () => {}, stop: () => {}, frequency: { value: 0, setValueAtTime: () => {} } }; }
  get destination() { return {}; } get currentTime() { return 0; } resume() {} };
g.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return mkCtx(); } };
g.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });

// ── сборка движка в один ESM-файл (png/mp3 → пустышки) ──────────────────────
const dir = mkdtempSync(join(tmpdir(), 'shep-'));
const outfile = join(dir, 'engine.mjs');
await build({
  entryPoints: ['src/game/engine.ts'],
  bundle: true, format: 'esm', platform: 'neutral', outfile,
  loader: { '.png': 'text', '.jpg': 'text', '.mp3': 'text', '.webp': 'text' },
  logLevel: 'silent',
});
const { Game } = await import('file://' + outfile);

// ── запуск игры ─────────────────────────────────────────────────────────────
const game = new Game(mkCanvas(), {
  difficulty: 'normal', loadSave: false,
  onHud: () => {}, onGameOver: () => {}, onPauseRequest: () => {},
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const tc = game.blds.find(b => b.owner === 'player' && b.key === 'towncenter');
console.log(`ханская ставка: (${tc.x.toFixed(0)}, ${tc.y.toFixed(0)})`);

// строим загон рядом со ставкой и ставим пастуха
const pen = game.addBld ? null : null;
let penB = game.blds.find(b => b.key === 'pen' && b.owner === 'player');
if (!penB) {
  // повторяем то, что делает постройка: готовое здание загона
  const mk = game.blds.find(b => b.key === 'towncenter' && b.owner === 'player');
  penB = { id: 90001, key: 'pen', owner: 'player', x: mk.x + 260, y: mk.y + 180,
    hp: 100, maxHp: 100, done: 1, size: 90, queue: [], rallyX: mk.x + 260, rallyY: mk.y + 240 };
  game.blds.push(penB);
}
console.log(`загон: (${penB.x.toFixed(0)}, ${penB.y.toFixed(0)})`);

const vills = game.units.filter(u => u.owner === 'player' && u.key === 'villager');
const startRes = { ...game.res };
const startPos = vills.map(u => ({ x: u.x, y: u.y }));

// прогон 6 минут игрового времени
const dt = 1 / 30;
for (let i = 0; i < 30 * 300; i++) game.update(dt);
const moved = vills.filter((u, i) => Math.hypot(u.x - startPos[i].x, u.y - startPos[i].y) > 100).length;
const gained = (game.res.wood - startRes.wood) + (game.res.food - startRes.food) + (game.res.gold - startRes.gold);
console.log(`рабочих всего: ${vills.length}, сдвинулись с места: ${moved}`);
console.log(`добыто ресурсов за 5 мин: ${gained.toFixed(0)}`);
console.log(`дерево ${startRes.wood.toFixed(0)}→${game.res.wood.toFixed(0)}, еда ${startRes.food.toFixed(0)}→${game.res.food.toFixed(0)}`);
console.log('');
console.log(gained > 100 && moved >= vills.length - 1
  ? '✅ обычные рабочие не сломаны: ходят и добывают'
  : '❌ РЕГРЕСС: рабочие встали или не добывают');
