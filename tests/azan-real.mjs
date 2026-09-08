// Азан по РЕАЛЬНОМУ времени: астрономия + поведение в игре. Старая шапка:
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

const { prayerTimes, CITY_BY_ID, CITIES, fmtHM, currentPrayer, nextPrayer, PRAYER_ORDER } =
  await import('file://' + (await (async () => {
    const o = join(dir, 'pt.mjs');
    await build({ entryPoints: ['src/game/prayer-times.ts'], bundle: true, format: 'esm',
      platform: 'neutral', outfile: o, logLevel: 'silent' });
    return o;
  })()));

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const astana = CITY_BY_ID.astana;

console.log('\n=== 1. Времена совпадают с календарём ДУМК (Астана) ===');
{
  // эталон: календарь намаза Астаны на 9 сентября 2026 (ДУМК, 18°/17°)
  const t = prayerTimes(new Date(2026, 8, 9), astana);
  console.log(`     таң ${fmtHM(t.fajr)}  восход ${fmtHM(t.sunrise)}  бесін ${fmtHM(t.dhuhr)}  екінті ${fmtHM(t.asr)}  ақшам ${fmtHM(t.maghrib)}  құптан ${fmtHM(t.isha)}`);
  ok(Math.abs(t.fajr - 3.67) < 0.25, `таң ≈ 03:40 (${fmtHM(t.fajr)})`);
  ok(Math.abs(t.dhuhr - 12.2) < 0.2, `бесін ≈ 12:12 (${fmtHM(t.dhuhr)})`);
  ok(Math.abs(t.maghrib - 18.73) < 0.25, `ақшам ≈ 18:44 (${fmtHM(t.maghrib)})`);
  ok(t.fajr < t.sunrise && t.sunrise < t.dhuhr && t.dhuhr < t.asr
    && t.asr < t.maghrib && t.maghrib < t.isha, 'намазы идут в правильном порядке');
}

console.log('\n=== 2. Полярное лето не ломает расчёт ===');
{
  // на 51°N в июне Солнце не опускается на 18° — формула даёт NaN без поправки
  let allFinite = true, monotone = true, prevIsha = null;
  for (let d = 1; d <= 31; d++) {
    const t = prayerTimes(new Date(2026, 5, d), astana);
    for (const k of PRAYER_ORDER) if (!isFinite(t[k])) allFinite = false;
  }
  ok(allFinite, 'весь июнь все пять намазов вычисляются (без NaN)');

  // и время не скачет назад по календарю (была такая ошибка с правилом 1/7)
  for (let day = 150; day <= 210; day++) {
    const d = new Date(2026, 0, day);
    const t = prayerTimes(d, astana);
    if (prevIsha !== null && Math.abs(t.isha - prevIsha) > 0.6) monotone = false;
    prevIsha = t.isha;
  }
  ok(monotone, 'құптан меняется плавно, без скачков между днями');
}

console.log('\n=== 3. Все города считаются ===');
{
  let okAll = true;
  for (const c of CITIES) {
    const t = prayerTimes(new Date(2026, 8, 9), c);
    for (const k of PRAYER_ORDER) if (!isFinite(t[k])) okAll = false;
  }
  ok(okAll, `все ${CITIES.length} городов дают конечные времена`);
  const alm = prayerTimes(new Date(2026, 8, 9), CITY_BY_ID.almaty);
  const atr = prayerTimes(new Date(2026, 8, 9), CITY_BY_ID.atyrau);
  ok(atr.maghrib > alm.maghrib,
    `на западе закат позже: Атырау ${fmtHM(atr.maghrib)} > Алматы ${fmtHM(alm.maghrib)}`);
}

console.log('\n=== 4. Определение текущего и следующего намаза ===');
{
  const at345 = new Date(2026, 8, 9, 3, 45);
  const cur = currentPrayer(at345, astana, 60);
  ok(cur && cur.key === 'fajr', `в 03:45 текущий намаз — таң (${cur && cur.key})`);
  ok(cur && cur.agoMin < 10, `прошло меньше 10 мин (${cur && Math.round(cur.agoMin)})`);

  const at1000 = new Date(2026, 8, 9, 10, 0);
  ok(currentPrayer(at1000, astana, 60) === null, 'в 10:00 намаза не было последний час');

  const nx = nextPrayer(at1000, astana);
  ok(nx.key === 'dhuhr', `следующий — бесін (${nx.key} в ${fmtHM(nx.at)})`);
  ok(nx.inMin > 0 && nx.inMin < 24 * 60, `до него ${Math.round(nx.inMin)} мин`);

  // догоняющий: через 40 минут после намаза он ещё считается текущим
  const at420 = new Date(2026, 8, 9, 4, 20);
  const late = currentPrayer(at420, astana, 60);
  ok(late && late.key === 'fajr', 'через 40 мин намаз ещё «догоняет» (окно 60 мин)');
  ok(currentPrayer(at420, astana, 15) === null, 'с окном 15 мин — уже нет');
}

console.log('\n=== 5. Поведение в игре ===');
{
  let hud = null;
  const game = new Game(mkCanvas(), { difficulty: 'normal', loadSave: false,
    onHud: (h) => { hud = h; }, onGameOver: () => {}, onPauseRequest: () => {} });
  const tc = game.blds.find(b => b.owner === 'player' && b.key === 'towncenter');
  const mosque = game.addBld('mosque', 'player', tc.x + 260, tc.y + 180, 1);
  mosque.done = 1;

  // по умолчанию режим выключен — старое поведение сохранено
  game.pushHud();
  ok(game.settings.realAzan === false, 'по умолчанию азан по игровым суткам');
  ok(hud.realAzan === null, 'в HUD нет реального расписания, пока режим выключен');

  // включаем
  game.settings.realAzan = true;
  game.settings.azanCity = 'astana';
  game.pushHud();
  ok(hud.realAzan && hud.realAzan.on, 'режим включился');
  ok(hud.realAzan.times.length === 5, `расписание из 5 намазов (${hud.realAzan.times.length})`);
  ok(hud.realAzan.city === 'Астана', `город показан (${hud.realAzan.city})`);
  ok(/^\d\d:\d\d$/.test(hud.realAzan.nextAt), `время следующего намаза (${hud.realAzan.nextAt})`);

  // азан не звучит дважды за один реальный намаз
  game.realAzanDone = [];
  game.realAzanDay = '';
  const before = game.prayerCount;
  for (let i = 0; i < 200; i++) game.update(1 / 30);
  const twice = game.realAzanDone.length > 1;
  ok(!twice, `за один прогон не более одного азана (сработало: ${game.realAzanDone.length})`);
  void before;

  // смена города меняет расписание
  game.settings.azanCity = 'atyrau';
  game.pushHud();
  ok(hud.realAzan.city === 'Атырау', 'смена города подхватилась');
}

console.log(`\nИтог: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
