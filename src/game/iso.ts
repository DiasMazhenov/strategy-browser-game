// ── Isometric coordinate helpers ──
// World uses "flat" coords (wx, wy). We convert to iso screen coords.
// Standard 2:1 isometric: toIso(wx,wy) = (wx - wy, (wx + wy) / 2)
//
// Земля вымощена ИЗОМЕТРИЧЕСКИМИ ШЕСТИУГОЛЬНИКАМИ — это плоский regular flat-top
// гекс в мире, спроецированный в 2:1 изо. Аксиальные координаты (q,r); мировой
// центр: wx=1.5·HS·q, wy=√3·HS·(q/2+r). 6 соседей, бесшовная мозаика (см. ниже).

export const TILE_STEP = 32; // world-space шаг привязки стен (мировые единицы)
export const TILE_W = 64;    // legacy-совместимость
export const TILE_H = 32;

// ── ИЗОМЕТРИЧЕСКАЯ гексагональная решётка ──
// Это ТОЧНАЯ 2:1-проекция обычного плоского шестиугольника, лежащего на земле.
// Берём regular flat-top гекс в МИРЕ (сторона HS), проецируем через toIso
// (ix=wx-wy, iy=(wx+wy)/2) — получаем широкую низкую изо-плитку (сплющивание 2:1,
// как ромбы зданий). Проекция сохраняет плоскую мозаику: соседние гексы делят
// спроецированные рёбра, щелей нет. Мировой центр ячейки (q,r):
//   wx = 1.5·HS·q,  wy = √3·HS·(q/2 + r)   (стандартная flat-top раскладка)
export const HS = 20;                    // мировая сторона гекса
const S3 = HS * Math.sqrt(3);            // √3·HS ≈ 34.64
export const HEX_PAD = 7;                // припуск канваса тайла (на перехлёст текстуры)
// полу-габариты спроецированного гекса в экране: ширина = 2·HS·(…), высота = 2·HS·(…)
const HW = HS * (1 + Math.sqrt(3)) / 2;  // ≈27.32 — полу-ширина
const HH = HS * (1 + Math.sqrt(3)) / 4;  // ≈13.66 — полу-высота
export const TILE_CW = Math.ceil(HW * 2) + HEX_PAD * 2;   // ≈69
export const TILE_CH = Math.ceil(HH * 2) + HEX_PAD * 2;   // ≈42
export const TCX = TILE_CW / 2;
export const TCY = TILE_CH / 2;
// спроецированные углы гекса относительно ЦЕНТРА (порядок — углы мира 0°,60°,…,300°).
// Три «передних» (нижних) ребра: 0→1, 1→2, 5→0 (обращены к камере); 2→3,3→4,4→5 — задние.
const pIso = (wx: number, wy: number): [number, number] => [wx - wy, (wx + wy) * 0.5];
export const HEX_PTS: [number, number][] = [
  pIso(HS, 0),                 // 0 (20, 10)
  pIso(HS / 2, S3 / 2),        // 1 (-7.32, 13.66)
  pIso(-HS / 2, S3 / 2),       // 2 (-27.32, 3.66)
  pIso(-HS, 0),                // 3 (-20, -10)
  pIso(-HS / 2, -S3 / 2),      // 4 (7.32, -13.66)
  pIso(HS / 2, -S3 / 2),       // 5 (27.32, -3.66)
];

/** World XY → isometric screen XY */
export function toIso(wx: number, wy: number): [number, number] {
  return [wx - wy, (wx + wy) * 0.5];
}

/** Isometric screen XY → world XY (inverse) */
export function fromIso(sx: number, sy: number): [number, number] {
  return [sx / 2 + sy, sy - sx / 2];
}

/** МИРОВЫЕ координаты центра гекса (q,r) — стандартная flat-top раскладка */
export function hexCenterWorld(q: number, r: number): [number, number] {
  return [HS * 1.5 * q, S3 * (q / 2 + r)];
}
/** изо-экранные координаты центра гекса (q,r) (мировой центр, спроецированный toIso) */
export function hexCenter(q: number, r: number): [number, number] {
  return pIso(hexCenterWorld(q, r)[0], hexCenterWorld(q, r)[1]);
}

/** изо-экран → дробные аксиальные координаты гекса (обратная проекция + flat-top world→hex) */
export function screenToHex(ix: number, iy: number): { q: number; r: number } {
  const wx = ix / 2 + iy, wy = iy - ix / 2;  // fromIso
  const q = (2 / 3 * wx) / HS;
  const r = (-1 / 3 * wx + (Math.sqrt(3) / 3) * wy) / HS;
  return { q, r };
}
/** округлить дробные аксиальные координаты до ближайшего гекса (cube rounding, flat-top) */
export function hexRound(q: number, r: number): [number, number] {
  const x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dz > dy) rz = -rx - ry;
  return [rx, rz];
}

