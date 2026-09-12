// Род джунгар (п.12, 1.0.131): враг тоже выходит под своей таңбой.
// Проверяем НА ЖИВОМ ДВИЖКЕ (не по исходнику): жеребьёвку, бонусы вражеской
// конницы и башен, сохранение/загрузку и совместимость со старыми сейвами.
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
g.localStorage = { _v: null, getItem() { return this._v; }, setItem(_k, v) { this._v = v; }, removeItem() { this._v = null; } };
g.Image = class { constructor() { this.width = 64; this.height = 64; this.naturalWidth = 64; this.naturalHeight = 64; this.complete = true; } set src(_v) {} get src() { return ''; } };
g.Audio = class { play() { return Promise.resolve(); } pause() {} addEventListener() {} load() {} };
g.AudioContext = class { createGain() { return { connect: () => {}, gain: { value: 0, setValueAtTime: () => {} } }; }
  createOscillator() { return { connect: () => {}, start: () => {}, stop: () => {}, frequency: { value: 0, setValueAtTime: () => {} } }; }
  get destination() { return {}; } get currentTime() { return 0; } resume() {} };
g.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return mkCtx(); } };
g.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });

const dir = mkdtempSync(join(tmpdir(), 'rival-'));
const outfile = join(dir, 'engine.mjs');
await build({ stdin: {
    contents: `export { Game } from './src/game/engine';\nexport { CLANS, CLAN_BY_ID, clanMods, randomClan, RIVAL_NOTE } from './src/game/clans';
export { TRIBE_IDS } from './src/game/nations';`,
    resolveDir: process.cwd(), loader: 'ts', sourcefile: 'rival-entry.ts',
  },
  bundle: true, format: 'esm', platform: 'neutral', outfile,
  loader: { '.png': 'text', '.jpg': 'text', '.mp3': 'text', '.webp': 'text' }, logLevel: 'silent' });
const { Game, CLANS, clanMods, randomClan, RIVAL_NOTE, TRIBE_IDS } = await import('file://' + outfile);

let n = 0, f = 0;
const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

const IDS = CLANS.map(c => c.id);
function mkGame(opts = {}) {
  let hud = null;
  const game = new Game(mkCanvas(), { difficulty: 'normal', loadSave: false,
    onHud: (h) => { hud = h; }, onGameOver: () => {}, onPauseRequest: () => {}, ...opts });
  game.vw = 1280; game.vh = 720;
  return { game, hud: () => { game.pushHud(); return hud; } };
}

console.log('\n=== 1. Жеребьёвка рода врага ===');
{
  const a = mkGame();
  ok(IDS.includes(a.game.rivalClan), `род джунгар: ${a.game.rivalClan}`);
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(randomClan());
  ok(seen.size === IDS.length, `randomClan покрывает все ${IDS.length} родов (${[...seen].join(', ')})`);
  const h = a.hud();
  ok(h?.rivalClan?.id === a.game.rivalClan, `HUD отдаёт род врага (${h?.rivalClan?.name})`);
  ok(!!h?.rivalClan?.tamga && !!h?.rivalClan?.note, `в HUD таңба и примечание: «${h?.rivalClan?.note}»`);
  ok(IDS.every(id => typeof RIVAL_NOTE[id] === 'string' && RIVAL_NOTE[id].length > 0), 'у каждого рода есть описание для панели');
}

console.log('\n=== 2. Конница джунгар живучее, если они Найман ===');
{
  // мерилка: одна и та же конница при разных родах врага
  const hp = (clan, key = 'cavalry') => {
    const { game } = mkGame();
    game.rivalClan = clan;
    const u = game.addUnit(key, 'enemy', 0, 0);
    return u.maxHp;
  };
  const base = hp('argyn'), nai = hp('naiman');
  ok(nai === Math.round(base * 1.1), `конница: ${base} → ${nai} HP у джунгар-Найман (+10%)`);
  ok(hp('uisyn') === base, 'для Ұйсын конница базовая (их бонус — башни и стройка)');
  const knight = hp('naiman', 'knight');
  ok(knight === Math.round(hp('argyn', 'knight') * 1.1), `батыры джунгар тоже живучее: ${hp('argyn', 'knight')} → ${knight} HP`);
}

console.log('\n=== 3. Башни джунгар крепче, если они Ұйсын ===');
{
  const hp = (clan) => {
    const { game } = mkGame();
    game.rivalClan = clan;
    return game.addBld('tower', 'enemy', 0, 0).maxHp;
  };
  const base = hp('argyn'), uis = hp('uisyn');
  ok(uis === Math.round(base * 1.15), `башня: ${base} → ${uis} HP (+15%)`);
}

