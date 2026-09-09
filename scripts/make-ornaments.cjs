// Генератор казахских орнаментов: строим пути МАТЕМАТИЧЕСКИ, а не рисуем
// от руки. Ручные кривые Безье превращались в бесформенные кляксы —
// растеризация это показала. Спираль-завиток («қошқар мүйіз») задаётся
// формулой Архимеда с переменной толщиной, поэтому выходит чистой.
const fs = require('fs');

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Спиральный завиток «бараний рог»: полоса переменной толщины, закрученная
 * от основания к центру. Возвращает замкнутый контур (заливная форма).
 *
 * @param cx,cy  центр закрутки
 * @param r0     начальный радиус (у основания)
 * @param turns  сколько оборотов
 * @param w0,w1  толщина у основания и у кончика
 * @param a0     начальный угол, рад
 * @param dir    +1 по часовой, -1 против
 */
function horn(cx, cy, r0, turns, w0, w1, a0, dir) {
  const steps = 40, total = turns * Math.PI * 2;
  const outer = [], inner = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = a0 + dir * total * t;
    const r = r0 * (1 - 0.72 * t);          // радиус убывает к центру
    const w = w0 + (w1 - w0) * t;           // и полоса сужается
    outer.push([cx + Math.cos(ang) * (r + w / 2), cy + Math.sin(ang) * (r + w / 2)]);
    inner.push([cx + Math.cos(ang) * (r - w / 2), cy + Math.sin(ang) * (r - w / 2)]);
  }
  const pts = outer.concat(inner.reverse());
  return 'M' + pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join('L') + 'Z';
}

/** Пара встречных рогов — канонический «қошқар мүйіз». */
function ramHorns(cx, cy, r0, w0, w1) {
  return [
    horn(cx - r0 * 0.55, cy, r0, 0.8, w0, w1, -Math.PI / 2, -1),
    horn(cx + r0 * 0.55, cy, r0, 0.8, w0, w1, -Math.PI / 2, +1),
  ];
}

/** Ромб-розетка «төрт құлақ» (четыре уха) — простая заливная форма. */
function diamond(cx, cy, rx, ry) {
  return `M${r2(cx)} ${r2(cy - ry)}L${r2(cx + rx)} ${r2(cy)}L${r2(cx)} ${r2(cy + ry)}L${r2(cx - rx)} ${r2(cy)}Z`;
}

const svg = (w, h, paths, op = 1) =>
  `%3Csvg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'%3E` +
  `%3Cg fill='%23f6d47c'${op !== 1 ? ` opacity='${op}'` : ''}%3E` +
  paths.map(d => `%3Cpath d='${d}'/%3E`).join('') +
  `%3C/g%3E%3C/svg%3E`;

// ── 1. Бордюр СЫНЫҚМҮЙІЗ (ломаный рог): меандр зеркальными парами ──
// Этот мотив уже вышел удачно — оставляем прямоугольную геометрию.
const meander = (() => {
  const p = [];
  const bar = (x, y, w, h) => p.push(`M${x} ${y}h${w}v${h}h${-w}z`);
  // левый рог: спираль-меандр внутрь
  bar(1, 1, 1.4, 8); bar(1, 7.6, 6, 1.4); bar(5.6, 3.4, 1.4, 4.2); bar(3, 3.4, 2.6, 1.4);
  // зеркальный правый
  bar(17.6, 1, 1.4, 8); bar(13, 7.6, 6, 1.4); bar(13, 3.4, 1.4, 4.2); bar(14.4, 3.4, 2.6, 1.4);
  return svg(20, 10, p);
})();

// ── 2. Угол ҚОШҚАР МҮЙІЗ: пара встречных спиралей ──
const corner = svg(32, 32, [
  ...ramHorns(16, 13, 7.5, 3.2, 1.1),
  diamond(16, 24, 3.4, 4.2),
]);

// ── 3. Разделитель: ромб между нитями ──
const divider = svg(24, 8, [
  'M0 3.3h7.5v1.4H0z',
  'M16.5 3.3H24v1.4h-7.5z',
  diamond(12, 4, 3.2, 3.2),
]);

fs.writeFileSync('scripts/_ornaments.json', JSON.stringify({ meander, corner, divider }, null, 1));
console.log('меандр  :', meander.length, 'симв.');
console.log('угол    :', corner.length, 'симв.');
console.log('разделит:', divider.length, 'симв.');