/** контур шестиугольника с центром (cx,cy), масштаб s */
export function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s = 1) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const [px, py] = HEX_PTS[i];
    const x = cx + px * s, y = cy + py * s;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// ── Гекс-тайлы (AI-текстуры, обрезанные по форме изометрического шестиугольника) ──
// Квадратная бесшовная текстура 96×96 (gpt image, ужата скриптом process-hex.cjs)
// кладётся с лёгким случайным сдвигом и обрезается по гекс-контуру. Под текстурой —
// плотная заливка базового цвета биома, поэтому швов/щелей между гексами нет никогда.
import texGrass from '../assets/sprites/terrain/hex/grass.png';
import texDirt from '../assets/sprites/terrain/hex/dirt.png';
import texWater from '../assets/sprites/terrain/hex/water.png';
import texDeep from '../assets/sprites/terrain/hex/deep.png';
import texSand from '../assets/sprites/terrain/hex/sand.png';
import texDesert from '../assets/sprites/terrain/hex/desert.png';
import texField from '../assets/sprites/terrain/hex/field.png';
import texForest from '../assets/sprites/terrain/hex/forest.png';
import texMountain from '../assets/sprites/terrain/hex/mountain.png';
import texHill from '../assets/sprites/terrain/hex/hill.png';

export type HexKind =
  | 'grass' | 'dgrass' | 'dirt' | 'water' | 'deep' | 'sand'
  | 'desert' | 'field' | 'forest' | 'mountain' | 'hill';

const TEX_URL: Partial<Record<HexKind, string>> = {
  grass: texGrass, dirt: texDirt, water: texWater, deep: texDeep,
  sand: texSand, desert: texDesert, field: texField,
  forest: texForest, mountain: texMountain, hill: texHill,
};
// плотная подложка под текстуру (базовый цвет биома) — осветлена, чтобы земля
// не выглядела тёмной и юниты на ней читались
const BASE: Record<HexKind, string> = {
  grass: '#6fa84f', dgrass: '#5e9442', dirt: '#9c8157',
  water: '#4f93d4', deep: '#2f6bab', sand: '#e6d39a', desert: '#e0bd6f',
  field: '#b8c25e', forest: '#52843c', mountain: '#7e7c88', hill: '#92a062',
};
// ОСВЕТЛЯЮЩИЙ тинт поверх AI-текстуры (мягкая светлая вуаль — земли стали ярче);
// вода/глубина не трогаются. Тёмные тинты убраны — они «съедали» свет текстуры.
const TINT: Partial<Record<HexKind, string>> = {
  grass: 'rgba(190,225,150,0.10)',
  dgrass: 'rgba(170,215,135,0.08)',
  dirt: 'rgba(230,205,160,0.10)',
  sand: 'rgba(245,235,190,0.12)',
  desert: 'rgba(240,220,160,0.10)',
  field: 'rgba(220,230,150,0.10)',
  forest: 'rgba(150,200,120,0.08)',
  mountain: 'rgba(200,200,210,0.08)',
  hill: 'rgba(190,205,140,0.08)',
};

const tileCache = new Map<string, HTMLCanvasElement>();
const texCache = new Map<string, HTMLImageElement>();
function texImg(url: string): HTMLImageElement {
  let im = texCache.get(url);
  if (!im) { im = new Image(); im.src = url; texCache.set(url, im); }
  return im;
}

function getCachedTile(key: string, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  let c = tileCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = TILE_CW; c.height = TILE_CH;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  draw(g);
  tileCache.set(key, c);
  return c;
}

// детерминированный псевдослучайный сдвиг текстуры по варианту тайла
function jitter(variant: number): number {
  let h = (variant * 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h % 1000) / 1000;
}

/**
 * Гекс-тайл биома. variant — хэш клетки (вариативность/сдвиг текстуры).
 * Возвращает канвас TILE_CW×TILE_CH с гексом по центру (TCX,TCY).
 * Пока AI-текстура не догрузилась — тайл собран из процедурной подложки,
 * после загрузки канвас перестраивается с текстурой (кеш по ключу сбрасывается).
 */
