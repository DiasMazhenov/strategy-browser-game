// Ленивые спрайты (1.0.127): движок не делает НИ ОДНОГО запроса графики, пока
// не началась партия. Раньше ~240 спрайтов (~10 МБ) качались на одном только меню.
// Проверка не по исходникам, а исполнительная: собираем движок esbuild'ом,
// подменяем Image на счётчик и смотрим, сколько src реально назначено.
import * as esbuild from 'esbuild';
import path from 'node:path';
import { readFileSync } from 'node:fs';

let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Сборка движка для прогона ===');
// Ассеты (png/jpg/svg/mp3) заменяем строками-заглушками: содержимое не важно,
// важны сами факты назначения img.src.
const stubAssets = {
  name: 'stub-assets',
  setup(build) {
    build.onResolve({ filter: /\.(png|jpe?g|svg|webp|gif|mp3)$/ }, a => ({ path: a.path, namespace: 'stub-asset' }));
    build.onLoad({ filter: /.*/, namespace: 'stub-asset' }, a => ({
      contents: `export default ${JSON.stringify('asset:' + path.basename(a.path))};`,
      loader: 'js',
    }));
  },
};
const out = await esbuild.build({
  entryPoints: ['src/game/engine.ts'],
  bundle: true, write: false, format: 'esm', platform: 'neutral',
  plugins: [stubAssets], logLevel: 'silent',
});
const code = out.outputFiles[0].text;
ok(code.length > 100000, `бандл движка собран: ${(code.length / 1024).toFixed(0)} КБ`);

console.log('\n=== 2. Прогон: запросы ДО старта партии ===');
// Назначение img.src = сетевой запрос браузера. Считаем их.
const requests = [];
class FakeImage {
  constructor() { this._src = ''; this.complete = false; this.naturalWidth = 0; this.onload = null; }
  set src(v) { this._src = String(v); requests.push(this._src); }
  get src() { return this._src; }
}
globalThis.Image = FakeImage;
globalThis.document = globalThis.document ?? { createElement: () => ({ getContext: () => null, style: {} }) };

const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
ok(requests.length === 0, `на импорте движка запросов графики: ${requests.length} (было ~240)`);
const pending = mod.pendingGameSprites();
ok(pending > 100, `отложенных спрайтов: ${pending}`);

console.log('\n=== 3. Прогон: запросы ПОСЛЕ warmGameSprites() ===');
const warmed = mod.warmGameSprites();
ok(warmed === pending, `прогрев запросил ровно отложенное: ${warmed}`);
ok(requests.length === warmed, `назначено src: ${requests.length}`);
ok(new Set(requests).size > 100, `уникальных URL: ${new Set(requests).size} из ${requests.length}`);
ok(mod.pendingGameSprites() === 0, 'список отложенных пуст');
const again = mod.warmGameSprites();
ok(again === 0 && requests.length === warmed, 'повторный прогрев ничего не дублирует (идемпотентность)');

console.log('\n=== 4. Проверки по исходникам ===');
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const pix = readFileSync(new URL('../src/game/pixelart.ts', import.meta.url), 'utf8');
ok(!/new Image\(\)[\s\S]{0,60}?im\.src =/.test(eng), 'в движке нет «создали картинку и сразу назначили src»');
ok(!/const mk = [^\n]*im\.src = src/.test(pix), 'pixelart: mk() не назначает src сразу');
ok(/warmGameSprites\(\);[\s\S]{0,200}?this\.canvas = canvas/.test(eng), 'прогрев стоит в конструкторе Game');
ok(/\.complete\b/.test(eng) && /\.complete\b/.test(pix), 'рендер проверяет complete → процедурный фолбэк, пока грузится');

console.log(`\nИтог: ${n - f} ok, ${f} fail`);
process.exit(f ? 1 : 0);
