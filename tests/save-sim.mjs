// Автосохранение партии: переживает ли состояние перезагрузку страницы.
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
// НАСТОЯЩЕЕ хранилище в памяти: заглушка из camp-sim всегда отдаёт null и
// глотает запись, поэтому проверить сохранение с ней невозможно.
const __store = new Map();
g.localStorage = {
  getItem: (k) => (__store.has(k) ? __store.get(k) : null),
  setItem: (k, v) => { __store.set(k, String(v)); },
  removeItem: (k) => { __store.delete(k); },
  clear: () => __store.clear(),
};
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

const mk = (loadSave = false) => new Game(mkCanvas(), { difficulty: 'normal', loadSave,
  onHud: () => {}, onGameOver: () => {}, onPauseRequest: () => {} });
const step = (g2, sec, d = 1 / 30) => { for (let i = 0; i < sec / d; i++) g2.update(d); };

console.log('\n=== 1. Почему не cookies ===');
{
  const game = mk();
  const size = new TextEncoder().encode(game.serialize()).length;
  console.log(`     размер партии: ${(size / 1024).toFixed(1)} КБ`);
  ok(size > 4096, `партия (${(size / 1024).toFixed(0)} КБ) НЕ влезает в cookie (лимит 4 КБ) — нужен localStorage`);
  ok(size < 5 * 1024 * 1024, 'но свободно помещается в localStorage (5-10 МБ)');
}

console.log('\n=== 2. Автосохранение срабатывает само ===');
{
  localStorage.removeItem('empires-dawn-savegame-v1');
  const game = mk();
  ok(game.settings.autosave === true, 'автосохранение включено по умолчанию');
  ok(!Game.hasSave(), 'сохранения пока нет');

  step(game, 10);
  ok(!Game.hasSave(), 'через 10 с ещё не пишет (интервал 20 с — не грузим каждый кадр)');

  step(game, 12);
  ok(Game.hasSave(), 'через 22 с партия сохранена автоматически');
}

console.log('\n=== 3. Сохранение при уходе со страницы ===');
{
  localStorage.removeItem('empires-dawn-savegame-v1');
  const game = mk();
  step(game, 3);
  ok(!Game.hasSave(), 'автосейв ещё не наступил');
  game.saveOnExit();               // имитация закрытия вкладки
  ok(Game.hasSave(), 'при уходе со страницы партия записана немедленно');
}

console.log('\n=== 4. Состояние восстанавливается ===');
{
  localStorage.removeItem('empires-dawn-savegame-v1');
  const a = mk();
  // разыграем партию: ресурсы, войска, эпоха, стройка
  a.res.wood = 777; a.res.food = 555; a.res.gold = 333;
  const tc = a.blds.find(b => b.owner === 'player' && b.key === 'towncenter');
  for (let i = 0; i < 5; i++) a.addUnit('swordsman', 'player', tc.x + 100 + i * 30, tc.y + 80);
  a.addBld('barracks', 'player', tc.x + 400, tc.y + 200, 1);
  a.kills = 9; a.score = 4242;
  // Снимаем эталон РОВНО в момент записи: автосейв срабатывает на 20-й секунде,
  // а игра идёт дальше — сравнивать с состоянием на 25-й секунде некорректно,
  // за эти 5 секунд успевают набежать ресурсы, юниты и очки.
  step(a, 21);
  a.saveOnExit();                   // фиксируем состояние здесь же
  const want = {
    wood: Math.floor(a.res.wood), food: Math.floor(a.res.food), gold: Math.floor(a.res.gold),
    units: a.units.length, blds: a.blds.length, kills: a.kills, time: Math.floor(a.time),
    age: a.age, score: Math.floor(a.score),
  };
  ok(Game.hasSave(), 'партия сохранена');

  // «перезагрузка страницы»: новый движок с loadSave
  const b = mk(true);
  ok(Math.floor(b.res.wood) === want.wood, `дерево восстановлено (${Math.floor(b.res.wood)} = ${want.wood})`);
  ok(Math.floor(b.res.gold) === want.gold, `золото восстановлено (${Math.floor(b.res.gold)})`);
  ok(b.units.length === want.units, `юниты на месте (${b.units.length} = ${want.units})`);
  ok(b.blds.length === want.blds, `здания на месте (${b.blds.length} = ${want.blds})`);
  ok(b.kills === want.kills, `счётчик убийств (${b.kills} = ${want.kills})`);
  ok(Math.abs(Math.floor(b.time) - want.time) <= 1, `игровое время (${Math.floor(b.time)} ≈ ${want.time})`);
  ok(Math.abs(Math.floor(b.score) - want.score) <= 2, `очки (${Math.floor(b.score)} ≈ ${want.score})`);
  const brx = b.blds.find(x => x.owner === 'player' && x.key === 'barracks');
  ok(!!brx, 'построенные казармы сохранились');
}

console.log('\n=== 5. Возврат в партию после F5 ===');
{
  localStorage.removeItem('empires-dawn-savegame-v1');
  Game.setInGame(false);
  ok(!Game.wasInGame(), 'без партии в бой не возвращаемся');

  const game = mk();
  Game.setInGame(true);
  step(game, 25);
  ok(Game.wasInGame(), 'после автосейва метка «был в игре» стоит → F5 вернёт в бой');

  // вышли в меню — метка снимается, но сохранение остаётся для «Продолжить»
  Game.setInGame(false);
  ok(!Game.wasInGame(), 'после выхода в меню F5 ведёт в меню');
  ok(Game.hasSave(), 'но сохранение цело — кнопка «Продолжить» работает');
}

console.log('\n=== 6. Проигранная партия не восстанавливается ===');
{
  localStorage.removeItem('empires-dawn-savegame-v1');
  const game = mk();
  Game.setInGame(true);
  step(game, 25);
  ok(Game.hasSave(), 'партия сохранена');

  game.finish('defeat');
  ok(!Game.hasSave(), 'после поражения сохранение стёрто');
  ok(!Game.wasInGame(), 'и метка снята — F5 не бросит на экран поражения');

  // и автосейв больше не пишет
  step(game, 25);
  ok(!Game.hasSave(), 'законченная партия не сохраняется заново');
}

console.log('\n=== 7. Автосохранение можно отключить ===');
{
  localStorage.removeItem('empires-dawn-savegame-v1');
  const game = mk();
  game.settings.autosave = false;
  step(game, 30);
  ok(!Game.hasSave(), 'при выключенной настройке партия не пишется');
  game.saveOnExit();
  ok(!Game.hasSave(), 'и при уходе со страницы тоже');
  // но ручное сохранение кнопкой работает всегда
  game.saveGame();
  ok(Game.hasSave(), 'ручное «Сохранить партию» работает независимо от настройки');
}

console.log(`\nИтог: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
