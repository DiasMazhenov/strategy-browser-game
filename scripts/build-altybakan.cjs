// ── СБОРКА СПРАЙТОВ АЛТЫБАКАНА (изометрия 2:1) ──────────────────────────────
// Кадры нарисованы в той же проекции, что и здания в src/assets/sprites/kz:
// перекладина уходит вглубь по изо-оси, доска лежит ВДОЛЬ ОСИ РАСКАЧКИ
// (от нижнего-левого края к верхнему-правому), пара стоит на её концах лицом
// друг к другу — то есть вдоль направления движения качелей.
//
// Анимация собирается КОМПОЗИЦИЕЙ ДВУХ СЛОЁВ, а не заливкой по одному кадру:
//   raw/kz_alt_frame_only.png    — только опоры и перекладина
//   raw/kz_alt_board_riders.png  — только доска с парой и обрывки верёвок
// Заливка по цельному кадру не годилась: в изо-ракурсе доска перекрывает
// шесты, маска перетекала в опоры (86 % «маятника») и конструкция разваливалась.
const path = require('path');
const M = require('./make-altybakan.cjs');

const SRC_FRAME = 'raw/kz_alt_frame_only.png';     // опоры + перекладина
const SRC_PEND = 'raw/kz_alt_board_riders.png';    // доска + пара
const SRC_EMPTY = 'raw/kz_alt_iso3_empty.png';     // пустые качели целиком
const OUT = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'units', 'kz');
const TARGET_H = 132;                              // высота готового спрайта
const SWING_DEG = 12;                              // амплитуда качания

// «Шахматка прозрачности»: модель иногда рисует её как настоящие пиксели —
// чередующиеся светло-серые квадраты. Это не часть спрайта, убираем.
function dropCheckerboard(im) {
  const { w, h, px } = im;
  // Модель рисует «прозрачность» реальными пикселями: строгая шахматка с шагом
  // 12 px из белого (255,255,255) и серого (~175,174,172). Это не часть
  // спрайта — гасим оба тона целиком.
  //
  // Попытка «защитить блики» по числу соседей провалилась: она оставляла на
  // месте решётку из тонких линий. В этих кадрах чисто-белого в самом рисунке
  // почти нет (перо на саукеле — в другом слое), поэтому убираем без оговорок.
  const isChecker = (r, g, b) => {
    const grey = Math.abs(r - g) <= 8 && Math.abs(g - b) <= 8 && Math.abs(r - b) <= 8;
    return grey && (r >= 240 || (r >= 158 && r <= 205));
  };
  for (let i = 0; i < w * h; i++) {
    if (!px[i * 4 + 3]) continue;
    if (isChecker(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])) px[i * 4 + 3] = 0;
  }
  // Кайма антиалиасинга вокруг снятых клеток: светлые пиксели, оставшиеся
  // висеть рядом с прозрачным и не примыкающие к дереву, тоже убираем.
  const drop = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!px[i * 4 + 3]) continue;
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    if (!(r > 205 && g > 200 && b > 195)) continue;
    let empty = 0, solid = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!px[j * 4 + 3]) empty++;
      else if (px[j * 4] > 90 && px[j * 4 + 1] < 150) solid++;   // дерево рядом
    }
    if (empty >= 3 && solid === 0) drop.push(i);
  }
  for (const i of drop) px[i * 4 + 3] = 0;
  return im;
}

// Мелкий мусор после чистки шахматки: одиночные светлые пиксели и обрывки
// в 1-2 точки, не связанные ни с чем. Удаляем всё, что меньше 12 px в кластере.
function despeckle(im, minBlob = 12) {
  const { w, h, px } = im;
  const seen = new Uint8Array(w * h);
  for (let i0 = 0; i0 < w * h; i0++) {
    if (seen[i0] || !px[i0 * 4 + 3]) continue;
    const blob = [], st = [i0];
    seen[i0] = 1;
    while (st.length) {
      const i = st.pop(); blob.push(i);
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (seen[j] || !px[j * 4 + 3]) continue;
        seen[j] = 1; st.push(j);
      }
    }
    if (blob.length < minBlob) for (const i of blob) px[i * 4 + 3] = 0;
  }
  return im;
}
const load = (f) => despeckle(dropCheckerboard(M.dropMagenta(M.readPNG(f))));

const frameRaw = load(SRC_FRAME);
const pendRaw = load(SRC_PEND);
const emptyRaw = load(SRC_EMPTY);

// Общая рамка всех трёх кадров: они нарисованы поверх одного и того же холста,
// поэтому обрезаем одинаково — иначе слои разъедутся при наложении.
const boxes = [M.bbox(frameRaw), M.bbox(pendRaw), M.bbox(emptyRaw)];
const box = {
  x0: Math.min(...boxes.map(b => b.x0)), y0: Math.min(...boxes.map(b => b.y0)),
  x1: Math.max(...boxes.map(b => b.x1)), y1: Math.max(...boxes.map(b => b.y1)),
};
box.w = box.x1 - box.x0 + 1; box.h = box.y1 - box.y0 + 1;

const frame = M.crop(frameRaw, box);
const pend = M.crop(pendRaw, box);
const empty = M.crop(emptyRaw, box);

// Точка подвеса — узел на середине перекладины. Ищем её по маятнику: верхняя
// точка обрывков верёвки и есть место крепления.
const pb = M.bbox(pend);
const pivotX = Math.round(pb.x0 + pb.w / 2);
const pivotY = Math.round(M.bbox(frame).y0 + box.h * 0.10);

function save(img, name) {
  const nw = Math.max(1, Math.round(box.w * (TARGET_H / box.h)));
  const small = M.resize(img, nw, TARGET_H);
  M.writePNG(path.join(OUT, name + '.png'), small.w, small.h, small.px);
  console.log(`${name.padEnd(18)} ${small.w}x${small.h}`);
  return small;
}

const rot = (deg) => M.over(frame, M.rotateAbout(pend, pivotX, pivotY, deg * Math.PI / 180));
save(empty, 'kz_prop_swing');
save(M.over(frame, pend), 'kz_swing_ride_c');
save(rot(-SWING_DEG), 'kz_swing_ride_l');
save(rot(SWING_DEG), 'kz_swing_ride_r');

let np = 0, nf = 0;
for (let i = 0; i < pend.w * pend.h; i++) {
  if (pend.px[i * 4 + 3] > 16) np++;
  if (frame.px[i * 4 + 3] > 16) nf++;
}
console.log(`\nмаятник ${np} px / рама ${nf} px (маятник ${(100 * np / (np + nf)).toFixed(1)} %)`);
console.log(`подвес (${pivotX}, ${pivotY}), амплитуда ±${SWING_DEG}°, кадр ${box.w}x${box.h}`);
