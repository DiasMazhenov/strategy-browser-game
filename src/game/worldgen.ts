// ── ГЕНЕРАТОР МЕСТНОСТИ (прототип, ?dev=map) ────────────────────────────────
//
// Почему отдельный файл. Старый terrain.ts считает высоту одним фрактальным
// шумом с базой 600 единиц при мире 48 000 — это 1/80 мира, то есть форма
// материка в него просто не помещается. Замер распределения (200×200 точек):
// min 0.074, медиана 0.506, p95 0.715 — узкий колокол вокруг середины. При
// уровне моря 0.13 под водой оказывается 0.1% карты, выше 0.78 (горы) — 1.1%.
// Итог: карта — сплошная равнина без морей и хребтов, и гекс-мозаика это только
// подчёркивает.
//
// Здесь высота собирается из трёх слоёв, как в генераторах карт Civ-типа:
//   континентность (база ~1/2 мира) + детали (~1/20) + шероховатость (~1/120),
// затем нормируется S-кривой, чтобы нужные доли земли уходили под воду и в горы.
// Реки, влажность и биомы считаются поверх высоты.
//
// Боевой terrain.ts этот файл не заменяет: прототип нужен, чтобы сравнить две
// местности глазами и только потом переносить выбранное в игру.
import { WORLD } from './config';

const W = WORLD.w, H = WORLD.h;

const hash2 = (ix: number, iy: number, seed: number): number => {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) % 1000000) / 1000000;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Value-noise, периодический по обеим осям (мир — тор, швы сходятся). */
function noise(wx: number, wy: number, cell: number, seed: number): number {
  const gx = wx / cell, gy = wy / cell;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = smooth(gx - x0), fy = smooth(gy - y0);
  const px = Math.max(1, Math.round(W / cell)), py = Math.max(1, Math.round(H / cell));
  const m = (i: number, p: number) => ((i % p) + p) % p;
  const a = m(x0, px), b = m(x0 + 1, px), c = m(y0, py), d = m(y0 + 1, py);
  const v00 = hash2(a, c, seed), v10 = hash2(b, c, seed), v01 = hash2(a, d, seed), v11 = hash2(b, d, seed);
  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
}

/** Фрактальный шум: oct октав с удвоением частоты и спадом амплитуды. */
function fbm(wx: number, wy: number, base: number, oct: number, seed: number): number {
  let sum = 0, amp = 0.5, norm = 0, cell = base;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise(wx, wy, cell, seed + i * 101);
    norm += amp; amp *= 0.5; cell /= 2;
  }
  return sum / norm;
}

/** S-кривая: растягивает середину распределения к краям, не срезая хвосты в плато. */
const sCurve = (v: number, k: number) => 1 / (1 + Math.exp(-k * (v - 0.5)));

export type WorldClass =
  | 'deep' | 'water' | 'sand' | 'field' | 'grass' | 'forest' | 'desert' | 'hill' | 'mountain';

export interface WorldgenOpts {
  /** уровень моря: ниже — воды меньше */
  sea: number;
  /** крутизна S-кривой: больше — материки выше и океаны глубже */
  gain: number;
  /** сколько карты под водой (цель, подбирается автоматически при autofit) */
  seaFit: number;
}

export class Worldgen {
  readonly seed: number;
  sea: number;
  gain: number;
  // Границы биомов — НЕ константы, а процентили фактического распределения.
  // Сумма шумов даёт колокол (центральная предельная теорема), поэтому жёсткие
  // пороги вроде «горы выше 0.86» на одном сиде не дают гор вовсе, а на другом
  // превращают в горы полкарты. Доли задаются здесь и держатся на любом сиде.
  hillLine = 0.72;
  mountLine = 0.86;
  /** уровень моря в шкале ДО S-кривой (обратное преобразование к this.sea) */
  rawSea = 0.5;
  forestLine = 0.64;
  desertLine = 0.40;

  constructor(seed: number, sea = 0.42, gain = 7) {
    this.seed = seed >>> 0;
    this.sea = sea;
    this.gain = gain;
  }

  // ── слои высоты ──
  /** континентность: самая низкая частота, задаёт материки и океаны */
  continent(wx: number, wy: number) { return fbm(wx, wy, W / 2, 2, this.seed); }
  /** детали: холмы, долины, крупные формы берега */
  detail(wx: number, wy: number) { return fbm(wx, wy, W / 16, 4, this.seed + 17); }
  /** шероховатость: мелкий рельеф, чтобы склоны не были «нарисованными» */
  rough(wx: number, wy: number) { return fbm(wx, wy, W / 96, 3, this.seed + 31); }

