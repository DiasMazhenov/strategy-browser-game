import { AGES, BUILDING_DEFS, DIFF, SCORE, UNIT_DEFS, WORLD, type BuildingKey, type Difficulty, type UnitKey } from './config';
import { SoundBank } from './audio';
import { toIso, fromIso, isoBox, isoRoof, isoEllipse, drawIsoTree, drawIsoGold, drawIsoBerries, getGrassTile, getDirtTile, getDarkGrassTile } from './iso';

export interface GameStats { score: number; kills: number; razed: number; gathered: number; timeSec: number; age: number; result: 'victory' | 'defeat'; difficulty: Difficulty; }
export interface Banner { title: string; sub: string; t: number; dur: number; }
interface Carry { type: 'wood' | 'food' | 'gold'; amt: number }
interface Unit {
  id: number; key: UnitKey; owner: 'player' | 'enemy' | 'neutral';
  x: number; y: number; hp: number; maxHp: number; atk: number; range: number; speed: number;
  cd: number; state: 'idle' | 'move' | 'gather' | 'return' | 'build' | 'attackmove';
  tx: number; ty: number; targetU: number; targetB: number; nodeId: number; buildId: number;
  carry: Carry; gatherT: number; anim: number; face: number; atkAnim: number; retarget: number; idleT: number; flash: number;
  wx: number; wy: number; // wander anchor for wolves
}
interface Bld {
  id: number; key: BuildingKey; owner: 'player' | 'enemy';
  x: number; y: number; size: number; hp: number; maxHp: number;
  done: number; buildT: number; queue: { key: UnitKey; t: number; total: number }[];
  cd: number; rallyX: number; rallyY: number; flash: number; smokeT: number;
}
interface Node { id: number; kind: 'wood' | 'gold' | 'food'; x: number; y: number; amount: number; max: number; r: number; phase: number }
interface Proj { x: number; y: number; vx: number; vy: number; tx: number; ty: number; targetU: number; targetB: number; dmg: number; owner: 'player' | 'enemy' | 'neutral'; life: number; kind: 'arrow' | 'bolt' | 'rock'; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; grav: number; shape: 'rect' | 'circle' | 'spark'; rot: number; vr: number }
interface Floater { x: number; y: number; life: number; max: number; text: string; color: string; size: number }
interface Corpse { x: number; y: number; key: UnitKey; owner: string; t: number; life: number; face: number }
interface Decor { x: number; y: number; k: number; s: number; c: string }

export interface SelSnapshot {
  kind: 'none' | 'units' | 'building';
  count?: number; types?: { key: string; label: string; count: number }[];
  avgHp?: number; maxHp?: number; canGather?: boolean;
  bkey?: BuildingKey; blabel?: string; hp?: number; bmax?: number; done?: number;
  queue?: { key: UnitKey; label: string; t: number; total: number }[];
}
export interface HudSnapshot {
  wood: number; food: number; gold: number; pop: number; popCap: number;
  age: number; ageName: string; score: number; kills: number; razed: number;
  timeSec: number; wave: number; nextWave: number; enemyAge: number;
  sel: SelSnapshot; placement: BuildingKey | null; attackArmed: boolean; rallyArmed: boolean; panMode: boolean;
  banner: { title: string; sub: string } | null;
  quests: { id: string; label: string; done: boolean; progress: string }[];
  muted: boolean; idleVills: number;
  pTc: number; pTcMax: number; eTc: number; eTcMax: number;
  dmgFlash: number; ageAfford: boolean; ageCost: string;
  hint: string;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
const dist2 = (ax: number, ay: number, bx: number, by: number) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

export class Game {
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D;
  sound = new SoundBank();
  difficulty: Difficulty;
  onHud: (h: HudSnapshot) => void;
  onGameOver: (s: GameStats) => void;
  onPauseRequest: () => void;

  units: Unit[] = []; blds: Bld[] = []; nodes: Node[] = [];
  projs: Proj[] = []; parts: Particle[] = []; floaters: Floater[] = []; corpses: Corpse[] = [];
  decor: Decor[] = [];
  res = { wood: 260, food: 260, gold: 140 };
  eres = { wood: 300, food: 300, gold: 160 };
  age = 0; eage = 0;
  score = 0; kills = 0; razed = 0; gatheredTotal = 0; woodGathered = 0;
  soldiersTrained = 0; barracksBuilt = 0; wolvesSlain = 0;
  time = 0; wave = 0; waveT: number;
  cam = { x: 380, y: 1620, zoom: 1 };
  keys = new Set<string>();
  selected = new Set<number>(); selBld = -1;
  placement: BuildingKey | null = null; attackArmed = false; rallyArmed = false; panMode = false;
  trauma = 0; dmgFlash = 0;
  paused = false; over: 'victory' | 'defeat' | null = null;
  raf = 0; last = 0; hudT = 0; aiT = 0; hintT = 0;
  banners: Banner[] = [];
  questsDone: Record<string, boolean> = {};
  nextId = 1;
  pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; moved: boolean; btn: number }>();
  pinchD = 0;
  box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  panning: { cx: number; cy: number; px: number; py: number } | null = null;
  mouse = { x: 0, y: 0, in: false, isTouch: false };
  minimap = { x: 0, y: 0, w: 0, h: 0 };
  grassTile: HTMLCanvasElement | null = null;
  muted = false;
  dpr = 1; vw = 0; vh = 0;
  hint = 'Потяните для выделения • Правый клик — приказ';
  destroyed = false;

