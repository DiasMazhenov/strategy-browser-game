// Курсоры действий: под каждым типом цели — свой курсор (сабля по врагу, топор
// по лесу, кирка по золоту и т.д.). Арт — gpt image, сборка 32×32 в
// scripts/build-cursors.cjs, горячие точки там же в hotspots.json.
//
// Ставим их CSS-свойством canvas.style.cursor, а не рисуем на канвасе: курсор
// от ОС не отстаёт от указателя на кадр и не мигает при просадках fps.
import curAttack from '../assets/cursors/attack.png';
import curWood from '../assets/cursors/wood.png';
import curGold from '../assets/cursors/gold.png';
import curFood from '../assets/cursors/food.png';
import curFish from '../assets/cursors/fish.png';
import curBuild from '../assets/cursors/build.png';
import curMove from '../assets/cursors/move.png';

export type CursorKind =
  | 'default' | 'attack' | 'wood' | 'gold' | 'food' | 'fish'
  | 'build' | 'move' | 'select' | 'pan';

// hx,hy — горячая точка: пиксель картинки, попадающий ровно в точку клика.
// Значения для кадра 16×16 — держать в согласии с scripts/build-cursors.cjs.
// У инструментов это рабочая кромка (остриё сабли, лезвие топора), у стрелки
// «идти» — её жало, у предметов-символов — центр.
const ART: Record<string, { url: string; hx: number; hy: number }> = {
  attack: { url: curAttack, hx: 1, hy: 1 },
  wood: { url: curWood, hx: 1, hy: 5 },
  gold: { url: curGold, hx: 3, hy: 2 },
  food: { url: curFood, hx: 8, hy: 8 },
  fish: { url: curFish, hx: 8, hy: 8 },
  build: { url: curBuild, hx: 3, hy: 3 },
  move: { url: curMove, hx: 8, hy: 14 },
};

// Запасные системные курсоры: пока png не загрузился (или если он не нужен).
const FALLBACK: Record<CursorKind, string> = {
  default: 'crosshair', attack: 'crosshair', wood: 'crosshair', gold: 'crosshair',
  food: 'crosshair', fish: 'crosshair', build: 'crosshair', move: 'crosshair',
  select: 'pointer', pan: 'grabbing',
};

export function cursorCss(kind: CursorKind): string {
  const a = ART[kind];
  if (!a) return FALLBACK[kind] ?? 'crosshair';
  // url(...) + горячая точка, с системным запасным вариантом через запятую:
  // если картинка не отдалась, браузер возьмёт crosshair, а не стрелку по умолчанию.
  return `url(${a.url}) ${a.hx} ${a.hy}, ${FALLBACK[kind] ?? 'crosshair'}`;
}
