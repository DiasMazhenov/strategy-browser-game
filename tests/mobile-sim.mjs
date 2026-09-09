// Сутки 15 минут (с пропорциями) + мобильная адаптация. Старая шапка:
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
const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;

const engSrc = readFileSync('src/game/engine.ts', 'utf8');
const appSrc = readFileSync('src/App.tsx', 'utf8');
const cssSrc = readFileSync('src/index.css', 'utf8');
const htmlSrc = readFileSync('index.html', 'utf8');

console.log('\n=== 1. Сутки 15 минут ===');
const DAY = +/DAY_LEN_SEC = (\d+)/.exec(engSrc)[1];
const NIGHT = +/NIGHT_LEN_SEC = (\d+)/.exec(engSrc)[1];
const TW = +/TWILIGHT_SEC = (\d+)/.exec(engSrc)[1];
ok(DAY === 900, `сутки = ${DAY} с (15 минут)`);
ok(NIGHT === 120 && TW === 120, `ночь ${NIGHT} с, сумерки ${TW} с`);

console.log('\n=== 2. ПРОПОРЦИИ сохранены (как при 30-минутных сутках) ===');
{
  // эталон — доли из версии с сутками 1800 с
  ok(near(NIGHT / DAY, 240 / 1800, 0.002), `доля ночи ${(NIGHT / DAY * 100).toFixed(1)}% = была ${(240 / 1800 * 100).toFixed(1)}%`);
  ok(near(TW / DAY, 240 / 1800, 0.002), `доля сумерек ${(TW / DAY * 100).toFixed(1)}% = была ${(240 / 1800 * 100).toFixed(1)}%`);
  const light = DAY - NIGHT - 2 * TW, lightOld = 1800 - 240 - 480;
  ok(near(light / DAY, lightOld / 1800, 0.002),
    `доля светлого дня ${(light / DAY * 100).toFixed(0)}% = была ${(lightOld / 1800 * 100).toFixed(0)}% (${light / 60} мин против ${lightOld / 60})`);
  ok(light === 540, `светлого дня ${light / 60} минут`);
}

console.log('\n=== 3. Механики масштабировались вместе с сутками ===');
{
  // все они заданы долями DAY_LEN_SEC — проверяем, что это ещё так
  for (const [name, frac, oldSec] of [
    ['BEREKE_LEN', 0.2, 360], ['REST_TIME', 0.108, 194.4],
    ['FRESH_TIME', 0.292, 525.6], ['TIRE_RATE', 0.625, 1125],
  ]) {
    const re = new RegExp(`${name}[^=]*= [^;]*DAY_LEN_SEC \\* ([\\d.]+)`);
    const m = re.exec(engSrc);
    const f = m ? +m[1] : NaN;
    ok(near(f, frac, 0.001),
      `${name}: доля ${f} сохранена → ${(DAY * f).toFixed(0)} с (было ${oldSec} с)`);
  }
}

console.log('\n=== 4. Намаз не короче записи азана ===');
{
  const AZAN = +/readonly AZAN_LEN = (\d+)/.exec(engSrc)[1];
  const m = /readonly PRAYER_LEN = Math\.max\(DAY_LEN_SEC \* ([\d.]+), ([\d.]+) \+ ([\d.]+)\)/.exec(engSrc);
  ok(!!m, 'PRAYER_LEN защищён через Math.max');
  const prayer = Math.max(DAY * +m[1], +m[2] + +m[3]);
  console.log(`     PRAYER_LEN = ${prayer} с, запись азана ${AZAN} с`);
  ok(prayer > AZAN, `намаз (${prayer} с) длиннее азана (${AZAN} с) — не расходятся под призыв`);
  ok(DAY * +m[1] < AZAN, `чистая доля дала бы ${(DAY * +m[1]).toFixed(1)} с — защита реально нужна`);
}

