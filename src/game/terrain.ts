// ── Процедурный БЕСКОНЕЧНЫЙ рельеф: биомы (вода, поля, леса, пустыни, горы, холмы, озёра, реки) ──
// Чисто визуальный слой + карта проходимости для спавна. Работает для ЛЮБЫХ координат
// (детерминированный value-noise на целочисленном хэше решётки, без границ карты).
// Контент (ресурсы/животные/племена) генерится лениво по чанкам — см. engine.ts.

export type TerrainClass =
  | 'deep'      // глубокая вода
  | 'water'     // река/озеро
  | 'sand'      // берег
  | 'field'     // поля/луга (открытый грунт)
  | 'grass'     // обычная трава
  | 'forest'    // лес (тёмная трава; деревья ставятся чанками)
  | 'desert'    // пустыня
  | 'hill'      // холмы (предгорья)
  | 'mountain'; // горы (непроходимы для спавна контента)

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

// целочисленный хэш → 0..1 (бесконечная решётка, отрицательные координаты тоже)
function hash2(ix: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// value-noise 0..1 в мировой точке (wx, wz), размер ячейки cell
function valueNoise(wx: number, wz: number, cell: number, seed: number): number {
  const gx = wx / cell, gz = wz / cell;
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const fx = smooth(gx - x0), fz = smooth(gz - z0);
  const v00 = hash2(x0, z0, seed), v10 = hash2(x0 + 1, z0, seed);
  const v01 = hash2(x0, z0 + 1, seed), v11 = hash2(x0 + 1, z0 + 1, seed);
  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fz);
}
// фрактальный шум (несколько октав)
function fbm(wx: number, wz: number, seed: number, base: number, oct = 4): number {
  let sum = 0, amp = 0.5, norm = 0, freq = 1;
  for (let i = 0; i < oct; i++) {
    sum += amp * valueNoise(wx, wz, base / freq, seed + i * 101);
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

export class Terrain {
  readonly seed: number;
  // безопасные зоны (базы/старты) — гарантированная суша-луг без гор/воды
  safe: { x: number; y: number; r: number }[] = [];

  constructor(seed?: number) {
    this.seed = seed != null ? seed >>> 0 : ((Math.random() * 1e9) | 0);
  }

  addSafe(x: number, y: number, radius: number) { this.safe.push({ x, y, r: radius }); }
  private inSafe(x: number, y: number): boolean {
    for (const s of this.safe) {
      const dx = x - s.x, dy = y - s.y;
      if (dx * dx + dy * dy < s.r * s.r) return true;
    }
    return false;
  }

  // базовые поля шума
  private elev(wx: number, wz: number) { return fbm(wx, wz, this.seed, 720, 5); }
  private moist(wx: number, wz: number) { return fbm(wx, wz, this.seed + 17, 620, 4); }
  private temp(wx: number, wz: number) { return fbm(wx, wz, this.seed + 31, 1500, 3); }
  // долины рек: узкие извилистые ленты понижения
  private river(wx: number, wz: number) {
    const v = fbm(wx, wz, this.seed + 53, 1150, 3);
    // «гребень» v≈0.5 → узкая долина реки (две системы рек разной частотой)
    const m1 = 1 - Math.min(1, Math.abs(v - 0.5) * 16);
    const v2 = fbm(wx + 9000, wz - 4000, this.seed + 71, 1700, 3);
    const m2 = 1 - Math.min(1, Math.abs(v2 - 0.55) * 20);
    return Math.max(m1, m2);
  }

  private rawClass(wx: number, wz: number): TerrainClass {
    const e = this.elev(wx, wz);
    const m = this.moist(wx, wz);
    const t = this.temp(wx, wz);
    const r = this.river(wx, wz);
    // горы — самые высокие области; холмы — чуть ниже
    if (e > 0.78) return 'mountain';
    if (e > 0.68) return 'hill';
    // вода: низины (озёра/моря) или долины рек
    const waterLine = 0.13;
    if (r > 0.85 || e < 0.07) return 'deep';
    if (e < waterLine || r > 0.62) return 'water';
    if (e < waterLine + 0.05) return 'sand';
    // суша: биом по влажности/температуре
    if (t > 0.64 && m < 0.44) return 'desert';       // жарко и сухо — пустыня
    if (m > 0.66) return 'forest';                    // влажно — лес
    if (e > 0.58 && m < 0.52) return 'field';         // сухие возвышенности — поля/луга
    return 'grass';
  }

  /** класс террейна в мировой точке (с учётом безопасных зон) */
  classAt(wx: number, wz: number): TerrainClass {
    if (this.inSafe(wx, wz)) return 'grass';
    return this.rawClass(wx, wz);
  }

  // кэш ступеней высоты (мир бесконечный — детерминированно, периодически чистим)
  private hCache = new Map<string, number>();
  /**
   * Высота рельефа в СТУПЕНЯХ (лесенка): 0 — равнина/вода/базы, выше — холмы и горы.
   * Чисто визуальный слой: мир/движение остаются плоскими, плитки лишь поднимаются по вертикали.
   */
  heightAt(wx: number, wz: number): number {
    const key = wx + ',' + wz;
    const cached = this.hCache.get(key);
    if (cached !== undefined) return cached;
    let h = 0;
    if (!this.inSafe(wx, wz)) {
      const e = this.elev(wx, wz);
      if (e >= 0.57) h = Math.max(0, Math.min(5, Math.round((e - 0.57) * 15)));
    }
    if (this.hCache.size > 60000) this.hCache.clear();
    this.hCache.set(key, h);
    return h;
  }

  /** можно ли ставить контент/ходить (горы и вода — нет для спавна ресурсов/животных) */
  isLand(wx: number, wz: number): boolean {
    if (this.inSafe(wx, wz)) return true;
    const c = this.rawClass(wx, wz);
    return c === 'grass' || c === 'forest' || c === 'field' || c === 'desert' || c === 'hill' || c === 'sand';
  }
  /** пригодно ли под строения/базы (ровная суша) */
  isBuildable(wx: number, wz: number): boolean {
    const c = this.classAt(wx, wz);
    return c === 'grass' || c === 'field' || c === 'forest' || c === 'sand';
  }

  // ── детерминированный ГПСЧ для чанка (одинаковый контент при повторном визите) ──
  chunkRand(cx: number, cz: number): () => number {
    const h = (cx * 73856093) ^ (cz * 19349663) ^ (this.seed * 83492791);
    return mulberry32(h >>> 0);
  }
}