export function getHexTile(kind: HexKind, variant: number): HTMLCanvasElement {
  const v = variant & 0xffff;
  const url = TEX_URL[kind];
  const im = url ? texImg(url) : null;
  const ready = !!im && im.complete && im.naturalWidth > 0;
  const key = kind + ':' + (v % 4) + ':' + (ready ? 1 : 0);
  const cached = tileCache.get(key);
  if (cached) return cached;

  const tile = getCachedTile(key, (g) => {
    // 1) плотная база биома по форме гекса
    hexPath(g, TCX, TCY);
    g.fillStyle = BASE[kind];
    g.fill();
    // 2) AI-текстура с лёгким сдвигом, обрезанная по гексу
    if (ready && im) {
      g.save();
      hexPath(g, TCX, TCY);
      g.clip();
      const tw = TILE_CW + 30, th = TILE_CH + 24;
      const jx = jitter(v) * 14 - 7, jy = jitter(v + 7) * 10 - 5;
      g.imageSmoothingEnabled = true; // мягкая усадка текстуры
      g.drawImage(im, TCX - tw / 2 + jx, TCY - th / 2 + jy, tw, th);
      g.imageSmoothingEnabled = false;
      g.restore();
    } else if (url) {
      // текстура ещё грузится — после загрузки вытесним незаполненные тайлы из кеша
      const him = im as HTMLImageElement & { _hexHooked?: boolean };
      if (!him._hexHooked) {
        him._hexHooked = true;
        him.onload = () => { for (const k of [...tileCache.keys()]) if (k.endsWith(':0')) tileCache.delete(k); };
      }
    }
    // 3) тинт биома поверх текстуры (тёмная трава/лес/камень)
    const tint = TINT[kind];
    if (tint) {
      g.save();
      hexPath(g, TCX, TCY);
      g.clip();
      g.fillStyle = tint;
      g.fillRect(0, 0, TILE_CW, TILE_CH);
      g.restore();
    }
    // 4) процедурная детализация только для тайлов без AI-текстуры (тёмная трава dgrass)
    //    осветлена: светлые вкрапления вместо тёмных пятен
    if (!url) {
      g.save();
      hexPath(g, TCX, TCY);
      g.clip();
      g.fillStyle = 'rgba(255,255,210,0.10)';
      for (let i = 0; i < 8; i++) {
        const px = TCX + ((i * 17 + v) % 44) - 22;
        const py = TCY + ((i * 13 + (v >> 3)) % 36) - 18;
        g.fillRect(px, py, 2, 2);
      }
      g.fillStyle = 'rgba(150,200,120,0.35)';
      for (let i = 0; i < 5; i++) {
        const px = TCX + ((i * 23 + v) % 40) - 20;
        const py = TCY + ((i * 11 + (v >> 4)) % 34) - 17;
        g.fillRect(px, py, 2, 1);
      }
      g.restore();
    }
    // 5) свет по верхним трём граням (дальний гребень), тень по нижним (обрыв к зрителю)
    const ridge = (a: number, b: number, color: string, w: number) => {
      g.strokeStyle = color; g.lineWidth = w; g.lineJoin = 'round';
      g.beginPath();
      const p0 = HEX_PTS[a], p1 = HEX_PTS[b];
      g.moveTo(TCX + p0[0], TCY + p0[1]);
      g.lineTo(TCX + p1[0], TCY + p1[1]);
      g.stroke();
    };
    // ЗАДНИЕ рёбра (дальний гребень) — светлый кант (ярче, чтобы земля читалась)
    ridge(2, 3, 'rgba(255,255,235,0.30)', 1.2);
    ridge(3, 4, 'rgba(255,255,235,0.30)', 1.2);
    ridge(4, 5, 'rgba(255,255,235,0.18)', 1);
    // ПЕРЕДНИЕ рёбра (обрыв к зрителю) — мягкая тень (ОСЛАБЛЕНА, земля стала светлее)
    ridge(0, 1, 'rgba(30,40,20,0.16)', 1.2);
    ridge(1, 2, 'rgba(30,40,20,0.16)', 1.2);
    ridge(5, 0, 'rgba(30,40,20,0.10)', 1);
  });
  return tile;
}

// ── Draw isometric box (building block) ──
// cx,cy = base center on screen. w,d = top-face pixel dims. h = pixel height.
export function isoBox(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, d: number, h: number, topColor: string, leftColor: string, rightColor: string) {
  // top face
  ctx.beginPath();
  ctx.moveTo(cx, cy - h);
  ctx.lineTo(cx + w / 2, cy - h + d / 2);
  ctx.lineTo(cx, cy - h + d);
  ctx.lineTo(cx - w / 2, cy - h + d / 2);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();
  // left face
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy - h + d / 2);
  ctx.lineTo(cx, cy - h + d);
  ctx.lineTo(cx, cy + d);
  ctx.lineTo(cx - w / 2, cy + d / 2);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();
  // right face
  ctx.beginPath();
  ctx.moveTo(cx + w / 2, cy - h + d / 2);
  ctx.lineTo(cx, cy - h + d);
  ctx.lineTo(cx, cy + d);
  ctx.lineTo(cx + w / 2, cy + d / 2);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();
}

