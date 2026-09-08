// Проверка 1.0.078: стрелки прокрутки вместо автоскролла, курсоры действий,
// плашка ресурса и очередь построек Shift+клик.
// Статический разбор исходников + проверка собранных ассетов курсоров.
// Запуск: node tests/ui-test.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const eng = readFileSync(join(root, 'src/game/engine.ts'), 'utf8');
const curs = readFileSync(join(root, 'src/game/cursors.ts'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

// тело метода по сигнатуре: ищем '{' после конца сигнатуры и считаем скобки
function body(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return '';
  let j = src.indexOf('{', i + sig.length);
  if (j < 0) return '';
  let d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(j, k + 1); }
  }
  return '';
}

console.log('\n=== 1. Автопрокрутка по краю убрана ===');
{
  const upd = eng.slice(eng.indexOf('// camera keyboard + edge'), eng.indexOf('this.followTick();'));
  ok(!/this\.mouse\.x < m/.test(upd) && !/this\.vw - m/.test(upd),
    'старый автоскролл по наведению удалён');
  ok(!/edge = true/.test(upd), 'флаг edge-скролла больше не выставляется');
  ok(/updateEdgeArrows\(\)/.test(upd), 'вместо него обновляются стрелки');
  ok(/EDGE_ZONE|EDGE_STEP|EDGE_GLIDE_T/.test(eng), 'константы зоны/шага/доката заданы');
}

console.log('\n=== 2. Прокрутка только по клику ===');
{
  const at = body(eng, 'edgeArrowAt(sx: number, sy: number)');
  ok(/EDGE_ZONE/.test(at) && /'u'|'d'|'l'|'r'/.test(at), 'edgeArrowAt определяет сторону по краю');
  ok(/isTouch/.test(at), 'на тач-экране стрелок нет (там жест панорамы)');
  const nudge = body(eng, 'nudgeCam(dir:');
  ok(/edgeGlide\s*=\s*\{/.test(nudge), 'клик запускает плавный докат камеры');
  ok(/camFollow = false/.test(nudge), 'ручная прокрутка отключает авто-следование');
  const down = body(eng, 'pDown = (e: PointerEvent)');
  ok(/edgeArrowAt/.test(down) && down.indexOf('edgeArrowAt') < down.indexOf('this.box = {'),
    'клик по стрелке перехватывается ДО выделения рамкой');
  ok(/!this\.placement/.test(down), 'в режиме постройки стрелка не крадёт клик');
  ok(/drawEdgeArrows/.test(eng), 'стрелки рисуются');
}

console.log('\n=== 3. Курсоры действий ===');
{
  for (const n of ['attack', 'wood', 'gold', 'food', 'fish', 'build', 'move']) {
    const p = join(root, 'src/assets/cursors', n + '.png');
    const okFile = existsSync(p);
    let size = '';
    if (okFile) {
      const b = readFileSync(p);
      size = `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
    }
    // 16 px: вчетверо меньше по площади, чем было. Системная «рука» (pointer)
    // на своих юнитах — не PNG, её размером управляет ОС.
    ok(okFile && size === '16x16', `курсор ${n}.png собран (${size || 'нет файла'})`);
  }
  ok(/hx: \d+, hy: \d+/.test(curs), 'у курсоров заданы горячие точки');
  // Горячие точки в коде обязаны совпадать с тем, что посчитал сборщик:
  // иначе курсор кликает не туда, куда показывает остриё.
  {
    const hs = JSON.parse(readFileSync(join(root, 'src/assets/cursors/hotspots.json'), 'utf8'));
    let bad = [];
    for (const h of hs) {
      const m = new RegExp(`${h.name}: \\{ url: cur\\w+, hx: (\\d+), hy: (\\d+)`).exec(curs);
      if (!m || +m[1] !== h.hx || +m[2] !== h.hy) bad.push(h.name);
    }
    ok(bad.length === 0, `горячие точки в коде совпадают со сборщиком${bad.length ? ': разошлись ' + bad.join(',') : ''}`);
    // все точки обязаны лежать внутри кадра 16×16
    const out = hs.filter(h => h.hx < 0 || h.hy < 0 || h.hx > 15 || h.hy > 15);
    ok(out.length === 0, 'горячие точки внутри кадра 16×16');
  }
  ok(/crosshair/.test(curs), 'есть системный запасной курсор');
  const cf = body(eng, 'cursorFor(sx: number, sy: number)');
  ok(/'attack'/.test(cf), 'по врагу — сабля');
  ok(/nd\.kind === 'wood'/.test(cf) && /'gold'/.test(cf) && /'fish'/.test(cf),
    'у каждого вида ресурса свой курсор');
  ok(/this\.placement.*'build'|'build'/.test(cf), 'в режиме стройки — молоток');
  ok(/hasVill/.test(cf), 'курсор добычи только при выделенном шаруа');
  const sc = body(eng, 'syncCursor()');
  ok(/if \(kind === this\.curCursor\) return/.test(sc),
    'стиль курсора меняется только при смене вида (без мигания)');
}

console.log('\n=== 4. Плашка ресурса и скрытая полоска ===');
{
  const dn = body(eng, 'drawNodeIso(n: Node, ix: number, iy: number)');
  ok(/n\.id === this\.selNode/.test(dn),
    'полоска запаса рисуется ТОЛЬКО у выбранного ресурса');
  const plate = body(eng, 'drawNodePlate(ctx: CanvasRenderingContext2D)');
  ok(/Лес|Золотая жила|Ягодник|Рыбное место/.test(plate), 'плашка знает названия ресурсов');
  ok(/n\.amount/.test(plate) && /n\.max/.test(plate), 'показывает текущий остаток и максимум');
  ok(/camIsoX\(\)/.test(plate) && /camIsoY\(\)/.test(plate),
    'координаты считаются по матрице камеры');
  ok(/this\.dpr/.test(plate), 'учитывает dpr — не размывается на retina');
  const tap = body(eng, 'handleTap(x: number, y: number, additive: boolean)');
  ok(/this\.selNode = n\.id/.test(tap), 'клик по ресурсу выбирает его');
  ok(/clearSel\(\)\s*\{[^}]*selNode = -1/.test(eng), 'сброс выделения снимает и выбор ресурса');
  ok(/drawNodePlate\(ctx\)/.test(eng), 'плашка подключена к отрисовке');
}

console.log('\n=== 5. Очередь построек (Shift+клик) ===');
{
  ok(/buildQueue\?: number\[\]/.test(eng), 'у шаруа есть поле очереди');
  const nq = body(eng, 'nextQueuedBuild(u: Unit)');
  ok(/q\.shift\(\)/.test(nq), 'очередь разбирается по порядку (FIFO)');
  ok(/b\.done >= 1/.test(nq) && /!b/.test(nq),
    'снесённые и достроенные фундаменты пропускаются');
  const tp = body(eng, 'tryPlace(x: number, y: number)');
  ok(/keys\.has\('shift'\)/.test(tp), 'Shift переключает режим очереди');
  ok(/buildQueue \?\?= \[\]/.test(tp) || /buildQueue\s*\?\?=/.test(tp),
    'фундамент уходит в очередь того же шаруа');
  ok(/в очередь/.test(tp), 'игрок видит подсказку с номером в очереди');
  // именно ветка updateVillager, а не ранние вхождения u.state === 'build'
  const bs = body(eng, "if (u.state === 'build') {\n      const b = this.blds.find(b => b.id === u.buildId);");
  ok(/nextQueuedBuild/.test(bs), 'закончив дом, шаруа берёт следующий из очереди');
}

console.log(`\nИтог: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
