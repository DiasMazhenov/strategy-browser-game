// ─────────────────────────────────────────────────────────────────────────
// Пиксель-арт: процедурные спрайты зданий и юнитов.
// Все спрайты рисуются блоками с привязкой к изометрической сетке:
// здание размера S (мировые единицы) занимает ромб 2S × S изо-экранных
// пикселей — ровно пропорции тайла (64×32 на 32 мировые единицы).
// ─────────────────────────────────────────────────────────────────────────
import { BUILDING_DEFS, type BuildingKey, type UnitKey } from './config';
import { UNIT_ANCHORS, UNIT_TARGET_H } from './sprite-art';
// детальные AI-спрайты юнитов (боковой вид); _w/_walk2 — согласованные кадры шага
import uVillager from '../assets/sprites/units/villager.png';
import uVillagerW from '../assets/sprites/units/villager_w.png';
import uSwordsman from '../assets/sprites/units/swordsman.png';
import uSwordsmanW from '../assets/sprites/units/swordsman_w.png';
import uSwordsmanW2 from '../assets/sprites/units/swordsman_walk2.png';
import uArcher from '../assets/sprites/units/archer.png';
import uArcherW from '../assets/sprites/units/archer_w.png';
import uSpearman from '../assets/sprites/units/spearman.png';
import uSpearmanW from '../assets/sprites/units/spearman_w.png';
import uKnight from '../assets/sprites/units/knight.png';
import uKnightW from '../assets/sprites/units/knight_w.png';
import uCavalry from '../assets/sprites/units/cavalry.png';
import uCavalryW from '../assets/sprites/units/cavalry_w.png';
import uCatapult from '../assets/sprites/units/catapult.png';
import uCatapultW from '../assets/sprites/units/catapult_w.png';
import uMonk from '../assets/sprites/units/monk.png';
import uMonkW from '../assets/sprites/units/monk_w.png';
import uWolf from '../assets/sprites/units/wolf.png';
import uWolfW from '../assets/sprites/units/wolf_w.png';
import uSheep from '../assets/sprites/units/sheep.png';
import uSheepW from '../assets/sprites/units/sheep_w.png';
import uCow from '../assets/sprites/units/cow.png';
import uCowW from '../assets/sprites/units/cow_w.png';
import uDeer from '../assets/sprites/units/deer.png';
import uDeerW from '../assets/sprites/units/deer_w.png';

const mk = (src: string): HTMLImageElement => { const im = new Image(); im.src = src; return im; };
// кадр покоя/атаки
const UNIT_IMAGES: Partial<Record<UnitKey, HTMLImageElement>> = {
  villager: mk(uVillager), swordsman: mk(uSwordsman), archer: mk(uArcher), spearman: mk(uSpearman),
  knight: mk(uKnight), cavalry: mk(uCavalry), catapult: mk(uCatapult), monk: mk(uMonk), wolf: mk(uWolf),
  sheep: mk(uSheep), cow: mk(uCow), deer: mk(uDeer),
};
// два кадра шага A/B (мечник ходит с опущенным мечом, боевой кадр — только покой/атака)
const UNIT_WALK_A: Partial<Record<UnitKey, HTMLImageElement>> = {
  villager: mk(uVillager), swordsman: mk(uSwordsmanW), archer: mk(uArcher), spearman: mk(uSpearman),
  knight: mk(uKnight), cavalry: mk(uCavalry), catapult: mk(uCatapult), monk: mk(uMonk), wolf: mk(uWolf),
  sheep: mk(uSheep), cow: mk(uCow), deer: mk(uDeer),
};
const UNIT_WALK_B: Partial<Record<UnitKey, HTMLImageElement>> = {
  villager: mk(uVillagerW), swordsman: mk(uSwordsmanW2), archer: mk(uArcherW), spearman: mk(uSpearmanW),
  knight: mk(uKnightW), cavalry: mk(uCavalryW), catapult: mk(uCatapultW), monk: mk(uMonkW), wolf: mk(uWolfW),
  sheep: mk(uSheepW), cow: mk(uCowW), deer: mk(uDeerW),
};
const ready = (im?: HTMLImageElement) => !!im && im.complete && im.naturalWidth > 0;

// ключ якоря для кадра шага (у мечника оба кадра шага — ходячие позы)
const WALK_ANCHOR_A: Partial<Record<UnitKey, string>> = {
  villager: 'villager', swordsman: 'swordsman_w', archer: 'archer', spearman: 'spearman',
  knight: 'knight', cavalry: 'cavalry', catapult: 'catapult', monk: 'monk', wolf: 'wolf',
  sheep: 'sheep', cow: 'cow', deer: 'deer',
};
const WALK_ANCHOR_B: Partial<Record<UnitKey, string>> = {
  villager: 'villager_w', swordsman: 'swordsman_walk2', archer: 'archer_w', spearman: 'spearman_w',
  knight: 'knight_w', cavalry: 'cavalry_w', catapult: 'catapult_w', monk: 'monk_w', wolf: 'wolf_w',
  sheep: 'sheep_w', cow: 'cow_w', deer: 'deer_w',
};

