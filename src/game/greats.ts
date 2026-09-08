// «Великие люди» степи (пункт 11 плана): за накопленную МУДРОСТЬ хан призывает
// исторических биев — трёх авторов свода законов «Жеті Жарғы».
//
// Мудрость — мягкий ресурс, капает от Мешіт-медресе, Мавзолея и реликвий.
// Она НЕ тратится на юнитов и здания, поэтому не конкурирует с обычной
// экономикой: это отдельная, «культурная» линия развития.
import toleBi from '../assets/portraits/tole_bi.png';
import kazybekBi from '../assets/portraits/kazybek_bi.png';
import aitekeBi from '../assets/portraits/aiteke_bi.png';

export type GreatId = 'tole' | 'kazybek' | 'aiteke';

export interface GreatDef {
  id: GreatId;
  name: string;
  title: string;
  portrait: string;
  cost: number;          // мудрости на призыв
  effect: string;        // краткое описание эффекта (для кнопки)
  lore: string;          // историческая справка (для баннера призыва)
}

export const GREATS: GreatDef[] = [
  {
    id: 'tole',
    name: 'Толе би',
    title: 'Мудрец Старшего жуза',
    portrait: toleBi,
    cost: 220,
    effect: 'Неприязнь всех народов падает, союзы крепнут',
    lore: 'Хранитель степного права, чьё слово мирило враждующие роды без единой стрелы.',
  },
  {
    id: 'kazybek',
    name: 'Казыбек би',
    title: 'Оратор Среднего жуза',
    portrait: kazybekBi,
    cost: 260,
    effect: 'Базары дают больше золота, караваны идут чаще',
    lore: 'Его речь перед джунгарским правителем вернула степи пленных без выкупа.',
  },
  {
    id: 'aiteke',
    name: 'Айтеке би',
    title: 'Законник Младшего жуза',
    portrait: aitekeBi,
    cost: 300,
    effect: 'Исследования идут быстрее, постройки дешевеют',
    lore: 'Соавтор «Жеті Жарғы» — свода, по которому степь жила полтора века.',
  },
];

export const GREAT_BY_ID: Record<string, GreatDef> =
  Object.fromEntries(GREATS.map(g => [g.id, g]));
