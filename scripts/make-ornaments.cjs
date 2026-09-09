// Генератор казахских орнаментов (ою-өрнек).
//
// ГЛАВНОЕ, что было неверно в прошлых попытках: рог рисовался полосой
// ПЕРЕМЕННОЙ толщины по спирали Архимеда, и получались два оборванных
// полумесяца. На подлинных образцах қошқар мүйіз — это НЕПРЕРЫВНАЯ ЛЕНТА
// почти постоянной ширины: она выходит из общего основания, ведёт вверх-в
// сторону и туго закручивается в «глазок». Два рога СВЯЗАНЫ основанием,
// между ними — острый листик. Отсюда построение: осевая линия + обводка
// ленты вокруг неё (offset), а не заливка сектора.
const fs = require('fs');
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Осевая линия одного рога: стебель от основания + тугая спираль в «глазок».
 * @param bx,by  общее основание пары рогов
 * @param cx,cy  центр закрутки
 * @param R      радиус входа в спираль
 * @param turns  сколько оборотов до глазка
 * @param dir    +1 / -1 — сторона закрутки
 */
function hornAxis(bx, by, cx, cy, R, turns, dir) {
  const a0 = Math.atan2(by - cy, bx - cx);      // спираль «смотрит» на основание
  const sx = cx + Math.cos(a0) * R, sy = cy + Math.sin(a0) * R;
  const pts = [];
  for (let i = 0; i <= 5; i++) {                // стебель
    const t = i / 5;
    pts.push([bx + (sx - bx) * t, by + (sy - by) * t]);
  }
  for (let i = 1; i <= 44; i++) {               // спираль внутрь
    const t = i / 44;
    const ang = a0 + dir * turns * Math.PI * 2 * t;
    const r = R * (1 - 0.80 * t);               // радиус тает к глазку
    pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
  }
  return pts;
}

/** Лента вокруг осевой линии: постоянная ширина, лёгкое сужение к кончику. */
function ribbon(pts, w) {
  const L = [], Rt = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    // сужаем только самый кончик (последняя четверть) — лента остаётся лентой
    const k = i / (pts.length - 1);
    const hw = (w * (k > 0.78 ? 1 - (k - 0.78) / 0.22 * 0.5 : 1)) / 2;
    L.push([p[0] + nx * hw, p[1] + ny * hw]);
    Rt.push([p[0] - nx * hw, p[1] - ny * hw]);
  }
  const all = L.concat(Rt.reverse());
  return 'M' + all.map(([x, y]) => `${r2(x)} ${r2(y)}`).join('L') + 'Z';
}

/** Острый листик (жапырақ) — вертикальная капля между рогами. */
function leaf(cx, cy, w, h) {
  return `M${r2(cx)} ${r2(cy - h)}`
    + `C${r2(cx + w)} ${r2(cy - h * 0.35)} ${r2(cx + w * 0.8)} ${r2(cy + h * 0.4)} ${r2(cx)} ${r2(cy + h)}`
    + `C${r2(cx - w * 0.8)} ${r2(cy + h * 0.4)} ${r2(cx - w)} ${r2(cy - h * 0.35)} ${r2(cx)} ${r2(cy - h)}Z`;
}

/** Пара встречных рогов из общего основания — канонический қошқар мүйіз. */
function ramHorns(bx, by, spread, lift, R, turns, w) {
  return [
    ribbon(hornAxis(bx, by, bx - spread, by - lift, R, turns, +1), w),
    ribbon(hornAxis(bx, by, bx + spread, by - lift, R, turns, -1), w),
  ];
}

const svg = (w, h, paths) =>
  `%3Csvg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'%3E` +
  `%3Cg fill='%23f6d47c'%3E` + paths.map(d => `%3Cpath d='${d}'/%3E`).join('') + `%3C/g%3E%3C/svg%3E`;

// ── 1. Бордюр СЫНЫҚМҮЙІЗ: меандр зеркальными парами (этот мотив вышел верно) ──
const meander = (() => {
  const p = [];
  const bar = (x, y, w, h) => p.push(`M${x} ${y}h${w}v${h}h${-w}z`);
  bar(1, 1, 1.4, 8); bar(1, 7.6, 6, 1.4); bar(5.6, 3.4, 1.4, 4.2); bar(3, 3.4, 2.6, 1.4);
  bar(17.6, 1, 1.4, 8); bar(13, 7.6, 6, 1.4); bar(13, 3.4, 1.4, 4.2); bar(14.4, 3.4, 2.6, 1.4);
  return svg(20, 10, p);
})();

// ── 2. Угол ҚОШҚАР МҮЙІЗ: связанная пара рогов + листик ──
const corner = svg(34, 34, [
  ...ramHorns(17, 27, 6.6, 8.5, 6.4, 1.15, 2.5),
  leaf(17, 12, 2.4, 6.5),
]);

// ── 3. Разделитель: рога поменьше, лежащие горизонтально ──
const divider = svg(28, 12, [
  'M0 5.1h5.5v1.8H0z',
  'M22.5 5.1H28v1.8h-5.5z',
  ...ramHorns(14, 10.5, 4.2, 4.2, 3.6, 1.05, 1.7),
]);

fs.writeFileSync('scripts/_ornaments.json', JSON.stringify({ meander, corner, divider }, null, 1));
console.log('меандр  :', meander.length);
console.log('угол    :', corner.length);
console.log('разделит:', divider.length);