function drawUnitSprite(ctx: CanvasRenderingContext2D, u: U, ix: number, iy: number, time: number, selected: boolean): boolean {
  const base = UNIT_IMAGES[u.key];
  if (!ready(base) || !UNIT_ANCHORS[u.key]) return false;
  const f = u.face;
  // реальное перемещение по полю (в бою на месте не «шагаем»)
  const move = u.walk ?? moving(u);

  // ── выбор кадра ──
  let im: HTMLImageElement, anKey: string;
  const wA = UNIT_WALK_A[u.key], wB = UNIT_WALK_B[u.key];
  if (move && ready(wA) && ready(wB)) {
    // два согласованных кадра шага, переключаются в такт фазе
    const useB = Math.sin(u.anim) < 0;
    im = (useB ? wB : wA)!;
    anKey = (useB ? WALK_ANCHOR_B : WALK_ANCHOR_A)[u.key]!;
  } else {
    im = base!; anKey = u.key; // покой/атака — боевой кадр
  }
  const an = UNIT_ANCHORS[anKey] ?? UNIT_ANCHORS[u.key];
  const H = UNIT_TARGET_H[u.key] ?? 46;
  const scale = H / an.h;
  const w = im.naturalWidth * scale;

  // ── покадровая анимация: подскок на смену ноги, наклон/крен, раскачка.
  //    Амплитуды по типу: всадники/зверь галопируют с креном, пешие — шаг ──
  const mounted = u.key === 'knight' || u.key === 'cavalry';
  const beast = u.key === 'wolf';
  const siege = u.key === 'catapult';
  const step = Math.sin(u.anim), stepAbs = Math.abs(step);
  const gait = mounted || beast ? Math.sin(u.anim * 1.0) : step; // у галопа фаза та же, но выше амплитуда
  let bob: number, rock: number, lean: number, sway: number;
  if (move) {
    if (mounted) { bob = -Math.abs(gait) * 7; rock = gait * 0.06; lean = 0.05; sway = gait * 2.0; }
    else if (beast) { bob = -Math.abs(gait) * 5; rock = gait * 0.05; lean = 0.12; sway = gait * 1.2; }
    else if (siege) { bob = -stepAbs * 1.5; rock = step * 0.02; lean = 0.02; sway = 0; }
    else { bob = -stepAbs * 4; rock = 0; lean = 0.09 + stepAbs * 0.04; sway = step * 1.6; }
  } else {
    bob = Math.sin(time * 2 + u.anim) * 0.9; rock = 0; lean = 0; sway = 0;
  }
  const lunge = u.atkAnim > 0 ? u.atkAnim * 7 * f : 0;
  const fx = ix + lunge + sway * 0.3, fy = iy + 8 + bob; // точка опоры (ноги/копыта)
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(fx, fy);
  ctx.scale(f, 1);                       // разворот влево — отражение
  ctx.rotate((lean + rock) * f);         // наклон вперёд + галопный крен
  ctx.translate(-sway, 0);
  // якорь кадра: центр по X, ноги по Y
  ctx.drawImage(im, -an.ax * scale, -an.ay * scale, w, H);
  ctx.restore();
  void selected;
  return true;
}

// «пиксель» юнитов в изо-экранных координатах
const UB = 3;

const snap = (v: number, b = UB) => Math.round(v / b) * b;

// ── низкоуровневые блок-примитивы (для пререндера зданий, block = px) ──
class Pix {
  constructor(public ctx: CanvasRenderingContext2D, public b: number) {}
  rect(x: number, y: number, w: number, h: number, c: string) {
    const g = this.b;
    const x0 = Math.round(x / g) * g, y0 = Math.round(y / g) * g;
    const x1 = Math.round((x + w) / g) * g, y1 = Math.round((y + h) / g) * g;
    this.ctx.fillStyle = c;
    this.ctx.fillRect(x0, y0, Math.max(g, x1 - x0), Math.max(g, y1 - y0));
  }
  circle(cx: number, cy: number, r: number, c: string) {
    const g = this.b;
    const r0 = Math.max(1, Math.round(r / g));
    for (let dy = -r0; dy <= r0; dy++) {
      const w = Math.floor(Math.sqrt(r0 * r0 - dy * dy) + 0.5);
      this.rect(cx - w * g, cy + dy * g, w * 2 * g, g, c);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: string) {
    const g = this.b;
    const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / g);
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      this.rect(x0 + (x1 - x0) * t - w / 2, y0 + (y1 - y0) * t - w / 2, w, w, c);
    }
  }
  poly(pts: [number, number][], c: string) {
    const g = this.b;
    let yMin = Infinity, yMax = -Infinity, xMin = Infinity, xMax = -Infinity;
    for (const [x, y] of pts) { if (y < yMin) yMin = y; if (y > yMax) yMax = y; if (x < xMin) xMin = x; if (x > xMax) xMax = x; }
    for (let y = Math.floor(yMin / g) * g; y < yMax; y += g) {
      const sy = y + g / 2;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx2, by] = pts[(i + 1) % pts.length];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) {
          xs.push(ax + ((sy - ay) / (by - ay)) * (bx2 - ax));
        }
      }
      xs.sort((a, b2) => a - b2);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        this.rect(xs[i] + 0.01, y, Math.max(g, xs[i + 1] - xs[i]), g, c);
      }
    }
  }
}

// изо-ромб с центром (cx,cy), полуширина half, полувысота halfH
function diamondPts(cx: number, cy: number, half: number, halfH: number): [number, number][] {
  return [[cx, cy - halfH], [cx + half, cy], [cx, cy + halfH], [cx - half, cy]];
}

// объёмный изо-блок с полигональными гранями.
// (cx,cy) — центр ромба основания; half — полуширина; wallH — высота.
function isoBox(p: Pix, cx: number, cy: number, half: number, wallH: number, top: string, left: string, right: string) {
  const hh = half / 2;
  const topY = cy - wallH;
  const BT: [number, number] = [cx, topY - hh];   // задняя вершина верха
  const RT: [number, number] = [cx + half, topY]; // правая вершина верха
  const FT: [number, number] = [cx, topY + hh];   // передняя вершина верха
  const LT: [number, number] = [cx - half, topY]; // левая вершина
  // верх-ромб
  p.poly([BT, RT, FT, LT], top);
  // передняя-левая стена
  p.poly([LT, FT, [cx, cy + hh], [cx - half, cy]], left);
  // передняя-правая стена
  p.poly([RT, FT, [cx, cy + hh], [cx + half, cy]], right);
}

// пирамидальная крыша: пик над задней кромкой ромба (классика 2:1 изо)
function pyramidRoof(p: Pix, cx: number, cy: number, half: number, wallH: number, roofH: number, cL: string, cR: string) {
  const hh = half / 2;
  const topY = cy - wallH;
  const RT: [number, number] = [cx + half, topY];
  const FT: [number, number] = [cx, topY + hh];
  const LT: [number, number] = [cx - half, topY];
  const BT: [number, number] = [cx, topY - hh];
  const A: [number, number] = [cx, topY - hh - roofH]; // пик над задней вершиной
  // свес-карниз (тень под задними скатами)
  p.poly([[cx, topY - hh - 4], [cx + half + 5, topY + 1], [RT[0], RT[1]], [BT[0], BT[1]]], 'rgba(0,0,0,0.25)');
  p.poly([[cx, topY - hh - 4], [cx - half - 5, topY + 1], [LT[0], LT[1]], [BT[0], BT[1]]], 'rgba(0,0,0,0.35)');
  p.poly([LT, FT, A], cL); // левый скат (тень)
  p.poly([RT, FT, A], cR); // правый скат (свет)
  // блик вдоль конька
  p.line(A[0], A[1], FT[0], FT[1], p.b, 'rgba(255,255,255,0.25)');
  return A;
}

