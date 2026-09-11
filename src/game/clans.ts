// Роды-таңба (п.12 плана, 1.0.129).
//
// До похода игрок выбирает один из четырёх родов: каждый даёт две пассивки в
// ±10–15% и свою таңбу (родовой знак) над ставкой. Смысл — реиграбельность без
// нового контента карт: «ещё одна партия» играется иначе уже со старта.
//
// Бонусы применяются ТОЛЬКО к игроку: у ИИ упрощённая экономика, и сравнивать
// силу сторон сложнее, чем кажется (см. context.md, п.30).

export type ClanId = 'argyn' | 'qypshaq' | 'naiman' | 'uisyn';

/** Ключи множителей: 1 = бонуса нет. */
export interface ClanMods {
  /** приплод в загонах: шанс двойни */
  tel: number;
  /** стоимость загона (pen) */
  penCost: number;
  /** выручка керуена */
  caravan: number;
  /** скорость барлаушы */
  scout: number;
  /** HP конницы (батыр, жасауыл, атты-мерген) */
  cavHp: number;
  /** стоимость батыра */
  knightCost: number;
  /** скорость стройки */
  build: number;
  /** HP башен */
  towerHp: number;
}

const NEUTRAL: ClanMods = { tel: 1, penCost: 1, caravan: 1, scout: 1, cavHp: 1, knightCost: 1, build: 1, towerHp: 1 };

export interface Clan {
  id: ClanId;
  name: string;
  /** ключ иконки-таңбы в iconset.ts */
  tamga: string;
  /** короткая строка для карточки выбора */
  perk: string;
  /** развёрнутое описание для подсказки */
  desc: string;
  mods: ClanMods;
}

export const CLANS: Clan[] = [
  {
    id: 'argyn', name: 'Арғын', tamga: 'tamga-argyn',
    perk: 'скот и загоны',
    desc: 'Приплод в загонах чаще (15% шанс двойни), загоны дешевле на 15%',
    mods: { ...NEUTRAL, tel: 1.15, penCost: 0.85 },
  },
  {
    id: 'qypshaq', name: 'Қыпшақ', tamga: 'tamga-qypshaq',
    perk: 'торговля и разведка',
    desc: 'Керуены приносят на 15% больше, барлаушы ходит на 15% быстрее',
    mods: { ...NEUTRAL, caravan: 1.15, scout: 1.15 },
  },
  {
    id: 'naiman', name: 'Найман', tamga: 'tamga-naiman',
    perk: 'конница',
    desc: 'Конница (батыр, жасауыл, атты-мерген) живучее на 10%, батыр дешевле на 15%',
    mods: { ...NEUTRAL, cavHp: 1.1, knightCost: 0.85 },
  },
  {
    id: 'uisyn', name: 'Ұйсын', tamga: 'tamga-uisyn',
    perk: 'стройка и оборона',
    desc: 'Стройка идёт на 12% быстрее, башни крепче на 15%',
    mods: { ...NEUTRAL, build: 1.12, towerHp: 1.15 },
  },
];

export const CLAN_BY_ID: Record<string, Clan> = Object.fromEntries(CLANS.map(c => [c.id, c]));
export const DEFAULT_CLAN: ClanId = 'argyn';

/** Множители рода; неизвестный/отсутствующий род (старый сейв) — нейтральные. */
export function clanMods(clan?: string): ClanMods {
  return CLAN_BY_ID[clan ?? '']?.mods ?? NEUTRAL;
}