  /**
   * Итоговая высота 0..1 (после S-кривой).
   *
   * Детали и шероховатость работают ТОЛЬКО на суше: множитель land гасит их в
   * океане. Без этого мелкий шум рвал береговую линию на куски — замер давал
   * 345 отдельных областей воды при крупнейшей 12.9%, то есть не океан с
   * материком, а архипелаг из луж.
   */
  height(wx: number, wy: number): number {
    const c = this.continent(wx, wy);
    const d = this.detail(wx, wy), r = this.rough(wx, wy);
    const land = Math.min(1, Math.max(0, (c - (this.rawSea - 0.07)) / 0.16));
    const h = c * 0.70 + (d * 0.74 + r * 0.26) * 0.30 * (0.22 + 0.78 * land);
    return sCurve(h, this.gain);
  }

  /** Влажность: свой шум + «сыро» у воды и в низинах. */
  moisture(wx: number, wy: number): number {
    const base = fbm(wx, wy, W / 14, 3, this.seed + 53);
    const h = this.height(wx, wy);
    const nearWater = Math.max(0, 1 - (h - this.sea) * 6);      // у берега влажнее
    return Math.min(1, base * 0.78 + nearWater * 0.22);
  }

  /** Температура: широта (низ карты — юг, верх — север) + шум. */
  temp(wx: number, wy: number): number {
    const lat = 1 - Math.abs((wy / H) - 0.5) * 2;                 // 0 на краях, 1 в середине
    const t = fbm(wx, wy, W / 8, 2, this.seed + 71);
    return Math.min(1, Math.max(0, 0.28 + lat * 0.5 + (t - 0.5) * 0.3));
  }

  /**
   * Русла рек: «гребень» шума превращается в узкую извилистую ленту (ridged),
   * но течёт только по суше и только вниз по высоте — иначе реки висят на горах.
   */
  river(wx: number, wy: number): number {
    const v = fbm(wx, wy, W / 18, 3, this.seed + 97);
    const ridge = 1 - Math.min(1, Math.abs(v - 0.5) * 14);
    const h = this.height(wx, wy);
    if (h < this.sea + 0.02) return 0;                            // в море реки нет
    // чем выше, тем ýже русло: на горах река — ручей, в низине — полноводная
    return ridge * Math.min(1, 1.25 - (h - this.sea) * 1.6);
  }

  /** Класс местности — те же имена, что в terrain.ts, чтобы сравнить было просто. */
  classAt(wx: number, wy: number): WorldClass {
    const h = this.height(wx, wy);
    const m = this.moisture(wx, wy);
    const t = this.temp(wx, wy);
    const r = this.river(wx, wy);
    if (h < this.sea - 0.06) return 'deep';
    if (h < this.sea) return 'water';
    if (h < this.sea + 0.02) return 'sand';
    if (r > 0.55) return 'water';                                  // русло
    if (h > this.mountLine) return 'mountain';
    if (h > this.hillLine) return 'hill';
    if (t > 0.66 && m < 0.42) return 'desert';
    if (m > this.forestLine) return 'forest';
    if (m < this.desertLine) return 'field';
    return 'grass';
  }

  /**
   * Подобрать уровень моря под нужную долю воды (например 30% карты).
   * Процентили считаются по грубой сетке — это быстро и достаточно точно:
   * без подгонки порог зависит от сида, и на одном сиде карта выходит сухой,
   * на другом — сплошной океан.
   */
  /**
   * Подогнать все границы под нужные доли карты: воды 30%, холмов 18%, гор 7%,
   * лесов 22% суши. Считается по грубой сетке (96×96) — быстро и достаточно
   * точно; без этого порог зависит от сида, и на одном сиде карта выходит
   * сухой, на другом — сплошной океан.
   */
  fit(waterFrac = 0.30, hillFrac = 0.18, mountFrac = 0.07, forestFrac = 0.30, samples = 96): void {
    // Три прохода: уровень моря входит в саму формулу высоты (маска land),
    // поэтому после первой подгонки распределение меняется и порог надо
    // уточнить. Один проход давал 13.9% воды вместо заданных 30%.
    for (let it = 0; it < 3; it++) {
      const hs: number[] = [], ms: number[] = [];
      for (let i = 0; i < samples; i++) {
        for (let j = 0; j < samples; j++) {
          const wx = (i / samples) * W, wy = (j / samples) * H;
          hs.push(this.height(wx, wy));
          if (this.height(wx, wy) >= this.sea) ms.push(this.moisture(wx, wy));   // влажность — только по суше
        }
      }
      hs.sort((a, b) => a - b); ms.sort((a, b) => a - b);
      const q = (arr: number[], f: number) => (arr.length
        ? arr[Math.floor(Math.max(0, Math.min(1, f)) * (arr.length - 1))]
        : 0.5);
      this.sea = q(hs, waterFrac);
      this.rawSea = 0.5 - Math.log(1 / Math.max(1e-6, Math.min(1 - 1e-6, this.sea)) - 1) / this.gain;
      this.hillLine = q(hs, 1 - hillFrac);
      this.mountLine = q(hs, 1 - mountFrac);
      this.forestLine = q(ms, 1 - forestFrac);
      this.desertLine = q(ms, 0.30);
    }
  }
}
