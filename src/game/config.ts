export type Difficulty = 'easy' | 'normal' | 'hard';

// Практически бесконечный процедурный мир. Контент генерится лениво по чанкам (engine.ts),
// поэтому большой размер нужен лишь как мягкий предел клампа — игрок его не достигает.
export const WORLD = { w: 48000, h: 48000 };
// Стартовая база игрока (ближе к центру огромного мира); соперник — в фиксированном отдалении.
export const HOME = { x: 24000, y: 26200 };
export const RIVAL = { x: 27200, y: 23400 };

export const AGES = [
  { id: 0, name: 'Тёмный век', cost: null as null | { food: number; gold: number }, mult: 1.0, icon: '🌑' },
  { id: 1, name: 'Феодальный век', cost: { food: 450, gold: 0 }, mult: 1.15, icon: '⚔️' },
  { id: 2, name: 'Замковый век', cost: { food: 800, gold: 350 }, mult: 1.32, icon: '🏰' },
  { id: 3, name: 'Имперский век', cost: { food: 1200, gold: 750 }, mult: 1.55, icon: '👑' },
];

export const UNIT_DEFS = {
  villager:    { name: 'Крестьянин',  hp: 55,  atk: 4,  range: 22,  speed: 118, cost: { food: 50, wood: 0, gold: 0 },   trainTime: 7,  pop: 1, gather: true,  desc: 'Добывает и строит',      bld: 'towncenter', ageReq: 0 },
  swordsman:   { name: 'Ополченец',   hp: 110, atk: 11, range: 28,  speed: 132, cost: { food: 70, wood: 0, gold: 20 },  trainTime: 9,  pop: 1, gather: false, desc: 'Крепкий боец ближнего боя', bld: 'barracks', ageReq: 0 },
  spearman:    { name: 'Копейщик',    hp: 150, atk: 13, range: 34,  speed: 118, cost: { food: 60, wood: 0, gold: 30 },  trainTime: 10, pop: 1, gather: false, desc: 'Стена против конницы',   bld: 'barracks', ageReq: 0 },
  archer:      { name: 'Лучник',      hp: 70,  atk: 9,  range: 175, speed: 126, cost: { food: 0, wood: 45, gold: 55 },  trainTime: 10, pop: 1, gather: false, desc: 'Бьёт издалека',          bld: 'barracks', ageReq: 0 },
  knight:      { name: 'Рыцарь',      hp: 190, atk: 16, range: 30,  speed: 178, cost: { food: 90, wood: 0, gold: 70 },  trainTime: 13, pop: 1, gather: false, desc: 'Быстрый и смертоносный',  bld: 'barracks', ageReq: 1 },
  cavalry:     { name: 'Всадник',     hp: 250, atk: 19, range: 30,  speed: 200, cost: { food: 90, wood: 0, gold: 90 },  trainTime: 15, pop: 1, gather: false, desc: 'Стремительный удар конницы', bld: 'stable', ageReq: 1 },
  catapult:    { name: 'Катапульта',  hp: 160, atk: 46, range: 285, speed: 58,  cost: { food: 0, wood: 120, gold: 120 }, trainTime: 20, pop: 2, gather: false, desc: 'Сносит здания издалека', bld: 'blacksmith', ageReq: 2 },
  monk:        { name: 'Монах',       hp: 50,  atk: 0,  range: 135, speed: 108, cost: { food: 0, wood: 0, gold: 110 },  trainTime: 14, pop: 1, gather: false, desc: 'Лечит ваше войско',      bld: 'market', ageReq: 0 },
  wolf:        { name: 'Матёрый волк',hp: 60,  atk: 8,  range: 26,  speed: 150, cost: { food: 0, wood: 0, gold: 0 },   trainTime: 0,  pop: 0, gather: false, desc: 'Дикий зверь',            bld: 'barracks', ageReq: 0 },
  sheep:       { name: 'Овца',        hp: 30,  atk: 0,  range: 16,  speed: 70,  cost: { food: 0, wood: 0, gold: 0 },   trainTime: 0,  pop: 0, gather: false, desc: 'Пасётся, даёт еду',       bld: 'towncenter', ageReq: 0 },
  cow:         { name: 'Корова',      hp: 55,  atk: 0,  range: 16,  speed: 60,  cost: { food: 0, wood: 0, gold: 0 },   trainTime: 0,  pop: 0, gather: false, desc: 'Скот: много еды',        bld: 'towncenter', ageReq: 0 },
  deer:        { name: 'Олень',       hp: 40,  atk: 0,  range: 16,  speed: 175, cost: { food: 0, wood: 0, gold: 0 },   trainTime: 0,  pop: 0, gather: false, desc: 'Быстрая дичь',           bld: 'towncenter', ageReq: 0 },
} as const;