  constructor(canvas: HTMLCanvasElement, opts: { difficulty: Difficulty; onHud: (h: HudSnapshot) => void; onGameOver: (s: GameStats) => void; onPauseRequest: () => void }) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('no ctx');
    this.ctx = ctx;
    this.difficulty = opts.difficulty;
    this.onHud = opts.onHud; this.onGameOver = opts.onGameOver; this.onPauseRequest = opts.onPauseRequest;
    this.waveT = DIFF[opts.difficulty].waveInterval;
    this.resize();
    this.makeGrass();
    this.genWorld();
    this.bind();
    this.centerOn(380, 1620, true);
    const isMobile = matchMedia('(pointer: coarse)').matches;
    this.cam.zoom = isMobile ? 0.7 : 0.9;
    this.hint = isMobile ? 'Касание — выбор • Касание земли — приказ • Потяните — рамка выбора' : 'ЛКМ-рамка — выделение • ПКМ — приказ • WASD камера • 1-4 тренировка';
    this.pushBanner('⚔️ К оружию!', 'Ведите ополчение — охотьтесь на волков на северо-востоке', 3.4);
    this.last = performance.now();
    const loop = (t: number) => { if (this.destroyed) return; this.raf = requestAnimationFrame(loop); this.frame(t); };
    this.raf = requestAnimationFrame(loop);
  }

  // ---------- setup ----------
  resize = () => {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.vw = Math.max(320, r.width); this.vh = Math.max(320, r.height);
    this.canvas.width = Math.floor(this.vw * this.dpr);
    this.canvas.height = Math.floor(this.vh * this.dpr);
  };

  makeGrass() {
    // Isometric tiles are drawn procedurally via iso.ts — no bitmap tile needed
    this.grassTile = null;
  }

  addUnit(key: UnitKey, owner: 'player' | 'enemy' | 'neutral', x: number, y: number): Unit {
    const d = UNIT_DEFS[key];
    const diff = DIFF[this.difficulty];
    const ageMult = owner === 'player' ? AGES[this.age].mult : owner === 'enemy' ? AGES[this.eage].mult * diff.enemyHp : 1;
    const u: Unit = {
      id: this.nextId++, key, owner, x: clamp(x, 20, WORLD.w - 20), y: clamp(y, 20, WORLD.h - 20),
      hp: d.hp * ageMult, maxHp: d.hp * ageMult, atk: d.atk * (owner === 'neutral' ? 1 : ageMult),
      range: d.range, speed: d.speed * (key === 'knight' ? 1 : rand(0.94, 1.06)),
      cd: rand(0, 0.4), state: 'idle', tx: x, ty: y, targetU: -1, targetB: -1, nodeId: -1, buildId: -1,
      carry: { type: 'wood', amt: 0 }, gatherT: 0, anim: rand(0, 9), face: Math.random() < 0.5 ? 1 : -1,
      atkAnim: 0, retarget: rand(0, 0.4), idleT: 0, flash: 0, wx: x, wy: y,
    };
    this.units.push(u);
    return u;
  }

  addBld(key: BuildingKey, owner: 'player' | 'enemy', x: number, y: number, done = 1): Bld {
    const d = BUILDING_DEFS[key];
    const b: Bld = {
      id: this.nextId++, key, owner, x, y, size: d.size, hp: d.hp * done, maxHp: d.hp,
      done, buildT: 0, queue: [], cd: 0, rallyX: x + (owner === 'player' ? 110 : -110), rallyY: y + 90, flash: 0, smokeT: 0,
    };
    this.blds.push(b);
    return b;
  }

  addNode(kind: 'wood' | 'gold' | 'food', x: number, y: number, amount: number): Node {
    const n: Node = { id: this.nextId++, kind, x, y, amount, max: amount, r: kind === 'wood' ? 20 : 24, phase: rand(0, 9) };
    this.nodes.push(n);
    return n;
  }

  genWorld() {
    // decor
    for (let i = 0; i < 420; i++) {
      const cols = ['#5da24a', '#6fae55', '#87b96a', '#d9c26a', '#c9b458'];
      this.decor.push({ x: rand(0, WORLD.w), y: rand(0, WORLD.h), k: (Math.random() * 3) | 0, s: rand(2, 5), c: cols[(Math.random() * cols.length) | 0] });
    }
    const P = { x: 380, y: 1620 }, E = { x: 2220, y: 380 };
    // starting forests arcs
    const arc = (cx: number, cy: number, n: number, r0: number, a0: number) => {
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * Math.PI * 1.2 + rand(-0.15, 0.15);
        const r = r0 + rand(-30, 60);
        this.addNode('wood', cx + Math.cos(a) * r, cy + Math.sin(a) * r, 220);
      }
    };
    arc(P.x, P.y, 9, 210, -0.4); arc(E.x, E.y, 9, 210, Math.PI - 0.4);
    this.addNode('food', P.x + 120, P.y - 150, 700); this.addNode('food', P.x - 170, P.y + 60, 700);
    this.addNode('gold', P.x + 190, P.y + 130, 900); this.addNode('gold', P.x - 90, P.y - 230, 700);
    this.addNode('food', E.x - 120, E.y + 150, 700); this.addNode('food', E.x + 170, E.y - 60, 700);
    this.addNode('gold', E.x - 190, E.y - 130, 900); this.addNode('gold', E.x + 90, E.y + 230, 700);
    // mid forests
    const forests = [[900, 900], [1500, 1300], [1200, 500], [1900, 1100], [700, 500], [1700, 1700], [1300, 1650]];
    for (const [fx, fy] of forests) {
      const n = 9 + ((Math.random() * 6) | 0);
      for (let i = 0; i < n; i++) this.addNode('wood', fx + rand(-130, 130), fy + rand(-110, 110), 200);
    }
    // scattered gold/berries
    const spots: [number, number][] = [[1000, 1400], [1600, 700], [1300, 1000], [800, 1000], [2000, 1500], [500, 900], [1450, 1450]];
    for (const [sx, sy] of spots) {
      if (Math.random() < 0.75) this.addNode('gold', sx + rand(-40, 40), sy + rand(-40, 40), 800);
      if (Math.random() < 0.8) this.addNode('food', sx + rand(-110, 110), sy + rand(-90, 90), 550);
    }
    // central gold rush
    this.addNode('gold', 1300, 1000, 1500); this.addNode('gold', 1350, 1040, 1200);
    // TCs
    this.addBld('towncenter', 'player', P.x, P.y, 1);
    this.addBld('towncenter', 'enemy', E.x, E.y, 1);
    // starting villagers
    const v1 = this.addUnit('villager', 'player', P.x - 60, P.y - 40);
    const v2 = this.addUnit('villager', 'player', P.x + 50, P.y - 60);
    const v3 = this.addUnit('villager', 'player', P.x - 40, P.y + 70);
    const v4 = this.addUnit('villager', 'player', P.x + 70, P.y + 50);
    // auto-task starting vills
    const woods = this.nodes.filter(n => n.kind === 'wood' && dist2(n.x, n.y, P.x, P.y) < 340 * 340);
    const foods = this.nodes.filter(n => n.kind === 'food' && dist2(n.x, n.y, P.x, P.y) < 340 * 340);
    if (woods[0]) this.orderGather(v1, woods[0].id);
    if (woods[1]) this.orderGather(v2, woods[1].id);
    if (foods[0]) this.orderGather(v3, foods[0].id);
    if (foods[1]) this.orderGather(v4, foods[1].id);
    // starting army — instant fun
    const s1 = this.addUnit('swordsman', 'player', P.x + 130, P.y - 20);
    const s2 = this.addUnit('swordsman', 'player', P.x + 160, P.y + 20);
    this.addUnit('archer', 'player', P.x + 110, P.y + 60);
    this.selected.add(s1.id); this.selected.add(s2.id);
    // enemy villagers
    for (let i = 0; i < 5; i++) {
      const u = this.addUnit('villager', 'enemy', E.x + rand(-70, 70), E.y + rand(-70, 70));
      const ns = this.nodes.filter(n => dist2(n.x, n.y, E.x, E.y) < 340 * 340);
      if (ns[i % ns.length]) this.orderGather(u, ns[i % ns.length].id);
    }
    this.addUnit('swordsman', 'enemy', E.x - 120, E.y + 40);
    this.addUnit('swordsman', 'enemy', E.x - 150, E.y - 20);
    // wolves — one pack near player for instant combat
    const packs: [number, number][] = [[760, 1280], [1100, 1050], [1500, 900], [950, 700], [1750, 1350]];
    for (const [wx, wy] of packs) for (let i = 0; i < 3; i++) {
      const w = this.addUnit('wolf', 'neutral', wx + rand(-50, 50), wy + rand(-50, 50));
      w.wx = wx; w.wy = wy;
    }
  }

  // ---------- input ----------
  onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) { if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault(); return; }
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (k === ' ' || k === 'p' || k === 'escape') {
      if (k === 'escape') {
        if (this.placement) { this.placement = null; this.pushHud(); return; }
        if (this.attackArmed || this.rallyArmed) { this.attackArmed = false; this.rallyArmed = false; this.pushHud(); return; }
        if (this.selected.size || this.selBld >= 0) { this.clearSel(); this.pushHud(); return; }
      }
      this.onPauseRequest();
      e.preventDefault(); return;
    }
    if (this.paused || this.over) return;
    if (k === '1') this.train('villager');
    else if (k === '2') this.train('swordsman');
    else if (k === '3') this.train('archer');
    else if (k === '4') this.train('knight');
    else if (k === 'q') this.enterPlacement('house');
    else if (k === 'e') this.enterPlacement('barracks');
    else if (k === 'r') this.enterPlacement('tower');
    else if (k === 'f') this.enterPlacement('farm');
    else if (k === 't') this.ageUp();
    else if (k === 'g') { if (this.selUnits().length) { this.attackArmed = !this.attackArmed; this.rallyArmed = false; this.sound.select(); this.pushHud(); } }
    else if (k === 'h') this.centerOn(380, 1620);
    else if (k === 'm') this.toggleMute();
    else if (k === '+' || k === '=') this.zoomBy(0.15);
    else if (k === '-' || k === '_') this.zoomBy(-0.15);
    else if (k === 'a' && e.ctrlKey === false && e.metaKey === false) { /* camera handled in update via keys */ }
  };
  onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
  onResize = () => this.resize();
  onVis = () => { if (document.hidden && !this.paused && !this.over) this.onPauseRequest(); };

  bind() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVis);
    const c = this.canvas;
    c.addEventListener('pointerdown', this.pDown);
    c.addEventListener('pointermove', this.pMove);
    c.addEventListener('pointerup', this.pUp);
    c.addEventListener('pointercancel', this.pUp);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('dblclick', this.onDbl);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVis);
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.pDown);
    c.removeEventListener('pointermove', this.pMove);
    c.removeEventListener('pointerup', this.pUp);
    c.removeEventListener('pointercancel', this.pUp);
    c.removeEventListener('wheel', this.onWheel);
  }

  setPaused(p: boolean) { this.paused = p; this.pushHud(); }
  toggleMute(): boolean { this.muted = !this.muted; this.sound.setMuted(this.muted); this.pushHud(); return this.muted; }

  screenToWorld(sx: number, sy: number) {
    const r = this.canvas.getBoundingClientRect();
    const px = (sx - r.left), py = (sy - r.top);
    // screen pixel → camera-relative → iso screen → world
    const isoSx = (px - this.vw / 2) / this.cam.zoom + this.camIsoX();
    const isoSy = (py - this.vh / 2) / this.cam.zoom + this.camIsoY();
    const [wx, wy] = fromIso(isoSx, isoSy);
    return { x: wx, y: wy, px, py };
  }

  camIsoX() { const [ix] = toIso(this.cam.x, this.cam.y); return ix; }
  camIsoY() { const [, iy] = toIso(this.cam.x, this.cam.y); return iy; }

  pDown = (e: PointerEvent) => {
    this.sound.ensure();
    this.canvas.setPointerCapture?.(e.pointerId);
    const w = this.screenToWorld(e.clientX, e.clientY);
    // minimap interaction
    if (w.px >= this.minimap.x && w.px <= this.minimap.x + this.minimap.w && w.py >= this.minimap.y && w.py <= this.minimap.y + this.minimap.h) {
      this.minimapJump(w.px, w.py);
      this.pointers.set(e.pointerId, { x: w.px, y: w.py, sx: w.px, sy: w.py, t: performance.now(), moved: true, btn: 99 });
      return;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, btn: e.button });
    if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      this.pinchD = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.box = null;
      return;
    }
    if (e.button === 1 || e.button === 2 || (e.pointerType === 'mouse' && e.button === 2)) {
      this.panning = { cx: this.cam.x, cy: this.cam.y, px: e.clientX, py: e.clientY };
      return;
    }
    if (this.panMode && e.pointerType !== 'mouse') {
      this.panning = { cx: this.cam.x, cy: this.cam.y, px: e.clientX, py: e.clientY };
      return;
    }
    // begin potential box
    this.box = { x0: w.x, y0: w.y, x1: w.x, y1: w.y };
  };

  pMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    const w = this.screenToWorld(e.clientX, e.clientY);
    this.mouse.x = w.px; this.mouse.y = w.py; this.mouse.in = true; this.mouse.isTouch = e.pointerType !== 'mouse';
    if (p) {
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 9) p.moved = true;
      p.x = e.clientX; p.y = e.clientY;
    }
    // pinch zoom
    if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.pinchD > 0) this.zoomBy((d - this.pinchD) * 0.003, true);
      this.pinchD = d;
      // two-finger pan
      const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
      if ((this as unknown as { _pp?: { x: number; y: number } })._pp) {
        const pp = (this as unknown as { _pp: { x: number; y: number } })._pp;
        this.cam.x -= (cx - pp.x) / this.cam.zoom; this.cam.y -= (cy - pp.y) / this.cam.zoom;
        this.clampCam();
      }
      (this as unknown as { _pp: { x: number; y: number } })._pp = { x: cx, y: cy };
      return;
    }
    if (this.panning) {
      this.cam.x = this.panning.cx - (e.clientX - this.panning.px) / this.cam.zoom;
      this.cam.y = this.panning.cy - (e.clientY - this.panning.py) / this.cam.zoom;
      this.clampCam();
      return;
    }
    // minimap drag
    if (p && p.btn === 99) { this.minimapJump(w.px, w.py); return; }
    if (this.box && p && p.moved) { this.box.x1 = w.x; this.box.y1 = w.y; }
  };

  pUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    (this as unknown as { _pp?: unknown })._pp = undefined;
    this.pointers.delete(e.pointerId);
    if (this.panning) {
      const wasTap = p && !p.moved && performance.now() - p.t < 600;
      this.panning = null;
      if (!wasTap) return;
      // fall through: treat stationary pan-mode tap as a tap order/select
      if (this.paused || this.over) return;
      const wt = this.screenToWorld(e.clientX, e.clientY);
      this.handleTap(wt.x, wt.y, e.shiftKey);
      return;
    }
    if (!p) { this.box = null; return; }
    const wasTap = !p.moved && performance.now() - p.t < 600;
    const w = this.screenToWorld(e.clientX, e.clientY);
    // minimap pointer
    if (p.btn === 99) { this.box = null; return; }
    if (this.pointers.size > 0) { return; }
    if (this.paused || this.over) { this.box = null; return; }
    const right = p.btn === 2;
    if (right) { this.issueSmart(w.x, w.y); this.box = null; return; }
    if (!wasTap && this.box && !this.panMode) {
      // box select
      const x0 = Math.min(this.box.x0, this.box.x1), x1 = Math.max(this.box.x0, this.box.x1);
      const y0 = Math.min(this.box.y0, this.box.y1), y1 = Math.max(this.box.y0, this.box.y1);
      if (Math.abs(x1 - x0) > 18 || Math.abs(y1 - y0) > 18) {
        const additive = this.keys.has('shift');
        if (!additive) this.clearSel();
        let n = 0;
        for (const u of this.units) {
          if (u.owner !== 'player' || u.key === 'wolf') continue;
          if (u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1) { this.selected.add(u.id); n++; }
        }
        if (n) this.sound.select();
        this.selBld = -1;
        this.pushHud();
      }
      this.box = null;
      return;
    }
    this.box = null;
    if (!wasTap) return;
    this.handleTap(w.x, w.y, e.shiftKey);
  };

  onWheel = (e: WheelEvent) => { e.preventDefault(); this.zoomBy(-e.deltaY * 0.0012, true); };
  onDbl = (e: MouseEvent) => {
    const w = this.screenToWorld(e.clientX, e.clientY);
    const u = this.pickUnit(w.x, w.y);
    if (u && u.owner === 'player') {
      this.clearSel();
      for (const o of this.units) if (o.owner === 'player' && o.key === u.key && Math.abs(o.x - this.cam.x) < 700 && Math.abs(o.y - this.cam.y) < 500) this.selected.add(o.id);
      this.sound.select(); this.pushHud();
    }
  };

  minimapJump(px: number, py: number) {
    const { x, y, w, h } = this.minimap;
    const fx = (px - x) / w, fy = (py - y) / h;
    this.cam.x = clamp(fx * WORLD.w, 0, WORLD.w);
    this.cam.y = clamp(fy * WORLD.h, 0, WORLD.h);
    this.clampCam();
  }

  zoomBy(d: number, toCursor = false) {
    const old = this.cam.zoom;
    const nz = clamp(old + d, 0.4, 2.0);
    if (toCursor && this.mouse.in) {
      const wx = this.cam.x + (this.mouse.x - this.vw / 2) / old;
      const wy = this.cam.y + (this.mouse.y - this.vh / 2) / old;
      this.cam.zoom = nz;
      this.cam.x = wx - (this.mouse.x - this.vw / 2) / nz;
      this.cam.y = wy - (this.mouse.y - this.vh / 2) / nz;
    } else this.cam.zoom = nz;
    this.clampCam();
  }
  clampCam() {
    const mx = this.vw / 2 / this.cam.zoom, my = this.vh / 2 / this.cam.zoom;
    this.cam.x = clamp(this.cam.x, -mx + 80, WORLD.w + mx - 80);
    this.cam.y = clamp(this.cam.y, -my + 80, WORLD.h + my - 80);
  }
  centerOn(x: number, y: number, snap = false) {
    if (snap) { this.cam.x = x; this.cam.y = y; }
    else { this.cam.x = x; this.cam.y = y; }
    this.clampCam();
  }

  // ---------- picking ----------
  pickUnit(x: number, y: number): Unit | null {
    let best: Unit | null = null; let bd = 30 * 30;
    for (const u of this.units) { const d = dist2(x, y, u.x, u.y); if (d < bd) { bd = d; best = u; } }
    return best;
  }
  pickBld(x: number, y: number): Bld | null {
    for (const b of this.blds) {
      const h = b.size / 2 + 6;
      if (Math.abs(x - b.x) < h && Math.abs(y - b.y) < h) return b;
    }
    return null;
  }
  pickNode(x: number, y: number): Node | null {
    let best: Node | null = null; let bd = 34 * 34;
    for (const n of this.nodes) { if (n.amount <= 0) continue; const d = dist2(x, y, n.x, n.y); if (d < bd) { bd = d; best = n; } }
    return best;
  }

  handleTap(x: number, y: number, additive: boolean) {
    if (this.rallyArmed && this.selBld >= 0) {
      const b = this.blds.find(b => b.id === this.selBld);
      if (b) { b.rallyX = x; b.rallyY = y; this.spawnRing(x, y, '#f6d47c'); this.sound.move(); }
      this.rallyArmed = false; this.pushHud(); return;
    }
    if (this.placement) { this.tryPlace(x, y); return; }
    if (this.attackArmed) {
      const us = this.selUnits();
      if (us.length) { this.orderAttackMove(us, x, y); this.attackArmed = false; this.pushHud(); }
      return;
    }
    const u = this.pickUnit(x, y);
    const b = this.pickBld(x, y);
    const n = !u && !b ? this.pickNode(x, y) : null;
    // enemy / neutral target with selection → order
    if (u && u.owner !== 'player' && this.selected.size) { this.issueSmart(u.x, u.y); return; }
    if (b && b.owner !== 'player' && this.selected.size) { this.issueSmart(b.x, b.y); return; }
    if (n && this.selected.size && this.selUnits().some(v => v.key === 'villager')) { this.issueSmart(n.x, n.y); return; }
    if (u && u.owner === 'player') {
      if (!additive) this.clearSel();
      this.selected.add(u.id); this.selBld = -1;
      this.sound.select(); this.pushHud(); return;
    }
    if (b && b.owner === 'player') {
      this.clearSel(); this.selBld = b.id;
      this.sound.select(); this.pushHud(); return;
    }
    if (this.selected.size) { this.issueSmart(x, y); return; }
    if (this.selBld >= 0) { this.clearSel(); this.pushHud(); }
  }

  issueSmart(x: number, y: number) {
    const us = this.selUnits();
    if (!us.length) return;
    // find explicit target
    const tu = this.pickUnit(x, y);
    const tb = this.pickBld(x, y);
    const nd = this.pickNode(x, y);
    const hasVill = us.some(u => u.key === 'villager');
    const hasMil = us.some(u => u.key !== 'villager');
    if (tu && tu.owner !== 'player') { this.orderAttack(us, tu); return; }
    if (tb && tb.owner !== 'player') { this.orderAttackBld(us, tb); return; }
    if (nd && hasVill) {
      const vills = us.filter(u => u.key === 'villager');
      for (const v of vills) this.orderGather(v, nd.id);
      if (hasMil) this.orderAttackMove(us.filter(u => u.key !== 'villager'), x, y);
      return;
    }
    // own farm → gather
    if (tb && tb.owner === 'player' && tb.key === 'farm' && hasVill) {
      for (const v of us.filter(u => u.key === 'villager')) { v.state = 'gather'; v.buildId = tb.id; v.nodeId = -1; v.tx = tb.x + rand(-30, 30); v.ty = tb.y + rand(-24, 24); v.gatherT = 0; }
      this.sound.move(); this.spawnRing(x, y, '#a3e635'); return;
    }
    // own construction → assist
    if (tb && tb.owner === 'player' && tb.done < 1 && hasVill) {
      for (const v of us.filter(u => u.key === 'villager')) { v.state = 'build'; v.buildId = tb.id; v.tx = tb.x + rand(-60, 60); v.ty = tb.y + rand(-50, 50); }
      this.sound.move(); this.spawnRing(x, y, '#f6d47c'); return;
    }
    // default: military attack-move, villagers move
    if (hasMil && !hasVill) this.orderAttackMove(us, x, y);
    else if (!hasMil) { for (const v of us) { v.state = 'move'; v.tx = x + rand(-24, 24); v.ty = y + rand(-24, 24); v.targetU = -1; v.targetB = -1; v.nodeId = -1; v.buildId = -1; } this.sound.move(); this.spawnRing(x, y, '#7dd3fc'); }
    else {
      this.orderAttackMove(us.filter(u => u.key !== 'villager'), x, y);
      for (const v of us.filter(u => u.key === 'villager')) { v.state = 'move'; v.tx = x + rand(-24, 24); v.ty = y + rand(-24, 24); v.targetU = -1; v.targetB = -1; v.nodeId = -1; v.buildId = -1; }
      this.sound.move(); this.spawnRing(x, y, '#7dd3fc');
    }
  }

  orderGather(v: Unit, nodeId: number) {
    const n = this.nodes.find(n => n.id === nodeId);
    if (!n) return;
    if (v.carry.amt > 0 && v.carry.type !== n.kind) this.deposit(v);
    v.state = 'gather'; v.nodeId = nodeId; v.buildId = -1; v.targetU = -1; v.targetB = -1;
    v.tx = n.x + rand(-8, 8); v.ty = n.y + rand(-8, 8);
    v.carry.type = n.kind;
  }

  orderAttack(us: Unit[], target: Unit) {
    for (const u of us) {
      if (u.key === 'villager') { u.state = 'move'; u.tx = target.x; u.ty = target.y; continue; }
      u.state = 'attackmove'; u.targetU = target.id; u.targetB = -1; u.tx = target.x; u.ty = target.y;
    }
    this.sound.move(); this.spawnRing(target.x, target.y, '#f87171');
  }
  orderAttackBld(us: Unit[], target: Bld) {
    for (const u of us) {
      if (u.key === 'villager') { u.state = 'move'; u.tx = target.x; u.ty = target.y; continue; }
      u.state = 'attackmove'; u.targetB = target.id; u.targetU = -1; u.tx = target.x; u.ty = target.y;
    }
    this.sound.move(); this.spawnRing(target.x, target.y, '#f87171');
  }
  orderAttackMove(us: Unit[], x: number, y: number) {
    us.forEach((u, i) => {
      u.state = 'attackmove'; u.targetU = -1; u.targetB = -1;
      u.tx = x + rand(-36, 36) + (i % 3) * 14; u.ty = y + rand(-36, 36) + ((i / 3) | 0) * 14;
    });
    this.sound.move(); this.spawnRing(x, y, '#f87171', true);
  }

  // ---------- economy / production ----------
  afford(c: { wood: number; food: number; gold: number }) { return this.res.wood >= c.wood && this.res.food >= c.food && this.res.gold >= c.gold; }
  pay(c: { wood: number; food: number; gold: number }) { this.res.wood -= c.wood; this.res.food -= c.food; this.res.gold -= c.gold; }
  popUsed(owner: 'player' | 'enemy') { let s = 0; for (const u of this.units) if (u.owner === owner) s += UNIT_DEFS[u.key].pop; return s; }
  popCap(owner: 'player' | 'enemy') {
    let c = 10;
    for (const b of this.blds) if (b.owner === owner && b.key === 'house' && b.done >= 1) c += 8;
    return Math.min(60, c);
  }

  train(key: UnitKey) {
    if (this.paused || this.over) return;
    const d = UNIT_DEFS[key];
    // find building
    let b: Bld | undefined;
    if (key === 'villager') b = this.blds.find(b => b.owner === 'player' && b.key === 'towncenter' && b.done >= 1);
    else b = this.blds.find(b => b.owner === 'player' && b.key === 'barracks' && b.done >= 1 && b.queue.length < 5);
    if (key === 'villager' && b && b.queue.length >= 5) b = undefined;
    if (!b) {
      // try select building first for feedback
      const need = key === 'villager' ? 'Городской центр' : 'Казармы';
      this.floater(this.cam.x, this.cam.y - 120, `Нужен: ${need}!`, '#f87171', 20);
      this.sound.error(); return;
    }
    if (key === 'knight' && this.age < 1) { this.floater(b.x, b.y - 60, 'Нужен Феодальный век!', '#f87171', 17); this.sound.error(); return; }
    if (this.popUsed('player') + d.pop > this.popCap('player')) { this.floater(b.x, b.y - 60, 'Постройте дома! (+8 к населению)', '#f87171', 17); this.sound.error(); return; }
    if (!this.afford(d.cost)) { this.floater(b.x, b.y - 60, 'Не хватает ресурсов!', '#f87171', 17); this.sound.error(); return; }
    this.pay(d.cost);
    b.queue.push({ key, t: 0, total: d.trainTime });
    this.sound.train();
    this.burst(b.x, b.y - 20, 8, ['#f6d47c', '#fff7cc'], 60);
    this.pushHud();
  }

  enterPlacement(key: BuildingKey) {
    if (this.paused || this.over) return;
    if (key === 'tower' && this.age < 1) { this.floater(this.cam.x, this.cam.y - 100, 'Башням нужен Феодальный век!', '#f87171', 18); this.sound.error(); return; }
    const c = BUILDING_DEFS[key].cost;
    if (!this.afford(c)) { this.floater(this.cam.x, this.cam.y - 100, 'Не хватает дерева/золота!', '#f87171', 18); this.sound.error(); return; }
    this.placement = key; this.attackArmed = false; this.rallyArmed = false;
    this.sound.select(); this.pushHud();
  }
  cancelPlacement() { this.placement = null; this.pushHud(); }

  placementValid(x: number, y: number, key: BuildingKey): boolean {
    const s = BUILDING_DEFS[key].size / 2 + 8;
    if (x < s + 10 || y < s + 10 || x > WORLD.w - s - 10 || y > WORLD.h - s - 10) return false;
    for (const b of this.blds) {
      const need = s + b.size / 2 + 6;
      if (Math.abs(x - b.x) < need && Math.abs(y - b.y) < need) return false;
    }
    for (const n of this.nodes) {
      if (n.amount <= 0) continue;
      const need = s + n.r;
      if (Math.abs(x - n.x) < need && Math.abs(y - n.y) < need) return false;
    }
    return true;
  }

  tryPlace(x: number, y: number) {
    const key = this.placement; if (!key) return;
    if (!this.placementValid(x, y, key)) { this.sound.error(); this.trauma = Math.min(1, this.trauma + 0.08); return; }
    const c = BUILDING_DEFS[key].cost;
    if (!this.afford(c)) { this.sound.error(); return; }
    this.pay(c);
    const b = this.addBld(key, 'player', x, y, 0.15);
    b.buildT = 0;
    this.sound.place();
    this.burst(x, y, 22, ['#d6a45c', '#8b5e2e', '#f6d47c'], 120);
    this.floater(x, y - 50, `${BUILDING_DEFS[key].name}: фундамент заложен!`, '#f6d47c', 16);
    // auto-send nearest idle-ish villager
    let best: Unit | null = null; let bd = 700 * 700;
    for (const u of this.units) {
      if (u.owner !== 'player' || u.key !== 'villager') continue;
      if (u.state === 'gather' || u.state === 'return') continue;
      const d = dist2(u.x, u.y, x, y);
      if (d < bd) { bd = d; best = u; }
    }
    if (!best) { let bd2 = 1e12; for (const u of this.units) { if (u.owner !== 'player' || u.key !== 'villager') continue; const d = dist2(u.x, u.y, x, y); if (d < bd2) { bd2 = d; best = u; } } }
    if (best) { best.state = 'build'; best.buildId = b.id; best.tx = x + rand(-50, 50); best.ty = y + rand(-46, 46); }
    if (key === 'barracks') { this.barracksBuilt++; this.checkQuests(); }
    if (!this.keys.has('shift')) this.placement = null;
    this.pushHud();
  }

  ageUp() {
    if (this.paused || this.over || this.age >= 3) return;
    const next = AGES[this.age + 1];
    if (!next.cost) return;
    if (this.res.food < next.cost.food || this.res.gold < (next.cost.gold || 0)) {
      this.floater(this.cam.x, this.cam.y - 100, `Нужно: ${next.cost.food}🍖 ${next.cost.gold ? next.cost.gold + '🪙' : ''}`, '#f87171', 18);
      this.sound.error(); return;
    }
    this.res.food -= next.cost.food; this.res.gold -= next.cost.gold || 0;
    this.age++;
    // buff existing
    const m = AGES[this.age].mult / AGES[this.age - 1].mult;
    for (const u of this.units) if (u.owner === 'player') { u.maxHp *= m; u.hp *= m; u.atk *= m; }
    for (const b of this.blds) if (b.owner === 'player') { b.maxHp *= m; b.hp = Math.min(b.maxHp, b.hp * m); }
    this.score += SCORE.ageUp * this.age;
    this.sound.ageup();
    this.pushBanner(`${next.icon} ${next.name}!`, 'Армия сильнее, рыцари и башни укреплены', 3);
    this.burst(380, 1620, 40, ['#f6d47c', '#fff'], 160);
    this.checkQuests();
    this.pushHud();
  }

  // ---------- selection helpers ----------
  selUnits(): Unit[] {
    const out: Unit[] = [];
    for (const id of this.selected) { const u = this.units.find(u => u.id === id); if (u) out.push(u); }
    return out;
  }
  clearSel() { this.selected.clear(); this.selBld = -1; }
  armySelect() { this.clearSel(); for (const u of this.units) if (u.owner === 'player' && u.key !== 'villager') this.selected.add(u.id); this.sound.select(); this.pushHud(); }
  villsSelect() { this.clearSel(); for (const u of this.units) if (u.owner === 'player' && u.key === 'villager') this.selected.add(u.id); this.sound.select(); this.pushHud(); }
  idleSelect() {
    this.clearSel();
    for (const u of this.units) if (u.owner === 'player' && u.key === 'villager' && (u.state === 'idle' || u.state === 'move')) this.selected.add(u.id);
    const us = this.selUnits();
    if (us.length) { this.centerOn(us[0].x, us[0].y); this.sound.select(); }
    this.pushHud();
  }
  workIdle() {
    let n = 0;
    for (const u of this.units) {
      if (u.owner !== 'player' || u.key !== 'villager') continue;
      if (u.state !== 'idle' && u.state !== 'move') continue;
      const nd = this.nearestNode(u.x, u.y, n % 3 === 0 ? 'wood' : n % 3 === 1 ? 'food' : 'gold');
      if (nd) { this.orderGather(u, nd.id); n++; }
    }
    if (n) { this.sound.move(); this.floater(this.cam.x, this.cam.y - 80, `${n} крестьян отправлено на работу!`, '#a3e635', 17); }
    this.pushHud();
  }
  nearestNode(x: number, y: number, kind: 'wood' | 'food' | 'gold'): Node | null {
    let best: Node | null = null; let bd = 1e12;
    for (const n of this.nodes) { if (n.kind !== kind || n.amount <= 0) continue; const d = dist2(x, y, n.x, n.y); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  centerTC() { const tc = this.blds.find(b => b.owner === 'player' && b.key === 'towncenter'); if (tc) this.centerOn(tc.x, tc.y); }

  // ---------- fx ----------
  burst(x: number, y: number, n: number, colors: string[], spd: number, life = 0.7) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 650) return;
      const a = rand(0, Math.PI * 2), s = rand(spd * 0.3, spd);
      this.parts.push({ x, y: y - 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rand(life * 0.5, life), max: life, size: rand(2, 5), color: colors[(Math.random() * colors.length) | 0], grav: 320, shape: Math.random() < 0.4 ? 'circle' : 'rect', rot: rand(0, 6), vr: rand(-8, 8) });
    }
  }
  spark(x: number, y: number, color: string) {
    if (this.parts.length > 650) return;
    const a = rand(0, Math.PI * 2), s = rand(40, 160);
    this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35, max: 0.35, size: rand(1.5, 3), color, grav: 0, shape: 'spark', rot: a, vr: 0 });
  }
  spawnRing(x: number, y: number, color: string, big = false) {
    for (let i = 0; i < (big ? 14 : 8); i++) {
      if (this.parts.length > 650) return;
      const a = (i / (big ? 14 : 8)) * Math.PI * 2;
      this.parts.push({ x, y, vx: Math.cos(a) * (big ? 130 : 90), vy: Math.sin(a) * (big ? 130 : 90), life: 0.4, max: 0.4, size: 3, color, grav: 0, shape: 'circle', rot: 0, vr: 0 });
    }
  }
  floater(x: number, y: number, text: string, color: string, size = 15) {
    if (this.floaters.length > 70) this.floaters.shift();
    this.floaters.push({ x: x + rand(-8, 8), y, life: 1.4, max: 1.4, text, color, size });
  }
  pushBanner(title: string, sub: string, dur = 2.6) {
    this.banners.push({ title, sub, t: 0, dur });
    if (this.banners.length > 3) this.banners.shift();
  }
  deposit(v: Unit) {
    if (v.carry.amt <= 0) return;
    const amt = Math.floor(v.carry.amt);
    if (v.carry.type === 'wood') { this.res.wood += amt; this.woodGathered += amt; }
    else if (v.carry.type === 'food') this.res.food += amt;
    else this.res.gold += amt;
    this.gatheredTotal += amt;
    this.score += amt * 0.35;
    const cols: Record<string, string> = { wood: '#d6a45c', food: '#fda4af', gold: '#fde047' };
    const icons: Record<string, string> = { wood: '🪵', food: '🍖', gold: '🪙' };
    this.floater(v.x, v.y - 26, `+${amt} ${icons[v.carry.type]}`, cols[v.carry.type], 14);
    if (Math.random() < 0.4) { if (v.carry.type === 'gold') this.sound.coin(); }
    v.carry.amt = 0;
    this.checkQuests();
  }

  checkQuests() {
    const q = (id: string, ok: boolean, reward: () => void, msg: string) => {
      if (!this.questsDone[id] && ok) {
        this.questsDone[id] = true; reward();
        this.sound.quest();
        this.pushBanner('📜 Задание выполнено!', msg, 2.2);
      }
    };
    q('wood', this.woodGathered >= 60, () => { this.res.food += 40; }, '+40 🍖 — рубите дальше!');
    q('army', this.soldiersTrained >= 3, () => { this.res.wood += 60; this.res.gold += 40; }, '+60 🪵 +40 🪙 — время набега!');
    q('rax', this.barracksBuilt >= 1, () => { this.res.food += 80; }, '+80 🍖 — обучайте орду!');
    q('wolf', this.wolvesSlain >= 4, () => { this.res.gold += 100; }, '+100 🪙 — грозный хищник!');
    q('age', this.age >= 1, () => { this.res.wood += 120; }, '+120 🪵 — мощь феодализма!');
  }

  // ---------- update ----------
  frame(t: number) {
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (dt > 0.05) dt = 0.05;
    if (!this.paused && !this.over) this.update(dt);
    else if (this.over && !this.paused) this.updateFx(dt);
    this.render();
    this.hudT += dt;
    if (this.hudT > 0.12) { this.hudT = 0; this.pushHud(); }
  }

  updateFx(dt: number) {
    this.time += dt * 0.2;
    this.trauma = Math.max(0, this.trauma - dt * 1.2);
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 1.8);
    for (const b of this.banners) b.t += dt;
    this.banners = this.banners.filter(b => b.t < b.dur + 0.4);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt; f.y -= 34 * dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
  }

  update(dt: number) {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 1.8);
    // banners
    for (const b of this.banners) b.t += dt;
    this.banners = this.banners.filter(b => b.t < b.dur + 0.4);
    // camera keyboard + edge
    const spd = 640 / this.cam.zoom;
    let mx = 0, my = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) my -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) my += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;
    if (mx || my) { const l = Math.hypot(mx, my); this.cam.x += (mx / l) * spd * dt; this.cam.y += (my / l) * spd * dt; this.clampCam(); }
    else if (this.mouse.in && !this.mouse.isTouch && !this.box && !this.panning) {
      const m = 16;
      if (this.mouse.x < m) { this.cam.x -= spd * dt; this.clampCam(); }
      if (this.mouse.x > this.vw - m) { this.cam.x += spd * dt; this.clampCam(); }
      if (this.mouse.y < m) { this.cam.y -= spd * dt; this.clampCam(); }
      if (this.mouse.y > this.vh - m) { this.cam.y += spd * dt; this.clampCam(); }
    }

    this.updateUnits(dt);
    this.updateBuildings(dt);
    this.updateProjs(dt);
    // particles
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt; f.y -= 34 * dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i]; c.t += dt;
      if (c.t > c.life) this.corpses.splice(i, 1);
    }

    // waves
    this.waveT -= dt;
    if (this.waveT <= 8 && this.waveT + dt > 8 && !this.over) {
      this.sound.horn();
      this.pushBanner('⚠️ Набег близко!', 'Вражеский отряд идёт на ваш город!', 2.8);
    }
    if (this.waveT <= 0) { this.launchWave(); this.waveT = Math.max(34, DIFF[this.difficulty].waveInterval - this.wave * 3.2); }

    // AI tick
    this.aiT += dt;
    if (this.aiT > 0.6) { this.aiT = 0; this.enemyAI(); }

    // TC destroyed?
    const ptc = this.blds.find(b => b.owner === 'player' && b.key === 'towncenter');
    const etc = this.blds.find(b => b.owner === 'enemy' && b.key === 'towncenter');
    if (!ptc && !this.over) this.finish('defeat');
    if (!etc && !this.over) this.finish('victory');

    // quest hint rotation early
    this.hintT += dt;
    if (this.hintT > 6) {
      this.hintT = 0;
      if (this.time < 90) {
        const hints = [
          'Выберите ополченцев → ПКМ по волкам для охоты (+🍖 +очки)',
          'Крестьяне: ПКМ по дереву / ягодам / золоту — добыча',
          'Клавиши 2 / 3 — армия в казармах • Q — дом • E — казармы',
          'Стройте фермы (F) — бесконечная еда • Башни (R) — оборона',
          'Жмите T для перехода в новую эпоху, когда хватает ресурсов!',
        ];
        this.hint = hints[((this.time / 6) | 0) % hints.length];
      }
    }
  }

  updateUnits(dt: number) {
    const us = this.units;
    // separation (cheap grid-less, n small)
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 26 * 26 && d2 > 0.01) {
          const d = Math.sqrt(d2), push = (26 - d) * 0.5;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push * 0.5; a.y -= ny * push * 0.5;
          b.x += nx * push * 0.5; b.y += ny * push * 0.5;
        }
      }
    }
    for (let i = us.length - 1; i >= 0; i--) {
      const u = us[i];
      u.anim += dt * (u.state === 'idle' ? 2 : 9);
      u.cd -= dt; u.atkAnim = Math.max(0, u.atkAnim - dt * 4); u.flash = 0;
      u.retarget -= dt;
      if (u.owner === 'neutral') { this.updateWolf(u, dt); continue; }
      if (u.key === 'villager') this.updateVillager(u, dt);
      else this.updateSoldier(u, dt);
      // building collision push
      for (const b of this.blds) {
        const h = b.size / 2;
        const cx = clamp(u.x, b.x - h, b.x + h), cy = clamp(u.y, b.y - h, b.y + h);
        const dx = u.x - cx, dy = u.y - cy, d2 = dx * dx + dy * dy;
        if (d2 < 12 * 12) {
          if (d2 < 0.01) { u.x += 14 * dt * 60 * 0.016; continue; }
          const d = Math.sqrt(d2);
          u.x = cx + (dx / d) * 13; u.y = cy + (dy / d) * 13;
        }
      }
      u.x = clamp(u.x, 14, WORLD.w - 14); u.y = clamp(u.y, 14, WORLD.h - 14);
    }
  }

  moveToward(u: Unit, tx: number, ty: number, dt: number, arrive = 6): boolean {
    const dx = tx - u.x, dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < arrive) return true;
    const s = Math.min(u.speed * dt, d);
    u.x += (dx / d) * s; u.y += (dy / d) * s;
    if (Math.abs(dx) > 4) u.face = dx > 0 ? 1 : -1;
    return false;
  }

  updateVillager(u: Unit, dt: number) {
    if (u.state === 'idle') { u.idleT += dt; return; }
    if (u.state === 'move') { if (this.moveToward(u, u.tx, u.ty, dt)) u.state = 'idle'; return; }
    if (u.state === 'build') {
      const b = this.blds.find(b => b.id === u.buildId);
      if (!b || b.done >= 1) { u.state = 'idle'; u.buildId = -1; return; }
      const arrived = this.moveToward(u, u.tx, u.ty, dt, 10);
      if (arrived || dist2(u.x, u.y, b.x, b.y) < 95 * 95) {
        u.atkAnim = Math.min(1, u.atkAnim + dt * 6);
        // hammer particles handled in building update
      }
      return;
    }
    if (u.state === 'gather') {
      // farm?
      const fb = this.blds.find(b => b.id === u.buildId && b.key === 'farm');
      if (fb) {
        if (dist2(u.x, u.y, fb.x, fb.y) > 60 * 60) { this.moveToward(u, u.tx, u.ty, dt); return; }
        u.gatherT += dt; u.atkAnim = Math.min(1, u.atkAnim + dt * 7);
        if (u.gatherT > 0.55) {
          u.gatherT = 0;
          u.carry = { type: 'food', amt: u.carry.amt + 2 };
          this.burst(u.x, u.y - 8, 2, ['#a3e635', '#65a30d'], 50, 0.5);
          if (u.carry.amt >= 14) { this.res.food += Math.floor(u.carry.amt); this.gatheredTotal += u.carry.amt; this.score += u.carry.amt * 0.35; this.floater(u.x, u.y - 24, `+${Math.floor(u.carry.amt)} 🍖`, '#fda4af', 13); u.carry.amt = 0; this.checkQuests(); }
          if (Math.random() < 0.25) this.sound.gatherFood();
        }
        return;
      }
      const n = this.nodes.find(n => n.id === u.nodeId);
      if (!n || n.amount <= 0) {
        if (u.carry.amt > 0) { u.state = 'return'; this.sendToDrop(u); }
        else {
          const alt = this.nearestNode(u.x, u.y, u.carry.type || 'wood');
          if (alt && dist2(alt.x, alt.y, u.x, u.y) < 700 * 700) this.orderGather(u, alt.id);
          else u.state = 'idle';
        }
        return;
      }
      const reach = n.r + 14;
      if (dist2(u.x, u.y, n.x, n.y) > reach * reach) { this.moveToward(u, n.x, n.y, dt, reach * 0.7); return; }
      // chopping
      if (Math.abs(n.x - u.x) > 4) u.face = n.x > u.x ? 1 : -1;
      u.gatherT += dt; u.atkAnim = Math.min(1, u.atkAnim + dt * 7);
      if (u.gatherT >= 0.55) {
        u.gatherT = 0;
        const take = Math.min(2.5, n.amount);
        n.amount -= take;
        u.carry.amt += take;
        if (n.kind === 'wood') { this.burst(n.x + rand(-10, 10), n.y - 6, 3, ['#a16207', '#65a30d', '#d6a45c'], 80, 0.55); if (Math.random() < 0.5) this.sound.chop(); }
        else if (n.kind === 'gold') { this.burst(n.x, n.y - 8, 3, ['#fde047', '#facc15', '#fff'], 70, 0.5); this.spark(n.x, n.y - 10, '#fef08a'); if (Math.random() < 0.4) this.sound.mine(); }
        else { this.burst(n.x, n.y - 6, 3, ['#f472b6', '#fb7185', '#a3e635'], 60, 0.5); if (Math.random() < 0.3) this.sound.gatherFood(); }
        if (n.amount <= 0) { this.burst(n.x, n.y, 14, n.kind === 'wood' ? ['#65a30d', '#3f6212'] : n.kind === 'gold' ? ['#facc15'] : ['#fb7185'], 110, 0.7); }
        if (u.carry.amt >= 14) { u.state = 'return'; this.sendToDrop(u); }
      }
      return;
    }
    if (u.state === 'return') {
      const tc = this.nearestDrop(u);
      if (!tc) { this.deposit(u); u.state = 'idle'; return; }
      if (dist2(u.x, u.y, tc.x, tc.y) < 95 * 95) {
        this.deposit(u);
        // go back
        const fb2 = u.buildId >= 0 ? this.blds.find(b => b.id === u.buildId) : undefined;
        if (fb2 && fb2.key === 'farm') { u.state = 'gather'; }
        else {
          const n = this.nodes.find(n => n.id === u.nodeId);
          if (n && n.amount > 0) { u.state = 'gather'; }
          else {
            const alt = this.nearestNode(u.x, u.y, u.carry.type || 'wood');
            if (alt) this.orderGather(u, alt.id);
            else u.state = 'idle';
          }
        }
        return;
      }
      this.moveToward(u, tc.x + rand(-4, 4), tc.y + rand(-4, 4), dt, 80);
    }
  }

  nearestDrop(u: Unit): Bld | null {
    void u;
    let best: Bld | null = null; let bd = 1e15;
    // villagers drop at TC (farms trickle directly)
    for (const b of this.blds) {
      if (b.owner !== 'player' && u.owner === 'player') continue;
      if (b.owner !== 'enemy' && u.owner === 'enemy') continue;
      if (b.key !== 'towncenter' || b.done < 1) continue;
      const d = dist2(u.x, u.y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  sendToDrop(u: Unit) {
    const tc = this.nearestDrop(u);
    if (tc) { u.tx = tc.x; u.ty = tc.y; }
  }

  acquireEnemy(u: Unit, radius: number): { tu: number; tb: number } {
    let bu = -1, bb = -1; let bd = radius * radius;
    for (const e of this.units) {
      if (e.owner === u.owner) continue;
      if (u.owner === 'player' && e.owner === 'neutral' && u.state !== 'attackmove') {
        // villagers don't auto-aggro wolves; military does
        if (u.key === 'villager') continue;
      }
      const d = dist2(u.x, u.y, e.x, e.y);
      if (d < bd) { bd = d; bu = e.id; bb = -1; }
    }
    if (bu >= 0) return { tu: bu, tb: -1 };
    let bbd = radius * radius;
    for (const b of this.blds) {
      if (b.owner === u.owner || b.done < 0.5) continue;
      if (u.owner === 'player' && u.key === 'villager') continue;
      const d = dist2(u.x, u.y, b.x, b.y) - b.size * b.size * 0.25;
      if (d < bbd) { bbd = d; bb = b.id; }
    }
    return { tu: -1, tb: bb };
  }

  updateSoldier(u: Unit, dt: number) {
    // validate targets
    let tu = u.targetU >= 0 ? this.units.find(e => e.id === u.targetU) : undefined;
    let tb = u.targetB >= 0 ? this.blds.find(b => b.id === u.targetB) : undefined;
    if (tu && (tu.hp <= 0)) { tu = undefined; u.targetU = -1; }
    if (tb && tb.hp <= 0) { tb = undefined; u.targetB = -1; }
    // auto-acquire
    u.retarget -= 0; // already dec
    if (u.retarget <= 0 && !tu && !tb) {
      u.retarget = 0.4;
      const scan = u.state === 'attackmove' ? 260 : 170;
      const f = this.acquireEnemy(u, scan);
      if (f.tu >= 0) { u.targetU = f.tu; tu = this.units.find(e => e.id === f.tu); }
      else if (f.tb >= 0 && u.state === 'attackmove') { u.targetB = f.tb; tb = this.blds.find(b => b.id === f.tb); }
    }
    if (tu) {
      if (tu.owner === u.owner) { u.targetU = -1; }
      else {
        const d = Math.hypot(tu.x - u.x, tu.y - u.y);
        if (d <= u.range + (tu.key === 'wolf' ? 4 : 6)) {
          if (Math.abs(tu.x - u.x) > 4) u.face = tu.x > u.x ? 1 : -1;
          if (u.cd <= 0) this.strike(u, tu, undefined);
        } else {
          this.moveToward(u, tu.x, tu.y, dt, u.range * 0.7);
        }
        return;
      }
    }
    if (tb) {
      const edge = tb.size / 2 + u.range * 0.6;
      const dx = u.x - tb.x, dy = u.y - tb.y;
      const overlapX = Math.max(Math.abs(dx) - tb.size / 2, 0), overlapY = Math.max(Math.abs(dy) - tb.size / 2, 0);
      const ed = Math.hypot(overlapX, overlapY);
      if (ed <= u.range * 0.7 + 8) {
        if (Math.abs(tb.x - u.x) > 4) u.face = tb.x > u.x ? 1 : -1;
        if (u.cd <= 0) this.strike(u, undefined, tb);
      } else this.moveToward(u, tb.x, tb.y, dt, edge);
      return;
    }
    if (u.state === 'attackmove' || u.state === 'move') {
      if (this.moveToward(u, u.tx, u.ty, dt)) {
        u.state = 'idle';
        // final scan
        const f = this.acquireEnemy(u, 200);
        if (f.tu >= 0) { u.targetU = f.tu; u.state = 'attackmove'; }
      }
      return;
    }
    // idle: military auto-defends small radius
    if (u.retarget <= 0) {
      u.retarget = 0.5;
      const f = this.acquireEnemy(u, 150);
      if (f.tu >= 0) { u.targetU = f.tu; u.state = 'attackmove'; }
    }
  }

  updateWolf(u: Unit, dt: number) {
    u.cd -= 0;
    // find prey
    let prey: Unit | undefined;
    let bd = 170 * 170;
    for (const e of this.units) {
      if (e.owner === 'neutral' || e.hp <= 0) continue;
      const d = dist2(u.x, u.y, e.x, e.y);
      if (d < bd) { bd = d; prey = e; }
    }
    if (prey) {
      const d = Math.hypot(prey.x - u.x, prey.y - u.y);
      if (d < u.range + 6) {
        if (u.cd <= 0) this.strike(u, prey, undefined);
        if (Math.abs(prey.x - u.x) > 3) u.face = prey.x > u.x ? 1 : -1;
      } else this.moveToward(u, prey.x, prey.y, dt);
      return;
    }
    // leash + wander
    if (dist2(u.x, u.y, u.wx, u.wy) > 220 * 220) { this.moveToward(u, u.wx, u.wy, dt); return; }
    u.idleT += dt;
    if (u.idleT > rand(2, 4)) { u.idleT = 0; u.tx = u.wx + rand(-90, 90); u.ty = u.wy + rand(-90, 90); }
    this.moveToward(u, u.tx, u.ty, dt, 8);
  }

  strike(att: Unit, tu?: Unit, tb?: Bld) {
    const isRanged = att.key === 'archer';
    att.cd = att.key === 'archer' ? 1.35 : att.key === 'knight' ? 1.0 : att.key === 'wolf' ? 1.15 : 1.1;
    att.atkAnim = 1;
    const variance = rand(0.85, 1.15);
    const dmg = att.atk * variance;
    if (isRanged) {
      const tx = tu ? tu.x : tb ? tb.x : att.tx, ty = tu ? tu.y : tb ? tb.y : att.ty;
      const dx = tx - att.x, dy = ty - att.y, d = Math.max(1, Math.hypot(dx, dy));
      const sp = 420;
      this.projs.push({ x: att.x, y: att.y - 14, vx: (dx / d) * sp, vy: (dy / d) * sp, tx, ty, targetU: tu ? tu.id : -1, targetB: tb ? tb.id : -1, dmg, owner: att.owner, life: 1.4, kind: 'arrow' });
      this.sound.arrow();
      this.spark(att.x, att.y - 14, '#fef3c7');
    } else {
      if (tu) this.damageUnit(tu, dmg, att);
      if (tb) this.damageBld(tb, dmg, att.owner);
      this.sound.sword();
      const hx = tu ? tu.x : tb ? tb.x : att.x + att.face * 20, hy = (tu ? tu.y : tb ? tb.y : att.y) - 10;
      this.burst(hx, hy, 4, ['#fecaca', '#fff', '#f87171'], 90, 0.4);
    }
  }

  damageUnit(t: Unit, dmg: number, from?: Unit) {
    if (t.hp <= 0) return;
    t.hp -= dmg;
    this.sound.hit();
    this.spark(t.x, t.y - 12, t.owner === 'player' ? '#93c5fd' : '#fca5a5');
    if (t.owner === 'player') this.dmgFlash = Math.min(0.5, this.dmgFlash + 0.06);
    this.floaters.push({ x: t.x + rand(-6, 6), y: t.y - 30, life: 0.7, max: 0.7, text: `${Math.round(dmg)}`, color: from && from.owner === 'player' ? '#fde047' : '#fca5a5', size: 12 });
    if (this.floaters.length > 70) this.floaters.shift();
    // retaliate
    if (t.key !== 'villager' && t.owner !== 'neutral' && !from) { /* noop */ }
    if (t.owner !== 'neutral' && t.key !== 'villager' && from && t.targetU < 0 && t.targetB < 0) {
      if (from.hp !== undefined) { t.targetU = from.id; t.state = 'attackmove'; }
    }
    if (t.owner === 'neutral' && from) { /* wolves handled by proximity */ }
    if (t.hp <= 0) this.killUnit(t, from?.owner);
  }

  damageBld(b: Bld, dmg: number, byOwner: 'player' | 'enemy' | 'neutral') {
    if (b.hp <= 0) return;
    if (b.done < 1) dmg *= 1.6;
    b.hp -= dmg; b.flash = 1;
    if (b.owner === 'player') { this.dmgFlash = Math.min(0.6, this.dmgFlash + 0.09); this.trauma = Math.min(1, this.trauma + 0.06); }
    if (b.hp <= 30 && Math.random() < 0.3) this.burst(b.x + rand(-20, 20), b.y - 20, 2, ['#78716c', '#44403c'], 40, 0.8);
    if (b.hp <= 0) this.razeBld(b, byOwner);
  }

  killUnit(t: Unit, byOwner?: 'player' | 'enemy' | 'neutral') {
    t.hp = 0;
    this.units = this.units.filter(u => u.id !== t.id);
    this.selected.delete(t.id);
    this.corpses.push({ x: t.x, y: t.y, key: t.key, owner: t.owner, t: 0, life: 4, face: t.face });
    if (this.corpses.length > 40) this.corpses.shift();
    this.sound.death();
    this.burst(t.x, t.y - 8, 12, t.owner === 'player' ? ['#93c5fd', '#1e40af', '#fecaca'] : t.key === 'wolf' ? ['#9ca3af', '#4b5563'] : ['#f87171', '#7f1d1d'], 110, 0.7);
    if (byOwner === 'player' && t.owner === 'enemy') {
      this.kills++;
      this.score += SCORE.kill;
      this.res.gold += 8;
      this.floater(t.x, t.y - 34, `+${SCORE.kill} ⚔️ +8🪙`, '#fde047', 15);
      this.trauma = Math.min(1, this.trauma + 0.08);
      this.checkQuests();
    }
    if (byOwner === 'player' && t.owner === 'neutral') {
      this.wolvesSlain++;
      this.score += SCORE.wolfKill;
      this.res.food += 35;
      this.floater(t.x, t.y - 34, `+${SCORE.wolfKill} 🐺 +35🍖`, '#a3e635', 15);
      this.checkQuests();
    }
    if (t.owner === 'player') this.trauma = Math.min(1, this.trauma + 0.04);
  }

  razeBld(b: Bld, byOwner: 'player' | 'enemy' | 'neutral') {
    this.blds = this.blds.filter(x => x.id !== b.id);
    if (this.selBld === b.id) this.selBld = -1;
    // refund nodes? drop resources
    this.sound.boom();
    this.trauma = Math.min(1, this.trauma + (b.key === 'towncenter' ? 1 : 0.55));
    this.burst(b.x, b.y - 20, 46, ['#f59e0b', '#78716c', '#44403c', '#fde68a'], 220, 1.1);
    this.burst(b.x, b.y - 30, 20, ['#ef4444', '#f97316'], 160, 0.9);
    this.floater(b.x, b.y - 70, b.key === 'towncenter' ? '💥 ГОРОДСКОЙ ЦЕНТР УНИЧТОЖЕН!' : `💥 ${BUILDING_DEFS[b.key].name} разрушен(о)!`, '#f87171', b.key === 'towncenter' ? 24 : 17);
    if (byOwner === 'player' && b.owner === 'enemy') {
      this.razed++;
      const pts = b.key === 'towncenter' ? SCORE.tc : SCORE.building;
      this.score += pts;
      this.floater(b.x, b.y - 95, `+${pts} очков`, '#fde047', 16);
    }
    // free villagers building it
    for (const u of this.units) if (u.buildId === b.id) { u.buildId = -1; if (u.state === 'build') u.state = 'idle'; }
    this.pushHud();
  }

  updateBuildings(dt: number) {
    for (const b of this.blds) {
      b.flash = Math.max(0, b.flash - dt * 4);
      // construction
      if (b.done < 1) {
        const def = BUILDING_DEFS[b.key];
        let rate = b.owner === 'enemy' ? 1 / (def.buildTime * 0.8) : 1 / (def.buildTime * 2.2);
        let helpers = 0;
        for (const u of this.units) {
          if (u.owner !== b.owner || u.key !== 'villager') continue;
          if (u.buildId === b.id && dist2(u.x, u.y, b.x, b.y) < 110 * 110) {
            helpers++;
            if (Math.random() < dt * 8) this.spark(b.x + rand(-24, 24), b.y - rand(0, 30), '#f6d47c');
          }
        }
        rate *= 1 + Math.min(3, helpers) * 1.1;
        b.done = Math.min(1, b.done + rate * dt);
        b.hp = b.maxHp * b.done;
        if (b.done >= 1) {
          b.hp = b.maxHp;
          this.sound.build();
          this.burst(b.x, b.y - 30, 24, ['#f6d47c', '#a16207', '#fff'], 140, 0.8);
          this.floater(b.x, b.y - 60, `${def.name}: готово!`, '#a3e635', 16);
          if (b.owner === 'player') { for (const u of this.units) if (u.buildId === b.id && u.owner === 'player') { u.buildId = -1; u.state = 'idle'; } }
        }
        continue;
      }
      // production
      if (b.queue.length) {
        const q = b.queue[0];
        // resource trickle for enemy handled in AI; player pop check
        q.t += dt;
        if (Math.random() < dt * 3) this.spark(b.x + rand(-20, 20), b.y - 30, '#fde68a');
        if (q.t >= q.total) {
          b.queue.shift();
          const owner = b.owner;
          if (this.popUsed(owner) + UNIT_DEFS[q.key].pop <= this.popCap(owner)) {
            const sx = b.x + (b.rallyX > b.x ? 1 : -1) * (b.size / 2 + 22);
            const u = this.addUnit(q.key, owner, sx + rand(-10, 10), b.y + rand(-16, 16));
            u.tx = b.rallyX; u.ty = b.rallyY; u.state = 'move';
            if (owner === 'player' && q.key !== 'villager') { this.soldiersTrained++; this.checkQuests(); }
            this.burst(sx, b.y, 10, ['#fff', '#f6d47c'], 80, 0.5);
            if (owner === 'player') this.sound.train();
          }
        }
      }
      // defense
      const atk = BUILDING_DEFS[b.key].attack;
      if (atk) {
        b.cd -= dt;
        if (b.cd <= 0) {
          let best: Unit | null = null; let bd = atk.range * atk.range;
          for (const e of this.units) {
            if (e.owner === b.owner || e.hp <= 0) continue;
            const d = dist2(b.x, b.y - 20, e.x, e.y);
            if (d < bd) { bd = d; best = e; }
          }
          if (best) {
            b.cd = atk.cd;
            const dx = best.x - b.x, dy = best.y - b.y, d = Math.max(1, Math.hypot(dx, dy));
            this.projs.push({ x: b.x, y: b.y - 52, vx: (dx / d) * 460, vy: (dy / d) * 460, tx: best.x, ty: best.y, targetU: best.id, targetB: -1, dmg: atk.dmg * (b.owner === 'player' ? AGES[this.age].mult : AGES[this.eage].mult), owner: b.owner, life: 1.2, kind: b.key === 'towncenter' ? 'rock' : 'bolt' });
            this.sound.arrow();
          }
        }
      }
      // smoke when hurt
      if (b.hp < b.maxHp * 0.55) {
        b.smokeT += dt;
        if (b.smokeT > 0.18) {
          b.smokeT = 0;
          if (this.parts.length < 600) this.parts.push({ x: b.x + rand(-18, 18), y: b.y - 40, vx: rand(-8, 8), vy: rand(-60, -30), life: rand(0.7, 1.3), max: 1.2, size: rand(4, 8), color: b.hp < b.maxHp * 0.3 ? '#1c1917' : '#78716c', grav: -40, shape: 'circle', rot: 0, vr: 0 });
          if (b.hp < b.maxHp * 0.3 && Math.random() < 0.4) this.parts.push({ x: b.x + rand(-16, 16), y: b.y - rand(10, 40), vx: rand(-10, 10), vy: rand(-30, -10), life: 0.4, max: 0.4, size: rand(3, 6), color: '#f97316', grav: -60, shape: 'circle', rot: 0, vr: 0 });
        }
      }
    }
  }

  updateProjs(dt: number) {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      let hit = false;
      const tu = p.targetU >= 0 ? this.units.find(u => u.id === p.targetU) : undefined;
      if (tu && tu.hp > 0) {
        if (dist2(p.x, p.y, tu.x, tu.y - 10) < 20 * 20) {
          this.damageUnit(tu, p.dmg, undefined);
          // credit kills to owner side loosely for score if player-owned arrow
          if (tu.hp <= 0 && p.owner === 'player') {
            if (tu.owner === 'enemy') { this.kills++; this.score += SCORE.kill; this.res.gold += 8; this.floater(tu.x, tu.y - 30, `+${SCORE.kill} 🏹`, '#fde047', 14); }
            if (tu.owner === 'neutral') { this.wolvesSlain++; this.score += SCORE.wolfKill; this.res.food += 35; this.floater(tu.x, tu.y - 30, `+${SCORE.wolfKill} 🐺`, '#a3e635', 14); }
          }
          hit = true;
        }
      } else {
        const tb = p.targetB >= 0 ? this.blds.find(b => b.id === p.targetB) : undefined;
        if (tb && tb.hp > 0) {
          const h = tb.size / 2;
          if (Math.abs(p.x - tb.x) < h && Math.abs(p.y - (tb.y - 20)) < h + 20) { this.damageBld(tb, p.dmg, p.owner); hit = true; }
        } else if (Math.hypot(p.x - p.tx, p.y - p.ty) < 14) hit = true;
      }
      if (hit || p.life <= 0) {
        this.spark(p.x, p.y, p.kind === 'rock' ? '#d6d3d1' : '#fde68a');
        this.projs.splice(i, 1);
      }
    }
  }

  // ---------- enemy AI ----------
  launchWave() {
    this.wave++;
    const diff = DIFF[this.difficulty];
    const comp: UnitKey[] = [];
    const n = Math.round(diff.waveBase + this.wave * diff.waveGrowth);
    for (let i = 0; i < n; i++) comp.push('swordsman');
    if (this.wave >= 2) for (let i = 0; i < Math.ceil(n * 0.6); i++) comp.push('archer');
    if ((this.eage >= 1 && this.wave >= 3) || this.wave >= 5) for (let i = 0; i < Math.ceil(n * 0.4); i++) comp.push('knight');
    const etc = this.blds.find(b => b.owner === 'enemy' && b.key === 'towncenter');
    const ptc = this.blds.find(b => b.owner === 'player' && b.key === 'towncenter');
    const sx = etc ? etc.x - 120 : WORLD.w - 300, sy = etc ? etc.y + 60 : 400;
    for (const k of comp) {
      if (this.popUsed('enemy') >= this.popCap('enemy')) break;
      const u = this.addUnit(k, 'enemy', sx + rand(-60, 60), sy + rand(-50, 50));
      u.state = 'attackmove';
      u.tx = (ptc ? ptc.x : 380) + rand(-80, 80); u.ty = (ptc ? ptc.y : 1620) + rand(-80, 80);
    }
    // ensure aggression
    this.sound.horn();
    this.pushBanner(`⚔️ Волна ${this.wave} — вражеский набег!`, `${comp.length} врагов на подходе. Стройте башни! (R)`, 3);
    this.trauma = Math.min(1, this.trauma + 0.15);
  }

  enemyAI() {
    const diff = DIFF[this.difficulty];
    // trickle
    this.eres.wood += 6 * diff.enemyGather; this.eres.food += 6 * diff.enemyGather; this.eres.gold += 3.5 * diff.enemyGather;
    const etc = this.blds.find(b => b.owner === 'enemy' && b.key === 'towncenter');
    if (!etc) return;
    const evills = this.units.filter(u => u.owner === 'enemy' && u.key === 'villager');
    // train villagers
    if (evills.length < 7 + Math.min(6, this.wave) && this.eres.food >= 50 && etc.queue.length < 2 && this.popUsed('enemy') < this.popCap('enemy')) {
      this.eres.food -= 50;
      etc.queue.push({ key: 'villager', t: 0, total: 7 });
    }
    // assign idle
    for (const v of evills) {
      if (v.state !== 'idle') continue;
      const r = Math.random();
      const kind = r < 0.4 ? 'wood' : r < 0.75 ? 'food' : 'gold';
      let best: Node | null = null; let bd = 900 * 900;
      for (const n of this.nodes) { if (n.kind !== kind || n.amount <= 0) continue; const d = dist2(v.x, v.y, n.x, n.y); if (d < bd) { bd = d; best = n; } }
      if (best) { v.state = 'gather'; v.nodeId = best.id; v.carry.type = kind; }
      // enemy gather uses simplified deposit: handled below
    }
    // enemy gather tick (simplified: direct trickle when at node)
    for (const v of evills) {
      if (v.state !== 'gather') continue;
      const n = this.nodes.find(n => n.id === v.nodeId);
      if (!n || n.amount <= 0) { v.state = 'idle'; continue; }
      if (dist2(v.x, v.y, n.x, n.y) > 40 * 40) { this.moveToward(v, n.x, n.y, 0.6); continue; }
      v.gatherT += 0.6;
      if (v.gatherT > 1) {
        v.gatherT = 0;
        const take = Math.min(4, n.amount);
        n.amount -= take;
        if (n.kind === 'wood') this.eres.wood += take * 0.9;
        else if (n.kind === 'food') this.eres.food += take * 0.9;
        else this.eres.gold += take * 0.9;
        if (Math.random() < 0.3) this.burst(n.x, n.y - 8, 2, ['#a16207'], 50, 0.4);
      }
    }
    // houses
    if (this.popUsed('enemy') >= this.popCap('enemy') - 2 && this.eres.wood >= 50) {
      const houses = this.blds.filter(b => b.owner === 'enemy' && b.key === 'house').length;
      if (houses < 6) {
        this.eres.wood -= 50;
        this.addBld('house', 'enemy', etc.x + rand(-190, 190), etc.y + rand(-190, 190), 0.3);
      }
    }
    // barracks + towers
    const erax = this.blds.filter(b => b.owner === 'enemy' && b.key === 'barracks').length;
    if (this.time > 50 && erax < 1 && this.eres.wood >= 200) { this.eres.wood -= 200; this.addBld('barracks', 'enemy', etc.x - 170, etc.y - 90, 0.3); }
    if (this.time > 150 && this.eres.wood >= 120 && this.eres.gold >= 80) {
      const towers = this.blds.filter(b => b.owner === 'enemy' && b.key === 'tower').length;
      if (towers < 1 + this.wave * 0.4) { this.eres.wood -= 120; this.eres.gold -= 80; this.addBld('tower', 'enemy', etc.x + rand(-230, 230), etc.y + rand(-230, 230), 0.3); }
    }
    // age up enemy
    if (this.eage < 3) {
      const next = AGES[this.eage + 1];
      if (next.cost && this.eres.food >= next.cost.food * 0.9 && this.eres.gold >= (next.cost.gold || 0) * 0.9 && this.time > 100 + this.eage * 110) {
        this.eres.food -= next.cost.food; this.eres.gold -= next.cost.gold || 0;
        this.eage++;
        const m = AGES[this.eage].mult / AGES[this.eage - 1].mult;
        for (const u of this.units) if (u.owner === 'enemy') { u.maxHp *= m; u.hp *= m; u.atk *= m; }
        for (const b of this.blds) if (b.owner === 'enemy') { b.maxHp *= m; b.hp *= m; }
      }
    }
    // defense: enemy idle soldiers guard TC
    for (const u of this.units) {
      if (u.owner !== 'enemy' || u.key === 'villager') continue;
      if (u.state === 'idle' && dist2(u.x, u.y, etc.x, etc.y) > 320 * 320 && this.waveT > 12) {
        u.state = 'move'; u.tx = etc.x + rand(-120, 120); u.ty = etc.y + rand(-120, 120);
      }
    }
  }

  finish(result: 'victory' | 'defeat') {
    this.over = result;
    const timeBonus = result === 'victory' ? Math.max(0, 3000 - this.time * 2) : 0;
    this.score += timeBonus;
    if (result === 'victory') this.sound.win(); else this.sound.lose();
    this.trauma = 1;
    const stats: GameStats = {
      score: Math.round(this.score), kills: this.kills, razed: this.razed,
      gathered: Math.round(this.gatheredTotal), timeSec: Math.round(this.time),
      age: this.age, result, difficulty: this.difficulty,
    };
    setTimeout(() => this.onGameOver(stats), 900);
  }

  // ---------- HUD ----------
  pushHud() {
    if (this.destroyed) return;
    const sel = this.selSnapshot();
    const banner = this.banners.length ? { title: this.banners[0].title, sub: this.banners[0].sub } : null;
    const ptc = this.blds.find(b => b.owner === 'player' && b.key === 'towncenter');
    const etc = this.blds.find(b => b.owner === 'enemy' && b.key === 'towncenter');
    const idleVills = this.units.filter(u => u.owner === 'player' && u.key === 'villager' && (u.state === 'idle' || u.state === 'move')).length;
    const next = AGES[this.age + 1];
    this.onHud({
      wood: Math.floor(this.res.wood), food: Math.floor(this.res.food), gold: Math.floor(this.res.gold),
      pop: this.popUsed('player'), popCap: this.popCap('player'),
      age: this.age, ageName: AGES[this.age].name, score: Math.round(this.score), kills: this.kills, razed: this.razed,
      timeSec: Math.floor(this.time), wave: this.wave, nextWave: Math.max(0, Math.ceil(this.waveT)), enemyAge: this.eage,
      sel, placement: this.placement, attackArmed: this.attackArmed, rallyArmed: this.rallyArmed, panMode: this.panMode,
      banner,
      quests: [
        { id: 'wood', label: 'Нарубить 60 🪵', done: !!this.questsDone.wood, progress: `${Math.min(60, Math.floor(this.woodGathered))}/60` },
        { id: 'army', label: 'Обучить 3 воинов', done: !!this.questsDone.army, progress: `${Math.min(3, this.soldiersTrained)}/3` },
        { id: 'rax', label: 'Построить казармы (E)', done: !!this.questsDone.rax, progress: this.barracksBuilt ? '1/1' : '0/1' },
        { id: 'wolf', label: 'Убить 4 волка', done: !!this.questsDone.wolf, progress: `${Math.min(4, this.wolvesSlain)}/4` },
        { id: 'age', label: 'Дойти до Феодализма (T)', done: !!this.questsDone.age, progress: this.age >= 1 ? '1/1' : '0/1' },
      ],
      muted: this.muted, idleVills,
      pTc: ptc ? Math.max(0, Math.ceil(ptc.hp)) : 0, pTcMax: ptc ? ptc.maxHp : 1,
      eTc: etc ? Math.max(0, Math.ceil(etc.hp)) : 0, eTcMax: etc ? etc.maxHp : 1,
      dmgFlash: this.dmgFlash,
      ageAfford: next?.cost ? this.res.food >= next.cost.food && this.res.gold >= (next.cost.gold || 0) : false,
      ageCost: next?.cost ? `${next.cost.food}🍖${next.cost.gold ? ` ${next.cost.gold}🪙` : ''}` : 'MAX',
      hint: this.hint,
    });
  }

  selSnapshot(): SelSnapshot {
    if (this.selBld >= 0) {
      const b = this.blds.find(b => b.id === this.selBld);
      if (!b) { this.selBld = -1; return { kind: 'none' }; }
      return {
        kind: 'building', bkey: b.key, blabel: BUILDING_DEFS[b.key].name,
        hp: Math.ceil(b.hp), bmax: Math.ceil(b.maxHp), done: b.done,
        queue: b.queue.map(q => ({ key: q.key, label: UNIT_DEFS[q.key].name, t: q.t, total: q.total })),
        count: 1,
      };
    }
    const us = this.selUnits();
    if (!us.length) return { kind: 'none' };
    const map = new Map<string, number>();
    let hp = 0, max = 0;
    for (const u of us) { map.set(u.key, (map.get(u.key) || 0) + 1); hp += u.hp; max += u.maxHp; }
    return {
      kind: 'units', count: us.length,
      types: [...map.entries()].map(([key, count]) => ({ key, label: UNIT_DEFS[key as UnitKey].name, count })),
      avgHp: hp, maxHp: max,
      canGather: us.some(u => u.key === 'villager'),
    };
  }

  // ---------- render ----------
  /** Convert world→iso then to screen-relative for visibility check */
  wToScreen(wx: number, wy: number): [number, number] {
    const [ix, iy] = toIso(wx, wy);
    return [ix - this.camIsoX(), iy - this.camIsoY()];
  }
  inView(wx: number, wy: number, margin: number): boolean {
    const [sx, sy] = this.wToScreen(wx, wy);
    const hw = this.vw / 2 / this.cam.zoom + margin;
    const hh = this.vh / 2 / this.cam.zoom + margin;
    return sx > -hw && sx < hw && sy > -hh && sy < hh;
  }

  render() {
    const { ctx } = this;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // shake
    const sh = this.trauma * this.trauma;
    const shx = sh * 22 * (Math.random() * 2 - 1), shy = sh * 22 * (Math.random() * 2 - 1);
    // bg — dark to match iso style
    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.save();
    // Translate to center + shake, scale, then offset by iso camera
    ctx.translate(this.vw / 2 + shx, this.vh / 2 + shy);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.camIsoX(), -this.camIsoY());

    // ── isometric ground tiles ──
    // Tiles at world grid (wx, wy) with TILE_STEP=32.
    // toIso(32,0) = (32,16), toIso(0,32) = (-32,16) → diamonds tessellate perfectly.
    // Each cached tile canvas is (TILE_W+2) × (TILE_H+2) = 66×34, centered.
    const grassTile = getGrassTile();
    const dirtTile = getDirtTile();
    const dkGrass = getDarkGrassTile();
    const S = 32; // TILE_STEP in world units
    const margin = Math.max(this.vw, this.vh) / this.cam.zoom + 120;
    const cx0 = Math.floor((this.cam.x - margin) / S) * S;
    const cx1 = Math.ceil((this.cam.x + margin) / S) * S;
    const cy0 = Math.floor((this.cam.y - margin) / S) * S;
    const cy1 = Math.ceil((this.cam.y + margin) / S) * S;
    for (let wy = cy0; wy <= cy1; wy += S) {
      for (let wx = cx0; wx <= cx1; wx += S) {
        if (wx < -S || wx > WORLD.w + S || wy < -S || wy > WORLD.h + S) continue;
        const [ix, iy] = toIso(wx, wy);
        // pick tile variant
        const isBase = (Math.abs(wx - 380) < 180 && Math.abs(wy - 1620) < 180) || (Math.abs(wx - 2220) < 180 && Math.abs(wy - 380) < 180);
        // use a hash for variety
        const hash = ((wx * 73 + wy * 137) & 0xFFFF);
        const tile = isBase ? dirtTile : (hash % 5 === 0 ? dkGrass : grassTile);
        // tile canvas center is at (33, 17), so offset by that
        ctx.drawImage(tile, ix - 33, iy - 17);
      }
    }

    // ── decor (tiny grass tufts, flowers) ──
    for (const d of this.decor) {
      if (!this.inView(d.x, d.y, 30)) continue;
      const [dx, dy] = toIso(d.x, d.y);
      ctx.fillStyle = d.c; ctx.globalAlpha = 0.6;
      if (d.k === 0) { ctx.fillRect(dx, dy - d.s, 2, d.s + 2); }
      else { ctx.beginPath(); ctx.arc(dx, dy - 1, d.s * 0.6, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }

    // ── collect all drawables & sort by iso Y for proper depth ──
    type Drawable = { iy: number; draw: () => void };
    const drawList: Drawable[] = [];

    // nodes
    for (const n of this.nodes) {
      if (n.amount <= 0) continue;
      if (!this.inView(n.x, n.y, 80)) continue;
      const [ix, iy] = toIso(n.x, n.y);
      drawList.push({ iy, draw: () => this.drawNodeIso(n, ix, iy) });
    }
    // corpses
    for (const c of this.corpses) {
      if (!this.inView(c.x, c.y, 30)) continue;
      const [ix, iy] = toIso(c.x, c.y);
      const a = 1 - c.t / c.life;
      drawList.push({ iy, draw: () => {
        ctx.globalAlpha = Math.max(0, a) * 0.6;
        ctx.fillStyle = c.key === 'wolf' ? '#4b5563' : c.owner === 'player' ? '#1e3a8a' : '#7f1d1d';
        isoEllipse(ctx, ix, iy, 14, 14);
        ctx.fill();
        ctx.globalAlpha = 1;
      }});
    }
    // buildings
    for (const b of this.blds) {
      if (!this.inView(b.x, b.y, 200)) continue;
      const [ix, iy] = toIso(b.x, b.y);
      drawList.push({ iy, draw: () => this.drawBldIso(b, ix, iy) });
    }
    // rally flag
    if (this.selBld >= 0) {
      const b = this.blds.find(b => b.id === this.selBld);
      if (b && b.done >= 1 && (b.key === 'towncenter' || b.key === 'barracks')) {
        const [bix, biy] = toIso(b.x, b.y);
        const [rix, riy] = toIso(b.rallyX, b.rallyY);
        drawList.push({ iy: riy, draw: () => {
          ctx.strokeStyle = 'rgba(246,212,124,0.7)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(bix, biy); ctx.lineTo(rix, riy); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = '#f6d47c'; ctx.beginPath(); ctx.arc(rix, riy - 2, 5, 0, 7); ctx.fill();
          ctx.fillStyle = '#451a03'; ctx.fillRect(rix - 1, riy - 20, 3, 20);
          ctx.fillStyle = '#ef4444'; ctx.fillRect(rix + 2, riy - 20, 12, 8);
        }});
      }
    }
    // units
    for (const u of this.units) {
      if (!this.inView(u.x, u.y, 80)) continue;
      const [ix, iy] = toIso(u.x, u.y);
      drawList.push({ iy, draw: () => this.drawUnitIso(u, ix, iy) });
    }

    // sort by iso Y (depth sort)
    drawList.sort((a, b) => a.iy - b.iy);
    for (const d of drawList) d.draw();

    // ── projectiles (always on top of units) ──
    for (const p of this.projs) {
      const [px, py] = toIso(p.x, p.y);
      const [px2, py2] = toIso(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.strokeStyle = p.kind === 'rock' ? '#d6d3d1' : '#fef3c7'; ctx.lineWidth = p.kind === 'rock' ? 4 : 2.5;
      ctx.beginPath(); ctx.moveTo(px2, py2 - 16); ctx.lineTo(px, py - 16); ctx.stroke();
      if (p.kind === 'rock') { ctx.fillStyle = '#a8a29e'; ctx.beginPath(); ctx.arc(px, py - 16, 4, 0, 7); ctx.fill(); }
    }
    // ── particles ──
    for (const p of this.parts) {
      const [px, py] = toIso(p.x, p.y);
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(px, py - 6, p.size * (0.5 + a * 0.5), 0, 7); ctx.fill(); }
      else if (p.shape === 'spark') {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, py - 6); ctx.lineTo(px - Math.cos(p.rot) * 8, py - 6 - Math.sin(p.rot) * 8); ctx.stroke();
      } else {
        ctx.save(); ctx.translate(px, py - 6); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    // ── floaters (damage text etc) ──
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      const [fx, fy] = toIso(f.x, f.y);
      const a = clamp(f.life / f.max, 0, 1);
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.font = `800 ${f.size}px Inter, sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(f.text, fx, fy - 30 + (1 - a) * 20);
      ctx.fillStyle = f.color; ctx.fillText(f.text, fx, fy - 30 + (1 - a) * 20);
    }
    ctx.globalAlpha = 1;
    // ── selection box (draw in iso too) ──
    if (this.box) {
      const bw = Math.abs(this.box.x1 - this.box.x0), bh = Math.abs(this.box.y1 - this.box.y0);
      if (bw > 10 || bh > 10) {
        const bx0 = Math.min(this.box.x0, this.box.x1), by0 = Math.min(this.box.y0, this.box.y1);
        const bx1 = Math.max(this.box.x0, this.box.x1), by1 = Math.max(this.box.y0, this.box.y1);
        const corners = [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]].map(([x, y]) => toIso(x, y));
        ctx.fillStyle = 'rgba(125,211,252,0.15)';
        ctx.beginPath(); corners.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    // ── placement ghost ──
    if (this.placement && !this.paused && !this.over) {
      const mw = this.screenToWorld(this.mouse.x, this.mouse.y);
      const ok = this.placementValid(mw.x, mw.y, this.placement);
      const [gx, gy] = toIso(mw.x, mw.y);
      ctx.globalAlpha = 0.55;
      const sz = BUILDING_DEFS[this.placement].size;
      // iso diamond outline
      const hw = sz * 0.7, hh = sz * 0.35;
      ctx.beginPath(); ctx.moveTo(gx, gy - hh); ctx.lineTo(gx + hw, gy); ctx.lineTo(gx, gy + hh); ctx.lineTo(gx - hw, gy); ctx.closePath();
      ctx.fillStyle = ok ? 'rgba(163,230,53,0.4)' : 'rgba(239,68,68,0.4)';
      ctx.fill();
      ctx.strokeStyle = ok ? '#a3e635' : '#ef4444'; ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff'; ctx.font = '800 13px Inter';
      ctx.fillText(ok ? 'Клик — поставить' : 'Занято!', gx, gy - hh - 10);
      if (this.placement === 'tower') {
        ctx.strokeStyle = ok ? 'rgba(246,212,124,0.4)' : 'rgba(248,113,113,0.4)'; ctx.lineWidth = 1.5;
        isoEllipse(ctx, gx, gy, BUILDING_DEFS.tower.attack!.range * 0.7, BUILDING_DEFS.tower.attack!.range * 0.7);
        ctx.stroke();
      }
    }
    ctx.restore();

    // ── damage vignette ──
    if (this.dmgFlash > 0.02) {
      const g = ctx.createRadialGradient(this.vw / 2, this.vh / 2, Math.min(this.vw, this.vh) * 0.36, this.vw / 2, this.vh / 2, Math.max(this.vw, this.vh) * 0.72);
      g.addColorStop(0, 'rgba(220,38,38,0)');
      g.addColorStop(1, `rgba(220,38,38,${clamp(this.dmgFlash, 0, 0.5)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.vw, this.vh);
    }
    const v = ctx.createLinearGradient(0, 0, 0, 90);
    v.addColorStop(0, 'rgba(0,0,0,0.3)'); v.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, this.vw, 46);

    this.drawMinimap(ctx);
  }

  // dirt is handled via tile selection now
  dirt(_x: number, _y: number, _r: number) { void _x; void _y; void _r; }

  drawNodeIso(n: Node, ix: number, iy: number) {
    const { ctx } = this;
    if (n.kind === 'wood') drawIsoTree(ctx, ix, iy, this.time, n.phase, n.amount < n.max * 0.35);
    else if (n.kind === 'gold') drawIsoGold(ctx, ix, iy, this.time, n.phase, n.amount / n.max);
    else drawIsoBerries(ctx, ix, iy, n.phase, n.amount / n.max);
    // depletion bar
    if (n.amount < n.max) {
      const s = clamp(n.amount / n.max, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(ix - 16, iy + 10, 32, 5);
      ctx.fillStyle = n.kind === 'wood' ? '#65a30d' : n.kind === 'gold' ? '#facc15' : '#fb7185';
      ctx.fillRect(ix - 15, iy + 11, 30 * s, 3);
    }
  }

  drawNode(n: Node) {
    const { ctx } = this;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(n.x, n.y + 10, n.r + 6, (n.r + 6) * 0.35, 0, 0, 7); ctx.fill();
    if (n.kind === 'wood') {
      const sway = Math.sin(this.time * 1.2 + n.phase) * 1.8;
      const depleted = n.amount < n.max * 0.35;
      // trunk with bark detail
      ctx.fillStyle = '#5a3518';
      ctx.fillRect(n.x - 5, n.y - 16, 10, 26);
      ctx.fillStyle = '#7a4a26';
      ctx.fillRect(n.x - 3, n.y - 14, 3, 22);
      // roots
      ctx.strokeStyle = '#5a3518'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(n.x - 5, n.y + 8); ctx.lineTo(n.x - 12, n.y + 12); ctx.moveTo(n.x + 5, n.y + 8); ctx.lineTo(n.x + 12, n.y + 12); ctx.stroke();
      // main canopy — 5 overlapping circles for full roundness
      const dark = depleted ? '#3d5e28' : '#2a6324';
      const mid = depleted ? '#4a7032' : '#358430';
      const light = depleted ? '#5a8240' : '#4da34d';
      const highlight = depleted ? '#6a9250' : '#68b85c';
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(n.x + sway - 12, n.y - 18, 15, 0, 7); ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(n.x + sway + 12, n.y - 20, 14, 0, 7); ctx.fill();
      ctx.fillStyle = mid;
      ctx.beginPath(); ctx.arc(n.x + sway - 4, n.y - 28, 16, 0, 7); ctx.fill();
      ctx.fillStyle = mid;
      ctx.beginPath(); ctx.arc(n.x + sway + 6, n.y - 26, 14, 0, 7); ctx.fill();
      ctx.fillStyle = light;
      ctx.beginPath(); ctx.arc(n.x + sway, n.y - 35, 14, 0, 7); ctx.fill();
      // highlight
      ctx.fillStyle = highlight;
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(n.x + sway - 5, n.y - 38, 7, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath(); ctx.arc(n.x + sway - 6, n.y - 40, 4, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (n.kind === 'gold') {
      // larger rocky outcrop
      ctx.fillStyle = '#6b6560';
      ctx.beginPath(); ctx.ellipse(n.x, n.y - 6, 28, 20, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#57524e';
      ctx.beginPath(); ctx.ellipse(n.x + 4, n.y - 12, 22, 14, 0.2, 0, 7); ctx.fill();
      ctx.fillStyle = '#7a746e';
      ctx.beginPath(); ctx.ellipse(n.x - 8, n.y - 16, 14, 10, -0.3, 0, 7); ctx.fill();
      // gold veins
      const tw = 0.6 + Math.sin(this.time * 3 + n.phase) * 0.25;
      const s = n.amount / n.max;
      const rocks = Math.ceil(s * 7);
      for (let i = 0; i < rocks; i++) {
        const a = (n.phase + i * 1.1) % 6.28;
        const r = 6 + (i * 3.7) % 14;
        const ox = Math.cos(a) * r, oy = Math.sin(a) * r * 0.6 - 10;
        // gold nugget
        ctx.fillStyle = `rgba(253,224,71,${tw})`;
        ctx.save(); ctx.translate(n.x + ox, n.y + oy); ctx.rotate(a);
        ctx.fillRect(-4, -4, 8, 8);
        ctx.restore();
        // sparkle
        if (Math.sin(this.time * 5 + i * 2) > 0.7) {
          ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.8;
          ctx.beginPath(); ctx.arc(n.x + ox, n.y + oy - 2, 1.5, 0, 7); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    } else {
      // berry bush — lush multi-layer
      const bushes = [
        { ox: -14, oy: -6, r: 15, c: '#2a5a22' },
        { ox: 14, oy: -6, r: 15, c: '#2d6126' },
        { ox: 0, oy: -14, r: 16, c: '#357030' },
        { ox: -8, oy: -20, r: 12, c: '#3f7a33' },
        { ox: 8, oy: -18, r: 11, c: '#3d8435' },
      ];
      for (const bush of bushes) { ctx.fillStyle = bush.c; ctx.beginPath(); ctx.arc(n.x + bush.ox, n.y + bush.oy, bush.r, 0, 7); ctx.fill(); }
      // highlight
      ctx.fillStyle = 'rgba(120,210,90,0.3)';
      ctx.beginPath(); ctx.arc(n.x - 4, n.y - 22, 6, 0, 7); ctx.fill();
      // berries
      const s = n.amount / n.max;
      const berries = Math.ceil(s * 10);
      for (let i = 0; i < berries; i++) {
        const a = (n.phase + i * 0.9) % 6.28;
        const r = 4 + (i * 4.3) % 12;
        const ox = Math.cos(a) * r, oy = Math.sin(a) * r * 0.55 - 12;
        ctx.fillStyle = i % 3 === 0 ? '#e11d48' : i % 3 === 1 ? '#fb7185' : '#f43f5e';
        ctx.beginPath(); ctx.arc(n.x + ox, n.y + oy, 3.2, 0, 7); ctx.fill();
        // berry highlight
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.arc(n.x + ox - 1, n.y + oy - 1, 1.2, 0, 7); ctx.fill();
      }
    }
    // depletion bar
    if (n.amount < n.max) {
      const s = clamp(n.amount / n.max, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(n.x - 18, n.y + 16, 36, 5);
      ctx.fillStyle = n.kind === 'wood' ? '#65a30d' : n.kind === 'gold' ? '#facc15' : '#fb7185';
      ctx.fillRect(n.x - 17, n.y + 17, 34 * s, 3);
    }
  }

  drawBldIso(b: Bld, ix: number, iy: number) {
    const { ctx } = this;
    const selected = this.selBld === b.id;
    const under = b.done < 1;
    const fl = b.flash > 0;
    const wave = Math.sin(this.time * 3 + b.x) * 2.5;
    // selection ring
    if (selected) {
      const pulse = 1 + Math.sin(this.time * 5) * 0.04;
      ctx.strokeStyle = '#f6d47c'; ctx.lineWidth = 2.5;
      isoEllipse(ctx, ix, iy + 6, (b.size * 0.5 + 12) * pulse, (b.size * 0.5 + 12) * pulse);
      ctx.stroke();
      ctx.fillStyle = 'rgba(246,212,124,0.08)';
      ctx.fill();
    }
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    isoEllipse(ctx, ix + 4, iy + 8, b.size * 0.45, b.size * 0.45);
    ctx.fill();
    if (under) {
      // scaffolding — wireframe box
      const h = b.size * 0.8 * b.done;
      isoBox(ctx, ix, iy, b.size * 0.7, b.size * 0.35, h, 'rgba(180,160,130,0.6)', 'rgba(140,120,90,0.5)', 'rgba(120,100,70,0.5)');
      // scaffold lines
      ctx.strokeStyle = '#a57a42'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ix - b.size * 0.35, iy); ctx.lineTo(ix - b.size * 0.35, iy - h); ctx.moveTo(ix + b.size * 0.35, iy); ctx.lineTo(ix + b.size * 0.35, iy - h); ctx.stroke();
      // progress
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(ix - 28, iy - h - 16, 56, 8);
      ctx.fillStyle = '#a3e635'; ctx.fillRect(ix - 27, iy - h - 15, 54 * b.done, 6);
      return;
    }
    const tc = fl ? '#fecaca' : undefined;
    if (b.key === 'towncenter') {
      // large hall: stone base + wooden upper + colored roof
      isoBox(ctx, ix, iy, 90, 45, 14, tc || '#a8a29e', tc || '#78716c', tc || '#8a847c');
      isoBox(ctx, ix, iy, 78, 39, 38, tc || '#92400e', tc || '#7a3408', tc || '#834010');
      // windows
      ctx.fillStyle = '#fde68a'; ctx.globalAlpha = 0.7 + Math.sin(this.time * 2) * 0.15;
      ctx.fillRect(ix - 18, iy - 34, 7, 7); ctx.fillRect(ix + 11, iy - 34, 7, 7);
      ctx.globalAlpha = 1;
      // door
      ctx.fillStyle = '#451a03'; ctx.fillRect(ix - 5, iy - 20, 10, 14);
      ctx.fillStyle = 'rgba(253,230,138,0.5)'; ctx.fillRect(ix - 4, iy - 18, 8, 10);
      // roof
      isoRoof(ctx, ix, iy - 38, 88, 44, 30, b.owner === 'player' ? '#1d4ed8' : '#b91c1c', b.owner === 'player' ? '#2563eb' : '#dc2626');
      // flag
      ctx.fillStyle = '#3f2208'; ctx.fillRect(ix + 28, iy - 88, 3, 30);
      ctx.fillStyle = b.owner === 'player' ? '#2563eb' : '#dc2626';
      ctx.beginPath(); ctx.moveTo(ix + 31, iy - 88); ctx.quadraticCurveTo(ix + 46, iy - 86 + wave, ix + 52, iy - 80 + wave); ctx.lineTo(ix + 31, iy - 76); ctx.closePath(); ctx.fill();
      // gold trim
      ctx.fillStyle = '#f6d47c'; ctx.fillRect(ix - 44, iy + 12, 88, 3);
    } else if (b.key === 'house') {
      isoBox(ctx, ix, iy, 48, 24, 10, tc || '#c49a6c', tc || '#a07850', tc || '#b08860');
      isoBox(ctx, ix, iy, 42, 21, 24, tc || '#b08968', tc || '#8a6a48', tc || '#9a7a58');
      ctx.fillStyle = '#451a03'; ctx.fillRect(ix - 4, iy - 14, 8, 12);
      ctx.fillStyle = 'rgba(253,230,138,0.45)'; ctx.fillRect(ix - 3, iy - 12, 6, 8);
      isoRoof(ctx, ix, iy - 24, 52, 26, 18, tc || (b.owner === 'player' ? '#2563eb' : '#dc2626'), tc || '#7c4a21');
      // chimney
      ctx.fillStyle = '#78716c'; ctx.fillRect(ix + 14, iy - 40, 6, 10);
    } else if (b.key === 'barracks') {
      isoBox(ctx, ix, iy, 78, 39, 10, tc || '#8a7a6a', tc || '#6b6258', tc || '#7a726a');
      isoBox(ctx, ix, iy, 70, 35, 30, tc || '#8a6a45', tc || '#6a5030', tc || '#7a5a3a');
      // crossed swords
      ctx.strokeStyle = '#f6d47c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ix - 10, iy - 34); ctx.lineTo(ix + 10, iy - 16); ctx.moveTo(ix + 10, iy - 34); ctx.lineTo(ix - 10, iy - 16); ctx.stroke();
      // door
      ctx.fillStyle = '#f6d47c'; ctx.fillRect(ix - 6, iy - 14, 12, 14);
      ctx.fillStyle = '#4a3218'; ctx.fillRect(ix - 1, iy - 14, 2, 14);
      isoRoof(ctx, ix, iy - 30, 80, 40, 22, tc || '#7a4a22', tc || '#5c3618');
      // queue bar
      if (b.queue.length) {
        const q = b.queue[0];
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(ix - 28, iy - 64, 56, 10);
        ctx.fillStyle = '#f6d47c'; ctx.fillRect(ix - 27, iy - 63, 54 * clamp(q.t / q.total, 0, 1), 8);
        ctx.fillStyle = '#fff'; ctx.font = '700 8px Inter'; ctx.textAlign = 'center';
        ctx.fillText(UNIT_DEFS[q.key].name, ix, iy - 56);
        if (b.queue.length > 1) { ctx.fillText(`+${b.queue.length - 1}`, ix + 34, iy - 56); }
      }
    } else if (b.key === 'tower') {
      isoBox(ctx, ix, iy, 36, 18, 50, tc || '#a09890', tc || '#78726c', tc || '#8a847c');
      // crenellations
      for (let i = -2; i <= 2; i++) {
        ctx.fillStyle = tc || '#6b6258';
        ctx.fillRect(ix + i * 8 - 3, iy - 54, 6, 6);
      }
      // arrow slit
      ctx.fillStyle = '#1c1917'; ctx.fillRect(ix - 1.5, iy - 28, 3, 14);
      // flag
      ctx.fillStyle = '#3f2208'; ctx.fillRect(ix - 1, iy - 80, 3, 28);
      ctx.fillStyle = b.owner === 'player' ? '#2563eb' : '#dc2626';
      ctx.beginPath(); ctx.moveTo(ix + 2, iy - 80); ctx.quadraticCurveTo(ix + 14, iy - 78 + wave, ix + 20, iy - 72 + wave); ctx.lineTo(ix + 2, iy - 68); ctx.closePath(); ctx.fill();
    } else if (b.key === 'farm') {
      // tilled diamond
      const fw = 60, fh = 30;
      ctx.beginPath(); ctx.moveTo(ix, iy - fh / 2); ctx.lineTo(ix + fw / 2, iy); ctx.lineTo(ix, iy + fh / 2); ctx.lineTo(ix - fw / 2, iy); ctx.closePath();
      ctx.fillStyle = tc || '#6b4c28'; ctx.fill();
      ctx.strokeStyle = '#a37c42'; ctx.lineWidth = 2; ctx.stroke();
      // furrow lines
      ctx.strokeStyle = tc || '#8a6538'; ctx.lineWidth = 1.5;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(ix - fw / 2 + 8 + Math.abs(i) * 4, iy + i * 5); ctx.lineTo(ix + fw / 2 - 8 - Math.abs(i) * 4, iy + i * 5); ctx.stroke();
      }
      // wheat stalks
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        const wx = ix - 16 + c * 10, wy = iy - 8 + r * 8;
        const sw = Math.sin(this.time * 2.4 + wx * 0.15 + r) * 2;
        ctx.strokeStyle = '#85a832'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(wx, wy + 5); ctx.quadraticCurveTo(wx + sw, wy, wx + sw, wy - 4); ctx.stroke();
        ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(wx + sw, wy - 5, 2, 0, 7); ctx.fill();
      }
    }
    // HP bar
    if (b.hp < b.maxHp || selected) {
      const barW = Math.max(40, b.size * 0.6);
      const barY = b.key === 'towncenter' ? iy - 96 : b.key === 'tower' ? iy - 86 : iy - b.size * 0.6 - 16;
      const s = clamp(b.hp / b.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(ix - barW / 2, barY, barW, 7);
      ctx.fillStyle = s > 0.6 ? '#4ade80' : s > 0.3 ? '#facc15' : '#ef4444';
      ctx.fillRect(ix - barW / 2 + 1, barY + 1, (barW - 2) * s, 5);
    }
  }

  drawBld(b: Bld) {
    const { ctx } = this;
    const selected = this.selBld === b.id;
    const under = b.done < 1;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(b.x, b.y + b.size * 0.44, b.size * 0.6, b.size * 0.22, 0, 0, 7); ctx.fill();
    if (selected) {
      const pulse = 1 + Math.sin(this.time * 5) * 0.04;
      ctx.strokeStyle = '#f6d47c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(b.x, b.y + 6, (b.size / 2 + 14) * pulse, (b.size / 2 + 8) * pulse, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.ellipse(b.x, b.y + 6, (b.size / 2 + 14) * pulse, (b.size / 2 + 8) * pulse, 0, 0, 7); ctx.fillStyle = 'rgba(246,212,124,0.15)'; ctx.fill(); ctx.globalAlpha = 1;
    }
    if (under) {
      // scaffolding — wooden frame rising
      ctx.fillStyle = '#8b5e2e';
      const h = b.size, wdt = b.size;
      ctx.fillRect(b.x - wdt / 2, b.y - h / 2 - 20, 7, h + 10); ctx.fillRect(b.x + wdt / 2 - 7, b.y - h / 2 - 20, 7, h + 10);
      ctx.fillStyle = '#a57a42';
      for (let i = 0; i < 4; i++) ctx.fillRect(b.x - wdt / 2, b.y - h / 2 - 20 + i * (h / 3.5), wdt, 5);
      // diagonal cross brace
      ctx.strokeStyle = '#8b5e2e'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.x - wdt / 2, b.y - h / 2 - 20); ctx.lineTo(b.x + wdt / 2, b.y + h / 2 - 10); ctx.stroke();
      // rising structure fading in
      ctx.globalAlpha = 0.5 + b.done * 0.4;
      const hh = (h + 20) * b.done;
      ctx.fillStyle = '#b8a892';
      ctx.fillRect(b.x - wdt / 2 + 10, b.y + h / 2 - 10 - hh, wdt - 20, hh);
      ctx.globalAlpha = 1;
      // progress bar above
      const by = b.y - h / 2 - 32;
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(b.x - 36, by, 72, 9);
      ctx.fillStyle = '#a3e635'; ctx.fillRect(b.x - 35, by + 1, 70 * b.done, 7);
      ctx.fillStyle = '#fff'; ctx.font = '700 8px Inter'; ctx.textAlign = 'center'; ctx.fillText(`${Math.round(b.done * 100)}%`, b.x, by + 8);
      return;
    }
    const fl = b.flash > 0;
    const wave = Math.sin(this.time * 3 + b.x) * 2.5;
    if (b.key === 'towncenter') {
      // stone foundation with texture
      ctx.fillStyle = fl ? '#fecaca' : '#a8a29e';
      ctx.fillRect(b.x - 64, b.y - 8, 128, 48);
      ctx.fillStyle = fl ? '#f87171' : '#8a8580';
      ctx.fillRect(b.x - 64, b.y - 8, 128, 5);
      ctx.fillRect(b.x - 64, b.y + 36, 128, 4);
      // stone lines
      ctx.fillStyle = fl ? '#fca5a5' : '#78716c';
      for (let i = 0; i < 5; i++) ctx.fillRect(b.x - 64 + i * 26, b.y - 3, 2, 40);
      for (let i = 0; i < 3; i++) ctx.fillRect(b.x - 62, b.y + 3 + i * 13, 124, 2);
      // main hall body
      ctx.fillStyle = fl ? '#fca5a5' : '#92400e';
      ctx.fillRect(b.x - 50, b.y - 56, 100, 52);
      // wooden planks
      ctx.fillStyle = fl ? '#fecaca' : '#a35a12';
      ctx.fillRect(b.x - 50, b.y - 56, 100, 6);
      ctx.fillRect(b.x - 50, b.y - 10, 100, 6);
      // timbers
      ctx.fillStyle = '#5c3618';
      ctx.fillRect(b.x - 50, b.y - 56, 5, 52); ctx.fillRect(b.x + 45, b.y - 56, 5, 52);
      ctx.fillRect(b.x - 2, b.y - 56, 4, 52);
      // main roof — steep triangular with colored panels
      const roofC = b.owner === 'player' ? '#1d4ed8' : '#b91c1c';
      const roofL = b.owner === 'player' ? '#2563eb' : '#dc2626';
      ctx.fillStyle = roofC;
      ctx.beginPath(); ctx.moveTo(b.x - 60, b.y - 54); ctx.lineTo(b.x, b.y - 100); ctx.lineTo(b.x + 60, b.y - 54); ctx.closePath(); ctx.fill();
      // left highlight
      ctx.fillStyle = roofL;
      ctx.beginPath(); ctx.moveTo(b.x - 60, b.y - 54); ctx.lineTo(b.x, b.y - 100); ctx.lineTo(b.x - 12, b.y - 54); ctx.closePath(); ctx.fill();
      // roof ridge line
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y - 100); ctx.lineTo(b.x - 60, b.y - 54); ctx.stroke();
      // roof trim
      ctx.fillStyle = '#f6d47c'; ctx.fillRect(b.x - 62, b.y - 56, 124, 4);
      // door — arched
      ctx.fillStyle = '#451a03';
      ctx.fillRect(b.x - 10, b.y - 28, 20, 28);
      ctx.beginPath(); ctx.arc(b.x, b.y - 28, 10, Math.PI, 0); ctx.fill();
      // door glow
      ctx.fillStyle = '#fde68a'; ctx.globalAlpha = 0.6 + Math.sin(this.time * 2.5) * 0.2;
      ctx.fillRect(b.x - 8, b.y - 24, 16, 22);
      ctx.globalAlpha = 1;
      // windows
      ctx.fillStyle = '#451a03';
      ctx.fillRect(b.x - 38, b.y - 44, 14, 14); ctx.fillRect(b.x + 24, b.y - 44, 14, 14);
      ctx.fillStyle = '#fef3c7'; ctx.globalAlpha = 0.7 + Math.sin(this.time * 2.2) * 0.15;
      ctx.fillRect(b.x - 36, b.y - 42, 10, 10); ctx.fillRect(b.x + 26, b.y - 42, 10, 10);
      ctx.globalAlpha = 1;
      // window cross
      ctx.strokeStyle = '#451a03'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(b.x - 31, b.y - 42); ctx.lineTo(b.x - 31, b.y - 32); ctx.moveTo(b.x - 36, b.y - 37); ctx.lineTo(b.x - 26, b.y - 37); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.x + 31, b.y - 42); ctx.lineTo(b.x + 31, b.y - 32); ctx.moveTo(b.x + 26, b.y - 37); ctx.lineTo(b.x + 36, b.y - 37); ctx.stroke();
      // banner pole
      ctx.fillStyle = '#3f2208'; ctx.fillRect(b.x + 34, b.y - 118, 4, 46);
      // waving flag
      ctx.fillStyle = b.owner === 'player' ? '#2563eb' : '#dc2626';
      ctx.beginPath(); ctx.moveTo(b.x + 38, b.y - 118); ctx.quadraticCurveTo(b.x + 56, b.y - 115 + wave, b.x + 66, b.y - 108 + wave); ctx.lineTo(b.x + 38, b.y - 100); ctx.closePath(); ctx.fill();
      // flag emblem dot
      ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(b.x + 50, b.y - 109, 3, 0, 7); ctx.fill();
      // foundation gold trim
      ctx.fillStyle = '#f6d47c'; ctx.fillRect(b.x - 64, b.y + 36, 128, 4);
    } else if (b.key === 'house') {
      // walls
      ctx.fillStyle = fl ? '#fecaca' : '#c49a6c';
      ctx.fillRect(b.x - 28, b.y - 20, 56, 38);
      // wall highlights
      ctx.fillStyle = fl ? '#fda4af' : '#d4aa7c';
      ctx.fillRect(b.x - 28, b.y - 20, 20, 38);
      // timber frame
      ctx.strokeStyle = '#5c3618'; ctx.lineWidth = 3;
      ctx.strokeRect(b.x - 28, b.y - 20, 56, 38);
      ctx.beginPath(); ctx.moveTo(b.x, b.y - 20); ctx.lineTo(b.x, b.y + 18); ctx.stroke();
      // roof — thatched
      ctx.fillStyle = fl ? '#f87171' : '#8a5e28';
      ctx.beginPath(); ctx.moveTo(b.x - 34, b.y - 18); ctx.lineTo(b.x, b.y - 52); ctx.lineTo(b.x + 34, b.y - 18); ctx.closePath(); ctx.fill();
      // roof color patch (team)
      ctx.fillStyle = b.owner === 'player' ? '#2563eb' : '#dc2626';
      ctx.beginPath(); ctx.moveTo(b.x - 34, b.y - 18); ctx.lineTo(b.x, b.y - 52); ctx.lineTo(b.x - 10, b.y - 18); ctx.closePath(); ctx.fill();
      // roof highlight
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.moveTo(b.x - 34, b.y - 18); ctx.lineTo(b.x, b.y - 52); ctx.lineTo(b.x - 8, b.y - 18); ctx.closePath(); ctx.fill();
      // door
      ctx.fillStyle = '#5c3618'; ctx.fillRect(b.x - 8, b.y - 4, 16, 22);
      ctx.fillStyle = '#fde68a'; ctx.globalAlpha = 0.5; ctx.fillRect(b.x - 6, b.y - 2, 12, 18); ctx.globalAlpha = 1;
      // windows
      ctx.fillStyle = '#5c3618'; ctx.fillRect(b.x - 24, b.y - 12, 10, 10); ctx.fillRect(b.x + 14, b.y - 12, 10, 10);
      ctx.fillStyle = '#fef3c7'; ctx.fillRect(b.x - 22, b.y - 10, 6, 6); ctx.fillRect(b.x + 16, b.y - 10, 6, 6);
      // chimney
      ctx.fillStyle = '#78716c'; ctx.fillRect(b.x + 18, b.y - 48, 8, 16);
      ctx.fillStyle = '#6b6560'; ctx.fillRect(b.x + 17, b.y - 50, 10, 5);
    } else if (b.key === 'barracks') {
      // stone base
      ctx.fillStyle = fl ? '#fecaca' : '#8a7a6a';
      ctx.fillRect(b.x - 50, b.y - 18, 100, 50);
      // darker stone lower half
      ctx.fillStyle = fl ? '#fda4af' : '#6b6258';
      ctx.fillRect(b.x - 50, b.y + 8, 100, 24);
      // timber frame
      ctx.strokeStyle = '#4a3218'; ctx.lineWidth = 3;
      ctx.strokeRect(b.x - 50, b.y - 18, 100, 50);
      ctx.beginPath(); ctx.moveTo(b.x, b.y - 18); ctx.lineTo(b.x, b.y + 32); ctx.stroke();
      // roof — military style steep
      ctx.fillStyle = fl ? '#fca5a5' : '#7a4a22';
      ctx.beginPath(); ctx.moveTo(b.x - 56, b.y - 16); ctx.lineTo(b.x, b.y - 62); ctx.lineTo(b.x + 56, b.y - 16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath(); ctx.moveTo(b.x, b.y - 62); ctx.lineTo(b.x + 56, b.y - 16); ctx.lineTo(b.x + 10, b.y - 16); ctx.closePath(); ctx.fill();
      // crossed swords emblem on roof
      ctx.strokeStyle = '#e7e5e4'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(b.x - 14, b.y - 44); ctx.lineTo(b.x + 14, b.y - 20); ctx.moveTo(b.x + 14, b.y - 44); ctx.lineTo(b.x - 14, b.y - 20); ctx.stroke();
      ctx.strokeStyle = '#f6d47c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.x - 14, b.y - 44); ctx.lineTo(b.x + 14, b.y - 20); ctx.moveTo(b.x + 14, b.y - 44); ctx.lineTo(b.x - 14, b.y - 20); ctx.stroke();
      // door (large)
      ctx.fillStyle = '#4a3218'; ctx.fillRect(b.x - 12, b.y - 2, 24, 34);
      ctx.fillStyle = '#f6d47c'; ctx.fillRect(b.x - 10, b.y, 20, 30);
      ctx.fillStyle = '#4a3218'; ctx.fillRect(b.x - 1, b.y, 2, 30);
      // weapon racks on sides
      ctx.strokeStyle = '#a8a29e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x - 36, b.y + 8); ctx.lineTo(b.x - 36, b.y - 8); ctx.moveTo(b.x + 36, b.y + 8); ctx.lineTo(b.x + 36, b.y - 8); ctx.stroke();
      ctx.strokeStyle = '#d6d3d1'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x - 40, b.y - 2); ctx.lineTo(b.x - 32, b.y - 12); ctx.moveTo(b.x + 40, b.y - 2); ctx.lineTo(b.x + 32, b.y - 12); ctx.stroke();
      // queue pips
      if (b.queue.length) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(b.x - 34, b.y - 76, 68, 12);
        const q = b.queue[0];
        ctx.fillStyle = '#f6d47c'; ctx.fillRect(b.x - 33, b.y - 75, 66 * clamp(q.t / q.total, 0, 1), 10);
        ctx.fillStyle = '#fff'; ctx.font = '700 8px Inter'; ctx.textAlign = 'center';
        ctx.fillText(`${UNIT_DEFS[q.key].name}`, b.x, b.y - 66);
        if (b.queue.length > 1) { ctx.fillStyle = '#fde68a'; ctx.font = '800 11px Inter'; ctx.fillText(`+${b.queue.length - 1}`, b.x + 42, b.y - 67); }
      }
    } else if (b.key === 'tower') {
      // tower body — stone cylinder
      ctx.fillStyle = fl ? '#fecaca' : '#a09890';
      ctx.fillRect(b.x - 22, b.y - 52, 44, 72);
      // stone lines
      ctx.fillStyle = fl ? '#f87171' : '#8a847c';
      for (let i = 0; i < 6; i++) ctx.fillRect(b.x - 22, b.y - 52 + i * 12, 44, 2);
      // vertical stone joints
      ctx.fillStyle = fl ? '#fca5a5' : '#78726c';
      for (let i = 0; i < 3; i++) ctx.fillRect(b.x - 22 + (i + 1) * 11, b.y - 52, 2, 72);
      // battlements top
      ctx.fillStyle = fl ? '#fca5a5' : '#6b6258';
      ctx.fillRect(b.x - 30, b.y - 70, 60, 22);
      // crenellations
      ctx.fillStyle = fl ? '#fda4af' : '#7a746c';
      for (let i = 0; i < 5; i++) ctx.fillRect(b.x - 28 + i * 13, b.y - 76, 9, 10);
      // arrow slit
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(b.x - 2, b.y - 24, 4, 18);
      ctx.fillRect(b.x - 6, b.y - 16, 12, 3);
      // flag pole
      ctx.fillStyle = '#3f2208'; ctx.fillRect(b.x - 2, b.y - 106, 4, 36);
      ctx.fillStyle = b.owner === 'player' ? '#2563eb' : '#dc2626';
      ctx.beginPath(); ctx.moveTo(b.x + 2, b.y - 106); ctx.quadraticCurveTo(b.x + 18, b.y - 103 + wave, b.x + 26, b.y - 96 + wave); ctx.lineTo(b.x + 2, b.y - 90); ctx.closePath(); ctx.fill();
    } else if (b.key === 'farm') {
      // dirt plot
      ctx.fillStyle = fl ? '#7f1d1d' : '#6b4c28';
      ctx.fillRect(b.x - 36, b.y - 30, 72, 60);
      // tilled rows
      ctx.fillStyle = fl ? '#991b1b' : '#8a6538';
      for (let i = 0; i < 5; i++) ctx.fillRect(b.x - 36, b.y - 30 + i * 13, 72, 4);
      // fence
      ctx.strokeStyle = '#a37c42'; ctx.lineWidth = 3;
      ctx.strokeRect(b.x - 38, b.y - 32, 76, 64);
      // fence posts
      ctx.fillStyle = '#8a6230';
      ctx.fillRect(b.x - 40, b.y - 34, 5, 8); ctx.fillRect(b.x + 35, b.y - 34, 5, 8);
      ctx.fillRect(b.x - 40, b.y + 26, 5, 8); ctx.fillRect(b.x + 35, b.y + 26, 5, 8);
      // wheat rows swaying
      for (let r = 0; r < 4; r++) for (let cIdx = 0; cIdx < 7; cIdx++) {
        const wx = b.x - 28 + cIdx * 9, wy = b.y - 20 + r * 13;
        const sw = Math.sin(this.time * 2.4 + wx * 0.15 + r) * 3;
        // stalk
        ctx.strokeStyle = '#85a832'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(wx, wy + 10); ctx.quadraticCurveTo(wx + sw * 0.5, wy + 3, wx + sw, wy - 5); ctx.stroke();
        // wheat head
        ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.ellipse(wx + sw, wy - 6, 2.5, 4, sw * 0.1, 0, 7); ctx.fill();
      }
    }
    // hp bar
    if (b.hp < b.maxHp || selected) {
      const wdt = Math.max(56, b.size * 0.9);
      const barY = b.key === 'towncenter' ? b.y - 124 : b.key === 'tower' ? b.y - 112 : b.y - b.size / 2 - 28;
      const s = clamp(b.hp / b.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(b.x - wdt / 2, barY, wdt, 7);
      ctx.fillStyle = s > 0.6 ? '#4ade80' : s > 0.3 ? '#facc15' : '#ef4444';
      ctx.fillRect(b.x - wdt / 2 + 1, barY + 1, (wdt - 2) * s, 5);
    }
  }

  drawBldGhost(_key: BuildingKey, _x: number, _y: number, _ok: boolean) {
    // handled inline in render() with iso diamond
    void _key; void _x; void _y; void _ok;
  }

  drawUnitIso(u: Unit, ix: number, iy: number) {
    const { ctx } = this;
    const sel = this.selected.has(u.id);
    const bob = u.state === 'idle' ? Math.sin(u.anim) * 1.5 : Math.abs(Math.sin(u.anim)) * -3;
    const lunge = u.atkAnim * 6 * u.face;
    const sy = iy + bob; const sx = ix + lunge;
    const blue = u.owner === 'player'; const red = u.owner === 'enemy';
    const team = blue ? '#2563eb' : red ? '#dc2626' : '#6b7280';
    const teamDk = blue ? '#1e3a8a' : red ? '#7f1d1d' : '#4b5563';
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    isoEllipse(ctx, ix, iy + 6, u.key === 'knight' ? 18 : 12, u.key === 'knight' ? 18 : 12);
    ctx.fill();
    // selection ring
    if (sel) {
      ctx.strokeStyle = u.key === 'villager' ? '#a3e635' : '#7dd3fc'; ctx.lineWidth = 2.5;
      isoEllipse(ctx, ix, iy + 6, 18, 18); ctx.stroke();
      const pr = 18 + ((this.time * 20) % 12);
      ctx.globalAlpha = 1 - ((this.time * 20) % 12) / 12;
      isoEllipse(ctx, ix, iy + 6, pr, pr); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // carry icon
    if (u.key === 'villager' && u.carry.amt > 1) {
      ctx.font = '12px Inter'; ctx.textAlign = 'center';
      ctx.fillText(u.carry.type === 'wood' ? '🪵' : u.carry.type === 'food' ? '🍖' : '🪙', sx + 16, sy - 28);
    }
    if (u.key === 'wolf') {
      // body ellipse
      ctx.fillStyle = '#7a7e85';
      ctx.beginPath(); ctx.ellipse(sx, sy - 4, 16, 8, 0.3 * u.face, 0, 7); ctx.fill();
      ctx.fillStyle = '#9ca3af';
      ctx.beginPath(); ctx.ellipse(sx, sy - 2, 10, 4, 0, 0, 7); ctx.fill();
      // head
      ctx.fillStyle = '#5b5f66';
      ctx.beginPath(); ctx.arc(sx + u.face * 14, sy - 8, 8, 0, 7); ctx.fill();
      // ears
      ctx.fillStyle = '#4b5563';
      ctx.beginPath(); ctx.moveTo(sx + u.face * 10, sy - 14); ctx.lineTo(sx + u.face * 13, sy - 22); ctx.lineTo(sx + u.face * 16, sy - 14); ctx.closePath(); ctx.fill();
      // eyes
      ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(sx + u.face * 16, sy - 10, 2, 0, 7); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(sx + u.face * 16, sy - 10, 1, 0, 7); ctx.fill();
      // tail
      ctx.strokeStyle = '#5b5f66'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(sx - u.face * 14, sy - 2); ctx.quadraticCurveTo(sx - u.face * 22, sy - 10 + Math.sin(u.anim * 1.6) * 3, sx - u.face * 20, sy - 16); ctx.stroke();
      // legs
      ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 3.5;
      const lp = Math.sin(u.anim) * 5;
      ctx.beginPath(); ctx.moveTo(sx - 6, sy + 3); ctx.lineTo(sx - 6 + lp, sy + 10); ctx.moveTo(sx + 6, sy + 3); ctx.lineTo(sx + 6 - lp, sy + 10); ctx.stroke();
    } else if (u.key === 'villager') {
      const lp = u.state === 'idle' ? 0 : Math.sin(u.anim) * 5;
      // legs
      ctx.strokeStyle = '#5c4033'; ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.moveTo(sx - 4, sy + 2); ctx.lineTo(sx - 4 + lp, sy + 14); ctx.moveTo(sx + 4, sy + 2); ctx.lineTo(sx + 4 - lp, sy + 14); ctx.stroke();
      // body — iso box shape
      isoBox(ctx, sx, sy, 18, 9, 14, '#b07520', '#8a5a15', '#9a6a1a');
      // belt
      ctx.fillStyle = '#5c3618'; ctx.fillRect(sx - 8, sy - 3, 16, 3);
      ctx.fillStyle = '#f6d47c'; ctx.fillRect(sx - 2, sy - 3, 4, 3);
      // team stripe
      ctx.fillStyle = team; ctx.fillRect(sx - 8, sy - 12, 16, 4);
      // head
      ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(sx, sy - 20, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#2d1b0e'; ctx.beginPath(); ctx.arc(sx + u.face * 3, sy - 21, 1.3, 0, 7); ctx.fill();
      // hat
      ctx.fillStyle = '#6b3a10'; ctx.beginPath(); ctx.arc(sx, sy - 23, 8, Math.PI, 0); ctx.fill();
      ctx.fillRect(sx - 9, sy - 23, 18, 3);
      // tool
      const sw = u.atkAnim > 0 ? u.atkAnim * 1.2 : 0.3;
      ctx.save(); ctx.translate(sx + u.face * 8, sy - 8); ctx.rotate(u.face * sw);
      ctx.strokeStyle = '#78450f'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(u.face * 12, -12); ctx.stroke();
      ctx.fillStyle = '#b8b8b8'; ctx.fillRect(u.face * 10 - 2, -16, 5, 6);
      ctx.restore();
    } else if (u.key === 'swordsman') {
      const lp = u.state === 'idle' ? 0 : Math.sin(u.anim) * 5;
      ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(sx - 4, sy + 2); ctx.lineTo(sx - 4 + lp, sy + 14); ctx.moveTo(sx + 4, sy + 2); ctx.lineTo(sx + 4 - lp, sy + 14); ctx.stroke();
      // armor body
      const bc = blue ? '#3b82f6' : '#ef4444';
      const bd = blue ? '#2563eb' : '#dc2626';
      isoBox(ctx, sx, sy, 20, 10, 16, bc, bd, bd);
      // shoulders
      ctx.fillStyle = '#b0b0b0'; ctx.beginPath(); ctx.arc(sx - 9, sy - 12, 4, 0, 7); ctx.arc(sx + 9, sy - 12, 4, 0, 7); ctx.fill();
      // helmet
      ctx.fillStyle = '#c0c0c0'; ctx.beginPath(); ctx.arc(sx, sy - 22, 8, 0, 7); ctx.fill();
      ctx.fillStyle = '#808080'; ctx.fillRect(sx - 6, sy - 24, 12, 3);
      ctx.fillStyle = '#a0a0a0'; ctx.fillRect(sx - 1, sy - 24, 2, 7);
      // plume
      ctx.fillStyle = team;
      ctx.beginPath(); ctx.moveTo(sx, sy - 30); ctx.quadraticCurveTo(sx - u.face * 5, sy - 34, sx - u.face * 9, sy - 30 + Math.sin(this.time * 7) * 2); ctx.lineTo(sx, sy - 28); ctx.closePath(); ctx.fill();
      // sword
      const ext = 14 + u.atkAnim * 14;
      ctx.save(); ctx.translate(sx + u.face * 9, sy - 8); ctx.rotate(u.face * (u.atkAnim > 0 ? -0.5 : 0.4));
      ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(u.face * ext, -6); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(u.face * 3, -1); ctx.lineTo(u.face * ext, -6); ctx.stroke();
      ctx.fillStyle = '#f6d47c'; ctx.fillRect(-3, -2, 6, 4);
      ctx.restore();
      // shield
      ctx.fillStyle = teamDk;
      ctx.beginPath(); ctx.moveTo(sx - u.face * 11, sy - 12); ctx.lineTo(sx - u.face * 18, sy - 8); ctx.lineTo(sx - u.face * 18, sy); ctx.lineTo(sx - u.face * 15, sy + 4); ctx.lineTo(sx - u.face * 11, sy); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#f6d47c'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#f6d47c'; ctx.beginPath(); ctx.arc(sx - u.face * 15, sy - 4, 2.5, 0, 7); ctx.fill();
    } else if (u.key === 'archer') {
      const lp = u.state === 'idle' ? 0 : Math.sin(u.anim) * 5;
      ctx.strokeStyle = '#4a4030'; ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.moveTo(sx - 4, sy + 2); ctx.lineTo(sx - 4 + lp, sy + 14); ctx.moveTo(sx + 4, sy + 2); ctx.lineTo(sx + 4 - lp, sy + 14); ctx.stroke();
      const vc = blue ? '#15803d' : '#9a3412';
      const vd = blue ? '#0f6930' : '#7c2d12';
      isoBox(ctx, sx, sy, 18, 9, 14, vc, vd, vd);
      // quiver
      ctx.fillStyle = '#5c3618'; ctx.fillRect(sx - u.face * 7, sy - 14, 5, 14);
      ctx.fillStyle = '#d6d3d1'; for (let i = 0; i < 3; i++) ctx.fillRect(sx - u.face * 7 + 1 + i * 1.5, sy - 18, 1.5, 4);
      // hood
      ctx.fillStyle = vd; ctx.beginPath(); ctx.arc(sx, sy - 20, 8, Math.PI * 0.85, Math.PI * 2.15); ctx.fill();
      ctx.beginPath(); ctx.moveTo(sx - u.face * 5, sy - 26); ctx.lineTo(sx - u.face * 2, sy - 20); ctx.lineTo(sx - u.face * 8, sy - 21); ctx.closePath(); ctx.fill();
      // face
      ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(sx + u.face * 2, sy - 18, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#2d1b0e'; ctx.beginPath(); ctx.arc(sx + u.face * 4, sy - 19, 1.2, 0, 7); ctx.fill();
      // bow
      const bowX = sx + u.face * 13;
      ctx.strokeStyle = '#6b3a10'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(bowX, sy - 10, 11, u.face > 0 ? -1.3 : Math.PI - 1.3, u.face > 0 ? 1.3 : Math.PI + 1.3); ctx.stroke();
      const pull = u.atkAnim * 6;
      ctx.strokeStyle = '#fef3c7'; ctx.lineWidth = 1;
      const t1x = bowX + Math.cos(u.face > 0 ? -1.3 : Math.PI + 1.3) * 11;
      const t1y = sy - 10 + Math.sin(u.face > 0 ? -1.3 : Math.PI + 1.3) * 11;
      const t2x = bowX + Math.cos(u.face > 0 ? 1.3 : Math.PI - 1.3) * 11;
      const t2y = sy - 10 + Math.sin(u.face > 0 ? 1.3 : Math.PI - 1.3) * 11;
      ctx.beginPath(); ctx.moveTo(t1x, t1y); ctx.lineTo(bowX - u.face * pull, sy - 10); ctx.lineTo(t2x, t2y); ctx.stroke();
    } else { // knight
      // horse body
      ctx.fillStyle = blue ? '#4a1d8a' : '#6b1a1a';
      ctx.beginPath(); ctx.ellipse(sx, sy + 1, 20, 10, 0.2 * u.face, 0, 7); ctx.fill();
      ctx.fillStyle = blue ? '#5c2da0' : '#7f2222';
      ctx.beginPath(); ctx.ellipse(sx - u.face * 2, sy - 2, 14, 6, 0, 0, 7); ctx.fill();
      // horse legs
      ctx.strokeStyle = blue ? '#3a1670' : '#5c1515'; ctx.lineWidth = 4;
      const lp = Math.sin(u.anim) * 6;
      ctx.beginPath();
      ctx.moveTo(sx - 8, sy + 6); ctx.lineTo(sx - 8 + lp, sy + 16);
      ctx.moveTo(sx + 8, sy + 6); ctx.lineTo(sx + 8 - lp, sy + 16);
      ctx.stroke();
      // horse head
      ctx.fillStyle = blue ? '#5c2da0' : '#7f2222';
      ctx.beginPath(); ctx.ellipse(sx + u.face * 18, sy - 6, 8, 6, 0.4 * u.face, 0, 7); ctx.fill();
      // horse eye
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx + u.face * 18, sy - 8, 1.5, 0, 7); ctx.fill();
      // saddle
      ctx.fillStyle = '#5c3618'; ctx.beginPath(); ctx.ellipse(sx - u.face * 2, sy - 6, 7, 4, 0, 0, 7); ctx.fill();
      // rider body
      isoBox(ctx, sx - u.face * 2, sy - 8, 14, 7, 16, '#c0c0c0', '#a0a0a0', '#b0b0b0');
      ctx.fillStyle = team; ctx.fillRect(sx - u.face * 2 - 4, sy - 20, 8, 6);
      // rider helmet
      ctx.fillStyle = '#b0b0b0'; ctx.beginPath(); ctx.arc(sx - u.face * 2, sy - 26, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#888'; ctx.fillRect(sx - u.face * 2 - 5, sy - 28, 10, 3);
      // plume
      ctx.fillStyle = team;
      ctx.beginPath(); ctx.moveTo(sx - u.face * 2, sy - 33); ctx.quadraticCurveTo(sx - u.face * 2 - u.face * 5, sy - 37, sx - u.face * 2 - u.face * 10, sy - 32 + Math.sin(this.time * 7) * 2); ctx.lineTo(sx - u.face * 2, sy - 31); ctx.closePath(); ctx.fill();
      // lance
      const ext = 18 + u.atkAnim * 12;
      ctx.strokeStyle = '#78450f'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(sx - u.face * 2 + u.face * 5, sy - 16); ctx.lineTo(sx - u.face * 2 + u.face * ext, sy - 22 - u.atkAnim * 4); ctx.stroke();
      ctx.fillStyle = '#d6d3d1'; ctx.beginPath(); ctx.arc(sx - u.face * 2 + u.face * ext, sy - 22 - u.atkAnim * 4, 3.5, 0, 7); ctx.fill();
    }
    // HP bar
    if (u.hp < u.maxHp || sel) {
      const bw = u.key === 'knight' ? 36 : 30;
      const by = u.key === 'knight' ? sy - 38 : sy - 34;
      const s = clamp(u.hp / u.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - bw / 2, by, bw, 6);
      ctx.fillStyle = u.owner === 'player' ? '#4ade80' : u.owner === 'enemy' ? '#ef4444' : '#facc15';
      ctx.fillRect(sx - bw / 2 + 1, by + 1, (bw - 2) * s, 4);
    }
  }

  drawUnit(u: Unit) {
    const { ctx } = this;
    const sel = this.selected.has(u.id);
    const bob = u.state === 'idle' ? Math.sin(u.anim) * 1.5 : Math.abs(Math.sin(u.anim)) * -4;
    const lunge = u.atkAnim * 9;
    const lx = u.face * lunge;
    const S = u.key === 'knight' ? 1.35 : u.key === 'wolf' ? 1.15 : 1.0; // scale multiplier
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(u.x, u.y + 14 * S, (u.key === 'knight' ? 22 : 16) * S, 6 * S, 0, 0, 7); ctx.fill();
    if (sel) {
      ctx.strokeStyle = u.key === 'villager' ? '#a3e635' : '#7dd3fc'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(u.x, u.y + 14 * S, 22 * S, 11 * S, 0, 0, 7); ctx.stroke();
      // pulse ring
      const pr = 22 * S + ((this.time * 20) % 14);
      ctx.globalAlpha = 1 - ((this.time * 20) % 14) / 14;
      ctx.beginPath(); ctx.ellipse(u.x, u.y + 14 * S, pr, pr * 0.5, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // carry icon
    if (u.key === 'villager' && u.carry.amt > 1) {
      ctx.font = '13px Inter'; ctx.textAlign = 'center';
      ctx.fillText(u.carry.type === 'wood' ? '🪵' : u.carry.type === 'food' ? '🍖' : '🪙', u.x + 18, u.y - 24);
    }
    const blue = u.owner === 'player'; const red = u.owner === 'enemy';
    const team = blue ? '#2563eb' : red ? '#dc2626' : '#4b5563';
    const teamDk = blue ? '#1e3a8a' : red ? '#7f1d1d' : '#374151';
    const y = u.y + bob, x = u.x + lx * 0.4;
    if (u.key === 'wolf') {
      // body
      ctx.fillStyle = '#7a7e85';
      ctx.beginPath(); ctx.ellipse(x, y, 20, 11, 0, 0, 7); ctx.fill();
      // belly highlight
      ctx.fillStyle = '#9ca3af';
      ctx.beginPath(); ctx.ellipse(x - u.face * 2, y + 3, 12, 5, 0, 0, 7); ctx.fill();
      // head
      ctx.fillStyle = '#5b5f66';
      ctx.beginPath(); ctx.ellipse(x + u.face * 16, y - 7, 10, 9, 0.2 * u.face, 0, 7); ctx.fill();
      // snout
      ctx.fillStyle = '#6b7280';
      ctx.beginPath(); ctx.ellipse(x + u.face * 22, y - 5, 6, 4, 0.3 * u.face, 0, 7); ctx.fill();
      ctx.fillStyle = '#1f2937';
      ctx.beginPath(); ctx.arc(x + u.face * 26, y - 5, 2, 0, 7); ctx.fill(); // nose
      // ears
      ctx.fillStyle = '#4b5563';
      ctx.beginPath(); ctx.moveTo(x + u.face * 10, y - 14); ctx.lineTo(x + u.face * 14, y - 24); ctx.lineTo(x + u.face * 18, y - 14); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + u.face * 16, y - 14); ctx.lineTo(x + u.face * 19, y - 22); ctx.lineTo(x + u.face * 22, y - 13); ctx.closePath(); ctx.fill();
      // eyes — menacing
      ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(x + u.face * 18, y - 9, 2.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x + u.face * 18, y - 9, 1.2, 0, 7); ctx.fill();
      // tail
      ctx.strokeStyle = '#5b5f66'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x - u.face * 18, y - 2); ctx.quadraticCurveTo(x - u.face * 28, y - 10 + Math.sin(u.anim * 1.6) * 4, x - u.face * 26, y - 18); ctx.stroke();
      // legs — 4 legs
      ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 4.5;
      const lp = Math.sin(u.anim) * 6;
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 7); ctx.lineTo(x - 8 + lp, y + 16);
      ctx.moveTo(x + 8, y + 7); ctx.lineTo(x + 8 - lp, y + 16);
      ctx.moveTo(x - 3, y + 8); ctx.lineTo(x - 3 - lp * 0.6, y + 16);
      ctx.moveTo(x + 3, y + 8); ctx.lineTo(x + 3 + lp * 0.6, y + 16);
      ctx.stroke();
    } else if (u.key === 'villager') {
      // legs — boots
      ctx.strokeStyle = '#5c4033'; ctx.lineWidth = 5.5;
      const lp = u.state === 'idle' ? 0 : Math.sin(u.anim) * 6;
      ctx.beginPath(); ctx.moveTo(x - 5, y + 4); ctx.lineTo(x - 5 + lp, y + 18); ctx.moveTo(x + 5, y + 4); ctx.lineTo(x + 5 - lp, y + 18); ctx.stroke();
      // boot feet
      ctx.fillStyle = '#44302a';
      ctx.beginPath(); ctx.arc(x - 5 + lp, y + 18, 3, 0, 7); ctx.arc(x + 5 - lp, y + 18, 3, 0, 7); ctx.fill();
      // tunic body
      ctx.fillStyle = '#b07520';
      ctx.beginPath(); ctx.moveTo(x - 13, y + 6); ctx.lineTo(x - 11, y - 14); ctx.lineTo(x + 11, y - 14); ctx.lineTo(x + 13, y + 6); ctx.closePath(); ctx.fill();
      // belt
      ctx.fillStyle = '#5c3618'; ctx.fillRect(x - 12, y - 2, 24, 4);
      ctx.fillStyle = '#f6d47c'; ctx.fillRect(x - 2, y - 2, 4, 4); // buckle
      // team stripe
      ctx.fillStyle = team; ctx.fillRect(x - 11, y - 12, 22, 5);
      // arms
      ctx.strokeStyle = '#a06818'; ctx.lineWidth = 5;
      const armSwing = u.atkAnim > 0 ? -0.6 + u.atkAnim * 0.8 : Math.sin(u.anim * 0.5) * 0.15;
      ctx.beginPath(); ctx.moveTo(x - u.face * 10, y - 6); ctx.lineTo(x - u.face * 16, y - 2 + armSwing * 8); ctx.stroke();
      // head skin tone
      ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(x, y - 22, 9, 0, 7); ctx.fill();
      // eyes
      ctx.fillStyle = '#2d1b0e';
      ctx.beginPath(); ctx.arc(x + u.face * 3, y - 23, 1.5, 0, 7); ctx.fill();
      // hood / hat
      ctx.fillStyle = '#6b3a10';
      ctx.beginPath(); ctx.arc(x, y - 25, 10, Math.PI, 0); ctx.fill();
      ctx.fillRect(x - 11, y - 25, 22, 4);
      // tool in hand
      ctx.save(); ctx.translate(x + u.face * 10, y - 8); ctx.rotate(u.face * armSwing);
      ctx.strokeStyle = '#78450f'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(u.face * 14, -14); ctx.stroke();
      // axe head
      ctx.fillStyle = '#b8b8b8';
      ctx.save(); ctx.translate(u.face * 14, -14); ctx.rotate(u.face * 0.3);
      ctx.fillRect(-2, -8, 5, 8);
      ctx.restore();
      ctx.restore();
    } else if (u.key === 'swordsman') {
      // legs — armored
      ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 6;
      const lp = u.state === 'idle' ? 0 : Math.sin(u.anim) * 6;
      ctx.beginPath(); ctx.moveTo(x - 5, y + 2); ctx.lineTo(x - 5 + lp, y + 18); ctx.moveTo(x + 5, y + 2); ctx.lineTo(x + 5 - lp, y + 18); ctx.stroke();
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath(); ctx.arc(x - 5 + lp, y + 18, 3.5, 0, 7); ctx.arc(x + 5 - lp, y + 18, 3.5, 0, 7); ctx.fill();
      // torso armor
      const bodyC = blue ? '#3b82f6' : '#ef4444';
      const bodyD = blue ? '#2563eb' : '#dc2626';
      ctx.fillStyle = bodyC;
      ctx.beginPath(); ctx.moveTo(x - 14, y + 4); ctx.lineTo(x - 12, y - 16); ctx.lineTo(x + 12, y - 16); ctx.lineTo(x + 14, y + 4); ctx.closePath(); ctx.fill();
      // armor shading
      ctx.fillStyle = bodyD; ctx.fillRect(x - 13, y - 16, 26, 4);
      // chain mail texture
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      for (let i = 0; i < 3; i++) ctx.fillRect(x - 10, y - 12 + i * 5, 20, 2);
      // shoulders / pauldrons
      ctx.fillStyle = '#b0b0b0';
      ctx.beginPath(); ctx.arc(x - 12, y - 12, 5, 0, 7); ctx.arc(x + 12, y - 12, 5, 0, 7); ctx.fill();
      // belt
      ctx.fillStyle = '#5c3618'; ctx.fillRect(x - 13, y, 26, 4);
      // helmet — full
      ctx.fillStyle = '#c0c0c0'; ctx.beginPath(); ctx.arc(x, y - 24, 10, 0, 7); ctx.fill();
      // helmet visor
      ctx.fillStyle = '#808080'; ctx.fillRect(x - 8, y - 26, 16, 4);
      // nose guard
      ctx.fillStyle = '#a0a0a0'; ctx.fillRect(x - 1.5, y - 26, 3, 8);
      // eyes through visor
      ctx.fillStyle = '#1c1917';
      ctx.beginPath(); ctx.arc(x - 3, y - 23, 1.3, 0, 7); ctx.arc(x + 3, y - 23, 1.3, 0, 7); ctx.fill();
      // plume on helmet
      ctx.fillStyle = team;
      ctx.beginPath(); ctx.moveTo(x, y - 34); ctx.quadraticCurveTo(x - u.face * 4, y - 38, x - u.face * 8, y - 34 + Math.sin(this.time * 8) * 2); ctx.lineTo(x, y - 32); ctx.closePath(); ctx.fill();
      // sword
      const ext = 16 + u.atkAnim * 16;
      ctx.save(); ctx.translate(x + u.face * 11, y - 8); ctx.rotate(u.face * (u.atkAnim > 0 ? -0.6 : 0.4));
      // blade
      ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(u.face * ext, -8); ctx.stroke();
      // blade highlight
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(u.face * 4, -1); ctx.lineTo(u.face * ext, -8); ctx.stroke();
      // hilt crossguard
      ctx.fillStyle = '#f6d47c'; ctx.fillRect(-4, -3, 8, 6);
      // grip
      ctx.fillStyle = '#5c3618'; ctx.fillRect(-2, 1, 4, 8);
      ctx.restore();
      // shield
      ctx.fillStyle = teamDk;
      ctx.beginPath(); ctx.moveTo(x - u.face * 13, y - 12); ctx.lineTo(x - u.face * 21, y - 8); ctx.lineTo(x - u.face * 21, y + 2); ctx.lineTo(x - u.face * 17, y + 6); ctx.lineTo(x - u.face * 13, y + 2); ctx.closePath(); ctx.fill();
      // shield emblem
      ctx.fillStyle = '#f6d47c';
      ctx.beginPath(); ctx.arc(x - u.face * 17, y - 3, 3, 0, 7); ctx.fill();
      // shield border
      ctx.strokeStyle = '#f6d47c'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - u.face * 13, y - 12); ctx.lineTo(x - u.face * 21, y - 8); ctx.lineTo(x - u.face * 21, y + 2); ctx.lineTo(x - u.face * 17, y + 6); ctx.lineTo(x - u.face * 13, y + 2); ctx.closePath(); ctx.stroke();
    } else if (u.key === 'archer') {
      // legs
      ctx.strokeStyle = '#4a4030'; ctx.lineWidth = 5;
      const lp = u.state === 'idle' ? 0 : Math.sin(u.anim) * 6;
      ctx.beginPath(); ctx.moveTo(x - 5, y + 2); ctx.lineTo(x - 5 + lp, y + 18); ctx.moveTo(x + 5, y + 2); ctx.lineTo(x + 5 - lp, y + 18); ctx.stroke();
      // body — leather vest
      const vestC = blue ? '#15803d' : '#9a3412';
      const vestD = blue ? '#0f6930' : '#7c2d12';
      ctx.fillStyle = vestC;
      ctx.beginPath(); ctx.moveTo(x - 12, y + 4); ctx.lineTo(x - 10, y - 14); ctx.lineTo(x + 10, y - 14); ctx.lineTo(x + 12, y + 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = vestD; ctx.fillRect(x - 11, y - 14, 22, 4);
      // quiver on back
      ctx.fillStyle = '#5c3618';
      ctx.fillRect(x - u.face * 8, y - 14, 6, 16);
      // arrow tips poking out
      ctx.fillStyle = '#d6d3d1';
      for (let i = 0; i < 3; i++) ctx.fillRect(x - u.face * 8 + 1 + i * 2, y - 18, 1.5, 5);
      // hood
      ctx.fillStyle = vestD;
      ctx.beginPath(); ctx.arc(x, y - 23, 10, Math.PI * 0.85, Math.PI * 2.15); ctx.fill();
      // hood point
      ctx.beginPath(); ctx.moveTo(x - u.face * 6, y - 31); ctx.lineTo(x - u.face * 3, y - 23); ctx.lineTo(x - u.face * 9, y - 24); ctx.closePath(); ctx.fill();
      // face
      ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(x + u.face * 2, y - 21, 7, 0, 7); ctx.fill();
      // eyes
      ctx.fillStyle = '#2d1b0e';
      ctx.beginPath(); ctx.arc(x + u.face * 4, y - 22, 1.4, 0, 7); ctx.fill();
      // bow — in hand
      const bowX = x + u.face * 14;
      ctx.strokeStyle = '#6b3a10'; ctx.lineWidth = 3;
      const pull = u.atkAnim * 7;
      ctx.beginPath(); ctx.arc(bowX, y - 10, 13, u.face > 0 ? -1.3 : Math.PI - 1.3, u.face > 0 ? 1.3 : Math.PI + 1.3); ctx.stroke();
      // bowstring
      ctx.strokeStyle = '#fef3c7'; ctx.lineWidth = 1.2;
      const topX = bowX + Math.cos(u.face > 0 ? -1.3 : Math.PI + 1.3) * 13;
      const topY = y - 10 + Math.sin(u.face > 0 ? -1.3 : Math.PI + 1.3) * 13;
      const botX = bowX + Math.cos(u.face > 0 ? 1.3 : Math.PI - 1.3) * 13;
      const botY = y - 10 + Math.sin(u.face > 0 ? 1.3 : Math.PI - 1.3) * 13;
      ctx.beginPath(); ctx.moveTo(topX, topY); ctx.lineTo(bowX - u.face * pull, y - 10); ctx.lineTo(botX, botY); ctx.stroke();
      // arrow if not just fired
      if (u.atkAnim > 0.2) {
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bowX - u.face * pull, y - 10); ctx.lineTo(bowX + u.face * 6, y - 10); ctx.stroke();
      }
    } else {
      // knight on horse — much bigger
      // horse body
      ctx.fillStyle = blue ? '#4a1d8a' : '#6b1a1a';
      ctx.beginPath(); ctx.ellipse(x, y + 2, 24, 12, 0, 0, 7); ctx.fill();
      // horse highlight
      ctx.fillStyle = blue ? '#5c2da0' : '#7f2222';
      ctx.beginPath(); ctx.ellipse(x - u.face * 3, y - 1, 16, 7, 0, 0, 7); ctx.fill();
      // horse legs
      ctx.strokeStyle = blue ? '#3a1670' : '#5c1515'; ctx.lineWidth = 5;
      const lp = Math.sin(u.anim) * 8;
      ctx.beginPath();
      ctx.moveTo(x - 10, y + 8); ctx.lineTo(x - 10 + lp, y + 20);
      ctx.moveTo(x + 10, y + 8); ctx.lineTo(x + 10 - lp, y + 20);
      ctx.moveTo(x - 5, y + 9); ctx.lineTo(x - 5 - lp * 0.5, y + 20);
      ctx.moveTo(x + 5, y + 9); ctx.lineTo(x + 5 + lp * 0.5, y + 20);
      ctx.stroke();
      // hooves
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath(); ctx.arc(x - 10 + lp, y + 20, 3, 0, 7); ctx.arc(x + 10 - lp, y + 20, 3, 0, 7); ctx.fill();
      // horse head + neck
      ctx.fillStyle = blue ? '#5c2da0' : '#7f2222';
      ctx.beginPath(); ctx.ellipse(x + u.face * 22, y - 8, 10, 7, 0.5 * u.face, 0, 7); ctx.fill();
      // muzzle
      ctx.fillStyle = blue ? '#6b38b0' : '#8a2828';
      ctx.beginPath(); ctx.ellipse(x + u.face * 28, y - 5, 5, 4, 0.3 * u.face, 0, 7); ctx.fill();
      // horse eye
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + u.face * 22, y - 10, 2, 0, 7); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x + u.face * 22, y - 10, 1, 0, 7); ctx.fill();
      // horse mane
      ctx.strokeStyle = blue ? '#2a1560' : '#4a1010'; ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const mx = x + u.face * (12 + i * 3), my = y - 12 - i;
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx - u.face * 3, my - 6 + Math.sin(this.time * 5 + i) * 2); ctx.stroke();
      }
      // saddle
      ctx.fillStyle = '#5c3618'; ctx.beginPath(); ctx.ellipse(x - u.face * 3, y - 7, 9, 5, 0, 0, 7); ctx.fill();
      // rider body (sitting on horse)
      ctx.fillStyle = '#c0c0c0';
      ctx.beginPath(); ctx.moveTo(x - u.face * 3 - 8, y - 6); ctx.lineTo(x - u.face * 3 - 6, y - 22); ctx.lineTo(x - u.face * 3 + 6, y - 22); ctx.lineTo(x - u.face * 3 + 8, y - 6); ctx.closePath(); ctx.fill();
      // team color tabard over armor
      ctx.fillStyle = team; ctx.fillRect(x - u.face * 3 - 5, y - 18, 10, 8);
      // rider helmet
      ctx.fillStyle = '#b0b0b0'; ctx.beginPath(); ctx.arc(x - u.face * 3, y - 28, 8, 0, 7); ctx.fill();
      ctx.fillStyle = '#888'; ctx.fillRect(x - u.face * 3 - 6, y - 30, 12, 3);
      // plume
      ctx.fillStyle = team;
      ctx.beginPath(); ctx.moveTo(x - u.face * 3, y - 36); ctx.quadraticCurveTo(x - u.face * 3 - u.face * 6, y - 40, x - u.face * 3 - u.face * 12, y - 34 + Math.sin(this.time * 7) * 3); ctx.lineTo(x - u.face * 3, y - 33); ctx.closePath(); ctx.fill();
      // lance
      const ext = 22 + u.atkAnim * 14;
      ctx.strokeStyle = '#78450f'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x - u.face * 3 + u.face * 6, y - 16); ctx.lineTo(x - u.face * 3 + u.face * ext, y - 22 - u.atkAnim * 6); ctx.stroke();
      // lance point
      ctx.fillStyle = '#d6d3d1';
      ctx.beginPath(); ctx.arc(x - u.face * 3 + u.face * ext, y - 22 - u.atkAnim * 6, 4, 0, 7); ctx.fill();
      // pennant on lance
      const pennantW = Math.sin(this.time * 3 + u.x) * 3;
      ctx.fillStyle = team; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(x - u.face * 3 + u.face * (ext - 4), y - 22 - u.atkAnim * 6 + 2);
      ctx.lineTo(x - u.face * 3 + u.face * (ext - 12), y - 18 - u.atkAnim * 6 + pennantW);
      ctx.lineTo(x - u.face * 3 + u.face * (ext - 4), y - 16 - u.atkAnim * 6);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // hp bar — wider
    if (u.hp < u.maxHp || sel) {
      const bw = u.key === 'knight' ? 38 : 32;
      const by = u.key === 'knight' ? y - 42 : y - 40;
      const s = clamp(u.hp / u.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - bw / 2, by, bw, 6);
      ctx.fillStyle = u.owner === 'player' ? '#4ade80' : u.owner === 'enemy' ? '#ef4444' : '#facc15';
      ctx.fillRect(x - bw / 2 + 1, by + 1, (bw - 2) * s, 4);
    }
  }

  drawMinimap(ctx: CanvasRenderingContext2D) {
    // minimap uses flat world coords still (top-down view for clarity)
    const W = clamp(this.vw * 0.34, 120, 190);
    const H = (W * WORLD.h) / WORLD.w;
    const m = 12;
    const x = this.vw - W - m, y = this.vh - H - m - (this.vw < 640 ? 118 : 0);
    this.minimap = { x, y, w: W, h: H };
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = 'rgba(8,12,10,0.85)';
    ctx.beginPath(); ctx.roundRect(x - 5, y - 5, W + 10, H + 10, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,55,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x - 5, y - 5, W + 10, H + 10, 10); ctx.stroke();
    ctx.beginPath(); ctx.rect(x, y, W, H); ctx.clip();
    ctx.fillStyle = '#33582b'; ctx.fillRect(x, y, W, H);
    const sx = W / WORLD.w, sy = H / WORLD.h;
    // nodes
    for (const n of this.nodes) {
      if (n.amount <= 0) continue;
      ctx.fillStyle = n.kind === 'wood' ? '#22c55e' : n.kind === 'gold' ? '#facc15' : '#fb7185';
      ctx.fillRect(x + n.x * sx - 1.5, y + n.y * sy - 1.5, 3, 3);
    }
    // buildings
    for (const b of this.blds) {
      ctx.fillStyle = b.owner === 'player' ? '#60a5fa' : '#f87171';
      const s = b.key === 'towncenter' ? 6 : 4;
      ctx.fillRect(x + b.x * sx - s / 2, y + b.y * sy - s / 2, s, s);
    }
    // units
    for (const u of this.units) {
      if (u.owner === 'neutral') { ctx.fillStyle = '#eab308'; ctx.fillRect(x + u.x * sx - 1, y + u.y * sy - 1, 2, 2); }
      else { ctx.fillStyle = u.owner === 'player' ? '#dbeafe' : '#fecaca'; ctx.fillRect(x + u.x * sx - 1, y + u.y * sy - 1, 2, 2); }
    }
    // viewport
    const vx0 = (this.cam.x - this.vw / 2 / this.cam.zoom) * sx + x;
    const vy0 = (this.cam.y - this.vh / 2 / this.cam.zoom) * sy + y;
    const vw = (this.vw / this.cam.zoom) * sx, vh = (this.vh / this.cam.zoom) * sy;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
    ctx.strokeRect(vx0, vy0, vw, vh);
    ctx.restore();
    ctx.fillStyle = 'rgba(253,230,138,0.85)'; ctx.font = '700 9px Inter';
    ctx.textAlign = 'left'; ctx.fillText('КАРТА — нажмите, чтобы прыгнуть', x - 2, y - 8);
  }
}

// re-export for UI
export { AGES, BUILDING_DEFS, UNIT_DEFS };
