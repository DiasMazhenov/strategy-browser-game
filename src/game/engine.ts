import { AGES, BUILDING_DEFS, DEFAULT_SETTINGS, DIFF, SCORE, TECHS, UNIT_DEFS, UPGRADES, upgradeLine, WORLD, HOME, RIVAL, type BuildingKey, type Difficulty, type Settings, type UnitKey } from './config';
import { SoundBank } from './audio';
import { toIso, fromIso, isoEllipse, drawIsoTree, drawIsoGold, drawIsoBerries, drawIsoFish,
  getHexTile, hexPath, hexCenter, hexCenterWorld, screenToHex,
  HEX_PTS, TCX, TCY, snapToHexWorld, hexNeighbors, worldToHex,
  type HexKind,
  TILE_STEP, HEX_CELL } from './iso';
import { Terrain, mulberry32 as mulberry32Like } from './terrain';
import { drawConstruction, drawPixelUnit, diamondRingHalf, diamondShadow, drawTorch, drawCampProp } from './pixelart';
import { SPR_ANCHORS } from './sprite-art';
import { cursorCss, type CursorKind } from './cursors';
import { NATIONS, NATION_BY_ID, TRIBE_IDS, TRIBE_KIND_BY_ID, TRIBE_TYPES, ENVOY_TIERS, envoyCost,
  type FacRel, type TribeKind } from './nations';
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
import imgWallCorner from '../assets/sprites/wall_corner.png';
// казахская раса (player): средневековая восточная архитектура, дома — юрты
import kzImgTowncenter from '../assets/sprites/kz/kz_towncenter.png';
import kzImgHouse from '../assets/sprites/kz/kz_house.png';
import kzImgBarracks from '../assets/sprites/kz/kz_barracks.png';
import kzImgTower from '../assets/sprites/kz/kz_tower.png';
import kzImgFarm from '../assets/sprites/kz/kz_farm.png';
import kzImgPen from '../assets/sprites/kz/kz_pen.png';
import kzImgStable from '../assets/sprites/kz/kz_stable.png';
import kzImgMarket from '../assets/sprites/kz/kz_market.png';
import kzImgStorehouse from '../assets/sprites/kz/kz_storehouse.png';
import kzImgMosque from '../assets/sprites/kz/kz_mosque.png';
import kzImgBlacksmith from '../assets/sprites/kz/kz_blacksmith.png';
import kzImgWall from '../assets/sprites/kz/kz_wall.png';
import kzImgGate from '../assets/sprites/kz/kz_gate.png';
import kzImgWallCorner from '../assets/sprites/kz/kz_wall_corner.png';
// AI-арт рельефа (gpt image): редкие крупные вершины и холмы-курганы поверх ступенчатого рельефа
import imgPeakSnow from '../assets/sprites/terrain/peak_snow.png';
import imgPeakRock from '../assets/sprites/terrain/peak_rock.png';
import imgHillGrass from '../assets/sprites/terrain/hill_grass.png';
import imgHillRock from '../assets/sprites/terrain/hill_rock.png';

// ── Загрузка детальных AI-спрайтов зданий с автопосадкой на ромб клетки ──
const SPRITE_URLS: Partial<Record<BuildingKey, string>> = {
  towncenter: imgTowncenter, house: imgHouse, barracks: imgBarracks, tower: imgTower, farm: imgFarm,
  stable: imgStable, market: imgMarket, blacksmith: imgBlacksmith, wall: imgWall, gate: imgGate,
};
// казахская раса игрока: восточные здания-замены (стены/ворота остаются общими)
const KZ_SPRITE_URLS: Partial<Record<BuildingKey, string>> = {
  towncenter: kzImgTowncenter, house: kzImgHouse, barracks: kzImgBarracks, tower: kzImgTower, farm: kzImgFarm, pen: kzImgPen,
  stable: kzImgStable, market: kzImgMarket, blacksmith: kzImgBlacksmith, wall: kzImgWall, gate: kzImgGate,
  storehouse: kzImgStorehouse, mosque: kzImgMosque,
};
interface BldSprite { img: HTMLImageElement; flash: HTMLCanvasElement | null; ax: number; ay: number; baseW: number }
const BLD_SPRITES: Partial<Record<BuildingKey, BldSprite>> = {};
const KZ_BLD_SPRITES: Partial<Record<BuildingKey, BldSprite>> = {};
function loadBldSprite(anchorKey: string, url: string): BldSprite {
  const im = new Image();
  im.src = url;
  const a = SPR_ANCHORS[anchorKey];
  const sp: BldSprite = { img: im, flash: null, ax: a?.ax ?? 0, ay: a?.ay ?? 0, baseW: a?.baseW ?? 100 };
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
      sp.flash = cv;
    } catch { /* ignore */ }
  };
  return sp;
}
for (const k of Object.keys(SPRITE_URLS) as BuildingKey[]) {
  const url = SPRITE_URLS[k];
  if (url) BLD_SPRITES[k] = loadBldSprite(k, url);
}
for (const k of Object.keys(KZ_SPRITE_URLS) as BuildingKey[]) {
  const url = KZ_SPRITE_URLS[k];
  if (url) KZ_BLD_SPRITES[k] = loadBldSprite(`kz_${k}`, url);
}
// посадка: рисуем спрайт так, чтобы его фундамент лёг на ромб клетки (2S×S изо).
// игрок (казахская раса) получает восточные здания, прочие — штатные.
function placeBld(b: Bld, S: number) {
  const kz = b.owner === 'player' && KZ_BLD_SPRITES[b.key];
  // у некоторых построек (склад) европейского аналога нет — падаем на казахский спрайт,
  // иначе неигроковый владелец получил бы undefined и рендер бы упал
  const sp = (kz ? KZ_BLD_SPRITES[b.key]! : BLD_SPRITES[b.key]!) || BLD_SPRITES[b.key]! || KZ_BLD_SPRITES[b.key]!;
  const fit = 1.02;
  const scale = (2 * S * fit) / sp.baseW;
  return sp.img.complete && sp.img.naturalWidth ? { sp, scale, ready: true } : { sp, scale, ready: false };
}

// ── угловой сегмент стены (зубчатый бастион-столб на стыке двух осей) ──
function makeExtraSprite(url: string): BldSprite {
  const im = new Image();
  im.src = url;
  const sp: BldSprite = { img: im, flash: null, ax: 0, ay: 0, baseW: 100 };
  im.onload = () => {
    sp.baseW = im.naturalWidth;
    try {
      const cv = document.createElement('canvas');
      cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const c = cv.getContext('2d')!;
      c.drawImage(im, 0, 0);
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(239,68,68,0.5)';
      c.fillRect(0, 0, cv.width, cv.height);
      sp.flash = cv;
    } catch { /* ignore */ }
  };
  return sp;
}
const CORNER_SPRITE = makeExtraSprite(imgWallCorner);
// казахский саманный угловой бастион (раса игрока)
const KZ_CORNER_SPRITE = makeExtraSprite(kzImgWallCorner);

// ── AI-арт рельефа: крупные вершины/холмы (редкие декор-объекты поверх террас) ──
const TERRAIN_FEATURES: { img: HTMLImageElement; scale: number }[] = [
  { img: (() => { const i = new Image(); i.src = imgPeakSnow; return i; })(), scale: 1.7 },
  { img: (() => { const i = new Image(); i.src = imgPeakRock; return i; })(), scale: 1.45 },
  { img: (() => { const i = new Image(); i.src = imgHillGrass; return i; })(), scale: 0.85 },
  { img: (() => { const i = new Image(); i.src = imgHillRock; return i; })(), scale: 0.95 },
];
const F_PEAK_SNOW = 0, F_PEAK_ROCK = 1, F_HILL_GRASS = 2, F_HILL_ROCK = 3;

// спрайт стены/ворот/угла с учётом расы владельца: игрок → саманные восточные, прочие → каменные
function wallSpriteFor(b: Bld, isCorner: boolean): BldSprite | undefined {
  const kz = b.owner === 'player';
  if (isCorner) return kz ? KZ_CORNER_SPRITE : CORNER_SPRITE;
  return kz ? KZ_BLD_SPRITES[b.key] : BLD_SPRITES[b.key];
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
  fmode?: 0 | 1 | 2;                              // изо-направление корпуса: 0 сбоку, 1 спереди (к камере), 2 спина
  wkind?: 'chop' | 'mine' | 'gather' | 'fish' | 'milk';      // текущая работа крестьянина (для кадра анимации)
  herder?: boolean;                    // рабочий назначен пастухом к загону
  female?: boolean;                    // рабочая-женщина (казашка в платке): сбор урожая, дойка
  buildQueue?: number[];               // очередь строек (Shift+клик): id фундаментов по порядку
  penId?: number;                      // id загона, к которому прикреплён пастух
  herdT?: number;                      // фаза цикла выпаса (счётчик)
  herding?: number[];                  // id животных, которых гонит пастух
  milkScanT?: number;                  // [работница] таймер редкой проверки «стадо вернулось — пора доить»
  herdX?: number; herdY?: number;      // точка притяжения скота (пастбище/загон) во время выпаса
  pastureId?: number;                  // [скот] id загона, к которому приписано стадо
  herdState?: 'graze' | 'home' | 'pen' | 'back'; // фаза пастушего цикла
  herdStateT?: number;                 // таймер текущей фазы
  herdStuckT?: number;
  herdProbeT?: number; herdProbeX?: number; herdProbeY?: number;                 // сколько пастух стоит на месте (сторож застревания)
  wphase?: number;                                // фаза рабочего цикла 0..1
  aiming?: boolean;                               // лучник в зоне выстрела (держит/натягивает лук)
  mvx?: number; mvy?: number;                     // сглаженный вектор движения (для fmode)
  stance: 'aggressive' | 'defensive' | 'stand'; // боевая стойка
  tribe?: boolean;   // воин нейтрального племени (пассивен, пока не атакован)
  aggro?: boolean;   // племя разозлено (атакует обидчика)
  homeX: number; homeY: number;                 // точка возврата (stand/patrol)
  patrolX: number; patrolY: number;             // вторая точка патруля
  waitT: number;                                // ожидание в точке патруля
  wx: number; wy: number; // wander anchor for wolves
  hidden?: number;        // id здания-укрытия (гарнизон)
  relicTarget?: number;   // id реликвии, за которой идёт монах
  // ── КАМЛАНИЕ ИМАМА (конверсия, AoE): переманивание вражеского юнита ──
  convTarget?: number;    // [имам] id юнита, которого обращает
  convT?: number;         // [имам] прогресс камлания, сек
  convertedBy?: number;   // [цель] id имама, который её сейчас обращает
  convProg?: number;      // [цель] прогресс 0..1 — для полосы над головой
  converts?: number;      // [имам] сколько душ обращено (для статистики)
  // ── көпес (торговец): круговой маршрут «свой базар → дружественный город/лагерь → базар» ──
  trPhase?: 'out' | 'back';  // out — везёт товар к партнёру, back — возвращается с выручкой
  trHomeB?: number;          // id своего базара (точка отправления и сдачи выручки)
  trDestB?: number;          // id здания партнёра (лагерь племени / ставка соперника)
  trNation?: string;         // народ-партнёр (для баннера и проверки дружбы)
  trGold?: number;           // выручка, которую везёт домой
  trWaitT?: number;          // пауза на «торге» в точке назначения
  trScanT?: number;          // таймер редкого поиска нового партнёра
  hunt?: boolean;         // крестьянин получил явный приказ охотиться/атаковать (преследует дичь)
  xp?: number; level?: number; kills?: number; // опыт и ранг героя
  upg?: number;           // ступень линии апгрейда (0/1/2) — задаёт султан на шлеме
  // ── посменная работа: усталость, отдых, отдохнувшая бодрость ──
  fatigue?: number;       // накопленная усталость 0..1 (растёт во время работы)
  resting?: boolean;      // сейчас на отдыхе у юрты
  restT?: number;         // сколько ещё отдыхать, сек
  restKind?: 'swing' | 'kazan' | 'asyk';  // чем занят на отдыхе (спрайт сценки)
  restX?: number; restY?: number;         // точка отдыха у юрты
  freshT?: number;        // «после выходных»: бодрость, пока тикает — работа быстрее
  shiftBack?: { nodeId: number; kind?: string } | null; // куда вернуться после смены
  // ── намаз: житель идёт к мечети и молится ──
  praying?: boolean;      // идёт к мечети / молится
  prayT?: number;         // сколько ещё молиться (0 — ещё в пути)
  prayBack?: { nodeId: number } | null;  // куда вернуться после намаза
  // ── разведчик: приказы и шпионаж ──
  mission?: 'explore' | 'bases' | 'diplomacy' | 'infiltrate'; // задание разведчика
  mtx?: number; mty?: number;       // цель приказа (база/точка)
  mNation?: string;                 // народ-цель приказа (diplomacy/infiltrate)
  infT?: number;                    // прогресс внедрения у вражеской базы (сек)
  infDone?: boolean;                // внедрение завершено (база раскрыта)
  infBaseId?: number;               // id здания, в которое внедряется крот
  meetCd?: number;                  // кулдаун пере-приветствия дипломатии
  // ── обход препятствий (A* по сетке): waypoints в мире ──
  path?: { x: number; y: number }[]; // маршрут вокруг стен (мировые точки)
  pathGoal?: { x: number; y: number };   // цель, под которую посчитан путь
  stuckT?: number;                        // время у стены (для пере-прокладки)
  lastX?: number; lastY?: number;         // позиция в прошлой проверке застревания
  noPathT?: number;                       // антиспам пере-прокладки, когда пути нет
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
  id: number; key: BuildingKey; owner: 'player' | 'enemy' | 'neutral';
  x: number; y: number; size: number; hp: number; maxHp: number;
  done: number; buildT: number; queue: { key: UnitKey; t: number; total: number }[];
  cd: number; rallyX: number; rallyY: number; rallyNode: number; flash: number; smokeT: number;
  research: { id: string; t: number; total: number } | null;   // текущее исследование
  garrison: number[];                                           // id юнитов внутри (оборона)
  upg?: { range: number; dmg: number; archers: number };        // улучшения башни (дальность/урон/лучники)
  gate: boolean;                                                // ворота (проходны для игрока)
  axis?: 'x' | 'y';                                             // ориентация протяжки стены/ворот
  tribe?: boolean;                                              // постройка нейтрального племени
  nationId?: string;                                            // народ-племя (id из NATIONS), владеющий лагерем
  pastureX?: number; pastureY?: number;                         // точка дальнего пастбища загона
  pastureStocked?: boolean;                                     // стадо (5 овец + 5 коров) уже создано
  milkWid?: number;   // id работницы-казашки, назначенной на дойку этого загона
}
interface Node { id: number; kind: 'wood' | 'gold' | 'food' | 'fish'; x: number; y: number; amount: number; max: number; r: number; phase: number }
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
  upgrades?: { id: string; name: string; desc: string; icon: string; cost: string; done: boolean; available: boolean; locked: boolean }[];
  research?: { id: string; name: string; t: number; total: number } | null;
  garrison?: number; garrisonCap?: number;
  towerUpg?: { range: number; dmg: number; archers: number; maxRange: number; maxDmg: number; maxArchers: number };
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
  sel: SelSnapshot; placement: BuildingKey | null; attackArmed: boolean; rallyArmed: boolean; patrolArmed: boolean; panMode: boolean; camFollow: boolean;
  banner: { title: string; sub: string } | null;
  quests: { id: string; label: string; done: boolean; progress: string }[];
  muted: boolean; idleVills: number; relics: number;
  pTc: number; pTcMax: number; eTc: number; eTcMax: number;
  dmgFlash: number; ageAfford: boolean; ageCost: string;
  hint: string;
  atWar: boolean; grievance: number; casusBelli: number; morale: number;
  tradeRoute: boolean; napT: number; condemned: boolean; tributeT: number; hasMarket: boolean;
  woodDiscount: number;   // множитель цены дерева от союза с ремесленниками (1 = без скидки)
  playerPow: number; enemyPow: number; wonderT: number; wonderHold: number;
  techTree: TechTreeRow[];
  // ── дипломатия народов (Civilization-стиль) ──
  nations: NationHud[];
  audience: AudienceHud | null; // открытый экран переговоров с правителем
  greeting: { id: string; name: string; ruler: string; title: string; portrait: string; greet: string; choices: { id: string; label: string; desc?: string; gold?: number }[] } | null;
  scouts: number; // число разведчиков игрока
  // активное событие степи (модалка с выбором) и тикающие последствия
  event: { id: string; icon: string; title: string; text: string; opts: { label: string; desc: string }[] } | null;
  drought: number; plague: number;
  // тревога «нас атакуют»: маркер жив ~20 с, клик по плашке прыгает к месту
  alertHud: { sub: string; t: number } | null;
  // имена родов войск с учётом взятых ступеней апгрейда (для кнопок обучения)
  unitNames: Record<string, string>;
  // сутки и посменная работа
  day: { num: number; name: string; icon: string; phase: number; night: boolean;
    resting: number; fresh: number; tired: number };
  // намаз: идёт ли молитва и остаток благодати
  pray: { active: boolean; t: number; praying: number; bereke: number; berekePct: number; count: number };
}
export interface NationHud {
  id: string; name: string; ruler: string; title: string; portrait: string; color: string; greet: string;
  kind: 'rival' | 'tribe';
  met: boolean; rel: string; atWar: boolean; power: number; camps: number; gift: number;
  canGreet: boolean; // можно ли открыть приветствие/переговоры (встречен)
  // ── город-государство: посланники и влияние ──
  envoys: number;        // посланники игрока
  rivalEnvoys: number;   // посланники джунгар (конкуренция)
  envoyLevel: number;    // 0..3 — достигнутый уровень влияния
  envoyNext: number;     // сколько посланников до следующего уровня (0 = максимум)
  envoyCost: number;     // цена следующего посланника
  suzerain: 'player' | 'rival' | null;
  typeLabel: string;     // «Военный» / «Торговый» …
  typeIcon: string;
  perks: string[];       // описания бонусов трёх уровней
}
// экран переговоров с правителем (Civ-стиль): открыт из модалки дипломатии
export interface AudienceHud {
  id: string; name: string; ruler: string; title: string; portrait: string; color: string;
  kind: 'rival' | 'tribe'; rel: string; atWar: boolean; gold: number;
}

// ── ЕДИНАЯ РУЧКА ВРЕМЕНИ ─────────────────────────────────────────────────────
// Длительность условных суток в секундах при скорости 1x. Всё, что должно
// происходить «раз в день» или «за смену», считается ОТ НЕЁ в долях, а не
// хардкодится в секундах — иначе при смене длины суток механики молча
// разъезжаются (так и было, пока сутки были 240 с).
export const DAY_LEN_SEC = 1800;   // 30 минут

