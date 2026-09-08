// ── Народы мира и их правители (дипломатия в духе Civilization) ──
// Изначально игрок ни с кем не знаком: народы «открываются» при контакте на карте.
// Портреты — AI-арт (gpt image). Реплики и варианты ответов — здесь.
import rivalRuler from '../assets/portraits/rival_ruler.png';
import pechenegKhan from '../assets/portraits/pecheneg_khan.png';
import oghuzYabgu from '../assets/portraits/oghuz_yabgu.png';
import khwarezmShah from '../assets/portraits/khwarezm_shah.png';
import dzungarLeader from '../assets/portraits/dzungar_leader.png';
import kokandKhan from '../assets/portraits/kokand_khan.png';
import bukharaEmir from '../assets/portraits/bukhara_emir.png';
import russianEmpress from '../assets/portraits/russian_empress.png';
import abylaiKhan from '../assets/portraits/abylai_khan.png';

export type FacRel = 'neutral' | 'friend' | 'hostile';

export interface DipChoice {
  id: string;
  label: string;
  desc?: string;
  gold?: number;      // стоимость в золоте
  act: 'warm' | 'giftBig' | 'cold' | 'greet' | 'gift' | 'threat' | 'close';
}
export interface NationDef {
  id: string;
  name: string;
  ruler: string;
  title: string;
  portrait: string;
  color: string;
  kind: 'rival' | 'tribe';
  greet: string;
  choices: DipChoice[];
}

export const PLAYER_NATION = {
  id: 'kazakh',
  name: 'Казахское Ханство',
  ruler: 'Абылай-хан',
  title: 'Великий хан',
  portrait: abylaiKhan,
};

export const NATIONS: NationDef[] = [
  {
    id: 'rival',
    name: 'Джунгарское ханство',
    ruler: 'Галдан Цэрэн',
    title: 'Хунтайджи',
    portrait: dzungarLeader,
    color: '#f87171',
    kind: 'rival',
    greet: 'Гром копыт моих туменов достиг твоих кочевий, степняк. Джунгария не делит пастбища — она их берёт. С чем пожаловал ты в мои земли: с данью или с войском?',
    choices: [
      { id: 'warm', label: '🕊 Мы пришли с миром', desc: 'Дружелюбное приветствие — неприязнь снижается', act: 'warm' },
      { id: 'giftBig', label: '🎁 Поднести дары (75🪙)', desc: 'Богатые дары заметно улучшают отношения', gold: 75, act: 'giftBig' },
      { id: 'cold', label: '⚔️ Степь не твоя', desc: 'Дерзкий ответ — хунтайджи запомнит обиду', act: 'cold' },
    ],
  },
  {
    id: 'pecheneg',
    name: 'Печенеги',
    ruler: 'Куря',
    title: 'Хан',
    portrait: pechenegKhan,
    color: '#e0b050',
    kind: 'tribe',
    greet: 'Мои волки почуяли ваш след раньше, чем вы увидели наши костры. Степь широка — хватит ли в ней места для обоих народов?',
    choices: [
      { id: 'greet', label: '🤝 Поприветствовать хана', desc: 'Нейтральное знакомство', act: 'greet' },
      { id: 'gift', label: '🎁 Дары (40🪙)', desc: 'Племя становится дружественным и не нападает', gold: 40, act: 'gift' },
      { id: 'threat', label: '⚡ Пригрозить', desc: 'Племя затаит зло и будет враждебным', act: 'threat' },
    ],
  },
  {
    id: 'oghuz',
    name: 'Огузы',
    ruler: 'Тоган',
    title: 'Ябгу',
    portrait: oghuzYabgu,
    color: '#d4a373',
    kind: 'tribe',
    greet: 'Гости из-за холмов! Мой шатёр открыт для друзей, огонь горит — присядьте к казану. О чём попросит ваш народ?',
    choices: [
      { id: 'greet', label: '🤝 Поприветствовать ябгу', desc: 'Нейтральное знакомство', act: 'greet' },
      { id: 'gift', label: '🎁 Дары (40🪙)', desc: 'Племя становится дружественным и не нападает', gold: 40, act: 'gift' },
      { id: 'threat', label: '⚡ Пригрозить', desc: 'Племя затаит зло и будет враждебным', act: 'threat' },
    ],
  },
  {
    id: 'khwarezm',
    name: 'Хорезм',
    ruler: 'Ануш-Тегин',
    title: 'Шах',
    portrait: khwarezmShah,
    color: '#5eead4',
    kind: 'tribe',
    greet: 'Караваны уже доносят вести о вашем народе. Богатства Хорезма не знают счёта... чего желает ваш вождь взамен дружбы шаха?',
    choices: [
      { id: 'greet', label: '🤝 Поприветствовать шаха', desc: 'Нейтральное знакомство', act: 'greet' },
      { id: 'gift', label: '🎁 Дары (40🪙)', desc: 'Племя становится дружественным и не нападает', gold: 40, act: 'gift' },
      { id: 'threat', label: '⚡ Пригрозить', desc: 'Племя затаит зло и будет враждебным', act: 'threat' },
    ],
  },
  {
    id: 'slav',
    name: 'Славянское княжество',
    ruler: 'Ратибор',
    title: 'Князь',
    portrait: rivalRuler,
    color: '#c084fc',
    kind: 'tribe',
    greet: 'Мои дозоры заметили ваших всадников у северных рубежей. Я — Ратибор, князь этого народа. Меха, мёд и железо — вот чем богаты мои земли. С чем пришли: с мечом или с добром?',
    choices: [
      { id: 'greet', label: '🤝 Поприветствовать князя', desc: 'Нейтральное знакомство', act: 'greet' },
      { id: 'gift', label: '🎁 Дары (50🪙)', desc: 'Княжество становится дружественным', gold: 50, act: 'gift' },
      { id: 'threat', label: '⚡ Пригрозить', desc: 'Князь затаит обиду', act: 'threat' },
    ],
  },
  {
    id: 'kokand',
    name: 'Кокандское ханство',
    ruler: 'Эрдэнэ-бий',
    title: 'Хан',
    portrait: kokandKhan,
    color: '#4ade80',
    kind: 'tribe',
    greet: 'Добро пожаловать в сени моих дворцов, гость. В Коканде шёлк тоньше паутины, а казна полна серебра. Подарите нам дружбу — и наши базары откроются для ваших людей.',
    choices: [
      { id: 'greet', label: '🤝 Поприветствовать хана', desc: 'Нейтральное знакомство', act: 'greet' },
      { id: 'gift', label: '🎁 Дары (50🪙)', desc: 'Ханат становится дружественным', gold: 50, act: 'gift' },
      { id: 'threat', label: '⚡ Пригрозить', desc: 'Хан затаит обиду', act: 'threat' },
    ],
  },
  {
    id: 'bukhara',
    name: 'Бухарский эмират',
    ruler: 'Мухаммад Рахим',
    title: 'Эмир',
    portrait: bukharaEmir,
    color: '#818cf8',
    kind: 'tribe',
    greet: 'Мудрость старше любого клинка, юный правитель. Медресе Бухары помнят рождение и гибель империй. Скажи — с чем пришёл твой караван к воротам города учёных?',
    choices: [
      { id: 'greet', label: '🤝 Мир эмиру', desc: 'Нейтральное знакомство', act: 'greet' },
      { id: 'gift', label: '🎁 Дары (50🪙)', desc: 'Эмират становится дружественным', gold: 50, act: 'gift' },
      { id: 'threat', label: '⚡ Пригрозить', desc: 'Эмир затаит обиду', act: 'threat' },
    ],
  },
  {
    id: 'russia',
    name: 'Российская империя',
    ruler: 'Екатерина II',
    title: 'Императрица',
    portrait: russianEmpress,
    color: '#93c5fd',
    kind: 'tribe',
    greet: 'До двора Санкт-Петербурга дошли вести о степном хане. Моя империя простирается от Балтики до самых ваших пределов. Я предлагаю вам дружбу великой державы — и торговлю, что умножит вашу казну.',
    choices: [
      { id: 'greet', label: '🤝 Поклониться императрице', desc: 'Нейтральное знакомство', act: 'greet' },
      { id: 'gift', label: '🎁 Посольские дары (60🪙)', desc: 'Империя становится дружественной', gold: 60, act: 'gift' },
      { id: 'threat', label: '⚡ Держаться гордо', desc: 'Дерзость запомнят при дворе', act: 'threat' },
    ],
  },
];