// ── Isometric roof (triangular prism) ──
export function isoRoof(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, d: number, h: number, color1: string, color2: string) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h);
  ctx.lineTo(cx - w / 2, cy);
  ctx.lineTo(cx, cy + d / 2);
  ctx.closePath();
  ctx.fillStyle = color1;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy - h);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + d / 2);
  ctx.closePath();
  ctx.fillStyle = color2;
  ctx.fill();
}

// ── Pixel isometric ellipse for shadows / selection ──
export function isoEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry * 0.5, 0, 0, Math.PI * 2);
}

// ── Draw isometric tree ──
export function drawIsoTree(ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number, phase: number, depleted: boolean) {
  const sway = Math.sin(time * 1.2 + phase) * 1;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  isoEllipse(ctx, cx + 2, cy + 4, 14, 14);
  ctx.fill();
  // trunk
  ctx.fillStyle = '#5a3518';
  ctx.fillRect(cx - 3 + sway * 0.3, cy - 24, 6, 28);
  ctx.fillStyle = '#7a4a26';
  ctx.fillRect(cx - 1 + sway * 0.3, cy - 22, 2, 24);
  // canopy layers
  const cols = depleted
    ? ['#3d5e28', '#4a6830', '#557038']
    : ['#2a6324', '#358430', '#4da34d', '#5cb85a'];
  const layers = [
    { ox: -8, oy: -22, r: 12 },
    { ox: 6, oy: -26, r: 11 },
    { ox: -2, oy: -32, r: 13 },
    { ox: 2, oy: -38, r: 10 },
  ];
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    ctx.fillStyle = cols[Math.min(i, cols.length - 1)];
    ctx.beginPath();
    ctx.arc(cx + l.ox + sway, cy + l.oy, l.r, 0, 7);
    ctx.fill();
  }
  // highlight
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.arc(cx - 4 + sway, cy - 40, 4, 0, 7);
  ctx.fill();
}

// ── Draw isometric gold mine ──
export function drawIsoGold(ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number, phase: number, ratio: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  isoEllipse(ctx, cx, cy + 4, 18, 18);
  ctx.fill();
  isoBox(ctx, cx, cy, 32, 16, 12, '#78716c', '#5c564e', '#6b6560');
  isoBox(ctx, cx - 8, cy + 2, 20, 10, 8, '#8a847c', '#6b6560', '#78726c');
  const n = Math.ceil(ratio * 6);
  for (let i = 0; i < n; i++) {
    const a = (phase + i * 1.1) % 6.28;
    const r = 4 + (i * 3.5) % 10;
    const ox = Math.cos(a) * r, oy = Math.sin(a) * r * 0.5 - 8;
    ctx.fillStyle = '#fde047';
    ctx.fillRect(cx + ox - 2, cy + oy - 2, 4, 4);
    if (Math.sin(time * 4 + i * 2.5) > 0.6) {
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.8;
      ctx.fillRect(cx + ox - 1, cy + oy - 3, 2, 2);
      ctx.globalAlpha = 1;
    }
  }
}

// ── Draw isometric berry bush ──
export function drawIsoBerries(ctx: CanvasRenderingContext2D, cx: number, cy: number, phase: number, ratio: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  isoEllipse(ctx, cx, cy + 4, 16, 16);
  ctx.fill();
  const bushes = [
    { ox: -8, oy: -4, r: 10, c: '#2a5a22' },
    { ox: 8, oy: -4, r: 10, c: '#2d6126' },
    { ox: 0, oy: -10, r: 12, c: '#357030' },
    { ox: -4, oy: -16, r: 8, c: '#3f7a33' },
    { ox: 4, oy: -14, r: 7, c: '#4a8a3d' },
  ];
  for (const b of bushes) {
    ctx.fillStyle = b.c;
    ctx.beginPath(); ctx.arc(cx + b.ox, cy + b.oy, b.r, 0, 7); ctx.fill();
  }
  const n = Math.ceil(ratio * 8);
  for (let i = 0; i < n; i++) {
    const a = (phase + i * 0.8) % 6.28;
    const r = 3 + (i * 3.7) % 8;
    const ox = Math.cos(a) * r, oy = Math.sin(a) * r * 0.5 - 8;
    ctx.fillStyle = i % 3 === 0 ? '#e11d48' : '#fb7185';
    ctx.beginPath(); ctx.arc(cx + ox, cy + oy, 2.5, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(cx + ox - 0.5, cy + oy - 0.5, 1, 0, 7); ctx.fill();
  }
}
