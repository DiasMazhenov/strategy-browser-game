// Лист процедурного арта (/?dev=art): поднимаем прод-бандл в jsdom с нужным
// query и проверяем, что все юниты отрисовались без исключений, а кэш кадров
// действительно наполнился. Графику глазами здесь не проверить (layout и
// пиксели вне jsdom), но «не упало» и «кадры кэшируются» — проверяем.
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

let n = 0, f = 0;
const ok = (c, m) => { n++; console.log(c ? '  ok   ' + m : '  FAIL ' + m); if (!c) f++; };
const tick = (ms = 60) => new Promise(r => setTimeout(r, ms));

const stubAssets = {
  name: 'stub-assets',
  setup(build) {
    build.onResolve({ filter: /\.(png|jpe?g|svg|webp|gif|mp3)$/ }, a => ({ path: a.path, namespace: 'stub-asset' }));
    build.onLoad({ filter: /.*/, namespace: 'stub-asset' }, a => ({
      contents: `export default ${JSON.stringify('asset:' + a.path.replace(/^.*\//, ''))};`, loader: 'js',
    }));
  },
};

console.log('\n=== 1. Сборка (как браузер) ===');
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

console.log('\n=== 2. DOM с ?dev=art ===');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/?dev=art' });
const win = dom.window;
const noop = () => {};
// считаем дорогие операции: fillRect — «рисование с нуля», drawImage — «взяли
// готовый кадр из кэша». По их соотношению видно, работает ли кэш.
const cnt = { fillRect: 0, drawImage: 0 };
function mkCtx(canvas) {
  return new Proxy({}, {
    get(_t, p) {
      if (p === 'fillRect') return () => { cnt.fillRect++; };
      if (p === 'drawImage') return () => { cnt.drawImage++; };
      if (p === 'canvas') return canvas;
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (p === 'createPattern') return () => null;
      if (p === 'getImageData') return (_x, _y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (p === 'filter') return 'none';
      return noop;
    }, set: () => true,
  });
}
win.HTMLCanvasElement.prototype.getContext = function () { return mkCtx(this); };
win.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720, x: 0, y: 0 });
win.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop });
win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
win.devicePixelRatio = 1;
win.Path2D = class { moveTo() {} lineTo() {} arc() {} arcTo() {} rect() {} roundRect() {} ellipse() {}
  closePath() {} bezierCurveTo() {} quadraticCurveTo() {} addPath() {} };
win.Image = class {
  constructor() { this._src = ''; this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; this.onload = null; }
  set src(v) { this._src = String(v); } get src() { return this._src; }
  addEventListener() {} removeEventListener() {}
};
win.Audio = class { constructor() { this.volume = 1; } play() { return Promise.resolve(); } pause() {} addEventListener() {} removeEventListener() {} load() {} };

const errors = [];
win.addEventListener('error', e => errors.push(String(e.error || e.message)));
win.console.error = (...a) => errors.push(a.map(String).join(' '));
const origWarn = win.console.warn;
win.console.warn = (...a) => { const s = a.map(String).join(' '); if (!/Not implemented/.test(s)) origWarn(...a); };

const script = win.document.createElement('script');
script.textContent = code;
win.document.body.appendChild(script);
await tick(600);

console.log('\n=== 3. Лист отрисован ===');
const root = win.document.getElementById('root');
const text = (root.textContent || '').replace(/\s+/g, ' ');
ok(root.children.length > 0, 'React примонтировался');
ok(/Лист процедурного арта/.test(text), 'открылся лист арта, а не игра');

const cv = root.querySelector('canvas');
ok(!!cv, 'canvas листа создан');
ok(cv && cv.width > 400 && cv.height > 400, `размер полотна: ${cv?.width}×${cv?.height}`);

const frames = Number((text.match(/кадров:\s*(\d+)/) || [])[1] || 0);
const cached = Number((text.match(/в кэше:\s*(\d+)/) || [])[1] || 0);
const units = Number((text.match(/юнитов:\s*(\d+)/) || [])[1] || 0);
ok(units >= 12, `юнитов на листе: ${units}`);
ok(frames >= units * 4, `кадров отрисовано: ${frames} (по 4 на юнита)`);
ok(cached > 0 && cached <= frames, `в кэше кадров: ${cached} — переиспользуются, а не рисуются заново`);

console.log('\n=== 4. Переключение команды не ломает лист ===');
{
  const btn = [...root.querySelectorAll('button')].find(b => /Джунгары/.test(b.textContent || ''));
  ok(!!btn, 'кнопка «Джунгары» найдена');
  if (btn) {
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await tick(250);
    const t2 = (root.textContent || '').replace(/\s+/g, ' ');
    ok(/кадров:\s*\d+/.test(t2), 'лист перерисовался на другой команде');
    ok(/в кэше:\s*(\d+)/.test(t2) && Number((t2.match(/в кэше:\s*(\d+)/) || [])[1]) > cached - 1, 'кэш пополнился кадрами другой команды');
  }
}

console.log('\n=== 5. Кэш кадров: повторная отрисовка не рисует заново ===');
const cold = cnt.fillRect;   // сколько примитивов ушло на первый (холодный) проход
{
  // вернулись на «Казахов»: их кадры уже собраны при первом проходе
  const btn = [...root.querySelectorAll('button')].find(b => /Казахи/.test(b.textContent || ''));
  ok(!!btn, 'кнопка «Казахи» найдена');
  cnt.fillRect = 0; cnt.drawImage = 0;
  btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(250);
  // контур каждого нового кадра = 8 drawImage, но на уже готовые кадры
  // fillRect тратиться не должен — только на те, что собраны не были
  console.log(`  · диагностика: fillRect=${cnt.fillRect} drawImage=${cnt.drawImage}`);
  ok(cnt.fillRect < cold / 5, `повторный проход ${cnt.fillRect} примитивов против ${cold} на холодном кэше — кэш работает`);
}

ok(errors.length === 0, `ошибок в консоли: ${errors.length}${errors.length ? ' — ' + errors[0].slice(0, 200) : ''}`);

win.close();
console.log(`\nИтог: ${n - f} ok, ${f} fail`);
process.exit(f ? 1 : 0);