console.log('\n=== 4. Род игрока не протекает на врага ===');
{
  const { game } = mkGame({ settings: { ...{}, clan: 'naiman', difficulty: 'normal' } });
  game.rivalClan = 'argyn';
  const withPlayerNaiman = game.addUnit('cavalry', 'enemy', 0, 0).maxHp;
  const { game: g2 } = mkGame({ settings: { clan: 'argyn', difficulty: 'normal' } });
  g2.rivalClan = 'argyn';
  const plain = g2.addUnit('cavalry', 'enemy', 0, 0).maxHp;
  ok(withPlayerNaiman === plain, `род игрока (Найман) не усиливает джунгар: ${withPlayerNaiman} = ${plain}`);
  // и наоборот: род врага не усиливает игрока
  const mine = g2.addUnit('cavalry', 'player', 0, 0).maxHp;
  const { game: g3 } = mkGame({ settings: { clan: 'argyn', difficulty: 'normal' } });
  g3.rivalClan = 'naiman';
  const mine2 = g3.addUnit('cavalry', 'player', 0, 0).maxHp;
  ok(mine === mine2, 'род джунгар не усиливает игрока');
}

console.log('\n=== 5. Род врага едет в сейв и обратно ===');
{
  const { game } = mkGame();
  game.rivalClan = 'kerey';
  const json = game.serialize();
  ok(JSON.parse(json).rivalClan === 'kerey', 'род джунгар записан в сейв');

  g.localStorage._v = json;
  const loaded = mkGame({ loadSave: true });
  ok(loaded.game.rivalClan === 'kerey', `после загрузки род тот же: ${loaded.game.rivalClan}`);
  g.localStorage._v = null;
}

console.log('\n=== 6. Старый сейв без поля rivalClan ===');
{
  const { game } = mkGame();
  const d = JSON.parse(game.serialize());
  delete d.rivalClan;                       // сейв из 1.0.130 или раньше
  g.localStorage._v = JSON.stringify(d);
  const loaded = mkGame({ loadSave: true });
  ok(IDS.includes(loaded.game.rivalClan), `старый сейв грузится, род доигран: ${loaded.game.rivalClan}`);
  ok(loaded.game.units.length > 0 && loaded.game.blds.length > 0, 'партия восстановлена (юниты и постройки на месте)');
  g.localStorage._v = null;
}

console.log('\n=== 7. Добыча и найм на живом движке (Дулат) ===');
{
  // скорость добычи: workMult уже учитывает род владельца
  const wm = (clan) => {
    const { game } = mkGame({ settings: { clan, difficulty: 'normal' } });
    const v = game.units.find(u => u.owner === 'player' && u.key === 'villager');
    return game.workMult(v);
  };
  const base = wm('argyn'), dul = wm('dulat');
  ok(Math.abs(dul / base - 1.10) < 0.01, `добыча: ×${(dul / base).toFixed(3)} для Дулата (ожидали ×1.10)`);
  ok(Math.abs(wm('naiman') / base - 1) < 1e-9, 'для Найман добыча базовая');

  // темп найма: смотрим, сколько стоит в очереди реальный юнит
  const tq = (clan) => {
    const { game } = mkGame({ settings: { clan, difficulty: 'normal' } });
    game.res.food = 9999; game.res.wood = 9999; game.res.gold = 9999;
    game.train('villager');
    const tc = game.blds.find(b => b.owner === 'player' && b.key === 'towncenter');
    return tc.queue[tc.queue.length - 1].total;
  };
  const t0 = tq('argyn'), t1 = tq('dulat');
  ok(Math.abs(t0 / t1 - 1.10) < 0.01, `найм: ${t0.toFixed(2)} с → ${t1.toFixed(2)} с для Дулата (−10% времени)`);
}

