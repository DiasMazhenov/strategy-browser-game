import { AGES, BUILDING_DEFS, DEFAULT_SETTINGS, DIFF, SCORE, TECHS, UNIT_DEFS, WORLD, type BuildingKey, type Difficulty, type Settings, type UnitKey } from './config';
import { SoundBank } from './audio';
import { toIso, fromIso, isoEllipse, drawIsoTree, drawIsoGold, drawIsoBerries, getGrassTile, getDirtTile, getDarkGrassTile, TILE_STEP } from './iso';
import { drawConstruction, drawPixelUnit, diamondRingHalf, diamondShadow } from './pixelart';
import { SPR_ANCHORS } from './sprite-art';
import imgTowncenter from '../assets/sprites/towncenter.png';
import imgHouse from '../assets/sprites/house.png';
import imgBarracks from '../assets/sprites/barracks.png';
import imgTower from '../assets/sprites/tower.png';
import imgFarm from '../assets/sprites/farm.png';
import imgStable from '../assets/sprites/stable.png';
import imgMarket from '../assets/sprites/market.png';
import imgBlacksmith from '../assets/sprites/blacksmith.png';
import imgWall from '../assets/sprites/wall.png';
import imgGate from '../assets/sprites/gate.png';

// ── Загрузка детальных AI-спрайтов зданий с автопосадкой на ромб клетки ──
const SPRITE_URLS: Partial<Record<BuildingKey, string>> = {
  towncenter: imgTowncenter, house: imgHouse, barracks: imgBarracks, tower: imgTower, farm: imgFarm,
  stable: imgStable, market: imgMarket, blacksmith: imgBlacksmith, wall: imgWall, gate: imgGate,
};
interface BldSprite { img: HTMLImageElement; flash: HTMLCanvasElement | null; ax: number; ay: number; baseW: number }
const BLD_SPRITES: Partial<Record<BuildingKey, BldSprite>> = {};
for (const k of Object.keys(SPRITE_URLS) as BuildingKey[]) {
  const url = SPRITE_URLS[k];
  if (!url) continue;
  const im = new Image();
  im.src = url;
  const a = SPR_ANCHORS[k];
  im.onload = () => {
    // красная версия для вспышки урона
    try {
      const cv = document.createElement('canvas');
      cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const c = cv.getContext('2d')!;
      c.drawImage(im, 0, 0);
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(239,68,68,0.5)';
      c.fillRect(0, 0, cv.width, cv.height);
      (BLD_SPRITES[k] as BldSprite).flash = cv;
    } catch { /* ignore */ }
  };
  BLD_SPRITES[k] = { img: im, flash: null, ax: a?.ax ?? 0, ay: a?.ay ?? 0, baseW: a?.baseW ?? 100 };
}
// посадка: рисуем спрайт так, чтобы его фундамент лёг на ромб клетки (2S×S изо)
function placeBld(k: BuildingKey, S: number) {
  const sp = BLD_SPRITES[k]!;
  const fit = 1.02;
  const scale = (2 * S * fit) / sp.baseW;
  return sp.img.complete && sp.img.naturalWidth ? { sp, scale, ready: true } : { sp, scale, ready: false };
}

export interface GameStats { score: number; kills: number; razed: number; gathered: number; timeSec: number; age: number; result: 'victory' | 'defeat'; difficulty: Difficulty; peakPop?: number; peakArmy?: number; built?: number; history?: { t: number; army: number; pop: number }[]; }
export interface Banner { title: string; sub: string; t: number; dur: number; }
interface Carry { type: 'wood' | 'food' | 'gold'; amt: number }
interface Unit {
  id: number; key: UnitKey; owner: 'player' | 'enemy' | 'neutral';
  x: number; y: number; hp: number; maxHp: number; atk: number; range: number; speed: number;
  cd: number; state: 'idle' | 'move' | 'gather' | 'return' | 'build' | 'attackmove' | 'patrol';
  tx: number; ty: number; targetU: number; targetB: number; nodeId: number; buildId: number;
  carry: Carry; gatherT: number; anim: number; face: number; atkAnim: number; retarget: number; idleT: number; flash: number;
  stance: 'aggressive' | 'defensive' | 'stand'; // боевая стойка
  homeX: number; homeY: number;                 // точка возврата (stand/patrol)
  patrolX: number; patrolY: number;             // вторая точка патруля
  waitT: number;                                // ожидание в точке патруля
  wx: number; wy: number; // wander anchor for wolves
  hidden?: number;        // id здания-укрытия (гарнизон)
  relicTarget?: number;   // id реликвии, за которой идёт монах
  xp?: number; level?: number; kills?: number; // опыт и ранг героя
}
// опыт для следующего уровня: 3 убийства → ур.2, далее +2 за ранг
function xpForLevel(level: number): number { return (level + 2) * 3; }
// тип урона юнита для камень-ножницы-бумаги
function dmgType(k: UnitKey): 'pierce' | 'blade' | 'blunt' {
  if (k === 'spearman' || k === 'archer') return 'pierce';
  if (k === 'catapult') return 'blunt';
  return 'blade';
}
// класс брони цели
function armorClass(k: UnitKey): 'inf' | 'cav' | 'siege' | 'soft' {
  if (k === 'knight' || k === 'cavalry') return 'cav';
  if (k === 'catapult') return 'siege';
  if (k === 'swordsman' || k === 'spearman') return 'inf';
  return 'soft';
}
// множитель контры: копья бьют конницу, конница топчет лучников/пехоту, клинки рубят пехоту/осаду
function dmgMult(att: UnitKey, target: UnitKey): number {
  const a = dmgType(att), t = armorClass(target);
  if (a === 'pierce' && t === 'cav') return 1.6;   // копья/стрелы против конницы
  if (a === 'blade' && (t === 'soft')) return 1.35; // мечники/конница рубят лучников и беззащитных
  if (att === 'cavalry' && t === 'inf') return 1.3; // конница сметает пехоту
  if (a === 'blunt' && t === 'siege') return 1.5;   // осадный по осаде
  if (a === 'pierce' && t === 'inf') return 0.85;   // пехота лучше держит уколы
  return 1;
}
interface Bld {
  id: number; key: BuildingKey; owner: 'player' | 'enemy';
  x: number; y: number; size: number; hp: number; maxHp: number;
  done: number; buildT: number; queue: { key: UnitKey; t: number; total: number }[];
  cd: number; rallyX: number; rallyY: number; rallyNode: number; flash: number; smokeT: number;
  research: { id: string; t: number; total: number } | null;   // текущее исследование
  garrison: number[];                                           // id юнитов внутри (оборона)
  gate: boolean;                                                // ворота (проходны для игрока)
  axis?: 'x' | 'y';                                             // ориентация протяжки стены/ворот
}
interface Node { id: number; kind: 'wood' | 'gold' | 'food'; x: number; y: number; amount: number; max: number; r: number; phase: number }
interface Relic { id: number; x: number; y: number; taken: boolean; phase: number }
interface Proj { x: number; y: number; vx: number; vy: number; tx: number; ty: number; targetU: number; targetB: number; dmg: number; owner: 'player' | 'enemy' | 'neutral'; life: number; kind: 'arrow' | 'bolt' | 'rock'; srcU?: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; grav: number; shape: 'rect' | 'circle' | 'spark'; rot: number; vr: number }
interface Floater { x: number; y: number; life: number; max: number; text: string; color: string; size: number }
interface Corpse { x: number; y: number; key: UnitKey; owner: string; t: number; life: number; face: number }
interface Decor { x: number; y: number; k: number; s: number; c: string }

export interface SelSnapshot {
  kind: 'none' | 'units' | 'building';
  count?: number; types?: { key: string; label: string; count: number; level?: number; kills?: number }[];
  avgHp?: number; maxHp?: number; canGather?: boolean;
  maxLevel?: number; totalKills?: number; stance?: string | null;
  bkey?: BuildingKey; blabel?: string; hp?: number; bmax?: number; done?: number;
  queue?: { key: UnitKey; label: string; t: number; total: number }[];
  bid?: number;
  techs?: { id: string; name: string; desc: string; icon: string; cost: string; done: boolean; available: boolean; busy: boolean }[];
  research?: { id: string; name: string; t: number; total: number } | null;
  garrison?: number; garrisonCap?: number;
}
export interface TechTreeRow {
  id: string; name: string; desc: string; icon: string;
  bld: string; bldName: string; ageReq: number; cost: string; time: number;
  state: 'done' | 'researching' | 'ready' | 'nobuild' | 'age';
  canStart: boolean;
}
export interface HudSnapshot {
  wood: number; food: number; gold: number; pop: number; popCap: number;
  age: number; ageName: string; score: number; kills: number; razed: number;
  timeSec: number; wave: number; nextWave: number; enemyAge: number;
  sel: SelSnapshot; placement: BuildingKey | null; attackArmed: boolean; rallyArmed: boolean; patrolArmed: boolean; panMode: boolean;
  banner: { title: string; sub: string } | null;
  quests: { id: string; label: string; done: boolean; progress: string }[];
  muted: boolean; idleVills: number; relics: number;
  pTc: number; pTcMax: number; eTc: number; eTcMax: number;
  dmgFlash: number; ageAfford: boolean; ageCost: string;
  hint: string;
  atWar: boolean; grievance: number; casusBelli: number; morale: number;
  playerPow: number; enemyPow: number; wonderT: number; wonderHold: number;
  techTree: TechTreeRow[];
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

  units: Unit[] = []; blds: Bld[] = []; nodes: Node[] = []; relics: Relic[] = [];
  projs: Proj[] = []; parts: Particle[] = []; floaters: Floater[] = []; corpses: Corpse[] = [];
  decor: Decor[] = [];
  res = { wood: 260, food: 260, gold: 140 };
  eres = { wood: 300, food: 300, gold: 160 };
  age = 0; eage = 0;
  score = 0; kills = 0; razed = 0; gatheredTotal = 0; woodGathered = 0;
  soldiersTrained = 0; barracksBuilt = 0; wolvesSlain = 0;
  builtCount = 0; peakPop = 0; peakArmy = 0;
  // история по минутам для графика (ресурсы/армия)
  history: { t: number; army: number; pop: number }[] = []; histT = 0;
  time = 0; wave = 0; waveT: number;
  cam = { x: 380, y: 1620, zoom: 1 };
  keys = new Set<string>();
  selected = new Set<number>(); selBld = -1;
  groups: number[][] = [[], [], [], [], []]; // группы контроля Ctrl/Alt+1..5 (id юнитов игрока)
  tech: Record<string, boolean> = {};         // исследованные технологии
  // туман войны: explored (видел когда-либо) и visible (сейчас) по сетке
  fogCell = 64; fogGW = 0; fogGH = 0; fogExpl: Uint8Array = new Uint8Array(0); fogVis: Uint8Array = new Uint8Array(0); fogT = 0;
  placement: BuildingKey | null = null; attackArmed = false; rallyArmed = false; patrolArmed = false; panMode = false;
  wallDrag: { x0: number; y0: number; x1: number; y1: number } | null = null; // протяжка стен
  woodOnRepair = 0; // накопитель стоимости ремонта (дерево)
  trauma = 0; dmgFlash = 0;
  paused = false; over: 'victory' | 'defeat' | null = null;

  // ── дипломатия (в стиле Civilization) ──
  atWar = false;                 // война с ИИ-соперником
  grievance = 8;                 // неприязнь ИИ (0..100)
  casusBelli = 0;                // оправданность войны у ИИ (0..1)
  warT = 0;                      // длительность текущей войны
  peaceT = 0;                    // время с прошлой войны (для требований мира)
  dipTimer = 0;                  // накопитель пересчёта
  morale = 1;                    // боевой дух армии ИИ (штраф за несправедливую войну)
  wonderT = 0;                   // таймер удержания Чуда света (0 = нет активного Чуда)
  readonly WONDER_HOLD = 180;    // сколько секунд нужно удержать Чудо до победы
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
  settings: Settings = { ...DEFAULT_SETTINGS };
  dpr = 1; vw = 0; vh = 0;
  hint = 'Потяните для выделения • Правый клик — приказ';
  destroyed = false;