console.log('\n=== 5. Живой движок: цикл суток идёт ===');
{
  const game = new Game(mkCanvas(), { difficulty: 'normal', loadSave: false,
    onHud: () => {}, onGameOver: () => {}, onPauseRequest: () => {} });
  ok(game.DAY_LEN === 900, `движок знает про 900 с (${game.DAY_LEN})`);
  const p0 = game.dayPhase();
  for (let i = 0; i < 30 * 60; i++) game.update(1 / 30);   // минута игры
  const p1 = game.dayPhase();
  const advanced = ((p1 - p0) + 1) % 1;
  ok(near(advanced, 60 / 900, 0.01),
    `за минуту прошло ${(advanced * 100).toFixed(1)}% суток (ожидалось ${(60 / 900 * 100).toFixed(1)}%)`);
  // за 15 минут — полный круг
  for (let i = 0; i < 30 * 840; i++) game.update(1 / 30);
  const p2 = game.dayPhase();
  // Фаза циклическая: 0.999 и 0.001 — соседние точки, разница «через ноль».
  // Берём кратчайшее расстояние по кругу, иначе замкнувшийся цикл читается
  // как максимальное расхождение.
  const diff = Math.abs(((p2 - p0) + 1.5) % 1 - 0.5);
  ok(diff < 0.02, `через 15 минут сутки замкнулись (фаза ${p2.toFixed(3)}, отклонение ${diff.toFixed(3)})`);
}

console.log('\n=== 6. Мобильные: базовая подготовка ===');
{
  ok(/viewport-fit=cover/.test(htmlSrc), 'viewport-fit=cover — учёт «чёлки»');
  ok(/user-scalable=no/.test(htmlSrc), 'зум страницы отключён — не мешает жестам игры');
  ok(/touch-action: none/.test(cssSrc), 'канвас забирает жесты себе (нет прокрутки страницы)');
  ok(/touch-action: manipulation/.test(cssSrc), 'кнопки не зумят страницу двойным тапом');
  ok(/overscroll-behavior: none/.test(cssSrc), 'нет «оттяжки» страницы при свайпе');
  ok(/-webkit-tap-highlight-color: transparent/.test(cssSrc), 'нет синей подсветки тапа');
  ok(/env\(safe-area-inset/.test(cssSrc), 'safe-area для экранов с вырезом');
  ok(/orientation: landscape/.test(cssSrc), 'есть правила для альбомной ориентации');
}

console.log('\n=== 7. Мобильные: удобство управления ===');
{
  ok(/pointer: coarse/.test(engSrc), 'движок распознаёт тач-устройство');
  ok(/pointerType === 'mouse' \? 9 : 16/.test(engSrc),
    'порог сдвига для пальца больше, чем для мыши (тап не превращается в рамку)');
  ok(/this\.mouse\.isTouch \? 42 : 30/.test(engSrc), 'зона попадания по юниту шире при касании');
  ok(/this\.mouse\.isTouch \? 46 : 34/.test(engSrc), 'зона попадания по ресурсу шире при касании');
  ok(/min-h-\[44px\]/.test(appSrc), 'кнопки не меньше 44px — гайдлайн для пальца');
  ok(/matchMedia\('\(pointer: coarse\)'\)\.matches\)\);/.test(appSrc.replace(/\s+/g, ' ')) ||
     /pointer: coarse/.test(appSrc), 'интерфейс знает про мобильный режим');
  ok(/isMobile \? 0\.7/.test(engSrc), 'на телефоне камера отдалена — видно больше карты');
}

console.log('\n=== 8. Мобильные: HUD не закрывает карту ===');
{
  const m = /const \[showQuests, setShowQuests\] = useState\(([\s\S]{0,220}?)\);/.exec(appSrc);
  ok(!!m && /pointer: coarse/.test(m[1]),
    'панель заданий свёрнута на телефоне (иначе закрывает треть экрана)');
  ok(/pointer-events-none absolute inset-x-0 bottom-0/.test(appSrc),
    'док не перехватывает касания по карте мимо кнопок');
  ok(/isTouch\) return ''/.test(engSrc), 'стрелки прокрутки скрыты на тач — там жест панорамы');
}

console.log(`\nИтог: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
