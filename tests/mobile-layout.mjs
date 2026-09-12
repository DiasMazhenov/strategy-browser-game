// Мобильная вёрстка: сторожевой тест.
//
// Честное предупреждение: это проверка по исходнику, а не по поведению — jsdom не
// считает layout, а браузера в песочнице нет. Но инварианты здесь такие, что
// сломать их легко, а заметить глазами на телефоне — долго: именно так семь
// модалок жили без max-height и уезжали за край экрана. Правило то же, что и для
// остальных source-тестов: если проверка упала — сначала понять, изменилось ли
// поведение, и только потом править ожидание.
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const lines = app.split('\n');

let n = 0, f = 0;
const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. У каждой модалки есть предел высоты и прокрутка ===');
{
  const overlays = [];
  lines.forEach((l, i) => {
    // именно оверлей: на весь экран + затемнение 70% и глубже (bg-black/40 внутри
    // карточек ловиться не должен — это не модалка)
    if (/(absolute|fixed) inset-0/.test(l) && /items-center justify-center bg-black\/(7|8|9)/.test(l)) overlays.push(i);
  });
  ok(overlays.length >= 8, `найдено оверлеев модалок: ${overlays.length}`);
  const bad = [];
  for (const i of overlays) {
    const win = lines.slice(i + 1, i + 5).join('\n');
    // предел высоты обязателен; прокрутка может быть и во внутреннем блоке
    // (панель-колонка со скроллящимся содержимым), поэтому её не требуем
    if (!/max-h-\[/.test(win)) bad.push(i + 1);
  }
  ok(bad.length === 0, bad.length ? `без предела высоты (строки ${bad.join(', ')})` : 'у всех модалок есть max-h (не уедут за край)');
}

console.log('\n=== 2. Цели для пальца: минимум 40 px на касании ===');
{
  // min-h на мобильных задаётся без sm:-префикса (sm:min-h-0 снимает его на десктопе)
  const checks = [
    ['IconBtn', /min-h-\[44px\]/, 44],
    ['MiniBtn', /min-h-\[4[02]px\]/, 40],
    ['DockTab', /min-h-\[40px\]/, 40],
  ];
  for (const [name, re, want] of checks) {
    const i = app.indexOf(`function ${name}(`);
    const body = app.slice(i, i + 1200);
    const m = body.match(/min-h-\[(\d+)px\]/);
    ok(!!m && Number(m[1]) >= want, `${name}: минимальная высота ${m ? m[1] : 'нет'} px (нужно ≥ ${want})`);
  }
  // TrainBtn: ширина 76 px на касании, 72 на десктопе
  const ti = app.indexOf('function TrainBtn(');
  const tb = app.slice(ti, ti + 900);
  ok(/w-\[76px\][^"]*sm:w-\[72px\]/.test(tb), 'TrainBtn: 76 px на касании, 72 px на десктопе');
  ok(/text-\[11px\][^"]*sm:text-\[10px\]/.test(tb), 'TrainBtn: подпись 11 px на касании, 10 на десктопе');
}

console.log('\n=== 3. Касание панорамирует камеру по умолчанию ===');
{
  const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
  ok(/panMode = true;/.test(eng), 'panMode включён по умолчанию (палец двигает камеру)');
  ok(/this\.panMode && e\.pointerType !== 'mouse'/.test(eng), 'панорама касанием отличается от мыши');
  ok(/!\(this\.panMode && e\.pointerType !== 'mouse'\)/.test(eng), 'рамка выделения мышью не сломана новым режимом');
}

console.log('\n=== 4. Подсказки: на телефоне про палец, на десктопе про клавиатуру ===');
{
  ok(/isMobile &&[\s\S]{0,40}\([\s\S]{0,300}палец — камера/.test(app), 'есть подсказка для касаний');
  ok(/!isMobile && \([\s\S]{0,600}WASD камера/.test(app), 'клавиатурная подсказка скрыта на телефоне');
  ok(/const isMobile = [\s\S]{0,120}pointer: coarse/.test(app), 'определение мобильности — по типу указателя');
}


console.log('\n=== 5. На телефоне интерфейс не висит поверх поля (1.0.137) ===');
{
  // левая колонка (задания + отряд + экономика) съедала 172px из 414
  const col = app.slice(app.indexOf('{/* ===== QUESTS + ОТРЯД'), app.indexOf('{/* ===== SELECTION CARD'));
  ok(/hidden w-\[172px\][\s\S]{0,120}sm:flex/.test(col), 'левая колонка скрыта на узком экране');
  ok(/SquadControls[\s\S]{0,80}EconSummary/.test(col), 'её содержимое вынесено в общие компоненты');
  // те же панели открываются вкладками дока
  const dock = app.slice(app.indexOf('{/* ===== BOTTOM DOCK'), app.indexOf('{/* ===== КОШ'));
  ok(/label="ОТРЯД"[\s\S]{0,200}label="СВОДКА"/.test(dock), 'в доке есть вкладки «Отряд» и «Сводка»');
  ok(/className="sm:hidden"/.test(dock), 'эти вкладки видны только на телефоне');
  ok(/dockOpen && dockTab === 'squad'/.test(dock) && /dockOpen && dockTab === 'info'/.test(dock), 'панели открываются по вкладке');
  ok(/max-h-\[45dvh\]/.test(dock), 'раскрытый лист не выше 45% экрана');
  // чистое поле: один тап прячет весь HUD
  ok(/\{!uiHidden && \(\n      <div className="safe-top/.test(app), 'верхний HUD прячется');
  ok(/\{!uiHidden && \(\n      <div className="pointer-events-none absolute inset-x-0 bottom-0/.test(app), 'док прячется');
  ok(/setUiHidden\(h => !h\)/.test(app), 'есть переключатель «чистого экрана»');
  ok(/EyeOff className="h-5 w-5"/.test(app), 'переключатель меняет иконку');
  ok(/onPointerDown=\{\(\) => \{ if \(isMobile\) setDockOpen\(false\); \}\}/.test(app), 'тап по полю закрывает раскрытый док');
}


console.log('\n=== 6. Верхний HUD не съедает треть экрана (1.0.138) ===');
{
  const top = app.slice(app.indexOf('{/* ===== TOP HUD'), app.indexOf('{/* ===== QUESTS + ОТРЯД'));
  // три полосы друг под другом, каждая — одна строка с прокруткой
  ok(/flex flex-col items-stretch gap-1 p-2 sm:flex-row/.test(top), 'на телефоне полосы HUD идут столбиком');
  const strips = top.match(/overflow-x-auto/g) || [];
  ok(strips.length >= 3, `полос с горизонтальной прокруткой: ${strips.length} (ресурсы, события, кнопки)`);
  ok(/\[&>\*\]:shrink-0/.test(top), 'пилюли внутри не сжимаются (иначе цифры обрезаются)');
  ok(!/flex flex-wrap items-center justify-center gap-1 sm:flex-col/.test(top), 'старого переноса в 3-4 ряда больше нет');
  // полоса счёта дублировала события — на телефоне её быть не должно
  ok(/hidden justify-center sm:flex md:hidden/.test(top), 'дублирующая полоса счёта убрана с телефона');
  // карточки, привязанные к высоте дока
  ok(/bottom-\[104px\][^"]*sm:bottom-\[156px\]/.test(app), 'карточка выделения поднялась вслед за низким доком');
  ok(/bottom-\[76px\][^"]*sm:bottom-\[128px\]/.test(app), 'баннеры режима тоже');
}

console.log(`\nИтог: ${n - f} ok, ${f} fail`);
process.exit(f ? 1 : 0);