  constructor(canvas: HTMLCanvasElement, opts: { difficulty?: Difficulty; settings?: Settings; loadSave?: boolean; onHud: (h: HudSnapshot) => void; onGameOver: (s: GameStats) => void; onPauseRequest: () => void }) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('no ctx');
    this.ctx = ctx;
    this.settings = { ...this.settings, ...(opts.settings || {}) };
    const diff = opts.difficulty ?? this.settings.difficulty;
    this.difficulty = diff;
    this.onHud = opts.onHud; this.onGameOver = opts.onGameOver; this.onPauseRequest = opts.onPauseRequest;
    this.muted = this.settings.muted;
    this.sound.setMuted(this.settings.muted);
    this.sound.setVoice(this.settings.voices);
    this.sound.setVoiceVolume(this.settings.voiceVolume ?? 0.3);
    this.waveT = DIFF[diff].waveInterval;
    this.resize();
    this.makeGrass();
    // туман войны — сетка
    this.fogGW = Math.ceil(WORLD.w / this.fogCell); this.fogGH = Math.ceil(WORLD.h / this.fogCell);
    this.fogExpl = new Uint8Array(this.fogGW * this.fogGH);
    this.fogVis = new Uint8Array(this.fogGW * this.fogGH);
    this.genWorld();
    if (opts.loadSave && this.loadFromSave()) { /* восстановлено из сохранения */ }
    this.bind();
    this.centerOn(380, 1620, true);
    const isMobile = matchMedia('(pointer: coarse)').matches;
    this.cam.zoom = isMobile ? 0.7 : 0.9;
    this.hint = isMobile ? 'Касание — выбор • Касание земли — приказ • Потяните — рамка выбора' : 'ЛКМ-рамка — выделение • ПКМ — приказ • WASD камера • 1-8 тренировка';
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
      stance: 'aggressive', homeX: x, homeY: y, patrolX: x, patrolY: y, waitT: 0,
    };
    this.units.push(u);
    return u;
  }

  addBld(key: BuildingKey, owner: 'player' | 'enemy', x: number, y: number, done = 1): Bld {
    const d = BUILDING_DEFS[key];
    const b: Bld = {
      id: this.nextId++, key, owner, x, y, size: d.size, hp: d.hp * done, maxHp: d.hp,
      done, buildT: 0, queue: [], cd: 0, rallyX: x + (owner === 'player' ? 110 : -110), rallyY: y + 90, rallyNode: -1, flash: 0, smokeT: 0,
      research: null, garrison: [], gate: false,
    };
    this.blds.push(b);
    return b;
  }

  addNode(kind: 'wood' | 'gold' | 'food', x: number, y: number, amount: number): Node {
    const n: Node = { id: this.nextId++, kind, x, y, amount, max: amount, r: kind === 'wood' ? 20 : 24, phase: rand(0, 9) };
    this.nodes.push(n);
    return n;
  }

  biomeTint(): string {
    switch (this.settings.biome) {
      case 'autumn': return 'rgba(180,120,30,0.28)';
      case 'winter': return 'rgba(210,225,245,0.42)';
      case 'desert': return 'rgba(220,190,120,0.30)';
      default: return 'rgba(0,0,0,0)';
    }
  }
  genWorld() {
    // decor
    const decorCols: Record<string, string[]> = {
      green: ['#5da24a', '#6fae55', '#87b96a', '#d9c26a', '#c9b458'],
      autumn: ['#c87a2e', '#d9a13b', '#a85b24', '#b06b2a', '#d9c26a'],
      winter: ['#cfd8e3', '#b9c4d2', '#e2e8f0', '#9fb2c6', '#dce5ef'],
      desert: ['#d9b868', '#c9a555', '#e3c87a', '#b8934a', '#d9c26a'],
    };
    for (let i = 0; i < 420; i++) {
      const cols = decorCols[this.settings.biome] || decorCols.green;
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
    const packs: [number, number][] = [[760, 1280], [1100, 1050], [1500, 900], [950, 700], [1750, 1350], [2600, 1200], [2900, 2000], [600, 2200], [3200, 700]];
    for (const [wx, wy] of packs) for (let i = 0; i < 3; i++) {
      const w = this.addUnit('wolf', 'neutral', wx + rand(-50, 50), wy + rand(-50, 50));
      w.wx = wx; w.wy = wy;
    }
    // скот и дичь: пасутся стадами/семьями
    const herds: [number, number, UnitKey, number][] = [
      [600, 1500, 'sheep', 4], [520, 1560, 'sheep', 3],          // овечки у старта игрока
      [2400, 500, 'cow', 3], [2300, 560, 'sheep', 2],            // скот у соперника
      [1200, 1500, 'cow', 2], [2000, 1800, 'sheep', 4],
      [2800, 1000, 'deer', 3], [900, 400, 'deer', 3], [3100, 1700, 'deer', 3], [1500, 2100, 'cow', 2],
    ];
    for (const [hx, hy, kind, n] of herds) for (let i = 0; i < n; i++) {
      const a = this.addUnit(kind, 'neutral', hx + rand(-45, 45), hy + rand(-40, 40));
      a.wx = hx; a.wy = hy;
    }
    // доп. ресурсы на расширенной карте: леса, золото, ягоды
    const extraForests: [number, number][] = [[2700, 1400], [3000, 2200], [500, 2300], [2300, 2100], [3200, 1100], [1100, 2400], [2600, 400]];
    for (const [fx, fy] of extraForests) for (let i = 0; i < 8 + ((Math.random() * 5) | 0); i++) this.addNode('wood', fx + rand(-140, 140), fy + rand(-120, 120), 200);
    const extraGold: [number, number][] = [[2900, 900], [2500, 2300], [700, 2500], [3300, 1500], [1800, 2200], [1000, 1900]];
    for (const [gx, gy] of extraGold) this.addNode('gold', gx + rand(-40, 40), gy + rand(-40, 40), 900);
    const extraFood: [number, number][] = [[2800, 1300], [450, 2100], [3100, 2400], [2100, 600], [1300, 2600], [2600, 1900]];
    for (const [fx, fy] of extraFood) this.addNode('food', fx + rand(-60, 60), fy + rand(-50, 50), 600);
    // вражеские лагеря в центре карты — зачисти ради награды
    const camps: [number, number][] = [[1300, 1250], [1700, 900]];
    for (const [cx, cy] of camps) {
      this.addBld('tower', 'enemy', cx, cy, 1);
      for (let i = 0; i < 2; i++) { const g = this.addUnit('swordsman', 'enemy', cx + rand(-40, 40), cy + rand(-40, 40)); g.state = 'idle'; }
      this.addNode('gold', cx + 60, cy - 50, 700);
      // реликвия у лагеря — заберите после зачистки
      this.relics.push({ id: this.nextId++, x: cx - 70, y: cy + 40, taken: false, phase: rand(0, 6) });
    }
    // ещё реликвии в разброс по карте
    for (let i = 0; i < 3; i++) {
      this.relics.push({ id: this.nextId++, x: rand(600, WORLD.w - 600), y: rand(400, WORLD.h - 400), taken: false, phase: rand(0, 6) });
    }
  }

  relicsHeld = 0; // реликвий собрано игроком (пассивное золото)
  relicT = 0;     // таймер дохода с реликвий
  idleIdx = 0;    // позиция циклического поиска свободных крестьян

  // ---------- input ----------
  onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) { if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault(); return; }
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (k === ' ' || k === 'p' || k === 'escape') {
      if (k === 'escape') {
        if (this.placement) { this.placement = null; this.pushHud(); return; }
        if (this.attackArmed || this.rallyArmed || this.patrolArmed) { this.attackArmed = false; this.rallyArmed = false; this.patrolArmed = false; this.pushHud(); return; }
        if (this.selected.size || this.selBld >= 0) { this.clearSel(); this.pushHud(); return; }
      }
      this.onPauseRequest();
      e.preventDefault(); return;
    }
    if (this.paused || this.over) return;
    // группы контроля: Ctrl/Cmd+1..5 — назначить, Alt+1..5 — выбрать (цифры без модификаторов — тренировка)
    const gi = ['1', '2', '3', '4', '5'].indexOf(k);
    if (gi >= 0 && (e.ctrlKey || e.metaKey)) { this.setGroup(gi); e.preventDefault(); return; }
    if (gi >= 0 && e.altKey) { this.recallGroup(gi, e.shiftKey); e.preventDefault(); return; }
    if (k === '1') this.train('villager');
    else if (k === '2') this.train('swordsman');
    else if (k === '3') this.train('archer');
    else if (k === '4') this.train('knight');
    else if (k === '5') this.train('spearman');
    else if (k === '6') this.train('cavalry');
    else if (k === '7') this.train('catapult');
    else if (k === '8') this.train('monk');
    else if (k === 'q') this.enterPlacement('house');
    else if (k === 'e') this.enterPlacement('barracks');
    else if (k === 'r') this.enterPlacement('tower');
    else if (k === 'f') this.enterPlacement('farm');
    else if (k === 'z') this.enterPlacement('stable');
    else if (k === 'x') this.enterPlacement('blacksmith');
    else if (k === 'c') this.enterPlacement('market');
    else if (k === 'b') this.enterPlacement('wall');
    else if (k === 'v') this.enterPlacement('gate');
    else if (k === 'w') this.enterPlacement('wonder');
    else if (k === 't') this.ageUp();
    else if (k === 'g') { if (this.selUnits().length) { this.attackArmed = !this.attackArmed; this.rallyArmed = false; this.patrolArmed = false; this.sound.select(); this.pushHud(); } }
    else if (k === 'y') { if (this.selUnits().some(u => u.key !== 'villager')) { this.patrolArmed = !this.patrolArmed; this.attackArmed = false; this.sound.select(); this.pushHud(); } }
    else if (k === 'h') this.centerOn(380, 1620);
    else if (k === '.' || k === 'ю') this.jumpToIdleVillager();
    else if (k === 'm') this.toggleMute();
    else if (k === '+' || k === '=') this.zoomBy(0.15);
    else if (k === '-' || k === '_') this.zoomBy(-0.15);
    else if (k === 'a' && e.ctrlKey === false && e.metaKey === false) { /* camera handled in update via keys */ }
  };
  onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
  onResize = () => this.resize();
  onVis = () => { if (this.settings.autoPauseOnBlur && document.hidden && !this.paused && !this.over) this.onPauseRequest(); };

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

  // ── туман войны: обновляем видимость вокруг своих юнитов/зданий ──
  updateFog(dt: number) {
    if (!this.settings.fogOfWar) { this.fogVis.fill(1); this.fogExpl.fill(1); return; }
    this.fogT -= dt;
    if (this.fogT > 0) return;
    this.fogT = 0.15;
    this.fogVis.fill(0);
    const mark = (wx: number, wy: number, sight: number) => {
      const r = Math.ceil(sight / this.fogCell);
      const cx = (wx / this.fogCell) | 0, cy = (wy / this.fogCell) | 0;
      for (let gy = cy - r; gy <= cy + r; gy++) for (let gx = cx - r; gx <= cx + r; gx++) {
        if (gx < 0 || gy < 0 || gx >= this.fogGW || gy >= this.fogGH) continue;
        const d = Math.hypot((gx + 0.5) * this.fogCell - wx, (gy + 0.5) * this.fogCell - wy);
        if (d <= sight) { const idx = gy * this.fogGW + gx; this.fogVis[idx] = 1; this.fogExpl[idx] = 1; }
      }
    };
    for (const u of this.units) if (u.owner === 'player' && !u.hidden) mark(u.x, u.y, 150);
    for (const b of this.blds) if (b.owner === 'player' && b.done >= 1) mark(b.x, b.y, BUILDING_DEFS[b.key].sight);
  }
  fogAt(wx: number, wy: number): { vis: boolean; expl: boolean } {
    const gx = (wx / this.fogCell) | 0, gy = (wy / this.fogCell) | 0;
    if (gx < 0 || gy < 0 || gx >= this.fogGW || gy >= this.fogGH) return { vis: false, expl: false };
    const idx = gy * this.fogGW + gx;
    return { vis: !!this.fogVis[idx], expl: !!this.fogExpl[idx] };
  }
  // виден ли враг игроку (без тумана — всё видно)
  canSeeEnemy(x: number, y: number): boolean {
    if (!this.settings.fogOfWar) return true;
    return this.fogAt(x, y).vis;
  }

  drawFog() {
    const { ctx } = this;
    const cell = this.fogCell;
    // видимый диапазон мира
    const m = Math.max(this.vw, this.vh) / this.cam.zoom + cell * 2;
    const gx0 = clamp(Math.floor((this.cam.x - m) / cell), 0, this.fogGW - 1);
    const gx1 = clamp(Math.ceil((this.cam.x + m) / cell), 0, this.fogGW - 1);
    const gy0 = clamp(Math.floor((this.cam.y - m) / cell), 0, this.fogGH - 1);
    const gy1 = clamp(Math.ceil((this.cam.y + m) / cell), 0, this.fogGH - 1);
    ctx.save();
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const idx = gy * this.fogGW + gx;
      if (this.fogVis[idx]) continue; // видно — без тумана
      const wx = gx * cell, wy = gy * cell;
      const [x0, y0] = toIso(wx, wy);
      const [x1, y1] = toIso(wx + cell, wy);
      const [x2, y2] = toIso(wx + cell, wy + cell);
      const [x3, y3] = toIso(wx, wy + cell);
      ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3);
      ctx.closePath();
      ctx.fillStyle = this.fogExpl[idx] ? 'rgba(10,16,12,0.42)' : 'rgba(6,10,8,0.82)';
      ctx.fill();
    }
    ctx.restore();
  }

  // применить настройки на лету (сложность влияет на ближайшие волны)
  applySettings(s: Settings) {
    const prevDiff = this.settings.difficulty;
    this.settings = { ...s };
    this.muted = s.muted;
    this.sound.setMuted(s.muted);
    this.sound.setVoice(s.voices);
    this.sound.setVoiceVolume(s.voiceVolume ?? 0.3);
    if (s.difficulty !== prevDiff) {
      this.difficulty = s.difficulty;
      // волновой таймер и пауза между набегами — под новую сложность
      const iv = DIFF[s.difficulty].waveInterval;
      if (this.waveT > iv) this.waveT = iv;
      this.pushBanner(`Сложность: ${DIFF[s.difficulty].name}`, 'Настройки применены — враг учтёт это в ближайшем набеге', 2.6);
    }
    this.pushHud();
  }

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
    // режим протяжки стены/ворот — начинаем линию вместо рамки
    if (this.placement === 'wall' || this.placement === 'gate') {
      this.wallDrag = { x0: w.x, y0: w.y, x1: w.x, y1: w.y };
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
    // протяжка стены
    if (this.wallDrag) { this.updateWallDrag(w.x, w.y); return; }
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
    if (this.paused || this.over) { this.box = null; this.wallDrag = null; return; }
    // завершение протяжки стены
    if (this.wallDrag) {
      const d = this.wallDrag;
      const moved = Math.hypot(d.x1 - d.x0, d.y1 - d.y0) > 24;
      if (moved) this.finishWallDrag(); else { this.wallDrag = null; this.tryPlace(w.x, w.y); if (!this.keys.has('shift')) this.placement = null; this.pushHud(); }
      this.box = null;
      return;
    }
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
        if (n) { this.sound.select(); this.voiceSel('select'); }
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
  pickRelic(x: number, y: number): Relic | null {
    let best: Relic | null = null; let bd = 40 * 40;
    for (const r of this.relics) { if (r.taken) continue; const d = dist2(x, y, r.x, r.y); if (d < bd) { bd = d; best = r; } }
    return best;
  }
  // отправить выбранного монаха (любого юнита) за реликвией
  orderFetchRelic(r: Relic) {
    const us = this.selUnits().filter(u => u.owner === 'player');
    if (!us.length) return;
    // предпочитаем монаха, иначе ближайшего
    const monk = us.find(u => u.key === 'monk') || us.slice().sort((a, c) => dist2(a.x, a.y, r.x, r.y) - dist2(c.x, c.y, r.x, r.y))[0];
    monk.relicTarget = r.id;
    monk.state = 'move'; monk.tx = r.x; monk.ty = r.y; monk.targetU = -1; monk.targetB = -1;
    this.sound.move();
    this.spawnRing(r.x, r.y, '#fde047');
    this.floater(r.x, r.y - 30, '📿 Реликвия!', '#fde047', 14);
    this.pushHud();
  }
  collectRelic(u: Unit, r: Relic) {
    r.taken = true; u.relicTarget = undefined;
    this.relicsHeld++;
    this.res.gold += 150;
    this.score += 200;
    this.sound.coin();
    this.burst(r.x, r.y - 10, 20, ['#fde047', '#facc15', '#fff'], 120, 0.9);
    this.floater(r.x, r.y - 30, '+150 🪙 реликвия!', '#fde047', 16, true);
    this.pushBanner('📿 Реликвия обретена!', '+150 золота и +золото каждые ~10 сек, пока вы владеете реликвиями', 4);
    this.checkQuests();
    this.pushHud();
  }

  handleTap(x: number, y: number, additive: boolean) {
    if (this.rallyArmed && this.selBld >= 0) {
      const b = this.blds.find(b => b.id === this.selBld);
      if (b) {
        const node = this.pickNode(x, y); // точка сбора на ресурсе?
        b.rallyNode = node ? node.id : -1;
        b.rallyX = node ? node.x : x; b.rallyY = node ? node.y : y;
        this.spawnRing(b.rallyX, b.rallyY, node ? '#a3e635' : '#f6d47c');
        this.sound.move();
        if (node) this.floater(node.x, node.y - 30, 'Крестьяне пойдут на ресурс', '#a3e635', 13);
      }
      this.rallyArmed = false; this.pushHud(); return;
    }
    if (this.placement) {
      if (this.placement === 'wall' || this.placement === 'gate') {
        // протяжка начинается при нажатии; тап — одиночный сегмент
        if (!this.wallDrag) this.tryPlace(x, y);
        else { this.finishWallDrag(); }
        return;
      }
      this.tryPlace(x, y); return;
    }
    if (this.patrolArmed) {
      const us = this.selUnits();
      if (us.length) { this.setPatrol(x, y); }
      this.patrolArmed = false; this.pushHud(); return;
    }
    if (this.attackArmed) {
      const us = this.selUnits();
      if (us.length) { this.orderAttackMove(us, x, y); this.attackArmed = false; this.pushHud(); }
      return;
    }
    const u = this.pickUnit(x, y);
    const b = this.pickBld(x, y);
    const rel = !u && !b ? this.pickRelic(x, y) : null;
    const n = !u && !b && !rel ? this.pickNode(x, y) : null;
    // enemy / neutral target with selection → order
    if (u && u.owner !== 'player' && this.selected.size) { this.issueSmart(u.x, u.y); return; }
    if (b && b.owner !== 'player' && this.selected.size) { this.issueSmart(b.x, b.y); return; }
    if (rel && this.selected.size) { this.orderFetchRelic(rel); return; }
    if (n && this.selected.size && this.selUnits().some(v => v.key === 'villager')) { this.issueSmart(n.x, n.y); return; }
    if (u && u.owner === 'player') {
      if (!additive) this.clearSel();
      this.selected.add(u.id); this.selBld = -1;
      this.sound.select(); this.sound.voice(u.key, 'select'); this.pushHud(); return;
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
      this.sound.move(); this.sound.say('За работу'); this.spawnRing(x, y, '#f6d47c'); return;
    }
    // own DAMAGED building → repair
    if (tb && tb.owner === 'player' && tb.done >= 1 && tb.hp < tb.maxHp - 1 && hasVill) {
      for (const v of us.filter(u => u.key === 'villager')) { v.state = 'build'; v.buildId = tb.id; v.tx = tb.x + rand(-50, 50); v.ty = tb.y + rand(-46, 46); }
      this.sound.move(); this.sound.say('За работу'); this.floater(tb.x, tb.y - 60, '🔧 Ремонт!', '#7dd3fc', 15); this.spawnRing(x, y, '#7dd3fc'); return;
    }
    // default: military attack-move, villagers move
    if (hasMil && !hasVill) this.orderAttackMove(us, x, y);
    else if (!hasMil) { for (const v of us) { v.state = 'move'; v.tx = x + rand(-24, 24); v.ty = y + rand(-24, 24); v.targetU = -1; v.targetB = -1; v.nodeId = -1; v.buildId = -1; } this.sound.move(); this.voiceSel('move'); this.spawnRing(x, y, '#7dd3fc'); }
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
  // раскладка построения: юниты в плотную формацию-«коробку» вокруг точки
  formation(us: Unit[], x: number, y: number) {
    const n = us.length, cols = Math.ceil(Math.sqrt(n)), gap = 26;
    const rows = Math.ceil(n / cols);
    us.forEach((u, i) => {
      const cx = (i % cols) - (cols - 1) / 2;
      const cy = ((i / cols) | 0) - (rows - 1) / 2;
      u.tx = x + cx * gap; u.ty = y + cy * gap * 0.7;
    });
  }
  orderAttackMove(us: Unit[], x: number, y: number) {
    // атакующие и обычные — строй, крестьяне не лезут в линию
    const mil = us.filter(u => u.key !== 'villager');
    this.formation(mil, x, y);
    for (const u of mil) { u.state = 'attackmove'; u.targetU = -1; u.targetB = -1; }
    us.filter(u => u.key === 'villager').forEach((v, i) => {
      v.state = 'move'; v.targetU = -1; v.targetB = -1; v.nodeId = -1; v.buildId = -1;
      v.tx = x - 60 + (i % 4) * 22; v.ty = y + 60 + ((i / 4) | 0) * 22;
    });
    this.sound.move(); this.voiceSel('attack'); this.spawnRing(x, y, '#f87171', true);
  }

  // боевая стойка выбранных войск
  setStance(stance: 'aggressive' | 'defensive' | 'stand') {
    const us = this.selUnits().filter(u => u.owner === 'player' && u.key !== 'villager' && u.key !== 'wolf');
    if (!us.length) return;
    for (const u of us) {
      u.stance = stance;
      u.homeX = u.x; u.homeY = u.y;
      if (stance === 'stand' && u.state !== 'attackmove') { u.state = 'idle'; u.targetU = -1; u.targetB = -1; }
    }
    this.sound.ack('soldier');
    const names = { aggressive: 'Агрессивная', defensive: 'Оборонительная', stand: 'Держать позицию' };
    this.floater(this.cam.x, this.cam.y - 90, `Стойка: ${names[stance]}`, '#7dd3fc', 15);
    this.pushHud();
  }

  // приказ патрулировать между двумя точками (правый клик по конечной точке с зажатым P)
  setPatrol(x: number, y: number) {
    const us = this.selUnits().filter(u => u.owner === 'player' && u.key !== 'villager' && u.key !== 'wolf');
    if (!us.length) return;
    this.formation(us, x, y);
    for (const u of us) {
      u.homeX = u.x; u.homeY = u.y; u.patrolX = x; u.patrolY = y;
      u.state = 'patrol'; u.tx = x; u.ty = y; u.targetU = -1; u.targetB = -1; u.waitT = 0;
    }
    this.sound.move();
    this.spawnRing(x, y, '#a78bfa');
    this.floater(x, y - 40, '👁 Патруль', '#c4b5fd', 14);
    this.pushHud();
  }
  get selStance(): string | null {
    const us = this.selUnits().filter(u => u.owner === 'player' && u.key !== 'villager' && u.key !== 'wolf');
    if (!us.length) return null;
    const s = us[0].stance;
    return us.every(u => u.stance === s) ? s : 'mixed';
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
    const reqBld = d.bld as BuildingKey;
    const ageReq = (d as { ageReq?: number }).ageReq ?? 0;
    // epoch gate
    if (this.age < ageReq) {
      this.floater(this.cam.x, this.cam.y - 120, `Нужен: ${AGES[ageReq].name}!`, '#f87171', 18);
      this.sound.error(); return;
    }
    // find correct training building (у ГЦ лимит очереди 5)
    let b: Bld | undefined = this.blds.find(bl => bl.owner === 'player' && bl.key === reqBld && bl.done >= 1 && bl.queue.length < 5);
    if (!b) {
      this.floater(this.cam.x, this.cam.y - 120, `Нужен: ${BUILDING_DEFS[reqBld].name}!`, '#f87171', 18);
      this.sound.error(); return;
    }
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
    if (key === 'stable' && this.age < 1) { this.floater(this.cam.x, this.cam.y - 100, 'Конюшне нужен Феодальный век!', '#f87171', 18); this.sound.error(); return; }
    if (key === 'blacksmith' && this.age < 2) { this.floater(this.cam.x, this.cam.y - 100, 'Кузнице нужен Замковый век!', '#f87171', 18); this.sound.error(); return; }
    const areq = (BUILDING_DEFS[key] as unknown as { ageReq?: number }).ageReq;
    if (areq != null && this.age < areq) { this.floater(this.cam.x, this.cam.y - 100, `Нужен: ${AGES[areq].name}!`, '#f87171', 18); this.sound.error(); return; }
    const c = BUILDING_DEFS[key].cost;
    if (!this.afford(c)) { this.floater(this.cam.x, this.cam.y - 100, 'Не хватает дерева/золота!', '#f87171', 18); this.sound.error(); return; }
    this.placement = key; this.attackArmed = false; this.rallyArmed = false; this.wallDrag = null;
    this.sound.select(); this.pushHud();
  }
  cancelPlacement() { this.placement = null; this.wallDrag = null; this.pushHud(); }

  // протяжка стены: обновить конечную точку (в процессе перетаскивания)
  updateWallDrag(x: number, y: number) {
    if (this.placement !== 'wall' && this.placement !== 'gate') return;
    if (!this.wallDrag) { this.wallDrag = { x0: x, y0: y, x1: x, y1: y }; return; }
    this.wallDrag.x1 = x; this.wallDrag.y1 = y;
  }
  // закончить протяжку — поставить сегменты вдоль линии (с привязкой к клеткам)
  finishWallDrag() {
    const key = this.placement;
    const d = this.wallDrag;
    this.wallDrag = null;
    if (!key || !d) return;
    const [x0, y0] = this.snapWall(d.x0, d.y0);
    const [x1, y1] = this.snapWall(d.x1, d.y1);
    const dx = x1 - x0, dy = y1 - y0;
    // идём клетками вдоль доминирующей оси (как реальная кладка)
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const axis: 'x' | 'y' = adx > ady ? 'x' : 'y';
    const steps = Math.max(1, Math.round(Math.max(adx, ady) / TILE_STEP));
    let placed = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = Math.round((x0 + dx * t) / TILE_STEP) * TILE_STEP;
      const py = Math.round((y0 + dy * t) / TILE_STEP) * TILE_STEP;
      if (this.placementValid(px, py, key) && this.afford(BUILDING_DEFS[key].cost)) placed += this.placeSingle(key, px, py, axis) ? 1 : 0;
    }
    if (placed) this.sound.place();
    if (!this.keys.has('shift')) this.placement = null;
    this.pushHud();
  }

  // поставить один сегмент/здание (для стен — без авто-сброса режима)
  placeSingle(key: BuildingKey, x: number, y: number, axis?: 'x' | 'y'): boolean {
    if (key === 'wall' || key === 'gate') [x, y] = this.snapWall(x, y);
    if (!this.placementValid(x, y, key)) return false;
    const c = BUILDING_DEFS[key].cost;
    if (!this.afford(c)) return false;
    this.pay(c);
    const b = this.addBld(key, 'player', x, y, 0.15);
    if (key === 'wall' || key === 'gate') b.axis = axis ?? this.wallAxisAt(x, y, key);
    b.buildT = 0; this.builtCount++;
    this.burst(x, y, 20, ['#d6a45c', '#8b5e2e', '#f6d47c'], 110);
    // авто-рабочий
    let best: Unit | null = null; let bd = 700 * 700;
    for (const u of this.units) { if (u.owner !== 'player' || u.key !== 'villager' || u.state === 'gather' || u.state === 'return') continue; const dd = dist2(u.x, u.y, x, y); if (dd < bd) { bd = dd; best = u; } }
    if (best) { best.state = 'build'; best.buildId = b.id; best.tx = x + rand(-40, 40); best.ty = y + rand(-36, 36); }
    return true;
  }

  // ── сохранение / загрузка партии ──
  serialize(): string {
    const data = {
      v: 1, difficulty: this.difficulty, time: this.time, age: this.age, eage: this.eage,
      wave: this.wave, waveT: this.waveT, res: this.res, eres: this.eres, score: this.score,
      kills: this.kills, razed: this.razed, gatheredTotal: this.gatheredTotal, woodGathered: this.woodGathered,
      soldiersTrained: this.soldiersTrained, barracksBuilt: this.barracksBuilt, wolvesSlain: this.wolvesSlain,
      cam: this.cam, tech: this.tech, questsDone: this.questsDone,
      units: this.units.map(u => ({ key: u.key, owner: u.owner, x: u.x, y: u.y, hp: u.hp, state: u.state, tx: u.tx, ty: u.ty, targetU: u.targetU, targetB: u.targetB, face: u.face, carryType: u.carry.type, carryAmt: u.carry.amt, xp: u.xp || 0, level: u.level || 1, kills: u.kills || 0 })),
      blds: this.blds.map(b => ({ key: b.key, owner: b.owner, x: b.x, y: b.y, hp: b.hp, done: b.done, queue: b.queue, rallyX: b.rallyX, rallyY: b.rallyY, axis: b.axis ?? null })),
      nodes: this.nodes.map(n => ({ kind: n.kind, x: n.x, y: n.y, amount: n.amount, r: n.r })),
      relicsHeld: this.relicsHeld,
      dip: { atWar: this.atWar, grievance: this.grievance, casusBelli: this.casusBelli, warT: this.warT, peaceT: this.peaceT, morale: this.morale, wonderT: this.wonderT },
    };
    return JSON.stringify(data);
  }

  static hasSave(): boolean {
    try { return !!localStorage.getItem('empires-dawn-savegame-v1'); } catch { return false; }
  }
  static clearSave() { try { localStorage.removeItem('empires-dawn-savegame-v1'); } catch { /* noop */ } }
  saveGame() {
    try { localStorage.setItem('empires-dawn-savegame-v1', this.serialize()); this.floater(this.cam.x, this.cam.y - 80, '💾 Партия сохранена', '#a3e635', 16); } catch { /* noop */ }
  }
  loadFromSave(): boolean {
    let raw: string | null = null;
    try { raw = localStorage.getItem('empires-dawn-savegame-v1'); } catch { /* noop */ }
    if (!raw) return false;
    try {
      const d = JSON.parse(raw);
      // карта соответствия старых id → новые
      const uMap = new Map<number, number>(); const bMap = new Map<number, number>();
      this.units = []; this.blds = []; this.nodes = [];
      (d.units || []).forEach((ud: { key: UnitKey; owner: 'player'|'enemy'|'neutral'; x: number; y: number; hp: number; state: Unit['state']; tx: number; ty: number; targetU: number; targetB: number; face: number; carryType: 'wood'|'food'|'gold'; carryAmt: number; xp?: number; level?: number; kills?: number }, i: number) => {
        const u = this.addUnit(ud.key, ud.owner, ud.x, ud.y);
        u.hp = ud.hp; u.state = ud.state; u.tx = ud.tx; u.ty = ud.ty; u.face = ud.face;
        u.carry = { type: ud.carryType, amt: ud.carryAmt };
        u.targetU = ud.targetU; u.targetB = ud.targetB;
        // восстановить ранг героя и его боевые бонусы
        const lv = ud.level || 1;
        if (lv > 1) { u.level = lv; u.xp = ud.xp || 0; u.kills = ud.kills || 0; u.atk *= Math.pow(1.09, lv - 1); u.maxHp *= Math.pow(1.10, lv - 1); u.hp = Math.min(u.maxHp, Math.max(u.hp, ud.hp)); }
        uMap.set(i, u.id);
      });
      (d.blds || []).forEach((bd: { key: BuildingKey; owner: 'player'|'enemy'; x: number; y: number; hp: number; done: number; queue: { key: UnitKey; t: number; total: number }[]; rallyX: number; rallyY: number; axis?: 'x'|'y'|null }, i: number) => {
        const b = this.addBld(bd.key, bd.owner, bd.x, bd.y, Math.max(0.15, bd.done));
        b.hp = bd.hp; b.done = bd.done; b.queue = bd.queue || []; b.rallyX = bd.rallyX; b.rallyY = bd.rallyY;
        if ((bd.key === 'wall' || bd.key === 'gate') && bd.axis) b.axis = bd.axis;
        bMap.set(i, b.id);
      });
      (d.nodes || []).forEach((nd: { kind: 'wood'|'gold'|'food'; x: number; y: number; amount: number; r: number }) => this.addNode(nd.kind, nd.x, nd.y, nd.amount));
      // цели не сохраняем — юниты перенацелятся сами; декор оставляем от genWorld
      void uMap; void bMap;
      this.time = d.time || 0; this.age = d.age || 0; this.eage = d.eage || 0;
      this.wave = d.wave || 0; this.waveT = d.waveT ?? DIFF[this.difficulty].waveInterval;
      this.res = { ...this.res, ...d.res }; this.eres = { ...this.eres, ...d.eres };
      this.score = d.score || 0; this.kills = d.kills || 0; this.razed = d.razed || 0;
      this.gatheredTotal = d.gatheredTotal || 0; this.woodGathered = d.woodGathered || 0;
      this.soldiersTrained = d.soldiersTrained || 0; this.barracksBuilt = d.barracksBuilt || 0; this.wolvesSlain = d.wolvesSlain || 0;
      this.relicsHeld = d.relicsHeld || 0;
      // восстановить взятые реликвии как убранные с карты
      if (this.relicsHeld > 0) for (let i = 0; i < Math.min(this.relics.length, this.relicsHeld); i++) this.relics[i].taken = true;
      this.tech = d.tech || {}; this.questsDone = d.questsDone || {};
      if (d.dip) { this.atWar = !!d.dip.atWar; this.grievance = d.dip.grievance ?? 8; this.casusBelli = d.dip.casusBelli ?? 0; this.warT = d.dip.warT ?? 0; this.peaceT = d.dip.peaceT ?? 0; this.morale = d.dip.morale ?? 1; this.wonderT = d.dip.wonderT ?? 0; }
      if (d.cam) this.cam = { ...this.cam, ...d.cam };
      this.pushBanner('💾 Сохранение загружено', 'Империя восстановлена', 3);
      return true;
    } catch { return false; }
  }

  // ── группы контроля ──
  setGroup(i: number) {
    if (i < 0 || i >= this.groups.length) return;
    this.groups[i] = this.selUnits().map(u => u.id);
    this.floater(this.cam.x, this.cam.y - 90, `Группа ${i + 1} назначена`, '#7dd3fc', 14);
    this.sound.select();
  }
  recallGroup(i: number, additive = false) {
    if (i < 0 || i >= this.groups.length) return;
    const ids = new Set(this.groups[i]);
    const us = this.units.filter(u => u.owner === 'player' && ids.has(u.id));
    if (!us.length) { this.sound.error(); return; }
    if (!additive) this.clearSel();
    this.selBld = -1;
    for (const u of us) this.selected.add(u.id);
    this.sound.ack('soldier');
    this.voiceSel('select');
    this.pushHud();
  }

  // ── технологии ──
  hasTech(id: string) { return !!this.tech[id]; }
  techsFor(bldKey: BuildingKey): string[] {
    return Object.values(TECHS).filter(t => t.bld === bldKey).map(t => t.id);
  }
  // данные для экрана-досье «дерево технологий»
  techTreeData(): TechTreeRow[] {
    const costTxt = (c: { wood: number; food: number; gold: number }) => {
      const p: string[] = [];
      if (c.wood) p.push(`${c.wood}🪵`);
      if (c.food) p.push(`${c.food}🍖`);
      if (c.gold) p.push(`${c.gold}🪙`);
      return p.join(' ');
    };
    const busyId = this.blds.find(b => b.owner === 'player' && b.research)?.research?.id ?? null;
    return Object.values(TECHS).map(t => {
      const done = !!this.tech[t.id];
      const researching = busyId === t.id;
      const hasBld = this.blds.some(b => b.owner === 'player' && b.key === t.bld && b.done >= 1);
      const ageOk = this.age >= t.ageReq;
      let state: TechTreeRow['state'];
      if (done) state = 'done';
      else if (researching) state = 'researching';
      else if (!ageOk) state = 'age';
      else if (!hasBld) state = 'nobuild';
      else state = 'ready';
      return {
        id: t.id, name: t.name, desc: t.desc, icon: t.icon,
        bld: t.bld, bldName: BUILDING_DEFS[t.bld].name, ageReq: t.ageReq,
        cost: costTxt(t.cost), time: t.time, state,
        canStart: state === 'ready' && this.afford(t.cost) && !this.blds.some(b => b.owner === 'player' && b.research),
      };
    }).sort((a, b) => a.ageReq - b.ageReq || a.id.localeCompare(b.id));
  }
  research(id: string) {
    const t = TECHS[id];
    if (!t || this.paused || this.over) return;
    if (this.tech[id]) { this.sound.error(); return; }
    if (this.age < t.ageReq) { this.floater(this.cam.x, this.cam.y - 110, `Нужен: ${AGES[t.ageReq].name}!`, '#f87171', 17); this.sound.error(); return; }
    const b = this.blds.find(bl => bl.owner === 'player' && bl.key === t.bld && bl.done >= 1 && !bl.research);
    if (!b) { this.floater(this.cam.x, this.cam.y - 110, `Нужна свободная: ${BUILDING_DEFS[t.bld].name}`, '#f87171', 16); this.sound.error(); return; }
    if (!this.afford(t.cost)) { this.floater(this.cam.x, this.cam.y - 110, 'Не хватает ресурсов!', '#f87171', 17); this.sound.error(); return; }
    this.pay(t.cost);
    b.research = { id, t: 0, total: t.time };
    this.sound.select();
    this.floater(b.x, b.y - 40, `Исследуем: ${t.name}`, '#93c5fd', 15);
    this.pushHud();
  }
  applyTech(id: string) {
    const t = TECHS[id]; if (!t) return;
    this.tech[id] = true;
    const us = () => this.units;
    switch (id) {
      case 'sharpBlades': for (const u of us()) if (u.owner === 'player') u.atk *= 1.25; break;
      case 'forgedArmor': for (const u of us()) if (u.owner === 'player') { u.maxHp *= 1.25; u.hp *= 1.25; } break;
      case 'infantryDrill': for (const u of us()) if (u.owner === 'player' && u.key !== 'knight' && u.key !== 'cavalry') u.speed *= 1.15; break;
      case 'horseBreeding': for (const u of us()) if (u.owner === 'player' && (u.key === 'knight' || u.key === 'cavalry')) { u.speed *= 1.15; u.maxHp *= 1.15; u.hp *= 1.15; } break;
      case 'heavyShot': for (const u of us()) if (u.owner === 'player' && u.key === 'catapult') u.atk *= 1.35; break;
      default: break;
    }
    this.sound.research();
    this.burst(this.cam.x, this.cam.y - 60, 18, ['#93c5fd', '#f6d47c', '#fff'], 110, 0.8);
    this.pushBanner(`📜 ${t.name}!`, t.desc, 2.8);
    this.score += 250;
    this.pushHud();
  }
  // множитель дальности стрелков/башен
  rangeMult(key: string, owner: string): number {
    if (owner !== 'player' || !this.hasTech('eagleEye')) return 1;
    if (key === 'archer' || key === 'tower' || key === 'towncenter' || key === 'catapult') return 1.2;
    return 1;
  }
  gatherMult(): number { return this.hasTech('ironTools') ? 1.3 : 1; }
  carryCap(): number { return this.hasTech('wheelbarrow') ? 22 : 14; }

  // ── гарнизон: укрыть/выпустить юнитов ──
  garrisonCap(b: Bld): number { return b.key === 'towncenter' ? 10 : b.key === 'tower' ? 6 : b.key === 'house' ? 5 : 0; }
  canGarrison(b: Bld): boolean { return b.owner === 'player' && b.done >= 1 && this.garrisonCap(b) > 0; }
  garrisonUnits(buildId: number) {
    const b = this.blds.find(bl => bl.id === buildId);
    if (!b || !this.canGarrison(b)) return;
    const us = this.selUnits().filter(u => u.owner === 'player');
    let n = 0;
    for (const u of us) {
      if (b.garrison.length >= this.garrisonCap(b)) break;
      b.garrison.push(u.id);
      // спрятать юнита
      u.hp = Math.min(u.maxHp, u.hp + 2); // лёгкое укрытие-лечение
      u.state = 'idle'; u.targetU = -1; u.targetB = -1;
      n++;
    }
    // помечаем укрытых
    for (const id of b.garrison) { const u = this.units.find(x => x.id === id); if (u) (u as Unit & { hidden?: number }).hidden = buildId; }
    if (n) { this.sound.ack('soldier'); this.floater(b.x, b.y - 40, `Укрыто: ${b.garrison.length}`, '#93c5fd', 13); this.pushHud(); }
  }
  ungarrisonUnits(buildId: number, rally = false) {
    const b = this.blds.find(bl => bl.id === buildId);
    if (!b || !b.garrison.length) return;
    const ids = [...b.garrison]; b.garrison = [];
    ids.forEach((id, i) => {
      const u = this.units.find(x => x.id === id);
      if (!u) return;
      (u as Unit & { hidden?: number }).hidden = undefined;
      const ang = (i / ids.length) * Math.PI * 2;
      u.x = b.x + Math.cos(ang) * (b.size / 2 + 26);
      u.y = b.y + Math.sin(ang) * (b.size / 2 + 26) + 20;
      if (rally) { u.state = 'move'; u.tx = b.rallyX; u.ty = b.rallyY; } else { u.state = 'idle'; u.tx = u.x; u.ty = u.y; }
    });
    this.sound.move(); this.pushHud();
  }

  // отправить выбранных (или ближайших свободных) крестьян чинить здание
  repairBuilding(buildId: number) {
    const b = this.blds.find(bl => bl.id === buildId);
    if (!b || b.owner !== 'player' || b.done < 1) return;
    if (b.hp >= b.maxHp - 1) { this.floater(b.x, b.y - 60, 'Здание не повреждено', '#a3e635', 14); return; }
    let vills = this.selUnits().filter(u => u.owner === 'player' && u.key === 'villager');
    if (!vills.length) vills = this.units.filter(u => u.owner === 'player' && u.key === 'villager' && (u.state === 'idle' || u.state === 'move'));
    vills.sort((a, c) => dist2(a.x, a.y, b.x, b.y) - dist2(c.x, c.y, b.x, b.y));
    const crew = vills.slice(0, 4);
    if (!crew.length) { this.floater(b.x, b.y - 60, 'Нет свободных крестьян', '#f87171', 14); this.sound.error(); return; }
    for (const v of crew) { v.state = 'build'; v.buildId = b.id; v.tx = b.x + rand(-50, 50); v.ty = b.y + rand(-46, 46); }
    this.sound.move(); this.sound.say('За работу');
    this.floater(b.x, b.y - 60, `🔧 Ремонт: ${crew.length} кр.`, '#7dd3fc', 15);
    this.pushHud();
  }

  // голосовая реплика случайного из выбранных игроком юнитов
  voiceSel(event: 'select' | 'move' | 'attack' | 'gather') {
    const us = this.selUnits().filter(u => u.owner === 'player' && u.key !== 'wolf');
    if (!us.length) return;
    const u = us[(Math.random() * us.length) | 0];
    this.sound.voice(u.key, event);
  }

  // ── рынок: обмен ресурсов на золото ──
  marketCount(): number { return this.blds.filter(b => b.owner === 'player' && b.key === 'market' && b.done >= 1).length; }
  tradeRate(): number { return this.hasTech('coinage') ? 60 : 100; } // сколько ресурса за 10 золота
  trade(from: 'wood' | 'food'): boolean {
    if (!this.marketCount()) { this.floater(this.cam.x, this.cam.y - 100, 'Нужен: Рынок!', '#f87171', 16); this.sound.error(); return false; }
    const rate = this.tradeRate();
    if (this.res[from] < rate) { this.floater(this.cam.x, this.cam.y - 100, `Нужно ${rate} ${from === 'wood' ? '🪵' : '🍖'}`, '#f87171', 16); this.sound.error(); return false; }
    this.res[from] -= rate;
    this.res.gold += 10;
    this.sound.coin();
    this.floater(this.cam.x, this.cam.y - 90, `+10 🪙`, '#fde047', 16, true);
    this.pushHud();
    return true;
  }

  // ── отмена последнего юнита в очереди здания (возврат ресурсов) ──
  cancelTrain(buildId: number, idx = -1) {
    const b = this.blds.find(bl => bl.id === buildId && bl.owner === 'player');
    if (!b || !b.queue.length) return;
    const qi = idx < 0 ? b.queue.length - 1 : Math.min(idx, b.queue.length - 1);
    const [item] = b.queue.splice(qi, 1);
    if (!item) return;
    const c = UNIT_DEFS[item.key].cost;
    this.res.wood += c.wood; this.res.food += c.food; this.res.gold += c.gold;
    this.sound.error();
    this.floater(b.x, b.y - 40, `${UNIT_DEFS[item.key].name}: отменён`, '#fda4af', 13);
    this.pushHud();
  }

  placementValid(x: number, y: number, key: BuildingKey): boolean {
    const isWallLike = key === 'wall' || key === 'gate';
    // стены/ворота выравниваем к шагу клеток, чтобы сегменты ложились ровно
    if (isWallLike) { x = Math.round(x / TILE_STEP) * TILE_STEP; y = Math.round(y / TILE_STEP) * TILE_STEP; }
    const s = BUILDING_DEFS[key].size / 2 + (isWallLike ? 2 : 8);
    if (x < s + 10 || y < s + 10 || x > WORLD.w - s - 10 || y > WORLD.h - s - 10) return false;
    for (const b of this.blds) {
      const bWall = b.key === 'wall' || b.key === 'gate';
      // стена к стене — вплотную (допускаем минимальное перекрытие фундаментов)
      const need = isWallLike && bWall
        ? BUILDING_DEFS[key].size / 2 + b.size / 2 - 16
        : s + b.size / 2 + (isWallLike ? -4 : 6);
      if (Math.abs(x - b.x) < need && Math.abs(y - b.y) < need) return false;
    }
    for (const n of this.nodes) {
      if (n.amount <= 0) continue;
      const need = s + n.r;
      if (Math.abs(x - n.x) < need && Math.abs(y - n.y) < need) return false;
    }
    return true;
  }

  // выровненная к клеткам точка для протяжки стен
  snapWall(x: number, y: number): [number, number] {
    return [Math.round(x / TILE_STEP) * TILE_STEP, Math.round(y / TILE_STEP) * TILE_STEP];
  }

  tryPlace(x: number, y: number) {
    const key = this.placement; if (!key) return;
    if (key === 'wall' || key === 'gate') [x, y] = this.snapWall(x, y);
    if (!this.placementValid(x, y, key)) { this.sound.error(); this.trauma = Math.min(1, this.trauma + 0.08); return; }
    const c = BUILDING_DEFS[key].cost;
    if (!this.afford(c)) { this.sound.error(); return; }
    this.pay(c);
    const b = this.addBld(key, 'player', x, y, 0.15);
    if (key === 'wall' || key === 'gate') b.axis = this.wallAxisAt(x, y, key);
    b.buildT = 0;
    this.builtCount++;
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
    if (best) { best.state = 'build'; best.buildId = b.id; best.tx = x + rand(-50, 50); best.ty = y + rand(-46, 46); this.sound.say('За работу'); }
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
    const ageNews: Record<number, string> = {
      1: 'Войска крепче! Открыты: башни 🗼 и конюшня 🐴 (рыцари/всадники)',
      2: 'Армия сильнее! Открыты: кузница 🔨 и катапульты 🪨',
      3: 'Имперская мощь! Открыто Чудо света ⭐ — постройте его для победы',
    };
    this.pushBanner(`${next.icon} ${next.name}!`, ageNews[this.age] || 'Армия сильнее, укрепления крепче', 4);
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
  armySelect() { this.clearSel(); for (const u of this.units) if (u.owner === 'player' && u.key !== 'villager') this.selected.add(u.id); this.sound.ack('soldier'); this.voiceSel('select'); this.pushHud(); }
  villsSelect() { this.clearSel(); for (const u of this.units) if (u.owner === 'player' && u.key === 'villager') this.selected.add(u.id); this.sound.ack('villager'); this.voiceSel('select'); this.pushHud(); }
  idleSelect() {
    this.clearSel();
    for (const u of this.units) if (u.owner === 'player' && u.key === 'villager' && (u.state === 'idle' || u.state === 'move')) this.selected.add(u.id);
    const us = this.selUnits();
    if (us.length) { this.centerOn(us[0].x, us[0].y); this.sound.ack('villager'); }
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
    if (n) { this.sound.move(); this.voiceSel('gather'); this.floater(this.cam.x, this.cam.y - 80, `${n} крестьян отправлено на работу!`, '#a3e635', 17); }
    this.pushHud();
  }
  nearestNode(x: number, y: number, kind: 'wood' | 'food' | 'gold'): Node | null {
    let best: Node | null = null; let bd = 1e12;
    for (const n of this.nodes) { if (n.kind !== kind || n.amount <= 0) continue; const d = dist2(x, y, n.x, n.y); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  centerTC() { const tc = this.blds.find(b => b.owner === 'player' && b.key === 'towncenter'); if (tc) this.centerOn(tc.x, tc.y); }

  // циклический прыжок по свободным крестьянам (как клавиша «.» в AoE)
  jumpToIdleVillager() {
    const vills = this.units.filter(u => u.owner === 'player' && u.key === 'villager' && (u.state === 'idle' || u.state === 'move'));
    if (!vills.length) { this.floater(this.cam.x, this.cam.y - 80, 'Все крестьяне заняты', '#94a3b8', 13); return; }
    const u = vills[this.idleIdx % vills.length];
    this.idleIdx++;
    this.clearSel(); this.selected.add(u.id);
    this.centerOn(u.x, u.y);
    this.sound.select();
    this.pushHud();
  }

  // ---------- fx ----------
  burst(x: number, y: number, n: number, colors: string[], spd: number, life = 0.7) {
    if (!this.settings.particles) return;
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 650) return;
      const a = rand(0, Math.PI * 2), s = rand(spd * 0.3, spd);
      this.parts.push({ x, y: y - 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rand(life * 0.5, life), max: life, size: rand(2, 5), color: colors[(Math.random() * colors.length) | 0], grav: 320, shape: Math.random() < 0.4 ? 'circle' : 'rect', rot: rand(0, 6), vr: rand(-8, 8) });
    }
  }
  spark(x: number, y: number, color: string) {
    if (!this.settings.particles || this.parts.length > 650) return;
    const a = rand(0, Math.PI * 2), s = rand(40, 160);
    this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35, max: 0.35, size: rand(1.5, 3), color, grav: 0, shape: 'spark', rot: a, vr: 0 });
  }
  spawnRing(x: number, y: number, color: string, big = false) {
    if (!this.settings.particles) return;
    for (let i = 0; i < (big ? 14 : 8); i++) {
      if (this.parts.length > 650) return;
      const a = (i / (big ? 14 : 8)) * Math.PI * 2;
      this.parts.push({ x, y, vx: Math.cos(a) * (big ? 130 : 90), vy: Math.sin(a) * (big ? 130 : 90), life: 0.4, max: 0.4, size: 3, color, grav: 0, shape: 'circle', rot: 0, vr: 0 });
    }
  }
  floater(x: number, y: number, text: string, color: string, size = 15, fx = false) {
    if (fx && !this.settings.damageNumbers) return; // «числа урона» выкл.
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
    const sdt = dt * this.settings.speed; // темп игры
    if (!this.paused && !this.over) this.update(sdt, dt);
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

  update(dt: number, _real = dt) {
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
    this.updateFog(dt);
    this.updateProjs(dt);
    // статистика матча
    const pop = this.popUsed('player');
    const army = this.units.filter(u => u.owner === 'player' && u.key !== 'villager').length;
    if (pop > this.peakPop) this.peakPop = pop;
    if (army > this.peakArmy) this.peakArmy = army;
    this.histT += dt;
    if (this.histT > 15) { this.histT = 0; this.history.push({ t: this.time, army, pop }); if (this.history.length > 60) this.history.shift(); }
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

    // waves — набеги идут только во время войны с соседом
    if (this.atWar && !this.over) {
      this.waveT -= dt;
      if (this.waveT <= 8 && this.waveT + dt > 8) {
        this.sound.horn();
        this.warnNextWave();
      }
      if (this.waveT <= 0) { this.launchWave(); this.waveT = Math.max(34, DIFF[this.difficulty].waveInterval - this.wave * 3.2); }
    } else {
      // в мире таймер набегов держим «наготове», но не запускаем
      this.waveT = Math.min(this.waveT, DIFF[this.difficulty].waveInterval);
    }

    // diplomacy tick (мир/война, неприязнь, поводы)
    this.diplomacyUpdate(dt);

    // реликвии: пассивное золото каждые ~10 сек
    if (this.relicsHeld > 0 && !this.over) {
      this.relicT = (this.relicT ?? 0) + dt;
      if (this.relicT >= 10) {
        this.relicT -= 10;
        const gold = this.relicsHeld * 30;
        this.res.gold += gold;
        this.floater(this.cam.x, this.cam.y - 80, `📿 +${gold}🪙 реликвии`, '#fde047', 14, true);
      }
    }
    // Чудо света: обратный отсчёт до победы, если оно цело
    if (this.wonderT > 0 && !this.over) {
      const wonderAlive = this.blds.some(b => b.owner === 'player' && b.key === 'wonder' && b.done >= 1);
      if (wonderAlive) {
        this.wonderT -= dt;
        if (this.wonderT <= 0) { this.wonderT = 0; this.finish('victory'); }
      } else {
        this.wonderT = 0; // Чудо разрушено до завершения отсчёта
      }
    }

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
          'Клавиши 2-8 — армия • Q дом • E казармы • Z конюшня • X кузница • C рынок',
          'Стройте фермы (F) — бесконечная еда • Башни (R) — оборона',
          'Кузница строит катапульты (7) • Рынок — монахов-лекарей (8)!',
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
      if (u.hidden) continue; // в гарнизоне
      // цель-реликвия: подобрать при подходе
      if (u.relicTarget != null && u.owner === 'player') {
        const r = this.relics.find(x => x.id === u.relicTarget);
        if (!r || r.taken) { u.relicTarget = undefined; }
        else if (dist2(u.x, u.y, r.x, r.y) < 30 * 30) { this.collectRelic(u, r); continue; }
      }
      const px0 = u.x, py0 = u.y;
      const stateMoving = u.state === 'move' || u.state === 'attackmove' || u.state === 'gather' || u.state === 'return' || u.state === 'build';
      u.cd -= dt; u.atkAnim = Math.max(0, u.atkAnim - dt * 4); u.flash = 0;
      u.retarget -= dt;
      if (u.owner === 'neutral') {
        const w0 = u.x, z0 = u.y;
        if (u.key === 'wolf') this.updateWolf(u, dt); else this.updateAnimal(u, dt);
        const moved = Math.hypot(u.x - w0, u.y - z0) > 1.5;
        (u as Unit & { walk?: boolean }).walk = moved;
        u.anim += dt * (moved ? 12 : 2);
        continue;
      }
      if (u.key === 'villager') this.updateVillager(u, dt);
      else this.updateSoldier(u, dt);
      // building collision push (стены блокируют; ворота пропускают своих)
      for (const b of this.blds) {
        const wallLike = b.key === 'wall' || b.key === 'gate';
        // ворота: свои проходят свободно
        if (b.key === 'gate' && b.owner === u.owner) continue;
        const block = wallLike || b.done >= 1;
        if (!block) continue;
        const h = b.size / 2;
        const rad = wallLike ? 13 : 12;
        const cx = clamp(u.x, b.x - h, b.x + h), cy = clamp(u.y, b.y - h, b.y + h);
        const dx = u.x - cx, dy = u.y - cy, d2 = dx * dx + dy * dy;
        if (d2 < rad * rad) {
          if (d2 < 0.01) { u.x += rad * dt * 60 * 0.05; continue; }
          const d = Math.sqrt(d2);
          u.x = cx + (dx / d) * rad; u.y = cy + (dy / d) * rad;
        }
      }
      u.x = clamp(u.x, 14, WORLD.w - 14); u.y = clamp(u.y, 14, WORLD.h - 14);
      // реальное перемещение за кадр (в бою на месте шаг не играем)
      const distMoved = Math.hypot(u.x - px0, u.y - py0);
      const walk = distMoved > 1.5;
      (u as Unit & { walk?: boolean }).walk = walk;
      u.anim += dt * (walk ? 12 : stateMoving ? 7 : 2);
      // пыль из-под ног — синхронно с фазой шага
      if (walk) {
        const ut = u as Unit & { dustT?: number };
        ut.dustT = (ut.dustT ?? 0) - dt;
        if (this.settings.particles && Math.sin(u.anim) > 0.97 && ut.dustT! <= 0 && this.parts.length < 620) {
          ut.dustT = 0.3;
          this.parts.push({ x: u.x - u.face * 4, y: u.y + 4, vx: rand(-14, 14), vy: rand(-24, -8), life: 0.45, max: 0.45, size: rand(2.5, 4.5), color: 'rgba(180,170,140,0.9)', grav: -30, shape: 'circle', rot: 0, vr: 0 });
        }
      }
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
        if (u.gatherT > 0.55 / this.gatherMult()) {
          u.gatherT = 0;
          u.carry = { type: 'food', amt: u.carry.amt + 2 * this.gatherMult() };
          this.burst(u.x, u.y - 8, 2, ['#a3e635', '#65a30d'], 50, 0.5);
          if (u.carry.amt >= this.carryCap()) { this.res.food += Math.floor(u.carry.amt); this.gatheredTotal += u.carry.amt; this.score += u.carry.amt * 0.35; this.floater(u.x, u.y - 24, `+${Math.floor(u.carry.amt)} 🍖`, '#fda4af', 13); u.carry.amt = 0; this.checkQuests(); }
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
      if (u.gatherT >= 0.55 / this.gatherMult()) {
        u.gatherT = 0;
        const take = Math.min(2.5 * this.gatherMult(), n.amount);
        n.amount -= take;
        u.carry.amt += take;
        if (n.kind === 'wood') { this.burst(n.x + rand(-10, 10), n.y - 6, 3, ['#a16207', '#65a30d', '#d6a45c'], 80, 0.55); if (Math.random() < 0.5) this.sound.chop(); }
        else if (n.kind === 'gold') { this.burst(n.x, n.y - 8, 3, ['#fde047', '#facc15', '#fff'], 70, 0.5); this.spark(n.x, n.y - 10, '#fef08a'); if (Math.random() < 0.4) this.sound.mine(); }
        else { this.burst(n.x, n.y - 6, 3, ['#f472b6', '#fb7185', '#a3e635'], 60, 0.5); if (Math.random() < 0.3) this.sound.gatherFood(); }
        if (n.amount <= 0) { this.burst(n.x, n.y, 14, n.kind === 'wood' ? ['#65a30d', '#3f6212'] : n.kind === 'gold' ? ['#facc15'] : ['#fb7185'], 110, 0.7); }
        if (u.carry.amt >= this.carryCap()) { u.state = 'return'; this.sendToDrop(u); }
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

  // враждебны ли стороны: волки (нейтралы) враждебны всегда; игрок и ИИ — только в состоянии войны
  hostile(a: 'player' | 'enemy' | 'neutral', b: 'player' | 'enemy' | 'neutral'): boolean {
    if (a === b) return false;
    if (a === 'neutral' || b === 'neutral') return true;
    return this.atWar;
  }

  acquireEnemy(u: Unit, radius: number): { tu: number; tb: number } {
    let bu = -1, bb = -1; let bd = radius * radius;
    for (const e of this.units) {
      if (!this.hostile(u.owner, e.owner)) continue;
      // пассивный скот не цель авто-боя (бить можно только явным приказом)
      if (e.owner === 'neutral' && e.key !== 'wolf' && u.state !== 'attackmove') continue;
      if (u.owner === 'player' && e.owner === 'neutral' && e.key === 'wolf' && u.state !== 'attackmove') {
        // villagers don't auto-aggro wolves; military does
        if (u.key === 'villager') continue;
      }
      const d = dist2(u.x, u.y, e.x, e.y);
      if (d < bd) { bd = d; bu = e.id; bb = -1; }
    }
    if (bu >= 0) return { tu: bu, tb: -1 };
    let bbd = radius * radius;
    for (const b of this.blds) {
      if (!this.hostile(u.owner, b.owner) || b.done < 0.5) continue;
      if (u.owner === 'player' && u.key === 'villager') continue;
      let d = dist2(u.x, u.y, b.x, b.y) - b.size * b.size * 0.25;
      if (b.key === 'wonder') d *= 0.15;   // Чудо — приоритетная цель для атаки
      if (d < bbd) { bbd = d; bb = b.id; }
    }
    return { tu: -1, tb: bb };
  }

  updateSoldier(u: Unit, dt: number) {
    // монах-лекарь — не воюет, лечит союзников
    if (u.key === 'monk') { this.updateMonk(u, dt); return; }
    // validate targets
    let tu = u.targetU >= 0 ? this.units.find(e => e.id === u.targetU) : undefined;
    let tb = u.targetB >= 0 ? this.blds.find(b => b.id === u.targetB) : undefined;
    if (tu && (tu.hp <= 0)) { tu = undefined; u.targetU = -1; }
    if (tb && tb.hp <= 0) { tb = undefined; u.targetB = -1; }
    const isCata = u.key === 'catapult';
    // auto-acquire
    if (u.retarget <= 0 && !tu && !tb) {
      u.retarget = 0.4;
      const scan = isCata ? 300 : u.state === 'attackmove' ? 260 : 170;
      const f = this.acquireEnemy(u, scan);
      if (f.tu >= 0) { u.targetU = f.tu; tu = this.units.find(e => e.id === f.tu); }
      else if (f.tb >= 0 && (u.state === 'attackmove' || isCata)) { u.targetB = f.tb; tb = this.blds.find(b => b.id === f.tb); }
    }
    const uRange = u.range * (u.owner === 'player' ? this.rangeMult(u.key, u.owner) : 1);
    if (tu) {
      if (tu.owner === u.owner) { u.targetU = -1; }
      else {
        const d = Math.hypot(tu.x - u.x, tu.y - u.y);
        if (d <= uRange + (tu.key === 'wolf' ? 4 : 6)) {
          if (Math.abs(tu.x - u.x) > 4) u.face = tu.x > u.x ? 1 : -1;
          if (u.cd <= 0) this.strike(u, tu, undefined);
        } else {
          this.moveToward(u, tu.x, tu.y, dt, uRange * 0.7);
        }
        return;
      }
    }
    if (tb) {
      const edge = tb.size / 2 + uRange * 0.6;
      const dx = u.x - tb.x, dy = u.y - tb.y;
      const overlapX = Math.max(Math.abs(dx) - tb.size / 2, 0), overlapY = Math.max(Math.abs(dy) - tb.size / 2, 0);
      const ed = Math.hypot(overlapX, overlapY);
      if (ed <= uRange * 0.7 + 8) {
        if (Math.abs(tb.x - u.x) > 4) u.face = tb.x > u.x ? 1 : -1;
        if (u.cd <= 0) this.strike(u, undefined, tb);
      } else this.moveToward(u, tb.x, tb.y, dt, edge);
      return;
    }
    if (u.state === 'patrol') {
      // идём к текущей точке патруля; при прибытии — пауза и разворот
      if (this.moveToward(u, u.tx, u.ty, dt, 14)) {
        u.waitT += dt;
        if (u.waitT > 1.2) {
          u.waitT = 0;
          const t = (u.tx === u.patrolX && u.ty === u.patrolY) ? { x: u.homeX, y: u.homeY } : { x: u.patrolX, y: u.patrolY };
          u.tx = t.x; u.ty = t.y;
        }
      }
      // по маршруту подбираем близких врагов
      if (u.retarget <= 0 && u.stance !== 'stand') {
        u.retarget = 0.5;
        const f = this.acquireEnemy(u, 150);
        if (f.tu >= 0) { u.targetU = f.tu; u.state = 'attackmove'; }
      }
      return;
    }
    if (u.state === 'attackmove' || u.state === 'move') {
      // стойка «держать позицию»: не уходить от точки старта за поводок
      if (u.stance === 'stand' && u.state === 'attackmove' && (u.key !== 'catapult')) {
        const leash = u.hidden == null ? 150 : 150;
        if (dist2(u.x, u.y, u.homeX, u.homeY) > leash * leash) {
          u.targetU = -1; u.targetB = -1; u.state = 'move'; u.tx = u.homeX; u.ty = u.homeY;
        }
      }
      if (this.moveToward(u, u.tx, u.ty, dt)) {
        // вернулись домой из погони (stand) — встаём
        u.state = 'idle';
        const f = this.acquireEnemy(u, isCata ? 300 : 200);
        if (f.tu >= 0 && u.stance !== 'stand') { u.targetU = f.tu; u.state = 'attackmove'; }
      }
      return;
    }
    // idle: радиус реакции зависит от стойки
    const idleRadius = u.stance === 'stand' ? 95 : u.stance === 'defensive' ? 150 : (isCata ? 300 : 190);
    if (u.retarget <= 0) {
      u.retarget = 0.5;
      const f = this.acquireEnemy(u, idleRadius);
      // в стойке «держать позицию» воин не сходит с места: цель только если враг в радиусе удара
      if (f.tu >= 0) {
        const e = this.units.find(x => x.id === f.tu);
        const inReach = e && Math.hypot(e.x - u.x, e.y - u.y) <= u.range + 14;
        if (u.stance !== 'stand' || inReach) { u.targetU = f.tu; u.state = 'attackmove'; }
      }
      else if (isCata && f.tb >= 0) { u.targetB = f.tb; u.state = 'attackmove'; }
    }
  }

  updateMonk(u: Unit, dt: number) {
    // добрался ли до точки движения
    if (u.state === 'move' || u.state === 'attackmove') {
      if (this.moveToward(u, u.tx, u.ty, dt)) u.state = 'idle';
      // по пути тоже подлечиваем
    }
    u.cd -= dt;
    // ищем раненого союзника рядом (не волка)
    if (u.cd <= 0) {
      let best: Unit | null = null; let bestFrac = 1.01; let bd = 135 * 135;
      for (const a of this.units) {
        if (a.owner !== u.owner || a.hp <= 0) continue;
        if (a.hp >= a.maxHp) continue;
        const d = dist2(u.x, u.y, a.x, a.y);
        if (d > bd) continue;
        const frac = a.hp / a.maxHp;
        if (frac < bestFrac) { bestFrac = frac; best = a; }
      }
      if (best) {
        u.cd = 1.1;
        const heal = 22;
        best.hp = Math.min(best.maxHp, best.hp + heal);
        u.atkAnim = 1; u.face = best.x >= u.x ? 1 : -1;
        this.sound.heal();
        this.spark(best.x, best.y - 18, '#fde68a');
        this.burst(best.x, best.y - 14, 4, ['#fde68a', '#fef3c7'], 50, 0.4);
        this.floaters.push({ x: best.x, y: best.y - 34, life: 0.7, max: 0.7, text: `+${heal}`, color: '#86efac', size: 12 });
      } else {
        u.cd = 0.25;
      }
    }
  }

  // скот/дичь: пасутся рядом с домом и убегают от опасности
  updateAnimal(u: Unit, dt: number) {
    const skittish = u.key === 'deer' ? 170 : 120;
    // ищем угрозу рядом (волк или воин)
    let flee = false;
    for (const e of this.units) {
      if (e.owner === 'neutral' || e.hp <= 0) continue;
      if (e.key === 'villager' || e.key === 'monk') continue;
      if (dist2(u.x, u.y, e.x, e.y) < skittish * skittish) { flee = true; break; }
    }
    if (flee) {
      // бежим от ближайшего врага
      let threat: Unit | undefined; let bd = skittish * skittish;
      for (const e of this.units) { if (e.owner === 'neutral' || e.key === 'villager' || e.key === 'monk') continue; const d = dist2(u.x, u.y, e.x, e.y); if (d < bd) { bd = d; threat = e; } }
      if (threat) {
        const dx = u.x - threat.x, dy = u.y - threat.y, d = Math.max(1, Math.hypot(dx, dy));
        const sp = u.key === 'deer' ? 200 : 120;
        u.x += (dx / d) * sp * dt; u.y += (dy / d) * sp * dt;
        u.x = clamp(u.x, 20, WORLD.w - 20); u.y = clamp(u.y, 20, WORLD.h - 20);
        u.face = dx > 0 ? 1 : -1;
        u.idleT = 0;
        return;
      }
    }
    // пасёмся: бродим вокруг якоря
    if (dist2(u.x, u.y, u.wx, u.wy) > (u.key === 'deer' ? 320 : 220) * (u.key === 'deer' ? 320 : 220)) {
      this.moveToward(u, u.wx + rand(-30, 30), u.wy + rand(-30, 30), dt, 8);
      return;
    }
    u.idleT += dt;
    if (u.idleT > rand(2.5, 6)) {
      u.idleT = 0;
      u.tx = u.wx + rand(-90, 90); u.ty = u.wy + rand(-90, 90);
    }
    this.moveToward(u, u.tx, u.ty, dt, 10);
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
    const isRanged = att.key === 'archer' || att.key === 'catapult';
    const isCata = att.key === 'catapult';
    // удар по ИИ в мирное время = игрок сам начинает войну (волки не в счёт)
    if (att.owner === 'player' && !this.atWar) {
      const hitsRival = (tu && tu.owner === 'enemy') || (tb && tb.owner === 'enemy');
      if (hitsRival) this.onPlayerAggression();
    }
    // боевой клич (редко, чтобы не трещало) / вой волка
    if (att.key === 'wolf') { if (Math.random() < 0.08) this.sound.wolf(); }
    else if (att.owner === 'player' && (tu || tb) && Math.random() < 0.12) this.sound.voice(att.key, 'attack');
    att.cd = isCata ? 3.2 : att.key === 'archer' ? 1.35 : att.key === 'knight' || att.key === 'cavalry' ? 1.0 : att.key === 'wolf' ? 1.15 : 1.1;
    att.atkAnim = 1;
    const variance = rand(0.85, 1.15);
    let dmg = att.atk * variance;
    // боевой дух армии ИИ (штраф за несправедливую войну)
    if (att.owner === 'enemy' && att.key !== 'villager') dmg *= this.morale;
    // типы урона: камень-ножницы-бумага против юнитов
    if (tu) dmg *= dmgMult(att.key, tu.key);
    if (isCata && tb) dmg *= 1.7; // катапульта особенно разрушительна для зданий
    if (isRanged) {
      const tx = tu ? tu.x : tb ? tb.x : att.tx, ty = tu ? tu.y : tb ? tb.y : att.ty;
      const dx = tx - att.x, dy = ty - att.y, d = Math.max(1, Math.hypot(dx, dy));
      const sp = isCata ? 300 : 420;
      this.projs.push({ x: att.x, y: att.y - (isCata ? 30 : 14), vx: (dx / d) * sp, vy: (dy / d) * sp, tx, ty, targetU: tu ? tu.id : -1, targetB: tb ? tb.id : -1, dmg, owner: att.owner, life: 2.0, kind: isCata ? 'rock' : 'arrow', srcU: att.id });
      if (isCata) { this.sound.boom(); this.trauma = Math.min(1, this.trauma + 0.12); this.burst(att.x, att.y - 26, 8, ['#a8a29e', '#78716c'], 120, 0.5); }
      else { this.sound.arrow(); this.spark(att.x, att.y - 14, '#fef3c7'); }
    } else {
      // копейщик бьёт конницу с бонусом
      if (att.key === 'spearman' && tu && (tu.key === 'knight' || tu.key === 'cavalry')) dmg *= 1.8;
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
    // retaliate (только если стороны уже в состоянии войны; волки враждебны всегда)
    if (t.key !== 'villager' && t.owner !== 'neutral' && !from) { /* noop */ }
    if (t.owner !== 'neutral' && t.key !== 'villager' && from && this.hostile(t.owner, from.owner) && t.targetU < 0 && t.targetB < 0) {
      if (from.hp !== undefined) { t.targetU = from.id; t.state = 'attackmove'; }
    }
    if (t.owner === 'neutral' && from) { /* wolves handled by proximity */ }
    if (t.hp <= 0) this.killUnit(t, from?.owner, from);
  }

  damageBld(b: Bld, dmg: number, byOwner: 'player' | 'enemy' | 'neutral') {
    if (b.hp <= 0) return;
    if (b.done < 1) dmg *= 1.6;
    b.hp -= dmg; b.flash = 1;
    if (b.owner === 'player') { this.dmgFlash = Math.min(0.6, this.dmgFlash + 0.09); this.trauma = Math.min(1, this.trauma + 0.06); }
    if (b.hp <= 30 && Math.random() < 0.3) this.burst(b.x + rand(-20, 20), b.y - 20, 2, ['#78716c', '#44403c'], 40, 0.8);
    if (b.hp <= 0) this.razeBld(b, byOwner);
  }

  // начисление опыта убийце; каждый уровень усиливает воина
  gainXp(killer: Unit | undefined, victim: Unit) {
    if (!killer || killer.owner !== 'player') return;
    if (killer.key === 'villager' && victim.owner !== 'neutral') return; // крестьяне не качаются на людях
    killer.kills = (killer.kills || 0) + 1;
    killer.xp = (killer.xp || 0) + 1;
    const level = killer.level || 1;
    if (level >= 5) return; // максимум — ветеран 5 ранга
    if (killer.xp >= xpForLevel(level)) {
      killer.level = level + 1;
      // усиление: +9% урона, +10% здоровья за ранг, с лечением
      killer.atk *= 1.09;
      const hpBoost = killer.maxHp * 0.10;
      killer.maxHp += hpBoost;
      killer.hp = Math.min(killer.maxHp, killer.hp + hpBoost * 1.5);
      this.floater(killer.x, killer.y - 34, `⭐ Уровень ${level + 1}!`, '#fde047', 16, true);
      this.burst(killer.x, killer.y - 10, 16, ['#fde047', '#facc15', '#fff'], 110, 0.9);
      this.sound.quest();
    }
  }

  killUnit(t: Unit, byOwner?: 'player' | 'enemy' | 'neutral', killer?: Unit) {
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
      this.floater(t.x, t.y - 34, `+${SCORE.kill} ⚔️ +8🪙`, "#fde047", 15, true);
      this.trauma = Math.min(1, this.trauma + 0.08);
      if (killer) this.gainXp(killer, t);
      this.checkQuests();
    }
    if (byOwner === 'player' && t.owner === 'neutral' && killer) {
      this.gainXp(killer, t);
    }
    if (byOwner === 'player' && t.owner === 'neutral') {
      if (t.key === 'wolf') {
        this.wolvesSlain++;
        this.score += SCORE.wolfKill;
        this.res.food += 35;
        this.floater(t.x, t.y - 34, `+${SCORE.wolfKill} 🐺 +35🍖`, '#a3e635', 15, true);
      } else {
        // скот/дичь — еда
        const food = t.key === 'cow' ? 90 : t.key === 'deer' ? 55 : 45;
        this.res.food += food;
        this.score += 15;
        this.burst(t.x, t.y - 8, 14, ['#fca5a5', '#fb7185', '#fff'], 100, 0.7);
        this.floater(t.x, t.y - 34, `+${food}🍖`, '#a3e635', 15, true);
      }
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
      this.floater(b.x, b.y - 95, `+${pts} очков`, '#fde047', 16, true);
      // добыча с руин (особенно лагерей/башен)
      if (b.key !== 'towncenter') { const loot = 40; this.res.gold += loot; this.floater(b.x, b.y - 75, `+${loot}🪙 добыча`, '#fde047', 14, true); }
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
          if (b.owner === 'player') {
            this.sound.say('Сделаю в лучшем виде'); // рабочий рапортует о постройке
            for (const u of this.units) if (u.buildId === b.id && u.owner === 'player') { u.buildId = -1; u.state = 'idle'; }
            if (b.key === 'wonder') { // Чудо света достроено — отсчёт удержания до победы!
              this.wonderT = this.WONDER_HOLD;
              this.atWar = true; this.casusBelli = 1.1; this.morale = 1.12;
              this.sound.ageup();
              this.pushBanner('⭐ ЧУДО СВЕТА ВОЗВЕДЕНО!', `Защитите монумент ${Math.round(this.WONDER_HOLD / 60)} мин — и империя победит! Сосед идёт на штурм!`, 6);
              this.waveT = Math.min(this.waveT, 10);
              this.trauma = Math.min(1, this.trauma + 0.3);
            }
          }
        }
        continue;
      }
      // repair: рабочие с этим buildId чинят повреждённое готовое здание
      if (b.done >= 1 && b.hp < b.maxHp - 0.5 && b.owner === 'player') {
        let helpers = 0;
        for (const u of this.units) {
          if (u.owner !== 'player' || u.key !== 'villager' || u.buildId !== b.id) continue;
          if (u.state === 'build' && dist2(u.x, u.y, b.x, b.y) < 120 * 120) {
            helpers++;
            u.atkAnim = Math.min(1, u.atkAnim + dt * 6);
            if (Math.random() < dt * 7) this.spark(b.x + rand(-22, 22), b.y - rand(0, 26), '#7dd3fc');
          }
        }
        if (helpers > 0) {
          // чиним быстрее при большем числе рабочих; стоит немного дерева
          const heal = b.maxHp * (0.06 + 0.04 * Math.min(3, helpers)) * dt;
          b.hp = Math.min(b.maxHp, b.hp + heal);
          this.woodOnRepair = (this.woodOnRepair || 0) + heal;
          if (this.woodOnRepair >= 60) { const c = Math.floor(this.woodOnRepair / 60); this.woodOnRepair -= c * 60; this.res.wood = Math.max(0, this.res.wood - c); }
          if (Math.random() < dt * 2) this.sound.build();
          if (b.hp >= b.maxHp - 0.5) { // готово — отпускаем рабочих
            b.hp = b.maxHp;
            for (const u of this.units) if (u.buildId === b.id && u.owner === 'player') { u.buildId = -1; if (u.state === 'build') u.state = 'idle'; }
            this.floater(b.x, b.y - 60, `${BUILDING_DEFS[b.key].name}: починено!`, '#7dd3fc', 15);
          }
        }
      }
      // market passive gold trickle
      if (b.key === 'market' && b.owner === 'player' && b.done >= 1) {
        b.smokeT += dt * (this.hasTech('coinage') ? 2.0 : 1.2);
        if (b.smokeT >= 1) { b.smokeT -= 1; this.res.gold += 1; }
      }
      // research progress
      if (b.research && b.owner === 'player') {
        b.research.t += dt;
        if (Math.random() < dt * 2) this.spark(b.x + rand(-16, 16), b.y - 36, '#93c5fd');
        if (b.research.t >= b.research.total) { const id = b.research.id; b.research = null; this.applyTech(id); }
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
            // точка сбора на ресурсе — новый крестьянин сразу идёт работать
            const rallyN = b.rallyNode >= 0 ? this.nodes.find(n => n.id === b.rallyNode) : undefined;
            if (owner === 'player' && q.key === 'villager' && rallyN && rallyN.amount > 0) {
              u.state = 'gather'; u.nodeId = rallyN.id; u.buildId = -1;
              u.tx = rallyN.x; u.ty = rallyN.y; u.carry.type = rallyN.kind; u.gatherT = 0;
            } else {
              u.tx = b.rallyX; u.ty = b.rallyY; u.state = 'move';
            }
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
        const tRange = atk.range * (b.owner === 'player' ? this.rangeMult(b.key, b.owner) : 1);
        if (b.cd <= 0) {
          let best: Unit | null = null; let bd = tRange * tRange;
          for (const e of this.units) {
            if (e.owner === b.owner || e.hp <= 0 || !this.hostile(b.owner, e.owner)) continue;
            if (e.owner === 'neutral' && e.key !== 'wolf') continue; // башни не стреляют по скоту
            const d = dist2(b.x, b.y - 20, e.x, e.y);
            if (d < bd) { bd = d; best = e; }
          }
          if (best) {
            // гарнизон усиливает защиту: каждый укрытый +12% к скорости стрельбы
            const gar = b.garrison.length;
            b.cd = atk.cd / (1 + Math.min(gar, 6) * 0.12);
            const dx = best.x - b.x, dy = best.y - b.y, d = Math.max(1, Math.hypot(dx, dy));
            const garDmg = 1 + Math.min(gar, 6) * 0.08;
            this.projs.push({ x: b.x, y: b.y - 52, vx: (dx / d) * 460, vy: (dy / d) * 460, tx: best.x, ty: best.y, targetU: best.id, targetB: -1, dmg: atk.dmg * (b.owner === 'player' ? AGES[this.age].mult : AGES[this.eage].mult) * garDmg, owner: b.owner, life: 1.2, kind: b.key === 'towncenter' ? 'rock' : 'bolt' });
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
          const shooter = p.srcU != null ? this.units.find(u => u.id === p.srcU) : undefined;
          this.damageUnit(tu, p.dmg, shooter);
          // credit kills to owner side loosely for score if player-owned arrow
          if (tu.hp <= 0 && p.owner === 'player') {
            if (tu.owner === 'enemy') { this.kills++; this.score += SCORE.kill; this.res.gold += 8; this.floater(tu.x, tu.y - 30, `+${SCORE.kill} 🏹`, '#fde047', 14, true); }
            if (tu.owner === 'neutral') { this.wolvesSlain++; this.score += SCORE.wolfKill; this.res.food += 35; this.floater(tu.x, tu.y - 30, `+${SCORE.wolfKill} 🐺`, '#a3e635', 14, true); }
            if (shooter) this.gainXp(shooter, tu);
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
  waveComp(): UnitKey[] {
    const diff = DIFF[this.difficulty];
    const comp: UnitKey[] = [];
    const n = Math.round(diff.waveBase + this.wave * diff.waveGrowth);
    for (let i = 0; i < n; i++) comp.push('swordsman');
    if (this.wave >= 2) for (let i = 0; i < Math.ceil(n * 0.6); i++) comp.push('archer');
    if (this.wave >= 2) for (let i = 0; i < Math.ceil(n * 0.5); i++) comp.push('spearman');
    if ((this.eage >= 1 && this.wave >= 3) || this.wave >= 5) for (let i = 0; i < Math.ceil(n * 0.4); i++) comp.push('knight');
    if ((this.eage >= 1 && this.wave >= 5) || this.wave >= 8) for (let i = 0; i < Math.ceil(n * 0.35); i++) comp.push('cavalry');
    // босс-отряд с катапультами каждую 6-ю волну
    if (this.wave >= 6 && this.wave % 6 === 0) { for (let i = 0; i < 2 + Math.floor(this.wave / 6); i++) comp.push('catapult'); }
    return comp;
  }
  waveSummary(comp: UnitKey[]): string {
    const cnt: Record<string, number> = {};
    for (const k of comp) cnt[k] = (cnt[k] || 0) + 1;
    const order: UnitKey[] = ['swordsman', 'spearman', 'archer', 'knight', 'cavalry', 'catapult'];
    return order.filter(k => cnt[k]).map(k => `${cnt[k]}×${UNIT_DEFS[k].name}`).join(', ');
  }
  // ── ДИПЛОМАТИЯ ──
  milStrength(owner: 'player' | 'enemy'): number {
    let s = 0;
    for (const u of this.units) {
      if (u.owner !== owner) continue;
      if (u.key === 'villager') { s += 4; continue; }
      if (u.key === 'wolf') continue;
      s += u.atk * 2 + u.hp * 0.4 + (u.level || 1) * 8;
    }
    for (const b of this.blds) {
      if (b.owner !== owner || b.done < 0.5) continue;
      s += b.maxHp * 0.15;
      if (b.key === 'barracks' || b.key === 'stable' || b.key === 'blacksmith') s += 60;
      if (b.key === 'tower') s += 40;
      if (b.key === 'wonder') s += 400;
    }
    return s;
  }

  // пересчёт дипломатии и вероятность объявления войны
  diplomacyUpdate(dt: number) {
    if (this.over) return;
    this.dipTimer += dt;
    if (this.dipTimer < 5) return; // раз в 5 секунд
    this.dipTimer = 0;

    const pm = this.milStrength('player');
    const em = this.milStrength('enemy');

    if (this.atWar) {
      this.warT += 5;
      // война без оправдания → боевой дух армии ИИ слабеет (усталость + несправедливость)
      this.morale = 0.72 + 0.4 * this.casusBelli - Math.min(0.18, this.warT * 0.004);
      this.morale = Math.max(0.55, Math.min(1.15, this.morale));
      // если войну объявили незаслуженно, а мы слабее — ИИ готов к миру
      if (this.warT > 45 && this.casusBelli < 0.4 && em < pm * 1.15) {
        this.sueForPeace(true);
      }
      return;
    }

    // ── МИР: копим неприязнь ──
    this.peaceT += 5;
    const diff = DIFF[this.difficulty];
    let g = 0;
    // соперник не любит сильных соседей
    if (pm > em * 1.3) g += diff.aiAggression * 0.9;
    // продвинутые технологии/эпохи раздражают
    if (this.age > this.eage) g += diff.aiAggression * 0.7 * (this.age - this.eage);
    // строительство Чуда у границ — повод остановить
    const wonder = this.blds.some(b => b.owner === 'player' && b.key === 'wonder');
    if (wonder) g += diff.aiAggression * 2.5;
    // воинственность игрока: много армии при слабом противнике
    const army = this.units.filter(u => u.owner === 'player' && u.key !== 'villager' && u.key !== 'wolf').length;
    if (army > 24) g += diff.aiAggression * 0.4;
    // лёгкий фоновый дрейф с течением времени
    g += 0.25 + diff.aiAggression * 0.15;
    this.grievance = Math.min(100, this.grievance + g);

    // копим повод (casus belli)
    if (this.age > this.eage) this.casusBelli = Math.max(this.casusBelli, 0.6);
    if (pm > em * 1.6) this.casusBelli = Math.max(this.casusBelli, 0.75);
    if (wonder) this.casusBelli = Math.max(this.casusBelli, 1.0);
    if (this.peaceT > 260) this.casusBelli = Math.min(1, this.casusBelli + 0.08); // «старые счёты»

    // объявление войны: высокая неприязнь + достаточно повода + мы не сильно слабее
    const wantsWar = this.grievance >= 62 && this.casusBelli >= 0.5 && em >= pm * 0.7;
    if (wantsWar) {
      let reason = 'вам объявили войну';
      if (wonder) reason = 'ваше Чудо света угрожает их господству';
      else if (this.age > this.eage) reason = 'вы обогнали их в развитии';
      else if (pm > em * 1.6) reason = 'вы слишком сильны — сосед нападает на упреждение';
      else reason = 'накопились территориальные споры';
      this.declareWar(reason, this.casusBelli);
    }
  }

  // ИИ объявляет войну игроку
  declareWar(reason: string, cb: number) {
    if (this.over) return;
    this.atWar = true;
    this.casusBelli = cb;
    this.warT = 0;
    // боевой дух: при справедливой причине армия ИИ сильнее, при надуманной — слабее
    this.morale = 0.72 + 0.4 * cb;
    this.sound.horn();
    const just = cb >= 0.85;
    this.pushBanner(
      just ? '⚔️ ВОЙНА ОБЪЯВЛЕНА!' : '⚠️ ВЕРОЛОМНОЕ НАПАДЕНИЕ!',
      `Соперник напал: ${reason}. ${just ? 'Их армия сражается с полным боевым духом.' : 'Повод надуман — их войска неуверенны (−боевая мощь).'}`,
      5
    );
    this.trauma = Math.min(1, this.trauma + 0.3);
    // первый набег вскоре после объявления
    this.waveT = Math.min(this.waveT, 12);
    this.pushHud();
  }

  // игрок платит золотом, чтобы снизить неприязнь
  bribe() {
    if (this.over || this.atWar) return false;
    const cost = 75;
    if (this.res.gold < cost) { this.floater(this.cam.x, this.cam.y - 100, `Нужно ${cost} 🪙`, '#f87171', 16); this.sound.error(); return false; }
    this.res.gold -= cost;
    this.grievance = Math.max(0, this.grievance - 28);
    this.casusBelli = Math.max(0, this.casusBelli - 0.2);
    this.sound.coin();
    this.pushBanner('🤝 Дары отправлены', 'Сосед доволен — неприязнь снижена, война отсрочена', 3);
    this.pushHud();
    return true;
  }

  // заключить мир (по кнопке игрока, платно; или авто, когда ИИ несправедлив и слаб)
  sueForPeace(auto = false) {
    if (this.over || !this.atWar) return false;
    const cost = auto ? 0 : 120;
    if (!auto && this.res.gold < cost) { this.floater(this.cam.x, this.cam.y - 100, `Нужно ${cost} 🪙 на переговоры`, '#f87171', 16); this.sound.error(); return false; }
    if (!auto) this.res.gold -= cost;
    this.atWar = false;
    this.peaceT = 0;
    this.warT = 0;
    this.grievance = Math.max(8, this.grievance - 45);
    this.casusBelli = 0;
    this.morale = 1;
    this.sound.quest();
    this.pushBanner('🕊️ Мир заключён', auto ? 'Соперник сам предложил мир — война была несправедливой' : 'Переговоры успешны — у вас снова мир', 4);
    // вражеские войска возвращаются к обороне
    for (const u of this.units) if (u.owner === 'enemy' && u.key !== 'villager') { u.state = 'idle'; u.targetU = -1; u.targetB = -1; }
    this.waveT = DIFF[this.difficulty].waveInterval;
    this.pushHud();
    return true;
  }

  // игрок сам напал в мирное время (клик по врагу) — это даёт ИИ полный повод
  onPlayerAggression() {
    if (this.over) return;
    if (!this.atWar) {
      this.declareWar('вы первыми нарушили мир', 1.1);
      // мы агрессоры — у ИИ ополчение обороняется решительно
      this.pushBanner('Вы начали войну', 'Теперь соперник сражается за свою землю с высоким боевым духом', 4);
    }
  }

  launchWave() {
    this.wave++;
    const comp = this.waveComp();
    const etc = this.blds.find(b => b.owner === 'enemy' && b.key === 'towncenter');
    const ptc = this.blds.find(b => b.owner === 'player' && b.key === 'towncenter');
    const sx = etc ? etc.x - 120 : WORLD.w - 300, sy = etc ? etc.y + 60 : 400;
    for (const k of comp) {
      if (this.popUsed('enemy') >= this.popCap('enemy')) break;
      const u = this.addUnit(k, 'enemy', sx + rand(-60, 60), sy + rand(-50, 50));
      u.state = 'attackmove';
      u.tx = (ptc ? ptc.x : 380) + rand(-80, 80); u.ty = (ptc ? ptc.y : 1620) + rand(-80, 80);
    }
    this.sound.horn();
    const boss = this.wave % 6 === 0 && this.wave >= 6 ? ' 💥 Идут ОСАДНЫЕ ОРУДИЯ!' : '';
    this.pushBanner(`⚔️ Волна ${this.wave} — набег!`, `${this.waveSummary(comp)}${boss}`, 3.4);
    this.trauma = Math.min(1, this.trauma + 0.15);
  }
  // предупреждение о составе следующей волны
  warnNextWave() {
    const future = this.wave + 1;
    const saved = this.wave; this.wave = future;
    const comp = this.waveComp();
    this.wave = saved;
    this.pushBanner('⚠️ Набег близко!', `Волна ${future}: ${this.waveSummary(comp)}`, 3);
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
      peakPop: this.peakPop, peakArmy: this.peakArmy, built: this.builtCount, history: this.history.slice(-24),
    };
    try { localStorage.removeItem('empires-dawn-savegame-v1'); } catch { /* noop */ }
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
      sel, placement: this.placement, attackArmed: this.attackArmed, rallyArmed: this.rallyArmed, patrolArmed: this.patrolArmed, panMode: this.panMode,
      banner,
      quests: [
        { id: 'wood', label: 'Нарубить 60 🪵', done: !!this.questsDone.wood, progress: `${Math.min(60, Math.floor(this.woodGathered))}/60` },
        { id: 'army', label: 'Обучить 3 воинов', done: !!this.questsDone.army, progress: `${Math.min(3, this.soldiersTrained)}/3` },
        { id: 'rax', label: 'Построить казармы (E)', done: !!this.questsDone.rax, progress: this.barracksBuilt ? '1/1' : '0/1' },
        { id: 'wolf', label: 'Убить 4 волка', done: !!this.questsDone.wolf, progress: `${Math.min(4, this.wolvesSlain)}/4` },
        { id: 'age', label: 'Дойти до Феодализма (T)', done: !!this.questsDone.age, progress: this.age >= 1 ? '1/1' : '0/1' },
      ],
      muted: this.muted, idleVills, relics: this.relicsHeld,
      pTc: ptc ? Math.max(0, Math.ceil(ptc.hp)) : 0, pTcMax: ptc ? ptc.maxHp : 1,
      eTc: etc ? Math.max(0, Math.ceil(etc.hp)) : 0, eTcMax: etc ? etc.maxHp : 1,
      dmgFlash: this.dmgFlash,
      ageAfford: next?.cost ? this.res.food >= next.cost.food && this.res.gold >= (next.cost.gold || 0) : false,
      ageCost: next?.cost ? `${next.cost.food}🍖${next.cost.gold ? ` ${next.cost.gold}🪙` : ''}` : 'MAX',
      hint: this.hint,
      atWar: this.atWar, grievance: Math.round(this.grievance), casusBelli: this.casusBelli, morale: this.morale,
      playerPow: Math.round(this.milStrength('player')), enemyPow: Math.round(this.milStrength('enemy')),
      wonderT: Math.max(0, Math.ceil(this.wonderT)), wonderHold: this.WONDER_HOLD,
      techTree: this.techTreeData(),
    });
  }

  selSnapshot(): SelSnapshot {
    if (this.selBld >= 0) {
      const b = this.blds.find(b => b.id === this.selBld);
      if (!b) { this.selBld = -1; return { kind: 'none' }; }
      const costTxt = (c: { wood: number; food: number; gold: number }) => {
        const p: string[] = [];
        if (c.wood) p.push(`${c.wood}🪵`);
        if (c.food) p.push(`${c.food}🍖`);
        if (c.gold) p.push(`${c.gold}🪙`);
        return p.join(' ');
      };
      return {
        kind: 'building', bkey: b.key, blabel: BUILDING_DEFS[b.key].name,
        hp: Math.ceil(b.hp), bmax: Math.ceil(b.maxHp), done: b.done, bid: b.id,
        queue: b.queue.map(q => ({ key: q.key, label: UNIT_DEFS[q.key].name, t: q.t, total: q.total })),
        count: 1,
        garrison: b.garrison.length, garrisonCap: this.garrisonCap(b),
        research: b.research ? { id: b.research.id, name: TECHS[b.research.id]?.name ?? '', t: b.research.t, total: b.research.total } : null,
        techs: b.owner === 'player' ? this.techsFor(b.key).map(id => {
          const t = TECHS[id];
          return { id, name: t.name, desc: t.desc, icon: t.icon, cost: costTxt(t.cost), done: !!this.tech[id], available: this.age >= t.ageReq && this.afford(t.cost), busy: !!b.research };
        }) : [],
      };
    }
    const us = this.selUnits();
    if (!us.length) return { kind: 'none' };
    const map = new Map<string, { count: number; level: number; kills: number }>();
    let hp = 0, max = 0, maxLevel = 0, totalKills = 0;
    for (const u of us) {
      const e = map.get(u.key) || { count: 0, level: 0, kills: 0 };
      e.count++; e.level = Math.max(e.level, u.level || 1); e.kills += u.kills || 0;
      map.set(u.key, e);
      hp += u.hp; max += u.maxHp;
      maxLevel = Math.max(maxLevel, u.level || 1); totalKills += u.kills || 0;
    }
    return {
      kind: 'units', count: us.length,
      types: [...map.entries()].map(([key, e]) => ({ key, label: UNIT_DEFS[key as UnitKey].name, count: e.count, level: e.level, kills: e.kills })),
      avgHp: hp, maxHp: max, maxLevel, totalKills, stance: this.selStance,
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
    // shake (можно отключить в настройках)
    const sh = this.settings.screenShake ? this.trauma * this.trauma : 0;
    const shx = sh * 22 * (Math.random() * 2 - 1), shy = sh * 22 * (Math.random() * 2 - 1);
    // bg — dark to match iso style
    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.save();
    // Translate to center + shake, scale, then offset by iso camera
    ctx.translate(this.vw / 2 + shx, this.vh / 2 + shy);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.imageSmoothingEnabled = false; // чёткий пиксель-арт
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
    // тинт биома поверх земли
    const tint = this.biomeTint();
    if (tint !== 'rgba(0,0,0,0)') {
      ctx.fillStyle = tint;
      ctx.fillRect(this.camIsoX() - 200, this.camIsoY() - 200, this.vw / this.cam.zoom + 400, this.vh / this.cam.zoom + 400);
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
    // relics
    for (const r of this.relics) {
      if (r.taken || !this.inView(r.x, r.y, 60)) continue;
      const [ix, iy] = toIso(r.x, r.y);
      drawList.push({ iy, draw: () => this.drawRelicIso(r, ix, iy) });
    }
    // corpses
    for (const c of this.corpses) {
      if (!this.inView(c.x, c.y, 30)) continue;
      const [ix, iy] = toIso(c.x, c.y);
      const a = 1 - c.t / c.life;
      drawList.push({ iy, draw: () => {
        ctx.globalAlpha = Math.max(0, a) * 0.55;
        diamondShadow(ctx, ix, iy + 4, 13, 6, c.key === 'wolf' ? '#4b5563' : c.owner === 'player' ? '#1e3a8a' : '#7f1d1d');
        ctx.globalAlpha = 1;
      }});
    }
    // buildings
    for (const b of this.blds) {
      if (!this.inView(b.x, b.y, 200)) continue;
      // вражеские здания видны только в текущей видимости (туман)
      if (b.owner !== 'player' && !this.canSeeEnemy(b.x, b.y)) continue;
      const [ix, iy] = toIso(b.x, b.y);
      drawList.push({ iy, draw: () => this.drawBldIso(b, ix, iy) });
    }
    // rally flag
    if (this.selBld >= 0) {
      const b = this.blds.find(b => b.id === this.selBld);
      if (b && b.done >= 1 && (b.key === 'towncenter' || b.key === 'barracks' || b.key === 'stable' || b.key === 'blacksmith' || b.key === 'market')) {
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
      if (u.hidden) continue; // в гарнизоне
      if (!this.inView(u.x, u.y, 80)) continue;
      // враги/нейтральные видны только в текущей видимости (туман войны)
      if (u.owner !== 'player' && !this.canSeeEnemy(u.x, u.y)) continue;
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
    // ── туман войны (поверх мира, в той же iso-трансформации) ──
    if (this.settings.fogOfWar) this.drawFog();
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
      // предпросмотр протяжки стены/ворот
      if ((this.placement === 'wall' || this.placement === 'gate') && this.wallDrag) {
        const key = this.placement;
        const d = this.wallDrag;
        const [x0, y0] = this.snapWall(d.x0, d.y0);
        const [x1, y1] = this.snapWall(d.x1, d.y1);
        const dx = x1 - x0, dy = y1 - y0;
        const steps = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / TILE_STEP));
        const hw = 32, hh = 16;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const sx = Math.round((x0 + dx * t) / TILE_STEP) * TILE_STEP;
          const sy = Math.round((y0 + dy * t) / TILE_STEP) * TILE_STEP;
          const ok = this.placementValid(sx, sy, key) && this.afford(BUILDING_DEFS[key].cost);
          const [gx, gy] = toIso(sx, sy);
          ctx.globalAlpha = 0.55;
          ctx.beginPath(); ctx.moveTo(gx, gy - hh); ctx.lineTo(gx + hw, gy); ctx.lineTo(gx, gy + hh); ctx.lineTo(gx - hw, gy); ctx.closePath();
          ctx.fillStyle = ok ? 'rgba(163,230,53,0.45)' : 'rgba(239,68,68,0.35)';
          ctx.fill();
          ctx.strokeStyle = ok ? '#a3e635' : '#ef4444'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const [lx, ly] = toIso(d.x0, d.y0);
        ctx.fillStyle = '#fff'; ctx.font = '800 12px Inter'; ctx.textAlign = 'center';
        ctx.fillText(key === 'wall' ? `Тяните стену: ${steps + 1} сегм.` : 'Тяните линию ворот', lx, ly - 40);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      } else {
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
        const tip = this.placement === 'wall' || this.placement === 'gate' ? 'Клик — поставить, зажмите и тяните' : 'Клик — поставить';
        ctx.fillText(ok ? tip : 'Занято!', gx, gy - hh - 10);
        if (this.placement === 'tower') {
          ctx.strokeStyle = ok ? 'rgba(246,212,124,0.4)' : 'rgba(248,113,113,0.4)'; ctx.lineWidth = 1.5;
          isoEllipse(ctx, gx, gy, BUILDING_DEFS.tower.attack!.range * 0.7, BUILDING_DEFS.tower.attack!.range * 0.7);
          ctx.stroke();
        }
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

    // ── время суток: мягкий цикл день→ночь (косинус, период 240с) ──
    if (this.settings.dayNight) {
      const ph = (this.time % 240) / 240;              // 0..1
      const darkness = 0.5 * (1 - Math.cos(ph * Math.PI * 2)); // 0 днём, ~1 ночью
      if (darkness > 0.08) {
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        // ночь — синеватая, закат — тёплый (фаза 0.45-0.55)
        const sunset = Math.max(0, 1 - Math.abs(ph - 0.5) * 8);
        ctx.fillStyle = `rgba(${20 + sunset * 60},${26 + sunset * 10},${60 - sunset * 30},${(darkness * 0.42).toFixed(3)})`;
        ctx.fillRect(0, 0, this.vw, this.vh);
      }
    }

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

  drawRelicIso(r: Relic, ix: number, iy: number) {
    const { ctx } = this;
    const bob = Math.sin(this.time * 2 + r.phase) * 3;
    // тень
    diamondShadow(ctx, ix, iy + 6, 11, 5, 'rgba(0,0,0,0.3)');
    // сияние
    const glow = 0.5 + 0.5 * Math.sin(this.time * 3 + r.phase);
    ctx.save();
    ctx.globalAlpha = 0.3 + glow * 0.35;
    ctx.fillStyle = '#fde047';
    ctx.beginPath(); ctx.arc(ix, iy - 14 + bob, 14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // сундучок/ларчик с реликвией
    const y = iy - 14 + bob;
    ctx.fillStyle = '#92400e'; ctx.fillRect(ix - 8, y - 4, 16, 10);
    ctx.fillStyle = '#b45309'; ctx.fillRect(ix - 8, y - 8, 16, 5);
    ctx.fillStyle = '#fde047'; ctx.fillRect(ix - 2, y - 7, 4, 4); // замок
    ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('📿', ix, y - 14);
  }

  drawWallGate(b: Bld, ix: number, iy: number, selected: boolean) {
    const { ctx } = this;
    const S = b.size;
    const isGate = b.key === 'gate';
    // палитра камня — та же, что у башни (кирпичная кладка)
    const base = b.owner === 'player' ? '#c8c0b4' : '#b09a92';
    const leftC = b.owner === 'player' ? '#a8a098' : '#8f7a72';
    const rightC = b.owner === 'player' ? '#888078' : '#6f5c55';
    const mortar = 'rgba(50,46,44,0.55)';
    const lit = b.flash > 0.05;
    const tint = (c: string) => lit ? '#ef6464' : c;
    const wallH = isGate ? 22 : 24;
    const hW = 32;                // ромб сегмента = ровно одна изо-клетка (64×32) — швов нет вдоль любой оси
    const hH = 16;

    // тень на земле
    ctx.fillStyle = 'rgba(8,14,8,0.3)';
    ctx.beginPath();
    ctx.moveTo(ix, iy + hH + 2); ctx.lineTo(ix + hW, iy); ctx.lineTo(ix, iy - hH - 2); ctx.lineTo(ix - hW, iy);
    ctx.closePath(); ctx.fill();
    if (selected) diamondRingHalf(ctx, ix, iy, S * 1.1, S * 1.1 / 2, '#f6d47c', true);

    // ── грань стены: изометрический параллелограмм с кирпичной кладкой ──
    // p0→p1 — нижняя кромка (по земле), p3→p2 — верхняя кромка (на гребне)
    const drawBrickFace = (
      p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number],
      fill: string
    ) => {
      ctx.fillStyle = tint(fill);
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]);
      ctx.closePath(); ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = mortar; ctx.lineWidth = 1;
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      // точка на кромке: t вдоль нижней кромки, v — доля высоты (0 низ, 1 верх)
      const pt = (t: number, v: number): [number, number] => [
        lerp(lerp(p0[0], p1[0], t), lerp(p3[0], p2[0], t), v),
        lerp(lerp(p0[1], p1[1], t), lerp(p3[1], p2[1], t), v),
      ];
      const rows = 4;
      // горизонтальные швы
      for (let r = 1; r < rows; r++) {
        const v = r / rows;
        const a = pt(0, v), c = pt(1, v);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
      }
      // вертикальные швы (со сдвигом через ряд — перевязка кирпича)
      for (let r = 0; r < rows; r++) {
        const v0 = r / rows, v1 = (r + 1) / rows;
        const bricks = 3;
        for (let k = 0; k < bricks; k++) {
          const u = (k + 0.5 + (r % 2 ? 0.5 : 0)) / bricks;
          const a = pt(u, v0), c = pt(u, v1);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
        }
      }
      ctx.restore();
    };

    // Задняя (тёмная) грань: (ix-hW,iy)→(ix,iy-hH)→(ix,iy-hH-wallH)→(ix-hW,iy-wallH)
    drawBrickFace(
      [ix - hW, iy], [ix, iy - hH], [ix, iy - hH - wallH], [ix - hW, iy - wallH],
      b.owner === 'player' ? '#7d7670' : '#66534d'
    );
    // Левая передняя грань: (ix-hW,iy)→(ix,iy+hH)→(ix,iy+hH-wallH)→(ix-hW,iy-wallH)
    drawBrickFace(
      [ix - hW, iy], [ix, iy + hH], [ix, iy + hH - wallH], [ix - hW, iy - wallH],
      leftC
    );
    // Правая передняя грань: (ix,iy+hH)→(ix+hW,iy)→(ix+hW,iy-wallH)→(ix,iy+hH-wallH)
    drawBrickFace(
      [ix, iy + hH], [ix + hW, iy], [ix + hW, iy - wallH], [ix, iy + hH - wallH],
      rightC
    );

    // верхняя грань (каменная шапка ромбом)
    ctx.fillStyle = tint(base);
    ctx.beginPath();
    ctx.moveTo(ix, iy - hH - wallH); ctx.lineTo(ix + hW, iy - wallH);
    ctx.lineTo(ix, iy + hH - wallH); ctx.lineTo(ix - hW, iy - wallH);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = mortar; ctx.lineWidth = 1; ctx.stroke();

    // зубцы по гребню: вдоль двух передних рёбер шапки (левого и правого)
    ctx.fillStyle = tint(base);
    const merlon = (mx: number, my: number) => { ctx.fillRect(mx - 2.5, my - 4.5, 5, 4.5); };
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      // левое переднее ребро: (ix-hW,iy-wallH) → (ix,iy+hH-wallH)
      merlon((ix - hW) + hW * t, (iy - wallH) + hH * t);
      // правое переднее ребро: (ix,iy+hH-wallH) → (ix+hW,iy-wallH)
      merlon(ix + hW * t, (iy + hH - wallH) - hH * t);
    }

    if (isGate) {
      // деревянные створки ворот на передних гранях (тёмный проём по центру)
      ctx.fillStyle = lit ? '#ef6464' : '#3f2b16';
      ctx.beginPath();
      ctx.moveTo(ix - 8, iy + hH - wallH * 0.05);
      ctx.lineTo(ix + 8, iy + hH - wallH * 0.05);
      ctx.lineTo(ix + 8, iy + hH - wallH * 0.75);
      ctx.lineTo(ix - 8, iy + hH - wallH * 0.75);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#6b4a28'; ctx.lineWidth = 1.5; ctx.stroke();
      // доски
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(ix + k * 3.2, iy + hH - wallH * 0.08);
        ctx.lineTo(ix + k * 3.2, iy + hH - wallH * 0.72);
        ctx.stroke();
      }
    }

    if (selected) diamondRingHalf(ctx, ix, iy, S * 1.1, S * 1.1 / 2, '#f6d47c', false);
  }

  // Чудо света — золотой имперский монумент (процедурный)
  drawWonder(b: Bld, ix: number, iy: number, selected: boolean) {
    const { ctx } = this;
    const S = b.size;
    // тень
    ctx.fillStyle = 'rgba(8,14,8,0.30)';
    ctx.beginPath();
    ctx.moveTo(ix, iy + S / 2 - 2); ctx.lineTo(ix + S, iy); ctx.lineTo(ix, iy - S / 2 + 2); ctx.lineTo(ix - S, iy);
    ctx.closePath(); ctx.fill();
    if (selected) diamondRingHalf(ctx, ix, iy, S * 1.03, S * 1.03 / 2, '#f6d47c', true);

    if (b.done < 1) {
      drawConstruction(ctx, ix, iy, S, b.done);
      if (selected) diamondRingHalf(ctx, ix, iy, S * 1.03, S * 1.03 / 2, '#f6d47c', false);
      const py = iy - S / 2 - 24;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(ix - 30, py, 60, 8);
      ctx.fillStyle = '#a3e635'; ctx.fillRect(ix - 29, py + 1, 58 * b.done, 6);
      return;
    }

    const glow = 0.5 + 0.5 * Math.sin(this.time * 1.6);
    // ступенчатый постамент (3 яруса изо-ромбов)
    const tiers = [
      { w: S, h: S / 2, y: 0, c: '#a16207' },
      { w: S * 0.78, h: S * 0.39, y: -16, c: '#ca8a04' },
      { w: S * 0.56, h: S * 0.28, y: -32, c: '#eab308' },
    ];
    for (const t of tiers) {
      ctx.fillStyle = t.c;
      ctx.beginPath();
      ctx.moveTo(ix, iy + t.y + t.h); ctx.lineTo(ix + t.w, iy + t.y); ctx.lineTo(ix, iy + t.y - t.h); ctx.lineTo(ix - t.w, iy + t.y);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // колонна-обелиск по центру
    const topY = iy - S * 0.95;
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(ix - 7, topY, 14, (iy - 32) - topY);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(ix - 7, topY, 4, (iy - 32) - topY);
    // сияющая звезда на вершине
    ctx.save();
    ctx.globalAlpha = 0.55 + glow * 0.45;
    ctx.font = '22px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⭐', ix, topY - 8);
    ctx.restore();
    if (selected) diamondRingHalf(ctx, ix, iy, S * 1.03, S * 1.03 / 2, '#f6d47c', false);

    // HP-полоса
    if (b.hp < b.maxHp || selected) {
      const barW = Math.max(48, S * 0.8);
      const barY = topY - 24;
      const s = clamp(b.hp / b.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(ix - barW / 2, barY, barW, 7);
      ctx.fillStyle = s > 0.6 ? '#4ade80' : s > 0.3 ? '#facc15' : '#ef4444';
      ctx.fillRect(ix - barW / 2 + 1, barY + 1, (barW - 2) * s, 5);
    }
  }

  // ориентация сегмента для одиночной установки — по ближайшим соседям-стенам
  wallAxisAt(x: number, y: number, key: BuildingKey): 'x' | 'y' {
    let xN = 0, yN = 0;
    for (const o of this.blds) {
      if ((o.key !== 'wall' && o.key !== 'gate') || o.owner !== 'player') continue;
      const ddx = o.x - x, ddy = o.y - y;
      if (Math.hypot(ddx, ddy) > TILE_STEP * 2.2) continue;
      if (o.axis === 'x' || Math.abs(ddx) > Math.abs(ddy)) xN++; else yN++;
    }
    void key;
    return xN >= yN ? 'x' : 'y';
  }

  // ── детальный спрайт стены/ворот: диагональный сегмент, центр базовой
  //    линии кладётся в центр ромба клетки; соседние сегменты сходятся внахлёст ──
  drawWallSprite(b: Bld, sp: BldSprite, scale: number, ix: number, iy: number, S: number, img: HTMLImageElement | HTMLCanvasElement, alpha: number) {
    const ctx = this.ctx;
    const w = sp.img.naturalWidth * scale, h = sp.img.naturalHeight * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    const left = ix - w / 2, top = iy + S / 2 - h;
    if (b.axis === 'x') {
      // вторая изо-диагональ — зеркалим спрайт по X относительно центра клетки
      ctx.translate(ix, 0);
      ctx.scale(-1, 1);
      ctx.translate(-ix, 0);
    }
    // основание стены — на передней кромке ромба клетки, по X центрируем
    ctx.drawImage(img, left, top, w, h);
    ctx.restore();
  }

  drawBldIso(b: Bld, ix: number, iy: number) {
    const { ctx } = this;
    const selected = this.selBld === b.id;
    const S = b.size;

    // ── стены/ворота: детальный спрайт, посаженный от центра клетки ──
    const wallLike = b.key === 'wall' || b.key === 'gate';
    if (wallLike) {
      // один спрайт на направление; вторая диагональ рисуется зеркально (drawWallSprite)
      const wspr = BLD_SPRITES[b.key];
      const ready = !!wspr && wspr.img.complete && wspr.img.naturalWidth > 0;
      if (!ready || !wspr) { this.drawWallGate(b, ix, iy, selected); return; }
      const scale = (2 * S * 1.0) / wspr.baseW; // ширина спрайта ≈ ромб клетки
      const h = wspr.img.naturalHeight * scale;
      // тень
      ctx.fillStyle = 'rgba(8,14,8,0.3)';
      ctx.beginPath(); ctx.ellipse(ix, iy + S / 2 - 3, S * 0.92, S * 0.30, 0, 0, Math.PI * 2); ctx.fill();
      if (selected) diamondRingHalf(ctx, ix, iy, S * 1.05, S * 1.05 / 2, '#f6d47c', true);
      const img: HTMLImageElement | HTMLCanvasElement = (b.flash > 0.05 && wspr.flash) ? wspr.flash : wspr.img;
      if (b.done < 1) {
        drawConstruction(ctx, ix, iy, S, b.done);
        this.drawWallSprite(b, wspr, scale, ix, iy, S, img, 0.35 + b.done * 0.65);
      } else {
        this.drawWallSprite(b, wspr, scale, ix, iy, S, img, 1);
      }
      if (selected) diamondRingHalf(ctx, ix, iy, S * 1.05, S * 1.05 / 2, '#f6d47c', false);
      // HP/стройка (над верхом центрированного сегмента)
      if (b.hp < b.maxHp || selected || b.done < 1) {
        const barW = Math.max(40, S * 0.9), barY = iy - h / 2 - 10;
        const s = clamp(b.hp / b.maxHp, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(ix - barW / 2, barY, barW, 6);
        ctx.fillStyle = b.done < 1 ? '#a3e635' : s > 0.6 ? '#4ade80' : s > 0.3 ? '#facc15' : '#ef4444';
        ctx.fillRect(ix - barW / 2 + 1, barY + 1, (barW - 2) * (b.done < 1 ? b.done : s), 4);
      }
      return;
    }

    // Чудо света рисуется процедурно (золотой монумент)
    if (b.key === 'wonder') { this.drawWonder(b, ix, iy, selected); return; }

    const { sp, scale, ready } = placeBld(b.key, S);

    // контактная тень-ромб на земле (точно по фундаменту)
    ctx.fillStyle = 'rgba(8,14,8,0.30)';
    ctx.beginPath();
    ctx.moveTo(ix, iy + S / 2 - 2); ctx.lineTo(ix + S, iy); ctx.lineTo(ix, iy - S / 2 + 2); ctx.lineTo(ix - S, iy);
    ctx.closePath(); ctx.fill();

    const selColor = '#f6d47c';
    // дальняя половина кольца выделения — ПОД зданием, по ромбу фундамента
    if (selected) diamondRingHalf(ctx, ix, iy, S * 1.03, S * 1.03 / 2, selColor, true);

    // верх спрайта — для размещения полос (считаем заранее)
    const w = ready ? sp.img.naturalWidth * scale : 0;
    const h = ready ? sp.img.naturalHeight * scale : 0;
    const dx = ix - (ready ? sp.ax * scale : 0);
    const dy = iy + S / 2 - (ready ? sp.ay * scale : 0);
    const topY = dy;

    // стройка — леса/каркас, спрайт проявляется по мере готовности
    if (b.done < 1) {
      drawConstruction(ctx, ix, iy, S, b.done);
      if (ready) {
        ctx.save();
        ctx.globalAlpha = 0.35 + b.done * 0.65;
        ctx.drawImage(sp.img, dx, dy, w, h);
        ctx.restore();
      }
      // ближняя половина кольца — поверх
      if (selected) diamondRingHalf(ctx, ix, iy, S * 1.03, S * 1.03 / 2, selColor, false);
      // прогресс постройки — над верхом спрайта
      const py = topY - 26;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(ix - 30, py, 60, 8);
      ctx.fillStyle = '#a3e635'; ctx.fillRect(ix - 29, py + 1, 58 * b.done, 6);
      return;
    }

    if (!ready) {
      drawConstruction(ctx, ix, iy, S, 1);
      if (selected) diamondRingHalf(ctx, ix, iy, S * 1.03, S * 1.03 / 2, selColor, false);
      return;
    }

    // вспышка урона — красный спрайт, иначе обычный
    const img: HTMLImageElement | HTMLCanvasElement = (b.flash > 0.05 && sp.flash) ? sp.flash : sp.img;
    ctx.drawImage(img, dx, dy, w, h);
    // ближняя половина кольца выделения — ПОВЕРХ здания (передняя кромка фундамента)
    if (selected) diamondRingHalf(ctx, ix, iy, S * 1.03, S * 1.03 / 2, selColor, false);

    // прогресс обучения
    if (b.queue.length) {
      const q = b.queue[0];
      const qy = topY - 16;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(ix - 32, qy, 64, 9);
      ctx.fillStyle = '#f6d47c';
      ctx.fillRect(ix - 31, qy + 1, 62 * clamp(q.t / q.total, 0, 1), 7);
      ctx.fillStyle = '#fff'; ctx.font = '700 9px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(UNIT_DEFS[q.key].name, ix, qy - 3);
      if (b.queue.length > 1) ctx.fillText(`+${b.queue.length - 1}`, ix + 40, qy + 9);
    }
    // HP-полоса
    if (b.hp < b.maxHp || selected) {
      const barW = Math.max(48, S * 0.8);
      const barY = topY - 6;
      const s = clamp(b.hp / b.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(ix - barW / 2, barY, barW, 7);
      ctx.fillStyle = s > 0.6 ? '#4ade80' : s > 0.3 ? '#facc15' : '#ef4444';
      ctx.fillRect(ix - barW / 2 + 1, barY + 1, (barW - 2) * s, 5);
    }
  }


  drawUnitIso(u: Unit, ix: number, iy: number) {
    // y-подскок юнита компенсирован внутри pixelart через bob — передаём «земную» точку
    drawPixelUnit(this.ctx, u, ix, iy, this.time, this.selected.has(u.id));
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
    // relics
    for (const r of this.relics) {
      if (r.taken) continue;
      ctx.fillStyle = '#fde047';
      ctx.fillRect(x + r.x * sx - 2, y + r.y * sy - 2, 4, 4);
    }
    // buildings (враги — только в текущей видимости при тумане)
    for (const b of this.blds) {
      if (b.owner !== 'player' && !this.canSeeEnemy(b.x, b.y)) continue;
      ctx.fillStyle = b.owner === 'player' ? '#60a5fa' : '#f87171';
      const s = b.key === 'towncenter' ? 6 : 4;
      ctx.fillRect(x + b.x * sx - s / 2, y + b.y * sy - s / 2, s, s);
    }
    // units
    for (const u of this.units) {
      if (u.owner === 'player') { ctx.fillStyle = '#dbeafe'; ctx.fillRect(x + u.x * sx - 1, y + u.y * sy - 1, 2, 2); }
      else { if (!this.canSeeEnemy(u.x, u.y)) continue; ctx.fillStyle = u.owner === 'neutral' ? '#eab308' : '#fecaca'; ctx.fillRect(x + u.x * sx - 1, y + u.y * sy - 1, 2, 2); }
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
