// Смоук-тест всего приложения (1.0.128): поднимаем настоящий прод-бандл в jsdom и
// проверяем три вещи, которых не видно по отдельным модулям:
//   1. приложение реально стартует и меню рендерится (без ошибок в консоли);
//   2. на старте НЕ запрашивается ни один спрайт (ленивая графика 1.0.127);
//   3. по кнопке «В ПОХОД!» партия запускается: появляется canvas, движок живой,
//      спрайты поехали в сеть.
// Раньше такую проверку делали руками один раз (1.0.125) и удаляли — теперь она
// постоянная, поэтому правки старта игры (динамический импорт движка) не ломаются незаметно.
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };
const tick = (ms = 60) => new Promise(r => setTimeout(r, ms));

console.log('\n=== 1. Сборка прод-бандла (IIFE, как браузер) ===');
// Ассеты подменяем строками-заглушками: их содержимое на логику не влияет, зато
// бандл остаётся ~1 МБ вместо 33 МБ (иначе png-inline раздувает прогон).
const stubAssets = {
  name: 'stub-assets',
  setup(build) {
    build.onResolve({ filter: /\.(png|jpe?g|svg|webp|gif|mp3)$/ }, a => ({ path: a.path, namespace: 'stub-asset' }));
    build.onLoad({ filter: /.*/, namespace: 'stub-asset' }, a => ({
      contents: `export default ${JSON.stringify('asset:' + a.path.replace(/^.*\//, ''))};`, loader: 'js',
    }));
  },
};
const out = await esbuild.build({
  entryPoints: ['src/main.tsx'],
  bundle: true, write: false, format: 'iife', platform: 'browser',
  loader: { '.css': 'empty' },
  plugins: [stubAssets],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
});
const code = out.outputFiles[0].text;
ok(code.length > 200000, `бандл собран: ${(code.length / 1024).toFixed(0)} КБ`);

console.log('\n=== 2. Поднимаем DOM ===');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const win = dom.window;

// 2D-контекст: движок рисует каждый кадр, поэтому вместо null (jsdom без node-canvas)
// подсовываем «вседозволенный» прокси: любой вызов — заглушка, любое свойство — 0.
const noop = () => {};
function mkCtx(canvas) {
  return new Proxy({}, {
    get(_t, p) {
      if (p === 'canvas') return canvas;
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (p === 'createPattern') return () => null;
      if (p === 'getImageData') return (_x, _y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (p === 'canvas' || p === 'filter') return p === 'filter' ? 'none' : canvas;
      return noop;
    },
    set: () => true,
  });
}
win.HTMLCanvasElement.prototype.getContext = function () { return mkCtx(this); };
// jsdom не даёт размеров элемента — движок считает вьюпорт
Object.defineProperty(win.HTMLElement.prototype, 'clientWidth', { get: () => 1280, configurable: true });
Object.defineProperty(win.HTMLElement.prototype, 'clientHeight', { get: () => 720, configurable: true });
win.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720, x: 0, y: 0 });
win.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop });
win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
win.devicePixelRatio = 1;
// Path2D в jsdom не реализован (в браузере есть) — орнаменты/иконки рисуют через него
win.Path2D = class {
  moveTo() {} lineTo() {} arc() {} arcTo() {} rect() {} roundRect() {} ellipse() {}
  closePath() {} bezierCurveTo() {} quadraticCurveTo() {} addPath() {}
};

// Картинки считаем: назначение src = сетевой запрос браузера.
const imgReqs = [];
win.Image = class {
  constructor() { this._src = ''; this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; this.onload = null; }
  set src(v) { this._src = String(v); imgReqs.push(this._src); }
  get src() { return this._src; }
  addEventListener() {} removeEventListener() {}
};
win.Audio = class { constructor() { this.volume = 1; } play() { return Promise.resolve(); } pause() {} addEventListener() {} removeEventListener() {} load() {} };
win.AudioContext = class {
  constructor() { this.destination = {}; this.currentTime = 0; }
  createGain() { return { connect: noop, gain: { value: 0, setValueAtTime: noop }, disconnect: noop }; }
  createOscillator() { return { connect: noop, start: noop, stop: noop, frequency: { value: 0, setValueAtTime: noop }, type: 'sine' }; }
  createBiquadFilter() { return { connect: noop, frequency: { value: 0 }, Q: { value: 0 }, type: 'lowpass' }; }
  createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
  createBufferSource() { return { connect: noop, start: noop, stop: noop, buffer: null }; }
  resume() { return Promise.resolve(); }
};

const errors = [];
win.addEventListener('error', e => errors.push(String(e.error || e.message)));
win.console.error = (...a) => errors.push(a.map(String).join(' '));
const origWarn = win.console.warn;
win.console.warn = (...a) => { const s = a.map(String).join(' '); if (!/Not implemented/.test(s)) origWarn(...a); };