// светящееся окно на передней стене. t: 0 (левый угол) … 0.5 (передний) … 1 (правый угол).
function wallWindow(p: Pix, cx: number, cy: number, half: number, wallH: number, t: number) {
  const hh = half / 2;
  const w = 7, h = 8;
  let wx: number, wy: number;
  if (t < 0.5) {
    const u = t * 2; // 0 на левом углу → 1 на переднем
    wx = cx - half + u * half;
    wy = cy - wallH + u * hh + wallH * 0.30;
  } else {
    const w2 = (t - 0.5) * 2; // 0 на переднем → 1 на правом
    wx = cx + w2 * half;
    wy = cy - wallH + (1 - w2) * hh + wallH * 0.30;
  }
  p.rect(wx - w / 2 - 1, wy - 1, w + 2, h + 2, '#3a2a12');
  p.rect(wx - w / 2, wy, w, h, '#fde68a');
  p.rect(wx - w / 2, wy, w, 2, '#b9892b'); // перекладина
}

// ─────────────────────────────────────────────────────────────────────────
// Пререндер спрайта здания
// ─────────────────────────────────────────────────────────────────────────
export interface BldArt {
  img: HTMLCanvasElement;
  flash: HTMLCanvasElement;
  cx: number; cy: number;   // центр ромба основания в пикселях канваса
  flag: { x: number; y: number }; // основание флагштока относительно центра
}

const BLD_ART_CACHE: Partial<Record<BuildingKey, BldArt>> = {};

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function getBldArt(key: BuildingKey): BldArt {
  const cached = BLD_ART_CACHE[key];
  if (cached) return cached;
  const S = BUILDING_DEFS[key].size;
  const half = S;                 // ромб 2S × S
  const hh = S / 2;
  const B = 2;                    // размер «пикселя» здания
  const pad = 28;
  const W = half * 2 + pad * 2;
  const cx = W / 2;
  let apexH = 60;
  if (key === 'tower') apexH = 110;
  if (key === 'towncenter') apexH = 130;
  const cy = apexH + hh + pad;
  const H = cy + hh + pad;
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const p = new Pix(ctx, B);

  let flag: [number, number] = [cx, cy - apexH];

  // дверь у переднего угла стены (стоит на земле в точке cy+hh)
  const frontDoor = (wallH: number, dw = 12) => {
    const dh = Math.min(wallH * 0.66, wallH - 4);
    const dx = cx - dw / 2, dy = cy + hh - dh;
    p.rect(dx - 1, dy - 2, dw + 2, dh + 2, '#2c1a0a'); // арка/рама
    p.rect(dx, dy, dw, dh, '#5a3a1c');
    p.rect(dx, dy, dw, 3, '#7a5230'); // перекладина
    p.rect(dx + dw - 4, dy + dh * 0.45, 2, 2, '#f6d47c'); // ручка
  };

  const build = () => {
    switch (key) {
      case 'towncenter': {
        // каменный цоколь
        isoBox(p, cx, cy, half, 42, '#c9c2b4', '#a39c8e', '#8a8478');
        frontDoor(42, 16);
        // деревянный второй этаж
        const h2 = half * 0.66, wH2 = 46;
        isoBox(p, cx, cy - 42, h2, wH2, '#c07a34', '#a0621f', '#83511a');
        wallWindow(p, cx, cy - 42, h2, wH2, 0.3);
        wallWindow(p, cx, cy - 42, h2, wH2, 0.7);
        // красная черепичная крыша
        const A = pyramidRoof(p, cx, cy - 42, h2 + 4, wH2, 34, '#9a1818', '#d62f2f');
        flag = [A[0] + 4, A[1] + 8];
        break;
      }
      case 'house': {
        isoBox(p, cx, cy, half, 36, '#e2b87f', '#c4955f', '#a87a45');
        frontDoor(36, 10);
        wallWindow(p, cx, cy, half, 36, 0.2);
        wallWindow(p, cx, cy, half, 36, 0.82);
        const A = pyramidRoof(p, cx, cy, half + 4, 36, 26, '#8a5410', '#c48a26');
        // труба
        p.rect(A[0] + 10, A[1] + 16, 8, 14, '#78716c');
        p.rect(A[0] + 8, A[1] + 14, 12, 5, '#57534e');
        break;
      }
      case 'barracks': {
        isoBox(p, cx, cy, half, 42, '#c08a44', '#a06f30', '#835826');
        // широкая тёмная дверь с мечами
        p.rect(cx - 7, cy - 14, 14, 15, '#3f2a14');
        p.line(cx - 5, cy - 13, cx + 5, cy - 4, 2, '#d6d3d1');
        p.line(cx + 5, cy - 13, cx - 5, cy - 4, 2, '#d6d3d1');
        wallWindow(p, cx, cy, half, 42, 0.18);
        wallWindow(p, cx, cy, half, 42, 0.82);
        const A = pyramidRoof(p, cx, cy, half + 4, 42, 30, '#4e2f14', '#7a4c22');
        flag = [A[0] - 6, A[1] + 6];
        break;
      }
      case 'stable': {
        isoBox(p, cx, cy, half, 36, '#d69c5a', '#b67c3e', '#96642f');
        // денники — тёмные проёмы-стойла
        p.rect(cx - half * 0.6, cy - 20, 15, 21, '#2f1d0c');
        p.rect(cx + half * 0.14, cy - 20, 15, 21, '#2f1d0c');
        // загородка у переднего угла
        for (let i = -1; i <= 1; i++) p.rect(cx + i * 11 - 1, cy + hh - 8, 4, 11, '#8a6230');
        p.rect(cx - 15, cy + hh - 6, 30, 4, '#8a6230');
        // стог сена у левого угла
        p.circle(cx - half * 0.62, cy - 2, 9, '#e4cd72');
        p.circle(cx - half * 0.62 - 7, cy - 2, 5, '#d0b85c');
        const A = pyramidRoof(p, cx, cy, half + 4, 36, 28, '#8a2a12', '#c14428');
        flag = [A[0] + 8, A[1] + 8];
        break;
      }
      case 'blacksmith': {
        isoBox(p, cx, cy, half, 40, '#8e8882', '#6f6a64', '#58534e');
        // горн — большая тёмная арка с огнём у передней грани
        p.rect(cx - 10, cy - 24, 20, 25, '#241d18');
        p.rect(cx - 8, cy - 20, 16, 15, '#7c2d12');
        p.rect(cx - 7, cy - 18, 14, 11, '#f97316');
        p.rect(cx - 5, cy - 16, 10, 6, '#fde047');
        p.rect(cx - 2, cy - 18, 4, 4, '#fff7cc');
        wallWindow(p, cx, cy, half, 40, 0.82);
        const A = pyramidRoof(p, cx, cy, half + 4, 40, 26, '#3a3733', '#5b5650');
        // труба на скате
        p.rect(A[0] + 12, A[1] + 14, 9, 24, '#3f3a36');
        p.rect(A[0] + 10, A[1] + 12, 13, 5, '#2c2926');
        // наковальня у правого угла
        p.rect(cx + half * 0.42, cy - 4, 12, 5, '#27272a');
        p.rect(cx + half * 0.42 + 3, cy + 1, 6, 4, '#3f3f46');
        flag = [A[0] - 8, A[1] + 6];
        break;
      }
      case 'market': {
        isoBox(p, cx, cy, half, 14, '#d8ab76', '#bd8f58', '#a0763f');
        // прилавок с товаром
        p.rect(cx + half * 0.16, cy - 8, 20, 9, '#8a6a48');
        p.rect(cx + half * 0.18, cy - 12, 7, 5, '#dc2626');
        p.rect(cx + half * 0.3, cy - 12, 7, 5, '#facc15');
        // бочки
        p.circle(cx - half * 0.46, cy - 2, 7, '#6b4423');
        p.rect(cx - half * 0.46 - 7, cy - 4, 14, 3, '#a8a29e');
        // полосатый навес
        const half2 = half + 8, roofH = 30, topY = cy - 14;
        const A: [number, number] = [cx, topY - half2 / 2 - roofH];
        const LT: [number, number] = [cx - half2, topY];
        const RT: [number, number] = [cx + half2, topY];
        const FT: [number, number] = [cx, topY + half2 / 2];
        // столбы навеса
        for (const sx2 of [LT, FT, RT]) p.rect(sx2[0] - 2, topY + 4, 4, hh - 2, '#6b4a22');
        const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        for (let i = 0; i < 8; i++) {
          const t0 = i / 8, t1 = (i + 1) / 8;
          p.poly([lerp(FT, A, t0), lerp(LT, A, t0), lerp(LT, A, t1), lerp(FT, A, t1)], i % 2 === 0 ? '#b91c1c' : '#f5f5f4');
          p.poly([lerp(FT, A, t0), lerp(RT, A, t0), lerp(RT, A, t1), lerp(FT, A, t1)], i % 2 === 0 ? '#991b1b' : '#d6d3d1');
        }
        p.line(A[0], A[1], FT[0], FT[1], B, '#f5f5f4');
        flag = [A[0] + 2, A[1] + 6];
        break;
      }
      case 'tower': {
        isoBox(p, cx, cy, half, 78, '#c8c0b4', '#a8a098', '#888078');
        const topY = cy - 78;
        // дверь у основания
        p.rect(cx - 5, cy + hh - 16, 10, 16, '#2c1a0a');
        p.rect(cx - 4, cy + hh - 15, 8, 13, '#4a2d12');
        // узкая бойница на передней грани
        p.rect(cx - 2, cy - 50, 5, 16, '#1c1917');
        // каменная площадка наверху (шире ствола)
        const topHalf = half + 4;
        p.poly(diamondPts(cx, topY, topHalf, topHalf / 2), '#b5ada3');
        // зубцы-столбики по двум видимым кромкам площадки (торчат вверх над кромкой)
        const merlon = (wx: number, wy: number) => {
          p.rect(wx - 3, wy - 9, 7, 9, '#8f8780');
          p.rect(wx - 3, wy - 9, 7, 3, '#a8a098');
        };
        for (let i = 0; i <= 4; i++) {
          const t = i / 4;
          merlon(cx - topHalf + t * topHalf, topY + t * topHalf / 2);
          merlon(cx + topHalf - t * topHalf, topY + t * topHalf / 2);
        }
        flag = [cx, topY - 12];
        break;
      }
      case 'farm': {
        // вспаханное поле
        p.poly(diamondPts(cx, cy, half, hh), '#7a5a32');
        p.poly([[cx, cy - hh], [cx + half, cy], [cx, cy + hh], [cx - half, cy]], '#6b4c28');
        // борозды
        for (let i = -3; i <= 3; i++) {
          const yy = cy + i * (hh / 4);
          const w = half * (1 - Math.abs(i) / 4.4);
          p.rect(cx - w, yy - 1, w * 2, 2, i % 2 ? '#54391c' : '#83613a');
        }
        // колосья рядами
        for (let r = -2; r <= 2; r++) for (let cI = -3; cI <= 3; cI++) {
          const wx = cx + cI * 13 + (r % 2) * 6.5;
          const wy = cy + r * 8.5;
          if (Math.abs(cI + r * 0.45) > 3.3) continue;
          p.rect(wx, wy - 6, 2, 6, '#7d9e2e');
          p.circle(wx, wy - 9, 2.6, '#fde68a');
        }
        // изгородь по 4 углам
        const corners = diamondPts(cx, cy, half, hh);
        for (const [fx, fy] of corners) p.rect(fx - 1, fy - 7, 3, 9, '#8a6230');
        // шест
        p.rect(corners[3][0] - 1, corners[3][1] - 24, 3, 26, '#5c3618');
        flag = [corners[3][0], corners[3][1] - 22];
        break;
      }
    }
  };
  build();

  // красная «раненая» версия
  const fl = makeCanvas(W, H);
  const fctx = fl.getContext('2d')!;
  fctx.drawImage(cv, 0, 0);
  fctx.globalCompositeOperation = 'source-atop';
  fctx.fillStyle = 'rgba(239,68,68,0.55)';
  fctx.fillRect(0, 0, W, H);

  const art: BldArt = { img: cv, flash: fl, cx, cy, flag: { x: flag[0] - cx, y: flag[1] - cy } };
  BLD_ART_CACHE[key] = art;
  return art;
}

