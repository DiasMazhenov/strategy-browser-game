export type Difficulty = 'easy' | 'normal' | 'hard';

// Практически бесконечный процедурный мир. Контент генерится лениво по чанкам (engine.ts),
// поэтому большой размер нужен лишь как мягкий предел клампа — игрок его не достигает.
export const WORLD = { w: 48000, h: 48000 };
// Стартовая база игрока (ближе к центру огромного мира); соперник — в фиксированном отдалении.
export const HOME = { x: 24000, y: 26200 };
export const RIVAL = { x: 27200, y: 23400 };

// Эпохи ханства (были: Тёмный/Феодальный/Замковый/Имперский век)
export const AGES = [
  { id: 0, name: 'Заря степи', cost: null as null | { food: number; gold: number }, mult: 1.0, icon: '🌄' },
  { id: 1, name: 'Век жузов', cost: { food: 450, gold: 0 }, mult: 1.15, icon: '⚔️' },
  { id: 2, name: 'Век батыров', cost: { food: 800, gold: 350 }, mult: 1.32, icon: '🏰' },
  { id: 3, name: 'Век Абылай хана', cost: { food: 1200, gold: 750 }, mult: 1.55, icon: '👑' },
];

export const UNIT_DEFS = {
  villager:    { name: 'Шаруа',       hp: 55,  atk: 4,  range: 22,  speed: 118, cost: { food: 50, wood: 0, gold: 0 },   trainTime: 7,  pop: 1, gather: true,  desc: 'Кочевник-труженик: добывает и строит', bld: 'towncenter', ageReq: 0 },
  swordsman:   { name: 'Сарбаз',      hp: 110, atk: 11, range: 28,  speed: 132, cost: { food: 70, wood: 0, gold: 20 },  trainTime: 9,  pop: 1, gather: false, desc: 'Воин ханского ополчения с саблей', bld: 'barracks', ageReq: 0 },
  spearman:    { name: 'Найзагер',    hp: 150, atk: 13, range: 34,  speed: 118, cost: { food: 60, wood: 0, gold: 30 },  trainTime: 10, pop: 1, gather: false, desc: 'Копейщик — стена против конницы', bld: 'barracks', ageReq: 0 },
  archer:      { name: 'Мерген',      hp: 70,  atk: 9,  range: 175, speed: 126, cost: { food: 0, wood: 45, gold: 55 },  trainTime: 10, pop: 1, gather: false, desc: 'Меткий стрелок из степного лука', bld: 'barracks', ageReq: 0 },
  knight:      { name: 'Батыр',       hp: 190, atk: 16, range: 30,  speed: 178, cost: { food: 90, wood: 0, gold: 70 },  trainTime: 13, pop: 1, gather: false, desc: 'Прославленный воин-богатырь на коне', bld: 'barracks', ageReq: 1 },
  cavalry:     { name: 'Жасауыл',     hp: 250, atk: 19, range: 30,  speed: 200, cost: { food: 90, wood: 0, gold: 90 },  trainTime: 15, pop: 1, gather: false, desc: 'Тяжёлая конница — стремительный удар', bld: 'stable', ageReq: 1 },
  catapult:    { name: 'Катапульта',  hp: 160, atk: 46, range: 285, speed: 58,  cost: { food: 0, wood: 120, gold: 120 }, trainTime: 20, pop: 2, gather: false, desc: 'Осадная машина: сносит здания издалека', bld: 'blacksmith', ageReq: 2 },
  monk:        { name: 'Имам',        hp: 50,  atk: 0,  range: 135, speed: 108, cost: { food: 0, wood: 0, gold: 110 },  trainTime: 14, pop: 1, gather: false, desc: 'Служитель мечети — лечит ваше войско', bld: 'mosque', ageReq: 0 },
  trader:      { name: 'Көпес (торговец)', hp: 90, atk: 0, range: 16, speed: 104, cost: { food: 0, wood: 0, gold: 80 }, trainTime: 12, pop: 1, gather: false, desc: 'Караванщик: возит товар в дружественные города и племена — привозит золото', bld: 'market', ageReq: 0 },
  scout:       { name: 'Барлаушы',    hp: 60,  atk: 6,  range: 26,  speed: 196, cost: { food: 60, wood: 0, gold: 10 },   trainTime: 8,  pop: 1, gather: false, desc: 'Разведчик: открывает карту, ищет становища народов, обороняется; авто-разведка', bld: 'towncenter', ageReq: 0 },
  wolf:        { name: 'Матёрый волк',hp: 60,  atk: 8,  range: 26,  speed: 150, cost: { food: 0, wood: 0, gold: 0 },   trainTime: 0,  pop: 0, gather: false, desc: 'Дикий зверь',            bld: 'barracks', ageReq: 0 },
  sheep:       { name: 'Овца',        hp: 30,  atk: 0,  range: 16,  speed: 70,  cost: { food: 0, wood: 0, gold: 0 },   trainTime: 0,  pop: 0, gather: false, desc: 'Пасётся, даёт еду',       bld: 'towncenter', ageReq: 0 },
  cow:         { name: 'Корова',      hp: 55,  atk: 0,  range: 16,  speed: 60,  cost: { food: 0, wood: 0, gold: 0 },   trainTime: 0,  pop: 0, gather: false, desc: 'Скот: много еды',        bld: 'towncenter', ageReq: 0 },
  deer:        { name: 'Олень',       hp: 40,  atk: 0,  range: 16,  speed: 175, cost: { food: 0, wood: 0, gold: 0 },   trainTime: 0,  pop: 0, gather: false, desc: 'Быстрая дичь',           bld: 'towncenter', ageReq: 0 },
} as const;

