// ── Слой НЕПРЕРЫВНОЙ местности (прототип, ?dev=map) ─────────────────────────
//
// Зачем отдельный файл. Рельеф в игре уже процедурный (terrain.ts: высота,
// влажность, температура, русла — фрактальный шум), но РИСУЕТСЯ он гекс-
// мозаикой: каждый гекс — отдельный залитый полигон со своей ступенью высоты.
// Оттого карта читается как «сделанная из гексов», хотя местность под ней
// непрерывная. Здесь — второй способ отрисовки той же самой местности:
// непрерывная гипсометрия с притенением склонов, руслами и берегом. Гекс-сетка
// при желании рисуется поверх тонкими линиями — как рамка выделения, а не как
// материал карты (тот же принцип, что в Civ V: тайлы гексагональные, а рельеф
// сплошной).
//
// Боевой рендер этот файл не трогает: он нужен, чтобы сравнить два взгляда на
// одну карту и выбрать глазами.
import { HS } from './iso';
import type { Terrain } from './terrain';

/** Сетка полей местности по прямоугольнику мира. Считается один раз на вид. */
export interface ReliefField {
  x0: number; y0: number;      // левый верхний угол области в мировых единицах
  step: number;                // шаг сетки в мировых единицах
  nx: number; ny: number;      // узлов по осям
  elev: Float32Array;
  moist: Float32Array;
  river: Float32Array;
}

export function buildField(t: Terrain, x0: number, y0: number, w: number, h: number, step: number): ReliefField {
  const nx = Math.max(2, Math.ceil(w / step) + 2), ny = Math.max(2, Math.ceil(h / step) + 2);
  const elev = new Float32Array(nx * ny), moist = new Float32Array(nx * ny), river = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const wx = x0 + i * step, wy = y0 + j * step;
      const k = j * nx + i;
      elev[k] = t.elevAt(wx, wy);
      moist[k] = t.moistAt(wx, wy);
      river[k] = t.riverAt(wx, wy);
    }
  }
  return { x0, y0, step, nx, ny, elev, moist, river };
}

/** Билинейная выборка поля в мировой точке (шум на каждый пиксель считать нельзя — медленно). */
function sample(a: Float32Array, f: ReliefField, wx: number, wy: number): number {
  const gx = (wx - f.x0) / f.step, gy = (wy - f.y0) / f.step;
  let i0 = Math.floor(gx), j0 = Math.floor(gy);
  const tx = gx - i0, ty = gy - j0;
  i0 = Math.max(0, Math.min(f.nx - 2, i0)); j0 = Math.max(0, Math.min(f.ny - 2, j0));
  const k00 = j0 * f.nx + i0, k10 = k00 + 1, k01 = k00 + f.nx, k11 = k01 + 1;
  return (a[k00] * (1 - tx) + a[k10] * tx) * (1 - ty) + (a[k01] * (1 - tx) + a[k11] * tx) * ty;
}
const elevAt = (f: ReliefField, wx: number, wy: number) => sample(f.elev, f, wx, wy);
const moistAt = (f: ReliefField, wx: number, wy: number) => sample(f.moist, f, wx, wy);
const riverAt = (f: ReliefField, wx: number, wy: number) => sample(f.river, f, wx, wy);

/** То же поле, но из произвольного источника (например, нового worldgen). */
export interface HeightSource {
  height(wx: number, wy: number): number;
  moisture(wx: number, wy: number): number;
  river(wx: number, wy: number): number;
}
export function buildFieldFrom(src: HeightSource, x0: number, y0: number, w: number, h: number, step: number): ReliefField {
  const nx = Math.max(2, Math.ceil(w / step) + 2), ny = Math.max(2, Math.ceil(h / step) + 2);
  const elev = new Float32Array(nx * ny), moist = new Float32Array(nx * ny), river = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const wx = x0 + i * step, wy = y0 + j * step, k = j * nx + i;
      elev[k] = src.height(wx, wy); moist[k] = src.moisture(wx, wy); river[k] = src.river(wx, wy);
    }
  }
  return { x0, y0, step, nx, ny, elev, moist, river };
}

export type ReliefMode = 'relief' | 'biome' | 'height';

/** Гипсометрическая окраска: от глубокой воды до снега. Палитра — степная, близкая к игровой. */
export function reliefColor(e: number, m: number, r: number, sea: number): [number, number, number] {
  if (e < sea - 0.05) return [11, 40, 56];                 // глубина
  if (e < sea) return [24, 78, 100];                       // вода
  if (e < sea + 0.025) return [198, 176, 128];             // берег, песок
  if (r > 0.62) return [44, 118, 132];                     // русло реки
  if (e > 0.90) return [235, 241, 246];                    // снег на вершинах
  if (e > 0.84) return [176, 172, 165];                    // скалы
  if (e > 0.78) return [116, 108, 98];                     // горы
  if (e > 0.68) return [138, 126, 92];                     // холмы, предгорья
  if (m > 0.66) return e > 0.60 ? [58, 96, 54] : [72, 112, 62];   // лес
  if (m < 0.38) return [201, 172, 112];                    // сухая степь, солончак
  return [128, 148, 82];                                   // степь
}

