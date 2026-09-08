// Проверки к версии 1.0.074: пастух не залипает, казан и алтыбакан стоят
// у ставки постоянно, плашка волны скрыта в мирное время.
// Запуск: node tests/camp-test.mjs
import { readFileSync } from 'node:fs';

const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const art = readFileSync(new URL('../src/game/pixelart.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name); } };

/** тело метода по сигнатуре: считаем фигурные скобки, регулярки на вложенности врут */
function body(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return '';
  // ищем '{' ПОСЛЕ конца сигнатуры: у методов с литеральным типом возврата
  // (campProps(): { x: number ... }[]) первая скобка принадлежит типу, не телу
  let d = 0, start = src.indexOf('{', i + sig.length);
  for (let j = start; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) return src.slice(start, j + 1); }
  }
  return '';
}

console.log('\n=== 1. Пастух: движение с обходом препятствий ===');
{
  const shep = body(eng, '\n  updateShepherd(u: Unit, dt: number)');
  ok(shep.length > 400, 'updateShepherd найден');
  ok(!/\bmoveToward\(/.test(shep.replace(/moveTowardPath\(/g, '')),
    'внутри пастуха нет прямого moveToward (он не умеет обходить преграды)');
  ok((shep.match(/this\.herdMove\(/g) || []).length >= 5,
    'все перемещения пастуха идут через herdMove (>=5 вызовов)');

  const hm = body(eng, '\n  herdMove(');
  ok(hm.length > 200, 'herdMove реализован');
  ok(/moveTowardPath/.test(hm), 'herdMove ходит через поиск пути');
  ok(/herdStuckT/.test(hm), 'herdMove ведёт счётчик застревания');
  ok(/path\s*=\s*(undefined|null|\[\])|pathGoal/.test(hm),
    'при застревании маршрут сбрасывается и строится заново');
  ok(/herdStuckT\?:\s*number/.test(eng), 'поле herdStuckT объявлено в интерфейсе Unit');
}

console.log('\n=== 2. Пастух не замирает при пустом стаде ===');
{
  const shep = body(eng, '\n  updateShepherd(u: Unit, dt: number)');
  // раньше при ctr === null (волки задрали скот) веток else не было и пастух стоял
  const grazeIdx = shep.indexOf("'graze'");
  ok(grazeIdx > 0, 'фаза graze присутствует');
  ok(/stockPasture\(/.test(shep), 'пастух может завести новое стадо на пастбище');
  const elses = (shep.match(/}\s*else\s*{/g) || []).length;
  ok(elses >= 4, `есть ветки else для пустого стада (найдено ${elses})`);
}

console.log('\n=== 3. Казан и алтыбакан — постоянные объекты у ставки ===');
{
  // ВНИМАНИЕ: у campProps() тип возврата — литерал с фигурными скобками,
  // поэтому сигнатуру передаём целиком, иначе body() примет тип за тело метода.
  const cp = body(eng, "campProps(): { x: number; y: number; kind: 'kazan' | 'swing' }[]");
  ok(cp.length > 100, 'метод campProps() есть');
  ok(/towncenter/.test(cp), 'позиция считается от ханской ставки');
  ok(/kind:\s*'kazan'/.test(cp), 'казан в списке декораций');
  ok(/kind:\s*'swing'/.test(cp), 'алтыбакан в списке декораций');

  // дистанции: 2-3 клетки для казана, 7-8 для алтыбакана (шаг гекса ~32)
  // КЛЕТКА = ГЕКС: шаг √3·HS ≈ 34.64, а не 32
  const mk = cp.match(/const rk = ([\d.]+) \* HEX_CELL/);
  const ms = cp.match(/const rs = ([\d.]+) \* HEX_CELL/);
  ok(mk && +mk[1] >= 4 && +mk[1] <= 5, `казан в 4-5 клетках от ставки (${mk ? mk[1] : '?'})`);
  ok(ms && +ms[1] >= 7 && +ms[1] <= 8, `алтыбакан в 7-8 клетках от ставки (${ms ? ms[1] : '?'})`);
  ok(/export const HEX_CELL/.test(readFileSync(new URL('../src/game/iso.ts', import.meta.url), 'utf8')),
    'HEX_CELL (шаг гекса) объявлен в iso.ts — единая единица «клетки»');

  ok(/drawCampProp\(ctx, pr\.kind/.test(eng), 'декорации рисуются в общем drawList');
  ok(/drawList\.push\(\{ iy: piy/.test(eng), 'декорации участвуют в сортировке по глубине');
  ok(/campProps\(\)/.test(body(eng, '\n  sendToRest(u: Unit)')),
    'отдыхающие идут к настоящему казану/качелям, а не к выдуманной точке');
}

console.log('\n=== 4. Спрайты декораций собраны из готовых кадров ===');
{
  ok(/kz_prop_kazan/.test(art), 'спрайт казана импортирован в pixelart');
  ok(/kz_prop_swing/.test(art), 'спрайт алтыбакана импортирован в pixelart');
  const d = body(art, 'export function drawCampProp');
  ok(d.length > 100, 'drawCampProp реализован');
  ok(/UNIT_TARGET_H\.villager/.test(d), 'размер считается от роста шаруа, а не «на глаз»');
  ok(/1\.67/.test(d), 'качели ×1.67 — тот же размер, что у сценки катания');
  ok(/imageSmoothingEnabled = false/.test(d), 'пиксель-арт рисуется без сглаживания');
}

console.log('\n=== 4b. Алтыбакан: пара стоит поперёк доски ===');
{
  ok(/kz_swing_ride_c/.test(art), 'центральный кадр катания импортирован');
  ok(/kz_swing_ride_l/.test(art) && /kz_swing_ride_r/.test(art), 'боковые фазы качания импортированы');
  const cyc = art.slice(art.indexOf('const KZ_SWING'), art.indexOf('const KZ_KAZAN'));
  ok(/kzSwingRideL/.test(cyc) && /kzSwingRideC/.test(cyc) && /kzSwingRideR/.test(cyc),
    'цикл качелей собран из новых кадров (влево-центр-вправо-центр)');
  ok(!/kzSwingL\b/.test(art), 'старые кадры одиночной девушки больше не используются');
  ok(/1\.67/.test(art), 'масштаб сценки ×1.67 — человек ростом со шаруа');
}

console.log('\n=== 5. Плашка волны скрыта в мирное время ===');
{
  ok(/hud\?\.atWar && \(\s*<span/.test(app.replace(/\n\s*/g, ' ').replace(/\{\/\*.*?\*\/\}/g, '')) ||
     /\{hud\?\.atWar && \(/.test(app),
    'счётчик волны обёрнут условием atWar');
  const waveLines = app.split('\n').filter(l => /nextWave/.test(l) && /span/.test(l));
  ok(waveLines.length === 2, `оба вывода волны найдены (десктоп + мобильный): ${waveLines.length}`);
  // ни один из них не должен рендериться безусловно
  const guarded = (app.match(/\{hud\?\.atWar && \(/g) || []).length;
  ok(guarded >= 2, `оба скрыты в мире (найдено условий: ${guarded})`);
  ok(/atWar: boolean/.test(eng), 'HudSnapshot отдаёт признак войны в UI');
}

console.log(`\nИтог: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
