// АВТОГЕНЕРАЦИЯ: scripts/build-sprites.cjs — якоря изо-фундамента спрайтов.
// Здания: ax,ay — точка спрайта, садящаяся на переднюю кромку ромба клетки; baseW — ширина фундамента.
// Юниты: ax — центр по X, ay — низ (ноги); w,h — размеры.
export interface SprAnchor { ax: number; ay: number; baseW: number; w: number; h: number }
export const SPR_ANCHORS: Record<string, SprAnchor> = {
  "towncenter": {
    "ax": 164,
    "ay": 379,
    "baseW": 307,
    "w": 324,
    "h": 380
  },
  "house": {
    "ax": 190,
    "ay": 352,
    "baseW": 347,
    "w": 380,
    "h": 353
  },
  "barracks": {
    "ax": 181.5,
    "ay": 379,
    "baseW": 364,
    "w": 370,
    "h": 380
  },
  "stable": {
    "ax": 189,
    "ay": 283,
    "baseW": 379,
    "w": 380,
    "h": 284
  },
  "blacksmith": {
    "ax": 184.5,
    "ay": 348,
    "baseW": 370,
    "w": 380,
    "h": 349
  },
  "market": {
    "ax": 191.5,
    "ay": 315,
    "baseW": 360,
    "w": 380,
    "h": 316
  },
  "tower": {
    "ax": 76,
    "ay": 379,
    "baseW": 153,
    "w": 153,
    "h": 380
  },
  "farm": {
    "ax": 189.5,
    "ay": 205,
    "baseW": 370,
    "w": 380,
    "h": 206
  },
  "wall": {
    "ax": 93,
    "ay": 75,
    "baseW": 186,
    "w": 186,
    "h": 150
  },
  "gate": {
    "ax": 76,
    "ay": 75,
    "baseW": 152,
    "w": 152,
    "h": 150
  }
};
export const UNIT_ANCHORS: Record<string, SprAnchor> = {
  "villager": {
    "ax": 43.5,
    "ay": 149,
    "baseW": 87,
    "w": 87,
    "h": 150
  },
  "villager_w": {
    "ax": 48.5,
    "ay": 149,
    "baseW": 97,
    "w": 97,
    "h": 150
  },
  "vchop1": { "ax": 44.3, "ay": 149, "baseW": 87, "w": 87, "h": 150 },
  "vchop2": { "ax": 44.8, "ay": 149, "baseW": 87, "w": 87, "h": 150 },
  "vmine1": { "ax": 44.4, "ay": 149, "baseW": 87, "w": 87, "h": 150 },
  "vmine2": { "ax": 44.2, "ay": 149, "baseW": 83, "w": 83, "h": 150 },
  "vgather1": { "ax": 40.3, "ay": 149, "baseW": 83, "w": 83, "h": 150 },
  "vgather2": { "ax": 38.5, "ay": 149, "baseW": 77, "w": 77, "h": 150 },
  "vfront": { "ax": 40.0, "ay": 149, "baseW": 83, "w": 83, "h": 150 },
  "vback": { "ax": 34.5, "ay": 149, "baseW": 71, "w": 71, "h": 150 },
  // 4-фазный цикл ходьбы: сбоку (vsw), спереди (vfw), со спины (vbw)
  "vsw1": { "ax": 38.0, "ay": 149, "baseW": 83, "w": 83, "h": 150 },
  "vsw2": { "ax": 38.0, "ay": 149, "baseW": 75, "w": 75, "h": 150 },
  "vsw3": { "ax": 38.0, "ay": 149, "baseW": 83, "w": 83, "h": 150 },
  "vfw1": { "ax": 35.0, "ay": 149, "baseW": 77, "w": 77, "h": 150 },
  "vfw2": { "ax": 35.0, "ay": 149, "baseW": 77, "w": 77, "h": 150 },
  "vfw3": { "ax": 35.0, "ay": 149, "baseW": 77, "w": 77, "h": 150 },
  "vfw4": { "ax": 37.0, "ay": 149, "baseW": 78, "w": 78, "h": 150 },
  "vbw1": { "ax": 33.0, "ay": 149, "baseW": 71, "w": 71, "h": 150 },
  "vbw2": { "ax": 34.0, "ay": 149, "baseW": 71, "w": 71, "h": 150 },
  "vbw3": { "ax": 37.0, "ay": 149, "baseW": 71, "w": 71, "h": 150 },
  "vbw4": { "ax": 36.0, "ay": 149, "baseW": 71, "w": 71, "h": 150 },
  "swordsman": {
    "ax": 47,
    "ay": 149,
    "baseW": 94,
    "w": 94,
    "h": 150
  },
  "swordsman_w": {
    "ax": 39,
    "ay": 149,
    "baseW": 78,
    "w": 78,
    "h": 150
  },
  "swordsman_walk2": {
    "ax": 37.5,
    "ay": 149,
    "baseW": 75,
    "w": 75,
    "h": 150
  },
  // ополченец: рубка мечом и 4-фазная ходьба (сбоку/спереди/со спины)
  "sslash": { "ax": 47, "ay": 149, "baseW": 94, "w": 94, "h": 150 },
  "ssw3":   { "ax": 42, "ay": 149, "baseW": 92, "w": 92, "h": 150 },
  "sfw1":   { "ax": 48, "ay": 149, "baseW": 94, "w": 94, "h": 150 },
  "sfw2":   { "ax": 49, "ay": 149, "baseW": 99, "w": 99, "h": 150 },
  "sfw3":   { "ax": 50, "ay": 149, "baseW": 94, "w": 94, "h": 150 },
  "sfw4":   { "ax": 49, "ay": 149, "baseW": 94, "w": 94, "h": 150 },
  "sbw1":   { "ax": 46, "ay": 149, "baseW": 96, "w": 96, "h": 150 },
  "sbw2":   { "ax": 32, "ay": 149, "baseW": 81, "w": 81, "h": 150 },
  "sbw3":   { "ax": 51, "ay": 149, "baseW": 104, "w": 104, "h": 150 },
  "sbw4":   { "ax": 33, "ay": 149, "baseW": 68, "w": 68, "h": 150 },
  "archer": {
    "ax": 56.5,
    "ay": 149,
    "baseW": 113,
    "w": 113,
    "h": 150
  },
  "archer_w": {
    "ax": 54,
    "ay": 149,
    "baseW": 108,
    "w": 108,
    "h": 150
  },
  // лучник: стрельба из лука (прицел/выпуск) и 4-фазная ходьба спереди/со спины (сбоку — archer/archer_w)
  "aaim":     { "ax": 54,   "ay": 149, "baseW": 108, "w": 108, "h": 150 },
  "arelease": { "ax": 56.5, "ay": 149, "baseW": 113, "w": 113, "h": 150 },
  "afw1": { "ax": 45.5, "ay": 149, "baseW": 91,  "w": 91,  "h": 150 },
  "afw2": { "ax": 52,   "ay": 149, "baseW": 104, "w": 104, "h": 150 },
  "afw3": { "ax": 56.5, "ay": 149, "baseW": 113, "w": 113, "h": 150 },
  "afw4": { "ax": 56.5, "ay": 149, "baseW": 113, "w": 113, "h": 150 },
  "abw1": { "ax": 37, "ay": 149, "baseW": 74,  "w": 74,  "h": 150 },
  "abw2": { "ax": 54, "ay": 149, "baseW": 108, "w": 108, "h": 150 },
  "abw3": { "ax": 37, "ay": 149, "baseW": 74,  "w": 74,  "h": 150 },
  "abw4": { "ax": 54, "ay": 149, "baseW": 108, "w": 108, "h": 150 },
  "spearman": {
    "ax": 75,
    "ay": 77,
    "baseW": 150,
    "w": 150,
    "h": 78
  },
  "spearman_w": {
    "ax": 75,
    "ay": 103,
    "baseW": 150,
    "w": 150,
    "h": 104
  },
  "knight": {
    "ax": 75,
    "ay": 127,
    "baseW": 150,
    "w": 150,
    "h": 128
  },
  "knight_w": {
    "ax": 75,
    "ay": 118,
    "baseW": 150,
    "w": 150,
    "h": 119
  },
  "cavalry": {
    "ax": 63.5,
    "ay": 149,
    "baseW": 127,
    "w": 127,
    "h": 150
  },
  "cavalry_w": {
    "ax": 75,
    "ay": 133,
    "baseW": 150,
    "w": 150,
    "h": 134
  },
  "catapult": {
    "ax": 75,
    "ay": 80,
    "baseW": 150,
    "w": 150,
    "h": 81
  },
  "catapult_w": {
    "ax": 75,
    "ay": 80,
    "baseW": 150,
    "w": 150,
    "h": 81
  },
  "monk": {
    "ax": 41.5,
    "ay": 149,
    "baseW": 83,
    "w": 83,
    "h": 150
  },
  "monk_w": {
    "ax": 52,
    "ay": 149,
    "baseW": 104,
    "w": 104,
    "h": 150
  },
  "wolf": {
    "ax": 75,
    "ay": 90,
    "baseW": 150,
    "w": 150,
    "h": 91
  },
  "wolf_w": {
    "ax": 75,
    "ay": 81,
    "baseW": 150,
    "w": 150,
    "h": 82
  },
  "sheep": {
    "ax": 51,
    "ay": 96,
    "baseW": 133,
    "w": 133,
    "h": 96
  },
  "sheep_w": {
    "ax": 64,
    "ay": 96,
    "baseW": 140,
    "w": 140,
    "h": 96
  },
  "cow": {
    "ax": 90.5,
    "ay": 108,
    "baseW": 181,
    "w": 181,
    "h": 108
  },
  "cow_w": {
    "ax": 96,
    "ay": 108,
    "baseW": 192,
    "w": 192,
    "h": 108
  },
  "deer": {
    "ax": 45.5,
    "ay": 112,
    "baseW": 91,
    "w": 91,
    "h": 112
  },
  "deer_w": {
    "ax": 102.5,
    "ay": 112,
    "baseW": 205,
    "w": 205,
    "h": 112
  }
};
// целевая высота юнита на экране (iso px)
export const UNIT_TARGET_H: Record<string, number> = {
  villager: 46, swordsman: 48, archer: 46, spearman: 50, knight: 60, cavalry: 60, catapult: 46, monk: 44, wolf: 34,
  sheep: 30, cow: 36, deer: 40,
};
