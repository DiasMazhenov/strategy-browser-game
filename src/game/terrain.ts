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

  /**
   * СЫРАЯ высота рельефа в СТУПЕНЯХ (0..5) от гладкого крупномасштабного шума —
   * БЕЗ лимита склонов. Вода/берег/базы = 0 (плоский уровень). Высота чисто
   * визуальная: мир/движение плоские, плитки лишь поднимаются лесенкой.
   * Финальная выровненная высота (перепад соседей ≤ 1) строится в reliefGrid().
   */
  private rawRelief(wx: number, wz: number): number {
    if (this.inSafe(wx, wz)) return 0;
    const c = this.rawClass(wx, wz);
    if (c === 'water' || c === 'deep' || c === 'sand') return 0; // вода и берег — плоские
    // гладкий рельеф: только 3 низкочастотные октавы на крупной ячейке 900 (без дёрганья)
    const rv = fbm(wx, wz, this.seed, 900, 3);
    let L = (rv - 0.46) / 0.34;
    L = L < 0 ? 0 : L > 1 ? 1 : L;
    return Math.round(L * 5);
  }

  /**
   * Построить сетку ступеней высоты для прямоугольника видимых клеток.
   * Два прохода (сверху-слева и снизу-справа) делают высоту = min(сырая, расстояние
   * до любой низины/воды) ⇒ соседние плитки отличаются максимум на 1 ступень —
   * подъём идёт ПЛАВНОЙ лесенкой, без резких обрывов. Возвращает функцию (wx,wy)→ступень.
   */
  reliefGrid(wx0: number, wz0: number, wx1: number, wz1: number, S = 32): (x: number, y: number) => number {
    const gx0 = Math.floor(wx0 / S), gx1 = Math.ceil(wx1 / S);
    const gz0 = Math.floor(wz0 / S), gz1 = Math.ceil(wz1 / S);
    const gw = gx1 - gx0 + 1, gh = gz1 - gz0 + 1;
    const raw = new Int16Array(gw * gh);
    for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) {
      raw[r * gw + c] = this.rawRelief((gx0 + c) * S, (gz0 + r) * S);
    }
    const BIG = 99;
    const dist = new Int16Array(gw * gh).fill(BIG);
    // проход 1: слева-сверху
    for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) {
      const i = r * gw + c;
      if (raw[i] === 0) { dist[i] = 0; continue; }
      let v = dist[i];
      if (c > 0) v = Math.min(v, dist[i - 1] + 1);
      if (r > 0) v = Math.min(v, dist[i - gw] + 1);
      dist[i] = v;
    }
    // проход 2: справа-снизу
    for (let r = gh - 1; r >= 0; r--) for (let c = gw - 1; c >= 0; c--) {
      const i = r * gw + c;
      if (raw[i] === 0) { dist[i] = 0; continue; }
      let v = dist[i];
      if (c < gw - 1) v = Math.min(v, dist[i + 1] + 1);
      if (r < gh - 1) v = Math.min(v, dist[i + gw] + 1);
      dist[i] = v;
    }
    return (x: number, y: number) => {
      const c = Math.round(x / S) - gx0, r = Math.round(y / S) - gz0;
      if (c < 0 || c >= gw || r < 0 || r >= gh) return 0;
      return Math.max(0, Math.min(raw[r * gw + c], dist[r * gw + c]));
    };
  }

  /**
   * ГЕКСАГОНАЛЬНАЯ сетка ступеней рельефа для видимой области (изо-гексы).
   * Строит прямоугольник аксиальных ячеек (q,r), покрывающий мировой прямоугольник
   * [wx0,wx1]×[wy0,wy1] с запасом pad ячеек, выравнивает высоты distance-transform'ом
   * по 6 соседям (перепад соседей ≤ 1 — плавная лесенка). Возвращает функции:
   *   at(q,r)  — ступень 0..5 в ячейке;
   *   world(q,r) — мировые координаты ЦЕНТРА гекса (wx,wy);
   *   hAtWorld(wx,wy) — ступень в гексе, которому принадлежит мировая точка.
   */
  reliefGridHex(wx0: number, wy0: number, wx1: number, wy1: number, pad = 8) {
    // изо-экраны углов → аксиальные дробные координаты → целочисленные границы
    const s2h = (sx: number, sy: number) => {
      const q = sx / 26;                       // HQX
      const r = sy / (16 * Math.sqrt(3)) - q / 2; // HY, HQY
      return [q, r];
    };
    const corners = [
      s2h(wx0 - wy0, (wx0 + wy0) * 0.5),
      s2h(wx1 - wy0, (wx1 + wy0) * 0.5),
      s2h(wx1 - wy1, (wx1 + wy1) * 0.5),
      s2h(wx0 - wy1, (wx0 + wy1) * 0.5),
    ];
    let q0 = Math.floor(Math.min(...corners.map(c => c[0]))) - pad;
    let q1 = Math.ceil(Math.max(...corners.map(c => c[0]))) + pad;
    let r0 = Math.floor(Math.min(...corners.map(c => c[1]))) - pad;
    let r1 = Math.ceil(Math.max(...corners.map(c => c[1]))) + pad;
    const W = q1 - q0 + 1, H = r1 - r0 + 1;
    const idx = (q: number, r: number) => (r - r0) * W + (q - q0);
    // мир → изо-экран (дублирует toIso, чтобы не тянуть зависимость iso↔terrain)
    const worldAt = (q: number, r: number): [number, number] => {
      const ix = 26 * q, iy = (16 * Math.sqrt(3) / 2) * q + 16 * Math.sqrt(3) * r;
      const wx = ix / 2 + iy, wy = iy - ix / 2;
      return [wx, wy];
    };
    const raw = new Int16Array(W * H);
    for (let r = r0; r <= r1; r++) for (let q = q0; q <= q1; q++) {
      const [wx, wy] = worldAt(q, r);
      raw[idx(q, r)] = this.rawRelief(wx, wy);
    }
    // distance-transform по 6 соседям: высота ≤ расстояние до любой низины
    const dist = new Int16Array(W * H).fill(99);
    const dat = (q: number, r: number) =>
      q < q0 || q > q1 || r < r0 || r > r1 ? 99 : dist[idx(q, r)];
    // Chamfer distance transform по гекс-сетке (6 соседей): два прохода —
    // прямой (смотрим трёх «предыдущих» соседей) и обратный (трёх «последующих»).
    // Высота ≤ расстояние до низины ⇒ перепад соседей ≤ 1, подъём плавной лесенкой.
    for (let r = r0; r <= r1; r++) for (let q = q0; q <= q1; q++) {
      const i = idx(q, r);
      if (raw[i] === 0) { dist[i] = 0; continue; }
      let v = dist[i];
      for (const [dq, dr] of <[number, number][]>[[-1, 0], [0, -1], [1, -1]]) {
        const n = dat(q + dq, r + dr);
        if (n + 1 < v) v = n + 1;
      }
      dist[i] = v;
    }
    for (let r = r1; r >= r0; r--) for (let q = q1; q >= q0; q--) {
      const i = idx(q, r);
      if (raw[i] === 0) { dist[i] = 0; continue; }
      let v = dist[i];
      for (const [dq, dr] of <[number, number][]>[[1, 0], [0, 1], [-1, 1]]) {
        const n = dat(q + dq, r + dr);
        if (n + 1 < v) v = n + 1;
      }
      dist[i] = v;
    }
    const hAt = (q: number, r: number) => {
      if (q < q0 || q > q1 || r < r0 || r > r1) return 0;
      const i = idx(q, r);
      return Math.max(0, Math.min(raw[i], dist[i]));
    };
    return {
      q0, q1, r0, r1, worldAt,
      at: hAt,
      hAtWorld: (wx: number, wy: number) => {
        const ix = wx - wy, iy = (wx + wy) * 0.5;
        let q = ix / 26;
        const r = iy / (16 * Math.sqrt(3)) - q / 2;
        q = Math.round(q); let rr = Math.round(r);
        // cube rounding
        const x = q, z = rr, y = -x - z;
        let rx = x, ry = y, rz = z;
        const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
        if (dx > dy && dx > dz) rx = -ry - rz;
        else if (dz > dy) rz = -rx - ry;
        rr = rz; q = rx;
        return hAt(q, rr);
      },
    };
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
