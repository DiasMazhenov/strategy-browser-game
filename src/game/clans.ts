// Роды-таңба (п.12 плана, 1.0.129).
//
// До похода игрок выбирает один из пяти родов: каждый даёт две пассивки в
// ±10–15% и свою таңбу (родовой знак) над ставкой. Смысл — реиграбельность без
// нового контента карт: «ещё одна партия» играется иначе уже со старта.
//
// Бонусы применяются ТОЛЬКО к игроку: у ИИ упрощённая экономика, и сравнивать
// силу сторон сложнее, чем кажется (см. context.md, п.30).

export type ClanId = 'argyn' | 'qypshaq' | 'naiman' | 'uisyn' | 'kerey' | 'dulat';

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
  /** накопление мудрости */
  wisdom: number;
  /** стоимость посланника к племени */
  envoy: number;
  /** скорость добычи (дерево, еда, золото) */
  gather: number;
  /** темп найма войск */
  train: number;
}

const NEUTRAL: ClanMods = { tel: 1, penCost: 1, caravan: 1, scout: 1, cavHp: 1, knightCost: 1, build: 1, towerHp: 1, wisdom: 1, envoy: 1, gather: 1, train: 1 };

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
  {
    id: 'kerey', name: 'Керей', tamga: 'tamga-kerey',
    perk: 'мудрость и послы',
    desc: 'Мудрость копится на 15% быстрее, посланники к племенам дешевле на 15%',
    mods: { ...NEUTRAL, wisdom: 1.15, envoy: 0.85 },
  },
  {
    id: 'dulat', name: 'Дулат', tamga: 'tamga-dulat',
    perk: 'добыча и найм',
    desc: 'Добыча на 12% быстрее, войска готовятся на 15% быстрее',
    mods: { ...NEUTRAL, gather: 1.12, train: 1.15 },
  },
];

export const CLAN_BY_ID: Record<string, Clan> = Object.fromEntries(CLANS.map(c => [c.id, c]));
export const DEFAULT_CLAN: ClanId = 'argyn';

/**
 * Что род ДЖУНГАР реально меняет на поле боя (1.0.131).
 *
 * Враг получает род из той же таблицы, но не все множители ему применимы:
 * экономика ИИ упрощённая (золото капает по формуле, очередей найма и
 * караванов у него нет). Поэтому врагу идут только боевые и дипломатические
 * множители: конница, башни, темп стройки, скорость конных и частота послов.
 * У рода Арғын боевого множителя нет — партия против него объективно легче,
 * и это честная часть асимметрии, а не недоделка.
 */
export const RIVAL_NOTE: Record<ClanId, string> = {
  argyn: 'скот и загоны — в бою нейтрально',
  qypshaq: 'конница джунгар ходит быстрее',
  naiman: 'конница джунгар живучее (+10% HP)',
  uisyn: 'строит быстрее, башни крепче (+15% HP)',
  kerey: 'чаще шлёт послов к племенам',
  dulat: 'добыча и найм — в бою нейтрально',
};

/** Случайный род — для жеребьёвки джунгар в начале партии. */
export function randomClan(r: () => number = Math.random): ClanId {
  const i = Math.floor(r() * CLANS.length);
  return CLANS[Math.max(0, Math.min(CLANS.length - 1, i))].id;
}


/** Множители рода; неизвестный/отсутствующий род (старый сейв) — нейтральные. */
export function clanMods(clan?: string): ClanMods {
  return CLAN_BY_ID[clan ?? '']?.mods ?? NEUTRAL;
}