export type UnitKey = keyof typeof UNIT_DEFS;

// ── Технологии (исследуются в зданиях) ──
export interface TechDef { id: string; name: string; desc: string; bld: BuildingKey; ageReq: number; cost: { wood: number; food: number; gold: number }; time: number; icon: string }
export const TECHS: Record<string, TechDef> = {
  sharpBlades: { id: 'sharpBlades', name: 'Дамасские сабли', desc: '+25% к атаке всей армии', bld: 'blacksmith', ageReq: 1, cost: { wood: 0, food: 120, gold: 150 }, time: 20, icon: '⚔️' },
  forgedArmor:  { id: 'forgedArmor', name: 'Кольчуга батыра', desc: '+25% к здоровью всей армии', bld: 'blacksmith', ageReq: 1, cost: { wood: 150, food: 0, gold: 150 }, time: 20, icon: '🛡️' },
  infantryDrill:{ id: 'infantryDrill', name: 'Выучка сарбазов', desc: '+15% к скорости пехоты', bld: 'barracks', ageReq: 0, cost: { wood: 0, food: 150, gold: 60 }, time: 18, icon: '🎖️' },
  eagleEye:     { id: 'eagleEye', name: 'Глаз беркута', desc: '+20% к дальности стрелков и башен', bld: 'barracks', ageReq: 1, cost: { wood: 100, food: 0, gold: 120 }, time: 18, icon: '🦅' },
  horseBreeding:{ id: 'horseBreeding', name: 'Аргамаки', desc: '+15% к скорости и HP конницы', bld: 'stable', ageReq: 1, cost: { wood: 0, food: 180, gold: 140 }, time: 22, icon: '🐴' },
  heavyShot:    { id: 'heavyShot', name: 'Тяжёлые снаряды', desc: '+35% к урону катапульт', bld: 'blacksmith', ageReq: 2, cost: { wood: 200, food: 0, gold: 200 }, time: 24, icon: '🪨' },
  ironTools:    { id: 'ironTools', name: 'Железные орудия', desc: '+30% к скорости добычи', bld: 'towncenter', ageReq: 0, cost: { wood: 120, food: 0, gold: 80 }, time: 16, icon: '⛏️' },
  wheelbarrow:  { id: 'wheelbarrow', name: 'Арба', desc: 'Шаруа переносят больше груза', bld: 'towncenter', ageReq: 0, cost: { wood: 100, food: 60, gold: 0 }, time: 16, icon: '🛞' },
  coinage:      { id: 'coinage', name: 'Чеканка монеты', desc: 'Базар даёт больше золота и выгодный обмен', bld: 'market', ageReq: 0, cost: { wood: 0, food: 100, gold: 100 }, time: 16, icon: '🪙' },
};

