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

console.log('\n=== 1. Расписание СОВПАДАЕТ с таблицей ДУМК (muftyat.kz) ===');
{
  // Эталон — официальная таблица ДУМК для Астаны. Проверяем ВСЕ пять намазов
  // на нескольких датах двух разных сезонов: параметры не должны быть
  // подгонкой под один месяц.
  const toMin = (s) => { const [a, b] = s.split(':').map(Number); return a * 60 + b; };
  const REF = [
    [8, 1,  ['03:47', '05:22', '12:19', '17:00', '19:06', '20:40']],
    [8, 9,  ['04:03', '05:35', '12:17', '16:46', '18:48', '20:19']],
    [8, 15, ['04:15', '05:44', '12:15', '16:34', '18:34', '20:03']],
    [8, 21, ['04:26', '05:53', '12:12', '16:23', '18:20', '19:48']],
    [8, 30, ['04:41', '06:08', '12:09', '16:05', '18:00', '19:26']],
    [1, 1,  ['06:17', '07:47', '12:33', '15:21', '17:09', '18:40']],
    [1, 15, ['05:56', '07:23', '12:33', '15:44', '17:35', '19:02']],
  ];
  let worst = 0, worstAt = '';
  for (const [m, d, w] of REF) {
    const t = prayerTimes(new Date(2026, m, d), astana);
    const got = [t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha];
    got.forEach((g, i) => {
      const diff = Math.abs(Math.round(g * 60 - toMin(w[i])));
      if (diff > worst) { worst = diff; worstAt = `${d}.${m + 1} ${['таң','күн','бесін','екінті','ақшам','құптан'][i]}`; }
    });
  }
  const sep9 = prayerTimes(new Date(2026, 8, 9), astana);
  console.log(`     9 сентября: таң ${fmtHM(sep9.fajr)}  күн ${fmtHM(sep9.sunrise)}  бесін ${fmtHM(sep9.dhuhr)}  екінті ${fmtHM(sep9.asr)}  ақшам ${fmtHM(sep9.maghrib)}  құптан ${fmtHM(sep9.isha)}`);
  ok(fmtHM(sep9.fajr) === '04:03', `таң 9 сентября = 04:03 (${fmtHM(sep9.fajr)})`);
  ok(fmtHM(sep9.dhuhr) === '12:17', `бесін = 12:17 (${fmtHM(sep9.dhuhr)})`);
  ok(fmtHM(sep9.asr) === '16:46', `екінті = 16:46 (${fmtHM(sep9.asr)})`);
  ok(worst <= 3, `отклонение от ДУМК ≤3 мин на 7 датах (максимум ${worst} мин${worst ? ', ' + worstAt : ''})`);
  ok(sep9.fajr < sep9.sunrise && sep9.sunrise < sep9.dhuhr && sep9.dhuhr < sep9.asr
    && sep9.asr < sep9.maghrib && sep9.maghrib < sep9.isha, 'намазы идут в правильном порядке');
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
  // таң 9 сентября = 04:03 (ДУМК), поэтому «только что наступил» — это 04:08
  const at408 = new Date(2026, 8, 9, 4, 8);
  const cur = currentPrayer(at408, astana, 60);
  ok(cur && cur.key === 'fajr', `в 04:08 текущий намаз — таң (${cur && cur.key})`);
  ok(cur && cur.agoMin < 10, `прошло меньше 10 мин (${cur && Math.round(cur.agoMin)})`);
  // а до наступления таң намаза ещё нет
  ok(currentPrayer(new Date(2026, 8, 9, 3, 45), astana, 60) === null,
    'в 03:45 (до таң) намаза ещё не было');

  const at1000 = new Date(2026, 8, 9, 10, 0);
  ok(currentPrayer(at1000, astana, 60) === null, 'в 10:00 намаза не было последний час');

  const nx = nextPrayer(at1000, astana);
  ok(nx.key === 'dhuhr', `следующий — бесін (${nx.key} в ${fmtHM(nx.at)})`);
  ok(nx.inMin > 0 && nx.inMin < 24 * 60, `до него ${Math.round(nx.inMin)} мин`);

  // догоняющий: через 40 минут после намаза он ещё считается текущим
  const at443 = new Date(2026, 8, 9, 4, 43);   // 40 мин после таң 04:03
  const late = currentPrayer(at443, astana, 60);
  ok(late && late.key === 'fajr', 'через 40 мин намаз ещё «догоняет» (окно 60 мин)');
  ok(currentPrayer(at443, astana, 15) === null, 'с окном 15 мин — уже нет');
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
