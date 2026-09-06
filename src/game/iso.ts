// ── Isometric coordinate helpers ──
// World uses "flat" coords (wx, wy). We convert to iso screen coords.
// Standard 2:1 isometric: toIso(wx,wy) = (wx - wy, (wx + wy) / 2)
//
// Земля вымощена ИЗОМЕТРИЧЕСКИМИ ШЕСТИУГОЛЬНИКАМИ (flat-top гекс в 2:1-проекции):
// аксиальные координаты (q,r), центр гекса в изо-экране:
//   ix = HQX * q,  iy = HQY * q + HY * r
// Соседи: (q±1,r), (q,r±1), (q+1,r-1), (q-1,r+1) — 6 направлений, бесшовная мозаика.

export const TILE_STEP = 32; // world-space шаг привязки стен (мировые единицы)
export const TILE_W = 64;    // legacy-совместимость
export const TILE_H = 32;

// ── ИЗОМЕТРИЧЕСКАЯ гексагональная решётка ──
// Канонический изо-шестиугольник (как в изо-тайлмапах Unity/Godot): верхняя и
// нижняя ВЕРШИНЫ, плечи идут по изо-диагоналям 2:1 (уклон 1:2 — те же ромбы, что
// у зданий), боковые грани ВЕРТИКАЛЬНЫЕ (как боковины изо-кубов). Параметры:
//   w  — половина ширины гекса (x до боковой грани);
//   b  — половина длины вертикальной боковой грани;
//   A  — вынос верхней/нижней вершины от центра; условие изо-уклона плеч: A-b = w/2.
const HS_W = 22;                        // половина ширины (горизонтальная полу-ось)
const HS_B = 9;                         // плечо: вертикальная боковая грань от -b до +b
const HS_A = HS_B + HS_W / 2;           // 20 — вынос верхней/нижней вершины (плечо 1:2)
export const HEX_PAD = 4;               // припуск канваса тайла (на перехлёст текстуры)
// шаги аксиальной решётки в изо-экране: q — горизонтальный сосед (через вертикальную
// грань), r — сосед вниз-право. Базис: q=(2w,0), r=(w,A+b).
export const HQX = 2 * HS_W;            // 44 — шаг q по X
export const HRX = HS_W;                // 22 — шаг r по X
export const HRY = HS_A + HS_B;         // 29 — шаг r по Y
// канвас тайла: гекс 2w шириной × 2A высотой, с припуском
export const TILE_CW = 2 * HS_W + HEX_PAD * 2;   // 52
export const TILE_CH = 2 * HS_A + HEX_PAD * 2;   // 48
export const TCX = TILE_CW / 2;
export const TCY = TILE_CH / 2;
// вершины гекса относительно ЦЕНТРА. Порядок по часовой от вершины:
// 0 T верх · 1 UR правое плечо · 2 R правый бок · 3 B низ · 4 L левый бок · 5 UL левое плечо.
// Наклонные грани (0-1, 2-3, 3-4, 5-0) имеют уклон ±1/2 (изо-оси 2:1);
// грани 1-2 и 4-5 — вертикальные. Вороной-ячейка решётки hexCenter.
export const HEX_PTS: [number, number][] = [
  [0, -HS_A],        // 0 T
  [HS_W, -HS_B],     // 1 UR
  [HS_W, HS_B],      // 2 R
  [0, HS_A],         // 3 B
  [-HS_W, HS_B],     // 4 L
  [-HS_W, -HS_B],    // 5 UL
];

/** World XY → isometric screen XY */
export function toIso(wx: number, wy: number): [number, number] {
  return [wx - wy, (wx + wy) * 0.5];
}

/** Isometric screen XY → world XY (inverse) */
export function fromIso(sx: number, sy: number): [number, number] {
  return [sx / 2 + sy, sy - sx / 2];
}

/** изо-экранные координаты центра гекса (q,r): базис q=(2w,0), r=(w,A+b) */
export function hexCenter(q: number, r: number): [number, number] {
  return [HQX * q + HRX * r, HRY * r];
}

/** изо-экран → дробные аксиальные координаты гекса */
export function screenToHex(ix: number, iy: number): { q: number; r: number } {
  const r = iy / HRY;
  const q = (ix - HRX * r) / HQX;
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
// плотная подложка под текстуру (базовый цвет биома)
const BASE: Record<HexKind, string> = {
  grass: '#5a8c42', dgrass: '#4a7c38', dirt: '#8a7048',
  water: '#3a7fc0', deep: '#245a96', sand: '#d8c489', desert: '#d2ac5e',
  field: '#a3ad4e', forest: '#3f6b2f', mountain: '#62606a', hill: '#7f8c52',
};
// цвет тинта текстуры (null — без тинта); лёгкий, чтобы AI-текстура читалась
const TINT: Partial<Record<HexKind, string>> = {
  dgrass: 'rgba(40,90,30,0.28)',
  forest: 'rgba(25,60,18,0.22)',
  mountain: 'rgba(110,110,128,0.18)',
  hill: 'rgba(110,120,65,0.16)',
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
    if (!url) {
      g.save();
      hexPath(g, TCX, TCY);
      g.clip();
      g.fillStyle = 'rgba(20,50,16,0.35)';
      for (let i = 0; i < 8; i++) {
        const px = TCX + ((i * 17 + v) % 44) - 22;
        const py = TCY + ((i * 13 + (v >> 3)) % 36) - 18;
        g.fillRect(px, py, 2, 2);
      }
      g.fillStyle = 'rgba(120,170,90,0.30)';
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
    // верхние плечи (дальняя кромка) — свет
    ridge(0, 1, 'rgba(255,255,230,0.26)', 1.3);
    ridge(5, 0, 'rgba(255,255,230,0.26)', 1.3);
    // вертикальные бока — полу-тень
    ridge(1, 2, 'rgba(0,0,0,0.12)', 1);
    ridge(4, 5, 'rgba(255,255,230,0.10)', 1);
    // нижние плечи (обрыв к зрителю) — тень
    ridge(2, 3, 'rgba(0,0,0,0.30)', 1.3);
    ridge(3, 4, 'rgba(0,0,0,0.30)', 1.3);
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