// ── ЛИНИИ АПГРЕЙДА ЮНИТОВ (AoE) ────────────────────────────────────────────
// Каждый шаг необратимо улучшает ВСЕХ юнитов типа (и уже готовых, и будущих),
// меняет имя и добавляет султан на шлем. Структура совместима с TechDef —
// апгрейды исследуются тем же механизмом research()/applyTech().
export interface UpgradeDef extends TechDef {
  unit: UnitKey;          // какой род войск улучшаем
  tier: 1 | 2;            // ступень линии (2 требует изученной 1)
  newName: string;        // как юнит зовётся после апгрейда
  hpMult: number; atkMult: number; speedMult?: number; rangeMult?: number;
  plume: string;          // цвет султана на шлеме (визуальная метка ступени)
}
export const UPGRADES: Record<string, UpgradeDef> = {
  // Сарбаз: пехота ханского ополчения
  swordHeavy: { id: 'swordHeavy', unit: 'swordsman', tier: 1, newName: 'Ауыр сарбаз', name: 'Ауыр сарбаз (тяжёлый)', desc: 'Сарбазы получают кольчугу и щит: +25% HP, +20% к атаке', bld: 'barracks', ageReq: 1, cost: { wood: 0, food: 160, gold: 100 }, time: 25, icon: '🗡️', hpMult: 1.25, atkMult: 1.20, plume: '#cbd5e1' },
  swordGuard: { id: 'swordGuard', unit: 'swordsman', tier: 2, newName: 'Хан сарбазы', name: 'Хан сарбазы (гвардия)', desc: 'Гвардия хана: ещё +30% HP, +30% к атаке', bld: 'barracks', ageReq: 2, cost: { wood: 0, food: 280, gold: 220 }, time: 32, icon: '🛡️', hpMult: 1.30, atkMult: 1.30, plume: '#fbbf24' },
  // Найзагер: копейщики против конницы
  spearHeavy: { id: 'spearHeavy', unit: 'spearman', tier: 1, newName: 'Ауыр найзагер', name: 'Ауыр найзагер (тяжёлый)', desc: 'Длинная пика и панцирь: +25% HP, +20% к атаке', bld: 'barracks', ageReq: 1, cost: { wood: 60, food: 150, gold: 80 }, time: 25, icon: '🔱', hpMult: 1.25, atkMult: 1.20, plume: '#cbd5e1' },
  spearWall: { id: 'spearWall', unit: 'spearman', tier: 2, newName: 'Қалқан найзагер', name: 'Қалқан найзагер (щитоносец)', desc: 'Стена щитов: ещё +35% HP, +25% к атаке', bld: 'barracks', ageReq: 2, cost: { wood: 120, food: 260, gold: 180 }, time: 32, icon: '🛡️', hpMult: 1.35, atkMult: 1.25, plume: '#fbbf24' },
  // Мерген: степные лучники
  archEagle: { id: 'archEagle', unit: 'archer', tier: 1, newName: 'Қыран мерген', name: 'Қыран мерген (беркут)', desc: 'Тугой лук: +20% HP, +25% к атаке, +8% дальности', bld: 'barracks', ageReq: 1, cost: { wood: 120, food: 0, gold: 110 }, time: 25, icon: '🏹', hpMult: 1.20, atkMult: 1.25, rangeMult: 1.08, plume: '#cbd5e1' },
  archFalcon: { id: 'archFalcon', unit: 'archer', tier: 2, newName: 'Сұңқар мерген', name: 'Сұңқар мерген (сокол)', desc: 'Бронебойные стрелы: ещё +25% HP, +30% к атаке, +10% дальности', bld: 'barracks', ageReq: 2, cost: { wood: 220, food: 0, gold: 230 }, time: 32, icon: '🎯', hpMult: 1.25, atkMult: 1.30, rangeMult: 1.10, plume: '#fbbf24' },
  // Жасауыл: тяжёлая конница
  cavHeavy: { id: 'cavHeavy', unit: 'cavalry', tier: 1, newName: 'Ауыр жасауыл', name: 'Ауыр жасауыл (тяжёлый)', desc: 'Конский доспех: +25% HP, +20% к атаке', bld: 'stable', ageReq: 1, cost: { wood: 0, food: 200, gold: 140 }, time: 28, icon: '🐎', hpMult: 1.25, atkMult: 1.20, plume: '#cbd5e1' },
  cavTulpar: { id: 'cavTulpar', unit: 'cavalry', tier: 2, newName: 'Тұлпар жасауыл', name: 'Тұлпар жасауыл (аргамак)', desc: 'Тулпары — кони-легенды: ещё +30% HP, +30% к атаке, +8% скорости', bld: 'stable', ageReq: 2, cost: { wood: 0, food: 320, gold: 260 }, time: 34, icon: '🏇', hpMult: 1.30, atkMult: 1.30, speedMult: 1.08, plume: '#fbbf24' },
};
// линия апгрейдов конкретного рода войск, по порядку ступеней
export function upgradeLine(unit: UnitKey): UpgradeDef[] {
  return Object.values(UPGRADES).filter(u => u.unit === unit).sort((a, b) => a.tier - b.tier);
}