console.log('\n=== 7b. Расширенные домены родов (1.0.134) ===');
{
  // ВАЖНО: сравниваем ВНУТРИ одной партии. Сезон, погода и усталость крестьянина
  // в новой партии другие, и разница между родами тонет в этом шуме (на замере
  // скорости керуена так и вышло: 15% превращались в 11.7%).
  const one = (clan) => mkGame({ settings: { clan, difficulty: 'normal' } }).game;

  // Арғын: дойка быстрее (множитель «животноводство»), а лес — как у всех
  {
    const game = one('naiman');
    const v = game.units.find(u => u.owner === 'player' && u.key === 'villager');
    const rate = (wkind) => { v.wkind = wkind; return game.workMult(v); };
    const chop0 = rate('chop'), milk0 = rate('milk');
    game.settings.clan = 'argyn';
    const chop1 = rate('chop'), milk1 = rate('milk');
    ok(Math.abs(milk1 / milk0 - 1.15) < 0.005, `Арғын доит на ${((milk1 / milk0 - 1) * 100).toFixed(1)}% быстрее`);
    ok(Math.abs(chop1 / chop0 - 1) < 1e-9, 'рубит лес как все — бонус только у животноводства');
  }

  // Қыпшақ: керуены идут быстрее.
  // Скорость юнита при рождении умножается на rand(0.94, 1.06) — разброс ±6%,
  // поэтому один-два юнита ничего не докажут (мерил: выходило то +9.6%, то
  // +19.3%). Берём среднее по 40 керуенам: погрешность среднего ≈ ±0.8%.
  {
    const game = one('naiman');
    const mean = (clan, n = 40) => {
      game.settings.clan = clan;
      let s = 0;
      for (let i = 0; i < n; i++) s += game.addUnit('trader', 'player', 0, 0).speed;
      return s / n;
    };
    const a = mean('naiman'), b = mean('qypshaq');
    ok(Math.abs(b / a - 1.15) < 0.02, `Қыпшақ: керуен идёт на ${((b / a - 1) * 100).toFixed(1)}% быстрее (среднее по 40)`);
  }

  // Керей: скидка и на послов, и на дары — цена считается одним методом
  {
    const game = one('naiman');
    const g0 = game.giftPrice(TRIBE_IDS[0]), e0 = game.envoyPrice(TRIBE_IDS[0]);
    game.settings.clan = 'kerey';
    const g1 = game.giftPrice(TRIBE_IDS[0]), e1 = game.envoyPrice(TRIBE_IDS[0]);
    ok(g1 === Math.round(g0 * 0.85), `дары племени: ${g0} → ${g1} золота для Керея (−15%)`);
    ok(e1 === Math.round(e0 * 0.85), `посланник: ${e0} → ${e1} золота для Керея (−15%)`);
  }
}

console.log('\n=== 8. Перевод родов врага: волны и стан (1.0.133) ===');
{
  // Арғын: «приплод» у врага оборачивается плотным набегом.
  // ВАЖНО: на 1-2 волнах (n≈3) 15% тонут в округлении — эффект начинает
  // чувствоваться с середины партии, поэтому и мерим на 6-й волне.
  const wsize = (clan, wave = 6) => { const { game } = mkGame(); game.rivalClan = clan; game.wave = wave; return game.waveComp().length; };
  const base = wsize('naiman'), arg = wsize('argyn');
  ok(arg > base, `состав 6-й волны: ${base} → ${arg} воинов у джунгар-Арғын`);
  ok(arg <= Math.ceil(base * 1.15), 'и не больше обещанных +15%');
  ok(wsize('uisyn') === base, 'у прочих родов волна базовая');
  ok(wsize('argyn', 0) === wsize('naiman', 0), 'на первой волне разницы ещё нет (округление) — честно');

  // Дулат: «найм быстрее» у врага — людный стан (лимит его крестьян выше)
  const vills = (clan) => {
    const { game } = mkGame();
    game.rivalClan = clan;
    for (let i = 0; i < 90 * 30; i++) { game.eres.food = 9999; game.update(1 / 30); }
    return game.units.filter(u => u.owner === 'enemy' && u.key === 'villager').length;
  };
  const v0 = vills('argyn'), v1 = vills('dulat');
  ok(v1 > v0, `крестьян в стане джунгар: ${v0} → ${v1} у Дулата (+15% к лимиту)`);
  ok(IDS.every(id => typeof RIVAL_NOTE[id] === 'string' && !/нейтрально/.test(RIVAL_NOTE[id])),
    'у каждого рода врага теперь есть боевой эффект (ни одного «нейтрально»)');
}

console.log('\n=== 9. Множители врага в тех же ±15% ===');
{
  const worst = Math.max(...CLANS.map(c => Math.max(
    Math.abs(c.mods.cavHp - 1), Math.abs(c.mods.towerHp - 1),
    Math.abs(c.mods.build - 1), Math.abs(c.mods.scout - 1), Math.abs(c.mods.envoy - 1))));
  ok(worst <= 0.15 + 1e-9, `максимальное отклонение у врага ${(worst * 100).toFixed(0)}%`);
  ok(clanMods('нет такого').cavHp === 1, 'неизвестный род по-прежнему нейтрален');
}

console.log(`\nИтог: ${n - f} ok, ${f} fail`);
process.exit(f ? 1 : 0);