export type UnitKey = keyof typeof UNIT_DEFS;

// ── Технологии (исследуются в зданиях) ──
export interface TechDef { id: string; name: string; desc: string; bld: BuildingKey; ageReq: number; cost: { wood: number; food: number; gold: number }; time: number; icon: string }
export const TECHS: Record<string, TechDef> = {
  sharpBlades: { id: 'sharpBlades', name: 'Острые клинки', desc: '+25% к атаке всей армии', bld: 'blacksmith', ageReq: 1, cost: { wood: 0, food: 120, gold: 150 }, time: 20, icon: '⚔️' },
  forgedArmor:  { id: 'forgedArmor', name: 'Кованая броня', desc: '+25% к здоровью всей армии', bld: 'blacksmith', ageReq: 1, cost: { wood: 150, food: 0, gold: 150 }, time: 20, icon: '🛡️' },
  infantryDrill:{ id: 'infantryDrill', name: 'Строевая муштра', desc: '+15% к скорости пехоты', bld: 'barracks', ageReq: 0, cost: { wood: 0, food: 150, gold: 60 }, time: 18, icon: '🎖️' },
  eagleEye:     { id: 'eagleEye', name: 'Соколиный глаз', desc: '+20% к дальности стрелков и башен', bld: 'barracks', ageReq: 1, cost: { wood: 100, food: 0, gold: 120 }, time: 18, icon: '🏹' },
  horseBreeding:{ id: 'horseBreeding', name: 'Племенные кони', desc: '+15% к скорости и HP конницы', bld: 'stable', ageReq: 1, cost: { wood: 0, food: 180, gold: 140 }, time: 22, icon: '🐴' },
  heavyShot:    { id: 'heavyShot', name: 'Тяжёлые снаряды', desc: '+35% к урону катапульт', bld: 'blacksmith', ageReq: 2, cost: { wood: 200, food: 0, gold: 200 }, time: 24, icon: '🪨' },
  ironTools:    { id: 'ironTools', name: 'Железные орудия', desc: '+30% к скорости добычи', bld: 'towncenter', ageReq: 0, cost: { wood: 120, food: 0, gold: 80 }, time: 16, icon: '⛏️' },
  wheelbarrow:  { id: 'wheelbarrow', name: 'Тачки', desc: 'Крестьяне переносят больше', bld: 'towncenter', ageReq: 0, cost: { wood: 100, food: 60, gold: 0 }, time: 16, icon: '🛞' },
  coinage:      { id: 'coinage', name: 'Чеканка монеты', desc: 'Рынок даёт больше золота и выгодный обмен', bld: 'market', ageReq: 0, cost: { wood: 0, food: 100, gold: 100 }, time: 16, icon: '🪙' },
};