export const BUILDING_DEFS = {
  towncenter: { name: 'Ханская ставка', hp: 1600, size: 120, cost: { wood: 0, food: 0, gold: 0 }, buildTime: 0, sight: 320, attack: { dmg: 8, range: 190, cd: 1.4 }, desc: 'Орда — сердце вашего ханства' },
  house:      { name: 'Юрта',          hp: 350,  size: 56,  cost: { wood: 50, food: 0, gold: 0 }, buildTime: 9,  sight: 160, attack: null, desc: '+8 к населению' },
  barracks:   { name: 'Казармы',       hp: 700,  size: 92,  cost: { wood: 200, food: 0, gold: 0 }, buildTime: 16, sight: 220, attack: null, desc: 'Готовит сарбазов, найзагеров и мергенов' },
  stable:     { name: 'Конюшня',       hp: 650,  size: 92,  cost: { wood: 180, food: 0, gold: 0 }, buildTime: 15, sight: 200, attack: null, desc: 'Растит боевых коней для жасауылов' },
  blacksmith: { name: 'Кузница',       hp: 600,  size: 80,  cost: { wood: 160, food: 0, gold: 60 }, buildTime: 15, sight: 180, attack: null, desc: 'Кует оружие и осадные орудия' },
  market:     { name: 'Базар',         hp: 400,  size: 72,  cost: { wood: 150, food: 0, gold: 0 }, buildTime: 12, sight: 160, attack: null, desc: 'Торг и обмен ресурсов; шлёт көпес-торговцев к друзьям' },
  mosque:     { name: 'Мешіт-медресе', hp: 520,  size: 86,  cost: { wood: 175, food: 0, gold: 100 }, buildTime: 16, sight: 200, attack: null, desc: 'Мечеть и медресе: готовит имамов — лекарей войска' },
  storehouse: { name: 'Қойма (склад)', hp: 420,  size: 68,  cost: { wood: 100, food: 0, gold: 0 }, buildTime: 10, sight: 180, attack: null, desc: 'Шаруа сдают добычу сюда, а не в ставку — ставьте у дальних рощ и жил' },
  tower:      { name: 'Сторожевая башня', hp: 550, size: 56, cost: { wood: 120, food: 0, gold: 80 }, buildTime: 14, sight: 300, attack: { dmg: 12, range: 215, cd: 1.1 }, desc: 'Мергены на башне бьют по врагам' },
  farm:       { name: 'Пашня',         hp: 220,  size: 72,  cost: { wood: 90, food: 0, gold: 0 }, buildTime: 8,  sight: 140, attack: null, desc: 'Бесконечная еда' },
  pen:        { name: 'Загон для скота', hp: 380, size: 110, cost: { wood: 160, food: 0, gold: 0 }, buildTime: 12, sight: 170, attack: null, desc: 'Пастух пригоняет сюда овец и коров' },
  wall:       { name: 'Дуал (стена)',  hp: 900,  size: 44,  cost: { wood: 30, food: 0, gold: 0 }, buildTime: 5,  sight: 120, attack: null, desc: 'Саманная стена преграждает путь врагам' },
  gate:       { name: 'Ворота',        hp: 600,  size: 44,  cost: { wood: 45, food: 0, gold: 0 }, buildTime: 6,  sight: 130, attack: null, desc: 'Проход для своих, стена для врага' },
  wonder:     { name: 'Мавзолей хана', hp: 3000, size: 130, cost: { wood: 600, food: 600, gold: 900 }, buildTime: 40, sight: 360, attack: null, desc: 'Великий монумент степи — постройте для победы', ageReq: 3 },
} as const;

export type BuildingKey = keyof typeof BUILDING_DEFS;

export const DIFF = {
  easy:   { enemyGather: 0.65, waveBase: 2, waveGrowth: 0.7, waveInterval: 95, enemyHp: 0.85, aiAggression: 0.6, name: 'Кочевник' },
  normal: { enemyGather: 0.9,  waveBase: 3, waveGrowth: 1.0, waveInterval: 80, enemyHp: 1.0,  aiAggression: 1.0, name: 'Батыр' },
  hard:   { enemyGather: 1.2,  waveBase: 4, waveGrowth: 1.4, waveInterval: 65, enemyHp: 1.15, aiAggression: 1.5, name: 'Великий хан' },
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
  autosave: boolean;       // автосохранение партии (переживает перезагрузку страницы)
  realAzan: boolean;       // азан по РЕАЛЬНОМУ времени намаза, а не по игровым суткам
  azanCity: string;        // город для расчёта времён (id из CITIES в prayer-times.ts)
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
  // Автосохранение ВКЛ по умолчанию: случайно закрытая вкладка не должна
  // стоить партии. Отключается для тех, кто хочет играть «с нуля».
  autosave: true,
  // По умолчанию ВЫКЛ: старое поведение (азан по игровым суткам) остаётся
  // основным, реальные времена — осознанный выбор игрока.
  realAzan: false,
  azanCity: 'astana',
};
export const SPEED_OPTIONS: { id: GameSpeed; label: string }[] = [
  { id: 0.75, label: '0.75×' },
  { id: 1, label: '1×' },
  { id: 1.5, label: '1.5×' },
  { id: 2, label: '2×' },
];

export const SCORE = { kill: 100, wolfKill: 60, building: 350, tc: 1500, ageUp: 400, gatherPer10: 4 };
