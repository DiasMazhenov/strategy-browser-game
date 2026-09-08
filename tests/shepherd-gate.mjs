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
  penB = { id: 90001, key: 'pen', owner: 'player', x: mk.x + 180, y: mk.y + 120,
    hp: 100, maxHp: 100, done: 1, size: 90, queue: [], rallyX: mk.x + 180, rallyY: mk.y + 180 };
  game.blds.push(penB);
}
console.log(`загон: (${penB.x.toFixed(0)}, ${penB.y.toFixed(0)})`);

// ── СТЕНА ВОКРУГ БАЗЫ: частый приём игрока — обнести стойбище дуалом.
// Проверяем, сможет ли пастух выйти на пастбище через своё кольцо стен.
let wid = 95000;
const R = 520;
for (let a = 0; a < Math.PI * 2; a += 0.055) {
  game.blds.push({ id: wid++, key: 'wall', owner: 'player',
    x: tc.x + Math.cos(a) * R, y: tc.y + Math.sin(a) * R,
    hp: 200, maxHp: 200, done: 1, size: 30, queue: [], rallyX: 0, rallyY: 0 });
}
// оставляем ПРОЁМ и ставим свои ворота — пастух обязан ими воспользоваться
const gateAng = 0.0;
game.blds = game.blds.filter(b => !(b.key === 'wall' &&
  Math.abs(Math.atan2(b.y - tc.y, b.x - tc.x) - gateAng) < 0.12));
game.blds.push({ id: 96000, key: 'gate', owner: 'player',
  x: tc.x + Math.cos(gateAng) * R, y: tc.y + Math.sin(gateAng) * R,
  hp: 300, maxHp: 300, done: 1, size: 30, queue: [], rallyX: 0, rallyY: 0 });
console.log(`дуал с воротами: ${game.blds.filter(b=>b.key==='wall').length} секций + ворота`);

const shep = game.units.find(u => u.owner === 'player' && u.key === 'villager');
shep.herder = true; shep.penId = penB.id; shep.state = 'gather';
shep.x = penB.x; shep.y = penB.y;
const start = { x: shep.x, y: shep.y };

// прогон 6 минут игрового времени
const dt = 1 / 30;
let maxAway = 0, farthest = null;
const log = [];
for (let i = 0; i < 30 * 360; i++) {
  game.update(dt);
  const away = dist(shep, start);
  if (away > maxAway) { maxAway = away; farthest = { x: shep.x, y: shep.y }; }
  if (i % (30 * 30) === 0) {
    log.push(`  t=${(i / 30).toString().padStart(3)}с фаза=${String(shep.herdState).padEnd(5)} ` +
      `поз=(${shep.x.toFixed(0)},${shep.y.toFixed(0)}) отход=${away.toFixed(0)} stuckT=${(shep.herdStuckT ?? 0).toFixed(1)}`);
  }
}
const past = penB.pastureX != null ? { x: penB.pastureX, y: penB.pastureY } : null;
console.log('\nход симуляции:');
log.forEach(l => console.log(l));
console.log(`\nпастбище: ${past ? `(${past.x.toFixed(0)}, ${past.y.toFixed(0)}), ${(dist(penB, past) / 32).toFixed(0)} клеток от загона` : 'НЕ НАЗНАЧЕНО'}`);
console.log(`стадо: ${game.units.filter(u => u.pastureId === penB.id).length} голов`);
console.log(`максимальный отход пастуха от старта: ${maxAway.toFixed(0)} ед. (${(maxAway / 32).toFixed(1)} клеток)`);
console.log(`итоговая позиция: (${shep.x.toFixed(0)}, ${shep.y.toFixed(0)}), фаза ${shep.herdState}`);
console.log('');
console.log(maxAway > 400
  ? '✅ пастух реально ходит по карте'
  : `❌ ПАСТУХ ЗАВИС: за 6 минут отошёл всего на ${maxAway.toFixed(0)} ед.`);