// Из этих 30 минут ночь занимает ровно столько, сколько задано здесь, — не
// «сколько получится» из формулы освещения. Раньше темнота считалась косинусом
// и «ночью» (порог 0.62) оказывались 12.7 минуты из 30, причём подпись в HUD
// («Түн» — ровно четверть суток) с этим не совпадала: игрок видел «вечер», а
// рабочие уже уставали по ночной ставке.
export const NIGHT_LEN_SEC = 240;    // 4 минуты глухой ночи
export const TWILIGHT_SEC = 240;     // закат и рассвет, по 4 минуты каждый
// день = 1800 − 240 − 2·240 = 18 минут светлого времени

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
const dist2 = (ax: number, ay: number, bx: number, by: number) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
// высота одной ступени рельефа в экранных iso-px (плитки поднимаются лесенкой).
// Максимум 30 ступеней → ~150px на пике (шаг 5): горы заметно возвышаются, но не улетают.
const RELIEF_STEP = 5;
// ── Прокрутка стрелками у края экрана (вместо автоскролла по наведению) ──
const EDGE_ZONE = 52;       // полоса у края, где показывается стрелка, px
const EDGE_STEP = 620;      // насколько мир проматывается за один клик, px
const EDGE_GLIDE_T = 0.28;  // время доката, с

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
  terrain = new Terrain((Math.random() * 1e9) | 0);
  // бесконечный мир: чанки контента (ресурсы/животные/племена), генерятся лениво по мере исследования
  static readonly CHUNK = 1600;
  chunksGen = new Set<string>();
  chunkT = 0;
  res = { wood: 260, food: 260, gold: 140 };
  eres = { wood: 300, food: 300, gold: 160 };
  age = 0; eage = 0;
  score = 0; kills = 0; razed = 0; gatheredTotal = 0; woodGathered = 0;
  soldiersTrained = 0; barracksBuilt = 0; wolvesSlain = 0;
  builtCount = 0; peakPop = 0; peakArmy = 0;
  // история по минутам для графика (ресурсы/армия)
  history: { t: number; army: number; pop: number }[] = []; histT = 0;
  time = 0; wave = 0; waveT: number;
  cam = { x: HOME.x, y: HOME.y, zoom: 1 };
  camFollow = false;   // авто-следование камеры за выделением
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
  // ── расширенная дипломатия ──
  tradeRoute = false;            // действующий торговый договор с соседом
  tradeT = 0;                    // таймер начисления дохода с торговли
  napT = 0;                      // оставшееся время пакта о ненападении (сек)
  condemned = false;             // игрок публично ОСУДИЛ соседа (готов почву к войне)
  tributeT = 0;                  // время, оставшееся до выплаты дани соседом (сек, 0 = нет дани)
  tributeGold = 0;               // размер периодической дани
  wonderT = 0;                   // таймер удержания Чуда света (0 = нет активного Чуда)
  readonly WONDER_HOLD = 180;    // сколько секунд нужно удержать Чудо до победы
  // ── знакомства с народами (дипломатия Civilization): изначально мы никого не знаем ──
  rivalMet = false;              // контакт с Джунгарским ханством (главный соперник) установлен
  tribeMet: Record<string, boolean> = {};   // встреченные племена (nationId → true)
  tribeRel: Record<string, FacRel> = {};    // отношение племени: neutral/friend/hostile
  // ── ПЛЕМЕНА КАК ГОРОДА-ГОСУДАРСТВА: влияние посланниками (Civ VI) ──
  envoys: Record<string, number> = {};      // посланники ИГРОКА у племени (nationId → шт.)
  rivalEnvoys: Record<string, number> = {}; // посланники ДЖУНГАР — конкуренция за сюзеренитет
  envoyAiT = 0;                             // таймер вложений джунгар в племена
  giftT: Record<string, number> = {};       // таймеры даров военных племён (nationId → сек)
  tribeGoldT = 0;                           // таймер пассивного дохода от торговых союзников
  greeting: { nationId: string } | null = null; // всплывшее приветствие правителя (для UI)
  // ── СЛУЧАЙНЫЕ СОБЫТИЯ СТЕПИ (Civ-стиль: выбор из нескольких реакций) ──
  event: { id: string; opts: string[] } | null = null; // активное событие (ждёт решения игрока)
  eventT = 0;                    // таймер до следующего события
  eventSeen: string[] = [];      // уже выпадавшие (чтобы не повторяться подряд)
  // ── тревога «нас атакуют» (AoE) ──
  alert: { x: number; y: number; t: number; sub: string } | null = null; // место последнего нападения
  lastAlertT = -99;              // время прошлой тревоги (антиспам)
  droughtT = 0;                  // засуха: пашни дают меньше, пока тикает
  plagueT = 0;                   // эпидемия: шаруа работают медленнее
  // ── СУТКИ И ПОСМЕННАЯ РАБОТА ──
  // Условные сутки — 30 минут. Шаруа устают за смену, уходят к юртам отдыхать
  // (алтыбакан / казан / асыки), возвращаются отдохнувшими и работают быстрее.
  // ── АЗАН И НАМАЗ ──
  // Мирные жители по призыву с минарета идут к мечети, молятся и расходятся,
  // получая «Береке» — благодать общины. Воины не отвлекаются: азан во время
  // штурма не должен оголять оборону.
  readonly AZAN_LEN = 47;        // длительность записи азана, сек (public/voices/azan.mp3)
  // Намаз должен длиться дольше самой записи азана (46.6 с), иначе люди
  // расходились бы под ещё звучащий призыв, и при этом оставлять запас
  // времени на дорогу до мечети через полкарты.
  readonly PRAYER_LEN = DAY_LEN_SEC * 0.045;  // ~81 с при 30-минутных сутках
  readonly BEREKE_LEN = DAY_LEN_SEC * 0.2;    // благодать держится 1/5 суток (~360 с)
  prayT = 0;                     // сколько ещё идёт намаз (0 — не идёт)
  berekeT = 0;                   // остаток благодати
  berekePower = 0;               // сила благодати 0..1 (зависит от явки)
  azanPhase: number[] = [];      // фазы суток, на которых звучит азан
  azanDone: number[] = [];       // какие намазы уже прозвучали в этих сутках
  prayerCount = 0;               // сколько намазов совершено за партию
  // ── ДЛИТЕЛЬНОСТЬ СУТОК ──
  // ЕДИНСТВЕННАЯ ручка времени: всё, что должно случаться «раз в день» или
  // «за смену», считается ОТ НЕЁ, а не забито в секундах. Раньше сутки были
  // 240 с, и константы отдыха (150/26/70) подбирались под них вручную —
  // при смене длины суток они молча разъезжались: рабочий выматывался
  // 12 раз за день, а «бодрость после отдыха» покрывала 1/26 суток.
  readonly DAY_LEN = DAY_LEN_SEC;// длительность условных суток, сек (30 мин при 1x)
  dayT = 0;                      // фаза суток 0..DAY_LEN (0 = полдень, стартуем днём)
  dayNum = 1;                    // номер дня (для «после выходных»)
  restCycleT = 0;                // накопитель проверки смен
  restedTotal = 0;               // сколько работников успело отдохнуть (статистика)
  audienceId: string | null = null;             // id народа на экране переговоров (открыт из модалки)
  greetQueue: string[] = [];     // очередь народов на приветствие
  greetShown = new Set<string>();// народы, приветствие которых уже показано
  contactT = 0;                  // накопитель сканирования контактов
  intelBase: number | null = null; // раскрытая кротом база (id здания) — увеличенный обзор вокруг
  raf = 0; last = 0; hudT = 0; aiT = 0; hintT = 0;
  banners: Banner[] = [];
  questsDone: Record<string, boolean> = {};
  nextId = 1;
  villagerSexToggle = false;   // чередование пола у рабочих игрока: мужчина/женщина
  pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; moved: boolean; btn: number }>();
  pinchD = 0;
  box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  panning: { cx: number; cy: number; px: number; py: number } | null = null;
  mouse = { x: 0, y: 0, in: false, isTouch: false };
  // Стрелки прокрутки у краёв: dir — какая сейчас под курсором ('' = никакая),
  // hot — подсветка при наведении, edgeGlide — плавный докат после клика.
  edgeDir: '' | 'l' | 'r' | 'u' | 'd' = '';
  edgeFlash = 0;                                   // вспышка стрелки после клика
  edgeGlide = { dx: 0, dy: 0, t: 0 };
  curCursor: CursorKind | '' = '';            // текущий CSS-курсор канваса
  selNode = -1;                               // выбранный ресурс: плашка + полоска запаса
  // Гекс под курсором: обводится контуром, по клику туда идёт выделенный отряд.
  hoverHex: { q: number; r: number } | null = null;
  hexPing = { x: 0, y: 0, t: 0 };             // вспышка на гексе после приказа
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
    this.centerOn(HOME.x, HOME.y, true);
    const isMobile = matchMedia('(pointer: coarse)').matches;
    this.cam.zoom = isMobile ? 0.7 : 0.9;
    this.hint = isMobile ? 'Касание — выбор • Касание земли — приказ • Потяните — рамка выбора' : 'ЛКМ-рамка — выделение • ПКМ — приказ • WASD камера • 1-8 тренировка';
    this.pushBanner('⚔️ Аттан!', 'Ведите сарбазов — охотьтесь на волков на северо-востоке', 3.4);
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
    let ageMult = owner === 'player' ? AGES[this.age].mult : owner === 'enemy' ? AGES[this.eage].mult * diff.enemyHp : 1;
    // союз с военными племенами (ур.1): войска игрока крепче на 10%
    if (owner === 'player' && d.pop > 0 && key !== 'villager' && this.bonusTier('military', 1)) ageMult *= 1.1;
    const u: Unit = {
      id: this.nextId++, key, owner, x: clamp(x, 20, WORLD.w - 20), y: clamp(y, 20, WORLD.h - 20),
      hp: d.hp * ageMult, maxHp: d.hp * ageMult, atk: d.atk * (owner === 'neutral' ? 1 : ageMult),
      range: d.range, speed: d.speed * (key === 'knight' ? 1 : rand(0.94, 1.06)),
      cd: rand(0, 0.4), state: 'idle', tx: x, ty: y, targetU: -1, targetB: -1, nodeId: -1, buildId: -1,
      carry: { type: 'wood', amt: 0 }, gatherT: 0, anim: rand(0, 9), face: Math.random() < 0.5 ? 1 : -1,
      atkAnim: 0, retarget: rand(0, 0.4), idleT: 0, flash: 0, wx: x, wy: y,
      stance: 'aggressive', homeX: x, homeY: y, patrolX: x, patrolY: y, waitT: 0,
    };
    // ЛИНИИ АПГРЕЙДА: новобранец сразу выходит в достигнутой ступени, иначе воины,
    // обученные ПОСЛЕ исследования, были бы слабее старых (классический баг)
    const um = this.upgMult(key, owner);
    if (um.hp !== 1 || um.atk !== 1 || um.speed !== 1 || um.range !== 1) {
      u.maxHp *= um.hp; u.hp = u.maxHp;
      u.atk *= um.atk; u.speed *= um.speed; u.range *= um.range;
      u.upg = this.upgTier(key, owner);
    }
    // рабочие игрока (казахи) спавнятся по очереди: мужчина-крестьянин / женщина-работница
    if (key === 'villager' && owner === 'player') {
      this.villagerSexToggle = !this.villagerSexToggle;
      u.female = this.villagerSexToggle;
    }
    this.units.push(u);
    return u;
  }

  addBld(key: BuildingKey, owner: 'player' | 'enemy' | 'neutral', x: number, y: number, done = 1): Bld {
    const d = BUILDING_DEFS[key];
    const b: Bld = {
      id: this.nextId++, key, owner, x, y, size: d.size, hp: d.hp * done, maxHp: d.hp,
      done, buildT: 0, queue: [], cd: 0, rallyX: x + (owner === 'player' ? 110 : -110), rallyY: y + 90, rallyNode: -1, flash: 0, smokeT: 0,
      research: null, garrison: [], upg: key === 'tower' ? { range: 0, dmg: 0, archers: 0 } : undefined, gate: false,
    };
    this.blds.push(b);
    return b;
  }

  addNode(kind: 'wood' | 'gold' | 'food' | 'fish', x: number, y: number, amount: number): Node {
    const n: Node = { id: this.nextId++, kind, x, y, amount, max: amount, r: kind === 'wood' ? 20 : kind === 'fish' ? 18 : 24, phase: rand(0, 9) };
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
  // ── БЕСКОНЕЧНЫЙ МИР: стартовые базы игрока/соперника, остальное — ленивые чанки ──
  genWorld() {
    const P = HOME, E = RIVAL;
    // террейн: безопасные зоны вокруг баз (суша, без гор/воды)
    this.terrain.addSafe(P.x, P.y, 360);
    this.terrain.addSafe(E.x, E.y, 360);

    // стартовые ресурсы у игрока (дуга леса + золото/ягоды)
    const arc = (cx: number, cy: number, n: number, r0: number, a0: number) => {
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * Math.PI * 1.2 + rand(-0.15, 0.15);
        const r = r0 + rand(-30, 60);
        this.addNode('wood', cx + Math.cos(a) * r, cy + Math.sin(a) * r, 220);
      }
    };
    arc(P.x, P.y, 9, 210, -0.4);
    this.addNode('food', P.x + 120, P.y - 150, 700); this.addNode('food', P.x - 170, P.y + 60, 700);
    this.addNode('gold', P.x + 190, P.y + 130, 900); this.addNode('gold', P.x - 90, P.y - 230, 700);
    // TCs
    this.addBld('towncenter', 'player', P.x, P.y, 1);
    this.addBld('towncenter', 'enemy', E.x, E.y, 1);
    // starting villagers
    const v1 = this.addUnit('villager', 'player', P.x - 60, P.y - 40);
    const v2 = this.addUnit('villager', 'player', P.x + 50, P.y - 60);
    const v3 = this.addUnit('villager', 'player', P.x - 40, P.y + 70);
    const v4 = this.addUnit('villager', 'player', P.x + 70, P.y + 50);
    const woods = this.nodes.filter(n => n.kind === 'wood' && dist2(n.x, n.y, P.x, P.y) < 340 * 340);
    const foods = this.nodes.filter(n => n.kind === 'food' && dist2(n.x, n.y, P.x, P.y) < 340 * 340);
    if (woods[0]) this.orderGather(v1, woods[0].id);
    if (woods[1]) this.orderGather(v2, woods[1].id);
    if (foods[0]) this.orderGather(v3, foods[0].id);
    if (foods[1]) this.orderGather(v4, foods[1].id);
    // starting army
    const s1 = this.addUnit('swordsman', 'player', P.x + 130, P.y - 20);
    const s2 = this.addUnit('swordsman', 'player', P.x + 160, P.y + 20);
    this.addUnit('archer', 'player', P.x + 110, P.y + 60);
    this.selected.add(s1.id); this.selected.add(s2.id);
    // соперник: крестьяне и пара воинов у его ГЦ
    arc(E.x, E.y, 7, 200, Math.PI - 0.4);
    this.addNode('food', E.x - 120, E.y + 150, 700); this.addNode('gold', E.x - 190, E.y - 130, 900);
    for (let i = 0; i < 5; i++) {
      const u = this.addUnit('villager', 'enemy', E.x + rand(-70, 70), E.y + rand(-70, 70));
      const ns = this.nodes.filter(n => dist2(n.x, n.y, E.x, E.y) < 340 * 340);
      if (ns[i % ns.length]) this.orderGather(u, ns[i % ns.length].id);
    }
    this.addUnit('swordsman', 'enemy', E.x - 120, E.y + 40);
    this.addUnit('swordsman', 'enemy', E.x - 150, E.y - 20);
    // ── РАВНОУДАЛЁННЫЕ базы нейтральных племён: детерминированная сетка по всему
    // миру (с лёгким джиттером), отсечённая по суше/расстоянию от стартов. Карта
    // огромная — лагерей много, но они разнесены примерно на одинаковый шаг ──
    this.planTribeCamps();
    // пред-генерим чанки вокруг стартов и на линии к сопернику — мир сразу живой
    this.ensureChunks(P.x, P.y, 2);
    this.ensureChunks(E.x, E.y, 1);
  }

  // равномерная раскладка лагерей племён по сетке (узлы гексагональной решётки,
  // чтобы расстояния были максимально равными), каждый узел джиттерится детерм.
  private planTribeCamps() {
    const STEP = 8000;          // расстояние между соседними лагерями (карта огромная — баз немного, но равноудалены)
    // аксиальная сетка узлов (как гексы) поверх мира — равные расстояния по 6 осям
    const rowH = STEP * Math.sqrt(3) / 2; // вертикальный шаг рядов
    let placed = 0;
    for (let row = -4; row <= 4; row++) {
      for (let col = -4; col <= 4; col++) {
        // базовый центр узла в мире (центр мира — середина WORLD)
        let bx = WORLD.w / 2 + col * STEP * 1.5;
        let by = WORLD.h / 2 + row * rowH + (col % 2 ? rowH / 2 : 0);
        // детерминированный джиттер узла (по его индексам)
        const h = ((col * 73856093) ^ (row * 19349663) ^ (this.terrain.seed * 83492791)) >>> 0;
        const rng = mulberry32Like(h);
        bx += (rng() - 0.5) * STEP * 0.5;
        by += (rng() - 0.5) * STEP * 0.5;
        // не за краями
        if (bx < 300 || by < 300 || bx > WORLD.w - 300 || by > WORLD.h - 300) continue;
        // не вплотную к стартовым базам
        if (dist2(bx, by, HOME.x, HOME.y) < (STEP * 0.85) ** 2) continue;
        if (dist2(bx, by, RIVAL.x, RIVAL.y) < (STEP * 0.85) ** 2) continue;
        // ищем ровную сушу рядом с узлом (несколько попыток вокруг)
        let spot: [number, number] | null = null;
        for (let t = 0; t < 10; t++) {
          const a = rng() * Math.PI * 2, rad = t === 0 ? 0 : 120 + rng() * 320;
          const tx = bx + Math.cos(a) * rad, ty = by + Math.sin(a) * rad;
          if (this.terrain.isBuildable(tx, ty)
            && !this.blds.some(b => dist2(b.x, b.y, tx, ty) < 500 * 500)) { spot = [tx, ty]; break; }
        }
        if (!spot) continue;
        this.spawnTribeCamp(spot[0], spot[1], rng);
        placed++;
      }
    }
  }

  // ── чанковая генерация контента ──
  private chunkKey(cx: number, cz: number) { return cx + ',' + cz; }
  // гарантировать, что все чанки в радиусе R (в чанках) от точки загенерены
  ensureChunks(wx: number, wy: number, R: number) {
    const C = Game.CHUNK;
    const ccx = Math.floor(wx / C), ccz = Math.floor(wy / C);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dz * dz > R * R + 1) continue;
      const cx = ccx + dx, cz = ccz + dz;
      const key = this.chunkKey(cx, cz);
      if (this.chunksGen.has(key)) continue;
      this.chunksGen.add(key);
      this.genChunk(cx, cz);
    }
  }
  // найти в чанке точку нужного биома; null — не нашли
  private chunkPoint(cx: number, cz: number, rng: () => number, want: (x: number, y: number) => boolean): [number, number] | null {
    const C = Game.CHUNK;
    for (let t = 0; t < 24; t++) {
      const x = cx * C + rng() * C, y = cz * C + rng() * C;
      if (want(x, y)) return [x, y];
    }
    return null;
  }
  genChunk(cx: number, cz: number) {
    const C = Game.CHUNK;
    const rng = this.terrain.chunkRand(cx, cz);
    const ox = cx * C, oz = cz * C;
    const distHome = Math.min(
      Math.hypot(ox + C / 2 - HOME.x, oz + C / 2 - HOME.y),
      Math.hypot(ox + C / 2 - RIVAL.x, oz + C / 2 - RIVAL.y)
    );
    // рядом со стартовыми базами чанк «зарезервирован» — контент там уже стоит вручную
    if (distHome < C * 0.9) return;
    const land = (x: number, y: number) => this.terrain.isLand(x, y);
    const biomeAt = (x: number, y: number) => this.terrain.classAt(x, y);

    // деревья: лесные биомы — густо, прочая суша — редкие рощицы
    const treeClusters = 3 + ((rng() * 4) | 0);
    for (let i = 0; i < treeClusters; i++) {
      const p = this.chunkPoint(cx, cz, rng, (x, y) => {
        const b = biomeAt(x, y);
        return b === 'forest' ? true : (b === 'grass' && rng() < 0.3);
      });
      if (!p) continue;
      const dense = biomeAt(p[0], p[1]) === 'forest';
      const n = dense ? 7 + ((rng() * 6) | 0) : 2 + ((rng() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const tx = p[0] + (rng() - 0.5) * 220, ty = p[1] + (rng() - 0.5) * 200;
        if (land(tx, ty)) this.addNode('wood', tx, ty, 200);
      }
    }
    // золото: в горах/предгорьях — жилы, иногда на равнине
    const goldN = 1 + ((rng() * 2) | 0);
    for (let i = 0; i < goldN; i++) {
      const p = this.chunkPoint(cx, cz, rng, (x, y) => {
        const b = biomeAt(x, y);
        return b === 'hill' || b === 'mountain' || (b === 'desert' && rng() < 0.5) || (land(x, y) && rng() < 0.25);
      });
      if (p) this.addNode('gold', p[0] + (rng() - 0.5) * 60, p[1] + (rng() - 0.5) * 60, 800 + ((rng() * 400) | 0));
    }
    // ягоды/еда: поля и трава
    if (rng() < 0.7) {
      const p = this.chunkPoint(cx, cz, rng, (x, y) => { const b = biomeAt(x, y); return b === 'field' || b === 'grass' || b === 'forest'; });
      if (p) this.addNode('food', p[0] + (rng() - 0.5) * 80, p[1] + (rng() - 0.5) * 80, 550);
    }
    // рыбалка (как в AoE): косяки рыбы на МЕЛКОЙ воде у берега — рабочий стоит на
    // суше/мелководье и «собирает» еду. Ищем воду, рядом с которой есть суша.
    if (rng() < 0.8) {
      const shoreWater = (x: number, y: number) => {
        const b = biomeAt(x, y);
        if (b !== 'water' && b !== 'deep') return false;
        // рядом в радиусе ~110 есть суша/мелководье (куда встать рабочему)?
        for (let a = 0; a < 10; a++) {
          const ang = (a / 10) * Math.PI * 2;
          const c = biomeAt(x + Math.cos(ang) * 110, y + Math.sin(ang) * 110);
          if (land(x + Math.cos(ang) * 110, y + Math.sin(ang) * 110) || c === 'water') return true;
        }
        return false;
      };
      // несколько точек промысла на прибрежный чанк
      for (let t = 0; t < 2; t++) {
        const p = this.chunkPoint(cx, cz, rng, shoreWater);
        if (p) {
          // 2–4 косяка в этом прибрежном чанке
          const schools = 2 + ((rng() * 3) | 0);
          for (let i = 0; i < schools; i++) {
            const fx = p[0] + (rng() - 0.5) * 220, fy = p[1] + (rng() - 0.5) * 220;
            const fc = biomeAt(fx, fy);
            if (fc === 'water' || fc === 'deep') this.addNode('fish', fx, fy, 600);
          }
        }
      }
    }
    // дикие животные: стаи на суше
    const spawnPack = (kind: UnitKey, prob: number, size: [number, number]) => {
      if (rng() > prob) return;
      const p = this.chunkPoint(cx, cz, rng, land);
      if (!p) return;
      const n = size[0] + ((rng() * (size[1] - size[0] + 1)) | 0);
      for (let i = 0; i < n; i++) {
        const a = this.addUnit(kind, 'neutral', p[0] + (rng() - 0.5) * 110, p[1] + (rng() - 0.5) * 100);
        a.wx = p[0]; a.wy = p[1];
      }
    };
    spawnPack('wolf', 0.28, [2, 3]);
    spawnPack('deer', 0.34, [3, 4]);
    spawnPack('sheep', 0.26, [3, 5]);
    spawnPack('cow', 0.18, [2, 3]);

    // декор (кустики/цветы) на суше
    const cols = ['#5da24a', '#6fae55', '#87b96a', '#d9c26a', '#c9b458'];
    for (let i = 0; i < 26; i++) {
      const x = ox + rng() * C, y = oz + rng() * C;
      if (!land(x, y)) continue;
      this.decor.push({ x, y, k: (rng() * 3) | 0, s: 2 + rng() * 3, c: cols[(rng() * cols.length) | 0] });
    }

    // нейтральные племена планируются централизованно (planTribeCamps) — здесь не спавним.
    // редкая реликвия
    if (rng() < 0.06) {
      const p = this.chunkPoint(cx, cz, rng, land);
      if (p) this.relics.push({ id: this.nextId++, x: p[0], y: p[1], taken: false, phase: rng() * 6 });
    }
  }
  // лагерь нейтрального племени: башня-деревня + воины (пассивны, пока не тронут).
  // Народ племени детерминирован по позиции лагеря (три кочевых/оседлых народа циклично).
  tribeNationAt(x: number, y: number): string {
    const h = Math.abs((Math.round(x / 900) * 73856093) ^ (Math.round(y / 900) * 19349663));
    return TRIBE_IDS[h % TRIBE_IDS.length];
  }
  spawnTribeCamp(x: number, y: number, rng: () => number) {
    const hut = this.addBld('tower', 'neutral', x, y, 1);
    hut.tribe = true;
    hut.nationId = this.tribeNationAt(x, y);
    const guards = 2 + ((rng() * 3) | 0);
    const kinds: UnitKey[] = ['spearman', 'swordsman', 'archer'];
    for (let i = 0; i < guards; i++) {
      const k = kinds[(rng() * kinds.length) | 0];
      const g = this.addUnit(k, 'neutral', x + (rng() - 0.5) * 90, y + (rng() - 0.5) * 90);
      g.tribe = true; g.aggro = false; g.state = 'idle';
      g.homeX = x; g.homeY = y; g.wx = x; g.wy = y;
    }
    // клад золота у лагеря
    this.addNode('gold', x + 60, y - 50, 700);
  }

  // ── народ из объекта (лагерь племени → nationId; соперник → 'rival') ──
  tribeNationOf(b: Bld): string | null {
    if (b.tribe) return b.nationId ?? this.tribeNationAt(b.x, b.y);
    if (b.owner === 'enemy') return 'rival';
    return null;
  }

  // ── ДИПЛОМАТИЯ: знакомство с народами и действия ──
  relLabel(nid: string): string {
    if (nid === 'rival') return this.atWar ? 'Война' : (this.rivalMet ? 'Мир' : 'Неизвестно');
    const r = this.tribeRel[nid];
    if (!this.tribeMet[nid]) return 'Не встречали';
    return r === 'friend' ? 'Дружба' : r === 'hostile' ? 'Вражда' : 'Нейтралитет';
  }
  // народ встречен?
  metNation(nid: string): boolean { return nid === 'rival' ? this.rivalMet : !!this.tribeMet[nid]; }
  // сила народа (игроку показывается приблизительно/после знакомства)
  nationPower(nid: string): number {
    if (nid === 'rival') return this.milStrength('enemy');
    let s = 0;
    for (const b of this.blds) { if (!b.tribe || this.tribeNationOf(b) !== nid) continue; s += b.maxHp * 0.12; }
    for (const u of this.units) {
      if (u.owner !== 'neutral' || !u.tribe) continue;
      const home = this.blds.find(b => b.tribe && Math.abs(b.x - u.homeX) < 120 && Math.abs(b.y - u.homeY) < 120);
      if (home && this.tribeNationOf(home) === nid) s += u.atk * 2 + u.hp * 0.4;
    }
    return s;
  }
  nationCampCount(nid: string): number {
    return this.blds.filter(b => b.tribe && this.tribeNationOf(b) === nid).length;
  }
  // ближайший лагерь/база народа к точке
  nearestNationBase(nid: string, x: number, y: number, maxD = Infinity): Bld | null {
    let best: Bld | null = null; let bd = maxD * maxD;
    for (const b of this.blds) {
      if (nid === 'rival') { if (b.owner !== 'enemy' || b.key !== 'towncenter') continue; }
      else { if (!b.tribe || this.tribeNationOf(b) !== nid) continue; }
      const d = dist2(x, y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  // периодическая проверка контактов: видим врага/лагерь → знакомство
  updateContacts(dt: number) {
    this.contactT -= dt;
    if (this.contactT > 0) return;
    this.contactT = 0.8;
    if (!this.settings.fogOfWar) { this.rivalMet = true; for (const n of NATIONS) if (n.kind === 'tribe') this.tribeMet[n.id] = true; }
    else {
      // встреча с джунгарами (главный соперник)
      if (!this.rivalMet) {
        for (const b of this.blds) {
          if (b.owner !== 'enemy') continue;
          if (this.fogAt(b.x, b.y).vis) { this.rivalMet = true; this.queueGreeting('rival'); break; }
        }
        if (!this.rivalMet) for (const u of this.units) {
          if (u.owner !== 'enemy') continue;
          if (this.fogAt(u.x, u.y).vis) { this.rivalMet = true; this.queueGreeting('rival'); break; }
        }
      }
      // встречи с племенами
      for (const b of this.blds) {
        if (!b.tribe) continue;
        const nid = this.tribeNationOf(b)!;
        if (this.tribeMet[nid]) continue;
        if (this.fogAt(b.x, b.y).vis) { this.tribeMet[nid] = true; this.tribeRel[nid] = 'neutral'; this.queueGreeting(nid); }
      }
    }
    // выдать следующее приветствие из очереди (по одному за раз)
    if (!this.greeting) {
      while (this.greetQueue.length) {
        const nid = this.greetQueue.shift()!;
        if (!this.greetShown.has(nid) && this.metNation(nid)) {
          this.greetShown.add(nid);
          this.greeting = { nationId: nid };
          this.sound.quest();
          break;
        }
      }
    }
  }
  queueGreeting(nid: string) {
    if (!this.greetShown.has(nid) && !this.greetQueue.includes(nid)) this.greetQueue.push(nid);
  }
  closeGreeting() { this.greeting = null; this.pushHud(); }
  // ── экран переговоров с правителем (открыт из списка дипломатии) ──
  openAudience(nid: string) {
    const def = NATION_BY_ID[nid];
    if (!def || !this.metNation(nid)) return;
    this.audienceId = nid;
    this.sound.quest();
    this.pushHud();
  }
  closeAudience() { this.audienceId = null; this.pushHud(); }
  // ответ игрока на приветствие правителя
  greetingChoice(act: string) {
    const g = this.greeting; if (!g) return;
    const nid = g.nationId; this.greeting = null;
    const def = NATION_BY_ID[nid];
    if (nid === 'rival') {
      if (act === 'warm') { this.grievance = Math.max(0, this.grievance - 10); this.pushBanner('🕊 Дипломатия', `${def.title} ${def.ruler} принял вас учтиво — отношения тёплые`, 3.5); }
      else if (act === 'giftBig') { if (this.res.gold >= 75) { this.res.gold -= 75; this.grievance = Math.max(0, this.grievance - 28); this.pushBanner('🎁 Дары хунтайджи', `${def.ruler} доволен богатыми дарами — неприязнь отступила`, 3.5); } else { this.floater(this.cam.x, this.cam.y - 90, 'Нужно 75 🪙', '#f87171', 15); } }
      else if (act === 'cold') { this.grievance = Math.min(100, this.grievance + 14); this.casusBelli = Math.max(this.casusBelli, 0.35); this.pushBanner('⚔️ Холодный приём', `${def.title} нахмурился: эту дерзость он запомнит`, 3.5); }
    } else {
      // племя
      if (act === 'gift') {
        const cost = def.choices.find(c => c.act === 'gift')?.gold ?? 40;
        if (this.res.gold >= cost) { this.res.gold -= cost; this.tribeRel[nid] = 'friend'; this.pushBanner(`🤝 Дружба с «${def.name}»`, `${def.title} ${def.ruler} обещает не трогать ваши караваны и границы`, 4); this.sound.coin(); }
        else { this.floater(this.cam.x, this.cam.y - 90, `Нужно ${cost} 🪙`, '#f87171', 15); }
      } else if (act === 'threat') { this.tribeRel[nid] = 'hostile'; this.provokeTribeById(nid); this.pushBanner(`⚡ Угроза племени «${def.name}»`, `${def.title} ${def.ruler} в ярости — воины хватаются за оружие`, 4); }
      else { this.tribeRel[nid] = 'neutral'; this.pushBanner(`👋 Знакомство с «${def.name}»`, `${def.title} ${def.ruler} кивнул в ответ — пока нейтралитет`, 3.5); }
    }
    this.pushHud();
  }
  // ── ПЛЕМЕНА КАК ГОРОДА-ГОСУДАРСТВА (Civ VI): посланники, уровни влияния, сюзеренитет ──
  // Уровень влияния игрока у племени: 0 (нет), 1/2/3 по порогам ENVOY_TIERS = 1/3/6.
  envoyLevel(nid: string): number {
    const n = this.envoys[nid] ?? 0;
    let lv = 0;
    for (let i = 0; i < ENVOY_TIERS.length; i++) if (n >= ENVOY_TIERS[i]) lv = i + 1;
    return lv;
  }
  // сюзерен племени: у кого посланников больше (при равенстве — никто). Джунгары конкурируют.
  suzerain(nid: string): 'player' | 'rival' | null {
    const p = this.envoys[nid] ?? 0, r = this.rivalEnvoys[nid] ?? 0;
    if (p === 0 && r === 0) return null;
    if (p === r) return null;
    return p > r ? 'player' : 'rival';
  }
  tribeKind(nid: string): TribeKind | null { return TRIBE_KIND_BY_ID[nid] ?? null; }
  // действует ли у игрока бонус уровня lv (1..3) у племён типа kind — и сколько таких племён
  bonusTier(kind: TribeKind, lv: number): boolean {
    for (const nid of TRIBE_IDS) {
      if (TRIBE_KIND_BY_ID[nid] !== kind) continue;
      if (this.tribeRel[nid] === 'hostile') continue;      // враждебное племя бонусов не даёт
      if (this.suzerain(nid) === 'rival') continue;         // сюзеренитет у джунгар — бонус их
      if (this.envoyLevel(nid) >= lv) return true;
    }
    return false;
  }
  // отправить посланника: тратит золото, растит влияние, может отобрать сюзеренитет у джунгар
  sendEnvoy(nid: string): boolean {
    const def = NATION_BY_ID[nid];
    if (!def || def.kind !== 'tribe' || this.over) return false;
    if (!this.metNation(nid)) { this.floater(this.cam.x, this.cam.y - 100, 'Вы ещё не знакомы с этим народом', '#94a3b8', 15); return false; }
    if (this.tribeRel[nid] === 'hostile') { this.floater(this.cam.x, this.cam.y - 100, 'Племя враждебно — сначала помиритесь', '#f87171', 15); this.sound.error(); return false; }
    const have = this.envoys[nid] ?? 0;
    const cost = envoyCost(have);
    if (this.res.gold < cost) { this.floater(this.cam.x, this.cam.y - 100, `Нужно ${cost} 🪙`, '#f87171', 15); this.sound.error(); return false; }
    const wasSuz = this.suzerain(nid);
    const wasLv = this.envoyLevel(nid);
    this.res.gold -= cost;
    this.envoys[nid] = have + 1;
    // посланник — жест дружбы: нейтральное племя теплеет
    if (this.tribeRel[nid] !== 'friend') this.tribeRel[nid] = 'friend';
    this.sound.coin();
    const lv = this.envoyLevel(nid);
    const kind = this.tribeKind(nid);
    const t = kind ? TRIBE_TYPES[kind] : null;
    if (lv > wasLv && t) {
      this.pushBanner(`${t.icon} Влияние у «${def.name}» — уровень ${lv}`, t.levels[lv - 1], 4.5);
      this.sound.quest();
    } else {
      this.pushBanner(`🤝 Посланник к «${def.name}»`, `Посланников: ${this.envoys[nid]} · до следующего уровня ${this.envoysToNext(nid)}`, 3);
    }
    const nowSuz = this.suzerain(nid);
    if (nowSuz === 'player' && wasSuz !== 'player') {
      this.pushBanner(`👑 Сюзеренитет: «${def.name}»`, 'Народ признал ваше главенство — джунгары отступили', 4.5);
      this.score += 250;
    }
    this.pushHud();
    return true;
  }
  // сколько посланников до следующего порога (0 — максимум достигнут)
  envoysToNext(nid: string): number {
    const n = this.envoys[nid] ?? 0;
    for (const t of ENVOY_TIERS) if (n < t) return t - n;
    return 0;
  }
  // джунгары тоже вкладываются в племена — борьба за союзников
  updateEnvoyAI(dt: number) {
    this.envoyAiT += dt;
    if (this.envoyAiT < 45) return;              // раз в 45 с соперник делает ход
    this.envoyAiT = 0;
    if (!this.rivalMet && Math.random() < 0.5) return;
    const diff = DIFF[this.difficulty];
    // соперник охотнее вкладывается на высокой сложности и когда богат
    if (Math.random() > 0.35 + diff.aiAggression * 0.2) return;
    // цель: племя, где игрок близок к сюзеренитету (перебить) либо просто знакомое
    const cands = TRIBE_IDS.filter(nid => this.tribeRel[nid] !== 'hostile');
    if (!cands.length) return;
    cands.sort((a, b) => (this.envoys[b] ?? 0) - (this.envoys[a] ?? 0));
    const nid = Math.random() < 0.7 ? cands[0] : cands[(Math.random() * cands.length) | 0];
    const was = this.suzerain(nid);
    this.rivalEnvoys[nid] = (this.rivalEnvoys[nid] ?? 0) + 1;
    if (this.suzerain(nid) === 'rival' && was === 'player') {
      const def = NATION_BY_ID[nid];
      this.pushBanner(`⚠️ «${def?.name ?? nid}» под джунгарами`, 'Хунтайджи перекупил народ — бонусы утрачены. Шлите посланников!', 5);
      this.sound.error();
      this.pushHud();
    }
  }
  // периодические эффекты союза: дары военных племён и доход торговых
  updateTribeBonuses(dt: number) {
    // ВОЕННЫЕ: раз в 3 мин (ур.2) дарят воина, на ур.3 — чаще и сильнее
    for (const nid of TRIBE_IDS) {
      if (TRIBE_KIND_BY_ID[nid] !== 'military') continue;
      if (this.tribeRel[nid] === 'hostile' || this.suzerain(nid) === 'rival') continue;
      const lv = this.envoyLevel(nid);
      if (lv < 2) continue;
      const period = lv >= 3 ? 120 : 180;
      this.giftT[nid] = (this.giftT[nid] ?? 0) + dt;
      if (this.giftT[nid] < period) continue;
      this.giftT[nid] = 0;
      if (this.popUsed('player') + 1 > this.popCap('player')) continue;
      const tc = this.blds.find(b => b.owner === 'player' && b.key === 'towncenter');
      if (!tc) continue;
      const pool = lv >= 3 ? ['knight', 'cavalry', 'swordsman'] : ['swordsman', 'spearman'];
      const key = pool[(Math.random() * pool.length) | 0] as UnitKey;
      const u = this.addUnit(key, 'player', tc.x + rand(-40, 40), tc.y + 60 + rand(-20, 20));
      u.state = 'idle';
      const def = NATION_BY_ID[nid];
      this.pushBanner(`🎁 Дар от «${def?.name ?? nid}»`, `Союзники прислали воина: ${UNIT_DEFS[key].name}`, 4);
      this.burst(u.x, u.y, 12, ['#fde68a', '#fff'], 90, 0.7);
      this.sound.train();
    }
    // ТОРГОВЫЕ: пассивный доход (ур.1+)
    if (this.bonusTier('trade', 1)) {
      this.tribeGoldT = (this.tribeGoldT ?? 0) + dt;
      if (this.tribeGoldT >= 8) {
        this.tribeGoldT = 0;
        this.res.gold += 3;
        if (Math.random() < 0.35) this.sound.coin();
      }
    }
  }

  // ── СЛУЧАЙНЫЕ СОБЫТИЯ СТЕПИ ──
  // Событие всплывает раз в ~3-5 минут, ставит игру на выбор из 2-3 реакций с разными
  // последствиями (Civ). Условия отбора не дают выпасть бессмысленному событию
  // (джут без скота, находка кургана без разведчика и т.п.).
  eventDefs(): { id: string; icon: string; title: string; text: string;
    opts: { label: string; desc: string }[]; can: () => boolean }[] {
    const herd = () => this.units.filter(u => u.owner === 'neutral' && (u.key === 'sheep' || u.key === 'cow') && u.pastureId != null).length;
    return [
      {
        id: 'jut', icon: '❄️', title: 'Джут — ледяная зима',
        text: 'Степь сковало гололёдом, из-под наста не добыть траву. Скот слабеет на глазах, и старейшины ждут вашего слова.',
        can: () => herd() >= 3,
        opts: [
          { label: '🔪 Зарезать часть стада', desc: '+еда сейчас, но поголовье уменьшится' },
          { label: '🐎 Откочевать на юг', desc: 'Стадо цело, но шаруа теряют время (−дерево)' },
        ],
      },
      {
        id: 'birth', icon: '🐑', title: 'Богатый приплод',
        text: 'Весна выдалась щедрой: в загонах прибавление, ягнята крепки и здоровы.',
        can: () => this.blds.some(b => b.owner === 'player' && b.key === 'pen' && b.done >= 1),
        opts: [
          { label: '🎉 Отпраздновать', desc: 'Прибавление в стаде и немного еды' },
        ],
      },
      {
        id: 'caravan', icon: '🐫', title: 'Караван Шёлкового пути',
        text: 'К вашей ставке подошёл чужеземный караван. Купцы предлагают сделку: дерево и ткани в обмен на серебро.',
        can: () => this.res.gold >= 90,
        opts: [
          { label: '🤝 Купить товар (90🪙)', desc: 'Много дерева и еды разом' },
          { label: '🚫 Отказать', desc: 'Ничего не тратим' },
        ],
      },
      {
        id: 'plague', icon: '🤒', title: 'Поветрие в аулах',
        text: 'Среди шаруа пошла хворь. Работа встала, люди слабы — но в мечети есть кому лечить.',
        can: () => this.units.filter(u => u.owner === 'player' && u.key === 'villager').length >= 4,
        opts: [
          { label: '🕌 Просить имамов лечить (60🪙)', desc: 'Хворь отступит быстро' },
          { label: '⏳ Перетерпеть', desc: 'Добыча замедлится на время' },
        ],
      },
      {
        id: 'drought', icon: '🌵', title: 'Засуха',
        text: 'Реки обмелели, травы выгорели. Пашни родят скудно, пока не пройдут дожди.',
        can: () => this.blds.some(b => b.owner === 'player' && b.key === 'farm' && b.done >= 1),
        opts: [
          { label: '💧 Рыть арыки (80🪵)', desc: 'Смягчить засуху трудом' },
          { label: '🙏 Ждать дождя', desc: 'Пашни дают меньше еды долгое время' },
        ],
      },
      {
        id: 'kurgan', icon: '⚱️', title: 'Находка в кургане',
        text: 'Барлаушы наткнулись на древний курган. Под каменной насыпью что-то блестит — но тревожить предков боязно.',
        can: () => this.units.some(u => u.owner === 'player' && u.key === 'scout'),
        opts: [
          { label: '⛏️ Вскрыть курган', desc: 'Клад золота, но народ ропщет' },
          { label: '🕯️ Почтить предков', desc: 'Немного очков и спокойствие' },
        ],
      },
    ];
  }
  // планировщик: раз в 3–5 минут поднимаем подходящее событие
  updateEvents(dt: number) {
    // тикающие последствия
    if (this.droughtT > 0) this.droughtT = Math.max(0, this.droughtT - dt);
    if (this.plagueT > 0) this.plagueT = Math.max(0, this.plagueT - dt);
    if (this.event || this.over || this.paused) return;
    this.eventT += dt;
    if (this.eventT < 210) return;            // не раньше 3.5 минут после прошлого
    if (Math.random() > dt * 0.35) return;    // дальше — редкий случайный триггер
    let pool = this.eventDefs().filter(e => e.can() && !this.eventSeen.includes(e.id));
    if (!pool.length) { // все видены — начинаем круг заново
      this.eventSeen = [];
      pool = this.eventDefs().filter(e => e.can());
    }
    if (!pool.length) return;
    const def = pool[(Math.random() * pool.length) | 0];
    this.eventT = 0;
    this.eventSeen.push(def.id);
    this.event = { id: def.id, opts: def.opts.map(o => o.label) };
    this.sound.quest();
    this.pushHud();
  }
  // игрок выбрал реакцию (idx — номер варианта)
  eventChoice(idx: number) {
    const ev = this.event; if (!ev) return;
    const def = this.eventDefs().find(e => e.id === ev.id);
    this.event = null;
    if (!def) { this.pushHud(); return; }
    const herdUnits = () => this.units.filter(u => u.owner === 'neutral' && (u.key === 'sheep' || u.key === 'cow') && u.pastureId != null);
    switch (def.id) {
      case 'jut':
        if (idx === 0) {
          const herd = herdUnits();
          const kill = Math.max(1, Math.floor(herd.length / 3));
          for (let i = 0; i < kill && i < herd.length; i++) { herd[i].hp = 0; this.burst(herd[i].x, herd[i].y, 8, ['#fb7185'], 70, 0.6); }
          const food = kill * 45;
          this.res.food += food;
          this.pushBanner('🔪 Забой скота', `Кладовые полны: +${food}🍖, но стадо поредело на ${kill}`, 4);
        } else {
          const w = Math.min(this.res.wood, 90);
          this.res.wood -= w;
          this.pushBanner('🐎 Откочевали на юг', `Стадо спасено, но перекочёвка стоила ${Math.round(w)}🪵`, 4);
        }
        break;
      case 'birth': {
        const pen = this.blds.find(b => b.owner === 'player' && b.key === 'pen' && b.done >= 1);
        if (pen) {
          for (let i = 0; i < 3; i++) {
            const a = this.addUnit(Math.random() < 0.6 ? 'sheep' : 'cow', 'neutral', pen.x + rand(-50, 50), pen.y + rand(-40, 40));
            a.pastureId = pen.id;
            this.burst(a.x, a.y, 6, ['#fff', '#fde68a'], 60, 0.6);
          }
        }
        this.res.food += 80;
        this.pushBanner('🐑 Приплод', 'В загоне прибавление: +3 головы и +80🍖', 4);
        break;
      }
      case 'caravan':
        if (idx === 0 && this.res.gold >= 90) {
          this.res.gold -= 90; this.res.wood += 260; this.res.food += 160;
          this.sound.coin();
          this.pushBanner('🐫 Сделка с караваном', '+260🪵 и +160🍖 за 90🪙', 4);
        } else {
          this.pushBanner('🚫 Караван ушёл', 'Купцы отправились дальше на запад', 3);
        }
        break;
      case 'plague':
        if (idx === 0 && this.res.gold >= 60) {
          this.res.gold -= 60; this.plagueT = 25;
          this.pushBanner('🕌 Имамы взялись лечить', 'Хворь скоро отступит', 4);
        } else {
          this.plagueT = 100;
          this.pushBanner('🤒 Поветрие', 'Шаруа работают медленнее, пока хворь не пройдёт', 4);
        }
        break;
      case 'drought':
        if (idx === 0 && this.res.wood >= 80) {
          this.res.wood -= 80; this.droughtT = 30;
          this.pushBanner('💧 Арыки прорыты', 'Засуха почти не тронет пашни', 4);
        } else {
          this.droughtT = 150;
          this.pushBanner('🌵 Засуха', 'Пашни родят скудно — переждите', 4);
        }
        break;
      case 'kurgan':
        if (idx === 0) {
          this.res.gold += 220; this.grievance = Math.min(100, this.grievance + 6);
          this.sound.coin();
          this.pushBanner('⚱️ Курган вскрыт', '+220🪙, но народ шепчется о гневе предков', 4.5);
        } else {
          this.score += 350;
          this.pushBanner('🕯️ Предки почтены', 'Народ спокоен, слава хана растёт (+350 очков)', 4.5);
        }
        break;
    }
    this.checkQuests();
    this.pushHud();
  }

  // разозлить всё племя народа nid (для угрозы/шпионажа)
  provokeTribeById(nid: string) {
    for (const b of this.blds) { if (!b.tribe || this.tribeNationOf(b) !== nid) continue; this.provokeTribe(b.x, b.y, this.units.find(u => u.owner === 'player') ?? this.units[0]); }
  }
  // ── действия из панели дипломатии ──
  dipAction(nid: string, act: string): boolean {
    const def = NATION_BY_ID[nid];
    if (!def || this.over) return false;
    if (!this.metNation(nid)) { this.floater(this.cam.x, this.cam.y - 100, 'Вы ещё не знакомы с этим народом', '#94a3b8', 15); return false; }
    if (nid === 'rival') {
      if (act === 'peace') return this.sueForPeace(false);
      if (act === 'gift') return this.bribe();
      if (act === 'trade') return this.openTradeRoute();
      if (act === 'nap') return this.signNAP();
      if (act === 'condemn') return this.condemnNeighbor();
      if (act === 'tribute') return this.demandTribute();
      if (act === 'war') { if (!this.atWar) this.onPlayerAggression(); return true; }
      if (act === 'greet') { this.queueGreeting(nid); this.greetShown.delete(nid); this.updateContacts(1); return true; }
      return false;
    }
    // племена
    const rel = this.tribeRel[nid];
    if (act === 'threat') act = 'attack';
    if (act === 'greet') { this.greetShown.delete(nid); this.greeting = { nationId: nid }; return true; }
    if (act === 'gift') {
      const cost = def.choices.find(c => c.act === 'gift')?.gold ?? 40;
      if (rel === 'friend') { this.floater(this.cam.x, this.cam.y - 100, 'Уже дружны', '#94a3b8', 14); return false; }
      if (this.res.gold < cost) { this.floater(this.cam.x, this.cam.y - 100, `Нужно ${cost} 🪙`, '#f87171', 15); return false; }
      this.res.gold -= cost; this.tribeRel[nid] = 'friend';
      // дружеское племя успокаивается
      for (const b of this.blds) { if (!b.tribe || this.tribeNationOf(b) !== nid) continue; for (const e of this.units) if (e.tribe && dist2(e.x, e.y, b.x, b.y) < 400 * 400) { e.aggro = false; e.targetU = -1; e.state = 'idle'; } }
      this.sound.coin(); this.pushBanner(`🤝 Дружба с «${def.name}»`, `${def.title} ${def.ruler} рад союзу — племя не нападёт`, 4); this.pushHud(); return true;
    }
    if (act === 'attack') {
      if (rel !== 'hostile') { this.tribeRel[nid] = 'hostile'; this.provokeTribeById(nid); }
      this.pushBanner(`⚔️ Война с «${def.name}»`, 'Воины племени поднимаются по тревоге', 3.5); this.pushHud(); return true;
    }
    return false;
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
    // снос выделенного своего строения — Delete/Backspace
    if ((k === 'delete' || k === 'backspace') && this.selBld >= 0) { this.demolish(this.selBld); e.preventDefault(); return; }
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
    else if (k === '9') this.train('scout');
    else if (k === '0') this.train('trader');
    else if (k === 'h') this.enterPlacement('pen');
    else if (k === 'q') this.enterPlacement('house');
    else if (k === 'e') this.enterPlacement('barracks');
    else if (k === 'r') this.enterPlacement('tower');
    else if (k === 'f') this.enterPlacement('farm');
    else if (k === 'z') this.enterPlacement('stable');
    else if (k === 'x') this.enterPlacement('blacksmith');
    else if (k === 'c') this.enterPlacement('market');
    else if (k === 'k') this.enterPlacement('storehouse');
    else if (k === 'm' || k === 'ь') this.enterPlacement('mosque');
    else if (k === 'b') this.enterPlacement('wall');
    else if (k === 'v') this.enterPlacement('gate');
    else if (k === 'w') this.enterPlacement('wonder');
    else if (k === 't') this.ageUp();
    else if (k === 'g') { if (this.selUnits().length) { this.attackArmed = !this.attackArmed; this.rallyArmed = false; this.patrolArmed = false; this.sound.select(); this.pushHud(); } }
    else if (k === 'y') { if (this.selUnits().some(u => u.key !== 'villager')) { this.patrolArmed = !this.patrolArmed; this.attackArmed = false; this.sound.select(); this.pushHud(); } }
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
    for (const u of this.units) if (u.owner === 'player' && !u.hidden) {
      // разведчик-крот, внедрённый у вражеской базы, раскрывает вокруг себя большую область
      let sight = u.key === 'scout' ? 480 : 150;
      if (u.key === 'scout' && u.infDone) sight = Math.max(sight, 720);
      // пастух в поле видит далеко — чтобы его стадо на дальнем пастбище всегда было видно
      if (u.key === 'villager' && u.herder) sight = 560;
      mark(u.x, u.y, sight);
    }
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
    ctx.save();
    const margin = Math.max(this.vw, this.vh) / this.cam.zoom + 160;
    // туман рисуем в АБСОЛЮТНЫХ изо-координатах (как земля): берём видимый мировой
    // прямоугольник вокруг камеры и переводим его углы в аксиальные (q,r) — те же
    // формулы, что в reliefGridHex, поэтому гекс тумана точно ложится на тайл земли.
    const wx0 = this.cam.x - margin, wy0 = this.cam.y - margin;
    const wx1 = this.cam.x + margin, wy1 = this.cam.y + margin;
    // мировая точка → дробные аксиальные (flat-top): сначала в изо-экран, потом screenToHex
    const w2q = (wx: number, wy: number) => {
      const ix = wx - wy, iy = (wx + wy) * 0.5;
      const c = screenToHex(ix, iy);
      return c;
    };
    const cs = [w2q(wx0, wy0), w2q(wx1, wy0), w2q(wx1, wy1), w2q(wx0, wy1)];
    const qA = Math.floor(Math.min(...cs.map(c => c.q))) - 1;
    const qB = Math.ceil(Math.max(...cs.map(c => c.q))) + 1;
    const rA = Math.floor(Math.min(...cs.map(c => c.r))) - 1;
    const rB = Math.ceil(Math.max(...cs.map(c => c.r))) + 1;
    // высота рельефа по гексу — туман кладём на ВЕРХ приподнятого тайла (как землю),
    // иначе на ступенях рельефа тёмный гекс остаётся в базовой плоскости и над ним
    // торчит верхушка тайла с сеткой (та самая «несовпадающая сетка на возвышениях»).
    const relief = this.terrain.reliefGridHex(
      this.cam.x - margin, this.cam.y - margin, this.cam.x + margin, this.cam.y + margin);
    const upAtQ = (qq: number, rr: number) => relief.at(qq, rr) * RELIEF_STEP;
    for (let r = rA; r <= rB; r++) for (let q = qA; q <= qB; q++) {
      const [wx, wy] = hexCenterWorld(q, r);
      if (wx < 0 || wy < 0 || wx > WORLD.w || wy > WORLD.h) continue;
      const gx = (wx / this.fogCell) | 0, gy = (wy / this.fogCell) | 0;
      if (gx < 0 || gy < 0 || gx >= this.fogGW || gy >= this.fogGH) continue;
      const idx = gy * this.fogGW + gx;
      if (this.fogVis[idx]) continue; // видно — без тумана
      // АБСОЛЮТНЫЕ изо-координаты центра (трансформ уже сдвинут на камеру)
      const [hx, hy] = hexCenter(q, r);
      const up = upAtQ(q, r);
      hexPath(ctx, hx, hy - up, 1.06);
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
    // Стрелка прокрутки у края: перехватываем ДО выделения и приказов, иначе
    // клик у края одновременно двигал бы камеру и отдавал приказ юнитам.
    if (e.button === 0 && !this.placement && !this.rallyArmed && !this.attackArmed && !this.patrolArmed) {
      const dir = this.edgeArrowAt(w.px, w.py);
      if (dir) {
        this.nudgeCam(dir);
        this.pointers.set(e.pointerId, { x: w.px, y: w.py, sx: w.px, sy: w.py, t: performance.now(), moved: true, btn: 99 });
        return;
      }
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
    // МИРОВАЯ миникарта: точка на карте = мировой координате (не смещение от камеры)
    const fx = clamp((px - x) / w, 0, 1), fy = clamp((py - y) / h, 0, 1);
    this.cam.x = fx * WORLD.w;
    this.cam.y = fy * WORLD.h;
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

  // ── Курсор под целью ──────────────────────────────────────────────────────
  // Курсор показывает, ЧТО произойдёт по клику: сабля — атака, топор — рубка,
  // кирка — золото, корзина — ягоды, рыба — рыбалка, молоток — стройка,
  // зелёная стрелка — приказ идти. Без выделения курсор нейтральный.
  cursorFor(sx: number, sy: number): CursorKind {
    if (this.over || this.paused) return 'default';
    if (this.panning) return 'pan';
    if (this.edgeArrowAt(sx, sy)) return 'default';   // над стрелкой прокрутки
    if (this.placement) return 'build';
    const w = this.screenToWorld(sx, sy);
    const sel = this.selUnits();
    const hasVill = sel.some(u => u.key === 'villager');
    const hasMil = sel.some(u => this.combatUnit(u));

    const tu = this.pickUnit(w.x, w.y);
    if (tu && tu.owner !== 'player') return sel.length ? 'attack' : 'default';
    const tb = this.pickBld(w.x, w.y);
    if (tb && tb.owner !== 'player') return sel.length ? 'attack' : 'default';

    // Ресурс: свой курсор на каждый вид — только если есть кому добывать.
    const nd = this.pickNode(w.x, w.y);
    if (nd && nd.amount > 0) {
      if (!hasVill) return sel.length ? 'move' : 'default';
      return nd.kind === 'wood' ? 'wood' : nd.kind === 'gold' ? 'gold'
        : nd.kind === 'fish' ? 'fish' : 'food';
    }
    // Недостроенное здание игрока → молоток (шаруа пойдёт достраивать).
    if (tb && tb.owner === 'player' && tb.done < 1 && hasVill) return 'build';
    if (tb && tb.owner === 'player' && tb.key === 'farm' && hasVill) return 'food';
    if (tb && tb.owner === 'player') return 'select';
    if (tu && tu.owner === 'player') return 'select';
    return (hasVill || hasMil) ? 'move' : 'default';
  }

  // Ставим курсор на канвас CSS-ом; строку меняем только при смене вида,
  // иначе каждый кадр дёргается стиль и Chrome моргает курсором.
  syncCursor() {
    if (!this.canvas || this.mouse.isTouch) return;
    const kind = this.mouse.in ? this.cursorFor(this.mouse.x, this.mouse.y) : 'default';
    if (kind === this.curCursor) return;
    this.curCursor = kind;
    this.canvas.style.cursor = cursorCss(kind);
  }

  // ── Гекс под курсором ─────────────────────────────────────────────────────
  // Клетка = гекс. Наведение обводит её контуром, клик отправляет туда отряд.
  // Гекс не подсвечиваем там, где клик значит другое: над HUD-стрелками края,
  // в режиме постройки (там свой призрак здания) и на объектах (юнит/здание/
  // ресурс) — по ним курсор и приказ уже свои.
  updateHoverHex() {
    if (this.over || this.paused || !this.mouse.in || this.mouse.isTouch
      || this.box || this.panning || this.wallDrag || this.placement
      || this.edgeArrowAt(this.mouse.x, this.mouse.y)) { this.hoverHex = null; return; }
    const w = this.screenToWorld(this.mouse.x, this.mouse.y);
    // над миникартой гекс не подсвечиваем — там свой обработчик
    if (this.mouse.x >= this.minimap.x && this.mouse.x <= this.minimap.x + this.minimap.w
      && this.mouse.y >= this.minimap.y && this.mouse.y <= this.minimap.y + this.minimap.h) {
      this.hoverHex = null; return;
    }
    const [q, r] = worldToHex(w.x, w.y);
    this.hoverHex = { q, r };
  }

  // Клик по гексу: отряд идёт в ЦЕНТР клетки, а не в произвольную точку.
  // Возвращает false, если приказывать некому — тогда клик обрабатывается дальше.
  orderToHex(wx: number, wy: number): boolean {
    const us = this.selUnits();
    if (!us.length) return false;
    const [q, r] = worldToHex(wx, wy);
    const [cx, cy] = hexCenterWorld(q, r);
    this.hexPing = { x: cx, y: cy, t: 0.7 };
    this.issueSmart(cx, cy);
    // issueSmart раскидывает цели на rand(±24) — это БОЛЬШЕ радиуса гекса
    // (вписанная окружность ≈17), и одиночный юнит мог встать в соседнюю клетку.
    // Переставляем цели строем ВОКРУГ центра: один — ровно в центр, группа —
    // кольцами, чтобы отряд не топтался в одной точке, но шёл именно на этот гекс.
    const movers = us.filter(u => u.state === 'move' || u.state === 'attackmove');
    if (movers.length === 1) { movers[0].tx = cx; movers[0].ty = cy; }
    else {
      movers.forEach((u, i) => {
        if (i === 0) { u.tx = cx; u.ty = cy; return; }
        const ring = Math.ceil(i / 6);              // 6 юнитов на кольцо
        const idx = i - (ring - 1) * 6 - 1;
        const a = (idx / 6) * Math.PI * 2 + ring * 0.5;
        const rad = ring * HEX_CELL * 0.62;         // соседние клетки, без свалки
        u.tx = cx + Math.cos(a) * rad;
        u.ty = cy + Math.sin(a) * rad;
      });
    }
    return true;
  }

  // Обводка гекса под курсором + вспышка на гексе, куда отдан приказ.
  // Рисуется в мировой iso-трансформации, поэтому контур ложится ровно на плитку.
  drawHexHover(ctx: CanvasRenderingContext2D) {
    if (this.hexPing.t > 0) {
      const [px, py] = toIso(this.hexPing.x, this.hexPing.y);
      const k = this.hexPing.t / 0.7;
      ctx.save();
      ctx.globalAlpha = k * 0.85;
      hexPath(ctx, px, py, 1 + (1 - k) * 0.25);
      ctx.strokeStyle = '#a3e635'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
    }
    if (!this.hoverHex) return;
    const { q, r } = this.hoverHex;
    const [px, py] = hexCenter(q, r);
    const armed = this.selUnits().length > 0;
    ctx.save();
    hexPath(ctx, px, py, 1);
    // с выделением — зелёный «можно идти», без выделения — нейтральный контур
    ctx.fillStyle = armed ? 'rgba(163,230,53,0.13)' : 'rgba(246,212,124,0.08)';
    ctx.fill();
    ctx.strokeStyle = armed ? 'rgba(163,230,53,0.9)' : 'rgba(246,212,124,0.55)';
    ctx.lineWidth = armed ? 2 : 1.4;
    ctx.stroke();
    ctx.restore();
  }

  // ── Стрелки прокрутки у краёв экрана ──────────────────────────────────────
  // Какая стрелка под точкой экрана. Углы отдаём вертикали: две стрелки разом
  // не рисуем, иначе они наезжают друг на друга.
  edgeArrowAt(sx: number, sy: number): '' | 'l' | 'r' | 'u' | 'd' {
    if (this.mouse.isTouch) return '';           // на тач-экране жест панорамы удобнее
    // Миникарта сидит в правом нижнем углу — прямо в зоне стрелок «вниз» и
    // «вправо». Клик по ней перехватывается раньше, поэтому и стрелку там
    // не показываем: иначе она обещала бы прокрутку, а карта прыгала бы.
    const mm = this.minimap;
    if (mm.w > 0 && sx >= mm.x - 6 && sx <= mm.x + mm.w + 6
      && sy >= mm.y - 6 && sy <= mm.y + mm.h + 6) return '';
    if (sy < EDGE_ZONE) return 'u';
    if (sy > this.vh - EDGE_ZONE) return 'd';
    if (sx < EDGE_ZONE) return 'l';
    if (sx > this.vw - EDGE_ZONE) return 'r';
    return '';
  }

  updateEdgeArrows() {
    this.edgeFlash = Math.max(0, this.edgeFlash - 0.05);
    // рамка выделения, панорама и режим постройки важнее — прячем стрелки
    if (!this.mouse.in || this.box || this.panning || this.wallDrag) { this.edgeDir = ''; return; }
    this.edgeDir = this.edgeArrowAt(this.mouse.x, this.mouse.y);
  }

  // Клик по стрелке: сдвигаем камеру на экран с плавным докатом.
  nudgeCam(dir: 'l' | 'r' | 'u' | 'd') {
    const step = EDGE_STEP / this.cam.zoom;
    const dx = dir === 'l' ? -step : dir === 'r' ? step : 0;
    const dy = dir === 'u' ? -step : dir === 'd' ? step : 0;
    this.edgeGlide = { dx, dy, t: EDGE_GLIDE_T };
    this.edgeFlash = 1;
    this.camFollow = false;
    this.sound.move();
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
        if (node) this.floater(node.x, node.y - 30, 'Шаруа пойдут на добычу', '#a3e635', 13);
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
    // КЛИК ПО ГЕКСУ: пустая земля — отряд идёт в ЦЕНТР клетки (клетка = гекс),
    // а не в произвольную точку под курсором. Объекты (юниты/здания/ресурсы)
    // разобраны выше и сюда не доходят.
    if (this.selected.size) { this.orderToHex(x, y); return; }
    // Клик по ресурсу без выделения — осмотр: плашка с названием и остатком.
    if (n) { this.clearSel(); this.selNode = n.id; this.sound.select(); this.pushHud(); return; }
    if (this.selBld >= 0 || this.selNode >= 0) { this.clearSel(); this.pushHud(); }
  }

  issueSmart(x: number, y: number) {
    const us = this.selUnits();
    if (!us.length) return;
    // ПРЯМОЙ ПРИКАЗ ОТМЕНЯЕТ ОТДЫХ: игрок главнее расписания смен.
    // Работник встаёт с алтыбакана недоотдохнувшим — усталость остаётся как есть.
    for (const u of us) {
      if (u.resting) { u.resting = false; u.restT = 0; u.restKind = undefined; u.shiftBack = null; }
      if (u.praying) { u.praying = false; u.prayT = 0; u.prayBack = null; }
    }
    // find explicit target
    const tu = this.pickUnit(x, y);
    const tb = this.pickBld(x, y);
    const nd = this.pickNode(x, y);
    const hasVill = us.some(u => u.key === 'villager');
    const hasMil = us.some(u => this.combatUnit(u));
    if (tu && tu.owner !== 'player') {
      // ИМАМЫ в выделении камлают по цели (обращают), остальные атакуют обычным порядком
      const monks = us.filter(u => u.key === 'monk');
      const rest = us.filter(u => u.key !== 'monk');
      let didConv = false;
      if (monks.length) didConv = this.orderConvert(monks, tu);
      if (rest.length) this.orderAttack(rest, tu);
      else if (!didConv) this.orderAttack(us, tu); // цель необращаема (скот/волк) — обычная атака
      return;
    }
    if (tb && tb.owner !== 'player') { this.orderAttackBld(us, tb); return; }
    if (nd && hasVill) {
      const vills = us.filter(u => u.key === 'villager');
      for (const v of vills) this.orderGather(v, nd.id);
      if (hasMil) this.orderAttackMove(us.filter(u => this.combatUnit(u)), x, y);
      return;
    }
    // own farm → gather
    if (tb && tb.owner === 'player' && tb.key === 'farm' && hasVill) {
      for (const v of us.filter(u => u.key === 'villager')) { v.state = 'gather'; v.buildId = tb.id; v.nodeId = -1; v.tx = tb.x + rand(-30, 30); v.ty = tb.y + rand(-24, 24); v.gatherT = 0; }
      this.sound.move(); this.spawnRing(x, y, '#a3e635'); return;
    }
    // own pen → назначить пастуха (рабочий верхом пасёт скот и загоняет в загон)
    if (tb && tb.owner === 'player' && tb.key === 'pen' && hasVill) {
      // если загон ещё строится — сначала отправляем достраивать, и назначение пастуха
      // произойдёт после завершения; если готов — назначаем сразу
      if (tb.done < 1) {
        for (const v of us.filter(u => u.key === 'villager')) { v.state = 'build'; v.buildId = tb.id; v.herder = false; v.penId = undefined; v.tx = tb.x + rand(-60, 60); v.ty = tb.y + rand(-50, 50); }
        this.sound.move(); this.sound.playPhrase('за работу'); this.spawnRing(x, y, '#f6d47c');
      } else {
        const vills = us.filter(u => u.key === 'villager');
        // один пастух на загон: первый свободный рабочий становится пастухом
        const free = vills.find(v => !v.herder) ?? vills[0];
        this.assignShepherd(free, tb);
        this.spawnRing(tb.x, tb.y, '#a3e635');
      }
      if (hasMil) this.orderAttackMove(us.filter(u => this.combatUnit(u)), x, y);
      return;
    }
    // own construction → assist
    if (tb && tb.owner === 'player' && tb.done < 1 && hasVill) {
      for (const v of us.filter(u => u.key === 'villager')) { v.state = 'build'; v.buildId = tb.id; v.tx = tb.x + rand(-60, 60); v.ty = tb.y + rand(-50, 50); }
      this.sound.move(); this.sound.playPhrase('за работу'); this.spawnRing(x, y, '#f6d47c'); return;
    }
    // own DAMAGED building → repair
    if (tb && tb.owner === 'player' && tb.done >= 1 && tb.hp < tb.maxHp - 1 && hasVill) {
      for (const v of us.filter(u => u.key === 'villager')) { v.state = 'build'; v.buildId = tb.id; v.tx = tb.x + rand(-50, 50); v.ty = tb.y + rand(-46, 46); }
      this.sound.move(); this.sound.playPhrase('за работу'); this.floater(tb.x, tb.y - 60, '🔧 Ремонт!', '#7dd3fc', 15); this.spawnRing(x, y, '#7dd3fc'); return;
    }
    // default: military attack-move, villagers move
    if (hasMil && !hasVill) this.orderAttackMove(us, x, y);
    else if (!hasMil) { for (const v of us) { v.state = 'move'; v.tx = x + rand(-24, 24); v.ty = y + rand(-24, 24); v.targetU = -1; v.targetB = -1; v.nodeId = -1; v.buildId = -1; } this.sound.move(); this.voiceSel('move'); this.spawnRing(x, y, '#7dd3fc'); }
    else {
      this.orderAttackMove(us.filter(u => this.combatUnit(u)), x, y);
      for (const v of us.filter(u => u.key === 'villager')) { v.state = 'move'; v.tx = x + rand(-24, 24); v.ty = y + rand(-24, 24); v.targetU = -1; v.targetB = -1; v.nodeId = -1; v.buildId = -1; }
      this.sound.move(); this.spawnRing(x, y, '#7dd3fc');
    }
  }

  orderGather(v: Unit, nodeId: number) {
    const n = this.nodes.find(n => n.id === nodeId);
    if (!n) return;
    v.herder = false; v.penId = undefined; v.speed = UNIT_DEFS.villager.speed; // пастух снят с должности
    if (v.carry.amt > 0 && v.carry.type !== n.kind) this.deposit(v);
    v.state = 'gather'; v.nodeId = nodeId; v.buildId = -1; v.targetU = -1; v.targetB = -1;
    v.tx = n.x + rand(-8, 8); v.ty = n.y + rand(-8, 8);
    v.carry.type = n.kind === 'fish' ? 'food' : n.kind;
  }

  orderAttack(us: Unit[], target: Unit) {
    for (const u of us) {
      if (u.key === 'villager') {
        // крестьянин по приказу идёт и бьёт цель (дичь = охота, волк/воин = оборона/атака)
        u.hunt = true;
        u.state = 'attackmove'; u.targetU = target.id; u.targetB = -1;
        u.tx = target.x; u.ty = target.y; u.nodeId = -1; u.buildId = -1;
        continue;
      }
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
    const mil = us.filter(u => this.combatUnit(u));
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
    const us = this.selUnits().filter(u => u.owner === 'player' && this.combatUnit(u));
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
    const us = this.selUnits().filter(u => u.owner === 'player' && this.combatUnit(u));
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
    const us = this.selUnits().filter(u => u.owner === 'player' && this.combatUnit(u));
    if (!us.length) return null;
    const s = us[0].stance;
    return us.every(u => u.stance === s) ? s : 'mixed';
  }

  // ---------- economy / production ----------
  afford(c: { wood: number; food: number; gold: number }) { return this.res.wood >= c.wood && this.res.food >= c.food && this.res.gold >= c.gold; }
  pay(c: { wood: number; food: number; gold: number }) { this.res.wood -= c.wood; this.res.food -= c.food; this.res.gold -= c.gold; }
  popUsed(owner: 'player' | 'enemy' | 'neutral') { let s = 0; for (const u of this.units) if (u.owner === owner) s += UNIT_DEFS[u.key].pop; return s; }
  popCap(owner: 'player' | 'enemy' | 'neutral') {
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
    if (key === 'tower' && this.age < 1) { this.floater(this.cam.x, this.cam.y - 100, 'Башням нужен Век жузов!', '#f87171', 18); this.sound.error(); return; }
    if (key === 'stable' && this.age < 1) { this.floater(this.cam.x, this.cam.y - 100, 'Конюшне нужен Век жузов!', '#f87171', 18); this.sound.error(); return; }
    if (key === 'blacksmith' && this.age < 2) { this.floater(this.cam.x, this.cam.y - 100, 'Кузнице нужен Век батыров!', '#f87171', 18); this.sound.error(); return; }
    const areq = (BUILDING_DEFS[key] as unknown as { ageReq?: number }).ageReq;
    if (areq != null && this.age < areq) { this.floater(this.cam.x, this.cam.y - 100, `Нужен: ${AGES[areq].name}!`, '#f87171', 18); this.sound.error(); return; }
    const c = this.bldCost(key);
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
    const c = this.bldCost(key);
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

  // ── улучшения сторожевой башни ──
  towerUpgradeCost(kind: 'range' | 'dmg' | 'archers', lvl: number): number {
    const base = kind === 'range' ? 90 : kind === 'dmg' ? 110 : 150;
    return Math.round(base * (1 + lvl * 0.8));
  }
  upgradeTower(bid: number, kind: 'range' | 'dmg' | 'archers'): boolean {
    const b = this.blds.find(b => b.id === bid);
    if (!b || b.key !== 'tower' || b.owner !== 'player' || b.done < 1) return false;
    b.upg = b.upg ?? { range: 0, dmg: 0, archers: 0 };
    const max = kind === 'archers' ? 2 : 3;
    if ((b.upg[kind] ?? 0) >= max) { this.floater(b.x, b.y - 60, 'Максимальный уровень', '#94a3b8', 14); return false; }
    const lvl = b.upg[kind] ?? 0;
    const gold = this.towerUpgradeCost(kind, lvl);
    if (this.res.gold < gold) { this.floater(b.x, b.y - 60, `Нужно ${gold} 🪙`, '#f87171', 15); this.sound.error(); return false; }
    this.res.gold -= gold;
    b.upg[kind] = lvl + 1;
    if (kind === 'dmg') { b.maxHp += 80; b.hp += 80; } // укрепление при уроне
    const nm = kind === 'range' ? '📐 Дальность обзора' : kind === 'dmg' ? '🏹 Сила урона' : '🎯 Лучники на башне';
    this.burst(b.x, b.y - 60, 14, ['#fde047', '#f6d47c', '#fff'], 120, 0.7);
    this.sound.coin();
    this.floater(b.x, b.y - 70, `${nm} ур.${lvl + 1}`, '#fde047', 15);
    this.pushHud();
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
      blds: this.blds.map(b => ({ key: b.key, owner: b.owner, x: b.x, y: b.y, hp: b.hp, done: b.done, queue: b.queue, rallyX: b.rallyX, rallyY: b.rallyY, axis: b.axis ?? null, upg: b.upg ?? null })),
      nodes: this.nodes.map(n => ({ kind: n.kind as string, x: n.x, y: n.y, amount: n.amount, r: n.r })),
      relicsHeld: this.relicsHeld,
      dip: { atWar: this.atWar, grievance: this.grievance, casusBelli: this.casusBelli, warT: this.warT, peaceT: this.peaceT, morale: this.morale, wonderT: this.wonderT,
        tradeRoute: this.tradeRoute, napT: this.napT, condemned: this.condemned, tributeT: this.tributeT },
      nations: { rivalMet: this.rivalMet, tribeMet: this.tribeMet, tribeRel: this.tribeRel,
        envoys: this.envoys, rivalEnvoys: this.rivalEnvoys },
      events: { eventT: this.eventT, seen: this.eventSeen, drought: this.droughtT, plague: this.plagueT },
      day: { dayT: this.dayT, dayF: this.dayPhase(), dayNum: this.dayNum, restedTotal: this.restedTotal },
      pray: { azanDone: this.azanDone, berekeT: this.berekeT, berekePower: this.berekePower, prayerCount: this.prayerCount },
      scoutM: this.units.filter(u => u.key === 'scout').map(u => ({ mission: u.mission ?? null, mNation: u.mNation ?? null })),
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
      // ВАЖНО: эпоху и технологии восстанавливаем ДО создания юнитов — addUnit
      // масштабирует статы по возрасту и взятым ступеням апгрейда, иначе
      // загруженная армия выходит слабее сохранённой.
      this.age = d.age || 0; this.eage = d.eage || 0;
      this.tech = d.tech || {};
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
        if ((bd as unknown as { upg?: { range: number; dmg: number; archers: number } }).upg) b.upg = (bd as unknown as { upg: { range: number; dmg: number; archers: number } }).upg;
        if ((bd.key === 'wall' || bd.key === 'gate') && bd.axis) b.axis = bd.axis;
        bMap.set(i, b.id);
      });
      (d.nodes || []).forEach((nd: { kind: 'wood'|'gold'|'food'|'fish'; x: number; y: number; amount: number; r: number }) => this.addNode(nd.kind, nd.x, nd.y, nd.amount));
      // цели не сохраняем — юниты перенацелятся сами; декор оставляем от genWorld
      void uMap; void bMap;
      this.time = d.time || 0;   // age/eage/tech уже восстановлены выше, до addUnit
      this.wave = d.wave || 0; this.waveT = d.waveT ?? DIFF[this.difficulty].waveInterval;
      this.res = { ...this.res, ...d.res }; this.eres = { ...this.eres, ...d.eres };
      this.score = d.score || 0; this.kills = d.kills || 0; this.razed = d.razed || 0;
      this.gatheredTotal = d.gatheredTotal || 0; this.woodGathered = d.woodGathered || 0;
      this.soldiersTrained = d.soldiersTrained || 0; this.barracksBuilt = d.barracksBuilt || 0; this.wolvesSlain = d.wolvesSlain || 0;
      this.relicsHeld = d.relicsHeld || 0;
      // восстановить взятые реликвии как убранные с карты
      if (this.relicsHeld > 0) for (let i = 0; i < Math.min(this.relics.length, this.relicsHeld); i++) this.relics[i].taken = true;
      this.questsDone = d.questsDone || {};
      if (d.dip) { this.atWar = !!d.dip.atWar; this.grievance = d.dip.grievance ?? 8; this.casusBelli = d.dip.casusBelli ?? 0; this.warT = d.dip.warT ?? 0; this.peaceT = d.dip.peaceT ?? 0; this.morale = d.dip.morale ?? 1; this.wonderT = d.dip.wonderT ?? 0;
        this.tradeRoute = !!d.dip.tradeRoute; this.napT = d.dip.napT ?? 0; this.condemned = !!d.dip.condemned; this.tributeT = d.dip.tributeT ?? 0; }
      if (d.events) { this.eventT = d.events.eventT ?? 0; this.eventSeen = d.events.seen || []; this.droughtT = d.events.drought ?? 0; this.plagueT = d.events.plague ?? 0; }
      if (d.day) {
        // Старые сейвы писали dayT в пределах прежних 240-секундных суток. Если
        // подставить это число в 30-минутные сутки, часы застрянут около полудня,
        // поэтому храним и долю суток: она переносится между любыми длинами.
        const frac = d.day.dayF;
        this.dayT = typeof frac === 'number' ? clamp(frac, 0, 0.999) * this.DAY_LEN
          : clamp(d.day.dayT ?? 0, 0, this.DAY_LEN);
        this.dayNum = d.day.dayNum ?? 1; this.restedTotal = d.day.restedTotal ?? 0;
      }
      // благодать из старого сейва могла быть записана в прежнем масштабе —
      // подрезаем до текущего максимума, чтобы таймер не показывал лишнего
      if (d.pray) { this.azanDone = d.pray.azanDone || []; this.berekeT = clamp(d.pray.berekeT ?? 0, 0, this.BEREKE_LEN); this.berekePower = clamp(d.pray.berekePower ?? 0, 0, 1); this.prayerCount = d.pray.prayerCount ?? 0; }
      if (d.nations) { this.rivalMet = !!d.nations.rivalMet; this.tribeMet = d.nations.tribeMet || {}; this.tribeRel = d.nations.tribeRel || {}; this.envoys = d.nations.envoys || {}; this.rivalEnvoys = d.nations.rivalEnvoys || {}; if (this.rivalMet) this.greetShown.add('rival'); for (const k of Object.keys(this.tribeMet)) this.greetShown.add(k); }
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

  // ── ЛИНИИ АПГРЕЙДА ЮНИТОВ ──
  // Апгрейды владельца (у игрока — по изученным, у врага — по эпохе: ИИ не «исследует»,
  // но его армия должна расти вместе с нашей, иначе поздняя игра становится тиром).
  upgTier(unit: UnitKey, owner: string): number {
    const line = upgradeLine(unit);
    if (!line.length) return 0;
    if (owner === 'player') return line.filter(u => this.tech[u.id]).length;
    if (owner === 'enemy') {
      // враг получает ступень 1 в Веке батыров и ступень 2 в Веке Абылай хана
      return this.eage >= 3 ? 2 : this.eage >= 2 ? 1 : 0;
    }
    return 0;
  }
  // накопленные множители статов от всех взятых ступеней
  upgMult(unit: UnitKey, owner: string): { hp: number; atk: number; speed: number; range: number } {
    const n = this.upgTier(unit, owner);
    const m = { hp: 1, atk: 1, speed: 1, range: 1 };
    if (!n) return m;
    for (const u of upgradeLine(unit).slice(0, n)) {
      m.hp *= u.hpMult; m.atk *= u.atkMult;
      m.speed *= u.speedMult ?? 1; m.range *= u.rangeMult ?? 1;
    }
    return m;
  }
  // отображаемое имя рода войск с учётом ступени («Сарбаз» → «Хан сарбазы»)
  unitName(unit: UnitKey, owner: string): string {
    const n = this.upgTier(unit, owner);
    const line = upgradeLine(unit);
    return n > 0 ? line[n - 1].newName : UNIT_DEFS[unit].name;
  }
  // применить ступень ко ВСЕМ живым юнитам этого рода (апгрейд ретроактивен, как в AoE)
  applyUpgrade(id: string) {
    const up = UPGRADES[id]; if (!up) return;
    this.tech[id] = true;
    let n = 0;
    for (const u of this.units) {
      if (u.owner !== 'player' || u.key !== up.unit) continue;
      const frac = u.maxHp > 0 ? u.hp / u.maxHp : 1;   // раненый остаётся раненым в той же доле
      u.maxHp *= up.hpMult; u.hp = u.maxHp * frac;
      u.atk *= up.atkMult;
      u.speed *= up.speedMult ?? 1;
      u.range *= up.rangeMult ?? 1;
      u.upg = up.tier;
      this.spark(u.x, u.y - 20, up.plume);
      n++;
    }
    this.sound.research();
    this.burst(this.cam.x, this.cam.y - 60, 20, [up.plume, '#f6d47c', '#fff'], 120, 0.9);
    this.pushBanner(`${up.icon} ${up.newName}!`, n > 0 ? `Улучшено воинов: ${n}` : up.desc, 3.2);
    this.score += 200;
    this.pushHud();
  }
  // строки для панели здания/досье: доступна ли следующая ступень линии
  upgradeRows(bldKey: BuildingKey): { id: string; name: string; desc: string; icon: string; cost: string; done: boolean; available: boolean; locked: boolean }[] {
    const costTxt = (c: { wood: number; food: number; gold: number }) => {
      const p: string[] = [];
      if (c.wood) p.push(`${c.wood}🪵`);
      if (c.food) p.push(`${c.food}🍖`);
      if (c.gold) p.push(`${c.gold}🪙`);
      return p.join(' ');
    };
    return Object.values(UPGRADES).filter(u => u.bld === bldKey).map(u => {
      const done = !!this.tech[u.id];
      const prev = upgradeLine(u.unit).find(x => x.tier === u.tier - 1);
      const prevOk = !prev || !!this.tech[prev.id];
      return {
        id: u.id, name: u.name, desc: u.desc, icon: u.icon, cost: costTxt(u.cost),
        done, locked: !prevOk || this.age < u.ageReq,
        available: !done && prevOk && this.age >= u.ageReq && this.afford(u.cost),
      };
    });
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
    // в досье показываем и обычные техи, и ступени линий апгрейда
    return [...Object.values(TECHS), ...Object.values(UPGRADES)].map(t => {
      const done = !!this.tech[t.id];
      const researching = busyId === t.id;
      const hasBld = this.blds.some(b => b.owner === 'player' && b.key === t.bld && b.done >= 1);
      const ageOk = this.age >= t.ageReq;
      // ступень 2 линии заблокирована, пока не взята ступень 1
      const up = UPGRADES[t.id];
      const prev = up ? upgradeLine(up.unit).find(x => x.tier === up.tier - 1) : undefined;
      const prevOk = !prev || !!this.tech[prev.id];
      let state: TechTreeRow['state'];
      if (done) state = 'done';
      else if (researching) state = 'researching';
      else if (!ageOk || !prevOk) state = 'age';
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
    const t = TECHS[id] ?? UPGRADES[id];   // линии апгрейда идут тем же путём, что и техи
    if (!t || this.paused || this.over) return;
    if (this.tech[id]) { this.sound.error(); return; }
    // ступень 2 недоступна, пока не взята ступень 1
    const up = UPGRADES[id];
    if (up) {
      const prev = upgradeLine(up.unit).find(x => x.tier === up.tier - 1);
      if (prev && !this.tech[prev.id]) {
        this.floater(this.cam.x, this.cam.y - 110, `Сначала: ${prev.newName}!`, '#f87171', 16);
        this.sound.error(); return;
      }
    }
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
    if (UPGRADES[id]) { this.applyUpgrade(id); return; }   // линия апгрейда — свой обработчик
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
  gatherMult(): number {
    let m = this.hasTech('ironTools') ? 1.3 : 1;
    if (this.bonusTier('craft', 3)) m *= 1.15;   // союз с ремесленниками ускоряет шаруа
    if (this.plagueT > 0) m *= 0.6;              // поветрие: работа идёт туго
    return m;
  }

  // ── ПОСМЕННАЯ РАБОТА ──
  // Личный множитель добычи: отдохнувший работает быстрее, вымотанный — медленнее.
  // gatherMult() остаётся глобальным (техи/поветрие), а этот — про конкретного шаруа.
  workMult(u: Unit): number {
    let m = this.gatherMult();
    if (u.owner !== 'player') return m;
    if ((u.freshT ?? 0) > 0) m *= this.FRESH_BONUS;              // вернулся с отдыха — бодр
    else if ((u.fatigue ?? 0) > 0.7) m *= 1 - ((u.fatigue ?? 0) - 0.7) * 0.8; // вымотан — вяло
    m *= this.berekeMult();                                      // благодать после намаза
    return m;
  }
  readonly FRESH_BONUS = 1.35;   // насколько быстрее работает отдохнувший
  // Пропорции смены заданы В ДОЛЯХ СУТОК, поэтому длину суток можно менять
  // одной строкой: ритм «работа → отдых у юрты → бодрая смена» сохранится.
  // Доли взяты РОВНО те, что сложились при 240-секундных сутках (150/26/70),
  // чтобы удлинение суток не превратилось в тихий ребаланс: работник по-прежнему
  // отдыхает ~1.6 раза за сутки, а не втрое чаще.
  readonly REST_TIME = DAY_LEN_SEC * 0.108;   // отдых ≈ 10.8% суток (~194 с при 30 мин)
  readonly FRESH_TIME = DAY_LEN_SEC * 0.292;  // бодрость держится ≈ 29% суток (~525 с)
  readonly TIRE_RATE = 1 / (DAY_LEN_SEC * 0.625); // полная усталость за 5/8 суток работы

  // Фаза суток 0..1. Договорённость наследуется от старого визуала освещения:
  // фаза 0 — ПОЛДЕНЬ (светло), 0.5 — ПОЛНОЧЬ.
  dayPhase(): number { return this.dayT / this.DAY_LEN; }
  // Полуширина глухой ночи и внешняя граница сумерек — в долях суток.
  get nightHalf(): number { return NIGHT_LEN_SEC / 2 / this.DAY_LEN; }
  get duskEdge(): number { return (NIGHT_LEN_SEC / 2 + TWILIGHT_SEC) / this.DAY_LEN; }
  // Темнота 0..1 по ЯВНОМУ расписанию, а не по косинусу: посреди ночи ровно 1,
  // днём ровно 0, между ними плавная ступень (smoothstep) длиной в сумерки.
  // Косинус растягивал полутьму на 80% суток и делал «ночь» вопросом порога.
  darkness(): number {
    const d = Math.abs(this.dayPhase() - 0.5);      // 0 в полночь, 0.5 в полдень
    if (d <= this.nightHalf) return 1;              // глухая ночь
    if (d >= this.duskEdge) return 0;               // светлый день
    const t = (d - this.nightHalf) / (this.duskEdge - this.nightHalf);
    return 1 - t * t * (3 - 2 * t);                 // сумерки: плавно
  }
  // Подписи совпадают с реальным освещением: «Түн» показывается ровно тогда,
  // когда действуют ночные правила (усталость ×1.6, ранний уход на отдых).
  dayName(): string {
    const p = this.dayPhase(), d = Math.abs(p - 0.5);
    if (d <= this.nightHalf) return 'Түн (ночь)';
    if (d >= this.duskEdge) return 'Күндіз (день)';
    return p < 0.5 ? 'Кеш (закат)' : 'Таң (рассвет)';
  }
  dayIcon(): string {
    const p = this.dayPhase(), d = Math.abs(p - 0.5);
    if (d <= this.nightHalf) return '🌙';
    if (d >= this.duskEdge) return '☀️';
    return p < 0.5 ? '🌇' : '🌅';
  }
  // Ночные правила действуют ровно в те 4 минуты, что отведены ночи.
  isNight(): boolean { return Math.abs(this.dayPhase() - 0.5) <= this.nightHalf; }

  // точка отдыха у ближайшей юрты (или ставки, если юрт ещё нет)
  restSpotFor(u: Unit): { x: number; y: number; b: Bld } | null {
    let best: Bld | null = null; let bd = Infinity;
    for (const b of this.blds) {
      if (b.owner !== 'player' || b.done < 1) continue;
      if (b.key !== 'house' && b.key !== 'towncenter') continue;
      const d = dist2(u.x, u.y, b.x, b.y);
      // юрты предпочтительнее ставки — искусственно «приближаем» их
      const w = b.key === 'house' ? d : d * 2.4;
      if (w < bd) { bd = w; best = b; }
    }
    if (!best) return null;
    // рассаживаем вокруг юрты по кругу, чтобы не слипались в одну точку
    const a = (u.id * 2.399) % (Math.PI * 2);
    const r = best.size * 0.62 + 24;
    return { x: best.x + Math.cos(a) * r, y: best.y + Math.sin(a) * r * 0.6, b: best };
  }

  // ── ПОСТОЯННЫЕ ДЕКОРАЦИИ СТОЙБИЩА ──
  // Казан и алтыбакан стоят у ханской ставки всегда, а не только когда кто-то
  // отдыхает. КЛЕТКА = ГЕКС, её шаг в мире = √3 * HS ≈ 34.64 (не 32!).
  // Дистанции от центра ставки:
  //   казан     — 4.5 клетки (было 2.5, отодвинут по просьбе на 2 клетки)
  //   алтыбакан — 7.5 клетки
  // Место не зависит от времени, поэтому объекты не «скачут» между кадрами
  // и переживают сохранение без отдельных полей.
  private campCache: { key: string; props: { x: number; y: number; kind: 'kazan' | 'swing' }[] } | null = null;
  campProps(): { x: number; y: number; kind: 'kazan' | 'swing' }[] {
    const tc = this.blds.find(b => b.owner === 'player' && b.key === 'towncenter' && b.done >= 1);
    if (!tc) { this.campCache = null; return []; }
    // позиция зависит только от ставки — считаем один раз, а не каждый кадр
    const key = `${tc.id}:${tc.x}:${tc.y}`;
    if (this.campCache && this.campCache.key === key) return this.campCache.props;
    const out: { x: number; y: number; kind: 'kazan' | 'swing' }[] = [];
    // казан — юго-восточнее ставки, 4.5 клетки
    const rk = 4.5 * HEX_CELL;
    out.push({ x: tc.x + Math.cos(0.6) * rk, y: tc.y + Math.sin(0.6) * rk, kind: 'kazan' });
    // алтыбакан — 7.5 клетки, с другой стороны, чтобы не спорил с казаном
    // за место и не налезал на постройки вплотную к ставке
    const rs = 7.5 * HEX_CELL;
    out.push({ x: tc.x + Math.cos(2.5) * rs, y: tc.y + Math.sin(2.5) * rs, kind: 'swing' });
    this.campCache = { key, props: out };
    return out;
  }

  // отправить работника на отдых
  sendToRest(u: Unit) {
    const spot = this.restSpotFor(u);
    if (!spot) return false;                     // некуда идти — работает дальше
    // запомним, к какому ресурсу вернуть после смены
    u.shiftBack = u.nodeId >= 0 ? { nodeId: u.nodeId, kind: u.wkind } : null;
    // работница уходит с дойки — освобождаем загон, иначе он останется «занят»
    // ушедшей дояркой и к нему больше никто не подойдёт
    if (u.penId != null) {
      const pen = this.blds.find(b => b.id === u.penId);
      if (pen && pen.milkWid === u.id) pen.milkWid = undefined;
      u.penId = undefined;
    }
    // чем занять на отдыхе: женщины — казан, мужчины — асыки, кто-то на алтыбакане
    const r = Math.random();
    let kind: 'kazan' | 'swing' | 'asyk' = u.female ? (r < 0.55 ? 'kazan' : 'swing') : (r < 0.6 ? 'asyk' : 'swing');
    // Казан и алтыбакан — РЕАЛЬНЫЕ объекты у ставки, а не выдумка на месте отдыха:
    // работник идёт именно к ним. Место одно, поэтому занятый инвентарь не делим —
    // иначе две сценки наложатся друг на друга в одной точке.
    const props = this.campProps();
    let px = spot.x, py = spot.y;
    if (kind === 'kazan' || kind === 'swing') {
      const pr = props.find(q => q.kind === kind);
      const taken = pr ? this.units.some(o => o.id !== u.id && o.resting && o.restKind === kind) : true;
      if (pr && !taken) { px = pr.x; py = pr.y; }
      else kind = u.female ? 'kazan' : 'asyk';   // инвентарь занят — отдыхаем у юрты
      if (kind === 'kazan' && (!pr || taken)) kind = 'asyk';
    }
    u.restKind = kind;
    // разброс ±20% — чтобы артель не уходила и не возвращалась строем
    u.resting = true; u.restT = this.REST_TIME * rand(0.85, 1.2);
    u.restX = px; u.restY = py;
    u.state = 'move'; u.tx = px; u.ty = py;
    u.nodeId = -1; u.buildId = -1; u.wkind = undefined; u.targetU = -1;
    return true;
  }

  // тик отдыха конкретного работника: дойти до юрты, отдохнуть, вернуться бодрым
  updateResting(u: Unit, dt: number): boolean {
    if (!u.resting) return false;
    const rx = u.restX ?? u.x, ry = u.restY ?? u.y;
    // ещё идём к месту отдыха
    if (dist2(u.x, u.y, rx, ry) > 30 * 30) {
      u.wkind = undefined;
      this.moveTowardPath(u, rx, ry, dt);
      return true;
    }
    // на месте: отдыхаем, усталость тает
    u.state = 'idle';
    u.restT = (u.restT ?? 0) - dt;
    u.fatigue = Math.max(0, (u.fatigue ?? 0) - dt / this.REST_TIME);
    u.anim += dt * 2.2;                       // фаза качелей/помешивания
    if (Math.random() < dt * 0.5) {
      // над отдыхающими изредка всплывают тёплые искры (уют стойбища)
      this.spark(u.x + rand(-10, 10), u.y - rand(18, 30), u.restKind === 'kazan' ? '#fdba74' : '#fde68a');
    }
    if ((u.restT ?? 0) <= 0) {
      // смена окончена: работник свеж и возвращается к делу
      u.resting = false; u.restT = 0; u.restKind = undefined;
      u.fatigue = 0; u.freshT = this.FRESH_TIME;
      this.restedTotal++;
      this.floater(u.x, u.y - 34, '✨ Отдохнул!', '#86efac', 13);
      const back = u.shiftBack; u.shiftBack = null;
      if (back && back.nodeId >= 0) {
        const n = this.nodes.find(nn => nn.id === back.nodeId && nn.amount > 0);
        if (n) { this.orderGather(u, n.id); return true; }
      }
      u.state = 'idle'; u.idleT = 0;
    }
    return true;
  }

  // ── АЗАН И НАМАЗ ──
  // Азан звучит с минарета Мешіт-медресе три раза в сутки (таң, бесін, ақшам).
  // Пять намазов подряд превращали бы город в непрерывную молитву, поэтому
  // взяты три ключевых времени. При 30-минутных сутках это призыв примерно
  // раз в 7-11 минут — достаточно редко, чтобы не мешать работе.
  mosqueOf(): Bld | null {
    return this.blds.find(b => b.owner === 'player' && b.key === 'mosque' && b.done >= 1) ?? null;
  }
  // может ли житель отвлечься на намаз (воины и пастухи — нет)
  canPray(u: Unit): boolean {
    if (u.owner !== 'player') return false;
    if (u.key !== 'villager' && u.key !== 'trader' && u.key !== 'monk') return false;
    if (u.herder) return false;               // пастух не бросит стадо в степи
    if (u.targetU >= 0 || u.hunt) return false; // отбивается — не до молитвы
    return true;
  }
  updatePrayer(dt: number) {
    // благодать тает
    if (this.berekeT > 0) {
      this.berekeT = Math.max(0, this.berekeT - dt);
      if (this.berekeT === 0) this.berekePower = 0;
    }
    const mosque = this.mosqueOf();
    // новые сутки — расписание намазов сбрасывается
    // Расписание СЛЕДУЕТ за освещением, а не задано числами «на глаз»: ақшам и
    // таң приходятся на середину сумерек (там темнота ровно 0.5 — закат и
    // рассвет), бесін — на полдень. Иначе при смене длины ночи «закатный» намаз
    // снова уехал бы в яркий день, как это было с фазой 0.40 в глухой ночи.
    if (!this.azanPhase.length) {
      const mid = (this.nightHalf + this.duskEdge) / 2;
      this.azanPhase = [0.5 + mid, 0.02, 0.5 - mid];   // таң (рассвет), бесін (полдень), ақшам (закат)
    }
    const ph = this.dayPhase();
    if (mosque && !this.prayT) {
      for (let i = 0; i < this.azanPhase.length; i++) {
        const target = this.azanPhase[i];
        // Окно срабатывания задано в СЕКУНДАХ реального времени, а не в долях
        // суток: доля 0.012 при 240-секундных сутках давала 5.8 с, а при
        // 30-минутных растянулась бы до 43 с. Ширина берётся с запасом на
        // медленный кадр и ускорение игры до 2x, но остаётся точечной.
        const win = 4 / this.DAY_LEN;
        const d = Math.abs(ph - target);
        const near = d < win || d > 1 - win;
        if (!near || this.azanDone.includes(i)) continue;
        // враг у ворот — намаз откладывается: оборона важнее
        if (this.enemyNearHome()) { this.azanDone.push(i); continue; }
        this.callToPrayer(mosque, i);
        break;
      }
    }
    // намаз идёт
    if (this.prayT > 0) {
      this.prayT = Math.max(0, this.prayT - dt);
      if (this.prayT === 0) this.finishPrayer();
    }
  }
  // есть ли враг вблизи ставки (тогда азан пропускаем)
  enemyNearHome(): boolean {
    const tc = this.blds.find(b => b.owner === 'player' && b.key === 'towncenter');
    if (!tc) return false;
    return this.units.some(u => u.owner === 'enemy' && dist2(u.x, u.y, tc.x, tc.y) < 900 * 900);
  }
  callToPrayer(mosque: Bld, idx: number) {
    this.azanDone.push(idx);
    const played = this.sound.azan();
    this.prayT = this.PRAYER_LEN;
    // сзываем мирных жителей к мечети
    let called = 0;
    for (const u of this.units) {
      if (!this.canPray(u)) continue;
      if (u.resting) { u.resting = false; u.restKind = undefined; }  // с алтыбакана — на намаз
      // доярка уходит на намаз — освобождаем загон, иначе он навсегда
      // останется «занят» ушедшей работницей и к нему никто не подойдёт
      if (u.penId != null) {
        const pen = this.blds.find(b => b.id === u.penId);
        if (pen && pen.milkWid === u.id) pen.milkWid = undefined;
        u.penId = undefined;
      }
      u.prayBack = u.nodeId >= 0 ? { nodeId: u.nodeId } : null;
      u.praying = true; u.prayT = 0;
      // рассаживаем рядами перед мечетью (лицом к кибле)
      const row = Math.floor(called / 5), col = called % 5;
      u.tx = mosque.x - 60 + col * 30 + rand(-4, 4);
      u.ty = mosque.y + mosque.size * 0.5 + 28 + row * 26 + rand(-3, 3);
      u.state = 'move'; u.nodeId = -1; u.buildId = -1; u.wkind = undefined;
      called++;
    }
    const names = ['Таң намазы', 'Бесін намазы', 'Ақшам намазы'];
    this.pushBanner(`🕌 Азан — ${names[idx] ?? 'намаз'}`,
      called ? `Жители идут на молитву: ${called}` : 'Мечеть зовёт, но идти некому', 4);
    this.spawnRing(mosque.x, mosque.y, '#5eead4');
    if (!played) this.floater(mosque.x, mosque.y - 60, '🕌 Азан', '#5eead4', 16);
  }
  finishPrayer() {
    const mosque = this.mosqueOf();
    // считаем явку: сколько мирных дошло и молилось
    const flock = this.units.filter(u => u.owner === 'player' && u.praying);
    const total = this.units.filter(u => this.canPray(u)).length + flock.length;
    const arrived = flock.filter(u => (u.prayT ?? 0) > 0).length;
    // сила благодати зависит от доли пришедших: полная явка — полный бонус
    this.berekePower = total > 0 ? clamp(arrived / Math.max(1, total * 0.6), 0.25, 1) : 0;
    this.berekeT = this.BEREKE_LEN;
    this.prayerCount++;
    for (const u of flock) {
      u.praying = false; u.prayT = 0;
      const back = u.prayBack; u.prayBack = null;
      if (back && back.nodeId >= 0) {
        const n = this.nodes.find(nn => nn.id === back.nodeId && nn.amount > 0);
        if (n) { this.orderGather(u, n.id); continue; }
      }
      u.state = 'idle'; u.idleT = 0;
    }
    if (arrived > 0) {
      this.score += 60;
      this.morale = Math.min(1.5, this.morale + 0.1 * this.berekePower);
      // Соблюдение намаза замечают единоверцы: каждый пятый намаз при полной
      // явке приносит по посланнику к знакомым мусульманским народам.
      if (this.berekePower >= 0.9 && this.prayerCount % 5 === 0) {
        const friends = ['khwarezm', 'kokand', 'bukhara'].filter(nid => this.tribeMet[nid] && this.tribeRel[nid] !== 'hostile');
        for (const nid of friends) this.envoys[nid] = (this.envoys[nid] ?? 0) + 1;
        if (friends.length) this.pushBanner('🕌 Слава благочестия', `Единоверцы шлют посланников: ${friends.length}`, 3.5);
      }
      if (mosque) this.burst(mosque.x, mosque.y - 20, 18, ['#5eead4', '#a7f3d0', '#fff'], 110, 0.9);
      this.pushBanner('🤲 Береке!', `Намаз совершён (${arrived} чел.) — благодать общины`, 3.2);
    }
    this.pushHud();
  }
  // множитель благодати для добычи (1.0 — нет благодати)
  berekeMult(): number { return this.berekeT > 0 ? 1 + 0.15 * this.berekePower : 1; }

  // тик молящегося: дойти до мечети, отстоять намаз
  updatePraying(u: Unit, dt: number): boolean {
    if (!u.praying) return false;
    if (this.prayT <= 0) { u.praying = false; u.prayT = 0; return false; }
    if (dist2(u.x, u.y, u.tx, u.ty) > 26 * 26) {
      u.wkind = undefined;
      this.moveTowardPath(u, u.tx, u.ty, dt);
      return true;
    }
    // на месте: молимся лицом к мечети
    u.state = 'idle';
    u.prayT = (u.prayT ?? 0) + dt;
    const m = this.mosqueOf();
    if (m) u.face = m.x >= u.x ? 1 : -1;
    u.anim += dt * 1.1;
    if (Math.random() < dt * 0.35) this.spark(u.x + rand(-8, 8), u.y - rand(16, 26), '#5eead4');
    return true;
  }

  // общий тик смен: копим усталость, отправляем вымотанных отдыхать посменно
  updateShifts(dt: number) {
    // бодрость тает у всех
    for (const u of this.units) {
      if (u.owner !== 'player' || u.key !== 'villager') continue;
      if ((u.freshT ?? 0) > 0) u.freshT = Math.max(0, (u.freshT ?? 0) - dt);
      // усталость копится только за настоящей работой
      const working = !u.resting && (u.state === 'gather' || u.state === 'return' || u.state === 'build');
      if (working) u.fatigue = Math.min(1, (u.fatigue ?? 0) + dt * this.TIRE_RATE * (this.isNight() ? 1.6 : 1));
    }
    // раз в 2 с решаем, кого отпустить на отдых
    this.restCycleT += dt;
    if (this.restCycleT < 2) return;
    this.restCycleT = 0;
    const vills = this.units.filter(u => u.owner === 'player' && u.key === 'villager');
    if (vills.length < 2) return;              // единственного работника не отпускаем
    const resting = vills.filter(u => u.resting).length;
    // ПОСМЕННОСТЬ: одновременно отдыхает не больше трети артели —
    // иначе добыча встанет колом, и «выходные» будут наказанием, а не бонусом
    const cap = Math.max(1, Math.floor(vills.length / 3));
    if (resting >= cap) return;
    // ночью отпускаем охотнее: порог усталости ниже
    const need = this.isNight() ? 0.55 : 0.8;
    const tired = vills
      .filter(u => !u.resting && !u.herder && (u.fatigue ?? 0) >= need && (u.freshT ?? 0) <= 0)
      .sort((a, b) => (b.fatigue ?? 0) - (a.fatigue ?? 0));
    for (const u of tired.slice(0, cap - resting)) this.sendToRest(u);
  }
  // итоговая цена постройки с учётом союза с ремесленниками (скидка на дерево)
  bldCost(key: BuildingKey): { wood: number; food: number; gold: number } {
    const c = BUILDING_DEFS[key].cost;
    const d = this.woodDiscount();
    return { wood: Math.round(c.wood * d), food: c.food, gold: c.gold };
  }
  // прибавка еды от аграрных союзников (пашни/дойка): +15% / +35%
  farmMult(): number {
    let m = 1;
    if (this.bonusTier('farm', 3)) m = 1.35;
    else if (this.bonusTier('farm', 1)) m = 1.15;
    if (this.droughtT > 0) m *= 0.55;   // засуха: пашни родят скудно
    return m;
  }
  // скидка на дерево от ремесленных союзников (10% / 20%)
  woodDiscount(): number {
    if (this.bonusTier('craft', 2)) return 0.8;
    if (this.bonusTier('craft', 1)) return 0.9;
    return 1;
  }
  // ускорение исследований от научных союзников (10% / 25%)
  researchMult(): number {
    if (this.bonusTier('science', 2)) return 1.25;
    if (this.bonusTier('science', 1)) return 1.1;
    return 1;
  }
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
    if (!crew.length) { this.floater(b.x, b.y - 60, 'Нет свободных шаруа', '#f87171', 14); this.sound.error(); return; }
    for (const v of crew) { v.state = 'build'; v.buildId = b.id; v.tx = b.x + rand(-50, 50); v.ty = b.y + rand(-46, 46); }
    this.sound.move(); this.sound.playPhrase('за работу');
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
  // боевой юнит: не рабочий, не торговец, не зверь (торговец/скот не должны попадать
  // в «войска» — иначе караван уходит в атаку по приказу армии и считается силой)
  combatUnit(u: Unit): boolean {
    return u.key !== 'villager' && u.key !== 'trader' && u.key !== 'wolf'
      && u.key !== 'sheep' && u.key !== 'cow' && u.key !== 'deer';
  }
  tradeRate(): number {
    let r = this.hasTech('coinage') ? 60 : 100;
    if (this.bonusTier('trade', 2)) r = Math.round(r * 0.85); // торговые союзники — выгоднее обмен
    return r;
  } // сколько ресурса за 10 золота
  trade(from: 'wood' | 'food'): boolean {
    if (!this.marketCount()) { this.floater(this.cam.x, this.cam.y - 100, 'Нужен: Базар!', '#f87171', 16); this.sound.error(); return false; }
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

  // ── снести своё строение (возврат части ресурсов; ГЦ снести нельзя) ──
  demolish(buildId: number) {
    const b = this.blds.find(bl => bl.id === buildId);
    if (!b || b.owner !== 'player') return;
    if (b.key === 'towncenter') { this.floater(b.x, b.y - 50, 'Ханскую ставку снести нельзя', '#f87171', 15); this.sound.error(); return; }
    // выпустить гарнизон и освободить строителей до удаления
    this.ungarrisonUnits(buildId, false);
    const c = BUILDING_DEFS[b.key].cost;
    this.res.wood += Math.floor(c.wood * 0.5);
    this.res.food += Math.floor(c.food * 0.3);
    this.res.gold += Math.floor(c.gold * 0.5);
    const bx = b.x, by = b.y;
    this.burst(bx, by - 18, 30, ['#a8a29e', '#78716c', '#d6d3d1', '#57534e'], 170, 1.0);
    this.burst(bx, by, 14, ['#d6a45c', '#8b5e2e'], 120, 0.8);
    this.sound.boom();
    this.trauma = Math.min(1, this.trauma + 0.1);
    this.floater(bx, by - 54, '🔨 Снесено', '#fca5a5', 15);
    this.blds = this.blds.filter(x => x.id !== buildId);
    if (this.selBld === buildId) this.selBld = -1;
    for (const u of this.units) if (u.buildId === buildId) { u.buildId = -1; if (u.state === 'build') u.state = 'idle'; }
    this.pushHud();
  }

  // ── заменить готовый участок стены на ворота (с сохранением оси) ──
  buildGateOnWall(buildId: number): boolean {
    const wall = this.blds.find(b => b.id === buildId);
    if (!wall || wall.owner !== 'player' || wall.key !== 'wall') return false;
    const cost = BUILDING_DEFS.gate.cost;
    if (!this.afford(cost)) { this.floater(wall.x, wall.y - 50, 'Не хватает дерева на ворота!', '#f87171', 15); this.sound.error(); return false; }
    this.pay(cost);
    const wx = wall.x, wy = wall.y, axis = wall.axis, done = wall.done;
    // освободить строителей старого сегмента
    for (const u of this.units) if (u.buildId === wall.id) { u.buildId = -1; if (u.state === 'build') u.state = 'idle'; }
    this.blds = this.blds.filter(b => b.id !== wall.id);
    const gate = this.addBld('gate', 'player', wx, wy, Math.max(0.15, done));
    gate.axis = axis; gate.gate = true;
    // достраивается на чуть дольше, но сразу проходима для своих
    gate.buildT = 0;
    this.burst(gate.x, gate.y, 24, ['#d6a45c', '#8b5e2e', '#f6d47c'], 120);
    this.sound.place();
    this.floater(gate.x, gate.y - 50, '🚪 Ворота поставлены', '#f6d47c', 15);
    this.selBld = gate.id;
    this.pushHud();
    return true;
  }

  placementValid(x: number, y: number, key: BuildingKey): boolean {
    const isWallLike = key === 'wall' || key === 'gate';
    // привязка к сетке: стены — к шагу кладки, здания — к центру гекса
    if (isWallLike) { x = Math.round(x / TILE_STEP) * TILE_STEP; y = Math.round(y / TILE_STEP) * TILE_STEP; }
    else { const sx = snapToHexWorld(x, y); x = sx[0]; y = sx[1]; }
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
    // террейн: ни на горах, ни на воде (фундамент по сетке точек вокруг центра)
    for (let ox = -s; ox <= s; ox += 22) for (let oy = -s; oy <= s; oy += 22) {
      const tc = this.terrain.classAt(x + ox, y + oy);
      if (tc === 'mountain' || tc === 'water' || tc === 'deep') return false;
    }
    return true;
  }

  // выровненная к клеткам точка для протяжки стен
  snapWall(x: number, y: number): [number, number] {
    return [Math.round(x / TILE_STEP) * TILE_STEP, Math.round(y / TILE_STEP) * TILE_STEP];
  }

  // привязка точки постройки: стены — к шагу TILE_STEP (кладка вдоль оси), здания —
  // к ЦЕНТРУ ближайшего гекса (мультисоты; всё садится на гексагональную сетку).
  snapBuild(key: BuildingKey, x: number, y: number): [number, number] {
    if (key === 'wall' || key === 'gate') return this.snapWall(x, y);
    return snapToHexWorld(x, y);
  }
  // сколько колец гексов (радиус в сотах) занимает фундамент здания по его размеру
  buildingHexRing(size: number): number {
    // дистанция между центрами соседних гексов ~30 (wx-шаг); крупные здания — несколько сот
    if (size >= 110) return 2;  // ГЦ/чудо — заметный фундамент
    if (size >= 86) return 1;   // казармы/конюшня/башня
    return 1;                   // дома/фермы/рынок — одна сота (с запасом по краю)
  }
  tryPlace(x: number, y: number) {
    const key = this.placement; if (!key) return;
    [x, y] = this.snapBuild(key, x, y);
    if (!this.placementValid(x, y, key)) { this.sound.error(); this.trauma = Math.min(1, this.trauma + 0.08); return; }
    const c = this.bldCost(key);
    if (!this.afford(c)) { this.sound.error(); return; }
    this.pay(c);
    const b = this.addBld(key, 'player', x, y, 0.15);
    if (key === 'wall' || key === 'gate') b.axis = this.wallAxisAt(x, y, key);
    b.buildT = 0;
    this.builtCount++;
    this.sound.place();
    this.burst(x, y, 22, ['#d6a45c', '#8b5e2e', '#f6d47c'], 120);
    this.floater(x, y - 50, `${BUILDING_DEFS[key].name}: фундамент заложен!`, '#f6d47c', 16);
    // ОЧЕРЕДЬ ПОСТРОЕК (Shift+клик): второй и последующие фундаменты уходят
    // в личную очередь ТОГО ЖЕ шаруа, что взялся за первый. Иначе Shift просто
    // отвлекал на каждый дом нового рабочего, и очереди как таковой не было.
    const chain = this.keys.has('shift') ? this.units.find(u =>
      u.owner === 'player' && u.key === 'villager' &&
      (u.state === 'build' || (u.buildQueue && u.buildQueue.length))) : undefined;
    if (chain) {
      (chain.buildQueue ??= []).push(b.id);
      const n = (chain.buildQueue.length) + 1;
      this.floater(x, y - 28, `в очередь (${n})`, '#7dd3fc', 13);
      if (chain.state !== 'build') this.nextQueuedBuild(chain);
      if (key === 'barracks') { this.barracksBuilt++; this.checkQuests(); }
      this.pushHud();
      return;
    }
    // auto-send nearest idle-ish villager
    let best: Unit | null = null; let bd = 700 * 700;
    for (const u of this.units) {
      if (u.owner !== 'player' || u.key !== 'villager') continue;
      if (u.state === 'gather' || u.state === 'return') continue;
      const d = dist2(u.x, u.y, x, y);
      if (d < bd) { bd = d; best = u; }
    }
    if (!best) { let bd2 = 1e12; for (const u of this.units) { if (u.owner !== 'player' || u.key !== 'villager') continue; const d = dist2(u.x, u.y, x, y); if (d < bd2) { bd2 = d; best = u; } } }
    if (best) { best.state = 'build'; best.buildId = b.id; best.tx = x + rand(-50, 50); best.ty = y + rand(-46, 46); this.sound.playPhrase('за работу'); }
    if (key === 'barracks') { this.barracksBuilt++; this.checkQuests(); }
    if (!this.keys.has('shift')) this.placement = null;
    this.pushHud();
  }

  // Очередь построек (Shift+клик). Берём следующий незавершённый фундамент
  // из личной очереди шаруа; пропускаем снесённые и уже достроенные.
  nextQueuedBuild(u: Unit): boolean {
    const q = u.buildQueue;
    if (!q || !q.length) return false;
    while (q.length) {
      const id = q.shift() as number;
      const b = this.blds.find(bb => bb.id === id);
      if (!b || b.done >= 1 || b.owner !== 'player') continue;
      u.state = 'build'; u.buildId = b.id; u.wkind = undefined;
      u.tx = b.x + rand(-50, 50); u.ty = b.y + rand(-46, 46);
      return true;
    }
    u.buildQueue = undefined;
    return false;
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
      1: 'Войско крепче! Открыты: башни 🗼 и конюшня 🐴 (батыры/жасауылы)',
      2: 'Армия сильнее! Открыты: кузница 🔨 и катапульты 🪨',
      3: 'Мощь ханства! Открыт Мавзолей хана ⭐ — постройте его для победы',
    };
    this.pushBanner(`${next.icon} ${next.name}!`, ageNews[this.age] || 'Армия сильнее, укрепления крепче', 4);
    this.burst(HOME.x, HOME.y, 40, ['#f6d47c', '#fff'], 160);
    this.checkQuests();
    this.pushHud();
  }

  // ---------- selection helpers ----------
  selUnits(): Unit[] {
    const out: Unit[] = [];
    for (const id of this.selected) { const u = this.units.find(u => u.id === id); if (u) out.push(u); }
    return out;
  }
  clearSel() { this.selected.clear(); this.selBld = -1; this.selNode = -1; }
  armySelect() { this.clearSel(); for (const u of this.units) if (u.owner === 'player' && this.combatUnit(u)) this.selected.add(u.id); this.sound.ack('soldier'); this.voiceSel('select'); this.pushHud(); }
  villsSelect() { this.clearSel(); for (const u of this.units) if (u.owner === 'player' && u.key === 'villager') this.selected.add(u.id); this.sound.ack('villager'); this.voiceSel('select'); this.pushHud(); }
  idleSelect() {
    this.clearSel();
    for (const u of this.units) if (u.owner === 'player' && u.key === 'villager' && !u.resting && (u.state === 'idle' || u.state === 'move')) this.selected.add(u.id);
    const us = this.selUnits();
    if (us.length) { this.centerOn(us[0].x, us[0].y); this.sound.ack('villager'); }
    this.pushHud();
  }
  workIdle() {
    let n = 0;
    for (const u of this.units) {
      if (u.owner !== 'player' || u.key !== 'villager') continue;
      if (u.resting) continue;                 // отдыхающих не трогаем: они в смене
      if (u.praying) continue;                 // с намаза кнопкой «Простой» не срываем
      if (u.state !== 'idle' && u.state !== 'move') continue;
      const nd = this.nearestNode(u.x, u.y, n % 3 === 0 ? 'wood' : n % 3 === 1 ? 'food' : 'gold');
      if (nd) { this.orderGather(u, nd.id); n++; }
    }
    if (n) { this.sound.move(); this.voiceSel('gather'); this.floater(this.cam.x, this.cam.y - 80, `${n} шаруа отправлено на работу!`, '#a3e635', 17); }
    this.pushHud();
  }
  nearestNode(x: number, y: number, kind: 'wood' | 'food' | 'gold' | 'fish'): Node | null {
    let best: Node | null = null; let bd = 1e12;
    for (const n of this.nodes) { if (n.kind !== kind || n.amount <= 0) continue; const d = dist2(x, y, n.x, n.y); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  centerTC() { const tc = this.blds.find(b => b.owner === 'player' && b.key === 'towncenter'); if (tc) this.centerOn(tc.x, tc.y); }
  // авто-следование камеры за центром группы выделенных юнитов
  toggleFollow() {
    const us = this.selUnits().filter(u => u.owner === 'player' && !u.hidden);
    if (!us.length) { this.camFollow = false; this.floater(this.cam.x, this.cam.y - 80, 'Нет выделенных юнитов', '#94a3b8', 13); this.pushHud(); return; }
    this.camFollow = !this.camFollow;
    if (this.camFollow) { const x = us.reduce((s, u) => s + u.x, 0) / us.length, y = us.reduce((s, u) => s + u.y, 0) / us.length; this.centerOn(x, y); }
    this.pushHud();
  }
  followTick() {
    if (!this.camFollow) return;
    const us = this.selUnits().filter(u => u.owner === 'player' && !u.hidden);
    if (!us.length) { this.camFollow = false; return; }
    const x = us.reduce((s, u) => s + u.x, 0) / us.length, y = us.reduce((s, u) => s + u.y, 0) / us.length;
    // плавное следование (без жёсткого снапа), ручное движение камеры отключает режим
    this.cam.x += (x - this.cam.x) * 0.12;
    this.cam.y += (y - this.cam.y) * 0.12;
    this.clampCam();
  }
  // камера к центру группы выделенных юнитов (кнопка «к выделению»)
  focusSelection() {
    const us = this.selUnits();
    if (!us.length) { this.floater(this.cam.x, this.cam.y - 80, 'Никого не выбрано', '#94a3b8', 13); return; }
    let x = 0, y = 0;
    for (const u of us) { x += u.x; y += u.y; }
    this.centerOn(x / us.length, y / us.length);
    this.sound.select();
  }

  // циклический прыжок по свободным крестьянам (как клавиша «.» в AoE)
  jumpToIdleVillager() {
    const vills = this.units.filter(u => u.owner === 'player' && u.key === 'villager' && (u.state === 'idle' || u.state === 'move'));
    if (!vills.length) { this.floater(this.cam.x, this.cam.y - 80, 'Все шаруа заняты', '#94a3b8', 13); return; }
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
    // ФИКС: сдача идёт в казну ВЛАДЕЛЬЦА. Раньше добыча вражеских шаруа капала игроку
    // (updateVillager крутится для обеих сторон, а deposit писал только в this.res).
    const bank = v.owner === 'enemy' ? this.eres : this.res;
    if (v.carry.type === 'wood') bank.wood += amt;
    else if (v.carry.type === 'food') bank.food += amt;
    else bank.gold += amt;
    if (v.owner === 'player') {
      if (v.carry.type === 'wood') this.woodGathered += amt;
      this.gatheredTotal += amt;
      this.score += amt * 0.35;
      const cols: Record<string, string> = { wood: '#d6a45c', food: '#fda4af', gold: '#fde047' };
      const icons: Record<string, string> = { wood: '🪵', food: '🍖', gold: '🪙' };
      this.floater(v.x, v.y - 26, `+${amt} ${icons[v.carry.type]}`, cols[v.carry.type], 14);
      if (Math.random() < 0.4) { if (v.carry.type === 'gold') this.sound.coin(); }
    }
    v.carry.amt = 0;
    if (v.owner === 'player') this.checkQuests();
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
    q('age', this.age >= 1, () => { this.res.wood += 120; }, '+120 🪵 — мощь Века жузов!');
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
    if (mx || my) { const l = Math.hypot(mx, my); this.cam.x += (mx / l) * spd * dt; this.cam.y += (my / l) * spd * dt; this.clampCam(); this.camFollow = false; }
    // Автопрокрутки по краю экрана НЕТ (убрана намеренно: камера уезжала сама,
    // когда курсор просто проходил мимо края). Вместо неё — стрелки у краёв:
    // подводим курсор → появляется стрелка → ПРОКРУТКА ТОЛЬКО ПО КЛИКУ.
    // См. edgeArrowAt() / nudgeCam() и отрисовку в drawEdgeArrows().
    this.updateEdgeArrows();
    this.updateHoverHex();
    this.syncCursor();
    if (this.hexPing.t > 0) this.hexPing.t = Math.max(0, this.hexPing.t - dt);
    // плавный докат после клика по стрелке
    if (this.edgeGlide.t > 0) {
      const k = Math.min(dt, this.edgeGlide.t);
      this.cam.x += this.edgeGlide.dx * k / EDGE_GLIDE_T;
      this.cam.y += this.edgeGlide.dy * k / EDGE_GLIDE_T;
      this.edgeGlide.t -= dt;
      this.clampCam(); this.camFollow = false;
    }
    // авто-следование за выделением (плавно); ручное движение/скролл его отключают
    this.followTick();

    this.updateUnits(dt);
    this.updateBuildings(dt);
    if (this.alert) { this.alert.t += dt; if (this.alert.t > 20) this.alert = null; } // маркер тревоги гаснет
    // ── СУТКИ: фаза времени и посменная работа ──
    this.dayT += dt;
    if (this.dayT >= this.DAY_LEN) {
      this.dayT -= this.DAY_LEN; this.dayNum++;
      this.azanDone = [];          // новые сутки — намазы звучат заново
      this.pushBanner(`🌅 День ${this.dayNum}`, 'Новый день над степью', 2.4);
    }
    this.updatePrayer(dt);         // азан с минарета и намаз
    this.updateShifts(dt);         // усталость, смены, отдых у юрт
    this.updateEvents(dt);         // случайные события степи
    this.updateEnvoyAI(dt);        // джунгары конкурируют за племена
    this.updateTribeBonuses(dt);   // дары военных союзников, доход торговых
    this.updateFog(dt);
    this.updateProjs(dt);
    // бесконечный мир: догенерировать чанки вокруг камеры при разведке
    this.chunkT -= dt;
    if (this.chunkT <= 0) {
      this.chunkT = 0.4;
      this.ensureChunks(this.cam.x, this.cam.y, 2);
    }
    // статистика матча
    const pop = this.popUsed('player');
    const army = this.units.filter(u => u.owner === 'player' && this.combatUnit(u)).length;
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
    // знакомства с народами (Civilization-стиль): контакт открывает правителя
    this.updateContacts(dt);

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
          'Выберите сарбазов → ПКМ по волкам для охоты (+🍖 +очки)',
          'Шаруа: ПКМ по дереву / ягодам / золоту — добыча',
          'Клавиши 2-8 — войско • Q юрта • E казармы • Z конюшня • X кузница • C базар',
          'Стройте пашни (F) — бесконечная еда • Башни (R) — оборона',
          'Кузница строит катапульты (7) • Мешіт-медресе — имамов-лекарей (8)!',
          'Жмите T для перехода в новую эпоху, когда хватает ресурсов!',
        ];
        this.hint = hints[((this.time / 6) | 0) % hints.length];
      }
    }
  }

  // Далёкие нейтральные племена/звери «спят»: вне зоны камеры и боя их O(n²) логика
  // (поиск врагов, сепарация, стрельба башен) не выполняется — иначе на огромной карте
  // с множеством лагерей FPS падает. Просыпаются, когда рядом камера ИЛИ свои/вражеские
  // юниты/здания (бой на их территории идёт как обычно).
  private activeZone(wx: number, wy: number, rad = 2200): boolean {
    const rc = rad * 1.7;
    const ddx = this.cam.x - wx, ddy = this.cam.y - wy;
    if (ddx * ddx + ddy * ddy < rc * rc) return true; // рядом с камерой
    const r2 = rad * rad;
    for (const u of this.units) { if (u.owner === 'neutral') continue; const dx = u.x - wx, dy = u.y - wy; if (dx * dx + dy * dy < r2) return true; }
    for (const b of this.blds) { if (b.owner === 'neutral') continue; const dx = b.x - wx, dy = b.y - wy; if (dx * dx + dy * dy < r2) return true; }
    return false;
  }

  updateUnits(dt: number) {
    const us = this.units;
    // кто из юнитов «бодрствует» в этом кадре (нейтралы далеко — спят)
    const wake = new Array<boolean>(us.length);
    for (let i = 0; i < us.length; i++) wake[i] = us[i].owner !== 'neutral' || this.activeZone(us[i].x, us[i].y);
    // separation (cheap grid-less, n small)
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      for (let j = i + 1; j < us.length; j++) {
        if (!wake[i] && !wake[j]) continue; // спящие друг на друга не давят
        const b = us[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx > 26 || dx < -26 || dy > 26 || dy < -26) continue; // грубый отсев по осям
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
      // спящий нейтрал далеко — пропускаем его апдейт и коллизии целиком
      if (!wake[i]) { (u as Unit & { walk?: boolean }).walk = false; continue; }
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
      // воины нейтрального племени дерутся как солдаты (пассивны до провокации);
      // волки охотятся, скот пасётся — это отдельная звериная логика
      if (u.owner === 'neutral' && !u.tribe) {
        const w0 = u.x, z0 = u.y;
        if (u.key === 'wolf') this.updateWolf(u, dt); else this.updateAnimal(u, dt);
        const moved = Math.hypot(u.x - w0, u.y - z0) > 1.5;
        (u as Unit & { walk?: boolean }).walk = moved;
        // изо-направление зверя: волк галопом, скот (овцы/коровы/олени) шагает —
        // у всех теперь есть кадры «сбоку / спереди / со спины»
        if (moved && (u.key === 'wolf' || u.key === 'sheep' || u.key === 'cow' || u.key === 'deer')) {
          const sxv = (u.x - w0) - (u.y - z0), syv = ((u.x - w0) + (u.y - z0)) * 0.5;
          u.mvx = (u.mvx ?? sxv) * 0.6 + sxv * 0.4;
          u.mvy = (u.mvy ?? syv) * 0.6 + syv * 0.4;
          if (Math.abs(u.mvy) > Math.abs(u.mvx) * 1.05 && Math.abs(u.mvy) > 0.4) {
            u.fmode = u.mvy > 0 ? 1 : 2;  // на камеру — морда, от камеры — круп
          } else {
            u.fmode = 0;                  // вбок — боковой шаг
          }
        }
        u.anim += dt * (moved ? 12 : 2);
        continue;
      }
      if (u.owner === 'neutral' && u.tribe) this.updateSoldier(u, dt);
      // көпес и имам тоже идут на намаз (шаруа обрабатывается внутри updateVillager)
      else if (u.praying && u.key !== 'villager' && this.updatePraying(u, dt)) { u.anim += dt * 2; }
      else if (u.key === 'villager') this.updateVillager(u, dt);
      else if (u.key === 'trader') this.updateTrader(u, dt);
      else if (u.key === 'scout') this.updateScout(u, dt);
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
      // ── СТОРОЖ ЗАСТРЕВАНИЯ ПАСТУХА ──
      // Замер обязан быть ЗДЕСЬ, после отталкивания от зданий. Внутри herdMove
      // он бесполезен: moveToward честно сдвигает юнита на 3.9 ед., а коллизия
      // со стеной тут же возвращает его назад — смещение «есть», а координата
      // не меняется. Именно так пастух часами тёрся о дуал вокруг базы, и
      // herdStuckT при этом оставался нулём.
      if (u.herder && u.penId != null && u.state === 'gather') {
        // Мерим ПРОГРЕСС ЗА 2 СЕКУНДЫ, а не смещение за кадр. Покадровая проверка
        // бесполезна: юнит, упёршийся в стену, всё время мелко дёргается (в том
        // числе от наших же попыток объехать), счётчик обнуляется и порог
        // никогда не достигается — «дёрг-стоп-дёрг» до бесконечности.
        u.herdProbeT = (u.herdProbeT ?? 0) + dt;
        if (u.herdProbeT >= 2) {
          const adv = Math.hypot(u.x - (u.herdProbeX ?? u.x), u.y - (u.herdProbeY ?? u.y));
          // за 2 с на скорости 175 юнит проходит ~350 ед.; 60 — заведомый затык
          if (adv < 60) u.herdStuckT = (u.herdStuckT ?? 0) + u.herdProbeT;
          else u.herdStuckT = 0;
          u.herdProbeT = 0; u.herdProbeX = u.x; u.herdProbeY = u.y;
        }
      } else if (u.herder) { u.herdStuckT = 0; u.herdProbeT = 0; }
      const walk = distMoved > 1.5;
      (u as Unit & { walk?: boolean }).walk = walk;
      // изо-направление корпуса крестьянина: мир-дельта → экранная дельта (toIso).
      // sx = dwx - dwy (право), sy = (dwx + dwy)/2 (вниз к камере). Вниз по экрану → спереди, вверх → спина.
      if (walk) {
        // мировая дельта шага → изо-экранная (toIso): sx вправо, sy вниз к камере
        const dWx = u.x - px0, dWy = u.y - py0;
        const sxv = dWx - dWy, syv = (dWx + dWy) * 0.5;
        // сглаживаем вектор, чтобы режим не «дёргался» на диагоналях
        u.mvx = (u.mvx ?? sxv) * 0.6 + sxv * 0.4;
        u.mvy = (u.mvy ?? syv) * 0.6 + syv * 0.4;
        if (Math.abs(u.mvy) > Math.abs(u.mvx) * 1.05 && Math.abs(u.mvy) > 0.4) {
          u.fmode = u.mvy > 0 ? 1 : 2;  // вниз к камере — спереди; вверх от камеры — спина
        } else {
          u.fmode = 0;                  // преимущественно вбок — боковой вид (отражается по face)
        }
      }
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

  // горы непроходимы (огромные пики — не просто рельеф); вода мелкая проходима
  terrainBlocked(wx: number, wy: number): boolean {
    return this.terrain.classAt(wx, wy) === 'mountain';
  }

  moveToward(u: Unit, tx: number, ty: number, dt: number, arrive = 6): boolean {
    const dx = tx - u.x, dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < arrive) return true;
    // в воде идём медленнее (глубокая — вброд/вплавь); горы непроходимы
    const midC = this.terrain.classAt((u.x + tx) / 2, (u.y + ty) / 2);
    const wade = midC === 'deep' ? 0.55 : midC === 'water' ? 0.75 : 1;
    const s = Math.min(u.speed * wade * dt, d);
    const nx = u.x + (dx / d) * s, ny = u.y + (dy / d) * s;
    // горы непроходимы: пробуем скольжение вдоль преграды (по одной оси), иначе стоим
    if (!this.terrainBlocked(nx, ny)) { u.x = nx; u.y = ny; }
    else if (!this.terrainBlocked(nx, u.y)) u.x = nx;
    else if (!this.terrainBlocked(u.x, ny)) u.y = ny;
    if (Math.abs(dx) > 4) u.face = dx > 0 ? 1 : -1;
    return false;
  }

  // ── ОБХОД ПРЕПЯТСТВИЙ: A* по сетке с последующим движением по waypoint'ам ──
  // Препятствия — стены/ворота (для непроходящих) и готовые здания; ресурсы/террейн
  // не блокируют. Ворота проходящего владельца свободны. Возвращает мировые точки
  // маршрута (без старта) или null, если в локальной области пути нет.
  private computePath(sx: number, sy: number, gx: number, gy: number, owner: Unit['owner']): { x: number; y: number }[] | null {
    const CELL = 26, PAD = 9;
    const minX = Math.min(sx, gx) - 120, maxX = Math.max(sx, gx) + 120;
    const minY = Math.min(sy, gy) - 120, maxY = Math.max(sy, gy) + 120;
    const cx0 = Math.floor(minX / CELL) - PAD, cy0 = Math.floor(minY / CELL) - PAD;
    const cx1 = Math.ceil(maxX / CELL) + PAD, cy1 = Math.ceil(maxY / CELL) + PAD;
    const W = cx1 - cx0 + 1, H = cy1 - cy0 + 1;
    if (W * H > 26000) return null; // слишком большая область — не считаем (просто прямо)
    const blockWalls: { x: number; y: number; r: number }[] = [];
    const blockBlds: { x: number; y: number; r: number }[] = [];
    for (const b of this.blds) {
      const isWall = b.key === 'wall' || b.key === 'gate';
      // ворота своего владельца — проходной проход; вражеские/нейтральные ворота = стена
      const gatePass = b.key === 'gate' && b.owner === owner;
      const blocking = isWall ? !gatePass : b.done >= 0.6;
      if (!blocking) continue;
      // ВАЖНО: радиус обязан совпадать с физической коллизией из update().
      // Там стена — бокс b.size/2 с отступом 13, то есть эффективно ~28 ед.
      // Пока здесь стояло 15, A* видел «щели» между секциями сплошного дуала,
      // прокладывал маршрут сквозь стену, а юнит упирался в неё телом и стоял.
      const r = isWall ? b.size / 2 + 12 : b.size / 2 + 8;
      (isWall ? blockWalls : blockBlds).push({ x: b.x, y: b.y, r });
    }
    const blocked = (wx: number, wy: number): boolean => {
      for (const o of blockWalls) { const dx = wx - o.x, dy = wy - o.y; if (dx * dx + dy * dy < o.r * o.r) return true; }
      for (const o of blockBlds) { const dx = wx - o.x, dy = wy - o.y; if (Math.abs(dx) < o.r && Math.abs(dy) < o.r) return true; }
      return false;
    };
    const gc = (wx: number, wy: number) => ({ cx: Math.floor(wx / CELL), cy: Math.floor(wy / CELL) });
    const sC = gc(sx, sy), gC = gc(gx, gy);
    const ci = (cx: number, cy: number) => (cy - cy0) * W + (cx - cx0);
    const cellCenter = (cx: number, cy: number): [number, number] => [(cx + 0.5) * CELL, (cy + 0.5) * CELL];
    // не блокируем старт и цель (чтобы юнит у основания здания мог дойти до точки сбора)
    const free = (cx: number, cy: number): boolean => {
      if (cx < cx0 || cx > cx1 || cy < cy0 || cy > cy1) return false;
      const [wx, wy] = cellCenter(cx, cy);
      if (cx === sC.cx && cy === sC.cy) return true; // старт всегда свободен (сдвинет коллизия)
      // цель на горе недостижима — но считаем клетку цельной, чтобы сработал поиск ближайшей
      if (cx === gC.cx && cy === gC.cy) return !this.terrainBlocked(wx, wy) && !blocked(wx, wy);
      return !this.terrainBlocked(wx, wy) && !blocked(wx, wy);
    };
    const startFree = free(sC.cx, sC.cy);
    const goalFree = free(gC.cx, gC.cy);
    if (!startFree || !goalFree) {
      // подобрать ближайшую свободную клетку (BFS по малому радиусу)
      const nearest = (tcx: number, tcy: number): [number, number] | null => {
        for (let rad = 1; rad <= 12; rad++) {
          for (let cy = tcy - rad; cy <= tcy + rad; cy++) for (let cx = tcx - rad; cx <= tcx + rad; cx++) {
            if (Math.max(Math.abs(cx - tcx), Math.abs(cy - tcy)) !== rad) continue;
            if (free(cx, cy)) return [cx, cy];
          }
        }
        return null;
      };
      if (!startFree) { const n = nearest(sC.cx, sC.cy); if (!n) return null; sC.cx = n[0]; sC.cy = n[1]; }
      if (!goalFree) { const n = nearest(gC.cx, gC.cy); if (!n) return null; gC.cx = n[0]; gC.cy = n[1]; }
    }
    // A*
    const came = new Map<number, number>();
    const gScore = new Map<number, number>();
    const h = (cx: number, cy: number) => Math.hypot(cx - gC.cx, cy - gC.cy);
    const sIdx = ci(sC.cx, sC.cy), gIdx = ci(gC.cx, gC.cy);
    gScore.set(sIdx, 0);
    const open: number[] = [sIdx];
    const fScore = new Map<number, number>([[sIdx, h(sC.cx, sC.cy)]]);
    const seen = new Set<number>([sIdx]);
    const N8: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [-1, -1, 1.414]];
    let guard = 6000;
    while (open.length && guard-- > 0) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if ((fScore.get(open[i]) ?? Infinity) < (fScore.get(open[bi]) ?? Infinity)) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === gIdx) {
        // восстановить путь в мировых координатах
        const cells: number[] = [cur];
        let c = cur;
        while (came.has(c)) { c = came.get(c)!; cells.push(c); }
        cells.reverse();
        const path = cells.slice(1).map(idx => {
          const cx = (idx % W) + cx0, cy = Math.floor(idx / W) + cy0;
          const [wx, wy] = cellCenter(cx, cy);
          return { x: wx, y: wy };
        });
        path.push({ x: gx, y: gy }); // финальная точка — точная цель
        return path;
      }
      const ccx = (cur % W) + cx0, ccy = Math.floor(cur / W) + cy0;
      for (const [dx, dy, cost] of N8) {
        const nx = ccx + dx, ny = ccy + dy;
        if (!free(nx, ny)) continue;
        // не режем углы сквозь стены по диагонали
        if (dx !== 0 && dy !== 0 && (!free(ccx + dx, ccy) || !free(ccx, ccy + dy))) continue;
        const nIdx = ci(nx, ny);
        const tg = (gScore.get(cur) ?? Infinity) + cost;
        if (tg < (gScore.get(nIdx) ?? Infinity)) {
          came.set(nIdx, cur); gScore.set(nIdx, tg);
          fScore.set(nIdx, tg + h(nx, ny));
          if (!seen.has(nIdx)) { seen.add(nIdx); open.push(nIdx); }
        }
      }
    }
    return null;
  }

  // движение к цели с автообходом препятствий; возвращает true при прибытии
  moveTowardPath(u: Unit, tx: number, ty: number, dt: number, arrive = 6): boolean {
    const dxg = tx - u.x, dyg = ty - u.y;
    if (Math.hypot(dxg, dyg) < arrive) { u.path = undefined; u.pathGoal = undefined; u.stuckT = 0; return true; }
    // нужен ли путь: прямая линия перекрыта стеной/зданием?
    const lineBlocked = (): boolean => {
      const seg = 8;
      for (let i = 1; i < seg; i++) {
        const wx = u.x + dxg * (i / seg), wy = u.y + dyg * (i / seg);
        if (this.terrainBlocked(wx, wy)) return true; // гора перекрывает прямой путь
        for (const b of this.blds) {
          const isWall = b.key === 'wall' || b.key === 'gate';
          const gatePass = b.key === 'gate' && b.owner === u.owner;
          if (isWall) { if (!gatePass) { const rr = b.size / 2 + 12; const ddx = wx - b.x, ddy = wy - b.y; if (ddx * ddx + ddy * ddy < rr * rr) return true; } }
          else if (b.done >= 0.6) { const h2 = b.size / 2 + 4; if (Math.abs(wx - b.x) < h2 && Math.abs(wy - b.y) < h2) return true; }
        }
      }
      return false;
    };
    const goalMoved = !u.pathGoal || Math.hypot(u.pathGoal.x - tx, u.pathGoal.y - ty) > 48;
    if (goalMoved || !u.path) {
      if (!lineBlocked()) { // прямой путь свободен — идём прямо
        u.path = undefined; u.pathGoal = { x: tx, y: ty };
        return this.moveToward(u, tx, ty, dt, arrive);
      }
      // Пере-прокладка A* не чаще раза в ~0.5с — но ЖДАТЬ нельзя: раньше здесь стоял
      // `return false`, и юнит замирал на полсекунды (рабочие «застывали» у ресурса,
      // когда точка сдачи лежит внутри коробки склада и путь не находится). Троттлим
      // только сам расчёт пути, а идти продолжаем напрямую.
      const now = this.time;
      if (u.noPathT && now - u.noPathT < 0.5) return this.moveToward(u, tx, ty, dt, arrive);
      const p = this.computePath(u.x, u.y, tx, ty, u.owner);
      u.pathGoal = { x: tx, y: ty };
      if (p && p.length) { u.path = p; u.noPathT = 0; u.stuckT = 0; }
      else { u.path = undefined; u.noPathT = now; return this.moveToward(u, tx, ty, dt, arrive); } // не нашли — прём прямо
    }
    // идём по первому waypoint'у; пройденные — выкидываем (сразу все достигнутые,
    // не тратя по кадру на каждый — иначе юнит «залипает» на плотной цепочке точек)
    while (u.path.length && Math.hypot(u.path[0].x - u.x, u.path[0].y - u.y) < 8) u.path.shift();
    if (!u.path.length) { u.path = undefined; return this.moveToward(u, tx, ty, dt, arrive); }
    const wp = u.path[0];
    this.moveToward(u, wp.x, wp.y, dt, 6);
    // Детекция застревания (юнит упёрся в гору/здание и не продвигается) — перепроложить.
    // Считаем ВСЕГДА: раньше проверка жила внутри `if (moved)`, поэтому при полностью
    // нулевом смещении (самый частый случай затыка) stuckT не рос и путь не сбрасывался.
    const lm = Math.hypot(u.x - (u.lastX ?? u.x), u.y - (u.lastY ?? u.y));
    u.stuckT = u.stuckT ?? 0;
    if (lm < u.speed * dt * 0.5) u.stuckT += dt; else u.stuckT = Math.max(0, u.stuckT - dt);
    u.lastX = u.x; u.lastY = u.y;
    if (u.stuckT > 0.7) {
      u.stuckT = 0; u.path = undefined; u.pathGoal = undefined; u.noPathT = 0;
      // «отлипание»: маленький шаг вбок от препятствия, чтобы сойти с угла коробки
      const jx = Math.cos(u.id * 2.399) * 9, jy = Math.sin(u.id * 2.399) * 9;
      if (!this.terrainBlocked(u.x + jx, u.y + jy)) { u.x += jx; u.y += jy; }
    }
    return false;
  }

  // крестьянин в бою: преследует и бьёт цель (воин/волк — оборона, дичь — охота по
  // приказу). Возвращает true, пока есть валидная цель и крестьянин занят боем.
  villagerCombat(u: Unit, dt: number): boolean {
    let tu = u.targetU >= 0 ? this.units.find(e => e.id === u.targetU) : undefined;
    // цель валидна, если жива и это враг/волк ИЛИ дичь по явному приказу охоты (u.hunt)
    const valid = (e: Unit): boolean =>
      e.hp > 0 && (this.hostile(u.owner, e.owner) || (e.owner === 'neutral' && !e.tribe && !!u.hunt));
    if (tu && !valid(tu)) { tu = undefined; u.targetU = -1; }
    // явная ли это цель приказа (охота/атака) — тогда преследуем дичь; авто-оборона дичь не трогает
    const isPrey = (e: Unit) => e.owner === 'neutral' && !e.tribe;
    if (!tu) {
      // нет цели: сканируем угрозу в радиусе обороны (волки/воины), дичь не выбираем
      const f = this.acquireEnemy(u, 140);
      if (f.tu >= 0) { const cand = this.units.find(e => e.id === f.tu); if (cand && valid(cand) && !isPrey(cand)) { u.targetU = f.tu; tu = cand; } }
    }
    if (tu) {
      const d = Math.hypot(tu.x - u.x, tu.y - u.y);
      const reach = u.range + 6;
      if (d <= reach) {
        if (Math.abs(tu.x - u.x) > 3) u.face = tu.x > u.x ? 1 : -1;
        if (u.cd <= 0) this.strike(u, tu, undefined);
        u.atkAnim = Math.min(1, u.atkAnim + dt * 6);
      } else {
        // преследуем: врагов/волков — всегда (оборона); дичь — только по приказу (hunt)
        if (isPrey(tu) && !u.hunt) { u.targetU = -1; return false; }
        this.moveTowardPath(u, tu.x, tu.y, dt, reach * 0.7);
        u.wkind = undefined;
      }
      return true;
    }
    return false;
  }

  // ── ПАСТУХ: полцикла на выпас (ищет скот в поле), затем пригоняет его в загон ──
  // найти дальнее ровное пастбище: ≥50 клеток (≈1700 мир.ед.) от базы игрока, ровное поле
  // Пастбище. Если передан пастух (u), выбираем только ДОСТИЖИМОЕ место: иначе
  // при базе, обнесённой дуалом, пастбище оказывается за стеной и пастух вечно
  // трётся о неё. Радиус в этом случае сжимаем, пока не найдём доступную точку.
  private findPasture(pen: Bld, u?: Unit): [number, number] {
    const base = this.blds.find(b => b.owner === 'player' && b.key === 'towncenter');
    const bx = base ? base.x : pen.x, by = base ? base.y : pen.y;
    // Достижимо ли место. Критерий один — A* находит маршрут.
    // Fallback «прямая свободна» здесь был ОШИБКОЙ: он шагает по отрезку редкими
    // точками, проскакивает между секциями дуала и объявляет достижимым место за
    // стеной. Если A* пути не нашёл — значит, пройти нельзя, точка.
    // Слишком далёкие цели (A* сдаётся по размеру области) тоже считаем
    // недостижимыми: лучше пастбище поближе, чем зависший пастух.
    const reachable = (x: number, y: number): boolean => {
      if (!u) return true;
      const p = this.computePath(u.x, u.y, x, y, u.owner);
      return !!(p && p.length);
    };
    const flatOpen = (x: number, y: number): boolean => {
      const c = this.terrain.classAt(x, y);
      if (c === 'water' || c === 'deep' || c === 'mountain' || c === 'forest') return false;
      // ровное: ступень рельефа 0 в нескольких точках вокруг
      const g = this.terrain.reliefGridHex(x - 60, y - 60, x + 60, y + 60);
      for (let ox = -50; ox <= 50; ox += 50) for (let oy = -50; oy <= 50; oy += 50) {
        if (g.hAtWorld(x + ox, y + oy) > 1) return false;
      }
      return true;
    };
    // ищем по кольцам радиуса 1700..2700 (≈50-75 гексов от базы)
    for (let r = 1700; r <= 2700; r += 90) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + pen.id * 1.7 + r * 0.01;
        const x = bx + Math.cos(a) * r, y = by + Math.sin(a) * r;
        if (x < 120 || y < 120 || x > WORLD.w - 120 || y > WORLD.h - 120) continue;
        if (flatOpen(x, y) && reachable(x, y)) return [x, y];
      }
    }
    // Ничего не нашли — база заперта стенами. Поджимаемся ближе кольцами
    // 1400 → 300: пусть пастбище будет маленьким и рядом, но пастух до него дойдёт.
    for (let r = 1400; r >= 300; r -= 100) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + pen.id * 0.9;
        const x = bx + Math.cos(a) * r, y = by + Math.sin(a) * r;
        if (x < 120 || y < 120 || x > WORLD.w - 120 || y > WORLD.h - 120) continue;
        const c = this.terrain.classAt(x, y);
        if (c === 'water' || c === 'deep' || c === 'mountain') continue;
        if (reachable(x, y)) return [x, y];
      }
    }
    // запасной вариант — просто дальняя суша
    return this.landNear(bx + 1800, by + 1200);
  }

  // создать стадо на пастбище: 5 овец + 5 коров; все приписаны к загону penId
  private stockPasture(x: number, y: number, penId: number) {
    for (let i = 0; i < 5; i++) {
      const a = this.addUnit('sheep', 'neutral', x + rand(-70, 70), y + rand(-70, 70));
      a.wx = x; a.wy = y; a.pastureId = penId; // дом-пастбище, принадлежность к загону
    }
    for (let i = 0; i < 5; i++) {
      const a = this.addUnit('cow', 'neutral', x + rand(-70, 70), y + rand(-70, 70));
      a.wx = x; a.wy = y; a.pastureId = penId;
    }
    this.burst(x, y - 20, 16, ['#d1fae5', '#a7f3d0', '#fff'], 130, 0.8);
  }

  private landNear(x: number, y: number): [number, number] {
    if (this.terrain.classAt(x, y) === 'grass' || this.terrain.classAt(x, y) === 'desert') return [x, y];
    for (let r = 40; r <= 400; r += 40) {
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        const tx = x + Math.cos(ang) * r, ty = y + Math.sin(ang) * r;
        const c = this.terrain.classAt(tx, ty);
        if (c !== 'water' && c !== 'deep' && c !== 'mountain') return [tx, ty];
      }
    }
    return [x, y];
  }

  updateShepherd(u: Unit, dt: number) {
    const pen = this.blds.find(b => b.id === u.penId && b.done >= 1);
    if (!pen) { this.releaseShepherd(u); return; }
    // пастбище загона — дальнее ровное поле со стадом (создаётся при назначении)
    if (pen.pastureX == null) { const [px, py] = this.findPasture(pen, u); pen.pastureX = px; pen.pastureY = py; }
    if (!pen.pastureStocked) { this.stockPasture(pen.pastureX!, pen.pastureY!, pen.id); pen.pastureStocked = true; }
    const cx = pen.pastureX!, cy = pen.pastureY!;
    const GRAZE_T = 270;   // выпас на пастбище — 4.5 минуты
    const PEN_R = 95;      // радиус «в загоне»

    // машина состояний цикла
    if (!u.herdState) { u.herdState = 'graze'; u.herdStateT = 0; }
    u.herdStateT = (u.herdStateT ?? 0) + dt;

    // стадо этого загона (приписанные овцы/коровы)
    const herd = this.units.filter(a =>
      a.hp > 0 && (a.key === 'sheep' || a.key === 'cow') && a.pastureId === pen.id);
    const inPen = () => herd.filter(a => dist2(a.x, a.y, pen.x, pen.y) < PEN_R * PEN_R).length;
    const herdCenter = (onlyOutside: boolean) => {
      let hx = 0, hy = 0, n = 0;
      for (const a of herd) {
        if (onlyOutside && dist2(a.x, a.y, pen.x, pen.y) < PEN_R * PEN_R) continue;
        hx += a.x; hy += a.y; n++;
      }
      return n ? { x: hx / n, y: hy / n, n } : null;
    };

    // СТАБИЛЬНЫЕ слоты стада: место каждой головы считается от её индекса в стаде, а НЕ
    // через rand() каждый кадр — иначе цель прыгает 60 раз в секунду и скот «дрожит».
    const slot = (a: Unit) => {
      const k = herd.indexOf(a); const n = Math.max(1, herd.length);
      const ang = (k / n) * Math.PI * 2 + (a.id % 7) * 0.11;
      return { ang, ring: k % 3 };
    };

    if (u.herdState === 'graze') {
      // ── ВЫПАС (4.5 мин): стадо идёт по кругу дугой, разбросано, скот ВПЕРЕДИ ──
      const flockAng = this.time * 0.22;
      for (const a of herd) {
        const spread = (((a.id * 37) % 100) / 100 - 0.5) * 1.9;
        const rad = 85 + ((a.id * 53) % 70);
        const ang = flockAng + spread;
        a.herdX = cx + Math.cos(ang) * rad;
        a.herdY = cy + Math.sin(ang) * rad;
        a.anim += dt * 8;
      }
      // пастух строго ПОЗАДИ фактического центра стада (не обгоняет, всегда рядом)
      const ctr = herdCenter(false);
      if (ctr) {
        const phi = Math.atan2(ctr.y - cy, ctr.x - cx);
        const mvx = -Math.sin(phi), mvy = Math.cos(phi);
        const rx = Math.cos(phi), ry = Math.sin(phi);
        this.herdMove(u, ctr.x - mvx * 60 + rx * 26, ctr.y - mvy * 60 + ry * 26, dt, 18);
      } else {
        // Стада нет (волки задрали или скот ещё не создан) — раньше здесь не было
        // ветки else, и пастух ЗАМИРАЛ у базы навсегда: цели для движения не было.
        // Едем на пастбище сами; если и там пусто — восполняем стадо.
        this.herdMove(u, cx, cy, dt, 40);
        if (dist2(u.x, u.y, cx, cy) < 260 * 260 && !herd.length) {
          this.stockPasture(cx, cy, pen.id);
          this.floater(cx, cy - 40, '🐑 Новое стадо', '#a3e635', 14);
        }
      }
      if (u.herdStateT >= GRAZE_T) { u.herdState = 'home'; u.herdStateT = 0; this.pushBanner('🐎 Перегон', 'Пастух гонит стадо с пастбища в загон', 3); }
    }
    else if (u.herdState === 'home') {
      // ── ПЕРЕГОН: скот бежит к загону, пастух гонит с тыла; ждём, пока стадо дойдёт ──
      for (const a of herd) {
        if (dist2(a.x, a.y, pen.x, pen.y) < PEN_R * PEN_R) continue; // уже в загоне
        // фиксированное место в загоне (по слоту), а не новая случайная точка каждый кадр
        const s = slot(a);
        a.herdX = pen.x + Math.cos(s.ang) * (16 + s.ring * 9);
        a.herdY = pen.y + Math.sin(s.ang) * (12 + s.ring * 7);
        a.anim += dt * 9;
      }
      const out = herdCenter(true);
      if (out) {
        // пастух со стороны поля (противоположной загону), толкает стадо к нему
        const ddx = pen.x - out.x, ddy = pen.y - out.y, dd = Math.max(1, Math.hypot(ddx, ddy));
        this.herdMove(u, out.x - (ddx / dd) * 80, out.y - (ddy / dd) * 80, dt, 22);
      } else {
        this.herdMove(u, pen.x + 70, pen.y + 50, dt, 26);
      }
      // стадо дошло (≥80% в загоне) или таймаут 150с — переходим к постое
      if (inPen() >= Math.ceil(herd.length * 0.8) || u.herdStateT > 150) { u.herdState = 'pen'; u.herdStateT = 0; u.gatherT = 0; }
    }
    else if (u.herdState === 'pen') {
      // ── ПОСТОЙ В ЗАГОНЕ (25с): стадо внутри, еда капает ──
      // Скот СТОИТ на своих местах в загоне. Точка слота стабильна во времени, лишь очень
      // медленно дышит (период ~14с, амплитуда ~5 ед.) — стадо выглядит живым, но не дрожит.
      for (const a of herd) {
        const s = slot(a);
        const br = Math.sin(this.time * 0.45 + a.id * 1.7) * 5;
        a.herdX = pen.x + Math.cos(s.ang) * (18 + s.ring * 10 + br);
        a.herdY = pen.y + Math.sin(s.ang) * (13 + s.ring * 8 + br * 0.7);
        a.anim += dt * 1.6;
      }
      this.herdMove(u, pen.x + 70, pen.y + 50, dt, 26);
      const n = inPen();
      if (n > 0) {
        u.gatherT += dt;
        const cyc = 2.0 / this.gatherMult();
        if (u.gatherT >= cyc) {
          u.gatherT = 0;
          const gain = Math.round((2 + n) * this.gatherMult());
          this.res.food += gain; this.gatheredTotal += gain; this.score += gain * 0.3;
          if (Math.random() < 0.6) this.burst(pen.x, pen.y - 10, 3, ['#fda4af', '#fb7185', '#fff'], 70, 0.5);
          if (Math.random() < 0.35) this.sound.gatherFood();
          this.checkQuests();
        }
      }
      if (u.herdStateT >= 210) { u.herdState = 'back'; u.herdStateT = 0; } // ~3.5 мин дойка/постой
    }
    else { // 'back': стадо возвращается на пастбище, пастух гонит за ним
      for (const a of herd) {
        if (dist2(a.x, a.y, cx, cy) < 220 * 220) continue;
        const s = slot(a);
        a.herdX = cx + Math.cos(s.ang) * (60 + s.ring * 26);
        a.herdY = cy + Math.sin(s.ang) * (60 + s.ring * 26);
        a.anim += dt * 9;
      }
      const ctr = herdCenter(false);
      if (ctr) {
        // пастух позади стада на пути к пастбищу
        const ddx = cx - ctr.x, ddy = cy - ctr.y, dd = Math.max(1, Math.hypot(ddx, ddy));
        this.herdMove(u, ctr.x - (ddx / dd) * 70, ctr.y - (ddy / dd) * 70, dt, 22);
      } else {
        this.herdMove(u, cx, cy, dt, 40);      // стада нет — возвращаемся сами
      }
      if (u.herdStateT > 120) { u.herdState = 'graze'; u.herdStateT = 0; }
    }
  }

  // ── ДВИЖЕНИЕ ПАСТУХА ────────────────────────────────────────────────────────
  // Весь цикл выпаса раньше ходил через moveToward — движение строго по прямой.
  // Упёршись в гору или угол здания, оно скользит только по одной оси и, если
  // перекрыты обе, молча стоит на месте. Отсюда и был «пастух завис у базы».
  // Здесь: обход препятствий через A*, плюс сторож — если пастух долго никуда
  // не сместился, дёргаем его в обход и, в крайнем случае, перезапускаем цикл.
  herdMove(u: Unit, tx: number, ty: number, dt: number, arrive = 6): boolean {
    const done = this.moveTowardPath(u, tx, ty, dt, arrive);
    if (done) { u.herdStuckT = 0; return true; }
    // Счётчик застревания копится в общем цикле update (после коллизий) — здесь
    // мы только реагируем на него. Считать смещение тут нельзя: отталкивание от
    // стены происходит позже и «съедает» весь шаг.
    // Счётчик растёт шагами по 2 с (одна неудачная проба). Реагируем на переходы.
    const stuck = u.herdStuckT ?? 0;
    const fresh = u.herdProbeT != null && u.herdProbeT < dt * 1.5;  // проба только что закрылась
    if (stuck >= 2 && fresh) {
      // первая неудачная проба — перепроложить маршрут и попробовать обойти сбоку
      u.path = undefined; u.pathGoal = undefined; u.noPathT = 0;
      const dx = tx - u.x, dy = ty - u.y, d = Math.max(1, Math.hypot(dx, dy));
      const sx = -dy / d, sy = dx / d, side = (u.id % 2) ? 1 : -1;
      const bx = u.x + sx * side * 90, by = u.y + sy * side * 90;
      if (!this.terrainBlocked(bx, by)) this.moveToward(u, bx, by, dt, 6);
    }
    // 4 с без прогресса — почти всегда «база обнесена дуалом, пастбище снаружи».
    // Ведём пастуха через собственные ворота.
    if (stuck >= 4 && fresh) this.routeThroughGate(u, tx, ty);
    // 8 с — выхода нет вовсе (ворот не построили): переносим пастбище в доступную
    // зону вместе со стадом, иначе цикл выпаса встанет насовсем.
    if (stuck >= 8) {
      u.herdStuckT = 0; u.herdProbeT = 0;
      const pen = this.blds.find(b => b.id === u.penId);
      if (pen) {
        const [nx, ny] = this.findPasture(pen, u);
        pen.pastureX = nx; pen.pastureY = ny;
        // стадо осталось за стеной — перегоняем его к новому пастбищу, иначе
        // скот недостижим и цикл «пригнать в загон» никогда не завершится
        for (const a of this.units) {
          if (a.pastureId !== pen.id || a.hp <= 0) continue;
          if (dist2(a.x, a.y, nx, ny) < 900 * 900) continue;
          a.x = nx + rand(-70, 70); a.y = ny + rand(-70, 70);
          a.wx = nx; a.wy = ny; a.path = undefined; a.pathGoal = undefined;
        }
        this.burst(nx, ny - 20, 14, ['#d1fae5', '#a7f3d0', '#fff'], 130, 0.8);
        this.pushBanner('🐑 Новое пастбище', 'Старое осталось за дуалом — стадо перегнали ближе', 3);
      }
      u.herdState = 'graze'; u.herdStateT = 0;
      u.path = undefined; u.pathGoal = undefined;
    }
    return false;
  }

  // ── ПРОХОД ЧЕРЕЗ СВОИ ВОРОТА ────────────────────────────────────────────────
  // Пастух упёрся в собственную стену: A* внутри кольца пути наружу не находит,
  // потому что ворота — единственная щель. Ведём его сначала к ближайшим к цели
  // воротам, а уже оттуда он пойдёт дальше обычным маршрутом.
  private routeThroughGate(u: Unit, tx: number, ty: number) {
    let best: Bld | null = null, bd = Infinity;
    for (const b of this.blds) {
      if (b.key !== 'gate' || b.owner !== u.owner || b.done < 1) continue;
      // ворота полезны, если они «по пути»: ближе к цели, чем сам юнит
      const dGoal = dist2(b.x, b.y, tx, ty);
      if (dGoal > dist2(u.x, u.y, tx, ty)) continue;
      const w = dist2(u.x, u.y, b.x, b.y) + dGoal * 0.35;
      if (w < bd) { bd = w; best = b; }
    }
    if (!best) return;
    u.path = undefined; u.pathGoal = undefined; u.noPathT = 0;
    // точка чуть ЗА воротами со стороны цели — иначе юнит встанет в проёме
    const gx = best.x, gy = best.y;
    const dx = tx - gx, dy = ty - gy, d = Math.max(1, Math.hypot(dx, dy));
    u.tx = gx + (dx / d) * 40; u.ty = gy + (dy / d) * 40;
  }

  // кнопка «Пасти скот»: выбранные рабочие по одному назначаются к ближайшим/свободным загонам
  herdOrder() {
    const vills = this.selUnits().filter(u => u.owner === 'player' && u.key === 'villager');
    if (!vills.length) { this.floater(this.cam.x, this.cam.y - 80, 'Выберите рабочего', '#94a3b8', 14); return; }
    // готовые загоны игрока, сортированы по расстоянию до группы
    const pens = this.blds
      .filter(b => b.owner === 'player' && b.key === 'pen' && b.done >= 1)
      .sort((a, b) => dist2(a.x, a.y, vills[0].x, vills[0].y) - dist2(b.x, b.y, vills[0].x, vills[0].y));
    if (!pens.length) { this.floater(this.cam.x, this.cam.y - 90, 'Сначала постройте Загон (🐑, клавиша H)', '#f87171', 15); this.sound.error(); return; }
    // распределяем: 1 пастух на загон (если уже есть — следующий рабочий к следующему загону)
    let assigned = 0;
    for (const v of vills) {
      // свободный загон (без пастуха), иначе любой ближайший
      const pen = pens.find(p => !this.units.some(u => u.herder && u.penId === p.id && u.id !== v.id)) ?? pens[0];
      this.assignShepherd(v, pen);
      assigned++;
    }
    this.floater(pens[0].x, pens[0].y - 50, assigned > 1 ? `🐎 Пастухов: ${assigned}` : '🐎 Пастух назначен', '#a3e635', 14);
    this.spawnRing(pens[0].x, pens[0].y, '#a3e635');
  }

  // снять рабочего с должности пастуха (снесли загон / другой приказ)
  releaseShepherd(vill: Unit) {
    vill.herder = false; vill.penId = undefined; vill.herding = undefined; vill.herdT = 0;
    vill.speed = UNIT_DEFS.villager.speed;
    if (vill.state === 'gather') vill.state = 'idle';
  }

  // назначить рабочего пастухом к загону
  assignShepherd(vill: Unit, pen: Bld) {
    vill.herder = true; vill.penId = pen.id; vill.herdT = 0; vill.herding = [];
    vill.state = 'gather'; vill.wkind = undefined; vill.nodeId = -1; vill.buildId = -1; vill.targetU = -1; vill.targetB = -1;
    vill.speed = 175; // верхом на коне — быстрее обычного рабочего (118)
    // пастбище этого загона: дальнее ровное поле (≥50 клеток от базы) со стадом
    if (pen.pastureX == null) { const [px, py] = this.findPasture(pen); pen.pastureX = px; pen.pastureY = py; }
    if (!pen.pastureStocked) { this.stockPasture(pen.pastureX!, pen.pastureY!, pen.id); pen.pastureStocked = true; }
    vill.herdX = pen.pastureX; vill.herdY = pen.pastureY;
    vill.herdState = 'graze'; vill.herdStateT = 0;
    this.floater(pen.pastureX!, pen.pastureY! - 40, '🐑 Пастбище', '#a3e635', 14);
    this.floater(pen.x, pen.y - 50, '🐎 Пастух скачет на дальнее пастбище', '#a3e635', 14);
    this.pushBanner('🐎 Пастух отправился в поле', 'Скачет на дальнее пастбище (5 овец и 5 коров ждут), затем пригонит стадо в загон', 4);
    this.sound.ack('villager'); this.pushHud();
  }

  updateVillager(u: Unit, dt: number) {
    // НАМАЗ важнее работы и отдыха; затем отдых по смене
    if (u.praying && this.updatePraying(u, dt)) return;
    if (u.resting && this.updateResting(u, dt)) return;
    // пастух: цикл выпаса. В ручном перемещении (move/attackmove/build) слушается приказа,
    // а по прибытии (idle) и в фазе gather — пасёт скот и НЕ уходит на авто-добычу.
    if (u.herder && u.penId != null && (u.state === 'gather' || u.state === 'idle' || u.state === 'return')) {
      u.state = 'gather'; this.updateShepherd(u, dt); return;
    }
    // боевой приоритет: есть боевая цель/приказ — самооборона от нападающих/волков или охота
    const wantFight = u.state === 'attackmove' || u.targetU >= 0 || u.hunt;
    if (wantFight) {
      if (this.villagerCombat(u, dt)) { u.wkind = undefined; return; }
      // бой завершился: снимаем охоту/цель; с грузом — сдавать, иначе — к ресурсу/покою
      u.targetU = -1; u.hunt = false; u.wkind = undefined;
      if (u.state === 'attackmove') u.state = 'idle';
      if (u.carry.amt > 0) { u.state = 'return'; this.sendToDrop(u); return; }
      u.state = 'idle'; u.idleT = 0;
    }
    // в покое — подбираем ближайший ресурс рядом и идём работать (авто-добыча),
    // но не убегаем за полкарты (дальше 1600 — ждём явного приказа)
    if (u.state === 'idle') {
      u.idleT += dt; u.wkind = undefined;
      // ОЧЕРЕДЬ ПОСТРОЕК ВПЕРЕДИ ВСЕГО: шаруа мог отвлечься (сдал ресурс, поел,
      // отдохнул) — вернувшись, он обязан доделать свои фундаменты, иначе очередь
      // Shift+клика зависала навсегда, а он уходил рубить лес.
      if (u.buildQueue && u.buildQueue.length && this.nextQueuedBuild(u)) return;
      // работницы-казашки: женская работа — дойка коров в загоне (приоритет), затем сбор урожая на ферме
      if (u.female && !u.herder) {
        const pen = this.pickMilkingPen(u);
        if (pen) { pen.milkWid = u.id; u.penId = pen.id; u.state = 'gather'; u.wkind = 'milk';
          u.tx = pen.x + 34; u.ty = pen.y + 40; u.buildId = pen.id; u.nodeId = -1; u.gatherT = 0; return; }
        const farm = this.nearestFarmForWoman(u);
        if (farm) { u.state = 'gather'; u.wkind = 'gather'; u.buildId = farm.id; u.nodeId = -1;
          u.tx = farm.x + rand(-20, 20); u.ty = farm.y + rand(-16, 16); u.gatherT = 0; return; }
      }
      const near = this.nearestResource(u.x, u.y);
      if (near && dist2(u.x, u.y, near.x, near.y) < 2600 * 2600) { this.orderGather(u, near.id); return; }
      // Простояв 4с без работы рядом, рабочий идёт к ЛЮБОМУ оставшемуся ресурсу на карте,
      // даже далёкому. Иначе, когда округа выработана, крестьяне застывают навсегда.
      if (near && u.idleT > 4) { this.orderGather(u, near.id); return; }
      return;
    }
    // работница на дойке: идёт к загону и доит, пока стадо на постое (фаза pen)
    if (u.female && !u.herder && u.wkind === 'milk') {
      const pen = this.blds.find(b => b.id === u.penId && b.key === 'pen' && b.done >= 1);
      const shep = this.units.find(s => s.herder && s.penId === (pen?.id ?? -2));
      const herding = pen && shep && shep.herdState === 'pen';
      if (!pen || pen.milkWid !== u.id || !herding) {
        // дойка окончена (стадо увели на выпас/загон снесён): освобождаемся и сдаём молоко
        if (pen) pen.milkWid = undefined;
        u.penId = undefined; u.wkind = undefined; u.buildId = -1;
        if (u.carry.amt > 0) { u.state = 'return'; this.sendToDrop(u); return; }
        u.state = 'idle'; u.idleT = 0; return;
      }
      if (dist2(u.x, u.y, pen.x, pen.y) > 62 * 62) { u.wkind = undefined; this.moveTowardPath(u, u.tx, u.ty, dt); return; }
      // доим: молоко капает
      u.gatherT += dt; u.atkAnim = Math.min(1, u.atkAnim + dt * 6);
      const cyc = 0.9 / this.workMult(u);
      u.wphase = u.gatherT / cyc;
      if (u.gatherT >= cyc) {
        u.gatherT = 0; u.wphase = 0;
        u.carry = { type: 'food', amt: u.carry.amt + 3 * this.workMult(u) * this.farmMult() };
        if (Math.random() < 0.7) this.burst(u.x + 14, u.y - 6, 2, ['#fef3c7', '#fde68a', '#fff'], 46, 0.5);
        // молоко идёт в казну ВЛАДЕЛЬЦА (deposit), а не всегда игроку — тот же баг, что
        // чинили у фермы в 1.0.062
        if (u.carry.amt >= this.carryCap()) this.deposit(u);
      }
      return;
    }
    if (u.state === 'move') { u.wkind = undefined; if (this.moveTowardPath(u, u.tx, u.ty, dt)) { u.state = 'idle'; u.idleT = 0; } return; }
    if (u.state === 'build') {
      const b = this.blds.find(b => b.id === u.buildId);
      if (!b || b.done >= 1) {
        // Очередь Shift+клика: закончив фундамент, шаруа сам идёт на следующий,
        // а не встаёт без дела рядом с готовым домом.
        if (this.nextQueuedBuild(u)) return;
        u.state = 'idle'; u.buildId = -1; u.wkind = undefined; return;
      }
      const arrived = this.moveTowardPath(u, u.tx, u.ty, dt, 10);
      if (arrived || dist2(u.x, u.y, b.x, b.y) < 95 * 95) {
        u.atkAnim = Math.min(1, u.atkAnim + dt * 6);
        u.wkind = 'mine'; // стройка — удары инструментом (кирка/молоток)
        u.gatherT += dt;
        if (u.gatherT > 0.5) u.gatherT = 0;
        u.wphase = u.gatherT / 0.5;
        // hammer particles handled in building update
      } else {
        u.wkind = undefined;
      }
      return;
    }
    if (u.state === 'gather') {
      // ДОЙКА В ПРИОРИТЕТЕ: как только стадо вернулось в загон, работница бросает текущую
      // работу (пашня, лес, ягоды) и идёт доить. Без этого она уходила в дойку только из
      // состояния idle, в которое занятая крестьянка практически никогда не попадала —
      // поэтому «автоматически доить» не срабатывало. Проверяем раз в ~1с, не каждый кадр.
      if (u.female && !u.herder && u.wkind !== 'milk') {
        u.milkScanT = (u.milkScanT ?? 0) + dt;
        if (u.milkScanT > 1) {
          u.milkScanT = 0;
          const mp = this.pickMilkingPen(u);
          if (mp) {
            if (u.carry.amt > 0) this.deposit(u);
            mp.milkWid = u.id; u.penId = mp.id; u.wkind = 'milk';
            u.tx = mp.x + 34; u.ty = mp.y + 40; u.buildId = mp.id; u.nodeId = -1; u.gatherT = 0;
            return;
          }
        }
      }
      // farm?
      const fb = this.blds.find(b => b.id === u.buildId && b.key === 'farm');
      if (fb) {
        if (dist2(u.x, u.y, fb.x, fb.y) > 60 * 60) { u.wkind = undefined; this.moveTowardPath(u, u.tx, u.ty, dt); return; }
        u.gatherT += dt; u.atkAnim = Math.min(1, u.atkAnim + dt * 7);
        u.wkind = 'gather'; // сбор урожая на ферме — кадр сбора фруктов
        const cyc = 0.55 / this.workMult(u);
        u.wphase = u.gatherT / cyc;
        if (u.gatherT > cyc) {
          u.gatherT = 0; u.wphase = 0;
          u.carry = { type: 'food', amt: u.carry.amt + 2 * this.workMult(u) * this.farmMult() };
          this.burst(u.x, u.y - 8, 2, ['#a3e635', '#65a30d'], 50, 0.5);
          // ферма отдаёт еду на месте (без похода на склад) — но в казну ВЛАДЕЛЬЦА
          if (u.carry.amt >= this.carryCap()) this.deposit(u);
          if (Math.random() < 0.25) this.sound.gatherFood();
        }
        return;
      }
      const n = this.nodes.find(n => n.id === u.nodeId);
      if (!n || n.amount <= 0) {
        if (u.carry.amt > 0) { u.state = 'return'; this.sendToDrop(u); }
        else {
          // Ресурс кончился: свободный рабочий сразу идёт к ближайшему ЛЮБОМУ ресурсу.
          // Радиус тот же, что в idle (2600): раньше здесь стояло 1500, и когда округу
          // вырубали, рабочий уходил в idle и застывал НАВСЕГДА.
          const alt = this.nearestResource(u.x, u.y);
          if (alt && dist2(alt.x, alt.y, u.x, u.y) < 2600 * 2600) this.orderGather(u, alt.id);
          else { u.state = 'idle'; u.idleT = 0; }
        }
        return;
      }
      // рыбалка в стиле AoE: косяк стоит на воде, рабочий остаётся на суше (берегу) и
      // удит — радиус подхода больше, цель доводим не в воду, а до дистанции заброса.
      const isFish = n.kind === 'fish';
      const reach = isFish ? n.r + 64 : n.r + 14;
      const arrive = isFish ? reach : reach * 0.7;
      if (dist2(u.x, u.y, n.x, n.y) > reach * reach) {
        u.wkind = undefined;
        this.moveTowardPath(u, n.x, n.y, dt, arrive);
        return;
      }
      // рабочий на берегу: разворот к воде/косяку
      if (Math.abs(n.x - u.x) > 4) u.face = n.x > u.x ? 1 : -1;
      // вид работы: лес — топор, золото/руда — кирка, рыба — удочка (стоит на берегу), фрукты/ягоды — сбор
      u.wkind = n.kind === 'wood' ? 'chop' : n.kind === 'gold' ? 'mine' : n.kind === 'fish' ? 'fish' : 'gather';
      u.gatherT += dt; u.atkAnim = Math.min(1, u.atkAnim + dt * 7);
      const cycN = 0.55 / this.workMult(u);
      u.wphase = u.gatherT / cycN;
      if (u.gatherT >= cycN) {
        u.gatherT = 0; u.wphase = 0;
        const take = Math.min(2.5 * this.workMult(u), n.amount);
        n.amount -= take;
        u.carry.amt += take;
        if (n.kind === 'wood') { this.burst(n.x + rand(-10, 10), n.y - 6, 3, ['#a16207', '#65a30d', '#d6a45c'], 80, 0.55); if (Math.random() < 0.5) this.sound.chop(); }
        else if (n.kind === 'gold') { this.burst(n.x, n.y - 8, 3, ['#fde047', '#facc15', '#fff'], 70, 0.5); this.spark(n.x, n.y - 10, '#fef08a'); if (Math.random() < 0.4) this.sound.mine(); }
        else if (n.kind === 'fish') { this.burst(n.x, n.y - 2, 4, ['#7dd3fc', '#38bdf8', '#e0f2fe'], 70, 0.5); if (Math.random() < 0.3) this.sound.gatherFood(); }
        else { this.burst(n.x, n.y - 6, 3, ['#f472b6', '#fb7185', '#a3e635'], 60, 0.5); if (Math.random() < 0.3) this.sound.gatherFood(); }
        if (n.amount <= 0) { this.burst(n.x, n.y, 14, n.kind === 'wood' ? ['#65a30d', '#3f6212'] : n.kind === 'gold' ? ['#facc15'] : n.kind === 'fish' ? ['#7dd3fc','#38bdf8'] : ['#fb7185'], 110, 0.7); }
        if (u.carry.amt >= this.carryCap()) { u.state = 'return'; this.sendToDrop(u); }
      }
      return;
    }
    if (u.state === 'return') {
      const tc = this.nearestDrop(u);
      if (!tc) { this.deposit(u); u.state = 'idle'; return; }
      // СДАЧА ПО КРОМКЕ ЗДАНИЯ: крестьянин толкается коллизией у угла здания и до ЦЕНТРА
      // физически дойти не может, поэтому сдаём на дистанции до ближней грани (Chebyshev
      // по квадрату ТЦ), а не до центра — иначе подходивший по диагонали рабочий кружил
      // снаружи, не попадая в круг сдачи.
      const dropR = tc.size / 2 + 22;
      const hx = tc.size / 2;
      const ox = Math.max(0, Math.abs(u.x - tc.x) - hx), oy = Math.max(0, Math.abs(u.y - tc.y) - hx);
      if (ox * ox + oy * oy < dropR * dropR || dist2(u.x, u.y, tc.x, tc.y) < dropR * dropR) {
        this.deposit(u);
        // после сдачи — обратно к работе
        const fb2 = u.buildId >= 0 ? this.blds.find(b => b.id === u.buildId) : undefined;
        if (fb2 && fb2.key === 'farm') { u.state = 'gather'; }
        else {
          const n = this.nodes.find(n => n.id === u.nodeId);
          if (n && n.amount > 0) { u.state = 'gather'; }
          else {
            const alt = this.nearestResource(u.x, u.y);
            if (alt) this.orderGather(u, alt.id);
            else u.state = 'idle';
          }
        }
        return;
      }
      // Цель — ближняя точка У ГРАНИЦЫ ТЦ (на радиусе сдачи, со стороны подхода): стабильна
      // между кадрами, arrive совпадает с радиусом сдачи — рабочий не доходит до коллизии и
      // не топчется/толкается у угла, а разгружается сразу на входе в зону.
      const dx = u.x - tc.x, dy = u.y - tc.y;
      const d = Math.hypot(dx, dy) || 1;
      const rr = Math.max(8, dropR - 6);
      const tx = tc.x + (dx / d) * rr, ty = tc.y + (dy / d) * rr;
      this.moveTowardPath(u, tx, ty, dt, 8);
    }
  }

  // ближайший ресурсный узел ЛЮБОГО типа (для авто-работы свободного крестьянина)
  nearestResource(x: number, y: number, prefer?: 'wood' | 'food' | 'gold' | 'fish'): Node | null {
    let best: Node | null = null; let bd = 1e12;
    for (const n of this.nodes) {
      if (n.amount <= 0) continue;
      let d = dist2(x, y, n.x, n.y);
      if (prefer && n.kind === prefer) d *= 0.5; // лёгкий приоритет предпочитаемого типа
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // загон, где стадо сейчас на постое (фаза pen) и ещё нет доярки, ближайший к работнице
  private pickMilkingPen(u: Unit): Bld | null {
    // радиус поиска щедрый (2200): работница бросает дальнюю пашню и идёт доить, как только
    // стадо вернулось. Загон ищем СВОЕГО владельца, а не всегда игрока.
    let best: Bld | null = null; let bd = 2200 * 2200;
    for (const b of this.blds) {
      if (b.owner !== u.owner || b.key !== 'pen' || b.done < 1) continue;
      if (b.milkWid != null && this.units.some(w => w.id === b.milkWid && w.hp > 0)) continue;
      const shep = this.units.find(s => s.herder && s.penId === b.id);
      if (!shep || shep.herdState !== 'pen') continue; // стадо в загоне — есть что доить
      const d = dist2(u.x, u.y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ближайшая достроенная ферма игрока для сбора урожая (женская работа)
  private nearestFarmForWoman(u: Unit): Bld | null {
    let best: Bld | null = null; let bd = 1200 * 1200;
    for (const b of this.blds) {
      if (b.owner !== 'player' || b.key !== 'farm' || b.done < 1) continue;
      const d = dist2(u.x, u.y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // Точка сдачи ресурса: ханская ставка ИЛИ склад (Қойма). Как лесопилка/рудник в AoE —
  // склад у дальней рощи резко срезает путь шаруа, поэтому берём БЛИЖАЙШУЮ из точек.
  nearestDrop(u: Unit): Bld | null {
    let best: Bld | null = null; let bd = 1e15;
    for (const b of this.blds) {
      if (b.owner !== u.owner) continue;
      if (b.key !== 'towncenter' && b.key !== 'storehouse') continue;
      if (b.done < 1) continue;
      const d = dist2(u.x, u.y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  sendToDrop(u: Unit) {
    const tc = this.nearestDrop(u);
    if (!tc) return;
    // стабильная точка сдачи у кромки здания (а не в центре зоны коллизии — там рабочий
    // толкается и топчется). Встаём со стороны, откуда пришёл, на радиусе ~TC+8.
    const dx = u.x - tc.x, dy = u.y - tc.y;
    const d = Math.hypot(dx, dy) || 1;
    const r = tc.size / 2 + 10;
    u.tx = tc.x + (dx / d) * r;
    u.ty = tc.y + (dy / d) * r;
  }

  // народ-племя для юнита (по его домашнему лагерю); null — не племя
  unitTribeNation(u: Unit): string | null {
    if (!u.tribe) return null;
    const home = this.blds.find(b => b.tribe && Math.abs(b.x - u.homeX) < 140 && Math.abs(b.y - u.homeY) < 140);
    return home ? this.tribeNationOf(home) : null;
  }
  // племя народа nid враждебно игроку (война-по-отношению / угроза), и НЕ трогает при дружбе
  tribeHostileToPlayer(nid: string): boolean {
    const rel = this.tribeRel[nid];
    if (rel === 'friend') return false;          // друзья не дерутся
    if (rel === 'hostile') return true;          // объявленная вражда
    // нейтральное племя агрит только провокацией (e.aggro) — учитывается в сканерах
    return false;
  }
  // враждебны ли стороны: волки (нейтралы) враждебны всегда; игрок и ИИ — только в состоянии войны.
  // До знакомства с соперником войны нет (его даже не видно в тумане), но явное нападение
  // игрока по открытой цели начинает войну (см. strike/onPlayerAggression).
  hostile(a: 'player' | 'enemy' | 'neutral', b: 'player' | 'enemy' | 'neutral'): boolean {
    if (a === b) return false;
    if (a === 'neutral' || b === 'neutral') return true;
    return this.atWar;
  }

  // разозлено ли племя в точке (есть ли рядом агр-воин племени)
  tribeAggro(x: number, y: number): boolean {
    for (const e of this.units) {
      if (!e.tribe || !e.aggro) continue;
      if (dist2(e.x, e.y, x, y) < 320 * 320) return true;
    }
    return false;
  }
  // атаковали воина/постройку нейтрального племени → всё племя рядом мстит
  provokeTribe(x: number, y: number, by: Unit) {
    let any = false;
    for (const e of this.units) {
      if (!e.tribe) continue;
      if (dist2(e.x, e.y, x, y) < 360 * 360) { e.aggro = true; any = true; }
    }
    for (const b of this.blds) {
      if (b.tribe && dist2(b.x, b.y, x, y) < 360 * 360) any = true;
    }
    if (any) {
      // ближайшие воины племени идут на обидчика
      for (const e of this.units) {
        if (e.tribe && e.aggro && dist2(e.x, e.y, by.x, by.y) < 560 * 560) {
          e.state = 'attackmove'; e.targetU = by.id; e.tx = by.x; e.ty = by.y;
        }
      }
    }
  }

  acquireEnemy(u: Unit, radius: number): { tu: number; tb: number } {
    let bu = -1, bb = -1; let bd = radius * radius;
    for (const e of this.units) {
      // племя дружественного народа игрок НЕ атакует (даже при случайном aggro);
      // нейтральное нетронутое племя — тоже не цель (агр только при явной провокации)
      if (e.tribe && u.owner === 'player') {
        const nid = this.unitTribeNation(e);
        if (nid && this.tribeRel[nid] === 'friend') continue;
        if (nid && this.tribeRel[nid] === 'neutral' && !e.aggro) continue;
      }
      if (!this.hostile(u.owner, e.owner)) continue;
      // нетронутое нейтральное племя (воины/башни) пассивно: авто-боем не трогаем
      if (e.tribe && !e.aggro) continue;
      // пассивный скот не цель авто-боя (бить можно только явным приказом)
      // дичь/скот — добыча охоты (см. acquirePrey); в авто-оборону не входит
      if (e.owner === 'neutral' && e.key !== 'wolf' && !e.tribe && u.state !== 'attackmove') continue;
      if (u.owner === 'player' && e.owner === 'neutral' && e.key === 'wolf' && u.state !== 'attackmove') {
        // крестьяне обороняются от волков в малом радиусе (оборона), но не гоняются за ними
        // через всю карту: военные берут волка обычным радиусом, крестьяне — отдельно ниже
        if (u.key === 'villager') {
          const d = dist2(u.x, u.y, e.x, e.y);
          if (d < 150 * 150 && d < bd) { bd = d; bu = e.id; bb = -1; }
        }
        continue;
      }
      // крестьяне обороняются от вражеских воинов/племени только в малом радиусе (не
      // отходят далеко от работы и не ищут врагов по всей карте)
      if (u.key === 'villager' && u.owner === 'player' && u.state !== 'attackmove') {
        const d = dist2(u.x, u.y, e.x, e.y);
        if (d < 120 * 120 && d < bd) { bd = d; bu = e.id; bb = -1; }
        continue;
      }
      const d = dist2(u.x, u.y, e.x, e.y);
      if (d < bd) { bd = d; bu = e.id; bb = -1; }
    }
    if (bu >= 0) return { tu: bu, tb: -1 };
    let bbd = radius * radius;
    for (const b of this.blds) {
      if (!this.hostile(u.owner, b.owner) || b.done < 0.5) continue;
      // нетронутое нейтральное племя авто-боем не атакуем
      if (b.tribe && !this.tribeAggro(b.x, b.y)) continue;
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
    if (u.key === 'archer') u.aiming = false; // сбрасываем; выставится при цели в зоне
    // племя дружественного народа игрока: воины без провокации возвращаются в лагерь и не ищут боя
    const uNation = u.tribe ? this.unitTribeNation(u) : null;
    const tribeFriendly = u.tribe && uNation && this.tribeRel[uNation] === 'friend';
    // validate targets
    let tu = u.targetU >= 0 ? this.units.find(e => e.id === u.targetU) : undefined;
    let tb = u.targetB >= 0 ? this.blds.find(b => b.id === u.targetB) : undefined;
    if (tu) {
      // дружественное племя не держит целью игрока
      if (u.tribe && tu.owner === 'player') { const nid = this.unitTribeNation(u); if (nid && this.tribeRel[nid] === 'friend') { tu = undefined; u.targetU = -1; } }
      if (tu && tu.hp <= 0) { tu = undefined; u.targetU = -1; }
    }
    if (tb && tb.hp <= 0) { tb = undefined; u.targetB = -1; }
    if (u.tribe && tb && tb.owner === 'player') { const nid = this.unitTribeNation(u); if (nid && this.tribeRel[nid] === 'friend') { tb = undefined; u.targetB = -1; } }
    if (tribeFriendly) {
      // дружественные воины пассивны: стоят у лагеря
      if (dist2(u.x, u.y, u.homeX, u.homeY) > 120 * 120) this.moveTowardPath(u, u.homeX + rand(-20, 20), u.homeY + rand(-20, 20), dt, 16);
      return;
    }
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
          if (u.key === 'archer') u.aiming = true;
          if (u.cd <= 0) this.strike(u, tu, undefined);
        } else {
          this.moveTowardPath(u, tu.x, tu.y, dt, uRange * 0.7);
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
        if (u.key === 'archer') u.aiming = true;
        if (u.cd <= 0) this.strike(u, undefined, tb);
      } else this.moveTowardPath(u, tb.x, tb.y, dt, edge);
      return;
    }
    if (u.state === 'patrol') {
      // идём к текущей точке патруля; при прибытии — пауза и разворот
      if (this.moveTowardPath(u, u.tx, u.ty, dt, 14)) {
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
    // воин нейтрального племени без цели: стережёт лагерь (возвращается к точке спавна)
    if (u.owner === 'neutral' && u.tribe && !u.targetU && u.targetB < 0) {
      if (dist2(u.x, u.y, u.homeX, u.homeY) > 120 * 120) {
        u.state = 'move'; u.tx = u.homeX; u.ty = u.homeY;
        this.moveTowardPath(u, u.homeX + rand(-20, 20), u.homeY + rand(-20, 20), dt, 16);
        return;
      }
      u.state = 'idle';
    }
    if (u.state === 'attackmove' || u.state === 'move') {
      // стойка «держать позицию»: не уходить от точки старта за поводок
      if (u.stance === 'stand' && u.state === 'attackmove' && (u.key !== 'catapult')) {
        const leash = u.hidden == null ? 150 : 150;
        if (dist2(u.x, u.y, u.homeX, u.homeY) > leash * leash) {
          u.targetU = -1; u.targetB = -1; u.state = 'move'; u.tx = u.homeX; u.ty = u.homeY;
        }
      }
      if (this.moveTowardPath(u, u.tx, u.ty, dt)) {
        // разозлённый воин племени, догнавший точку, продолжает искать обидчика у лагеря
        if (u.tribe && u.aggro) {
          const f = this.acquireEnemy(u, 240);
          if (f.tu >= 0) { u.targetU = f.tu; u.state = 'attackmove'; return; }
          u.state = 'idle';
        } else {
          // вернулись домой из погони (stand) — встаём
          u.state = 'idle';
          const f = this.acquireEnemy(u, isCata ? 300 : 200);
          if (f.tu >= 0 && u.stance !== 'stand') { u.targetU = f.tu; u.state = 'attackmove'; }
        }
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

  // РАЗВЕДЧИК: по приказу игрока ИЛИ в дефолтном «исследовать» режиме открывает карту,
  // ищет базы племён, налаживает дипсвязь или внедряется кротом во вражеские базы.
  // После спавна стоит у ГЦ (приказа нет) — сам в разведку не убегает.
  updateScout(u: Unit, dt: number) {
    // 1) валидируем явную боевую цель (самооборона/приказ бить)
    let tu = u.targetU >= 0 ? this.units.find(e => e.id === u.targetU) : undefined;
    if (tu && (tu.hp <= 0 || !this.scoutHostile(u, tu))) { tu = undefined; u.targetU = -1; }
    if (tu) {
      const d = Math.hypot(tu.x - u.x, tu.y - u.y);
      const reach = u.range + 6;
      if (d <= reach) {
        if (Math.abs(tu.x - u.x) > 3) u.face = tu.x > u.x ? 1 : -1;
        if (u.cd <= 0) this.strike(u, tu, undefined);
        u.atkAnim = Math.min(1, u.atkAnim + dt * 6);
      } else {
        this.moveTowardPath(u, tu.x, tu.y, dt, reach * 0.7);
      }
      return;
    }
    // авто-оборона: нападающий/волк в малом радиусе — дать отпор (дружественные племена не трогаем)
    u.retarget -= dt;
    if (u.retarget <= 0) {
      u.retarget = 0.4;
      const f = this.acquireScoutEnemy(u, 150);
      if (f >= 0) { u.targetU = f; return; }
    }
    // ручной приказ движения (move/attackmove/patrol) — исполняем; по достижении
    // разведчик возвращается к своему заданию (mission), если оно есть
    if (u.state === 'attackmove' || u.state === 'move' || u.state === 'patrol') {
      // если это движение по ЗАДАНИЮ (mtx/mty заданы и совпадают) — по прибытии обработать миссию
      const onMission = u.mission != null && u.mtx != null && Math.hypot(u.tx - u.mtx, u.ty - (u.mty ?? 0)) < 4;
      if (this.moveTowardPath(u, u.tx, u.ty, dt, 14)) {
        if (onMission) this.scoutMissionArrive(u);
        else { u.state = 'idle'; u.idleT = 0; }
      }
      return;
    }
    // без задания — стоит у ГЦ (как и приказано: не убегает сразу)
    if (!u.mission) { u.idleT += dt; return; }
    // тик задания
    u.idleT += dt;
    if (u.idleT < 0.5) return;
    u.idleT = 0;
    this.scoutTick(u);
  }
  // враг ли это для разведчика (враждебные племена/соперник; волки НЕ страшны — иммунитет)
  scoutHostile(u: Unit, e: Unit): boolean {
    if (e.owner === 'neutral' && e.tribe) {
      const nid = this.unitTribeNation(e);
      if (nid) return this.tribeRel[nid] === 'hostile' || !!e.aggro;
      return true;
    }
    if (e.owner === 'neutral' && e.key === 'wolf') return false; // волки не нападают на разведчика
    return this.hostile(u.owner, e.owner);
  }
  acquireScoutEnemy(u: Unit, radius: number): number {
    let best = -1, bd = radius * radius;
    for (const e of this.units) {
      if (e.hp <= 0) continue;
      if (e.owner === 'neutral') {
        if (e.key === 'wolf') continue; // волки не добыча разведчика — он проходит мимо
        if (!e.tribe) continue; // скот не трогаем
        if (e.tribe) { const nid = this.unitTribeNation(e); if (nid && this.tribeRel[nid] === 'friend') continue; if (nid && this.tribeRel[nid] !== 'hostile' && !e.aggro) continue; }
      } else if (e.owner === u.owner) continue;
      else { if (!this.hostile(u.owner, e.owner)) continue; }
      const d = dist2(u.x, u.y, e.x, e.y);
      if (d < bd) { bd = d; best = e.id; }
    }
    return best;
  }
  // выдать разведчику приказ-задание
  scoutOrder(mission: 'explore' | 'bases' | 'diplomacy' | 'infiltrate') {
    const us = this.selUnits().filter(u => u.owner === 'player' && u.key === 'scout');
    if (!us.length) { this.floater(this.cam.x, this.cam.y - 90, 'Выберите разведчика 🧭', '#94a3b8', 14); this.sound.error(); return; }
    for (const u of us) {
      u.mission = mission; u.infDone = false; u.infT = 0; u.mNation = undefined;
      u.idleT = 0.9; // сразу тикнуть
      if (mission === 'infiltrate') {
        // цель — ближайшая вражеская база (соперник или враждебное/любое племя)
        const b = this.nearestEnemyBase(u.x, u.y);
        if (b) { u.mtx = b.x; u.mty = b.y; u.mNation = b.owner === 'enemy' ? 'rival' : this.tribeNationOf(b) ?? undefined; u.infBaseId = b.id; }
      }
      if (mission === 'diplomacy') {
        // цель — ближайший ещё не встреченный народ; если все встречены — просто к ближайшей базе
        const b = this.nearestUnmetBase(u.x, u.y);
        if (b) { u.mtx = b.x; u.mty = b.y; u.mNation = b.owner === 'enemy' ? 'rival' : this.tribeNationOf(b) ?? undefined; }
      }
    }
    const names: Record<string, string> = { explore: 'Исследовать карту', bases: 'Искать базы', diplomacy: 'Наладить связь', infiltrate: 'Внедриться кротом' };
    this.floater(this.cam.x, this.cam.y - 90, `🧭 ${names[mission]}`, '#7dd3fc', 15);
    this.sound.ack('soldier');
    this.pushHud();
  }
  // ближайшая база соперника/враждебного племени (для шпионажа); друзей не выслеживаем
  nearestEnemyBase(x: number, y: number): Bld | null {
    let best: Bld | null = null; let bd = Infinity;
    for (const b of this.blds) {
      if (b.owner === 'player') continue;
      if (!(b.owner === 'enemy' && b.key === 'towncenter') && !b.tribe) continue;
      if (b.tribe) { const nid = this.tribeNationOf(b); if (nid && this.tribeRel[nid] === 'friend') continue; }
      const d = dist2(x, y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  // ближайшая база народа, с которым ещё НЕ знакомы (для дипломатии)
  nearestUnmetBase(x: number, y: number): Bld | null {
    let best: Bld | null = null; let bd = Infinity;
    for (const b of this.blds) {
      if (b.owner === 'player') continue;
      if (!(b.owner === 'enemy' && b.key === 'towncenter') && !b.tribe) continue;
      const nid = b.owner === 'enemy' ? 'rival' : this.tribeNationOf(b);
      if (nid && this.metNation(nid)) continue; // уже знакомы — не цель
      const d = dist2(x, y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best ?? this.nearestEnemyBase(x, y);
  }
  // тик задания: выбираем/обновляем цель и идём
  private scoutTick(u: Unit) {
    switch (u.mission) {
      case 'explore': {
        const g = this.scoutExploreGoal(u);
        if (g) { u.mtx = g[0]; u.mty = g[1]; u.tx = g[0]; u.ty = g[1]; u.state = 'move'; }
        break;
      }
      case 'bases': {
        const b = this.nearestDistantCamp(u);
        if (b) { u.mtx = b.x; u.mty = b.y; u.tx = b.x; u.ty = b.y; u.state = 'move'; }
        else { const g = this.scoutExploreGoal(u); if (g) { u.tx = g[0]; u.ty = g[1]; u.state = 'move'; } }
        break;
      }
      case 'diplomacy': {
        // цель зафиксирована при приказе; если народ уже встречен — ищем следующий незнакомый
        if (!u.mNation || this.metNation(u.mNation) || !u.mtx) {
          const b = this.nearestUnmetBase(u.x, u.y);
          if (b) { u.mtx = b.x; u.mty = b.y; u.mNation = b.owner === 'enemy' ? 'rival' : this.tribeNationOf(b) ?? undefined; }
        }
        if (u.mtx != null && u.mty != null) { u.tx = u.mtx; u.ty = u.mty; u.state = 'move'; }
        break;
      }
      case 'infiltrate': {
        if (u.infDone) {
          // внедрён: держим расширенный обзор у базы (ничего не делаем — стоит/осматривается),
          // изредка «доносит» — небольшой доход золота
          const it = (u.infT ?? 0) + 0.5; u.infT = it;
          if (it > 12) { u.infT = 0; this.res.gold += 6; this.floater(u.x, u.y - 30, '📿 донесение +6🪙', '#fde047', 12, true); }
          break;
        }
        if (u.mtx == null) { const b = this.nearestEnemyBase(u.x, u.y); if (b) { u.mtx = b.x; u.mty = b.y; u.infBaseId = b.id; } }
        if (u.mtx != null && u.mty != null) {
          // цель — точка РЯДОМ с базой (не в центр, чтобы не агрить вплотную): встаём у кромки обзора
          const dx = u.x - u.mtx, dy = u.y - u.mty, d = Math.hypot(dx, dy) || 1;
          const stand = 230;
          if (d > stand) { u.tx = u.mtx + (dx / d) * stand; u.ty = u.mty + (dy / d) * stand; u.state = 'move'; }
          else { u.state = 'idle'; u.infT = (u.infT ?? 0) + 0.5; this.scoutInfiltrateProgress(u); }
        }
        break;
      }
    }
  }
  // прогресс внедрения у вражеской базы
  private scoutInfiltrateProgress(u: Unit) {
    // накапливаем «внедрение» ~8 сек рядом; база в тумане считается раскрытой (большой обзор)
    const base = u.infBaseId != null ? this.blds.find(b => b.id === u.infBaseId) : undefined;
    if (base && dist2(u.x, u.y, base.x, base.y) < 320 * 320) {
      if ((u.infT ?? 0) >= 8 && !u.infDone) {
        u.infDone = true; u.infT = 0;
        this.intelBase = base.id;
        const nid = base.owner === 'enemy' ? 'rival' : this.tribeNationOf(base);
        const def = nid ? NATION_BY_ID[nid] : null;
        this.pushBanner('🕵️ Крот внедрился!', def ? `Разведчик под видом торговца проник к «${def.name}»: база раскрыта, идут донесения` : 'База раскрыта, идут донесения', 4.5);
        this.sound.quest();
        // внедрение во враждебную базу может спровоцировать племя
        if (base.tribe) { const nid2 = this.tribeNationOf(base); if (nid2 && this.tribeRel[nid2] !== 'friend') { /* тихо проник — не провоцируем сразу */ } }
        this.pushHud();
      }
    }
  }
  // прибытие к цели задания
  private scoutMissionArrive(u: Unit) {
    if (u.mission === 'infiltrate') { u.state = 'idle'; u.infT = 0; this.scoutInfiltrateProgress(u); return; }
    // для explore/bases/diplomacy — просто продолжить (следующий тик выберет новую цель)
    u.state = 'idle'; u.idleT = 0.8;
  }
  // ближайший ещё не «разведанный вблизи» лагерь племени
  private nearestDistantCamp(u: Unit): Bld | null {
    let camp: Bld | null = null; let cd2 = Infinity;
    for (const b of this.blds) {
      if (!b.tribe) continue;
      const d = dist2(u.x, u.y, b.x, b.y);
      if (d < 520 * 520) continue; // уже рядом — не цель
      if (d < cd2) { cd2 = d; camp = b; }
    }
    return camp;
  }
  // цель разведки: ближайшая туманная точка в кольце вокруг юнита; иначе случайный бросок.
  private scoutExploreGoal(u: Unit): [number, number] | null {
    const explored = (wx: number, wy: number) => this.settings.fogOfWar ? this.fogAt(wx, wy).expl : true;
    for (const rad of [260, 380, 520, 680]) {
      let best: [number, number] | null = null; let bd = Infinity;
      const tries = 14;
      for (let i = 0; i < tries; i++) {
        const a = (i / tries) * Math.PI * 2 + u.id * 1.7 + this.time * 0.02;
        const wx = u.x + Math.cos(a) * rad, wy = u.y + Math.sin(a) * rad;
        if (wx < 40 || wy < 40 || wx > WORLD.w - 40 || wy > WORLD.h - 40) continue;
        const cls = this.terrain.classAt(wx, wy);
        if (cls === 'deep' || cls === 'mountain') continue; // ни в воду, ни в горы
        if (!explored(wx, wy)) { const d = Math.abs(Math.cos(a) * rad) + Math.abs(Math.sin(a) * rad); if (d < bd) { bd = d; best = [wx, wy]; } }
      }
      if (best) return best;
    }
    const a = (u.id * 1.3 + this.time * 0.03) % (Math.PI * 2);
    return [clamp(u.x + Math.cos(a) * 620, 60, WORLD.w - 60), clamp(u.y + Math.sin(a) * 620, 60, WORLD.h - 60)];
  }

  // радиус, с которого имам может камлать (чуть меньше дальности лечения)
  readonly CONV_RANGE = 120;
  readonly CONV_TIME = 7;     // сколько секунд длится обращение

  updateMonk(u: Unit, dt: number) {
    // ── КАМЛАНИЕ: обращение вражеского юнита в свою веру ──
    if (u.convTarget != null) {
      const t = this.units.find(x => x.id === u.convTarget);
      const bad = !t || t.hp <= 0 || t.owner === u.owner || t.key === 'wolf'
        || t.key === 'sheep' || t.key === 'cow' || t.key === 'deer';
      if (bad) { this.stopConvert(u); }
      else {
        const d2 = dist2(u.x, u.y, t!.x, t!.y);
        if (d2 > this.CONV_RANGE * this.CONV_RANGE) {
          // цель убегает — догоняем, прогресс замирает (не сбрасывается сразу)
          u.convT = Math.max(0, (u.convT ?? 0) - dt * 0.5);
          t!.convProg = (u.convT ?? 0) / this.CONV_TIME;
          this.moveTowardPath(u, t!.x, t!.y, dt, this.CONV_RANGE - 20);
          if ((u.convT ?? 0) <= 0 && d2 > (this.CONV_RANGE * 2.5) ** 2) this.stopConvert(u); // ушла слишком далеко
          return;
        }
        // стоим и камлаем
        u.convT = (u.convT ?? 0) + dt;
        t!.convertedBy = u.id;
        t!.convProg = Math.min(1, u.convT / this.CONV_TIME);
        u.atkAnim = Math.min(1, u.atkAnim + dt * 3);
        u.face = t!.x >= u.x ? 1 : -1;
        if (Math.random() < dt * 9) this.spark(t!.x + rand(-12, 12), t!.y - rand(6, 26), '#c4b5fd');
        if (u.convT >= this.CONV_TIME) this.finishConvert(u, t!);
        return;   // во время камлания имам не лечит
      }
    }
    // ИИ-имам (джунгары) сам ищет жертву для камлания — иначе механика была бы
    // односторонней: игрок переманивает, а его переманить некому
    if (u.owner !== 'player' && u.convTarget == null && this.atWar) {
      let best: Unit | null = null; let bd = this.CONV_RANGE * this.CONV_RANGE;
      for (const e of this.units) {
        if (!this.hostile(u.owner, e.owner) || e.hp <= 0) continue;
        if (e.key === 'wolf' || e.key === 'sheep' || e.key === 'cow' || e.key === 'deer') continue;
        if (e.convertedBy != null) continue;           // уже обрабатывают
        const d = dist2(u.x, u.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) { u.convTarget = best.id; u.convT = 0; }
    }
    // добрался ли до точки движения
    if (u.state === 'move' || u.state === 'attackmove') {
      if (this.moveTowardPath(u, u.tx, u.ty, dt)) u.state = 'idle';
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

  // приказ имаму: начать камлание над вражеским юнитом
  orderConvert(monks: Unit[], target: Unit): boolean {
    if (target.hp <= 0) return false;
    // скот/дичь/волков не обращают — только людей противника
    if (target.key === 'wolf' || target.key === 'sheep' || target.key === 'cow' || target.key === 'deer') return false;
    let any = false;
    for (const m of monks) {
      if (m.key !== 'monk' || m.owner === target.owner) continue;
      this.stopConvert(m);
      m.convTarget = target.id; m.convT = 0;
      m.state = 'move'; m.tx = target.x; m.ty = target.y; m.targetU = -1; m.targetB = -1;
      any = true;
    }
    if (any) {
      this.sound.select();
      this.spawnRing(target.x, target.y, '#c4b5fd');
      this.floater(target.x, target.y - 40, '☾ Камлание', '#c4b5fd', 14);
    }
    return any;
  }
  // прервать камлание (имам убит/отвлёкся/цель ушла)
  stopConvert(m: Unit) {
    if (m.convTarget != null) {
      const t = this.units.find(x => x.id === m.convTarget);
      if (t && t.convertedBy === m.id) { t.convertedBy = undefined; t.convProg = undefined; }
    }
    m.convTarget = undefined; m.convT = 0;
  }
  // успешное обращение: юнит меняет владельца
  finishConvert(m: Unit, t: Unit) {
    const wasOwner = t.owner;
    t.owner = m.owner;
    t.convertedBy = undefined; t.convProg = undefined;
    t.targetU = -1; t.targetB = -1; t.state = 'idle'; t.tribe = false; t.aggro = false;
    t.homeX = t.x; t.homeY = t.y; t.patrolX = t.x; t.patrolY = t.y;
    // обращённый крестьянин перестаёт быть пастухом чужого загона
    t.herder = false; t.penId = undefined; t.pastureId = undefined;
    m.converts = (m.converts ?? 0) + 1;
    this.stopConvert(m);
    this.burst(t.x, t.y - 14, 16, ['#c4b5fd', '#e9d5ff', '#fff'], 110, 0.9);
    this.spawnRing(t.x, t.y, '#c4b5fd');
    this.sound.heal();
    if (m.owner === 'player') {
      this.score += 120;
      this.floater(t.x, t.y - 40, `☾ ${UNIT_DEFS[t.key].name} обращён!`, '#e9d5ff', 15);
      this.pushBanner('☾ Камлание удалось', `Имам обратил врага: ${UNIT_DEFS[t.key].name} теперь ваш`, 3.5);
    } else if (wasOwner === 'player') {
      // нас обокрали — это важное событие, поднимаем тревогу
      this.raiseAlert(t.x, t.y, `Имам джунгар переманил: ${UNIT_DEFS[t.key].name}`);
    }
    this.pushHud();
  }

  // ── ТРЕВОГА «НАС АТАКУЮТ!» (AoE): гудок + маркер на миникарте + прыжок камеры ──
  raiseAlert(x: number, y: number, sub = 'Ваши владения под ударом') {
    // не спамим: одна тревога не чаще, чем раз в 12 секунд
    if (this.time - this.lastAlertT < 12) return;
    this.lastAlertT = this.time;
    this.alert = { x, y, t: 0, sub };
    this.pushBanner('⚠️ Нас атакуют!', sub, 4);
    this.sound.alarm();
    this.pushHud();
  }
  // прыжок камеры к месту последней тревоги (клик по баннеру/маркеру)
  jumpToAlert() {
    if (!this.alert) return;
    this.centerOn(this.alert.x, this.alert.y);
    this.sound.select();
  }

  // ── КӨПЕС (торговец): караван «свой базар → партнёр → базар» ──
  // Партнёр — становище дружественного племени (tribeRel === 'friend') либо ставка соперника
  // при действующем торговом договоре. Выручка зависит от длины плеча: дальний путь выгоднее.
  private tradePartner(u: Unit): Bld | null {
    let best: Bld | null = null; let bd = -1;
    for (const b of this.blds) {
      if (b.hp <= 0 || b.done < 1) continue;
      let nid: string | null = null;
      if (b.tribe) {
        nid = this.tribeNationOf(b);
        if (!nid || this.tribeRel[nid] !== 'friend') continue; // торгуем только с друзьями
      } else if (b.owner === 'enemy') {
        if (!this.tradeRoute || this.atWar) continue;          // с соперником — только по договору
        if (b.key !== 'towncenter' && b.key !== 'market') continue;
        nid = 'rival';
      } else continue;
      // самый дальний партнёр в разумных пределах — длинное плечо приносит больше золота
      const d = dist2(u.x, u.y, b.x, b.y);
      if (d > 9000 * 9000) continue;
      if (d > bd) { bd = d; best = b; }
    }
    return best;
  }

  updateTrader(u: Unit, dt: number) {
    const home = this.blds.find(b => b.id === u.trHomeB && b.key === 'market' && b.done >= 1 && b.hp > 0)
      ?? this.blds.find(b => b.owner === u.owner && b.key === 'market' && b.done >= 1 && b.hp > 0);
    if (!home) { // базар снесли — торговец просто стоит (можно увести вручную)
      if (u.state === 'move') { if (this.moveTowardPath(u, u.tx, u.ty, dt)) u.state = 'idle'; }
      return;
    }
    u.trHomeB = home.id;
    if (!u.trPhase) u.trPhase = 'out';

    // цель маршрута: партнёр (ищем редко — обход всех зданий недёшев)
    let dest = u.trDestB != null ? this.blds.find(b => b.id === u.trDestB && b.hp > 0 && b.done >= 1) : undefined;
    if (dest && dest.tribe) { // дружба могла оборваться — тогда каравану туда нельзя
      const nid = this.tribeNationOf(dest);
      if (!nid || this.tribeRel[nid] !== 'friend') dest = undefined;
    }
    if (!dest && u.trPhase === 'out') {
      u.trScanT = (u.trScanT ?? 0) + dt;
      if (u.trScanT > 1.5) {
        u.trScanT = 0;
        const p = this.tradePartner(u);
        if (p) { u.trDestB = p.id; u.trNation = p.tribe ? (this.tribeNationOf(p) ?? undefined) : 'rival'; dest = p; }
      }
      if (!dest) { // партнёров нет — ждём у базара
        u.wkind = undefined;
        if (dist2(u.x, u.y, home.x, home.y) > 120 * 120) this.moveTowardPath(u, home.x, home.y, dt, 40);
        return;
      }
    }

    // «торг» в точке назначения — короткая пауза с монетками
    if (u.trWaitT && u.trWaitT > 0) {
      u.trWaitT -= dt;
      u.atkAnim = Math.min(1, u.atkAnim + dt * 4);
      if (Math.random() < 0.06) this.spark(u.x + rand(-10, 10), u.y - 20, '#fde047');
      return;
    }

    if (u.trPhase === 'out' && dest) {
      if (this.moveTowardPath(u, dest.x, dest.y, dt, dest.size / 2 + 20)) {
        // догрузились: выручка тем больше, чем дальше плечо (как торговые повозки в AoE)
        const leg = Math.hypot(dest.x - home.x, dest.y - home.y);
        let bonus = this.hasTech('coinage') ? 1.35 : 1;
        if (this.bonusTier('trade', 3)) bonus *= 1.5; // союз торговых народов: караваны богаче
        u.trGold = Math.round(Math.min(90, 14 + leg / 22) * bonus);
        u.trPhase = 'back'; u.trWaitT = 1.2;
        this.burst(u.x, u.y - 18, 6, ['#fde047', '#facc15', '#fff7cc'], 60, 0.6);
      }
      return;
    }

    // возвращаемся на свой базар и сдаём выручку
    if (this.moveTowardPath(u, home.x, home.y, dt, home.size / 2 + 18)) {
      const g = u.trGold ?? 0;
      if (g > 0) {
        const bank = u.owner === 'enemy' ? this.eres : this.res;
        bank.gold += g;
        if (u.owner === 'player') {
          this.score += g * 0.4;
          this.floater(u.x, u.y - 28, `+${g} 🪙`, '#fde047', 14);
          this.sound.coin();
          this.checkQuests();
        }
      }
      u.trGold = 0; u.trPhase = 'out'; u.trWaitT = 1; u.trDestB = undefined; // следующий круг
    }
  }

  // скот/дичь: пасутся рядом с домом и убегают от опасности
  updateAnimal(u: Unit, dt: number) {
    // скот, которого гонит пастух: идём к точке притяжения (пастбище/загон),
    // не пугаемся пастуха и не блуждаем вокруг спавна. Цель держим, пока есть пастух.
    if ((u.key === 'sheep' || u.key === 'cow') && u.pastureId != null && u.herdX != null) {
      const dx = u.herdX - u.x, dy = u.herdY! - u.y, d = Math.hypot(dx, dy);
      // Плавный подход (arrival): у самой цели скорость гаснет, поэтому животное НЕ пролетает
      // точку и не «пилит» туда-сюда. Ниже 1.2 ед. — полный покой (скот стоит в загоне).
      if (d > 1.2) {
        // к загону идём быстрее (бегут впереди пастуха), на пастбище — спокойно пасутся
        const driving = this.units.some(h => h.herder && (h.herdState === 'home' || h.herdState === 'back'));
        const sp = Math.min(driving ? 135 : Math.min(u.speed, 95), d * 3);
        const step = Math.min(sp * dt, d);
        u.x += (dx / d) * step; u.y += (dy / d) * step;
        if (Math.abs(dx) > 4 && step > 0.05) u.face = dx > 0 ? 1 : -1;
      }
      return;
    }
    // стадо без активной цели, но приписанное к загону — пасётся вокруг пастбища
    if ((u.key === 'sheep' || u.key === 'cow') && u.pastureId != null) {
      const pen = this.blds.find(b => b.id === u.pastureId);
      if (pen && pen.pastureX != null) {
        u.wx = pen.pastureX; u.wy = pen.pastureY!; // дом = пастбище, бродим вокруг него
      }
    }
    const isDeer = u.key === 'deer';
    const skittish = isDeer ? 150 : 120;
    // ищем угрозу рядом: волк/воин для всех; для оленя — ещё и охотящийся крестьянин
    // (скот/корова не пугаются рабочих и остаются лёгкой добычей)
    const threatFrom = (e: Unit): boolean => {
      if (e.owner === 'neutral' || e.hp <= 0) return false;
      if (e.key === 'monk') return false;
      if (e.key === 'villager') return isDeer && !!e.hunt;
      return true;
    };
    let flee = false;
    for (const e of this.units) {
      if (threatFrom(e) && dist2(u.x, u.y, e.x, e.y) < skittish * skittish) { flee = true; break; }
    }
    if (flee) {
      // бежим от ближайшего врага
      let threat: Unit | undefined; let bd = skittish * skittish;
      for (const e of this.units) { if (!threatFrom(e)) continue; const d = dist2(u.x, u.y, e.x, e.y); if (d < bd) { bd = d; threat = e; } }
      if (threat) {
        const dx = u.x - threat.x, dy = u.y - threat.y, d = Math.max(1, Math.hypot(dx, dy));
        // олень быстрее скота, но не недостижим для крестьян (118): группа догоняет/загоняет
        const sp = u.key === 'deer' ? 135 : 120;
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
      if (e.key === 'scout') continue; // разведчик не добыча: волки его не чуют (иммунитет)
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
    // leash + wander (зверь бродит и по горам — иначе застрял бы у подножия)
    if (dist2(u.x, u.y, u.wx, u.wy) > 220 * 220) { u.x += Math.sign(u.wx - u.x) * u.speed * dt; u.y += Math.sign(u.wy - u.y) * u.speed * dt; return; }
    u.idleT += dt;
    if (u.idleT > rand(2, 4)) { u.idleT = 0; u.tx = u.wx + rand(-90, 90); u.ty = u.wy + rand(-90, 90); }
    u.x += Math.sign(u.tx - u.x) * u.speed * dt; u.y += Math.sign(u.ty - u.y) * u.speed * dt;
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
      // батальный шум рукопашной — ТОЛЬКО против разумных юнитов (воины/войска/племя),
      // не против зверей (волки/скот/дичь): охота на животных звучит иначе
      const vsAnimal = tu && tu.owner === 'neutral' && !tu.tribe;
      if (!vsAnimal) this.sound.battleClash();
      const hx = tu ? tu.x : tb ? tb.x : att.x + att.face * 20, hy = (tu ? tu.y : tb ? tb.y : att.y) - 10;
      this.burst(hx, hy, 4, ['#fecaca', '#fff', '#f87171'], 90, 0.4);
    }
  }

  damageUnit(t: Unit, dmg: number, from?: Unit) {
    if (t.hp <= 0) return;
    // удар по воину нейтрального племени — всё племя рядом мстит
    if (t.tribe && from) this.provokeTribe(t.x, t.y, from);
    t.hp -= dmg;
    // ТРЕВОГА: наших бьют за кадром — игрок иначе не заметит (классика AoE)
    if (t.owner === 'player' && from && from.owner !== 'player' && !this.inView(t.x, t.y, 40)) {
      this.raiseAlert(t.x, t.y, t.key === 'villager' ? 'Шаруа под ударом!' : 'Ваши воины в бою');
    }
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
    // крестьянин, которого атаковали (воином/волком), обороняется: даёт сдачи обидчику
    if (t.key === 'villager' && from && from.hp > 0 && this.hostile(t.owner, from.owner)) {
      if (t.state !== 'attackmove') { t.targetU = from.id; t.state = 'attackmove'; }
    }
    if (t.owner === 'neutral' && from) { /* wolves handled by proximity */ }
    if (t.hp <= 0) this.killUnit(t, from?.owner, from);
  }

  damageBld(b: Bld, dmg: number, byOwner: 'player' | 'enemy' | 'neutral') {
    if (b.hp <= 0) return;
    if (b.done < 1) dmg *= 1.6;
    // атака по постройке нейтрального племени тоже разозляет племя
    if (b.tribe) {
      const attacker = this.units.find(u => u.owner === byOwner && u.key !== 'villager') || this.units.find(u => u.owner === byOwner);
      if (attacker) this.provokeTribe(b.x, b.y, attacker);
    }
    b.hp -= dmg; b.flash = 1;
    if (b.owner === 'player') {
      this.dmgFlash = Math.min(0.6, this.dmgFlash + 0.09); this.trauma = Math.min(1, this.trauma + 0.06);
      if (byOwner !== 'player' && !this.inView(b.x, b.y, 60)) {
        this.raiseAlert(b.x, b.y, `${BUILDING_DEFS[b.key].name} под ударом!`);
      }
    }
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
    // убитый имам прерывает камлание (контрмера противника), а убитая цель —
    // снимает прогресс со своего имама, иначе полоса «зависает» над трупом
    if (t.key === 'monk' && t.convTarget != null) this.stopConvert(t);
    if (t.convertedBy != null) {
      const m = this.units.find(x => x.id === t.convertedBy);
      if (m) this.stopConvert(m);
    }
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
    this.floater(b.x, b.y - 70, b.key === 'towncenter' ? '💥 ХАНСКАЯ СТАВКА УНИЧТОЖЕНА!' : `💥 ${BUILDING_DEFS[b.key].name} разрушен(о)!`, '#f87171', b.key === 'towncenter' ? 24 : 17);
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
        // союз с научными племенами (ур.3) ускоряет возведение построек
        if (b.owner === 'player' && this.bonusTier('science', 3)) rate *= 1.2;
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
            this.sound.playPhrase('сделаю в лучшем виде'); // рабочий рапортует о постройке
            for (const u of this.units) if (u.buildId === b.id && u.owner === 'player') { u.buildId = -1; u.state = 'idle'; }
            if (b.key === 'wonder') { // Чудо света достроено — отсчёт удержания до победы!
              this.wonderT = this.WONDER_HOLD;
              this.atWar = true; this.casusBelli = 1.1; this.morale = 1.12;
              this.sound.ageup();
              this.pushBanner('⭐ МАВЗОЛЕЙ ХАНА ВОЗВЕДЁН!', `Защитите монумент ${Math.round(this.WONDER_HOLD / 60)} мин — и ханство победит! Джунгары идут на штурм!`, 6);
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
        b.research.t += dt * this.researchMult();
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
              u.tx = rallyN.x; u.ty = rallyN.y; u.carry.type = rallyN.kind === 'fish' ? 'food' : rallyN.kind; u.gatherT = 0;
            } else if (q.key === 'trader') {
              // көпес выходит с базара и сразу встаёт на круговой маршрут
              u.trHomeB = b.id; u.trPhase = 'out'; u.state = 'idle'; u.trWaitT = 0.6;
            } else {
              u.tx = b.rallyX; u.ty = b.rallyY; u.state = 'move';
            }
            if (owner === 'player' && q.key !== 'villager') { this.soldiersTrained++; this.checkQuests(); }
            this.burst(sx, b.y, 10, ['#fff', '#f6d47c'], 80, 0.5);
            if (owner === 'player') {
              this.sound.train();
              // реплика при выходе из здания: воин из казармы — «Я готов», крестьянин — отклик рабочего
              if (q.key === 'villager') {
                // «Чего изволите» / «слушаю» — случайно
                this.sound.playPhrase(Math.random() < 0.5 ? 'чего изволите' : 'слушаю');
              } else if (b.key === 'barracks' || b.key === 'stable' || b.key === 'blacksmith' || b.key === 'towncenter') {
                this.sound.playPhrase('готов');
              }
            }
          }
        }
      }
      // defense
      const atk = BUILDING_DEFS[b.key].attack;
      // далёкие нейтральные башни племён спят — не сканируют цели (огромная карта, много лагерей)
      const dormantBld = b.owner === 'neutral' && !this.activeZone(b.x, b.y, atk ? atk.range + 1800 : 2200);
      if (atk && !dormantBld) {
        const up = b.upg;
        const rangeUp = b.owner === 'player' && up ? 1 + up.range * 0.18 : 1;
        const dmgUp = b.owner === 'player' && up ? 1 + up.dmg * 0.35 : 1;
        const archers = b.owner === 'player' && up ? up.archers : 0; // лучники: до 2 доп. залпов
        b.cd -= dt;
        const tRange = atk.range * (b.owner === 'player' ? this.rangeMult(b.key, b.owner) : 1) * rangeUp;
        if (b.cd <= 0) {
          let best: Unit | null = null; let bd = tRange * tRange;
          for (const e of this.units) {
            if (e.owner === b.owner || e.hp <= 0 || !this.hostile(b.owner, e.owner)) continue;
            if (e.owner === 'neutral' && e.key !== 'wolf' && !(e.tribe && e.aggro)) continue; // скот не трогаем
            // башни игрока не стреляют по дружественному племени
            if (b.owner === 'player' && e.tribe) { const nid = this.unitTribeNation(e); if (nid && this.tribeRel[nid] === 'friend') continue; }
            // башня нейтрального племени молчит, пока племя не разозлено атакой
            if (b.owner === 'neutral' && !this.tribeAggro(b.x, b.y)) continue;
            const d = dist2(b.x, b.y - 20, e.x, e.y);
            if (d < bd) { bd = d; best = e; }
          }
          if (best) {
            // гарнизон усиливает защиту: каждый укрытый +12% к скорости стрельбы
            const gar = b.garrison.length;
            b.cd = atk.cd / (1 + Math.min(gar, 6) * 0.12) / (archers ? 1 + archers * 0.25 : 1);
            const dx = best.x - b.x, dy = best.y - b.y;
            const ang0 = Math.atan2(dy, dx);
            const garDmg = 1 + Math.min(gar, 6) * 0.08;
            const ageM = b.owner === 'player' ? AGES[this.age].mult : AGES[this.eage].mult;
            const baseDmg = atk.dmg * ageM * garDmg * dmgUp;
            // залпы: основной + до 2 от лучников (короткий веер по цели)
            const salvo = 1 + archers;
            for (let s = 0; s < salvo; s++) {
              const spread = s === 0 ? 0 : (s === 1 ? 0.12 : -0.12);
              const px0 = b.x + rand(-8, 8), py0 = b.y - 52 - s * 6;
              const ang = ang0 + spread;
              this.projs.push({ x: px0, y: py0, vx: Math.cos(ang) * 470, vy: Math.sin(ang) * 470, tx: best.x, ty: best.y, targetU: best.id, targetB: -1, dmg: baseDmg * (s === 0 ? 1 : 0.7), owner: b.owner, life: 1.2, kind: b.key === 'towncenter' ? 'rock' : 'bolt' });
            }
            this.sound.arrow();
            if (archers && Math.random() < 0.3) this.burst(b.x, b.y - 46, 3, ['#fde68a', '#fff'], 60, 0.4);
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
    // имена с учётом ступени врага — игрок сразу видит, что идёт тяжёлая пехота
    return order.filter(k => cnt[k]).map(k => `${cnt[k]}×${this.unitName(k, 'enemy')}`).join(', ');
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
      // во время войны торговля/дань/пакт заморожены
      this.tradeRoute = false; this.tributeT = 0;
      // если войну объявили незаслуженно, а мы слабее — ИИ готов к миру
      if (this.warT > 45 && this.casusBelli < 0.4 && em < pm * 1.15) {
        this.sueForPeace(true);
      }
      return;
    }

    // ── МИР: таймеры дипломатии ──
    this.peaceT += 5;
    // пока народы НЕ встретились — никакой неприязни/поводов/войны (Civilization-стиль):
    // сосед вообще не знает о нашем существовании
    if (!this.rivalMet) { this.grievance = Math.min(this.grievance, 8); this.casusBelli = 0; return; }
    // пакт о ненападении отсчитывает время
    if (this.napT > 0) this.napT = Math.max(0, this.napT - 5);
    // торговый договор: пассивный доход обеим сторонам (золото), лёгкое потепление
    if (this.tradeRoute) {
      this.tradeT += 5;
      if (this.tradeT >= 8) {
        this.tradeT -= 8;
        this.res.gold += 6;
        this.eres.gold += 4;
        if (Math.random() < 0.5) this.sound.coin();
        // торговля медленно снижает неприязнь
        this.grievance = Math.max(0, this.grievance - 1.2);
      }
    }
    // дань с соседа: сильный игрок собирает золото, сосед злится
    if (this.tributeT > 0) {
      this.tributeT -= 5;
      if (this.tributeT <= 0) {
        this.tributeT = 0;
        this.res.gold += this.tributeGold;
        this.floater(this.cam.x, this.cam.y - 110, `💰 Дань: +${this.tributeGold}🪙`, '#fde047', 16, true);
        this.sound.coin();
        // унижение данью копит неприязнь (повод для будущей войны)
        this.grievance = Math.min(100, this.grievance + 6);
        this.casusBelli = Math.max(this.casusBelli, 0.35);
      }
    }
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
    const army = this.units.filter(u => u.owner === 'player' && this.combatUnit(u)).length;
    if (army > 24) g += diff.aiAggression * 0.4;
    // лёгкий фоновый дрейф с течением времени (торговля гасит неприязнь — уже учтена выше)
    g += 0.25 + diff.aiAggression * 0.15;
    this.grievance = Math.min(100, this.grievance + g);

    // копим повод (casus belli)
    if (this.age > this.eage) this.casusBelli = Math.max(this.casusBelli, 0.6);
    if (pm > em * 1.6) this.casusBelli = Math.max(this.casusBelli, 0.75);
    if (wonder) this.casusBelli = Math.max(this.casusBelli, 1.0);
    if (this.peaceT > 260) this.casusBelli = Math.min(1, this.casusBelli + 0.08); // «старые счёты»
    // ОСУЖДЕНИЕ игрока: сосед копит обиду, но публичное порицание лишает его «чистого
    // повода» — casus belli режется вдвое (его агрессия выглядит безосновательной)
    if (this.condemned) this.casusBelli = Math.min(this.casusBelli, 0.5);

    // объявление войны: высокая неприязнь + достаточно повода + мы не сильно слабее.
    // Пакт о ненападении полностью запрещает ИИ объявлять войну, пока действует.
    // ВАЖНО (Civilization-стиль): пока народы НЕ встретились, войны быть не может —
    // набеги стартуют только после контакта с джунгарами.
    const wantsWar = this.rivalMet && this.napT <= 0 && this.grievance >= 62 && this.casusBelli >= 0.5 && em >= pm * 0.7;
    if (wantsWar) {
      let reason = 'вам объявили войну';
      if (wonder) reason = 'ваш Мавзолей хана угрожает их господству';
      else if (this.age > this.eage) reason = 'вы обогнали их в развитии';
      else if (pm > em * 1.6) reason = 'вы слишком сильны — джунгары бьют на упреждение';
      else reason = 'накопились территориальные споры';
      this.declareWar(reason, this.casusBelli);
    }
  }

  // ИИ объявляет войну игроку
  declareWar(reason: string, cb: number) {
    if (this.over) return;
    this.atWar = true;
    // пакт о ненападении нарушен — у стороны-жертвы полное право на войну,
    // торговля и дань прекращаются
    this.tradeRoute = false; this.tributeT = 0;
    this.casusBelli = cb;
    this.warT = 0;
    // боевой дух: при справедливой причине армия ИИ сильнее, при надуманной — слабее
    this.morale = 0.72 + 0.4 * cb;
    this.sound.horn();
    const just = cb >= 0.85;
    this.pushBanner(
      just ? '⚔️ ВОЙНА ОБЪЯВЛЕНА!' : '⚠️ ВЕРОЛОМНОЕ НАПАДЕНИЕ!',
      `Джунгары напали: ${reason}. ${just ? 'Их армия сражается с полным боевым духом.' : 'Повод надуман — их войска неуверенны (−боевая мощь).'}`,
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
    this.pushBanner('🤝 Дары отправлены', 'Хунтайджи доволен — неприязнь снижена, война отсрочена', 3);
    this.pushHud();
    return true;
  }

  // ── ТОРГОВЫЙ ДОГОВОР между городами: пассивное золото + медленное потепление ──
  openTradeRoute(): boolean {
    if (this.over || this.atWar) { this.floater(this.cam.x, this.cam.y - 100, 'Нельзя торговать во время войны', '#f87171', 15); this.sound.error(); return false; }
    if (this.tradeRoute) { this.floater(this.cam.x, this.cam.y - 100, 'Торговля уже идёт', '#94a3b8', 14); return false; }
    if (!this.marketCount()) { this.floater(this.cam.x, this.cam.y - 100, 'Нужен Базар для торговли!', '#f87171', 15); this.sound.error(); return false; }
    const cost = 60;
    if (this.res.gold < cost) { this.floater(this.cam.x, this.cam.y - 100, `Нужно ${cost} 🪙 на караван`, '#f87171', 15); this.sound.error(); return false; }
    this.res.gold -= cost;
    this.tradeRoute = true; this.tradeT = 0;
    this.grievance = Math.max(0, this.grievance - 10);
    this.sound.coin();
    this.pushBanner('🐪 Торговый договор заключён', 'Караваны ходят между городами: пассивное золото обеим сторонам и рост доверия', 4);
    this.pushHud();
    return true;
  }

  // ── ПАКТ О НЕНАПАДЕНИИ: ИИ не объявляет войну, пока действует; нарушение = большой повод у игрока ──
  signNAP(): boolean {
    if (this.over || this.atWar) { this.floater(this.cam.x, this.cam.y - 100, 'Сначала заключите мир', '#f87171', 15); this.sound.error(); return false; }
    if (this.napT > 0) { this.floater(this.cam.x, this.cam.y - 100, `Пакт действует ещё ${Math.ceil(this.napT)}с`, '#94a3b8', 14); return false; }
    const cost = 120;
    if (this.res.gold < cost) { this.floater(this.cam.x, this.cam.y - 100, `Нужно ${cost} 🪙 на посольство`, '#f87171', 15); this.sound.error(); return false; }
    this.res.gold -= cost;
    this.napT = 120; // 2 минуты гарантированного мира
    this.grievance = Math.max(0, this.grievance - 6);
    this.sound.quest();
    this.pushBanner('📜 Пакт о ненападении подписан', 'Джунгары не нападут ~2 минуты. Если хунтайджи нарушит слово — у вас будет полное право на войну', 4.5);
    this.pushHud();
    return true;
  }

  // ── ОСУДИТЬ соседа: публичное порицание. Лишает ИИ «чистого повода» (его будущая
  //    агрессия несправедлива → низкий боевой дух), но слегка поднимает неприязнь ──
  condemnNeighbor(): boolean {
    if (this.over || this.atWar) { this.floater(this.cam.x, this.cam.y - 100, 'Осуждение имеет смысл в мирное время', '#94a3b8', 14); return false; }
    if (this.condemned) { this.floater(this.cam.x, this.cam.y - 100, 'Джунгары уже осуждены', '#94a3b8', 14); return false; }
    this.condemned = true;
    this.grievance = Math.min(100, this.grievance + 12);
    this.casusBelli = Math.min(this.casusBelli, 0.5);
    this.sound.ack('soldier');
    this.pushBanner('📢 ДЖУНГАРЫ ОСУЖДЕНЫ', 'Ваше порицание озвучено на всю степь: теперь у хунтайджи нет «чистого повода» для войны (его атака будет вероломной → низкий боевой дух), но он раздражён', 4.5);
    this.pushHud();
    return true;
  }

  // ── ПОТРЕБОВАТЬ ДАНЬ: сильная империя выжимает золото у соседа (сразу + со временем).
  //    Доступно при военном превосходстве; унижение копит обиду соседа ──
  demandTribute(): boolean {
    if (this.over || this.atWar) { this.floater(this.cam.x, this.cam.y - 100, 'Дань требуют с позиции силы в мирное время', '#94a3b8', 14); return false; }
    const pm = this.milStrength('player'), em = this.milStrength('enemy');
    if (pm < em * 1.25) { this.floater(this.cam.x, this.cam.y - 100, 'Хунтайджи не считает вас сильнее — наберите войско', '#f87171', 15); this.sound.error(); return false; }
    const immediate = 80 + Math.min(120, Math.round((pm - em) / 25));
    this.res.gold += immediate;
    this.tributeT = 30; this.tributeGold = Math.round(immediate * 0.6);
    this.grievance = Math.min(100, this.grievance + 14);
    this.casusBelli = Math.max(this.casusBelli, 0.4);
    this.sound.coin();
    this.pushBanner('💰 Дань получена', `Джунгары выплачивают +${immediate}🪙 сразу и будут платить ещё. Но унижение не забыто — копится обида`, 4);
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
    // мир обнуляет взаимные претензии: осуждение снимается, пакт/дань/торговля сброшены
    this.condemned = false; this.napT = 0; this.tributeT = 0; this.tradeRoute = false;
    this.sound.quest();
    this.pushBanner('🕊️ Мир заключён', auto ? 'Хунтайджи сам запросил мир — война была несправедливой' : 'Переговоры успешны — у вас снова мир', 4);
    // вражеские войска возвращаются к обороне
    for (const u of this.units) if (u.owner === 'enemy' && u.key !== 'villager') { u.state = 'idle'; u.targetU = -1; u.targetB = -1; }
    this.waveT = DIFF[this.difficulty].waveInterval;
    this.pushHud();
    return true;
  }

  // игрок сам напал в мирное время (клик по врагу) — это даёт ИИ полный повод
  onPlayerAggression() {
    if (this.over) return;
    // нападение на соперника = насильственное знакомство: народ теперь известен (без приветствия)
    if (!this.rivalMet) { this.rivalMet = true; this.greetShown.add('rival'); }
    if (!this.atWar) {
      this.declareWar('вы первыми нарушили мир', 1.1);
      // мы агрессоры — у ИИ ополчение обороняется решительно
      this.pushBanner('Вы начали войну', 'Теперь джунгары сражаются за свою землю с высоким боевым духом', 4);
    }
  }

  launchWave() {
    this.wave++;
    const comp = this.waveComp();
    const etc = this.blds.find(b => b.owner === 'enemy' && b.key === 'towncenter');
    const ptc = this.blds.find(b => b.owner === 'player' && b.key === 'towncenter');
    const sx = etc ? etc.x - 120 : RIVAL.x - 300, sy = etc ? etc.y + 60 : RIVAL.y;
    for (const k of comp) {
      if (this.popUsed('enemy') >= this.popCap('enemy')) break;
      const u = this.addUnit(k, 'enemy', sx + rand(-60, 60), sy + rand(-50, 50));
      u.state = 'attackmove';
      u.tx = (ptc ? ptc.x : HOME.x) + rand(-80, 80); u.ty = (ptc ? ptc.y : HOME.y) + rand(-80, 80);
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
    // отдыхающие в смене НЕ простаивают — иначе счётчик простоя врал бы, а кнопка
    // «Простой»/«За работу» срывала бы людей с законного отдыха
    const idleVills = this.units.filter(u => u.owner === 'player' && u.key === 'villager' && !u.resting && (u.state === 'idle' || u.state === 'move')).length;
    const next = AGES[this.age + 1];
    this.onHud({
      wood: Math.floor(this.res.wood), food: Math.floor(this.res.food), gold: Math.floor(this.res.gold),
      pop: this.popUsed('player'), popCap: this.popCap('player'),
      age: this.age, ageName: AGES[this.age].name, score: Math.round(this.score), kills: this.kills, razed: this.razed,
      timeSec: Math.floor(this.time), wave: this.wave, nextWave: Math.max(0, Math.ceil(this.waveT)), enemyAge: this.eage,
      sel, placement: this.placement, attackArmed: this.attackArmed, rallyArmed: this.rallyArmed, patrolArmed: this.patrolArmed, panMode: this.panMode, camFollow: this.camFollow,
      banner,
      quests: [
        { id: 'wood', label: 'Нарубить 60 🪵', done: !!this.questsDone.wood, progress: `${Math.min(60, Math.floor(this.woodGathered))}/60` },
        { id: 'army', label: 'Собрать 3 сарбазов', done: !!this.questsDone.army, progress: `${Math.min(3, this.soldiersTrained)}/3` },
        { id: 'rax', label: 'Построить казармы (E)', done: !!this.questsDone.rax, progress: this.barracksBuilt ? '1/1' : '0/1' },
        { id: 'wolf', label: 'Убить 4 волка', done: !!this.questsDone.wolf, progress: `${Math.min(4, this.wolvesSlain)}/4` },
        { id: 'age', label: 'Открыть Век жузов (T)', done: !!this.questsDone.age, progress: this.age >= 1 ? '1/1' : '0/1' },
      ],
      muted: this.muted, idleVills, relics: this.relicsHeld,
      pTc: ptc ? Math.max(0, Math.ceil(ptc.hp)) : 0, pTcMax: ptc ? ptc.maxHp : 1,
      eTc: etc ? Math.max(0, Math.ceil(etc.hp)) : 0, eTcMax: etc ? etc.maxHp : 1,
      dmgFlash: this.dmgFlash,
      ageAfford: next?.cost ? this.res.food >= next.cost.food && this.res.gold >= (next.cost.gold || 0) : false,
      ageCost: next?.cost ? `${next.cost.food}🍖${next.cost.gold ? ` ${next.cost.gold}🪙` : ''}` : 'MAX',
      hint: this.hint,
      atWar: this.atWar, grievance: Math.round(this.grievance), casusBelli: this.casusBelli, morale: this.morale,
      tradeRoute: this.tradeRoute, napT: Math.ceil(this.napT), condemned: this.condemned, tributeT: Math.ceil(this.tributeT),
      hasMarket: this.marketCount() > 0,
      woodDiscount: this.woodDiscount(),
      playerPow: Math.round(this.milStrength('player')), enemyPow: Math.round(this.milStrength('enemy')),
      wonderT: Math.max(0, Math.ceil(this.wonderT)), wonderHold: this.WONDER_HOLD,
      techTree: this.techTreeData(),
      nations: this.nationsHud(),
      audience: this.audienceId ? this.audienceHud(this.audienceId) : null,
      greeting: this.greeting ? (() => {
        const d = NATION_BY_ID[this.greeting!.nationId];
        return d ? { id: d.id, name: d.name, ruler: d.ruler, title: d.title, portrait: d.portrait, greet: d.greet,
          choices: d.choices.map(c => ({ id: c.id, label: c.label, desc: c.desc, gold: c.gold })) } : null;
      })() : null,
      scouts: this.units.filter(u => u.owner === 'player' && u.key === 'scout').length,
      event: this.event ? (() => {
        const d = this.eventDefs().find(e => e.id === this.event!.id);
        return d ? { id: d.id, icon: d.icon, title: d.title, text: d.text, opts: d.opts } : null;
      })() : null,
      drought: Math.ceil(this.droughtT), plague: Math.ceil(this.plagueT),
      alertHud: this.alert ? { sub: this.alert.sub, t: Math.ceil(this.alert.t) } : null,
      unitNames: { swordsman: this.unitName('swordsman', 'player'), spearman: this.unitName('spearman', 'player'),
        archer: this.unitName('archer', 'player'), cavalry: this.unitName('cavalry', 'player') },
      day: { num: this.dayNum, name: this.dayName(), icon: this.dayIcon(), phase: this.dayPhase(),
        night: this.isNight(),
        resting: this.units.filter(u => u.owner === 'player' && u.key === 'villager' && u.resting).length,
        fresh: this.units.filter(u => u.owner === 'player' && u.key === 'villager' && (u.freshT ?? 0) > 0).length,
        tired: this.units.filter(u => u.owner === 'player' && u.key === 'villager' && (u.fatigue ?? 0) > 0.7 && !u.resting).length },
      pray: { active: this.prayT > 0, t: Math.ceil(this.prayT),
        praying: this.units.filter(u => u.owner === 'player' && u.praying).length,
        bereke: Math.ceil(this.berekeT), berekePct: Math.round(this.berekePower * 15),
        count: this.prayerCount },
    });
  }

  nationsHud(): NationHud[] {
    return NATIONS.map(d => {
      const met = this.metNation(d.id);
      const tkind = d.kind === 'tribe' ? this.tribeKind(d.id) : null;
      return {
        id: d.id, name: d.name, ruler: d.ruler, title: d.title, portrait: d.portrait, color: d.color, greet: d.greet,
        kind: d.kind, met,
        rel: met ? this.relLabel(d.id) : 'Неизвестно',
        atWar: d.id === 'rival' ? this.atWar : this.tribeRel[d.id] === 'hostile',
        power: met ? Math.round(this.nationPower(d.id)) : 0,
        camps: d.kind === 'tribe' ? this.nationCampCount(d.id) : 0,
        gift: d.choices.find(c => c.act === 'gift')?.gold ?? 40,
        canGreet: met,
        envoys: this.envoys[d.id] ?? 0,
        rivalEnvoys: this.rivalEnvoys[d.id] ?? 0,
        envoyLevel: d.kind === 'tribe' ? this.envoyLevel(d.id) : 0,
        envoyNext: d.kind === 'tribe' ? this.envoysToNext(d.id) : 0,
        envoyCost: envoyCost(this.envoys[d.id] ?? 0),
        suzerain: d.kind === 'tribe' ? this.suzerain(d.id) : null,
        typeLabel: tkind ? TRIBE_TYPES[tkind].label : '',
        typeIcon: tkind ? TRIBE_TYPES[tkind].icon : '',
        perks: tkind ? [...TRIBE_TYPES[tkind].levels] : [],
      };
    });
  }

  audienceHud(nid: string): AudienceHud | null {
    const d = NATION_BY_ID[nid];
    if (!d) return null;
    return {
      id: d.id, name: d.name, ruler: d.ruler, title: d.title, portrait: d.portrait, color: d.color,
      kind: d.kind, rel: this.relLabel(nid), atWar: nid === 'rival' ? this.atWar : this.tribeRel[nid] === 'hostile',
      gold: Math.floor(this.res.gold),
    };
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
        towerUpg: b.key === 'tower' && b.owner === 'player' ? {
          range: b.upg?.range ?? 0, dmg: b.upg?.dmg ?? 0, archers: b.upg?.archers ?? 0, maxRange: 3, maxDmg: 3, maxArchers: 2,
        } : undefined,
        research: b.research ? { id: b.research.id, name: (TECHS[b.research.id] ?? UPGRADES[b.research.id])?.name ?? '', t: b.research.t, total: b.research.total } : null,
        techs: b.owner === 'player' ? this.techsFor(b.key).map(id => {
          const t = TECHS[id];
          return { id, name: t.name, desc: t.desc, icon: t.icon, cost: costTxt(t.cost), done: !!this.tech[id], available: this.age >= t.ageReq && this.afford(t.cost), busy: !!b.research };
        }) : [],
        upgrades: b.owner === 'player' ? this.upgradeRows(b.key) : [],
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
      types: [...map.entries()].map(([key, e]) => ({ key, label: this.unitName(key as UnitKey, 'player'), count: e.count, level: e.level, kills: e.kills })),
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

    // ── isometric ground tiles: ГЕКСАГОНАЛЬНАЯ мозаика (flat-top гексы в 2:1) ──
    // Решётка аксиальная (q,r); абсолютный изо-центр гекса — hexCenter(q,r);
    // мировой центр — relief.worldAt(q,r): wx=30q, wy=√3·20·(q/2+r).
    // Каждый кеш-тайл — канвас TILE_CW×TILE_CH с гексом по центру (TCX,TCY).
    // Рисуем в абсолютных (hx,hy) внутри translate(-camIsoX,-camIsoY) — камеру
    // НЕ добавляем; куллинг по экранному смещению (hx-camIX,hy-camIY).
    const margin = Math.max(this.vw, this.vh) / this.cam.zoom + 120;
    const cx0w = this.cam.x - margin, cx1w = this.cam.x + margin;
    const cy0w = this.cam.y - margin, cy1w = this.cam.y + margin;
    // сетка ступеней высоты на видимую область (6 соседей, перепад ≤ 1; вода плоская)
    const relief = this.terrain.reliefGridHex(cx0w, cy0w, cx1w, cy1w);
    const hAtQ = (q: number, r: number) => relief.at(q, r);
    const upAtWorld = (wx: number, wy: number) => relief.hAtWorld(wx, wy) * RELIEF_STEP;
    const upAtQ = (q: number, r: number) => hAtQ(q, r) * RELIEF_STEP;
    // палитра вертикальных граней-ступеней по биому (светлый бок / тёмный бок / подошва)
    const cliffColors = (cls: string): [string, string, string] => {
      switch (cls) {
        case 'mountain': return ['#6e6e78', '#5c5c66', '#3f3f47'];
        case 'hill': return ['#7d7050', '#6a5f44', '#4c4430'];
        case 'desert': return ['#a8843f', '#907036', '#6b5226'];
        case 'sand': return ['#b39c5f', '#9c8850', '#736238'];
        case 'forest': return ['#33532a', '#2b4624', '#1d3018'];
        case 'field': return ['#6f7a36', '#5f692e', '#444c22'];
        case 'water': case 'deep': return ['#2f6fa8', '#285d8e', '#1b4166'];
        default: return ['#4c7a33', '#40692b', '#2c4a1e']; // grass
      }
    };
    // вертикальная грань-обрыв от ребра гекса вниз на drop px
    const face = (p1: [number, number], p2: [number, number], drop: number, fill: string, cB: string) => {
      if (drop <= 0) return;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
      ctx.lineTo(p2[0], p2[1] + drop); ctx.lineTo(p1[0], p1[1] + drop);
      ctx.closePath(); ctx.fill();
      // слойки-пласты
      ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1;
      for (let k = 3; k < drop; k += 4) {
        ctx.beginPath(); ctx.moveTo(p1[0], p1[1] + k); ctx.lineTo(p2[0], p2[1] + k); ctx.stroke();
      }
      ctx.strokeStyle = cB; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1] + drop); ctx.lineTo(p2[0], p2[1] + drop); ctx.stroke();
    };
    // Спроецированный flat-top гекс: видимые грани обрыва — ТРИ передних (нижних)
    // ребра (обращены к камере), каждое общее с конкретным аксиальным соседом:
    //   ребро 0→1 (передне-левое, самое нижнее) → сосед (q+1, r);
    //   ребро 1→2 (левое)                       → сосед (q,   r+1);
    //   ребро 5→0 (правое)                      → сосед (q+1, r-1).
    // Переднее ребро темнее (cB), боковые — cL/cR.
    const drawCliffsHex = (ix: number, iy: number, up: number, cls: string, q: number, r: number) => {
      if (up <= 0) return;
      const [cR, cL, cB] = cliffColors(cls);
      const vx = (i: number): [number, number] => [ix + HEX_PTS[i][0], iy + HEX_PTS[i][1] - up];
      face(vx(0), vx(1), up - upAtQ(q + 1, r), cB, cB);  // переднее — самое тёмное
      face(vx(1), vx(2), up - upAtQ(q, r + 1), cL, cB);  // левое
      face(vx(5), vx(0), up - upAtQ(q + 1, r - 1), cR, cB); // правое
    };

    // диапазон гексов берём из рельефной сетки: она уже покрывает видимую МИРОВУЮ область,
    // поэтому её q/r — абсолютные аксиальные координаты вокруг камеры.
    const camIX = this.camIsoX(), camIY = this.camIsoY();
    const halfW = this.vw / 2 / this.cam.zoom + 80;
    const halfH = this.vh / 2 / this.cam.zoom + 80;
    const qMin = relief.q0, qMax = relief.q1, rMin = relief.r0, rMax = relief.r1;

    // painter's order: для flat-top проекции три передних соседа (q+1,r),(q,r+1),(q+1,r-1)
    // имеют глубину s=2q+r ровно на +1/+2 больше; идём по s снизу вверх, внутри s — по q.
    // ВАЖНО: hexCenter(q,r) возвращает АБСОЛЮТНЫЕ изо-координаты (мировой масштаб), а
    // трансформ канвы уже сдвинут на -camIX/-camIY — поэтому рисуем прямо в (hx,hy),
    // БЕЗ повторного добавления камеры; для куллинга считаем экранное смещение (hx-camIX).
    const sMin = 2 * qMin + rMin - 1, sMax = 2 * qMax + rMax + 1;
    for (let s = sMin; s <= sMax; s++) {
      // r = s - 2q; допустимые q в [qMin,qMax], r в [rMin,rMax]
      const qLo = Math.max(qMin, Math.ceil((s - rMax) / 2));
      const qHi = Math.min(qMax, Math.floor((s - rMin) / 2));
      for (let q = qLo; q <= qHi; q++) {
        const r = s - 2 * q;
        const [wx, wy] = relief.worldAt(q, r);
        const [hx, hy] = hexCenter(q, r);   // абсолютные изо-координаты центра гекса
        // экранное смещение относительно центра вида (для куллинга)
        const sx = hx - camIX, sy = hy - camIY;
        if (sx < -halfW || sx > halfW || sy < -halfH || sy > halfH + 60) continue;
        const hash = ((wx * 73 - wy * 137) & 0xFFFF) ^ ((wx + wy) & 0xFFFF);
        const hv = hash & 0xFFFF;
        const isBase = (Math.abs(wx - HOME.x) < 190 && Math.abs(wy - HOME.y) < 190)
          || (Math.abs(wx - RIVAL.x) < 190 && Math.abs(wy - RIVAL.y) < 190);
        let kind: HexKind;
        let cls: string;
        if (isBase) { kind = 'dirt'; cls = 'dirt'; }
        else {
          cls = this.terrain.classAt(wx, wy);
          switch (cls) {
            case 'deep': kind = 'deep'; break;
            case 'water': kind = 'water'; break;
            case 'sand': kind = 'sand'; break;
            case 'desert': kind = 'desert'; break;
            case 'field': kind = 'field'; break;
            case 'forest': kind = hv % 2 ? 'forest' : 'dgrass'; break;
            case 'mountain': kind = 'mountain'; break;
            case 'hill': kind = 'hill'; break;
            default: cls = 'grass'; kind = hv % 5 === 0 ? 'dgrass' : 'grass';
          }
        }
        // сетка гексов рисуется только на ВИДИМЫХ клетках; в затемнённых/туманных —
        // бесшовный тайл (на ступенях высоты приподнятые рёбра в тумане не совпадают)
        const fog = this.settings.fogOfWar;
        const lit = !fog || this.fogAt(wx, wy).vis;
        const tile = getHexTile(kind, hv, lit);
        const up = upAtQ(q, r);
        ctx.drawImage(tile, hx - TCX, hy - TCY - up);
        // обрывы высот тоже прячем в неосвещённых областях (их грани несут «сетку» вверх)
        if (lit) drawCliffsHex(hx, hy, up, cls, q, r);
      }
    }
    // upAt для объектов (деревья/юниты/здания/декор) — высота гекса под мировой точкой
    const upAt = (wx: number, wy: number) => upAtWorld(wx, wy);
    // тинт биома поверх земли
    const tint = this.biomeTint();
    if (tint !== 'rgba(0,0,0,0)') {
      ctx.fillStyle = tint;
      ctx.fillRect(this.camIsoX() - 200, this.camIsoY() - 200, this.vw / this.cam.zoom + 400, this.vh / this.cam.zoom + 400);
    }

    // ── decor (tiny grass tufts, flowers) ──
    for (const d of this.decor) {
      if (!this.inView(d.x, d.y, 30)) continue;
      const [dx, dy0] = toIso(d.x, d.y);
      const dy = dy0 - upAt(d.x, d.y);
      ctx.fillStyle = d.c; ctx.globalAlpha = 0.6;
      if (d.k === 0) { ctx.fillRect(dx, dy - d.s, 2, d.s + 2); }
      else { ctx.beginPath(); ctx.arc(dx, dy - 1, d.s * 0.6, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }

    // ── collect all drawables & sort by iso Y for proper depth ──
    type Drawable = { iy: number; draw: () => void };
    const drawList: Drawable[] = [];

    // ── редкие AI-объекты рельефа (gpt image): крупные заснеженные/скальные вершины и
    //    холмы-курганы. Ставятся только на локальных максимумах, прорежены и разнесены
    //    минимальной дистанцией — получается хребет с редкими пиками, а не частокол ──
    const placed: string[] = [];
    const nearPlaced = (qx: number, ry: number, rad: number) => {
      for (const k of placed) { const [px, py] = k.split(',').map(Number); if (Math.abs(px - qx) <= rad && Math.abs(py - ry) <= rad) return true; } return false;
    };
    for (let r = rMin + 2; r <= rMax - 2; r++) {
      for (let q = qMin + 2; q <= qMax - 2; q++) {
        const lvl = hAtQ(q, r);
        if (lvl <= 0) continue;
        // локальный максимум по 6 соседям гекса
        const n6 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
        let isMax = true;
        for (const [dq, dr] of n6) if (hAtQ(q + dq, r + dr) > lvl) { isMax = false; break; }
        if (!isMax) continue;
        const [wx, wy] = relief.worldAt(q, r);
        const cls = this.terrain.classAt(wx, wy);
        const hc = ((q * 73856093) ^ (r * 19349663)) & 0xff;
        let fi = -1, rad = 2;
        if (cls === 'mountain') {
          if (lvl >= 5 && hc > 232) { fi = F_PEAK_SNOW; rad = 5; }
          else if (lvl >= 4 && hc > 196) { fi = F_PEAK_ROCK; rad = 3; }
        } else if (cls === 'hill' && lvl >= 2 && hc > 200) {
          fi = hc % 2 ? F_HILL_ROCK : F_HILL_GRASS; rad = 3;
        }
        if (fi < 0 || nearPlaced(q, r, rad)) continue;
        placed.push(q + ',' + r);
        const [fhx, fhy] = hexCenter(q, r);   // абсолютные изо-координаты
        const iy = fhy - upAtQ(q, r);
        drawList.push({ iy: fhy, draw: () => this.drawTerrainFeature(fi, fhx, iy) });
      }
    }

    // nodes
    for (const n of this.nodes) {
      if (n.amount <= 0) continue;
      if (!this.inView(n.x, n.y, 80)) continue;
      const [ix, iy] = toIso(n.x, n.y);
      const ey = iy - upAt(n.x, n.y);
      drawList.push({ iy: ey, draw: () => this.drawNodeIso(n, ix, ey) });
    }
    // relics
    for (const r of this.relics) {
      if (r.taken || !this.inView(r.x, r.y, 60)) continue;
      const [ix, iy] = toIso(r.x, r.y);
      const ey = iy - upAt(r.x, r.y);
      drawList.push({ iy: ey, draw: () => this.drawRelicIso(r, ix, ey) });
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
    // ── постоянные декорации стойбища: казан и алтыбакан у ханской ставки ──
    // Идут через общий drawList, поэтому корректно перекрываются юртами и людьми.
    // Если у казана/качелей уже отдыхает шаруа, сама СЦЕНКА рисует и инвентарь —
    // тогда декорацию пропускаем, иначе получится два казана в одной точке.
    for (const pr of this.campProps()) {
      if (!this.inView(pr.x, pr.y, 120)) continue;
      const busy = this.units.some(u => u.resting && u.restKind === pr.kind &&
        u.state === 'idle' && dist2(u.x, u.y, pr.x, pr.y) < 46 * 46);
      if (busy) continue;
      const [pix, piy0] = toIso(pr.x, pr.y);
      const piy = piy0 - upAt(pr.x, pr.y);
      drawList.push({ iy: piy, draw: () => drawCampProp(ctx, pr.kind, pix, piy) });
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
      const ey = iy - upAt(u.x, u.y);
      // глубина воды под юнитом: 1 мелкая (на четверть), 2 глубокая (наполовину)
      const wcls = this.terrain.classAt(u.x, u.y);
      const water = wcls === 'deep' ? 2 : wcls === 'water' ? 1 : 0;
      drawList.push({ iy: ey, draw: () => this.drawUnitIso(u, ix, ey, water) });
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
    // ── обводка гекса под курсором (в мировой iso-трансформации) ──
    if (!this.paused) this.drawHexHover(ctx);
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
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const sx = Math.round((x0 + dx * t) / TILE_STEP) * TILE_STEP;
          const sy = Math.round((y0 + dy * t) / TILE_STEP) * TILE_STEP;
          const ok = this.placementValid(sx, sy, key) && this.afford(BUILDING_DEFS[key].cost);
          const [gx, gy] = toIso(sx, sy);
          ctx.globalAlpha = 0.55;
          hexPath(ctx, gx, gy, 0.62);
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
        // здания привязаны к центру гекса; крупные занимают несколько сот — рисуем их
        const [bx, by] = snapToHexWorld(mw.x, mw.y);
        const ok = this.placementValid(bx, by, this.placement);
        const [gx, gy] = toIso(bx, by);
        const [hq, hr] = worldToHex(bx, by);
        const ring = this.buildingHexRing(BUILDING_DEFS[this.placement].size);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = ok ? 'rgba(163,230,53,0.32)' : 'rgba(239,68,68,0.32)';
        ctx.strokeStyle = ok ? '#a3e635' : '#ef4444'; ctx.lineWidth = 1.6;
        // центральная сота + соседи (мультисот-фундамент по размеру спрайта)
        const cells: [number, number][] = [[hq, hr], ...hexNeighbors(hq, hr, ring)];
        for (const [cq, cr] of cells) {
          const [cwx, cwy] = hexCenterWorld(cq, cr);
          const [cx2, cy2] = toIso(cwx, cwy);
          hexPath(ctx, cx2, cy2, 1.0);
          ctx.fill(); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff'; ctx.font = '800 13px Inter'; ctx.textAlign = 'center';
        const tip = 'Клик — поставить';
        ctx.fillText(ok ? tip : 'Занято!', gx, gy - 26);
        ctx.textAlign = 'left';
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

    // ── время суток: мягкий цикл день→ночь ──
    // Фаза берётся из dayT — ЕДИНЫХ игровых суток, по которым живут смены рабочих
    // (раньше здесь был отдельный счётчик от this.time, и картинка расходилась с логикой).
    if (this.settings.dayNight) {
      const ph = this.dayPhase();                      // 0..1
      // ТА ЖЕ darkness(), что и у механик: картинка обязана совпадать с тем,
      // когда реально действуют ночные правила (здесь была своя копия формулы).
      const darkness = this.darkness();
      if (darkness > 0.02) {
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        // Ночь синеватая, а закат и рассвет — тёплые. Тёплый максимум приходится
        // на середину сумерек по обе стороны от полуночи.
        const mid = (this.nightHalf + this.duskEdge) / 2;
        const near = Math.min(Math.abs(ph - (0.5 - mid)), Math.abs(ph - (0.5 + mid)));
        const sunset = Math.max(0, 1 - near / (this.duskEdge - this.nightHalf) * 2);
        const tint = `rgba(${20 + sunset * 60},${26 + sunset * 10},${60 - sunset * 30},${(darkness * 0.42).toFixed(3)})`;
        this.drawNightLight(tint);
      }
    }

    this.drawNodePlate(ctx);
    this.drawEdgeArrows(ctx);
    this.drawMinimap(ctx);
  }

  // Стрелка у края экрана: появляется под курсором, прокручивает ПО КЛИКУ.
  // Рисуется в экранных координатах (после всех iso-трансформаций).
  drawEdgeArrows(ctx: CanvasRenderingContext2D) {
    if (!this.edgeDir || this.over) return;
    const dir = this.edgeDir;
    const w = this.vw, h = this.vh;
    // Стрелка ИДЁТ ЗА КУРСОРОМ вдоль своего края, а не висит в центре стороны:
    // так кнопка всегда там, куда игрок уже подвёл мышь. Поперёк края позиция
    // фиксирована (прижата к краю), вдоль края — следует за курсором и
    // ограничивается полями, чтобы стрелка не вылезала за угол экрана.
    const near = EDGE_ZONE * 0.55;      // отступ от края (поперёк)
    const pad = EDGE_ZONE * 0.9;        // поля вдоль края
    const cx = dir === 'l' ? near : dir === 'r' ? w - near
      : clamp(this.mouse.x, pad, w - pad);
    const cy = dir === 'u' ? near : dir === 'd' ? h - near
      : clamp(this.mouse.y, pad, h - pad);
    const ang = dir === 'l' ? Math.PI : dir === 'r' ? 0 : dir === 'u' ? -Math.PI / 2 : Math.PI / 2;
    const pulse = 1 + Math.sin(this.time * 4) * 0.05 + this.edgeFlash * 0.35;
    const R = 21 * pulse;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    // подложка-таблетка, чтобы стрелка читалась на любой земле
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(12,10,8,${0.5 + this.edgeFlash * 0.25})`; ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(246,212,124,${0.75 + this.edgeFlash * 0.25})`; ctx.stroke();
    // сам треугольник
    ctx.beginPath();
    ctx.moveTo(R * 0.52, 0);
    ctx.lineTo(-R * 0.28, -R * 0.44);
    ctx.lineTo(-R * 0.28, R * 0.44);
    ctx.closePath();
    ctx.fillStyle = this.edgeFlash > 0.01 ? '#fde68a' : '#f6d47c';
    ctx.fill();
    ctx.restore();
  }

  // ── НОЧНОЕ ОСВЕЩЕНИЕ: факелы у зданий ───────────────────────────────────────
  // Свет здесь НЕ рисуется поверх темноты (так получается мутное молочное пятно,
  // потому что светлый спрайт ложится НА затемнение). Вместо этого затемнение
  // копится в отдельном слое, а факелы ВЫРЕЗАЮТ в нём дырки через
  // 'destination-out' — то есть свет буквально снимает ночь, как и положено.
  // Отдельный слой нужен ещё и потому, что вырезать из основного холста нельзя:
  // дырка выела бы саму карту.
  private lightCv: HTMLCanvasElement | null = null;
  private lightCtx: CanvasRenderingContext2D | null = null;
  drawNightLight(tint: string) {
    const { ctx } = this;
    const W = Math.max(1, Math.round(this.vw * this.dpr));
    const H = Math.max(1, Math.round(this.vh * this.dpr));
    if (!this.lightCv) {
      this.lightCv = document.createElement('canvas');
      this.lightCtx = this.lightCv.getContext('2d');
    }
    const lc = this.lightCv, lx = this.lightCtx;
    if (!lc || !lx) {                        // нет второго холста — просто затемняем
      ctx.fillStyle = tint; ctx.fillRect(0, 0, this.vw, this.vh); return;
    }
    if (lc.width !== W || lc.height !== H) { lc.width = W; lc.height = H; }
    lx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    lx.clearRect(0, 0, this.vw, this.vh);
    lx.globalCompositeOperation = 'source-over';
    lx.fillStyle = tint;
    lx.fillRect(0, 0, this.vw, this.vh);

    // Факелы горят только когда реально темно, и разгораются вместе с сумерками.
    const lit = this.torchLit();
    // Список источников собираем ОДИН раз: он нужен и слою ночи, и тёплому
    // отблеску, а куллинг с проверкой тумана — самая дорогая часть.
    const lamps: { px: number; py: number; R: number; flick: number }[] = [];
    if (lit > 0.01) {
      const z = this.cam.zoom, t = this.time;
      for (const b of this.blds) {
        if (b.done < 1) continue;                       // стройка не освещает
        if (b.key === 'wall' || b.key === 'gate') continue; // у дувала факелов нет
        // за туманом войны свет не виден — иначе он выдавал бы чужой лагерь
        if (this.settings.fogOfWar && !this.fogAt(b.x, b.y).expl) continue;
        const [sx, sy] = this.wToScreen(b.x, b.y);
        const px = this.vw / 2 + sx * z, py = this.vh / 2 + sy * z;
        // Радиус — от размера здания: ставка светит далеко, юрта чуть-чуть.
        // Держим круг близко к постройке: широкое пятно съедает саму ночь и
        // превращает её в мутные сумерки по всей карте.
        const R = (b.size * 0.85 + 34) * z;
        if (px < -R || py < -R || px > this.vw + R || py > this.vh + R) continue;
        // лёгкое дыхание пламени, у каждого здания своя фаза
        const flick = 0.92 + 0.08 * Math.sin(t * 3.1 + b.id * 1.7) + 0.04 * Math.sin(t * 7.3 + b.id);
        lamps.push({ px, py, R, flick });
      }
    }
    if (lamps.length) {
      lx.globalCompositeOperation = 'destination-out';
      for (const l of lamps) {
        const r = l.R * l.flick;
        const g = lx.createRadialGradient(l.px, l.py, r * 0.12, l.px, l.py, r);
        // мягкий край: в центре снимаем ночь почти полностью, к краю — плавно на нет
        g.addColorStop(0, `rgba(0,0,0,${(0.78 * lit).toFixed(3)})`);
        g.addColorStop(0.35, `rgba(0,0,0,${(0.42 * lit).toFixed(3)})`);
        g.addColorStop(0.7, `rgba(0,0,0,${(0.14 * lit).toFixed(3)})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        lx.fillStyle = g;
        lx.beginPath(); lx.arc(l.px, l.py, r, 0, Math.PI * 2); lx.fill();
      }
      lx.globalCompositeOperation = 'source-over';
    }
    // готовый слой ночи с дырками — на экран
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lc, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Тёплый отблеск пламени поверх — чтобы «дырка» в ночи читалась именно как
    // огонь, а не как выцветшее пятно.
    if (lamps.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of lamps) {
        const r = l.R * 0.72 * l.flick;
        const g = ctx.createRadialGradient(l.px, l.py, 0, l.px, l.py, r);
        g.addColorStop(0, `rgba(255,170,70,${(0.30 * lit).toFixed(3)})`);
        g.addColorStop(0.5, `rgba(255,150,50,${(0.12 * lit).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(l.px, l.py, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // Насколько разгорелись факелы: 0 днём, 1 в глухую ночь. Общая формула для
  // самих огоньков и для света, чтобы они зажигались одновременно.
  torchLit(): number {
    if (!this.settings.dayNight) return 0;
    return Math.min(1, Math.max(0, (this.darkness() - 0.12) / 0.5));
  }
  // Пара факелов у передней кромки фундамента, слева и справа от входа.
  drawBldTorches(b: Bld, ix: number, iy: number, S: number) {
    const lit = this.torchLit();
    if (lit <= 0.01) return;
    if (b.key === 'wall' || b.key === 'gate') return;
    const off = S * 0.42, fy = iy + S / 2 - 2;
    drawTorch(this.ctx, ix - off, fy, lit, this.time, b.id);
    drawTorch(this.ctx, ix + off, fy, lit, this.time, b.id + 0.7);
  }

  // dirt is handled via tile selection now
  dirt(_x: number, _y: number, _r: number) { void _x; void _y; void _r; }

  drawNodeIso(n: Node, ix: number, iy: number) {
    const { ctx } = this;
    if (n.kind === 'wood') drawIsoTree(ctx, ix, iy, this.time, n.phase, n.amount < n.max * 0.35);
    else if (n.kind === 'gold') drawIsoGold(ctx, ix, iy, this.time, n.phase, n.amount / n.max);
    else if (n.kind === 'fish') drawIsoFish(ctx, ix, iy, this.time, n.phase, n.amount / n.max);
    else drawIsoBerries(ctx, ix, iy, n.phase, n.amount / n.max);
    // Полоска запаса — ТОЛЬКО у выбранного ресурса. Раньше она висела над
    // каждым початым кустом и деревом, засоряя карту во время добычи.
    if (n.id === this.selNode && n.amount < n.max) {
      const s = clamp(n.amount / n.max, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(ix - 16, iy + 10, 32, 5);
      ctx.fillStyle = n.kind === 'wood' ? '#65a30d' : n.kind === 'gold' ? '#facc15' : '#fb7185';
      ctx.fillRect(ix - 15, iy + 11, 30 * s, 3);
    }
  }

  // Плашка выбранного ресурса: название и текущий остаток. Рисуется поверх
  // мира, в экранных координатах, чтобы не искажаться изо-трансформацией.
  drawNodePlate(ctx: CanvasRenderingContext2D) {
    if (this.selNode < 0) return;
    const n = this.nodes.find(nn => nn.id === this.selNode);
    if (!n || n.amount <= 0) { this.selNode = -1; return; }
    const NAME: Record<string, string> = {
      wood: 'Лес', gold: 'Золотая жила', food: 'Ягодник', fish: 'Рыбное место',
    };
    const ICON: Record<string, string> = { wood: '🪵', gold: '🪙', food: '🍖', fish: '🐟' };
    const COLOR: Record<string, string> = {
      wood: '#a3e635', gold: '#facc15', food: '#fb7185', fish: '#7dd3fc',
    };
    const [wx, wy] = toIso(n.x, n.y);
    // мир → экран той же матрицей, что ставит draw(): центр экрана, зум,
    // сдвиг на изо-камеру. Плашку поднимаем над спрайтом на 46 мировых px.
    const sx = this.vw / 2 + (wx - this.camIsoX()) * this.cam.zoom;
    const sy = this.vh / 2 + (wy - this.camIsoY() - 46) * this.cam.zoom;

    const title = `${ICON[n.kind]} ${NAME[n.kind] ?? 'Ресурс'}`;
    const sub = `${Math.ceil(n.amount)} / ${Math.round(n.max)}`;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.font = '800 13px Inter, sans-serif';
    const w1 = ctx.measureText(title).width;
    ctx.font = '700 12px Inter, sans-serif';
    const w2 = ctx.measureText(sub).width;
    const pw = Math.max(w1, w2) + 26, ph = 40;
    const px = clamp(sx - pw / 2, 6, this.vw - pw - 6);
    const py = clamp(sy - ph, 6, this.vh - ph - 6);

    ctx.fillStyle = 'rgba(12,10,8,0.82)';
    ctx.strokeStyle = 'rgba(246,212,124,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const r = 7;
    ctx.moveTo(px + r, py); ctx.lineTo(px + pw - r, py); ctx.quadraticCurveTo(px + pw, py, px + pw, py + r);
    ctx.lineTo(px + pw, py + ph - r); ctx.quadraticCurveTo(px + pw, py + ph, px + pw - r, py + ph);
    ctx.lineTo(px + r, py + ph); ctx.quadraticCurveTo(px, py + ph, px, py + ph - r);
    ctx.lineTo(px, py + r); ctx.quadraticCurveTo(px, py, px + r, py);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '800 13px Inter, sans-serif';
    ctx.fillStyle = '#f6e7c1';
    ctx.fillText(title, px + 8, py + 17);
    ctx.font = '700 12px Inter, sans-serif';
    ctx.fillStyle = COLOR[n.kind] ?? '#f6d47c';
    ctx.fillText(sub, px + 8, py + 32);
    // мини-полоска остатка внутри плашки
    const s = clamp(n.amount / n.max, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(px + 8 + w2 + 8, py + 24, Math.max(24, pw - w2 - 32), 6);
    ctx.fillStyle = COLOR[n.kind] ?? '#f6d47c';
    ctx.fillRect(px + 8 + w2 + 8, py + 24, Math.max(24, pw - w2 - 32) * s, 6);
    ctx.restore();
  }

  // Редкий AI-объект рельефа (вершина/холм, gpt image): низ спрайта кладётся на опорную
  // точку (ix,iy) — центр поднятой плитки; рисуется с мягкой тенью-подложкой.
  drawTerrainFeature(fi: number, ix: number, iy: number) {
    const { ctx } = this;
    const f = TERRAIN_FEATURES[fi];
    const img = f.img;
    if (!img || !img.complete || img.naturalWidth === 0) return;
    ctx.imageSmoothingEnabled = false;
    const w = img.naturalWidth * f.scale, h = img.naturalHeight * f.scale;
    // мягкая контактная тень-эллипс под объектом
    ctx.fillStyle = 'rgba(8,14,8,0.28)';
    ctx.beginPath(); ctx.ellipse(ix, iy + 2, w * 0.30, h * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    // низ-центр спрайта → опорная точка
    ctx.drawImage(img, ix - w / 2, iy - h + 2, w, h);
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

  // стоит ли сегмент на углу: есть сосед-стена/ворота и вдоль мировой X, и вдоль Y
  isWallCorner(b: Bld): boolean {
    if (b.key !== 'wall') return false;
    let hasX = false, hasY = false;
    for (const o of this.blds) {
      if (o.id === b.id || o.owner !== b.owner) continue;
      if (o.key !== 'wall' && o.key !== 'gate') continue;
      const dx = o.x - b.x, dy = o.y - b.y;
      if (Math.abs(dy) < 10 && Math.abs(Math.abs(dx) - TILE_STEP) < 14) hasX = true;
      if (Math.abs(dx) < 10 && Math.abs(Math.abs(dy) - TILE_STEP) < 14) hasY = true;
    }
    return hasX && hasY;
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

  // Клип, обрезающий края сегмента СТЕНЫ, примыкающие к воротам: длинный спрайт стены
  // перехлёстывает соседние клетки и мог бы закрыть проём ворот. Обрезаем стену по
  // границе клетки с воротами (у спрайта ворот есть свои обрубки-крылья, стык слитный).
  // Возвращает true, если клип включён (нужно вызвать ctx.restore() после отрисовки).
  private beginWallGateClip(b: Bld, ix: number, iy: number): boolean {
    if (b.key !== 'wall') return false;
    const ctx = this.ctx;
    const gates: { gx: number; gy: number }[] = [];
    for (const o of this.blds) {
      if (o.key !== 'gate' || o.owner !== b.owner) continue;
      const [gx, gy] = toIso(o.x, o.y);
      const dd = Math.hypot(gx - ix, gy - iy);
      if (dd < 60 && dd > 1) gates.push({ gx, gy }); // сосед по линии стены
    }
    if (!gates.length) return false;
    ctx.save();
    ctx.beginPath(); ctx.rect(-1e7, -1e7, 2e7, 2e7); ctx.clip();
    const H = 4000;
    for (const g of gates) {
      const dx = g.gx - ix, dy = g.gy - iy;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;   // единичное направление к воротам
      const px = -uy, py = ux;              // перпендикуляр вдоль границы клетки
      const mx = ix + dx / 2, my = iy + dy / 2; // середина между центрами (граница)
      // полуплоскость на стороне СТЕНЫ (от ворот): точка p, где dot(p-mid, u) <= 0
      ctx.beginPath();
      ctx.moveTo(mx + px * H, my + py * H);
      ctx.lineTo(mx - ux * H + px * H, my - uy * H + py * H);
      ctx.lineTo(mx - ux * H - px * H, my - uy * H - py * H);
      ctx.lineTo(mx - px * H, my - py * H);
      ctx.closePath();
      ctx.clip();
    }
    return true;
  }

  drawWallSprite(b: Bld, sp: BldSprite, scale: number, ix: number, iy: number, S: number, img: HTMLImageElement | HTMLCanvasElement, alpha: number) {
    const ctx = this.ctx;
    const w = sp.img.naturalWidth * scale, h = sp.img.naturalHeight * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    const left = ix - w / 2, top = iy + S / 2 - h;
    // Стена и ворота перерисованы в ЕДИНОЙ геометрии (ворота — та же стена с
    // башнями по центру, оба спрайта идут по диагонали снизу-слева → вверх-вправо),
    // поэтому зеркалим их по ОДНОМУ условию (ось стены) — кладка всегда слитная.
    const flipX = b.axis === 'x';
    if (flipX) {
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
      // угловой сегмент-бастион (стык двух осей) рисуем отдельным столбом
      const isCorner = b.key === 'wall' && this.isWallCorner(b);
      const wspr = wallSpriteFor(b, isCorner);
      const ready = !!wspr && wspr.img.complete && wspr.img.naturalWidth > 0;
      if (!ready || !wspr) { this.drawWallGate(b, ix, iy, selected); return; }
      const scale = (2 * S * (isCorner ? 0.9 : 1.0)) / wspr.baseW;
      const h = wspr.img.naturalHeight * scale;
      // тень
      ctx.fillStyle = 'rgba(8,14,8,0.3)';
      ctx.beginPath(); ctx.ellipse(ix, iy + S / 2 - 3, S * (isCorner ? 0.82 : 0.92), S * (isCorner ? 0.28 : 0.30), 0, 0, Math.PI * 2); ctx.fill();
      if (selected) diamondRingHalf(ctx, ix, iy, S * 1.05, S * 1.05 / 2, '#f6d47c', true);
      const img: HTMLImageElement | HTMLCanvasElement = (b.flash > 0.05 && wspr.flash) ? wspr.flash : wspr.img;
      if (b.done < 1) {
        drawConstruction(ctx, ix, iy, S, b.done);
        if (isCorner) { ctx.save(); ctx.globalAlpha = 0.35 + b.done * 0.65; ctx.imageSmoothingEnabled = false;
          const pw = wspr.img.naturalWidth * scale;
          ctx.drawImage(img, ix - pw / 2, iy + S / 2 - h, pw, h); ctx.restore(); }
        else { const cl = this.beginWallGateClip(b, ix, iy); this.drawWallSprite(b, wspr, scale, ix, iy, S, img, 0.35 + b.done * 0.65); if (cl) ctx.restore(); }
      } else if (isCorner) {
        ctx.save(); ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
        const pw = wspr.img.naturalWidth * scale;
        ctx.drawImage(img, ix - pw / 2, iy + S / 2 - h, pw, h); ctx.restore();
      } else {
        const cl = this.beginWallGateClip(b, ix, iy);
        this.drawWallSprite(b, wspr, scale, ix, iy, S, img, 1);
        if (cl) ctx.restore();
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

    const { sp, scale, ready } = placeBld(b, S);

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
    // ночные факелы по бокам от входа (сам свет — в drawNightLight)
    this.drawBldTorches(b, ix, iy, S);
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


  drawUnitIso(u: Unit, ix: number, iy: number, water = 0) {
    // y-подскок юнита компенсирован внутри pixelart через bob — передаём «земную» точку
    drawPixelUnit(this.ctx, u, ix, iy, this.time, this.selected.has(u.id), water);
    // ── полоса КАМЛАНИЯ над обращаемым юнитом (видно, что душу перетягивают) ──
    if (u.convProg != null && u.convProg > 0) {
      const ctx = this.ctx;
      const p = clamp(u.convProg, 0, 1);
      const w = 34, y = iy - 52;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(ix - w / 2, y, w, 6);
      ctx.fillStyle = '#c4b5fd';
      ctx.fillRect(ix - w / 2 + 1, y + 1, (w - 2) * p, 4);
      // полумесяц-метка: чья вера тянет
      ctx.fillStyle = '#e9d5ff';
      ctx.font = '700 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('☾', ix, y - 2);
    }
  }


  // кэш фона мини-карты (террейн статичен — перерисовываем редко/при ресайзе)
  minimapBg: HTMLCanvasElement | null = null;
  minimapBgW = 0; minimapBgH = 0;
  // кэш слоя тумана мини-карты (обновляем редко, НЕ каждый кадр)
  minimapFog: HTMLCanvasElement | null = null;
  minimapFogW = 0; minimapFogH = 0; minimapFogT = 0;
  drawMinimap(ctx: CanvasRenderingContext2D) {
    // МИРОВАЯ мини-карта: показывает ВЕСЬ мир (0..WORLD), а не регион вокруг камеры.
    // Кликабельная (minimapJump переводит долю → мировую координату), с рамкой обзора.
    const W = clamp(this.vw * 0.30, 168, 232);
    const H = (W * WORLD.h) / WORLD.w;
    const m = 12;
    const x = this.vw - W - m, y = this.vh - H - m - (this.vw < 640 ? 118 : 0);
    this.minimap = { x, y, w: W, h: H };
    const sx = W / WORLD.w, sy = H / WORLD.h;
    const toMap = (wx: number, wy: number): [number, number] => [x + wx * sx, y + wy * sy];

    // ── фон террейна: оффскрин в ПОЛОВИННОМ разрешении (террейн статичен) ──
    if (!this.minimapBg || this.minimapBgW !== Math.round(W) || this.minimapBgH !== Math.round(H)) {
      const scale = 0.5;
      const bw = Math.max(2, Math.round(W * scale)), bh = Math.max(2, Math.round(H * scale));
      const bg = document.createElement('canvas');
      bg.width = bw; bg.height = bh;
      const c = bg.getContext('2d')!;
      c.fillStyle = '#2f5226'; c.fillRect(0, 0, bw, bh);
      for (let py = 0; py < bh; py++) {
        for (let px = 0; px < bw; px++) {
          const wx = (px / bw) * WORLD.w, wy = (py / bh) * WORLD.h;
          const tc = this.terrain.classAt(wx, wy);
          let col: string | null = null;
          if (tc === 'water' || tc === 'deep') col = tc === 'deep' ? '#1d4e89' : '#2f6fb0';
          else if (tc === 'sand') col = '#d8c489';
          else if (tc === 'desert') col = '#c9a456';
          else if (tc === 'field') col = '#9aa548';
          else if (tc === 'forest') col = '#2c5a26';
          else if (tc === 'mountain') col = '#8a8a92';
          else if (tc === 'hill') col = '#7c7a5c';
          if (!col) continue;
          c.fillStyle = col;
          c.fillRect(px, py, 1.6, 1.6);
        }
      }
      this.minimapBg = bg; this.minimapBgW = Math.round(W); this.minimapBgH = Math.round(H);
      this.minimapFog = null; // сбросить кэш тумана под новый размер
    }

    // ── слой тумана: перерисовываем в оффскрин раз в ~0.5с (не каждый кадр!) ──
    this.minimapFogT -= 1; // считаем кадры; обновляем ~раз в 30 кадров
    if (!this.minimapFog || this.minimapFogW !== Math.round(W) || this.minimapFogH !== Math.round(H) || this.minimapFogT <= 0) {
      this.minimapFogT = 30;
      const fc = document.createElement('canvas');
      fc.width = Math.max(2, Math.round(W)); fc.height = Math.max(2, Math.round(H));
      const fctx = fc.getContext('2d')!;
      if (this.settings.fogOfWar) {
        fctx.fillStyle = 'rgba(5,9,7,0.80)';
        const step = this.fogCell;
        const cw = Math.max(2, step * sx) + 1, ch = Math.max(2, step * sy) + 1;
        for (let gy = 0; gy < this.fogGH; gy++) {
          for (let gx = 0; gx < this.fogGW; gx++) {
            if (this.fogExpl[gy * this.fogGW + gx]) continue;
            fctx.fillRect(gx * step * sx, gy * step * sy, cw, ch);
          }
        }
      }
      this.minimapFog = fc; this.minimapFogW = Math.round(W); this.minimapFogH = Math.round(H);
    }

    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = 'rgba(8,12,10,0.88)';
    ctx.beginPath(); ctx.roundRect(x - 5, y - 5, W + 10, H + 10, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,55,0.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x - 5, y - 5, W + 10, H + 10, 10); ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, W, H); ctx.clip();
    if (this.minimapBg) { ctx.imageSmoothingEnabled = true; ctx.drawImage(this.minimapBg, x, y, W, H); }
    if (this.minimapFog) ctx.drawImage(this.minimapFog, x, y, W, H);

    // ресурсы (мелкие точки) — только в исследованной области
    for (const n of this.nodes) {
      if (n.amount <= 0) continue;
      if (this.settings.fogOfWar && !this.fogAt(n.x, n.y).expl) continue;
      ctx.fillStyle = n.kind === 'wood' ? '#22c55e' : n.kind === 'gold' ? '#facc15' : n.kind === 'fish' ? '#38bdf8' : '#fb7185';
      const [mx, my] = toMap(n.x, n.y);
      ctx.fillRect(mx - 1, my - 1, 2.2, 2.2);
    }
    for (const r of this.relics) {
      if (r.taken) continue;
      if (this.settings.fogOfWar && !this.fogAt(r.x, r.y).expl) continue;
      const [mx, my] = toMap(r.x, r.y);
      ctx.fillStyle = '#fde047'; ctx.fillRect(mx - 1.6, my - 1.6, 3.2, 3.2);
    }
    // здания
    for (const b of this.blds) {
      if (b.owner !== 'player' && !this.canSeeEnemy(b.x, b.y)) continue;
      // цвет по народу (племена — каждый своим); соперника не красим до знакомства
      let col = '#7cb7ff';
      if (b.owner !== 'player') {
        if (b.tribe) { const nid = this.tribeNationOf(b); col = nid ? (NATION_BY_ID[nid]?.color ?? '#e0b050') : '#e0b050'; }
        else col = this.rivalMet ? '#f87171' : '#5b4a4a';
      }
      ctx.fillStyle = col;
      const s = b.key === 'towncenter' ? 6 : b.tribe ? 5 : 3.4;
      const [mx, my] = toMap(b.x, b.y);
      ctx.fillRect(mx - s / 2, my - s / 2, s, s);
    }
    // юниты
    for (const u of this.units) {
      if (u.hidden) continue;
      const [mx, my] = toMap(u.x, u.y);
      if (u.owner === 'player') { ctx.fillStyle = '#eaf4ff'; ctx.fillRect(mx - 1.4, my - 1.4, 2.8, 2.8); }
      else {
        if (!this.canSeeEnemy(u.x, u.y)) continue;
        ctx.fillStyle = u.tribe ? '#e0b050' : u.owner === 'neutral' ? '#eab308' : '#fecaca';
        ctx.fillRect(mx - 1.2, my - 1.2, 2.4, 2.4);
      }
    }
    // базы игрока/врага — крупные метки с подписью
    const homeM = toMap(HOME.x, HOME.y), rivM = toMap(RIVAL.x, RIVAL.y);
    ctx.strokeStyle = '#7cb7ff'; ctx.lineWidth = 1.5; ctx.strokeRect(homeM[0] - 5, homeM[1] - 5, 10, 10);
    if (!this.settings.fogOfWar || this.fogAt(RIVAL.x, RIVAL.y).expl) {
      ctx.strokeStyle = '#f87171'; ctx.strokeRect(rivM[0] - 5, rivM[1] - 5, 10, 10);
    }
    // ── МАРКЕР ТРЕВОГИ: пульсирующее красное кольцо там, где нас бьют ──
    if (this.alert) {
      const [ax, ay] = toMap(this.alert.x, this.alert.y);
      const ph = (this.time * 2.2) % 1;              // 0..1 — расходящаяся волна
      ctx.strokeStyle = `rgba(248,113,113,${(1 - ph) * 0.95})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ax, ay, 3 + ph * 9, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.arc(ax, ay, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    // рамка текущего вьюпорта
    const halfW = (this.vw / this.cam.zoom) / 2, halfH = (this.vh / this.cam.zoom) / 2;
    const [vx0, vy0] = toMap(this.cam.x - halfW, this.cam.y - halfH);
    const [vx1, vy1] = toMap(this.cam.x + halfW, this.cam.y + halfH);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2;
    ctx.strokeRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    ctx.restore();
    ctx.restore();
    ctx.fillStyle = 'rgba(253,230,138,0.9)'; ctx.font = '700 9px Inter';
    ctx.textAlign = 'left'; ctx.fillText('🗺 КАРТА МИРА — клик/перетаскивание для перехода', x - 2, y - 8);
  }
}

// re-export for UI
export { AGES, BUILDING_DEFS, UNIT_DEFS };