// строительные леса + полупрозрачный пиксель-каркас
export function drawConstruction(ctx: CanvasRenderingContext2D, ix: number, iy: number, S: number, done: number) {
  const g = UB;
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(snap(x), snap(y), Math.ceil(w / g) * g, Math.ceil(h / g) * g);
  };
  // контур будущего ромба
  ctx.strokeStyle = 'rgba(246,212,124,0.7)'; ctx.lineWidth = 2;
  ctx.beginPath();
  const d = diamondPts(ix, iy, S, S / 2);
  d.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.closePath(); ctx.stroke();
  // столбы по углам растут со стройкой
  const poleH = 34 * done;
  for (const [fx, fy] of [d[0], d[1], d[2], d[3]]) {
    px(fx - 2, fy - poleH, 4, poleH, '#8b5e2e');
  }
  // перекладины
  px(d[3][0], d[3][1] - poleH, d[1][0] - d[3][0], 3, '#a57a42');
  // полготовый блок здания
  if (done > 0.15) {
    ctx.globalAlpha = 0.45 + done * 0.3;
    const p = new Pix(ctx, g);
    isoBox(p, ix, iy, S * 0.8, 26 * done, 'rgba(180,160,130,1)', 'rgba(140,120,90,1)', 'rgba(120,100,70,1)');
    ctx.globalAlpha = 1;
  }
  // прогресс
  px(ix - 30, iy - S / 2 - 22, 60, 8, 'rgba(0,0,0,0.65)');
  px(ix - 29, iy - S / 2 - 21, 58 * done, 6, '#a3e635');
}

