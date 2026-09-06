// ── Процедурный рельеф карты: холмы (elevation), озёра и реки (water) ──
// Чисто визуальный слой: тайлы травы/холма/воды выбираются по детерминированному
// шуму с сидом. На проходимость не влияет (вода — декоративная), но спавн ресурсов
// и животных генерируется на «суше», чтобы стада не стояли в озёрах.
import { WORLD } from './config';

// детерминированный ГПСЧ (mulberry32)
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise2D(rand: () => number, grid: number) {
  // сетка случайных градиентных значений с завёрткой
  const cols = grid + 2, rows = grid + 2;
  const v: number[] = new Array(cols * rows);
  for (let i = 0; i < v.length; i++) v[i] = rand();
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const gx = x * grid, gy = y * grid;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = smooth(gx - x0), fy = smooth(gy - y0);
    const at = (ix: number, iy: number) => v[((iy % rows) + rows) % rows * cols + (((ix % cols) + cols) % cols)];
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

export type TerrainClass = 'water' | 'hill' | 'grass';

export class Terrain {
  private elev: (x: number, y: number) => number;
  private moist: (x: number, y: number) => number;
  readonly seed: number;
  // безопасные зоны вокруг баз (суша, без рельефа)
  safe: { x: number; y: number; r: number }[] = [];

  constructor(seed: number) {
    this.seed = seed >>> 0;
    const r = mulberry32(this.seed);
    this.elev = makeNoise2D(r, 6);
    this.moist = makeNoise2D(r, 5);
  }

  addSafe(x: number, y: number, radius: number) { this.safe.push({ x, y, r: radius }); }

  private inSafe(x: number, y: number): boolean {
    for (const s of this.safe) {
      const dx = x - s.x, dy = y - s.y;
      if (dx * dx + dy * dy < s.r * s.r) return true;
    }
    return false;
  }

  /** класс террейна в мировой точке (центр тайла) */
  at(wx: number, wy: number): TerrainClass {
    const nx = wx / WORLD.w, ny = wy / WORLD.h;
    const e = this.elev(nx, ny);
    const m = this.moist(nx, ny);
    // холмы — верхние значения elevation
    if (e > 0.80) return 'hill';
    // озёра — влажные низины
    let water = m > 0.78 && e < 0.66;
    // реки: две извилистые ленты через карту (sin-меандр от координаты вдоль течения)
    const river = (cx: number, amp: number, freq: number, phase: number, width: number) => {
      const cxr = cx * WORLD.w;
      const bend = Math.sin(wy * freq + phase) * amp * WORLD.h;
      return Math.abs(wx - (cxr + bend)) < width;
    };
    if (river(0.30, 0.10, 0.0021, this.seed * 0.0007, 46)) water = true;
    if (river(0.70, 0.09, 0.0017, this.seed * 0.0011 + 2.0, 46)) water = true;
    if (water) return 'water';
    return 'grass';
  }

  /** то же, но базы всегда на суше/траве */
  classAt(wx: number, wy: number): TerrainClass {
    if (this.inSafe(wx, wy)) return 'grass';
    return this.at(wx, wy);
  }

  /** суша ли (для спавна ресурсов/животных) — с учётом безопасных зон */
  isLand(wx: number, wy: number): boolean {
    if (this.inSafe(wx, wy)) return true;
    return this.at(wx, wy) !== 'water';
  }

  /** высота рельефа 0..1 (для боковых граней холмов в рендере) */
  heightAt(wx: number, wy: number): number {
    if (this.inSafe(wx, wy)) return 0;
    const nx = wx / WORLD.w, ny = wy / WORLD.h;
    const e = this.elev(nx, ny);
    return e > 0.80 ? Math.min(1, (e - 0.80) / 0.20) : 0;
  }
}
