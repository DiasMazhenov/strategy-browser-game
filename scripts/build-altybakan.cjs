// Сборка спрайтов алтыбакана из сгенерированных кадров.
//   kz_prop_swing        — пустые качели (постоянная декорация)
//   kz_swing_ride_c/l/r  — с парой: центр, отклонение влево, вправо
// Все четыре кадра нормируются по ОБЩЕЙ рамке, поэтому опоры не «прыгают».
const path = require('path');
const M = require('./make-altybakan.cjs');

const SRC_EMPTY = 'raw/kz_altybakan_v2_raw.png';   // пустые качели
const SRC_RIDE = 'raw/kz_ride_c.png';              // те же качели с парой
const OUT = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'units', 'kz');
const TARGET_H = 152;                              // как у прочих сценок отдыха
const SWING_DEG = 13;                              // амплитуда качания

const empty = M.dropMagenta(M.readPNG(SRC_EMPTY));
const ride = M.dropMagenta(M.readPNG(SRC_RIDE));

// Общая рамка обоих кадров — гарантия, что рама совпадает пиксель в пиксель.
const be = M.bbox(empty), br = M.bbox(ride);
const box = {
  x0: Math.min(be.x0, br.x0), y0: Math.min(be.y0, br.y0),
  x1: Math.max(be.x1, br.x1), y1: Math.max(be.y1, br.y1),
};
box.w = box.x1 - box.x0 + 1; box.h = box.y1 - box.y0 + 1;

const emptyC = M.crop(empty, box);
const rideC = M.crop(ride, box);

// Линия реза — сразу под перекладиной: ниже неё всё висящее считается маятником.
// Перекладина у обоих кадров на одной высоте (рама не менялась).
const CUT = Math.round(box.h * 0.175);
const { frame, pend } = M.splitPendulum(rideC, CUT);

// точка подвеса — середина перекладины по X, сама перекладина по Y
const pivotX = Math.round(box.w / 2);
const pivotY = CUT;

function place(img, name) {
  const nw = Math.max(1, Math.round(box.w * (TARGET_H / box.h)));
  const small = M.resize(img, nw, TARGET_H);
  M.writePNG(path.join(OUT, name + '.png'), small.w, small.h, small.px);
  return small;
}

const frames = {
  kz_prop_swing: emptyC,
  kz_swing_ride_c: rideC,
  kz_swing_ride_l: M.over(frame, M.rotateAbout(pend, pivotX, pivotY, -SWING_DEG * Math.PI / 180)),
  kz_swing_ride_r: M.over(frame, M.rotateAbout(pend, pivotX, pivotY, SWING_DEG * Math.PI / 180)),
};
for (const [name, img] of Object.entries(frames)) {
  const s = place(img, name);
  console.log(`${name.padEnd(18)} ${s.w}x${s.h}`);
}
// доля маятника — контроль, что разделение сработало (а не «всё в раму»)
let np = 0, nf = 0;
for (let i = 0; i < pend.w * pend.h; i++) {
  if (pend.px[i * 4 + 3] > 16) np++;
  if (frame.px[i * 4 + 3] > 16) nf++;
}
console.log(`\nмаятник: ${np} px, неподвижная рама: ${nf} px (маятник ${(100 * np / (np + nf)).toFixed(1)}%)`);
console.log(`точка подвеса: (${pivotX}, ${pivotY}), рез на ${CUT} из ${box.h}, амплитуда ±${SWING_DEG}°`);
