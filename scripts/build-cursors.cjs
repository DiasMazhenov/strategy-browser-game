// Курсоры действий: raw/cur_*.png (gpt image, магента-фон) → 32×32 PNG в
// src/assets/cursors/. CSS-курсоры больше 32px Chrome и Safari молча игнорируют,
// поэтому размер жёсткий.
//
// Горячая точка (hotspot) у каждого своя и вынесена в HOTSPOT: у меча и топора это
// остриё в верхнем-левом углу, у стрелки «идти» — самый низ (куда указывает),
// у предметов-символов (корзина, рыба) — центр.
//
// Запуск: node scripts/build-cursors.cjs
const fs = require('fs');
const path = require('path');
const M = require('./make-altybakan.cjs');   // readPNG/writePNG/dropMagenta/bbox/crop/resize

const RAW = path.join(__dirname, '..', 'raw');
const OUT = path.join(__dirname, '..', 'src', 'assets', 'cursors');

// hx,hy — доли ширины/высоты готового кадра: 0,0 = левый верх, 0.5,0.5 = центр
const CURSORS = [
  { src: 'cur_attack.png', out: 'attack.png', hx: 0.06, hy: 0.06 },  // остриё сабли
  { src: 'cur_wood.png',   out: 'wood.png',   hx: 0.06, hy: 0.30 },  // лезвие топора
  { src: 'cur_gold2.png',  out: 'gold.png',   hx: 0.18, hy: 0.12 },  // клюв кирки
  { src: 'cur_food.png',   out: 'food.png',   hx: 0.50, hy: 0.50 },
  { src: 'cur_fish2.png',  out: 'fish.png',   hx: 0.50, hy: 0.50 },
  { src: 'cur_build.png',  out: 'build.png',  hx: 0.18, hy: 0.18 },  // боёк молотка
  { src: 'cur_move3.png',  out: 'move.png',   hx: 0.50, hy: 0.96, noOutline: true },  // своя золотая кайма
];

// 16 px — вдвое меньше по стороне (вчетверо по площади). Крупнее выглядело
// громоздко и перекрывало то, на что наводишься. Системная «рука» (pointer)
// на своих юнитах не трогается: её размер задаёт ОС.
const SIZE = 16;

// Кайма: модель иногда рисует рамку по краю кадра и белые поля за ней.
// Считаем строку/столбец «мусорной», если она почти целиком тёмная или белая.
function stripFrame(im) {
  const { w, h, px } = im;
  const rowBad = (y) => {
    let dark = 0, light = 0, n = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] < 16) continue;
      n++;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      if (r < 60 && g < 60 && b < 60) dark++;
      else if (r > 230 && g > 230 && b > 230) light++;
    }
    return n > w * 0.5 && (dark + light) > n * 0.9;
  };
  const colBad = (x) => {
    let dark = 0, light = 0, n = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] < 16) continue;
      n++;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      if (r < 60 && g < 60 && b < 60) dark++;
      else if (r > 230 && g > 230 && b > 230) light++;
    }
    return n > h * 0.5 && (dark + light) > n * 0.9;
  };
  let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1;
  // срезаем не больше 12 % кадра с каждой стороны, чтобы не съесть рисунок
  const lim = Math.floor(Math.min(w, h) * 0.12);
  let k = 0;
  while (k < lim && rowBad(y0)) { y0++; k++; }
  k = 0; while (k < lim && rowBad(y1)) { y1--; k++; }
  k = 0; while (k < lim && colBad(x0)) { x0++; k++; }
  k = 0; while (k < lim && colBad(x1)) { x1--; k++; }
  return (x0 || y0 || x1 !== w - 1 || y1 !== h - 1)
    ? M.crop(im, { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }) : im;
}

// Белые поля вокруг рисунка (магента-фон снят, но модель оставила белую заливку).
function dropWhite(im) {
  const { w, h, px } = im;
  for (let i = 0; i < w * h; i++) {
    if (!px[i * 4 + 3]) continue;
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    // чисто-белый и почти-белый — только если это НЕ блик внутри рисунка:
    // белые пиксели по краю кадра, соседствующие с прозрачным
    if (r > 235 && g > 235 && b > 235) {
      const x = i % w, y = (i / w) | 0;
      let empty = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) { empty++; continue; }
        if (!px[(ny * w + nx) * 4 + 3]) empty++;
      }
      if (empty >= 2) px[i * 4 + 3] = 0;
    }
  }
  return im;
}

// Квадратим по большей стороне: курсор не должен «сплющиваться» при ресайзе.
function square(im) {
  const s = Math.max(im.w, im.h);
  const out = { w: s, h: s, px: Buffer.alloc(s * s * 4, 0) };
  const ox = ((s - im.w) / 2) | 0, oy = ((s - im.h) / 2) | 0;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const si = (y * im.w + x) * 4, di = ((y + oy) * s + (x + ox)) * 4;
    im.px.copy(out.px, di, si, si + 4);
  }
  return out;
}

// Обводка: на пёстрой карте курсор без контура теряется.
function outline(im) {
  const { w, h, px } = im;
  const src = Buffer.from(px);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src[i + 3] > 40) continue;
    let near = false;
    // только 4 стороны: на мелком кадре диагональная обводка утолщает контур
    // вдвое и рисунок превращается в чёрное пятно
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (src[(ny * w + nx) * 4 + 3] > 150) { near = true; break; }
    }
    if (near) { px[i] = 12; px[i + 1] = 10; px[i + 2] = 8; px[i + 3] = 235; }
  }
  return im;
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const meta = [];
for (const c of CURSORS) {
  const p = path.join(RAW, c.src);
  if (!fs.existsSync(p)) { console.log(`  ПРОПУСК ${c.src} — нет файла`); continue; }
  let im = M.dropMagenta(M.readPNG(p));
  im = stripFrame(im);
  im = M.dropMagenta(im);      // после срезки рамки могла открыться ещё магента
  im = dropWhite(im);
  const bb = M.bbox(im);
  im = M.crop(im, bb);
  im = square(im);
  im = M.resize(im, SIZE, SIZE);
  if (!c.noOutline) im = outline(im);   // у стрелки уже есть золотой контур
  M.writePNG(path.join(OUT, c.out), im.w, im.h, im.px);
  const hx = Math.round(c.hx * (SIZE - 1)), hy = Math.round(c.hy * (SIZE - 1));
  meta.push({ name: c.out.replace('.png', ''), hx, hy });
  console.log(`  ${c.out.padEnd(11)} ${SIZE}x${SIZE}  hotspot ${hx},${hy}`);
}

fs.writeFileSync(path.join(OUT, 'hotspots.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(`\n${meta.length} курсоров → src/assets/cursors/`);
