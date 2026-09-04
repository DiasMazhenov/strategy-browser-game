export type Difficulty = 'easy' | 'normal' | 'hard';

export const WORLD = { w: 2600, h: 2000 };

export const AGES = [
  { id: 0, name: 'Dark Age', cost: null as null | { food: number; gold: number }, mult: 1.0, icon: '🌑' },
  { id: 1, name: 'Feudal Age', cost: { food: 450, gold: 0 }, mult: 1.15, icon: '⚔️' },
  { id: 2, name: 'Castle Age', cost: { food: 800, gold: 350 }, mult: 1.32, icon: '🏰' },
  { id: 3, name: 'Imperial Age', cost: { food: 1200, gold: 750 }, mult: 1.55, icon: '👑' },
];

export const UNIT_DEFS = {
  villager:    { name: 'Villager',  hp: 55,  atk: 4,  range: 22,  speed: 118, cost: { food: 50, wood: 0, gold: 0 }, trainTime: 7,  pop: 1, gather: true,  desc: 'Gathers & builds' },
  swordsman:   { name: 'Militia',   hp: 110, atk: 11, range: 28,  speed: 132, cost: { food: 70, wood: 0, gold: 20 }, trainTime: 9, pop: 1, gather: false, desc: 'Tough melee' },
  archer:      { name: 'Archer',    hp: 70,  atk: 9,  range: 175, speed: 126, cost: { food: 0, wood: 45, gold: 55 }, trainTime: 10, pop: 1, gather: false, desc: 'Long range' },
  knight:      { name: 'Knight',    hp: 190, atk: 16, range: 30,  speed: 178, cost: { food: 90, wood: 0, gold: 70 }, trainTime: 13, pop: 1, gather: false, desc: 'Fast & deadly' },
  wolf:        { name: 'Dire Wolf', hp: 60,  atk: 8,  range: 26,  speed: 150, cost: { food: 0, wood: 0, gold: 0 }, trainTime: 0, pop: 0, gather: false, desc: 'Wild beast' },
} as const;

export type UnitKey = keyof typeof UNIT_DEFS;

export const BUILDING_DEFS = {
  towncenter: { name: 'Town Center', hp: 1600, size: 120, cost: { wood: 0, food: 0, gold: 0 }, buildTime: 0, sight: 320, attack: { dmg: 8, range: 190, cd: 1.4 }, desc: 'Heart of your empire' },
  house:      { name: 'House',       hp: 350,  size: 56,  cost: { wood: 50, food: 0, gold: 0 }, buildTime: 9, sight: 160, attack: null, desc: '+8 population' },
  barracks:   { name: 'Barracks',    hp: 700,  size: 92,  cost: { wood: 200, food: 0, gold: 0 }, buildTime: 16, sight: 220, attack: null, desc: 'Trains army' },
  tower:      { name: 'Watch Tower', hp: 550,  size: 56,  cost: { wood: 120, food: 0, gold: 80 }, buildTime: 14, sight: 300, attack: { dmg: 12, range: 215, cd: 1.1 }, desc: 'Shoots enemies' },
  farm:       { name: 'Farm',        hp: 220,  size: 72,  cost: { wood: 90, food: 0, gold: 0 }, buildTime: 8, sight: 140, attack: null, desc: 'Endless food' },
} as const;

export type BuildingKey = keyof typeof BUILDING_DEFS;

export const DIFF = {
  easy:   { enemyGather: 0.65, waveBase: 2, waveGrowth: 0.7, waveInterval: 95, enemyHp: 0.85, name: 'Settler' },
  normal: { enemyGather: 0.9,  waveBase: 3, waveGrowth: 1.0, waveInterval: 80, enemyHp: 1.0,  name: 'Warlord' },
  hard:   { enemyGather: 1.2,  waveBase: 4, waveGrowth: 1.4, waveInterval: 65, enemyHp: 1.15, name: 'Conqueror' },
} as const;

export const SCORE = { kill: 100, wolfKill: 60, building: 350, tc: 1500, ageUp: 400, gatherPer10: 4 };