// ── ПЛЕМЕНА КАК ГОРОДА-ГОСУДАРСТВА (Civ VI) ──
// Влияние копится посланниками (золото → посланник). На 1/3/6 посланниках открываются
// нарастающие бонусы по типу народа. Сюзерен — тот, у кого посланников больше (игрок
// или джунгары); сюзеренитет даёт верхний бонус и может перейти к сопернику.
export type TribeKind = 'military' | 'trade' | 'science' | 'farm' | 'craft';

export interface TribeTypeDef {
  kind: TribeKind;
  label: string;      // название типа для UI
  icon: string;
  levels: [string, string, string]; // описания бонусов на 1 / 3 / 6 посланников
}

export const TRIBE_TYPES: Record<TribeKind, TribeTypeDef> = {
  military: { kind: 'military', label: 'Военный', icon: '⚔️', levels: [
    '+10% HP вашим войскам',
    'Раз в 3 мин племя присылает воина в дар',
    'Дары чаще и сильнее (батыр/жасауыл)',
  ] },
  trade: { kind: 'trade', label: 'Торговый', icon: '🪙', levels: [
    'Пассивный доход +3🪙 каждые 8 с',
    'Обмен на базаре дешевле на 15%',
    'Караваны көпес приносят +50% выручки',
  ] },
  science: { kind: 'science', label: 'Научный', icon: '📜', levels: [
    'Исследования быстрее на 10%',
    'Исследования быстрее на 25%',
    'Постройки возводятся на 20% быстрее',
  ] },
  farm: { kind: 'farm', label: 'Аграрный', icon: '🌾', levels: [
    'Пашни дают +15% еды',
    'Стада в загонах растут быстрее',
    'Пашни дают +35% еды, дойка щедрее',
  ] },
  craft: { kind: 'craft', label: 'Ремесленный', icon: '🪵', levels: [
    'Постройки дешевле на 10% дерева',
    'Постройки дешевле на 20% дерева',
    'Шаруа добывают на 15% быстрее',
  ] },
};

// тип каждого народа-племени (см. plan.md, пункт 7)
export const TRIBE_KIND_BY_ID: Record<string, TribeKind> = {
  pecheneg: 'military',
  oghuz: 'military',
  khwarezm: 'trade',
  slav: 'craft',
  kokand: 'farm',
  bukhara: 'science',
  russia: 'trade',
};

// пороги влияния: сколько посланников нужно для уровня 1 / 2 / 3
export const ENVOY_TIERS = [1, 3, 6] as const;
// цена одного посланника в золоте (растёт с числом уже вложенных)
export const envoyCost = (have: number): number => 35 + have * 15;

// id кочевых/оседлых народов, лагеря которых встречаются на карте
export const TRIBE_IDS: string[] = NATIONS.filter(n => n.kind === 'tribe').map(n => n.id);

export const NATION_BY_ID: Record<string, NationDef> = Object.fromEntries(NATIONS.map(n => [n.id, n]));
