// ── Народы мира и их правители (дипломатия в духе Civilization) ──
// Изначально игрок ни с кем не знаком: народы «открываются» при контакте на карте.
// Портреты — AI-арт (gpt image). Реплики и варианты ответов — здесь.
import rivalRuler from '../assets/portraits/rival_ruler.png';
import pechenegKhan from '../assets/portraits/pecheneg_khan.png';
import oghuzYabgu from '../assets/portraits/oghuz_yabgu.png';
import khwarezmShah from '../assets/portraits/khwarezm_shah.png';

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

export const PLAYER_NATION = { id: 'kazakh', name: 'Казахский ханат', ruler: 'Хан', title: 'Ваш народ' };

export const NATIONS: NationDef[] = [
  {
    id: 'rival',
    name: 'Славянское княжество',
    ruler: 'Ратибор',
    title: 'Князь',
    portrait: rivalRuler,
    color: '#f87171',
    kind: 'rival',
    greet: 'Мои дозоры заметили ваших людей у рубежей моих земель. Я — Ратибор, князь этого народа. С чем пришли: с мечом или с добром?',
    choices: [
      { id: 'warm', label: '🕊 Мы рады миру', desc: 'Дружелюбное приветствие — неприязнь снижается', act: 'warm' },
      { id: 'giftBig', label: '🎁 Поднести дары (75🪙)', desc: 'Богатые дары заметно улучшают отношения', gold: 75, act: 'giftBig' },
      { id: 'cold', label: '⚔️ Нам не о чем говорить', desc: 'Дерзкий ответ — сосед запомнит обиду', act: 'cold' },
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
];

export const NATION_BY_ID: Record<string, NationDef> = Object.fromEntries(NATIONS.map(n => [n.id, n]));
