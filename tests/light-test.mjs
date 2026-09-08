// Ночное освещение: факелы у зданий (1.0.073).
// Проверяем ЛОГИКУ композиции, читая её из engine.ts, — свет обязан СНИМАТЬ
// ночь (destination-out), а не подмешивать белизну поверх затемнения.
import fs from 'node:fs';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('PASS', n)) : (fail++, console.log('FAIL', n, x)); };
const eng = fs.readFileSync('src/game/engine.ts', 'utf8');
const art = fs.readFileSync('src/game/pixelart.ts', 'utf8');
const body = (src, sig) => {
  const at = src.indexOf(sig); if (at < 0) return '';
  let i = src.indexOf('{', at), d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) return src.slice(i, j + 1);
  }
  return '';
};
const light = body(eng, 'drawNightLight(tint: string)');
ok('метод ночного освещения есть', light.length > 0);

// ── свет вырезает ночь, а не красит поверх ──
ok('свет вырезает затемнение (destination-out)', /destination-out/.test(light));
ok('ночь копится в отдельном холсте', /lightCv|createElement\('canvas'\)/.test(light + eng));
ok('готовый слой выводится на экран', /drawImage\(lc, 0, 0\)/.test(light));
ok('холст переиспользуется, а не создаётся каждый кадр',
  /if \(!this\.lightCv\)/.test(light), 'должно быть ленивое создание');
ok('размер холста следует за окном', /lc\.width !== W \|\| lc\.height !== H/.test(light));
ok('есть запасной путь без второго холста', /if \(!lc \|\| !lx\)/.test(light));

// ── когда факелы горят ──
// именно ОБЪЯВЛЕНИЕ метода, а не первый вызов this.torchLit()
const litFn = body(eng, '\n  torchLit(): number');
ok('порог зажигания общий для света и огоньков', litFn.length > 0);
ok('днём факелы не горят', /darkness\(\) - 0\.12/.test(litFn));
const litAt = d => Math.min(1, Math.max(0, (d - 0.12) / 0.5));
ok('в полдень (тьма 0) факелы потушены', litAt(0) === 0);
ok('в начале сумерек ещё не горят', litAt(0.12) === 0);
ok(`в середине сумерек разгораются (${litAt(0.5).toFixed(2)})`, litAt(0.5) > 0.5 && litAt(0.5) < 1);
ok('в глухую ночь горят в полную силу', litAt(1) === 1);
ok('при выключенном цикле суток факелов нет', /settings\.dayNight/.test(litFn));

// ── что освещает ──
ok('недостроенное здание не светит', /b\.done < 1/.test(light));
ok('у дувала и ворот факелов нет', /'wall' \|\| b\.key === 'gate'/.test(light));
ok('свет не выдаёт неразведанные земли', /fogOfWar && !this\.fogAt/.test(light));
ok('за экраном свет не считается', /px < -R \|\| py < -R/.test(light));
ok('радиус зависит от размера здания', /b\.size \* [\d.]+ \+ \d+/.test(light));
ok('источники собираются одним проходом', /const lamps/.test(light));
ok('тёплый отблеск идёт поверх (lighter)', /'lighter'/.test(light));

// ── градиент: центр светлее края, край гаснет в ноль ──
const stops = [...light.matchAll(/addColorStop\(([\d.]+), `rgba\(0,0,0,\$\{\(([\d.]+) \* lit\)/g)]
  .map(m => [parseFloat(m[1]), parseFloat(m[2])]);
ok(`градиент света имеет ${stops.length} ступени`, stops.length >= 3, stops.length);
ok('яркость падает от центра к краю',
  stops.every((s, i) => i === 0 || s[1] < stops[i - 1][1]), JSON.stringify(stops));
ok('край пятна не режет ночь', /addColorStop\(1, 'rgba\(0,0,0,0\)'\)/.test(light));
// центр не должен снимать ночь полностью — иначе у зданий будет «день»
ok('в центре остаётся немного ночи', stops[0][1] < 0.9, stops[0][1]);
const nightA = 0.42, centerA = nightA * (1 - stops[0][1]);
ok(`в центре снято ${((1 - centerA / nightA) * 100).toFixed(0)}% темноты`,
  centerA > 0.02 && centerA < nightA * 0.3, centerA.toFixed(3));

// ── сам факел нарисован ──
ok('факел рисуется в pixelart', /export function drawTorch/.test(art));
const torch = body(art, 'export function drawTorch');
ok('у факела есть шест и чаша', /4a3115|57534e/.test(torch));
ok('пламя из нескольких язычков', (torch.match(/cx\(ctx/g) || []).length >= 3);
ok('пламя мерцает', /Math\.sin\(t \*/.test(torch));
ok('у каждого здания своя фаза мерцания', /seed/.test(torch));
ok('потушенный факел не рисуется', /if \(lit <= 0\.01\) return/.test(torch));
const bt = body(eng, 'drawBldTorches(b: Bld');
ok('факелы ставятся парой по бокам', (bt.match(/drawTorch\(/g) || []).length === 2);
ok('факелы у здания используют тот же порог', /torchLit\(\)/.test(bt));

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