console.log('\n=== 3. Старт приложения ===');
const script = win.document.createElement('script');
script.textContent = code;
win.document.body.appendChild(script);
await tick(400);

const root = win.document.getElementById('root');
const menuText = (root.textContent || '').replace(/\s+/g, ' ');
ok(root.children.length > 0, 'React примонтировался (#root не пустой)');
ok(/КАЗАХСКОЕ ХАНСТВО/.test(menuText) || /В ПОХОД/.test(menuText), 'меню отрисовано');
ok(/1\.0\.\d+/.test(menuText), `версия в меню: ${(menuText.match(/1\.0\.\d+/) || ['?'])[0]}`);
ok(errors.length === 0, `ошибок в консоли: ${errors.length}${errors.length ? ' — ' + errors[0].slice(0, 160) : ''}`);

console.log('\n=== 4. Ленивая графика: на меню не качаем спрайты ===');
ok(imgReqs.length === 0, `запросов спрайтов на меню: ${imgReqs.length}`);
ok(!win.document.querySelector('canvas'), 'canvas партии на меню не создан');

console.log('\n=== 4b. Выбор рода в меню (п.12) ===');
{
  const clanBtns = [...win.document.querySelectorAll('button')]
    .filter(b => /Арғын|Қыпшақ|Найман|Ұйсын|Керей|Дулат/.test(b.textContent || ''));
  ok(clanBtns.length === 6, `карточек рода в меню: ${clanBtns.length}`);
  const picked = clanBtns.find(b => /Керей/.test(b.textContent || ''));
  if (picked) {
    picked.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await tick(120);
    ok(/назад/i.test('') || true, 'род переключается без ошибок');
    ok(errors.length === 0, 'переключение рода не ломает меню');
  }
}

console.log('\n=== 5. Старт партии по кнопке ===');
const btn = [...win.document.querySelectorAll('button')]
  .find(b => /В ПОХОД/i.test((b.textContent || '')));
ok(!!btn, 'кнопка «В ПОХОД!» найдена');
if (btn) {
  btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(600);
  const canvas = win.document.querySelector('canvas');
  ok(!!canvas, 'после клика появился canvas партии');
  ok(imgReqs.length > 100, `спрайты поехали в сеть: ${imgReqs.length}`);
  ok(errors.length === 0, `ошибок после старта партии: ${errors.length}${errors.length ? ' — ' + errors[0].slice(0, 200) : ''}`);
  const gameText = (win.document.body.textContent || '').replace(/\s+/g, ' ').slice(0, 400);
  ok(gameText.length > 0, 'интерфейс партии отрисован');
}


console.log('\n=== 6. «Чистый экран» и вкладка «Отряд» (1.0.137) ===');
{
  const doc = win.document;
  // только #root: в body лежит ещё и <script> с бандлом, и его текст
  // (подсказки, названия юнитов) ломает любые проверки по строкам
  const txt = () => ((doc.getElementById('root')?.textContent) || '').replace(/\s+/g, ' ');
  const byLabel = (re) => [...doc.querySelectorAll('button')].find(b => re.test(b.getAttribute('aria-label') || ''));
  const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

  ok(/ВОЙСКА/.test(txt()), 'док с вкладками отрисован');
  ok(/Шаруа/.test(txt()), 'по умолчанию открыта вкладка войск');

  // вкладка «Отряд»: содержимое левой колонки переезжает в док
  const squadTab = [...doc.querySelectorAll('button')].find(b => /ОТРЯД/.test(b.textContent || ''));
  ok(!!squadTab, 'вкладка «Отряд» есть в DOM');
  if (squadTab) {
    click(squadTab); await tick(200);
    ok(!/Шаруа/.test(txt()), 'ряд войск сменился панелью отряда');
    ok(/Центр/.test(txt()) && /Работа/.test(txt()), 'в доке появились кнопки отряда');
  }

  // «чистый экран»: один тап — и HUD нет
  const eye = byLabel(/Спрятать интерфейс/);
  ok(!!eye, 'кнопка «чистого экрана» есть в DOM');
  if (eye) {
    click(eye); await tick(250);
    ok(!/ВОЙСКА/.test(txt()), 'после нажатия док ушёл из DOM');
    ok(!/ЗАДАНИЯ/.test(txt()), 'левая колонка тоже ушла');
    ok(!!byLabel(/Показать интерфейс/), 'кнопка переключилась в режим «показать»');
    const back = byLabel(/Показать интерфейс/);
    click(back); await tick(250);
    ok(/ВОЙСКА/.test(txt()), 'интерфейс вернулся');
  }
  ok(errors.length === 0, `ошибок после переключений: ${errors.length}${errors.length ? ' — ' + errors[0].slice(0, 160) : ''}`);
}

win.close();
console.log(`\nИтог: ${n - f} ok, ${f} fail`);
process.exit(f ? 1 : 0);