// блок-ромб (тень / кольцо выделения)
export function diamondShadow(ctx: CanvasRenderingContext2D, ix: number, iy: number, half: number, halfH: number, color: string) {
  const g = UB;
  ctx.fillStyle = color;
  for (let y = -halfH; y < halfH; y += g) {
    const w = half * (1 - Math.abs(y) / halfH);
    ctx.fillRect(snap(ix - w), snap(iy + y), Math.ceil(w * 2 / g) * g, g);
  }
}

export function diamondRing(ctx: CanvasRenderingContext2D, ix: number, iy: number, half: number, halfH: number, color: string, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color; ctx.lineWidth = 3;
  ctx.beginPath();
  const d: [number, number][] = [[ix, iy - halfH], [ix + half, iy], [ix, iy + halfH], [ix - half, iy]];
  d.forEach(([x, y], i) => { const sx = snap(x), sy = snap(y); i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy); });
  ctx.closePath(); ctx.stroke();
  ctx.globalAlpha = 1;
}

// половина ромба-выделения: back=true — дальняя кромка (рисуется ПОД спрайтом),
// false — ближняя кромка (поверх спрайта), чтобы кольцо шло точно по фундаменту
export function diamondRingHalf(ctx: CanvasRenderingContext2D, ix: number, iy: number, half: number, halfH: number, color: string, back: boolean, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  ctx.beginPath();
  const top: [number, number] = [ix, iy - halfH], right: [number, number] = [ix + half, iy],
        bot: [number, number] = [ix, iy + halfH], left: [number, number] = [ix - half, iy];
  const pts = back ? [left, top, right] : [right, bot, left];
  pts.forEach(([x, y], i) => { const sx = snap(x), sy = snap(y); i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy); });
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────────────────
// Юниты: пиксель-арт с анимациями ходьбы и атаки
// ─────────────────────────────────────────────────────────────────────────
interface U { key: UnitKey; owner: 'player' | 'enemy' | 'neutral'; face: number; anim: number; atkAnim: number; state: string; carry?: { type: string; amt: number }; hp?: number; maxHp?: number; walk?: boolean; level?: number }

const TEAM = {
  player: { tunic: '#3b82f6', tunicD: '#1d4ed8', trim: '#93c5fd', plume: '#60a5fa' },
  enemy: { tunic: '#ef4444', tunicD: '#b91c1c', trim: '#fca5a5', plume: '#f87171' },
  neutral: { tunic: '#9ca3af', tunicD: '#6b7280', trim: '#d1d5db', plume: '#9ca3af' },
};

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(snap(x), snap(y), Math.ceil(w / UB) * UB, Math.ceil(h / UB) * UB);
}
function cx(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) {
  ctx.fillStyle = c;
  const r0 = Math.max(1, Math.round(r / UB));
  for (let dy = -r0; dy <= r0; dy++) {
    const w = Math.floor(Math.sqrt(r0 * r0 - dy * dy) + 0.5);
    ctx.fillRect(snap(x - w * UB), snap(y + dy * UB), (w * 2 + 1) * UB, UB);
  }
}
function ln(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, c: string) {
  ctx.fillStyle = c;
  const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / UB);
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    ctx.fillRect(snap(x - w / 2), snap(y - w / 2), Math.ceil(w / UB) * UB, Math.ceil(w / UB) * UB);
  }
}

const moving = (u: U) => u.state === 'move' || u.state === 'attackmove' || u.state === 'gather' || u.state === 'return' || u.state === 'build';

export function drawPixelUnit(ctx: CanvasRenderingContext2D, u: U, ix: number, iy: number, time: number, selected: boolean) {
  const mounted = u.key === 'knight' || u.key === 'cavalry';
  const shadowR = u.key === 'catapult' ? 21 : mounted ? 18 : u.key === 'monk' ? 11 : u.key === 'wolf' ? 13 : 13;
  // тень
  diamondShadow(ctx, ix + 2, iy + 8, shadowR, shadowR / 2.2, 'rgba(0,0,0,0.28)');
  // кольцо выделения
  if (selected) {
    const ringC = u.key === 'monk' ? '#fde68a' : u.key === 'villager' ? '#a3e635' : '#7dd3fc';
    diamondRing(ctx, ix, iy + 8, shadowR + 2, (shadowR + 2) / 2.2, ringC);
    const pr = ((time * 22) % 12) | 0;
    diamondRing(ctx, ix, iy + 8, shadowR + 2 + pr, (shadowR + 2 + pr) / 2.2, ringC, 1 - pr / 12);
  }

  const f = u.face;
  const move = moving(u);
  const sw = move ? Math.sin(u.anim) : 0;           // фаза шага
  const bob = move ? -Math.abs(Math.sin(u.anim)) * 2 : Math.sin(time * 2 + u.anim) * 0.8;
  const atk = u.atkAnim;                             // 1 → 0
  const x = ix + (atk > 0 ? atk * 4 * f : 0);
  const y = iy + snap(bob);
  const t = TEAM[u.owner];

  // детальный AI-спрайт (если есть) — с покадровой анимацией
  const usedSprite = drawUnitSprite(ctx, u, ix, iy, time, selected);
  if (!usedSprite) {
    if (u.key === 'wolf') drawWolf(ctx, u, x, y, sw, time);
    else if (u.key === 'sheep' || u.key === 'cow' || u.key === 'deer') drawLivestock(ctx, u, x, y, sw, bob);
    else if (u.key === 'catapult') drawCatapult(ctx, u, x, y, sw, time);
    else if (mounted) { drawHorse(ctx, u, x, y, sw, time); drawRider(ctx, u, x, y, sw, atk, time, t); }
    else drawHumanoid(ctx, u, x, y, sw, atk, time, t);
  }

  // HP-полоса (высота — над спрайтом, если он есть)
  const hp = (u as unknown as { hp?: number; maxHp?: number }).hp;
  const maxHp = (u as unknown as { maxHp?: number }).maxHp;
  if (hp != null && maxHp != null && (hp < maxHp || selected)) {
    const sprReady = !!(UNIT_IMAGES[u.key] && (UNIT_IMAGES[u.key] as HTMLImageElement).complete && UNIT_ANCHORS[u.key]);
    const unitH = sprReady ? (UNIT_TARGET_H[u.key] ?? 46) : (mounted ? 52 : u.key === 'catapult' ? 44 : 46);
    const bw = mounted || u.key === 'catapult' ? 40 : 32;
    const bh = 5;
    const by = iy + 8 - unitH - 6;
    const s = Math.max(0, Math.min(1, hp / maxHp));
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(snap(ix - bw / 2), snap(by), bw, bh);
    ctx.fillStyle = u.owner === 'player' ? '#4ade80' : u.owner === 'enemy' ? '#ef4444' : '#facc15';
    ctx.fillRect(snap(ix - bw / 2) + 1, snap(by) + 1, Math.round((bw - 2) * s), bh - 2);
  }

  // ранг героя (⭐) над юнитами игрока, достигшими 2+ уровня
  const lvl = (u as unknown as { level?: number }).level;
  if (u.owner === 'player' && lvl && lvl >= 2) {
    const stars = lvl - 1; // ур.2 → 1 звезда … ур.5 → 4
    const sprReady = !!(UNIT_IMAGES[u.key] && (UNIT_IMAGES[u.key] as HTMLImageElement).complete && UNIT_ANCHORS[u.key]);
    const unitH = sprReady ? (UNIT_TARGET_H[u.key] ?? 46) : (mounted ? 52 : u.key === 'catapult' ? 44 : 46);
    const sy = iy + 8 - unitH - 14;
    ctx.font = '8px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const txt = '⭐'.repeat(Math.min(4, stars));
    ctx.fillText(txt, ix, snap(sy));
  }
}

