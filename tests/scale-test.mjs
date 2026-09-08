// Пропорции юнитов: рост ЧЕЛОВЕКА на экране должен совпадать у всех пеших.
// Ловит регресс вида «мерген ниже сарбаза»: UNIT_TARGET_H задаёт высоту КАДРА,
// а у лучника лук поднят над головой — без поправки фигура ужимается.
// Запуск: node tests/scale-test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const M = require(join(root, 'scripts/make-altybakan.cjs'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

// Макушка: первая сверху строка со сплошным горизонтальным отрезком >= 12px.
// Тонкие лук / наконечник пики такого отрезка не дают и в рост не попадают.
function headTop(im, run = 12) {
  for (let y = 0; y < im.h; y++) {
    let cur = 0;
    for (let x = 0; x < im.w; x++) {
      if (im.px[(y * im.w + x) * 4 + 3] > 40) { cur++; if (cur >= run) return y; }
      else cur = 0;
    }
  }
  return 0;
}

const art = readFileSync(join(root, 'src/game/pixelart.ts'), 'utf8');
const spr = readFileSync(join(root, 'src/game/sprite-art.ts'), 'utf8');

// HEAD_TOP из исходника — проверяем именно то, что использует игра
const htBlock = art.slice(art.indexOf('const HEAD_TOP'), art.indexOf('const headCut'));
const HEAD_TOP = {};
for (const m of htBlock.matchAll(/(kz_\w+):\s*([\d.]+)/g)) HEAD_TOP[m[1]] = +m[2];

// UNIT_TARGET_H из sprite-art.ts
const T = {};
const tBlock = /UNIT_TARGET_H[^{]*\{([^}]*)\}/.exec(spr)[1];
for (const m of tBlock.matchAll(/(\w+):\s*(\d+)/g)) T[m[1]] = +m[2];

console.log('\n=== 1. Поправка на надголовный вынос действует ===');
{
  ok(Object.keys(HEAD_TOP).length >= 6, `HEAD_TOP заполнен (${Object.keys(HEAD_TOP).length} кадров)`);
  ok(/kz_archer/.test(htBlock), 'мерген учтён (лук над головой)');
  ok(/kz_spearman/.test(htBlock), 'найзагер учтён (наконечник пики)');
  ok(/scale = \(H \/ an\.h\) \/ \(1 - headCut\)/.test(art),
    'масштаб делится на долю человека, а не берётся по всему кадру');
  ok(/drawImage\(drawIm, -an\.ax \* scale, -an\.ay \* scale, w, an\.h \* scale\)/.test(art),
    'высота отрисовки = an.h * scale, ноги остаются на земле');
}

console.log('\n=== 2. Рост человека совпадает у всех пеших юнитов ===');
{
  const dir = join(root, 'src/assets/sprites/units/kz');
  const kinds = ['villager', 'swordsman', 'archer', 'spearman', 'monk', 'scout'];
  const heights = [];
  for (const k of kinds) {
    const pre = 'kz_' + k;
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.png') && new RegExp(`^${pre}(_[bf]|_w[ab])?\\.png$`).test(f))
      .sort();
    for (const f of files) {
      const key = f.replace('.png', '');
      const im = M.readPNG(join(dir, f));
      const bb = M.bbox(im);
      const frac = (bb.y1 - headTop(im) + 1) / im.h;
      const h = (T[k] ?? 46) * frac / (1 - (HEAD_TOP[key] ?? 0));
      heights.push({ key, h });
    }
  }
  const base = heights.find(x => x.key === 'kz_villager').h;
  const dev = heights.map(x => ({ key: x.key, d: (x.h / base - 1) * 100 }));
  const worst = dev.reduce((a, b) => Math.abs(b.d) > Math.abs(a.d) ? b : a);
  ok(Math.abs(worst.d) <= 8,
    `все пешие в пределах ±8 % от шаруа (худший: ${worst.key} ${worst.d.toFixed(0)} %)`);

  // мерген — главная жалоба: он был на 13 % ниже
  const arch = dev.filter(x => x.key.startsWith('kz_archer'));
  const worstArch = arch.reduce((a, b) => Math.abs(b.d) > Math.abs(a.d) ? b : a);
  ok(Math.abs(worstArch.d) <= 4,
    `мерген ростом со всеми (макс. отклонение ${worstArch.d.toFixed(0)} %)`);
}

console.log('\n=== 3. Рост не прыгает между кадрами одного юнита ===');
{
  const dir = join(root, 'src/assets/sprites/units/kz');
  for (const k of ['archer', 'spearman', 'swordsman', 'villager']) {
    const pre = 'kz_' + k;
    const hs = readdirSync(dir)
      .filter(f => f.endsWith('.png') && new RegExp(`^${pre}(_[bf]|_w[ab])?\\.png$`).test(f))
      .map(f => {
        const key = f.replace('.png', '');
        const im = M.readPNG(join(dir, f));
        const bb = M.bbox(im);
        const frac = (bb.y1 - headTop(im) + 1) / im.h;
        return (T[k] ?? 46) * frac / (1 - (HEAD_TOP[key] ?? 0));
      });
    const spread = Math.max(...hs) - Math.min(...hs);
    ok(spread <= 2.5,
      `${k}: разброс по кадрам ${spread.toFixed(1)} px — при ходьбе не прыгает`);
  }
}

console.log('\n=== 4. Правка переживёт регенерацию sprite-art.ts ===');
{
  const gen = readFileSync(join(root, 'scripts/build-sprites.cjs'), 'utf8');
  const inGen = /spearman:\s*(\d+)/.exec(gen);
  const inSrc = /spearman:\s*(\d+)/.exec(spr);
  ok(inGen && inSrc && inGen[1] === inSrc[1],
    `UNIT_TARGET_H.spearman синхронен в генераторе и sprite-art (${inSrc && inSrc[1]})`);
  ok(!/HEAD_TOP/.test(gen),
    'поправка живёт в pixelart.ts (генератор её не перезатрёт)');
}

console.log(`\nИтог: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
