// ── Isometric coordinate helpers ──
// World uses "flat" coords (wx, wy). We convert to iso screen coords.
// Standard 2:1 isometric: toIso(wx,wy) = (wx - wy, (wx + wy) / 2)
// With TILE_STEP=32 in world, a tile maps to a 64×32 pixel diamond.
// Adjacent tiles at (wx+32, wy) → iso (wx-wy+32, (wx+wy)/2+16) — perfect tessellation.

export const TILE_STEP = 32; // world-space tile size
export const TILE_W = 64;    // iso pixel width of one diamond
export const TILE_H = 32;    // iso pixel height of one diamond

/** World XY → isometric screen XY */
export function toIso(wx: number, wy: number): [number, number] {
  return [wx - wy, (wx + wy) * 0.5];
}

/** Isometric screen XY → world XY (inverse) */
export function fromIso(sx: number, sy: number): [number, number] {
  return [sx / 2 + sy, sy - sx / 2];
}

// ── Pre-built tile canvases (cached) ──
const tileCache = new Map<string, HTMLCanvasElement>();

function getCachedTile(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  let c = tileCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  draw(g);
  tileCache.set(key, c);
  return c;
}

// Diamond path centered at (cx, cy) filling exactly TILE_W × TILE_H
function diamondPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, w = TILE_W, h = TILE_H) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);      // top
  ctx.lineTo(cx + w / 2, cy);      // right
  ctx.lineTo(cx, cy + h / 2);      // bottom
  ctx.lineTo(cx - w / 2, cy);      // left
  ctx.closePath();
}

// Each tile canvas is TILE_W+2 × TILE_H+2 with the diamond centered at (TILE_W/2+1, TILE_H/2+1)
// The +2 padding avoids sub-pixel clipping artifacts.
const TW = TILE_W + 2;
const TH = TILE_H + 2;
const TCX = TW / 2;
const TCY = TH / 2;

export function getGrassTile(): HTMLCanvasElement {
  return getCachedTile('grass', TW, TH, (g) => {
    diamondPath(g, TCX, TCY);
    g.fillStyle = '#5a8c42';
    g.fill();
    // subtle variation patches
    diamondPath(g, TCX - 6, TCY - 2, 28, 14);
    g.fillStyle = 'rgba(120,200,80,0.2)';
    g.fill();
    diamondPath(g, TCX + 8, TCY + 2, 22, 11);
    g.fillStyle = 'rgba(80,150,50,0.15)';
    g.fill();
    // grass tufts
    g.fillStyle = '#6da854';
    for (let i = 0; i < 6; i++) {
      const px = TCX + ((i * 17 + 5) % 44) - 22;
      const py = TCY + ((i * 13 + 3) % 20) - 10;
      g.fillRect(px, py, 2, 2);
    }
    g.fillStyle = '#4e8036';
    for (let i = 0; i < 4; i++) {
      const px = TCX + ((i * 23 + 11) % 40) - 20;
      const py = TCY + ((i * 19 + 7) % 18) - 9;
      g.fillRect(px, py, 2, 1);
    }
  });
}

export function getDirtTile(): HTMLCanvasElement {
  return getCachedTile('dirt', TW, TH, (g) => {
    diamondPath(g, TCX, TCY);
    g.fillStyle = '#8a7048';
    g.fill();
    // speckles
    for (let i = 0; i < 10; i++) {
      g.fillStyle = i % 3 === 0 ? '#9a8058' : '#7a6038';
      const px = TCX + ((i * 17) % 40) - 20;
      const py = TCY + ((i * 11) % 18) - 9;
      g.fillRect(px, py, 2, 2);
    }
  });
}

export function getDarkGrassTile(): HTMLCanvasElement {
  return getCachedTile('dgrass', TW, TH, (g) => {
    diamondPath(g, TCX, TCY);
    g.fillStyle = '#4a7c38';
    g.fill();
    for (let i = 0; i < 5; i++) {
      g.fillStyle = '#3e6a2e';
      g.fillRect(TCX + ((i * 19) % 36) - 18, TCY + ((i * 11) % 16) - 8, 2, 2);
    }
    diamondPath(g, TCX + 4, TCY + 1, 20, 10);
    g.fillStyle = 'rgba(60,120,40,0.2)';
    g.fill();
  });
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