// ── ноги пешего юнита ──
function drawLegs(ctx: CanvasRenderingContext2D, x: number, y: number, sw: number, col: string, step = 6) {
  px(ctx, x - 4, y - 9, 3, 11, col);
  px(ctx, x + 1, y - 9, 3, 11, col);
  // ступни с шагом
  px(ctx, x - 5 + sw * step, y, 5, 3, '#2a2a2a');
  px(ctx, x + 1 - sw * step, y, 5, 3, '#2a2a2a');
}

// ── гуманоид: крестьянин / ополченец / копейщик / лучник / монах ──
function drawHumanoid(ctx: CanvasRenderingContext2D, u: U, x: number, y: number, sw: number, atk: number, _time: number, t: typeof TEAM.player) {
  const f = u.face;
  // роба монаха скрывает ноги
  if (u.key === 'monk') {
    px(ctx, x - 3, y - 4, 3, 8, '#6b5230');
    px(ctx, x + 1, y - 4, 3, 8, '#6b5230');
    px(ctx, x - 4 + sw * 4, y, 4, 3, '#3a2d1c');
    px(ctx, x + 1 - sw * 4, y, 4, 3, '#3a2d1c');
  } else if (u.key === 'archer') {
    drawLegs(ctx, x, y, sw, '#4a4030');
  } else {
    drawLegs(ctx, x, y, sw, u.key === 'villager' ? '#5c4033' : '#3a3a3a');
  }

  if (u.key === 'monk') {
    // роба трапецией
    px(ctx, x - 9, y + 2, 18, 4, '#b45309');
    px(ctx, x - 8, y - 12, 16, 14, '#d97706');
    px(ctx, x - 8, y - 14, 16, 4, '#b45309');
    // капюшон
    cx(ctx, x, y - 19, 8, '#b45309');
    cx(ctx, x + f * 1, y - 17, 5, '#f0c8a0');
    px(ctx, x + f * 2, y - 19, 2, 2, '#2d1b0e');
    // посох с крестом
    const sx2 = x + f * 10;
    ln(ctx, sx2, y + 2, sx2, y - 22, 2.5, '#8a6d3b');
    px(ctx, sx2 - 4, y - 19, 8, 2.5, '#8a6d3b');
    if (atk > 0) {
      ctx.globalAlpha = atk * 0.8;
      cx(ctx, sx2, y - 20, 7, '#fde68a');
      cx(ctx, x, y - 14, 10, '#86efac');
      ctx.globalAlpha = 1;
    }
    return;
  }

  // тело
  if (u.key === 'villager') {
    px(ctx, x - 7, y - 13, 14, 15, '#b07520');
    px(ctx, x - 7, y - 4, 14, 3, '#5c3618');
    px(ctx, x - 2, y - 4, 4, 3, '#f6d47c');
    px(ctx, x - 7, y - 13, 14, 3, t.tunic); // командная накидка
  } else if (u.key === 'archer') {
    px(ctx, x - 7, y - 13, 14, 14, u.owner === 'player' ? '#15803d' : '#9a3412');
    px(ctx, x - 7, y - 13, 14, 3, u.owner === 'player' ? '#0f6930' : '#7c2d12');
    // колчан
    px(ctx, x - f * 8, y - 16, 4, 11, '#5c3618');
  } else {
    // броня
    const bc = u.key === 'spearman' ? t.tunicD : t.tunic;
    px(ctx, x - 8, y - 13, 16, 15, bc);
    px(ctx, x - 8, y - 13, 16, 3, t.tunic);
    // наплечники
    cx(ctx, x - 8, y - 12, 4, '#c7c7c7');
    cx(ctx, x + 8, y - 12, 4, '#c7c7c7');
    px(ctx, x - 8, y - 2, 16, 3, '#4a3115');
  }

  // голова
  if (u.key === 'villager') {
    cx(ctx, x, y - 20, 7, '#f0c8a0');
    px(ctx, x + f * 3, y - 21, 2, 2, '#2d1b0e');
    // шляпа
    cx(ctx, x, y - 24, 7, '#6b3a10');
    px(ctx, x - 9, y - 23, 18, 3, '#6b3a10');
  } else if (u.key === 'archer') {
    // капюшон с остриём
    cx(ctx, x, y - 20, 8, u.owner === 'player' ? '#0f6930' : '#7c2d12');
    px(ctx, x - f * 5 - 2, y - 27, 4, 6, u.owner === 'player' ? '#0f6930' : '#7c2d12');
    cx(ctx, x + f * 2, y - 18, 5, '#f0c8a0');
    px(ctx, x + f * 4, y - 19, 2, 2, '#2d1b0e');
  } else {
    cx(ctx, x, y - 20, 7, '#f0c8a0');
    // шлем
    cx(ctx, x, y - 22, 8, '#c0c0c0');
    px(ctx, x - 7, y - 24, 14, 3, '#8a8a8a');
    px(ctx, x - 1, y - 25, 3, 7, '#a0a0a0'); // наносник
    px(ctx, x - f * 3, y - 21, 2, 2, '#1c1917');
    px(ctx, x + f * 2 - 1, y - 21, 2, 2, '#1c1917');
    // султан
    px(ctx, x - 2, y - 31, 4, 4, t.plume);
    px(ctx, x - f * 6, y - 29, 5, 3, t.plume);
  }

  // груз на голове у крестьянина
  if (u.key === 'villager' && u.carry && u.carry.amt > 1) {
    const c = u.carry.type === 'wood' ? '#a16207' : u.carry.type === 'food' ? '#fb7185' : '#facc15';
    px(ctx, x - 4, y - 32, 8, 5, c);
  }

  // оружие
  const hx = x + f * 8, hy = y - 10;
  if (u.key === 'villager') {
    // топор/мотыга: замах при работе
    const a = -0.4 + atk * 1.4;
    const tx = hx + f * Math.cos(a) * 12, ty = hy + Math.sin(a) * 12 - 8;
    ln(ctx, hx, hy + 2, tx, ty, 3, '#78450f');
    px(ctx, tx - 3, ty - 3, 6, 5, '#b8b8b8');
  } else if (u.key === 'archer') {
    const bx = x + f * 12, by = y - 10;
    // дуга лука
    for (let i = 0; i <= 8; i++) {
      const a = -1.3 + (i / 8) * 2.6;
      px(ctx, bx + f * Math.cos(a) * 9, by + Math.sin(a) * 9, 2.5, 2.5, '#6b3a10');
    }
    // тетива (натянута при выстреле)
    const pull = atk * 5;
    ln(ctx, bx + f * Math.cos(-1.3) * 9, by + Math.sin(-1.3) * 9, bx - f * pull, by, 1.5, '#fef3c7');
    ln(ctx, bx + f * Math.cos(1.3) * 9, by + Math.sin(1.3) * 9, bx - f * pull, by, 1.5, '#fef3c7');
    // стрела
    if (atk > 0.25) ln(ctx, bx - f * pull, by, bx + f * 7, by, 2, '#8a6a3a');
  } else if (u.key === 'spearman') {
    // длинное копьё, укол при атаке
    const ext = 18 + atk * 10;
    ln(ctx, x - f * 2, y - 4, x + f * ext, y - 22, 3, '#8a5a2a');
    px(ctx, x + f * (ext + 2), y - 27, 3, 6, '#d6d3d1');
    // большой щит
    px(ctx, x - f * 16, y - 13, 7, 14, t.tunicD);
    px(ctx, x - f * 16, y - 13, 7, 3, '#f6d47c');
    px(ctx, x - f * 13, y - 8, 3, 3, '#f6d47c');
  } else {
    // меч ополченца: взмах
    const a = 0.9 - atk * 2.2;
    const tx = hx + f * Math.cos(a) * 15, ty = hy + Math.sin(a) * 15;
    ln(ctx, hx, hy + 2, tx, ty, 3.5, '#e8e8e8');
    px(ctx, hx - 3, hy + 1, 7, 3, '#f6d47c');
    // щит
    px(ctx, x - f * 15, y - 13, 7, 12, t.tunicD);
    px(ctx, x - f * 15, y - 13, 7, 2.5, '#f6d47c');
    px(ctx, x - f * 12, y - 8, 3, 3, '#f6d47c');
  }
}