/** Цвет биома ровно по правилам terrain.classAt — чтобы видеть игровую логику, а не только высоту. */
const BIOME_RGB: Record<string, [number, number, number]> = {
  deep: [11, 40, 56], water: [24, 78, 100], sand: [198, 176, 128],
  field: [154, 160, 85], grass: [128, 148, 82], forest: [63, 107, 58],
  desert: [201, 172, 112], hill: [138, 126, 92], mountain: [116, 108, 98],
};
export function biomeRGB(c: string): [number, number, number] { return BIOME_RGB[c] ?? [128, 148, 82]; }

/**
 * Притенение склона: свет падает с северо-запада, поэтому склоны к нему светлее.
 * Возвращает множитель яркости 0.78…1.22.
 */
function shadeAt(f: ReliefField, wx: number, wy: number, gain: number): number {
  const d = f.step;
  const ex = elevAt(f, wx + d, wy) - elevAt(f, wx - d, wy);
  const ey = elevAt(f, wx, wy + d) - elevAt(f, wx, wy - d);
  // свет (-0.62, -0.78); высота в долях единицы — усиливаем, чтобы тени были видны
  const s = (-0.62 * ex - 0.78 * ey) * gain;
  return Math.max(0.78, Math.min(1.22, 1 + s));
}

export interface ReliefView { wx: number; wy: number; perPx: number; w: number; h: number; }

/** Нарисовать местность сверху (вид карты, без изометрии) в левый верхний угол канваса. */
export function drawReliefTop(
  ctx: CanvasRenderingContext2D, f: ReliefField, t: { classAt(x: number, y: number): string }, v: ReliefView,
  mode: ReliefMode, sea: number, shade = true,
) {
  const img = ctx.createImageData(v.w, v.h);
  const d = img.data;
  const gain = 26 / Math.max(2, v.perPx);   // чем крупнее масштаб, тем мягче тени
  for (let y = 0; y < v.h; y++) {
    for (let x = 0; x < v.w; x++) {
      const wx = v.wx + x * v.perPx, wy = v.wy + y * v.perPx;
      const e = elevAt(f, wx, wy), m = moistAt(f, wx, wy), r = riverAt(f, wx, wy);
      let c: [number, number, number];
      if (mode === 'biome') c = biomeRGB(t.classAt(wx, wy));
      else if (mode === 'height') { const g = Math.round(Math.max(0, Math.min(1, (e - sea) / (1 - sea))) * 255); c = [g, g, g]; }
      else c = reliefColor(e, m, r, sea);
      const k = shade && mode !== 'height' ? shadeAt(f, wx, wy, gain) : 1;
      const i = (y * v.w + x) * 4;
      d[i] = c[0] * k; d[i + 1] = c[1] * k; d[i + 2] = c[2] * k; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Гекс-сетка поверх местности: только линии, без заливки — «сетка выделения». */
export function drawHexGridTop(ctx: CanvasRenderingContext2D, v: ReliefView, color = 'rgba(255,255,255,0.16)', lw = 1) {
  // flat-top гекс: центр (cx,cy), вершины на радиусе HS под 0°,60°,…,300°
  const pts: [number, number][] = [];
  for (let k = 0; k < 6; k++) pts.push([HS * Math.cos((k * Math.PI) / 3), HS * Math.sin((k * Math.PI) / 3)]);
  const stepX = HS * 1.5, stepY = HS * Math.sqrt(3);
  // диапазон аксиальных координат, попадающих в вид
  const q0 = Math.floor((v.wx - HS) / stepX) - 1, q1 = Math.ceil((v.wx + v.w * v.perPx) / stepX) + 1;
  const r0 = Math.floor((v.wy - stepY) / stepY) - 1, r1 = Math.ceil((v.wy + v.h * v.perPx) / stepY) + 1;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  ctx.beginPath();
  let n = 0;
  for (let q = q0; q <= q1; q++) {
    for (let r = r0; r <= r1; r++) {
      const cx = stepX * q, cy = stepY * (q / 2 + r);
      const px = (cx - v.wx) / v.perPx, py = (cy - v.wy) / v.perPx;
      if (px < -HS * 2 || py < -HS * 2 || px > v.w + HS * 2 || py > v.h + HS * 2) continue;
      // рисуем только три «передних» ребра — так сетка не превращается в паутину
      for (let k = 0; k < 3; k++) {
        const a = pts[k], b = pts[(k + 1) % 6];
        ctx.moveTo(px + a[0] / v.perPx, py + a[1] / v.perPx);
        ctx.lineTo(px + b[0] / v.perPx, py + b[1] / v.perPx);
      }
      n++;
      if (n > 40000) break;             // защита от бешеного масштаба
    }
  }
  ctx.stroke();
  ctx.restore();
}
