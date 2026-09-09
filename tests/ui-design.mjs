// Редизайн интерфейса: казахский орнамент как система, а не разовая правка.
// Ловит регресс вида «кто-то переписал panel-iron и узоры пропали».
// Запуск: node tests/ui-design.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/index.css'), 'utf8');
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

console.log('\n=== 1. Орнаментальное ядро на месте ===');
{
  ok(/\.kz-border-top::before/.test(css) && /\.kz-border-bottom::after/.test(css),
    'бордюр кошкар-мүйіз определён');
  ok(/\.kz-corners::before/.test(css) && /\.kz-corners::after/.test(css),
    'уголковые завитки определены');
  ok(/\.kz-divider/.test(css), 'орнаментальный разделитель определён');
  ok(/--kz-gold:/.test(css) && /--kz-felt:/.test(css),
    'палитра вынесена в переменные (золото, войлок)');
}

console.log('\n=== 2. Узоры — инлайновый SVG, без внешних файлов ===');
{
  // Растровые картинки грузились бы отдельными запросами и мигали при старте.
  // Два узора живут в CSS (бордюр, уголки), третий — фон меню в App.tsx.
  const inCss = (css.match(/data:image\/svg\+xml/g) || []).length;
  const inApp = (app.match(/data:image\/svg\+xml/g) || []).length;
  ok(inCss + inApp >= 3,
    `узоры зашиты как data-URI (${inCss} в CSS + ${inApp} в разметке) — без лишних запросов`);
  ok(!/url\(['"]?\.\.?\//.test(css.replace(/data:image[^)]*/g, '')),
    'нет ссылок на внешние файлы картинок в оформлении');
}

console.log('\n=== 2b. Орнаменты — подлинные мотивы, а не абстракция ===');
{
  // Первая версия была «завитками на глаз» и казахской не была. Проверяем,
  // что мотивы названы и что спирали построены генератором, а не от руки:
  // ручные кривые Безье давали бесформенные кляксы (видно растеризацией).
  ok(/СЫНЫҚМҮЙІЗ|сынықмүйіз/i.test(css), 'мотив сынықмүйіз (ломаный рог) назван');
  ok(/ҚОШҚАР МҮЙІЗ|қошқар мүйіз/i.test(css), 'мотив қошқар мүйіз (бараньи рога) назван');
  const gen = readFileSync(join(root, 'scripts/make-ornaments.cjs'), 'utf8');
  ok(/function horn/.test(gen), 'спираль-завиток строится формулой (scripts/make-ornaments.cjs)');
  ok(/function ramHorns/.test(gen), 'парные встречные рога — канонический мотив');
  ok(/Math\.cos\(ang\)/.test(gen) && /Math\.sin\(ang\)/.test(gen),
    'геометрия спирали математическая, а не нарисованная от руки');
  // у настоящего мотива путь длинный (много точек спирали), у «клякс» — короткий
  const cornerUri = /\.kz-corners::before,[\s\S]{0,900}?url\("data:image\/svg\+xml,([^"]+)"\)/.exec(css);
  ok(cornerUri && cornerUri[1].length > 900,
    `угловой мотив детализирован (${cornerUri ? cornerUri[1].length : 0} симв. пути)`);

  // ГЛАВНЫЙ признак подлинности: рог — НЕПРЕРЫВНАЯ ЛЕНТА из общего основания,
  // а не два оборванных полумесяца. Лента строится обводкой осевой линии
  // (ribbon вокруг hornAxis); заливка сектора давала обрубки.
  ok(/function ribbon/.test(gen) && /function hornAxis/.test(gen),
    'рог = лента вокруг осевой линии (а не заливка сектора)');
  ok(/hornAxis\(bx, by/.test(gen),
    'оба рога выходят из ОБЩЕГО основания — фигура связанная');
  ok(/function leaf/.test(gen), 'между рогами листик жапырақ, как на образцах');
  // у ленты постоянной ширины путь длинный: осевая ~50 точек × 2 стороны
  const decoded = cornerUri ? decodeURIComponent(cornerUri[1]) : '';
  const pts = (decoded.match(/L/g) || []).length;
  ok(pts > 150, `контур ленты плотный (${pts} узлов) — спираль гладкая, без углов`);
}

console.log('\n=== 3. Панели и кнопки получили фактуру ===');
{
  const panel = css.slice(css.indexOf('.panel-iron {'), css.indexOf('.panel-iron::before'));
  ok(/repeating-linear-gradient/.test(panel), 'панель: тканая текстура войлока');
  ok(/inset 0 0 22px/.test(panel), 'панель: внутреннее золотое свечение');
  ok(/\.panel-iron::before/.test(css), 'панель: золотая нить по верхней кромке');

  const gold = css.slice(css.indexOf('.btn-gold {'), css.indexOf('.btn-gold:hover'));
  ok(/repeating-linear-gradient/.test(gold), 'золотая кнопка: тиснение');
  ok(/gold-sheen/.test(css), 'золотая кнопка: пробегающий блик');

  const iron = css.slice(css.indexOf('.btn-iron {'), css.indexOf('.btn-iron:hover'));
  ok(/repeating-linear-gradient/.test(iron), 'железная кнопка: фактура кожи');
  ok(/\.btn-iron:hover/.test(css), 'железная кнопка: отклик на наведение');
}

console.log('\n=== 4. Орнамент применён к экранам ===');
{
  const corners = (app.match(/kz-corners/g) || []).length;
  ok(corners >= 6, `уголки на крупных модалках (${corners} шт.)`);
  ok(/kz-border-bottom[^"]*panel-iron/.test(app) || /kz-border-bottom/.test(app),
    'орнаментальная лента в HUD');
  ok(/kz-divider/.test(app), 'разделитель в меню');
  ok(/kz-border-bottom relative overflow-hidden rounded-3xl/.test(app),
    'лента под баннером меню');
}

console.log('\n=== 5. Фон меню — орнамент, а не офисная клетка ===');
{
  const grid = /linear-gradient\(rgba\(253,230,138,\.4\) 1px, transparent 1px\), linear-gradient\(90deg/.test(app);
  ok(!grid, 'прямоугольная сетка убрана');
  ok(/backgroundImage: "url\(\\"data:image\/svg\+xml/.test(app), 'фон меню — SVG-орнамент');
}

console.log('\n=== 6. Мобильные и производительность не пострадали ===');
{
  // Псевдоэлементы орнамента не должны перехватывать касания по канвасу.
  const borderBlock = css.slice(css.indexOf('.kz-border-top::before'), css.indexOf('.kz-border-top::before { top'));
  ok(/pointer-events: none/.test(borderBlock), 'бордюры прозрачны для касаний');
  const cornerBlock = css.slice(css.indexOf('.kz-corners::before,'), css.indexOf('.kz-corners::before { top'));
  ok(/pointer-events: none/.test(cornerBlock), 'уголки прозрачны для касаний');
  ok(/touch-action: manipulation/.test(css), 'кнопки по-прежнему без зума двойным тапом');
  ok(/orientation: landscape/.test(css), 'правила альбомной ориентации сохранены');
  ok(/env\(safe-area-inset/.test(css), 'safe-area сохранена');
}

console.log(`\nИтог: ${pass} ok, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