// ── конь ──
function drawHorse(ctx: CanvasRenderingContext2D, u: U, x: number, y: number, sw: number, _time: number) {
  const blue = u.owner === 'player';
  const isCav = u.key === 'cavalry';
  const body = isCav ? (blue ? '#7c2d12' : '#155e75') : (blue ? '#4a1d8a' : '#6b1a1a');
  const light = isCav ? (blue ? '#9a3412' : '#0e7490') : (blue ? '#5c2da0' : '#7f2222');
  const dark = isCav ? (blue ? '#5c1f0c' : '#0c4a5e') : (blue ? '#351666' : '#501010');
  // ноги (4)
  const lp = sw * 5;
  px(ctx, x - 11, y - 6, 4, 10 + lp, dark);
  px(ctx, x - 4, y - 6, 4, 10 - lp, dark);
  px(ctx, x + 4, y - 6, 4, 10 + lp, dark);
  px(ctx, x + 9, y - 6, 4, 10 - lp, dark);
  // копыта
  px(ctx, x - 12 + lp, y + 2, 5, 3, '#241a12');
  px(ctx, x + 3 + lp, y + 2, 5, 3, '#241a12');
  px(ctx, x - 6 - lp, y + 2, 5, 3, '#241a12');
  px(ctx, x + 8 - lp, y + 2, 5, 3, '#241a12');
  // корпус
  cx(ctx, x, y - 12, 12, body);
  cx(ctx, x - u.face * 2, y - 13, 9, light);
  // шея + голова
  px(ctx, x + u.face * 10, y - 20, 6, 10, light);
  cx(ctx, x + u.face * 20, y - 17, 6, light);
  cx(ctx, x + u.face * 24, y - 14, 3, dark); // морда
  // уши
  px(ctx, x + u.face * 18, y - 25, 3, 5, dark);
  // глаз
  px(ctx, x + u.face * 20, y - 19, 2, 2, '#fff');
  // грива
  for (let i = 0; i < 4; i++) px(ctx, x + u.face * (8 + i * 2), y - 22 - i, 3, 4, dark);
  // хвост
  ln(ctx, x - u.face * 12, y - 14, x - u.face * 20, y - 8 + sw * 3, 4, dark);
  // седло
  cx(ctx, x - u.face * 2, y - 17, 6, '#5c3618');
}

// ── всадник ──
function drawRider(ctx: CanvasRenderingContext2D, u: U, x: number, y: number, _sw: number, atk: number, _time: number, t: typeof TEAM.player) {
  const f = u.face;
  const rx = x - f * 2, ry = y - 18;
  // тело в броне
  px(ctx, rx - 6, ry - 8, 12, 13, '#c0c0c0');
  px(ctx, rx - 6, ry - 2, 12, 5, t.tunic); // накидка
  cx(ctx, rx - 7, ry - 7, 3.5, '#9aa0a6');
  cx(ctx, rx + 7, ry - 7, 3.5, '#9aa0a6');
  // шлем
  cx(ctx, rx, ry - 13, 6, '#b0b0b0');
  px(ctx, rx - 5, ry - 15, 10, 3, '#888');
  px(ctx, rx - 2, ry - 21, 4, 5, t.plume);
  px(ctx, rx - f * 6, ry - 19, 5, 3, t.plume);
  // пика — таранный удар
  const ext = 20 + atk * 10;
  ln(ctx, rx + f * 4, ry - 8, rx + f * ext, ry - 14 - atk * 4, 3.5, '#78450f');
  px(ctx, rx + f * (ext + 2), ry - 15 - atk * 4, 3, 5, '#d6d3d1');
  // щит
  px(ctx, rx - f * 10, ry - 6, 5, 9, t.tunicD);
}