export const BUILDING_DEFS = {
  towncenter: { name: 'Городской центр', hp: 1600, size: 120, cost: { wood: 0, food: 0, gold: 0 }, buildTime: 0, sight: 320, attack: { dmg: 8, range: 190, cd: 1.4 }, desc: 'Сердце вашей империи' },
  house:      { name: 'Дом',           hp: 350,  size: 56,  cost: { wood: 50, food: 0, gold: 0 }, buildTime: 9,  sight: 160, attack: null, desc: '+8 к населению' },
  barracks:   { name: 'Казармы',       hp: 700,  size: 92,  cost: { wood: 200, food: 0, gold: 0 }, buildTime: 16, sight: 220, attack: null, desc: 'Обучает пехоту и лучников' },
  stable:     { name: 'Конюшня',       hp: 650,  size: 92,  cost: { wood: 180, food: 0, gold: 0 }, buildTime: 15, sight: 200, attack: null, desc: 'Обучает конницу' },
  blacksmith: { name: 'Кузница',       hp: 600,  size: 80,  cost: { wood: 160, food: 0, gold: 60 }, buildTime: 15, sight: 180, attack: null, desc: 'Кует осадные орудия' },
  market:     { name: 'Рынок',         hp: 400,  size: 72,  cost: { wood: 150, food: 0, gold: 0 }, buildTime: 12, sight: 160, attack: null, desc: '+золото и монахи' },
  tower:      { name: 'Сторожевая башня', hp: 550, size: 56, cost: { wood: 120, food: 0, gold: 80 }, buildTime: 14, sight: 300, attack: { dmg: 12, range: 215, cd: 1.1 }, desc: 'Стреляет по врагам' },
  farm:       { name: 'Ферма',         hp: 220,  size: 72,  cost: { wood: 90, food: 0, gold: 0 }, buildTime: 8,  sight: 140, attack: null, desc: 'Бесконечная еда' },
  wall:       { name: 'Стена',         hp: 900,  size: 28,  cost: { wood: 30, food: 0, gold: 0 }, buildTime: 5,  sight: 120, attack: null, desc: 'Преграждает путь врагам' },
  gate:       { name: 'Ворота',        hp: 600,  size: 34,  cost: { wood: 45, food: 0, gold: 0 }, buildTime: 6,  sight: 130, attack: null, desc: 'Проход для своих, стена для врага' },
  wonder:     { name: 'Чудо света',    hp: 3000, size: 130, cost: { wood: 600, food: 600, gold: 900 }, buildTime: 40, sight: 360, attack: null, desc: 'Имперский монумент — постройте для победы', ageReq: 3 },
} as const;

export type BuildingKey = keyof typeof BUILDING_DEFS;

export const DIFF = {
  easy:   { enemyGather: 0.65, waveBase: 2, waveGrowth: 0.7, waveInterval: 95, enemyHp: 0.85, aiAggression: 0.6, name: 'Поселенец' },
  normal: { enemyGather: 0.9,  waveBase: 3, waveGrowth: 1.0, waveInterval: 80, enemyHp: 1.0,  aiAggression: 1.0, name: 'Воевода' },
  hard:   { enemyGather: 1.2,  waveBase: 4, waveGrowth: 1.4, waveInterval: 65, enemyHp: 1.15, aiAggression: 1.5, name: 'Завоеватель' },
} as const;

export type GameSpeed = 0.75 | 1 | 1.5 | 2;

// ── Настройки игрока (хранятся в localStorage, применяются на лету) ──
export interface Settings {
  difficulty: Difficulty;
  speed: GameSpeed;        // темп игры
  muted: boolean;          // без звука
  voices: boolean;         // голосовые фразы юнитов
  voiceVolume: number;     // громкость фраз 0..1 (по умолчанию 0.3)
  screenShake: boolean;    // тряска камеры
  fogOfWar: boolean;       // туман войны (враг скрыт вне обзора)
  dayNight: boolean;       // суточный цикл освещения
  biome: Biome;            // тип карты
  particles: boolean;      // частицы и пыль
  damageNumbers: boolean;  // всплывающие числа урона/лечения
  autoPauseOnBlur: boolean;// пауза при потере фокуса
}
export type Biome = 'green' | 'autumn' | 'winter' | 'desert';
export const BIOMES: { id: Biome; name: string; icon: string }[] = [
  { id: 'green', name: 'Лето', icon: '🌳' },
  { id: 'autumn', name: 'Осень', icon: '🍂' },
  { id: 'winter', name: 'Зима', icon: '❄️' },
  { id: 'desert', name: 'Степь', icon: '🏜️' },
];
export const DEFAULT_SETTINGS: Settings = {
  difficulty: 'normal',
  speed: 1,
  muted: false,
  voices: true,
  voiceVolume: 0.3,
  screenShake: true,
  fogOfWar: true,
  dayNight: true,
  biome: 'green',
  particles: true,
  damageNumbers: true,
  autoPauseOnBlur: true,
};
export const SPEED_OPTIONS: { id: GameSpeed; label: string }[] = [
  { id: 0.75, label: '0.75×' },
  { id: 1, label: '1×' },
  { id: 1.5, label: '1.5×' },
  { id: 2, label: '2×' },
];

export const SCORE = { kill: 100, wolfKill: 60, building: 350, tc: 1500, ageUp: 400, gatherPer10: 4 };