// ── скот: овца / корова / олень ──
function drawLivestock(ctx: CanvasRenderingContext2D, u: U, x: number, y: number, sw: number, bob: number) {
  const f = u.face;
  const lp = sw * 4;
  const deer = u.key === 'deer', cow = u.key === 'cow';
  y += bob * 0.5; // лёгкое покачивание при ходьбе/дыхании
  const bodyCol = deer ? '#b07d4f' : cow ? '#e8e2d5' : '#f4f1e8';
  const darkCol = deer ? '#8a5a34' : cow ? '#6b4a36' : '#d8d2c6';
  const legCol = deer ? '#8a5a34' : cow ? '#5b3d2c' : '#3f3a36';
  // ноги
  px(ctx, x - 9, y - 6, 3, 8 + lp, legCol);
  px(ctx, x - 2, y - 6, 3, 8 - lp, legCol);
  px(ctx, x + 4, y - 6, 3, 8 + lp, legCol);
  px(ctx, x + 9, y - 6, 3, 8 - lp, legCol);
  // корпус
  cx(ctx, x, y - 11, deer ? 8 : cow ? 11 : 9, bodyCol);
  // пятна у коровы
  if (cow) { px(ctx, x - 4, y - 13, 4, 4, darkCol); px(ctx, x + 3, y - 10, 4, 4, darkCol); px(ctx, x - 1, y - 15, 3, 3, darkCol); }
  // шерсть-комочки у овцы
  if (!deer && !cow) { cx(ctx, x - 5, y - 13, 4, '#fbf9f4'); cx(ctx, x + 5, y - 13, 4, '#fbf9f4'); }
  // голова
  cx(ctx, x + f * 14, y - (deer ? 14 : 12), deer ? 5 : 6, bodyCol);
  px(ctx, x + f * 19, y - (deer ? 12 : 10), 2, 2, '#2a2a2a');
  // уши
  px(ctx, x + f * 12, y - (deer ? 19 : 17), 3, 4, darkCol);
  px(ctx, x + f * 17, y - (deer ? 19 : 17), 3, 4, darkCol);
  // рога у оленя
  if (deer) {
    ln(ctx, x + f * 13, y - 18, x + f * 10, y - 26, 3, '#7a5230');
    ln(ctx, x + f * 17, y - 18, x + f * 20, y - 26, 3, '#7a5230');
  }
  // хвостик
  cx(ctx, x - f * 12, y - 13, 2.5, darkCol);
}

// ── волк ──
function drawWolf(ctx: CanvasRenderingContext2D, u: U, x: number, y: number, sw: number, time: number) {
  // 4 лапы
  const lp = sw * 5;
  px(ctx, x - 10, y - 6, 3.5, 9 + lp, '#4b5563');
  px(ctx, x - 3, y - 6, 3.5, 9 - lp, '#4b5563');
  px(ctx, x + 4, y - 6, 3.5, 9 + lp, '#4b5563');
  px(ctx, x + 9, y - 6, 3.5, 9 - lp, '#4b5563');
  // корпус
  cx(ctx, x, y - 10, 11, '#7a7e85');
  cx(ctx, x - u.face * 2, y - 9, 7, '#9ca3af');
  // голова
  cx(ctx, x + u.face * 15, y - 12, 6, '#5b5f66');
  // уши
  px(ctx, x + u.face * 12, y - 20, 3, 6, '#4b5563');
  px(ctx, x + u.face * 17, y - 20, 3, 6, '#4b5563');
  // морда
  cx(ctx, x + u.face * 20, y - 10, 3, '#6b7280');
  px(ctx, x + u.face * 22, y - 10, 2, 2, '#1f2937');
  // глаза
  px(ctx, x + u.face * 16, y - 14, 2.5, 2.5, '#fbbf24');
  // хвост
  ln(ctx, x - u.face * 12, y - 12, x - u.face * 20, y - 18 + Math.sin(time * 3) * 2, 4, '#5b5f66');
}

// ── катапульта ──
function drawCatapult(ctx: CanvasRenderingContext2D, u: U, x: number, y: number, _sw: number, _time: number) {
  const f = u.face;
  const move = moving(u);
  const wob = move ? Math.sin(u.anim) * 1.5 : 0;
  // большие колёса со спицами
  for (const wx of [-12, 12]) {
    const cy0 = y + 6;
    cx(ctx, x + wx + wob, cy0, 8, '#2e1a06');
    cx(ctx, x + wx + wob, cy0, 6, '#4a2c10');
    cx(ctx, x + wx + wob, cy0, 2.5, '#a8824a');
    const rot = move ? u.anim * f : 0;
    for (let i = 0; i < 4; i++) {
      const a = rot + i * Math.PI / 2;
      ln(ctx, x + wx + wob, cy0, x + wx + wob + Math.cos(a) * 6, cy0 + Math.sin(a) * 6, 2, '#c9a05c');
    }
  }
  // рама: широкое основание-рама между колёсами
  px(ctx, x - 16 + wob, y - 2, 32, 7, '#5c3f1c');
  px(ctx, x - 16 + wob, y - 2, 32, 2, '#7a5628');
  // диагональные упоры (А-образная стойка)
  ln(ctx, x - 8 + wob, y - 2, x - 2 + wob, y - 20, 5, '#6b4a22');
  ln(ctx, x + 8 + wob, y - 2, x + 2 + wob, y - 20, 5, '#6b4a22');
  px(ctx, x - 4 + wob, y - 22, 8, 5, '#4a3115'); // ось рычага
  // метательный рычаг: взведён назад (вверх) → бросок вперёд-вниз
  const ang = -1.5 + u.atkAnim * 2.6;
  const ax = x + wob, ay = y - 20;
  const tx = ax + f * Math.cos(ang) * 26, ty = ay + Math.sin(ang) * 26;
  ln(ctx, ax, ay, tx, ty, 5, '#8a5a2a');
  // ковш с камнем
  cx(ctx, tx, ty, 5, '#3f2a14');
  if (u.atkAnim < 0.45) {
    cx(ctx, tx - f * 2, ty - 4, 4.5, '#8a8580');
    cx(ctx, tx - f * 3, ty - 5, 2, '#b8b3ac');
  }
  // противовес на заднем конце
  cx(ctx, ax - f * Math.cos(ang) * 8, ay - Math.sin(ang) * 8, 5, '#57534e');
}
