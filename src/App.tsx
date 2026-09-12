import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Axe, Swords, Crown, Home, Castle,
  Play, Pause, RotateCcw, Volume2, VolumeX, Trophy, Shield, Skull, Timer,
  ChevronUp, Map as MapIcon, Zap, Flag, Users, MousePointer2, Keyboard, Hand, X, Check, Sparkles, Crosshair,
  Settings as SettingsIcon, Gauge, ScrollText, Lock, Clock, Video, Landmark, Compass, Binoculars, MessageCircle, Eye, EyeOff,
} from 'lucide-react';
// 1.0.128 — движок уезжает в отдельный чанк: меню его не ждёт, грузим на старте
// партии (и подгребаем в простое заранее). Типы можно импортировать всегда —
// `import type` стирается при сборке и в рантайм не попадает.
import type { Game as GameEngine, GameStats, HudSnapshot } from './game/engine';
// Флаги сессии (есть ли сохранение) живут отдельно от движка — иначе меню
//ради трёх строчек localStorage тащило бы весь чанк движка.
import { wasInGame, setInGame, hasSave as gameHasSave } from './game/session';
import { PLAYER_NATION, NATION_BY_ID } from './game/nations';
import { CAMPAIGNS, clanBldCost, clanUnitCost } from './game/config';
import { CLANS, DEFAULT_CLAN, type ClanId } from './game/clans';
import { CITIES as AZAN_CITIES, CITY_BY_ID as AZAN_CITY_BY_ID, prayerTimes as azanTimes,
  PRAYER_NAMES as AZAN_NAMES, PRAYER_ORDER as AZAN_ORDER, fmtHM as azanFmt } from './game/prayer-times';
import { AGES, BIOMES, BUILDING_DEFS, DEFAULT_SETTINGS, DIFF, SPEED_OPTIONS, UNIT_DEFS, type BuildingKey, type Difficulty, type Settings, type UnitKey } from './game/config';
import heroKhanate from './assets/hero-khanate.jpg';
import menuPattern from './assets/pattern.svg';
import { Ico, RT } from './game/Ico';
import { plainRich } from './game/iconset';

type EngineModule = typeof import('./game/engine');
// Ссылка на подгруженный модуль движка. Нужна не только эффектам, но и рендеру
// (подсказки дока, выбор посвящения) — заполняется сразу после import().
let ENGINE: EngineModule | null = null;

type Screen = 'menu' | 'game';
interface ScoreEntry { name: string; score: number; result: string; difficulty: string; kills: number; time: number; date: string }

const LS_KEY = 'empires-dawn-highscores-v1';
const LS_SETTINGS = 'empires-dawn-settings-v1';
// версия игры живёт в game/version.ts (иначе ломается Fast Refresh)
import { GAME_VERSION } from './game/version';
// Таймеры HUD: при 30-минутных сутках благодать держится ~6 минут, и «360с»
// читается плохо — переводим в м:сс, секунды оставляем как есть.
const mmss = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec));
  return s < 60 ? `${s}с` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
function loadScores(): ScoreEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function loadSettings(): Settings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
// Условные часы мира: фаза суток 0..1, где 0 = полдень (стартуем днём),
// сутки DAY_LEN_SEC реальных секунд. Показываем «игровое» время суток.
function gameClock(phase: number): string {
  const total = Math.floor(((phase % 1) + 1) % 1 * 24 * 60);
  const h = Math.floor((12 * 60 + total) / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
// «через 1 ч 03 м» / «через 47 м» до следующего намаза
function fmtLeft(min: number): string {
  const m = Math.max(0, Math.round(min));
  return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, '0')} мин`;
}
function fmtTime(s: number) {
  const m = Math.floor(s / 60), ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}
function costStr(c: { wood: number; food: number; gold: number }) {
  const p: string[] = [];
  if (c.wood) p.push(`${c.wood}{i:wood}`);
  if (c.food) p.push(`${c.food}{i:food}`);
  if (c.gold) p.push(`${c.gold}{i:gold}`);
  return p.join(' ') || 'Бесплатно';
}
const clampPct = (v: number) => Math.max(0, Math.min(1, isFinite(v) ? v : 0));

const DIFFS: { id: Difficulty; name: string; desc: string; icon: string }[] = [
  { id: 'easy', name: 'Кочевник', desc: 'Спокойные набеги. Для обучения.', icon: 'sprout' },
  { id: 'normal', name: 'Батыр', desc: 'Классический напор степной войны. Баланс.', icon: 'swords' },
  { id: 'hard', name: 'Великий хан', desc: 'Беспощадные джунгарские набеги.', icon: 'fire' },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [dockTab, setDockTab] = useState<'units' | 'build' | 'squad' | 'info'>('units');
  const [showToy, setShowToy] = useState(false);   // той (п.20)
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [koshOpen, setKoshOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState<GameStats | null>(null);
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  // На телефоне список заданий свёрнут: панель 172px поверх экрана шириной
  // 360px закрывала бы треть карты. На десктопе оставляем раскрытой.
  const [showQuests, setShowQuests] = useState(
    typeof window === 'undefined' || !matchMedia('(pointer: coarse)').matches);
  const [showTech, setShowTech] = useState(false);
  const [showGreats, setShowGreats] = useState(false);
  const [showYasa, setShowYasa] = useState(false);
  const [showDip, setShowDip] = useState(false);
  const [gameId, setGameId] = useState(0);
  const [loadSave, setLoadSave] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameEngine | null>(null);
  const overRef = useRef<GameStats | null>(null);
  overRef.current = over;

  const difficulty = settings.difficulty;

  // горячие клавиши: L (рус. Д) — досье технологий, J (рус. О) — великие люди
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((k === 'l' || k === 'д') && !e.ctrlKey && !e.metaKey && !e.altKey) setShowTech(s => !s);
      // J (рус. О) — совет великих людей
      if ((k === 'j' || k === 'о') && !e.ctrlKey && !e.metaKey && !e.altKey) setShowGreats(s => !s);
      // O (рус. Щ) — Яса: карточки политик
      if ((k === 'o' || k === 'щ') && !e.ctrlKey && !e.metaKey && !e.altKey) setShowYasa(s => !s);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(LS_SETTINGS, JSON.stringify(next)); } catch { /* noop */ }
      // применить к идущей игре на лету
      gameRef.current?.applySettings(next);
      return next;
    });
  }, []);

  // Перезагрузили страницу прямо посреди боя — возвращаем в партию, не в меню.
  // Партия пишется в localStorage (cookies не годятся: сохранение ~100 КБ при
  // лимите куки 4 КБ), автосохранение идёт раз в 20 с и при уходе со страницы.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (!wasInGame()) return;
    setLoadSave(true);
    setScreen('game');
    setGameId(g => g + 1);
  }, []);

  // 1.0.128 — чанк движка (270 КБ) не нужен, чтобы показать меню: подгружаем его
  // уже ПОСЛЕ первого рендера, когда браузер свободен. Тогда клик «В поход»
  // срабатывает мгновенно. Спрайты (~10 МБ) тут не трогаем вообще — они едут
  // только со стартом партии (warmGameSprites в конструкторе Game, см. 1.0.127).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try { const m = await import('./game/engine'); if (!cancelled) ENGINE = m; }
      catch { /* не подгрузился в простое — догрузится на старте партии */ }
    };
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(load, { timeout: 3000 });
      return () => { cancelled = true; if (w.cancelIdleCallback) w.cancelIdleCallback(id); };
    }
    const t = window.setTimeout(load, 1200);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, []);

  const campRef = useRef<string | null>(null);
  const startGame = useCallback((d?: Difficulty, resume = false) => {
    if (d) setSettings(prev => { const next = { ...prev, difficulty: d }; try { localStorage.setItem(LS_SETTINGS, JSON.stringify(next)); } catch { /* noop */ } return next; });
    setLoadSave(resume);
    setOver(null); setSaved(false); setName(''); setHud(null); setPaused(false); setShowSettings(false); setShowTech(false); setShowGreats(false);
    setDockTab('units');
    setScreen('game');
    setGameId(g => g + 1);
    setInGame(true);           // метка: страница закрыта во время партии → вернём в бой
  }, []);

  // create / destroy engine
  useEffect(() => {
    if (screen !== 'game') return;
    // движок подгружен в простое; если нет (кликнули сразу) — грузим сейчас
    let cancelled = false;
    let created: GameEngine | null = null;
    void (async () => {
      const eng = ENGINE ?? await import('./game/engine');
      ENGINE = eng;
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const game = new eng.Game(canvas, {
        settings, loadSave,
        campaign: campRef.current ?? undefined,   // глава кампании (п.34)
        onHud: (h) => setHud(h),
        onGameOver: (s) => {
          if (s.campId && s.result === 'victory') {
            try { localStorage.setItem('khanate-camp-' + s.campId, '1'); } catch { /* noop */ }
          }
          setOver(s);
          setScores(loadScores());
        },
        onPauseRequest: () => {
          if (overRef.current) return;
          setPaused(p => {
            const np = !p;
            gameRef.current?.setPaused(np);
            return np;
      });
        },
        });
      created = game;
      gameRef.current = game;
      game.sound.ensure();
    })();
    return () => { cancelled = true; created?.destroy(); gameRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, gameId]);

  // keep engine pause in sync
  useEffect(() => { gameRef.current?.setPaused(paused); }, [paused]);

  const saveScore = () => {
    if (!over || saved) return;
    const entry: ScoreEntry = {
      name: name.trim() || 'Безымянный', score: over.score, result: over.result,
      difficulty: over.difficulty, kills: over.kills, time: over.timeSec, date: new Date().toLocaleDateString(),
    };
    const next = [...loadScores(), entry].sort((a, b) => b.score - a.score).slice(0, 8);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    setScores(next); setSaved(true);
  };

  const g = () => gameRef.current;
  const canAfford = (c: { wood: number; food: number; gold: number }) =>
    hud ? hud.wood >= c.wood && hud.food >= c.food && hud.gold >= c.gold : false;
  // союзная скидка на дерево (ремесленные народы): цены в доке показываем уже с ней
  const wdisc = hud?.woodDiscount ?? 1;
  // род-таңба (п.12): пассивки рода и скидки цен
  const clan = settings.clan ?? DEFAULT_CLAN;
  const ucost = (k: UnitKey) => clanUnitCost(clan, k);

  const isMobile = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  // 1.0.137: на телефоне док свёрнут по умолчанию — поле боя важнее кнопок.
  // На десктопе он всегда раскрыт, как и раньше.
  const [dockOpen, setDockOpen] = useState(!isMobile);
  // «Чистый экран»: один тап прячет весь HUD, остаётся только поле боя.
  const [uiHidden, setUiHidden] = useState(false);
  const dockPick = (t: 'units' | 'build' | 'squad' | 'info') => {
    if (dockTab === t && isMobile) setDockOpen(o => !o);      // повторный тап по вкладке — свернуть
    else { setDockTab(t); setDockOpen(true); }
  };
  // движок прячет мини-карту вместе с остальным HUD
  useEffect(() => { const gm = g(); if (gm) gm.uiHidden = uiHidden; }, [uiHidden]);
  // раскрытая карта и раскрытый док одновременно не нужны — карта важнее
  useEffect(() => { if (hud?.minimapOpen) setDockOpen(false); }, [hud?.minimapOpen]);

  if (screen === 'menu') return (
    <MenuScreen
      scores={scores} settings={settings} updateSettings={updateSettings}
      onPlay={() => startGame()}
      onResume={() => startGame(undefined, true)}
      onPlayCampaign={(id) => { campRef.current = id; startGame(); }}
    />
  );


  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0c1410] text-white">
      <canvas ref={canvasRef} className="game-canvas absolute inset-0"
        onPointerDown={() => { if (isMobile) setDockOpen(false); }} />

      {/* ===== TOP HUD ===== */}
      {!uiHidden && (
      <div className="safe-top pointer-events-none absolute inset-x-0 top-0 z-20">
        <div className="flex items-start justify-between gap-2 p-2 sm:p-3">
          {/* resources */}
          <div className="kz-border-bottom panel-iron pointer-events-auto flex items-center gap-1 rounded-xl px-2 py-1.5 sm:gap-2 sm:px-3">
            <Res icon={<Ico name="wood" className="h-4 w-4 text-lime-300" />} val={hud?.wood ?? 0} />
            <Res icon={<Ico name="food" className="h-4 w-4 text-rose-300" />} val={hud?.food ?? 0} />
            <Res icon={<Ico name="gold" className="h-4 w-4 text-yellow-300" />} val={hud?.gold ?? 0} />
            <div className="ml-1 hidden items-center gap-1 rounded-lg bg-black/30 px-2 py-1 text-xs font-bold sm:flex">
              <Users className="h-3.5 w-3.5 text-sky-300" />
              <span className={(hud && hud.pop >= hud.popCap) ? 'text-red-400' : 'text-white'}>{hud?.pop ?? 0}/{hud?.popCap ?? 10}</span>
            </div>
            {/* род-таңба (п.12): знак рода, по наведению — его пассивка */}
            <div className="ml-1 flex items-center gap-1 rounded-lg bg-black/30 px-2 py-1" title={`Род ${hud?.clan?.name ?? ''}: ${hud?.clan?.perk ?? ''}`}>
              <Ico name={hud?.clan?.tamga || CLANS[0].tamga} className="h-4 w-4 text-amber-300" />
              <span className="hidden text-[11px] font-black text-amber-200 sm:inline">{hud?.clan?.name ?? CLANS[0].name}</span>
            </div>
            <div className="ml-1 flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs font-bold sm:hidden">
              <Users className="h-3.5 w-3.5 text-sky-300" />{hud?.pop ?? 0}/{hud?.popCap ?? 10}
            </div>
            {hud?.camp && (
              <div className="pointer-events-auto ml-2 hidden rounded-xl border border-amber-400/30 bg-black/55 px-2.5 py-1 text-[10px] font-bold leading-snug text-slate-200 backdrop-blur-sm md:block"
                title={`Главы истории (п.34): ${hud.camp.part} — ${hud.camp.title}. Выполните все задачи главы для победы.`}>
                <div className="text-[9px] font-black tracking-wide text-amber-300">{hud.camp.part} · {hud.camp.title}</div>
                {hud.camp.objs.map((o, i) => (
                  <div key={i} className={o.done ? 'text-lime-300 line-through' : 'text-slate-300'}>{o.done ? '✓' : '·'} {o.t}</div>
                ))}
              </div>
            )}
          </div>

          {/* score / wave center (компактно; дипломатия — отдельная кнопка) */}
          {/* 1.0.135: на телефоне это была вертикальная колонка — каждая «пилюля» на
              своей строке, и сверху съедалось ~30% экрана. На узком экране кладём
              их в переносимые строки (3-4 ряда вместо 12), на широком оставляем
              колонкой как было. */}
          <div className="flex flex-wrap items-center justify-center gap-1 sm:flex-col">
            <div className="panel-iron pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-1.5 text-xs font-bold">
              <span className="flex items-center gap-1 text-amber-300"><Trophy className="h-3.5 w-3.5" />{hud?.score ?? 0}</span>
              <span className="flex items-center gap-1 text-slate-300" title={`Реальное время партии: ${fmtTime(hud?.timeSec ?? 0)}`}><Clock className="h-3.5 w-3.5" />{gameClock(hud?.day?.phase ?? 0)}</span>
              {hud?.era && hud.era.state !== 'normal' && (
                <span className={`flex items-center gap-1 ${hud.era.state === 'golden' ? 'text-amber-300' : 'text-slate-400'}`}
                      title={hud.era.state === 'golden'
                        ? `${hud.era.heroic ? 'Героический' : 'Золотой'} век${hud.era.dedName ? ` · ${hud.era.dedName}: ${hud.era.dedDesc}` : ''}`
                        : 'Тёмный век: добыча −10%, войска и көш медленнее. Свершения куют героический век'}>
                  <Ico name={hud.era.state === 'golden' ? (hud.era.dedIcon || (hud.era.heroic ? 'crown' : 'sun')) : 'moon'} className="h-3.5 w-3.5" />
                  {hud.era.state === 'golden'
                    ? `${hud.era.heroic ? 'Героический' : 'Золотой'} век${hud.era.dedName ? ` · ${hud.era.dedName}` : ''}`
                    : 'Тёмный век'}
                </span>
              )}
              {/* Счётчик волны — только во время войны. В мире набеги не идут
                  (движок крутит waveT лишь при atWar), и отсчёт до несуществующей
                  атаки только пугал игрока зря. */}
              {hud?.atWar && (
                <span className={`hidden items-center gap-1 sm:flex ${(hud?.nextWave ?? 99) <= 10 ? 'animate-pulse text-red-400' : 'text-orange-300'}`}>
                  <Swords className="h-3.5 w-3.5" />Волна {hud?.wave ?? 0} → {hud?.nextWave ?? 0}с
                </span>
              )}
            </div>
            {/* кнопка дипломатии: компактная, с индикатором войны/новых контактов */}
            <button
              onClick={() => setShowDip(true)}
              className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-amber-300/30 bg-black/55 px-3 py-1 text-[11px] font-black text-amber-100 shadow hover:border-amber-300/70 hover:bg-black/70"
              title="Дипломатия: народы и правители, которых вы встретили"
            >
              <Landmark className="h-4 w-4 text-amber-300" />
              Дипломатия
              {hud?.atWar
                ? <span className="rounded-full bg-red-600/80 px-1.5 py-0.5 text-[9px] font-black text-white"><Ico name="swords" /> ВОЙНА</span>
                : <span className="rounded-full bg-emerald-600/60 px-1.5 py-0.5 text-[9px] font-black text-emerald-50"><Ico name="dove" /> МИР</span>}
              {!!(hud?.nations?.some(n => n.met && n.kind === 'tribe')) && (
                <span className="rounded-full bg-sky-500/30 px-1.5 py-0.5 text-[9px] font-bold text-sky-100">
                  знакомо: {hud.nations.filter(n => n.met).length}
                </span>
              )}
            </button>
            {hud?.day && (
              <div
                className={`pointer-events-auto flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-black ${hud.day.night ? 'bg-indigo-500/25 text-indigo-100' : 'bg-amber-400/20 text-amber-100'}`}
                title={`${hud.day.name} · День ${hud.day.num}\nСутки 30 минут: 18 мин день, по 4 мин закат и рассвет, 4 мин ночь\nНочью шаруа устают быстрее и уходят отдыхать раньше\nОтдыхает: ${hud.day.resting} · Бодрых: ${hud.day.fresh} · Устали: ${hud.day.tired}\nШаруа сменяют друг друга у юрт и возвращаются отдохнувшими (+35% к добыче)`}
              >
                <Ico name={hud.day.icon} className="h-3.5 w-3.5" /> День {hud.day.num}
                {/* при получасовых сутках время дня важнее номера дня: показываем фазу */}
                <span className="opacity-80">{hud.day.name.replace(/ \(.*\)/, '')}</span>
                {hud.day.resting > 0 && <span className="rounded-full bg-emerald-500/40 px-1 text-[9px] text-emerald-50"><Ico name="sleep" /> {hud.day.resting}</span>}
                {hud.day.fresh > 0 && <span className="rounded-full bg-lime-400/30 px-1 text-[9px] text-lime-100"><Ico name="sparkle" /> {hud.day.fresh}</span>}
                {hud.day.tired > 0 && <span className="rounded-full bg-orange-500/30 px-1 text-[9px] text-orange-100"><Ico name="sleep" /> {hud.day.tired}</span>}
              </div>
            )}
            {hud?.pray?.active && (
              <div className="pointer-events-auto flex animate-pulse items-center gap-1.5 rounded-full bg-teal-500/25 px-2 py-0.5 text-[11px] font-black text-teal-100"
                title={`Азан с минарета: жители идут на намаз (${hud.pray.praying} чел.)\nВоины не отвлекаются от обороны`}>
                <Ico name="mosque" /> Намаз: {mmss(hud.pray.t)}
                {hud.pray.praying > 0 && <span className="rounded-full bg-teal-400/40 px-1 text-[9px]"><Ico name="hands" /> {hud.pray.praying}</span>}
              </div>
            )}
            {!hud?.pray?.active && (hud?.pray?.bereke ?? 0) > 0 && (
              <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-black text-emerald-100"
                title={`Береке — благодать общины после намаза: +${hud!.pray.berekePct}% к добыче и мораль войска`}>
                <Ico name="hands" /> Береке: {mmss(hud!.pray.bereke)} <span className="opacity-80">+{hud!.pray.berekePct}%</span>
              </div>
            )}
            {hud?.alertHud && (
              <button
                onClick={() => gameRef.current?.jumpToAlert()}
                className="pointer-events-auto flex animate-pulse items-center gap-1.5 rounded-full border border-red-400/60 bg-red-600/30 px-2 py-0.5 text-[11px] font-black text-red-100 hover:bg-red-600/50"
                title={plainRich(`${hud.alertHud.sub} — щёлкните, чтобы перенести камеру к месту боя`)}
              >
                <Ico name="warn" /> НАС АТАКУЮТ! <span className="font-bold opacity-80">к месту →</span>
              </button>
            )}
            {(hud?.drought ?? 0) > 0 && (
              <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-orange-500/20 px-2 py-0.5 text-[11px] font-black text-orange-200" title="Засуха: пашни дают меньше еды">
                <Ico name="cactus" /> Засуха: {hud!.drought}с
              </div>
            )}
            {hud?.weather && (
              <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-sky-500/20 px-2 py-0.5 text-[11px] font-black text-sky-100" title={`${hud.weather.name}: ${hud.weather.desc}`}>
                {hud.weather.icon} {hud.weather.name.replace(/^.*— /, '')}: {hud.weather.t}с
              </div>
            )}
            {(hud?.plague ?? 0) > 0 && (
              <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-lime-500/20 px-2 py-0.5 text-[11px] font-black text-lime-200" title="Поветрие: шаруа добывают медленнее">
                <Ico name="sick" /> Поветрие: {hud!.plague}с
              </div>
            )}
            {(hud?.wonderT ?? 0) > 0 && (
              <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-black text-amber-200" title="Защитите Мавзолей хана до конца отсчёта — это победа">
                <Ico name="star" /> Мавзолей: {Math.floor((hud?.wonderT ?? 0) / 60)}:{String((hud?.wonderT ?? 0) % 60).padStart(2, '0')}
              </div>
            )}
            {hud?.mode === 'settled' && (
              <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-black text-amber-100"
                title={`Территориальная победа: 60% земли долины (${hud.terrLand} гексов) под ЛОЯЛЬНОЙ границей${hud.rebelCount ? `\nМятежных гексов: ${hud.rebelCount} — рядом давят джунгары; поставьте башню, мечеть или отряд` : ''}`}>
                <Ico name="flag" /> {hud.cityName} · {hud.terrCount}/{hud.terrLand}
                {hud.rebelCount > 0 && <span className="rounded-full bg-slate-400/40 px-1 text-[9px] text-slate-100" title="Спорные гексы"><Ico name="warn" /> {hud.rebelCount}</span>}
              </div>
            )}
            {hud?.mode === 'nomad' && (
              <button onClick={() => setKoshOpen(true)}
                className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-teal-500/15 px-2 py-0.5 text-[11px] font-black text-teal-100"
                title="Качество пастбища стоянки; нажмите для көша на новый жайляу">
                <Ico name="camel" /> Жайляу {hud.pasture}%{hud.migrating > 0 ? ` · көш ${hud.migrating}с` : ''}
              </button>
            )}
            {/* ближнее время намаза: видно всегда; при включённой механике — ярче */}
            {hud?.realAzan && (
              <div
                className={`pointer-events-auto flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-black ${
                  hud.realAzan.on ? 'bg-emerald-500/20 text-emerald-100' : 'bg-teal-500/10 text-teal-200/80'}`}
                title={`${hud.realAzan.city}: ${hud.realAzan.times.map(t => t.name.replace(' намазы','') + ' ' + t.at).join(' • ')}${
                  hud.realAzan.on ? '' : '\nМеханика «азан по реальному времени» выключена — время справочно (включается в настройках)'}`}
              >
                <Ico name="mosque" /> {hud.realAzan.next.replace(' намазы', '')} {hud.realAzan.nextAt} <span className="opacity-80">({fmtLeft(hud.realAzan.inMin)})</span>
                {!hud.realAzan.on && <span className="opacity-60">· справочно</span>}
              </div>
            )}
            {(hud?.wisdomRate ?? 0) > 0 && (
              <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-teal-500/20 px-2 py-0.5 text-[11px] font-black text-teal-100"
                title="Мудрость: копится от Мешіт-медресе, Мавзолея и реликвий. Призыв великих людей — клавиша J">
                <Ico name="sparkle" /> {hud!.wisdom}
              </div>
            )}
            {/* Религиозная победа (п.31): видна, как только есть мечеть */}
            {(hud?.islam?.anyMosque ?? false) && (
              <div className={`pointer-events-auto flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-black ${(hud!.islam.have) >= hud!.islam.need ? 'animate-pulse bg-teal-400/30 text-teal-100' : 'bg-sky-500/15 text-sky-200'}`}
                title="Религиозная победа: обратите все 7 народов (мечеть + имамы-миссионеры у лагерей)">
                <Ico name="crescent" /> Ислам: {hud!.islam.have}/{hud!.islam.need}
              </div>
            )}
            {/* Құрылтай (п.13): авторитет хана + закон сезона */}
            {hud && hud.authority > 0 && (
              <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-black text-amber-200"
                title={`Авторитет хана (п.13) — копится со временем и решениями курултаев, при победе уходит в очки (×3)\nЗакон сезона: ${hud.lawName ?? 'нет'}\nНедовольство аула: ${hud.discontent}${hud.discontent >= 70 ? ' (добыча −10%)' : ''}`}>
                <Ico name="crown" className="h-3.5 w-3.5" />{hud.authority}
                {hud.lawName && <span className="max-w-[110px] truncate rounded-full bg-black/40 px-1.5 text-[9px] font-bold text-amber-100/90">{hud.lawName}</span>}
                {hud.discontent >= 70 && <span title="Аул озлоблен" className="text-red-300"><Ico name="warn" className="h-3 w-3" /></span>}
              </div>
            )}
            {/* Двор ханства (п.18) */}
            {hud?.court && hud.court.length > 0 && (
              <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[11px] font-black text-purple-200"
                title={`Двор ханства (п.18):\n${hud.court.map(p => `• ${p.name} — ${p.traits[0] ?? ''}`).join('\n')}\nАманат скрепляет союз, но убьёте племя — предательство запомнят все. Супруга даёт черту, наследник вырастет батыром или бием.`}>
                <Ico name="crown" className="h-3.5 w-3.5" />Двор: {hud.court.length}
              </div>
            )}
            {/* Қыс (п.15): индикатор сезона */}
            {hud?.season && (
              <div className={`pointer-events-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black ${hud.season.winter ? 'bg-sky-400/20 text-sky-100' : 'bg-white/10 text-slate-200'}`}
                title={`Сезон (п.15): ${hud.season.name}. Год = 4 игровых суток.\nДо смены сезона: ~${Math.ceil(hud.season.t / 60)} мин\nЗимой: добыча −15% (с войлочными юртами −8%), стадо ест запасы, скорость −6%, бураны чаще, но каждый убийства в набеге дают ×1,5 славы\n${hud.season.feltYurts ? '✓ Войлочные юрты готовят аул к стуже' : 'Юрты без войлока — зима холодная (крафт у загона)'}`}>
                <Ico name={hud.season.winter ? 'snow' : hud.season.name.includes('осень') ? 'wood' : 'sun'} className="h-3.5 w-3.5" />
                {hud.season.name.split(' — ')[0]}
              </div>
            )}
            {/* Төл (п.14): шерсть */}
            {hud?.tel?.hasPen && (
              <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-lime-500/15 px-2 py-0.5 text-[11px] font-black text-lime-200"
                title={`Шерсть (п.14) — овцы в загонах дают шерсть; войлок крафтится у загона: изоляция юрт к зиме и доспехи коннице${hud.tel.feltYurts ? '\n✓ Юрты в войлоке' : ''}${hud.tel.feltArmor ? '\n✓ Войлочные доспехи' : ''}`}>
                <Ico name="sheep" className="h-3.5 w-3.5" />{hud.tel.wool}
              </div>
            )}
            {/* Объединение степи: показываем, когда союз уже собирается */}
            {(hud?.unite?.have ?? 0) >= 3 && (
              <div className={`pointer-events-auto flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-black ${
                (hud!.unite.t) > 0 ? 'animate-pulse bg-teal-500/25 text-teal-100' : 'bg-white/10 text-slate-200'}`}
                title={`Станьте сюзереном ${hud!.unite.need} народов и удержите союз — дипломатическая победа`}>
                <Ico name="handshake" /> Степь: {hud!.unite.have}/{hud!.unite.need}
                {hud!.unite.t > 0 && <> • {Math.floor((hud!.unite.hold - hud!.unite.t) / 60)}:{String((hud!.unite.hold - hud!.unite.t) % 60).padStart(2, '0')}</>}
              </div>
            )}
          </div>

          {/* buttons */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            <div className="panel-iron hidden items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-amber-200 sm:flex">
              <Crown className="h-4 w-4" />{hud?.ageName ?? 'Заря степи'}
            </div>
            <IconBtn onClick={() => g()?.jumpToIdleVillager()} label="Свободные шаруа (.)">
              <span className="relative text-sm leading-none"><Ico name="farmer" className="h-4 w-4" />{(hud?.idleVills ?? 0) > 0 && <span className="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-400 px-0.5 text-[8px] font-black text-black">{hud?.idleVills}</span>}</span>
            </IconBtn>
            <IconBtn onClick={() => g()?.ringBell()} label="Колокол ставки (U): звон — укрыть шаруа, повторно — отбой">
              <span className="relative text-sm leading-none"><Ico name="bell" className={`h-4 w-4 ${hud?.bell ? 'text-amber-300' : ''}`} />{(hud?.bellHidden ?? 0) > 0 && <span className="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sky-400 px-0.5 text-[8px] font-black text-black">{hud?.bellHidden}</span>}</span>
            </IconBtn>
            <IconBtn onClick={() => g()?.toggleMute()} label="Звук">
              {(hud?.muted) ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </IconBtn>
            <IconBtn onClick={() => setShowTech(true)} label="Дерево технологий (L)">
              <ScrollText className="h-4 w-4" />
            </IconBtn>
            <IconBtn onClick={() => setShowGreats(true)} label="Великие люди степи (J)">
              <span className="relative text-sm leading-none"><Ico name="sparkle" className="h-4 w-4" />{(hud?.greats?.some(x => x.afford) ?? false) &&
                <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-amber-400" />}</span>
            </IconBtn>
            <IconBtn onClick={() => setShowYasa(true)} label="Яса — политики ханства (O)">
              <span className="relative text-sm leading-none"><Ico name="scroll" className="h-4 w-4" />{(hud?.yasa?.filter(y => y.active).length ?? 0) > 0 &&
                <span className="absolute -right-1.5 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-amber-400 text-[8px] font-black text-black">{hud?.yasa.filter(y => y.active).length}</span>}</span>
            </IconBtn>
            <IconBtn onClick={() => setShowSettings(true)} label="Настройки">
              <SettingsIcon className="h-4 w-4" />
            </IconBtn>
            <IconBtn onClick={() => setPaused(true)} label="Пауза">
              <Pause className="h-4 w-4" />
            </IconBtn>
          </div>
        </div>

        {/* mobile score strip */}
        <div className="flex justify-center md:hidden">
          <div className="panel-iron pointer-events-auto flex items-center gap-3 rounded-full px-3 py-1 text-[11px] font-bold">
            <span className="text-amber-300"><Ico name="trophy" />{hud?.score ?? 0}</span>
            <span className="text-slate-300" title={`Реальное время партии: ${fmtTime(hud?.timeSec ?? 0)}`}>{gameClock(hud?.day?.phase ?? 0)}</span>
            {hud?.atWar && (
              <span className={(hud?.nextWave ?? 99) <= 10 ? 'animate-pulse text-red-400' : 'text-orange-300'}><Ico name="sea" />{hud?.nextWave ?? 0}с</span>
            )}
            <Ico name={AGES[hud?.age ?? 0].icon} className="h-4 w-4 text-amber-200" />
          </div>
        </div>

        {/* banner */}
        {hud?.banner && (
          <div className="mt-2 flex justify-center px-4">
            <div className="anim-banner panel-iron rounded-2xl border-amber-300/40 px-5 py-2 text-center" style={{ animation: 'marquee-glow 2s ease-in-out infinite' }}>
              <div className="font-display text-base font-black tracking-wide text-amber-200 sm:text-xl"><RT t={hud.banner.title} /></div>
              <div className="text-[11px] font-semibold text-slate-300 sm:text-xs"><RT t={hud.banner.sub} /></div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ===== QUESTS + ОТРЯД (слева, только на широком экране) =====
           На телефоне эта колонка шириной 172px съедала 42% экрана, поэтому
           в 1.0.137 её содержимое переехало в док (вкладки «Отряд» и «Сводка»). */}
      {!uiHidden && (
      <div className="absolute left-2 top-[74px] z-20 hidden w-[172px] flex-col gap-2 sm:top-[86px] sm:flex sm:w-[196px]">
        <QuestsPanel hud={hud} open={showQuests} onToggle={() => setShowQuests(s => !s)} />
        <div className="flex flex-col gap-1">
          <SquadControls hud={hud} g={g} />
          <EconSummary hud={hud} g={g} />
        </div>
      </div>
      )}

      {/* ===== SELECTION CARD (above dock, grows upward) ===== */}
      {hud && hud.sel.kind !== 'none' && !uiHidden && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[236px] z-30 flex justify-center px-2 sm:bottom-[156px]">
          <div className="panel-iron scroll-thin pointer-events-auto flex max-h-[40dvh] w-[min(94vw,560px)] items-start gap-3 overflow-y-auto overscroll-contain rounded-2xl px-3 py-2">
            {hud.sel.kind === 'units' ? (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-xl">
                  {hud.sel.types?.length === 1 ? <Ico name={unitIcon(hud.sel.types[0].key)} className="h-6 w-6" /> : <Users className="h-5 w-5 text-sky-300" />}
                </div>
                <div>
                  <div className="text-xs font-black text-white">
                    Выбрано: {hud.sel.count} • {hud.sel.types?.map(t => `${t.count} ${t.label}`).join(' · ')}
                  </div>
                  <HpMini hp={hud.sel.avgHp ?? 1} max={hud.sel.maxHp ?? 1} />
                  {(hud.sel.maxLevel ?? 1) >= 2 && (
                    <div className="mt-0.5 text-[10px] font-bold text-amber-300">
                      <Ico name="star" /> Ветеран: ранг {hud.sel.maxLevel} · убийств {hud.sel.totalKills}
                    </div>
                  )}
                  {(hud.sel.types?.some(t => t.counter) ?? false) && (
                    <div className="mt-0.5 text-[10px] font-semibold text-amber-200/85">
                      <Ico name="swords" className="mr-1 inline h-3 w-3" />Контра: {[...new Set(hud.sel.types!.map(t => t.counter).filter(Boolean))].join(' · ')}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    <MiniBtn onClick={() => { const gm = g(); if (gm) { gm.attackArmed = true; gm.pushHud(); } }}><Flag className="h-3 w-3" />Атака-мув (G)</MiniBtn>
                    <MiniBtn onClick={() => g()?.clearSel() ?? g()?.pushHud()}><Ico name="cross" /> Снять выбор</MiniBtn>
                  </div>
                  {/* приказы разведчика */}
                  {/* приказ рабочему: пасти скот у загона */}
                  {hud.sel.types?.some(t => t.key === 'villager') && (
                    <div className="mt-1.5 rounded-xl border border-lime-400/25 bg-lime-500/10 p-1.5">
                      <div className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-lime-200"><Ico name="sheep" /> Пастух</div>
                      <div className="flex flex-wrap gap-1">
                        <MiniBtn title="Рабочий верхом на коне пасёт скот и загоняет его в ближайший Загон (построй: Загон, клавиша H)" onClick={() => g()?.herdOrder()}>
                          <Ico name="horse" /> Пасти скот
                        </MiniBtn>
                      </div>
                    </div>
                  )}
                  {hud.sel.types?.some(t => t.key === 'scout') && (
                    <div className="mt-1.5 rounded-xl border border-sky-400/25 bg-sky-500/10 p-1.5">
                      <div className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-sky-200"><Compass className="h-3.5 w-3.5" />Приказы разведчика</div>
                      <div className="flex flex-wrap gap-1">
                        <MiniBtn title="Идти в туман и открывать карту" onClick={() => g()?.scoutOrder('explore')}><Compass className="h-3 w-3" />Исследовать</MiniBtn>
                        <MiniBtn title="Найти лагеря племён на карте" onClick={() => g()?.scoutOrder('bases')}><Binoculars className="h-3 w-3" />Искать базы</MiniBtn>
                        <MiniBtn title="Дойти до незнакомого народа и наладить связь (приветствие правителя)" onClick={() => g()?.scoutOrder('diplomacy')}><MessageCircle className="h-3 w-3" />Связь</MiniBtn>
                        <MiniBtn title="Прокрасться кротом к вражеской базе: раскрыть её и доносить золото" onClick={() => g()?.scoutOrder('infiltrate')}><Eye className="h-3 w-3" />Внедриться</MiniBtn>
                        <MiniBtn title="Дозор (п.17): вечный светлый круг в тумане. До 4 точек; у ставки джунгар показывает состав и отсчёт рейда" onClick={() => g()?.placeWatch()}><Binoculars className="h-3 w-3" />Дозор</MiniBtn>
                      </div>
                    </div>
                  )}
                  {hud.sel.types?.some(t => t.key === 'scout') && hud.scoutNet && (
                    <div className="mt-1.5 rounded-xl border border-rose-400/25 bg-rose-500/10 p-1.5">
                      <div className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-rose-200"><Ico name="wolf" /> Саботаж (п.17)</div>
                      {hud.scoutNet.raidSeen && (
                        <div className="mb-1 rounded-lg bg-black/40 px-2 py-1 text-[10px] font-bold text-sky-200" title="Дозор у ставки джунгар доносит состав и отсчёт рейда">
                          Дозор доносит: врагов у ставки {hud.scoutNet.army} · рейд через ~{hud.scoutNet.raidIn} с
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        <MiniBtn title="Сжечь запас: рейд джунгар задержан на 2 минуты" onClick={() => g()?.sabotage('supplies')}><Ico name="spark" />Запасы</MiniBtn>
                        <MiniBtn title="Угнать табун: −1 конница врага, +лошади нам" onClick={() => g()?.sabotage('horses')}><Ico name="horse" />Табун</MiniBtn>
                        <MiniBtn title="Перехватить посланника: племя 3 минуты недоступно джунгарам и набегам" onClick={() => g()?.sabotage('envoy')}><Ico name="handshake" />Посланник</MiniBtn>
                        {hud.scoutNet.cd > 0 && <span className="self-center rounded bg-black/40 px-1.5 text-[10px] font-black text-rose-200">перезарядка {hud.scoutNet.cd}с</span>}
                      </div>
                      <div className="mt-1 text-[9px] font-bold text-slate-400">Дозоров: {hud.scoutNet.posts}/4 · враг может вскрыть сеть (−100 очков)</div>
                    </div>
                  )}
                  {!(hud.sel.types?.every(t => t.key === 'villager') || false) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="text-[9px] font-black uppercase tracking-wide text-sky-300/80">Стойка:</span>
                      <MiniBtn active={(hud.sel.stance ?? 'aggressive') === 'aggressive'} title="Преследовать врага далеко от позиции" onClick={() => g()?.setStance('aggressive')}><Ico name="swords" /> Атак.</MiniBtn>
                      <MiniBtn active={(hud.sel.stance ?? '') === 'defensive'} title="Дать отпор рядом, не убегая далеко" onClick={() => g()?.setStance('defensive')}><Ico name="shield" /> Оборон.</MiniBtn>
                      <MiniBtn active={(hud.sel.stance ?? '') === 'stand'} title="Держать точку — не сходить с места" onClick={() => g()?.setStance('stand')}><Ico name="flag" /> Стоять</MiniBtn>
                      <MiniBtn active={hud.patrolArmed} title="Кликните по конечной точке маршрута — войска будут ходить между позициями (клавиша Y)" onClick={() => { const gm = g(); if (gm) { gm.patrolArmed = !gm.patrolArmed; gm.attackArmed = false; gm.pushHud(); } }}><Ico name="eye" /> Патруль (Y)</MiniBtn>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-200"><Ico name={bldIcon(hud.sel.bkey!)} className="h-6 w-6" /></div>
                <div className="max-w-[260px]">
                  <div className="text-xs font-black text-white">{hud.sel.blabel} {(hud.sel.done ?? 1) < 1 && <span className="text-lime-300">• стройка {Math.round((hud.sel.done ?? 0) * 100)}%</span>}</div>
                  <HpMini hp={hud.sel.hp ?? 1} max={hud.sel.bmax ?? 1} />
                  {hud.sel.research && (
                    <div className="mt-0.5 text-[10px] font-bold text-sky-300"><Ico name="scroll" /> {hud.sel.research.name} {Math.round((hud.sel.research.t / hud.sel.research.total) * 100)}%</div>
                  )}
                  {(hud.sel.queue?.length ?? 0) > 0 && (
                    <div className="mt-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-black uppercase tracking-wide text-amber-300/80">Очередь:</span>
                        {hud.sel.queue!.map((q, i) => {
                          const prog = i === 0 ? clampPct(q.t / q.total) : 0;
                          return (
                            <div key={i} className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-amber-400/40 bg-black/40 text-base leading-none" title={`${q.label}${i === 0 ? ` — ${Math.round(prog * 100)}%` : ''}`}>
                              <span className={i === 0 ? 'text-amber-200' : 'opacity-70 grayscale text-amber-200'}><Ico name={unitIcon(q.key)} className="h-4 w-4" /></span>
                              {i === 0 && (
                                <span className="absolute -bottom-0.5 left-0.5 right-0.5 h-1 overflow-hidden rounded-full bg-black/60">
                                  <span className="block h-full bg-amber-400" style={{ width: `${prog * 100}%` }} />
                                </span>
                              )}
                              {i > 0 && <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[8px] font-black text-black">{i + 1}</span>}
                            </div>
                          );
                        })}
                        <button onClick={() => g()?.cancelTrain(hud.sel.bid!)} title="Отменить последнего (возврат ресурсов)" className="ml-1 rounded bg-red-500/30 px-1.5 py-0.5 text-[10px] font-bold text-red-200 hover:bg-red-500/50"><Ico name="cross" /></button>
                      </div>
                      <div className="mt-0.5 text-[10px] font-bold text-amber-200">Обучение: {hud.sel.queue![0].label} · {Math.round(clampPct(hud.sel.queue![0].t / hud.sel.queue![0].total) * 100)}%</div>
                    </div>
                  )}
                  {/* технологии */}
                  {(hud.sel.techs?.length ?? 0) > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {hud.sel.techs!.map(t => (
                        <button
                          key={t.id}
                          title={plainRich(`${t.name}\n${t.desc}\n${t.cost}`)}
                          disabled={t.done || t.busy}
                          onClick={() => g()?.research(t.id)}
                          className={`flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[10px] font-bold transition ${t.done ? 'border-lime-400/40 bg-lime-500/15 text-lime-300' : t.available && !t.busy ? 'border-sky-400/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/30' : 'border-white/10 bg-black/30 text-slate-400'}`}
                        >
                          <Ico name={t.done ? 'check' : t.icon} className="h-3.5 w-3.5 shrink-0" />{t.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* линии апгрейда рода войск (казармы/конюшня) */}
                  {(hud.sel.upgrades?.length ?? 0) > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {hud.sel.upgrades!.map(u => (
                        <button
                          key={u.id}
                          title={plainRich(`${u.name}\n${u.desc}\n${u.cost}${u.locked ? '\n(нужна предыдущая ступень или эпоха)' : ''}`)}
                          disabled={u.done || !u.available}
                          onClick={() => g()?.research(u.id)}
                          className={`flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[10px] font-black transition ${u.done ? 'border-amber-400/50 bg-amber-500/20 text-amber-200' : u.available ? 'border-violet-400/50 bg-violet-500/20 text-violet-100 hover:bg-violet-500/40' : 'border-white/10 bg-black/30 text-slate-500'}`}
                        >
                          <Ico name={u.done ? 'star' : u.locked ? 'lock' : u.icon} className="h-3.5 w-3.5 shrink-0" />{u.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {hud.sel.bkey === 'market' && (
                    <div className="mt-1 flex gap-1">
                      <MiniBtn onClick={() => g()?.trade('wood')} title="Обмен дерева на золото"><Ico name="wood" />→<Ico name="gold" /> Торговля</MiniBtn>
                      <MiniBtn onClick={() => g()?.trade('food')} title="Обмен еды на золото"><Ico name="food" />→<Ico name="gold" /></MiniBtn>
                    </div>
                  )}
                  {hud.sel.bkey === 'market' && hud.sel.kerven && (
                    <div className="mt-1.5 rounded-lg border border-amber-300/25 bg-amber-400/10 p-1.5">
                      <div className="mb-1 text-[9px] font-black uppercase tracking-widest text-amber-300/90">Керуен (п.16): товар → маршрут · цены дышат каждый день</div>
                      <div className="grid grid-cols-3 gap-1">
                        {([
                          ['wool', 'Шерсть', '6{i:sheep} шерсти', hud.sel.kerven.canWool],
                          ['grain', 'Зерно', '80{i:food} еды', hud.sel.kerven.canGrain],
                          ['horses', 'Кони', '120{i:gold}', hud.sel.kerven.canHorses],
                        ] as const).map(([gk, lbl, cost, can]) => (
                          <div key={gk} className="rounded-lg border border-white/10 bg-black/30 p-1 text-center">
                            <div className="text-[10px] font-black text-slate-100">{lbl} <span className="text-amber-300">{hud.sel.kerven![gk]}</span></div>
                            <div className="mt-0.5 flex gap-0.5">
                              <button disabled={!can || hud.sel.kerven!.busy} onClick={() => g()?.sendCaravan(gk, 'tribe')}
                                className={`flex-1 rounded px-1 py-0.5 text-[9px] font-black ${can && !hud.sel.kerven!.busy ? 'btn-iron text-lime-200' : 'bg-black/40 text-slate-500'}`}
                                title={`Караван ${lbl.toLowerCase()} → дружественное племя (${cost}). Прибытие греет отношения`}>племя</button>
                              <button disabled={!can || !hud.sel.kerven!.hasCity || hud.sel.kerven!.busy} onClick={() => g()?.sendCaravan(gk, 'city')}
                                className={`flex-1 rounded px-1 py-0.5 text-[9px] font-black ${can && hud.sel.kerven!.hasCity && !hud.sel.kerven!.busy ? 'btn-iron text-amber-200' : 'bg-black/40 text-slate-500'}`}
                                title={`Караван ${lbl.toLowerCase()} → город соперника: премия ×1,2, но риск грабежа выше. Эскорт рядом спасает груз`}>город</button>
                            </div>
                          </div>
                        ))}
                      </div>
                      {hud.sel.kerven.busy && <div className="mt-1 text-[9px] font-bold text-rose-300">Көпес в пути — наймите ещё на базаре</div>}
                    </div>
                  )}
                  {hud.sel.bkey === 'pen' && hud.sel.penUpg && (
                    <div className="mt-1.5 rounded-lg border border-lime-300/25 bg-lime-400/10 p-1.5">
                      <div className="mb-1 flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-lime-300/90">
                        <span>Төл — выпас и войлок</span>
                        <span title="Истощение дёрна у загона; стадо на дальнем выпасе — трава отдыхает">дёрн {hud.sel.penUpg.dep}%</span>
                      </div>
                      <div className="mb-1 h-1 rounded bg-black/40"><div className="h-1 rounded bg-lime-400/80" style={{ width: `${hud.sel.penUpg.dep}%` }} /></div>
                      <div className="flex flex-wrap gap-1">
                        <MiniBtn onClick={() => g()?.craftFelt('yurts')} title="12 шерсти: юрты в войлоке — зимняя изоляция (п.15)">
                          <Ico name="yurt" /> Юрты в войлоке (12){hud.sel.penUpg.doneYurts ? ' — есть' : ''}
                        </MiniBtn>
                        <MiniBtn onClick={() => g()?.craftFelt('armor')} title="16 шерсти: конница +12% HP">
                          <Ico name="saber" /> Доспехи (16) {hud.sel.penUpg.doneArmor ? '— есть' : ''}
                        </MiniBtn>
                        <span className="ml-auto self-center rounded bg-black/40 px-1.5 text-[10px] font-black text-lime-200"><Ico name="sheep" /> {hud.sel.penUpg.wool}</span>
                      </div>
                    </div>
                  )}
                  {hud.sel.bkey === 'tower' && hud.sel.towerUpg && (
                    <div className="mt-1.5 rounded-lg border border-amber-300/25 bg-amber-400/10 p-1.5">
                      <div className="mb-1 text-[9px] font-black uppercase tracking-widest text-amber-300/90">Улучшения башни</div>
                      <div className="flex flex-wrap gap-1">
                        {([
                          ['range', '{i:ruler} Дальность', '+18% дальности обзора и стрельбы за уровень'],
                          ['dmg', '{i:bow} Урон', '+35% урона и +80 прочности за уровень'],
                          ['archers', '{i:target} Лучники', '+1 лучник на башне: дополнительный залп (макс 2)'],
                        ] as const).map(([k, lbl, tip]) => {
                          const tu = hud.sel.towerUpg!;
                          const lvl = k === 'range' ? tu.range : k === 'dmg' ? tu.dmg : tu.archers;
                          const cap = k === 'range' ? tu.maxRange : k === 'dmg' ? tu.maxDmg : tu.maxArchers;
                          const cost = Math.round((k === 'range' ? 90 : k === 'dmg' ? 110 : 150) * (1 + lvl * 0.8));
                          const maxed = lvl >= cap;
                          return (
                            <MiniBtn key={k}
                              onClick={() => { if (!maxed) g()?.upgradeTower(hud.sel.bid!, k); }}
                              title={plainRich(`${tip} · ${maxed ? 'максимум' : `${cost} золота`}`)}>
                              <RT t={`${lbl} ${lvl}/${cap}${maxed ? ' {i:check}' : ` (${cost}{i:gold})`}`} />
                            </MiniBtn>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(hud.sel.done ?? 1) >= 1 && (hud.sel.hp ?? 0) < (hud.sel.bmax ?? 1) - 1 && (
                      <MiniBtn onClick={() => g()?.repairBuilding(hud.sel.bid!)} title="Отправить шаруа чинить (тратит дерево)"><Ico name="wrench" /> Чинить</MiniBtn>
                    )}
                    {(hud.sel.garrisonCap ?? 0) > 0 && (
                      <>
                        <MiniBtn onClick={() => g()?.garrisonUnits(hud.sel.bid!)}><Ico name="shield" /> В укрытие ({hud.sel.garrison}/{hud.sel.garrisonCap})</MiniBtn>
                        {(hud.sel.garrison ?? 0) > 0 && <MiniBtn onClick={() => g()?.ungarrisonUnits(hud.sel.bid!, true)}>Выпустить</MiniBtn>}
                      </>
                    )}
                    {['towncenter', 'barracks', 'stable', 'blacksmith', 'market'].includes(hud.sel.bkey ?? '') && (
                      <MiniBtn onClick={() => { const gm = g(); if (gm) { gm.rallyArmed = true; gm.pushHud(); } }} active={hud.rallyArmed} title="Кликните по точке сбора; если это ресурс — новые шаруа сразу идут на работу"><Flag className="h-3 w-3" />Сбор</MiniBtn>
                    )}
                    {hud.sel.bkey === 'wall' && (
                      <MiniBtn onClick={() => g()?.buildGateOnWall(hud.sel.bid!)} title="Вставить ворота вместо этого участка стены (стоимость ворот)"><Ico name="door" /> Ворота</MiniBtn>
                    )}
                    <MiniBtn
                      onClick={() => { const gm = g(); if (gm) gm.demolish(hud.sel.bid!); }}
                      title={hud.sel.bkey === 'towncenter' ? 'Ханскую ставку снести нельзя' : 'Снести строение (Delete) — возврат части ресурсов'}
                    ><Ico name="pick" /> Снести</MiniBtn>
                    <MiniBtn onClick={() => g()?.clearSel() ?? g()?.pushHud()}><Ico name="cross" /></MiniBtn>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* placement / attack banners */}
      {hud?.placement && !uiHidden && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[132px] z-20 flex justify-center sm:bottom-[128px]">
          <div className="anim-banner pointer-events-auto flex items-center gap-2 rounded-full border border-lime-300/50 bg-lime-950/90 px-4 py-1.5 text-xs font-bold text-lime-200">
            <Ico name="crane" /> Строим: {BUILDING_DEFS[hud.placement].name} — кликните по карте
            <button onClick={() => g()?.cancelPlacement()} className="rounded-full bg-white/10 p-1"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}
      {hud?.attackArmed && !hud?.placement && !uiHidden && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[132px] z-20 flex justify-center sm:bottom-[128px]">
          <div className="anim-banner pointer-events-auto rounded-full border border-red-300/50 bg-red-950/90 px-4 py-1.5 text-xs font-bold text-red-200">
            <Ico name="target" /> Атака-мув готова — укажите точку набега! (Esc — отмена)
          </div>
        </div>
      )}

      {/* ===== «ЧИСТЫЙ ЭКРАН»: один тап — и интерфейса нет ===== */}
      <button
        onClick={() => setUiHidden(h => !h)}
        title={uiHidden ? 'Показать интерфейс' : 'Чистый экран: спрятать весь интерфейс'}
        aria-label={uiHidden ? 'Показать интерфейс' : 'Спрятать интерфейс'}
        className={`absolute right-2 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border backdrop-blur-sm transition active:scale-95 ${uiHidden ? 'border-amber-300/70 bg-amber-400/25 text-amber-100' : 'border-white/15 bg-black/45 text-slate-300'}`}
      >
        {uiHidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>

      {/* ===== BOTTOM DOCK ===== */}
      {!uiHidden && (
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-3xl px-2">
          <div className="panel-iron pointer-events-auto rounded-2xl p-2">
            {/* вкладки: Войска / Стройка. «Отряд» и «Сводка» — только на телефоне:
                там нет левой колонки, и её кнопки переехали сюда (1.0.137) */}
            <div className="mb-1.5 flex flex-wrap items-center gap-1 sm:gap-1.5">
              <DockTab active={dockTab === 'units' && dockOpen} onClick={() => dockPick('units')} icon={<Swords className="h-3.5 w-3.5" />} label="ВОЙСКА" />
              <DockTab active={dockTab === 'build' && dockOpen} onClick={() => dockPick('build')} icon={<Castle className="h-3.5 w-3.5" />} label="СТРОЙКА" />
              <DockTab className="sm:hidden" active={dockTab === 'squad' && dockOpen} onClick={() => dockPick('squad')} icon={<Users className="h-3.5 w-3.5" />} label="ОТРЯД" />
              <DockTab className="sm:hidden" active={dockTab === 'info' && dockOpen} onClick={() => dockPick('info')} icon={<Gauge className="h-3.5 w-3.5" />} label="СВОДКА" />
              <div className="ml-auto">
                <button
                  onClick={() => g()?.ageUp()}
                  disabled={(hud?.age ?? 0) >= 3}
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-black transition ${(hud?.ageAfford && (hud?.age ?? 0) < 3) ? 'btn-gold animate-pulse' : 'btn-iron opacity-80'} disabled:opacity-40`}
                >
                  <Ico name={(hud?.age ?? 0) >= 3 ? 'crown' : AGES[(hud?.age ?? 0) + 1].icon} className="h-5 w-5" />
                  <span className="text-left leading-tight">
                    <span className="block">{(hud?.age ?? 0) >= 3 ? 'МАКС. ВЕК' : 'Эпоха (T)'}</span>
                    <span className="block text-[9px] font-bold opacity-80"><RT t={hud?.ageCost ?? ''} /></span>
                  </span>
                </button>
              </div>
            </div>
            {dockOpen && dockTab === 'units' && (
            <div className="scroll-thin flex items-stretch gap-1.5 overflow-x-auto">
              <>
                  <TrainBtn label="Шаруа" icon="farmer" key_="1" cost={ucost('villager')} ok={canAfford(ucost('villager'))} tip={unitStats('villager')} onClick={() => g()?.train('villager')} />
                  <TrainBtn label={hud?.unitNames?.swordsman ?? 'Сарбаз'} icon="saber" key_="2" cost={ucost('swordsman')} ok={canAfford(ucost('swordsman'))} tip={unitStats('swordsman')} onClick={() => g()?.train('swordsman')} />
                  <TrainBtn label={hud?.unitNames?.archer ?? 'Мерген'} icon="bow" key_="3" cost={ucost('archer')} ok={canAfford(ucost('archer'))} tip={unitStats('archer')} onClick={() => g()?.train('archer')} />
                  <TrainBtn label="Мылтықшы" icon="fire" key_="" cost={ucost('musketeer')} ok={canAfford(ucost('musketeer')) && (hud?.age ?? 0) >= 3} lock={(hud?.age ?? 0) < 3} tip={unitStats('musketeer')} onClick={() => g()?.train('musketeer')} />
                  <TrainBtn label="Батыр" icon="horse" key_="4" cost={ucost('knight')} ok={canAfford(ucost('knight')) && (hud?.age ?? 0) >= 1} lock={(hud?.age ?? 0) < 1} tip={unitStats('knight')} onClick={() => g()?.train('knight')} />
                  <TrainBtn label={hud?.unitNames?.spearman ?? 'Найзагер'} icon="spear" key_="5" cost={ucost('spearman')} ok={canAfford(ucost('spearman'))} tip={unitStats('spearman')} onClick={() => g()?.train('spearman')} />
                  <TrainBtn label={hud?.unitNames?.cavalry ?? 'Жасауыл'} icon="rider" key_="6" cost={ucost('cavalry')} ok={canAfford(ucost('cavalry')) && (hud?.age ?? 0) >= 1} lock={(hud?.age ?? 0) < 1} tip={unitStats('cavalry')} onClick={() => g()?.train('cavalry')} />
                  <TrainBtn label="Атты-мерген" icon="bow" key_="" cost={ucost('horsearcher')} ok={canAfford(ucost('horsearcher')) && (hud?.age ?? 0) >= 2} lock={(hud?.age ?? 0) < 2} tip={unitStats('horsearcher')} onClick={() => g()?.train('horsearcher')} />
                  <TrainBtn label="Таран" icon="hammer" key_="" cost={ucost('ram')} ok={canAfford(ucost('ram')) && (hud?.age ?? 0) >= 1} lock={(hud?.age ?? 0) < 1} tip={unitStats('ram')} onClick={() => g()?.train('ram')} />
                  <TrainBtn label="Фальконет" icon="explosion" key_="" cost={ucost('falconet')} ok={canAfford(ucost('falconet')) && (hud?.age ?? 0) >= 3} lock={(hud?.age ?? 0) < 3} tip={unitStats('falconet')} onClick={() => g()?.train('falconet')} />
                  <TrainBtn label="Катапульта" icon="stone" key_="7" cost={ucost('catapult')} ok={canAfford(ucost('catapult')) && (hud?.age ?? 0) >= 2} lock={(hud?.age ?? 0) < 2} tip={unitStats('catapult')} onClick={() => g()?.train('catapult')} />
                  <TrainBtn label="Имам" icon="mosque" key_="8" cost={ucost('monk')} ok={canAfford(ucost('monk'))} tip={unitStats('monk') + ' · нужна Мешіт-медресе'} onClick={() => g()?.train('monk')} />
                  <TrainBtn label="Барлаушы" icon="compass" key_="9" cost={ucost('scout')} ok={canAfford(ucost('scout'))} tip={unitStats('scout')} onClick={() => g()?.train('scout')} />
                  <TrainBtn label="Көпес" icon="camel" key_="0" cost={ucost('trader')} ok={canAfford(ucost('trader'))} tip={unitStats('trader') + ' · нужен Базар и друзья-соседи'} onClick={() => g()?.train('trader')} />
                  {(['camelry', 'oghuzguard', 'druzhinnik', 'mirza'] as const).map(k => {
                    const nid = (UNIT_DEFS[k] as unknown as { tribeOf?: string }).tribeOf!;
                    const ndef = NATION_BY_ID[nid];
                    const suz = hud?.nations?.find(n => n.id === nid)?.suzerain === 'player';
                    if (!suz) return null;   // племенной юнит появляется в доке только за сюзеренитет (п.38)
                    return <TrainBtn key={k} label={UNIT_DEFS[k].name.replace(/^(Хорезмский |Огузский |Славянский |Бухарский )/, '')} icon={k === 'camelry' ? 'camel' : k === 'mirza' ? 'scroll' : k === 'oghuzguard' ? 'spear' : 'saber'} key_="" cost={ucost(k)} ok={canAfford(ucost(k)) && (hud?.age ?? 0) >= UNIT_DEFS[k].ageReq} lock={(hud?.age ?? 0) < UNIT_DEFS[k].ageReq} tip={unitStats(k) + ` · уникальный юнит «${ndef?.name ?? nid}»`} onClick={() => g()?.train(k)} />;
                  })}
              </>
            </div>
            )}
            {dockOpen && dockTab === 'build' && (
            <div className="scroll-thin flex items-stretch gap-1.5 overflow-x-auto">
              <>
                  <TrainBtn label="Юрта" icon="yurt" key_="Q" cost={bldCostOf('house', wdisc, clan)} ok={canAfford(bldCostOf('house', wdisc, clan))} active={hud?.placement === 'house'} tip={bldStats('house')} onClick={() => g()?.enterPlacement('house')} />
                  <TrainBtn label="Казармы" icon="hammerpick" key_="E" cost={bldCostOf('barracks', wdisc, clan)} ok={canAfford(bldCostOf('barracks', wdisc, clan))} active={hud?.placement === 'barracks'} tip={bldStats('barracks')} onClick={() => g()?.enterPlacement('barracks')} />
                  <TrainBtn label="Башня" icon="tower" key_="R" cost={bldCostOf('tower', wdisc, clan)} ok={canAfford(bldCostOf('tower', wdisc, clan)) && (hud?.age ?? 0) >= 1} lock={(hud?.age ?? 0) < 1} active={hud?.placement === 'tower'} tip={bldStats('tower')} onClick={() => g()?.enterPlacement('tower')} />
                  <TrainBtn label="Пашня" icon="wheat" key_="F" cost={bldCostOf('farm', wdisc, clan)} ok={canAfford(bldCostOf('farm', wdisc, clan))} active={hud?.placement === 'farm'} tip={bldStats('farm')} onClick={() => g()?.enterPlacement('farm')} />
                  <TrainBtn label="Склад" icon="box" key_="K" cost={bldCostOf('storehouse', wdisc, clan)} ok={canAfford(bldCostOf('storehouse', wdisc, clan))} active={hud?.placement === 'storehouse'} tip={bldStats('storehouse')} onClick={() => g()?.enterPlacement('storehouse')} />
                  <TrainBtn label="Загон" icon="sheep" key_="H" cost={bldCostOf('pen', wdisc, clan)} ok={canAfford(bldCostOf('pen', wdisc, clan))} active={hud?.placement === 'pen'} tip={bldStats('pen') + ' · кликни рабочим по загону → пастух'} onClick={() => g()?.enterPlacement('pen')} />
                  <TrainBtn label="Конюшня" icon="horse" key_="Z" cost={bldCostOf('stable', wdisc, clan)} ok={canAfford(bldCostOf('stable', wdisc, clan)) && (hud?.age ?? 0) >= 1} lock={(hud?.age ?? 0) < 1} active={hud?.placement === 'stable'} tip={bldStats('stable')} onClick={() => g()?.enterPlacement('stable')} />
                  <TrainBtn label="Кузница" icon="hammer" key_="X" cost={bldCostOf('blacksmith', wdisc, clan)} ok={canAfford(bldCostOf('blacksmith', wdisc, clan)) && (hud?.age ?? 0) >= 2} lock={(hud?.age ?? 0) < 2} active={hud?.placement === 'blacksmith'} tip={bldStats('blacksmith')} onClick={() => g()?.enterPlacement('blacksmith')} />
                  <TrainBtn label="Базар" icon="market" key_="C" cost={bldCostOf('market', wdisc, clan)} ok={canAfford(bldCostOf('market', wdisc, clan))} active={hud?.placement === 'market'} tip={bldStats('market')} onClick={() => g()?.enterPlacement('market')} />
                  <TrainBtn label="Мешіт" icon="mosque" key_="M" cost={bldCostOf('mosque', wdisc, clan)} ok={canAfford(bldCostOf('mosque', wdisc, clan))} active={hud?.placement === 'mosque'} tip={bldStats('mosque')} onClick={() => g()?.enterPlacement('mosque')} />
                  <div className="mx-0.5 w-px shrink-0 bg-white/10" />
                  <TrainBtn label="Стена" icon="brick" key_="B" cost={bldCostOf('wall', wdisc, clan)} ok={canAfford(bldCostOf('wall', wdisc, clan))} active={hud?.placement === 'wall'} tip={bldStats('wall')} onClick={() => g()?.enterPlacement('wall')} />
                  <TrainBtn label="Ворота" icon="door" key_="V" cost={bldCostOf('gate', wdisc, clan)} ok={canAfford(bldCostOf('gate', wdisc, clan))} active={hud?.placement === 'gate'} tip={bldStats('gate')} onClick={() => g()?.enterPlacement('gate')} />
                  <TrainBtn label="Хан орда" icon="yurt" key_="" cost={bldCostOf('orda', wdisc, clan)} ok={canAfford(bldCostOf('orda', wdisc, clan)) && (hud?.age ?? 0) >= 2} lock={(hud?.age ?? 0) < 2} active={hud?.placement === 'orda'} tip={bldStats('orda')} onClick={() => g()?.enterPlacement('orda')} />
                  <TrainBtn label="Мавзолей" icon="star" key_="W" cost={bldCostOf('wonder', wdisc, clan)} ok={canAfford(bldCostOf('wonder', wdisc, clan)) && (hud?.age ?? 0) >= 3} lock={(hud?.age ?? 0) < 3} active={hud?.placement === 'wonder'} tip={bldStats('wonder')} onClick={() => g()?.enterPlacement('wonder')} />
              </>
            </div>
            )}
            {dockOpen && dockTab === 'squad' && (
              <div className="scroll-thin flex max-h-[45dvh] flex-col gap-1 overflow-y-auto overscroll-contain">
                <SquadControls hud={hud} g={g} />
              </div>
            )}
            {dockOpen && dockTab === 'info' && (
              <div className="scroll-thin flex max-h-[45dvh] flex-col gap-1 overflow-y-auto overscroll-contain">
                <EconSummary hud={hud} g={g} />
                <QuestsPanel hud={hud} open={showQuests} onToggle={() => setShowQuests(s => !s)} />
              </div>
            )}
            {/* подсказка нужна, когда интерфейса почти нет; раскрытый лист сам всё объясняет */}
            {isMobile && !dockOpen && (
              <div className="mt-1 flex items-center justify-center gap-2 px-1 text-center text-[11px] font-semibold text-slate-300">
                <span>палец — камера</span><span className="text-slate-600">•</span>
                <span>щипок — зум</span><span className="text-slate-600">•</span>
                <span>тап — выбор и приказ</span><span className="text-slate-600">•</span>
                <span>чип карты — перелёт</span>
              </div>
            )}
            {!isMobile && (
              <div className="mt-1 hidden items-center justify-center gap-3 text-[10px] font-semibold text-slate-400 sm:flex">
                <span className="flex items-center gap-1"><MousePointer2 className="h-3 w-3" />Рамка — выбор • ПКМ — приказ • Колесо — зум • камера к краю</span>
                <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" />WASD камера • B/V стена (тянуть) • Ctrl+1..5 группа • G атака • «.» шаруа • Home ставка • N звук • Space пауза</span>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ===== КОШ (кочевой режим) ===== */}
      {/* Той (п.20): золотая кнопка праздника + модалка мини-игр */}
      {hud?.toy?.due && !showToy && !over && !uiHidden && (
        <button onClick={() => setShowToy(true)}
          className="absolute bottom-24 right-3 z-30 rounded-2xl border border-amber-300/60 bg-amber-400/25 px-3 py-2 text-xs font-black text-amber-100 shadow-lg backdrop-blur-sm animate-pulse"
          title="Той (п.20): байга, көкпар и асык. Награды, +5% к добыче на время и авторитет биев. Пропустишь — бии обидятся!">
          <Ico name="spark" className="mr-1 inline h-4 w-4" />ТОЙ!
        </button>
      )}
      {showToy && hud && (
        <ToyModal onClose={() => setShowToy(false)} act={(kind, amount) => {
          const gm = g(); if (!gm) return false;
          if (kind === 'bet') return gm.toyBet(amount ?? 0);
          gm.toyReward(kind, amount ?? 0); return true;
        }} />
      )}
      {koshOpen && hud?.mode === 'nomad' && !over && !uiHidden && (
        <Overlay>
          <div className="font-display mb-2 flex items-center justify-center gap-2 text-lg font-black text-amber-100"><Ico name="camel" className="h-5 w-5" />Көш: новый жайляу</div>
          <p className="mb-3 text-[12px] leading-snug text-slate-400">Марш займёт 20 секунд — производство и стройка паузятся.
            Перевозимое едет с аулом; пашни и башни разбираются с возвратом 40%, склад оставит қыстау с тайником еды.</p>
          <div className="mb-3 grid grid-cols-1 gap-2">
            {(hud.sites ?? []).map(s => (
              <button key={s.i} disabled={s.cur || hud.migrating > 0}
                onClick={() => { g()?.startKosh(s.i); setKoshOpen(false); }}
                className={`rounded-2xl border p-2.5 text-left transition ${s.cur ? 'border-lime-300 bg-lime-400/10 opacity-70' : 'border-white/10 bg-black/30 hover:bg-black/20'}`}>
                <span className="flex items-center justify-between text-[12px] font-black text-amber-100">
                  <span className="flex items-center gap-1.5"><Ico name="yurt" className="h-4 w-4" />{s.tag}</span>
                  <span>{s.cur ? 'нынешняя' : `${s.dist} ед.`}</span>
                </span>
                <span className="mt-1 block text-[10px] text-slate-400">Пастбище: {100 - s.dep}%{s.dep > 60 ? ' — истощено, пора сниматься!' : ''}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setKoshOpen(false)} className="rounded-full bg-white/10 px-4 py-1.5 text-[12px] font-bold text-slate-200 hover:bg-white/20">Остаться</button>
        </Overlay>
      )}

      {/* ===== PAUSE ===== */}
      {paused && !over && (
        <Overlay>
          <div className="font-display text-3xl font-black tracking-wide sm:text-4xl"><span className="gold-text">ПАУЗА</span></div>
          <p className="mt-1 text-sm text-slate-400">Ваша империя ждёт вашего возвращения, повелитель.</p>
          <div className="mt-5 grid w-full gap-2">
            <BigBtn onClick={() => setPaused(false)}><Play className="h-4 w-4" />Продолжить (Space)</BigBtn>
            <MidBtn onClick={() => g()?.saveGame()}><span className="text-base"><Ico name="save" /></span>Сохранить партию</MidBtn>
            <div className="grid grid-cols-2 gap-2">
              <MidBtn onClick={() => { setPaused(false); startGame(difficulty); }}><RotateCcw className="h-4 w-4" />Заново</MidBtn>
              <MidBtn onClick={() => {
                // Уходя в меню, дописываем партию и снимаем метку: после F5
                // игрок попадёт в меню (с кнопкой «Продолжить»), а не обратно в бой.
                gameRef.current?.saveOnExit();
                setInGame(false);
                gameRef.current?.destroy(); setScreen('menu'); setPaused(false);
              }}><Home className="h-4 w-4" />Меню</MidBtn>
            </div>
            <MidBtn onClick={() => setShowSettings(true)}><SettingsIcon className="h-4 w-4" />Настройки</MidBtn>
            <MidBtn onClick={() => g()?.toggleMute()}>{hud?.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}{hud?.muted ? 'Включить звук' : 'Выключить звук'} (N)</MidBtn>
          </div>
          <ControlsRecap />
        </Overlay>
      )}

      {/* ===== TECH TREE DOSSIER ===== */}
      {showTech && hud && (
        <TechTreeModal hud={hud} onClose={() => setShowTech(false)} onResearch={(id) => gameRef.current?.research(id)} />
      )}

      {/* ===== СЛУЧАЙНОЕ СОБЫТИЕ СТЕПИ (выбор реакции, Civ-стиль) ===== */}
      {hud?.event && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[88dvh] overflow-y-auto scroll-thin kz-corners panel-iron anim-banner w-full max-w-md rounded-3xl p-5">
            <div className="mb-1 flex items-center gap-2.5">
              <Ico name={hud.event.icon} className="h-9 w-9 text-amber-200" />
              <div className="font-display text-lg font-black tracking-wide text-amber-200"><RT t={hud.event.title} /></div>
            </div>
            <p className="mb-4 text-[12.5px] leading-relaxed text-slate-300"><RT t={hud.event.text} /></p>
            <div className="grid gap-2">
              {hud.event.opts.map((o, i) => (
                <button key={i} onClick={() => gameRef.current?.eventChoice(i)}
                  className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-left transition hover:border-amber-300/40 hover:bg-amber-400/10">
                  <div className="text-[13px] font-black text-slate-100"><RT t={o.label} /></div>
                  <div className="text-[11px] text-slate-400"><RT t={o.desc} /></div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== СОВЕТ ВЕЛИКИХ ЛЮДЕЙ ===== */}
      {showGreats && hud && (
        <div className="absolute inset-0 z-[61] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setShowGreats(false)}>
          <div className="max-h-[88dvh] overflow-y-auto scroll-thin kz-corners panel-iron w-full max-w-2xl rounded-3xl p-5" onClick={e => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <div className="font-display text-lg font-black tracking-wide text-amber-200"><Ico name="sparkle" /> ВЕЛИКИЕ ЛЮДИ СТЕПИ</div>
              <button onClick={() => setShowGreats(false)} className="rounded-lg px-2 py-0.5 text-slate-400 hover:bg-white/10"><Ico name="cross" /></button>
            </div>
            <p className="mb-3 text-[12px] leading-relaxed text-slate-400">
              Мудрость копят Мешіт-медресе, Мавзолей хана и найденные реликвии. Призванный бий
              остаётся с ханством навсегда. Сейчас: <b className="text-teal-200">{hud.wisdom} мудрости</b>
              {hud.wisdomRate > 0 && <span className="text-slate-500"> (+{hud.wisdomRate}/с)</span>}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {hud.greats.map(gr => (
                <div key={gr.id} className={`rounded-2xl border p-2.5 transition ${
                  gr.called ? 'border-lime-400/50 bg-lime-500/10'
                    : gr.afford ? 'border-amber-300/50 bg-amber-400/10' : 'border-white/10 bg-white/5'}`}>
                  <img src={gr.portrait} alt={gr.name}
                    className={`mb-2 aspect-square w-full rounded-xl object-cover ${gr.called ? '' : 'opacity-80 grayscale-[35%]'}`} />
                  <div className="text-[13px] font-black text-slate-100">{gr.name}</div>
                  <div className="mb-1 text-[10px] text-slate-400">{gr.title}</div>
                  <div className="mb-2 text-[11px] leading-snug text-slate-300">{gr.effect}</div>
                  {gr.called ? (
                    <div className="rounded-xl bg-lime-500/20 py-1.5 text-center text-[11px] font-black text-lime-200">
                      <Ico name="check" /> В совете хана
                    </div>
                  ) : (
                    <button onClick={() => { gameRef.current?.callGreat(gr.id as 'tole' | 'kazybek' | 'aiteke'); }}
                      disabled={!gr.afford}
                      className={`w-full rounded-xl py-1.5 text-[11px] font-black transition ${
                        gr.afford ? 'bg-amber-400/25 text-amber-100 hover:bg-amber-400/40'
                          : 'cursor-not-allowed bg-black/40 text-slate-500'}`}>
                      Призвать • {gr.cost} <Ico name="sparkle" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== ЯСА: карточки политик ===== */}
      {showYasa && hud && (
        <div className="absolute inset-0 z-[61] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setShowYasa(false)}>
          <div className="max-h-[88dvh] overflow-y-auto scroll-thin kz-corners panel-iron w-full max-w-xl rounded-3xl p-5" onClick={e => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <div className="font-display text-lg font-black tracking-wide text-amber-200"><Ico name="scroll" /> ЯСА ХАНСТВА</div>
              <button onClick={() => setShowYasa(false)} className="rounded-lg px-2 py-0.5 text-slate-400 hover:bg-white/10"><Ico name="cross" /></button>
            </div>
            <p className="mb-3 text-[12px] leading-relaxed text-slate-400">
              Карточки политик: активно до <b className="text-amber-200">{hud.yasaSlots}</b> одновременно. Включение —
              <b className="text-teal-200"> {hud.yasaCost} мудрости</b>, снятие бесплатно. Сейчас мудрости: <b className="text-teal-200">{hud.wisdom}</b>.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {hud.yasa.map(ya => (
                <button key={ya.id} onClick={() => gameRef.current?.yasaToggle(ya.id)}
                  className={`rounded-2xl border p-2.5 text-left transition ${
                    ya.active ? 'border-lime-400/50 bg-lime-500/10' : 'border-white/10 bg-white/5 hover:border-amber-300/40 hover:bg-amber-400/10'}`}>
                  <div className="flex items-center gap-2 text-[13px] font-black text-slate-100">
                    <Ico name={ya.icon} className="h-4 w-4 text-amber-200" />{ya.name}
                    <span className="ml-auto rounded-full bg-black/30 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">{ya.cat}</span>
                  </div>
                  <div className="mt-1 text-[11px] leading-snug text-slate-300">{ya.desc}</div>
                  <div className={`mt-1.5 text-[10px] font-black ${ya.active ? 'text-lime-300' : 'text-amber-200/80'}`}>
                    {ya.active ? 'ДЕЙСТВУЕТ — нажмите, чтобы снять' : `Включить • ${hud.yasaCost} мудрости`}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== ИТОГИ ЭПОХИ ===== */}
      {hud?.ageReport && (
        <div className="absolute inset-0 z-[62] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="max-h-[88dvh] overflow-y-auto scroll-thin kz-corners panel-iron anim-banner w-full max-w-lg rounded-3xl p-5">
            <div className="mb-3 text-center">
              <div className="text-[11px] font-black tracking-[0.2em] text-slate-400">ЭПОХА ЗАВЕРШЕНА</div>
              <div className="font-display mt-1 flex items-center justify-center gap-2 text-lg font-black text-amber-200">
                <span>{hud.ageReport.fromIcon} {hud.ageReport.fromName}</span>
                <span className="text-slate-500">→</span>
                <span className="text-lime-300">{hud.ageReport.toIcon} {hud.ageReport.toName}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                длилась {hud.ageReport.mins} мин • набрано {hud.ageReport.score} очков
              </div>
            </div>

            <div className="mb-2 grid grid-cols-3 gap-1.5">
              {([['wood', 'дерева', hud.ageReport.wood, 'text-lime-300'],
                 ['food', 'еды', hud.ageReport.food, 'text-rose-300'],
                 ['gold', 'золота', hud.ageReport.gold, 'text-amber-300']] as const).map(([ic, lb, v, cls]) => (
                <div key={lb} className="rounded-2xl bg-black/35 px-2 py-2 text-center">
                  <Ico name={ic} className="mx-auto h-6 w-6" />
                  <div className={`text-base font-black ${cls}`}>{v}</div>
                  <div className="text-[10px] text-slate-400">{lb}</div>
                </div>
              ))}
            </div>

            <div className="mb-3 grid grid-cols-4 gap-1.5 text-center">
              {([['swords', 'врагов', hud.ageReport.kills], ['fire', 'снесено', hud.ageReport.razed],
                 ['crane', 'построек', hud.ageReport.built], ['shield', 'пик армии', hud.ageReport.peakArmy]] as const)
                .map(([ic, lb, v]) => (
                  <div key={lb} className="rounded-xl bg-white/5 px-1 py-1.5">
                    <Ico name={ic} className="mx-auto h-4 w-4" />
                    <div className="text-[13px] font-black text-slate-100">{v}</div>
                    <div className="text-[9px] text-slate-400">{lb}</div>
                  </div>
                ))}
            </div>

            {/* расклад сил с джунгарами — главный вопрос перед новой эпохой */}
            <div className="mb-3 rounded-2xl bg-black/35 px-3 py-2">
              <div className="mb-1 flex items-center justify-between text-[10px] font-black tracking-widest">
                <span className="text-lime-300">ВАШЕ ВОЙСКО {hud.ageReport.powP}</span>
                <span className="text-slate-400">СИЛЫ</span>
                <span className="text-red-300">{hud.ageReport.powE} ДЖУНГАРЫ</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-red-900/60">
                <span className="bg-lime-500" style={{
                  width: `${Math.round((hud.ageReport.powP / Math.max(1, hud.ageReport.powP + hud.ageReport.powE)) * 100)}%`,
                }} />
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                {hud.ageReport.powP >= hud.ageReport.powE * 1.2 ? 'Вы сильнее — можно наступать'
                  : hud.ageReport.powP >= hud.ageReport.powE * 0.8 ? 'Силы примерно равны'
                  : 'Джунгары сильнее — крепите оборону'}
              </div>
            </div>

            {hud.ageReport.unlocks.length > 0 && (
              <div className="mb-4">
                <div className="mb-1 text-[10px] font-black tracking-widest text-amber-200/90">ОТКРЫЛОСЬ</div>
                <div className="space-y-1">
                  {hud.ageReport.unlocks.map(u => (
                    <div key={u} className="rounded-xl bg-lime-500/10 px-2.5 py-1 text-[12px] font-bold text-lime-200"><RT t={u} /></div>
                  ))}
                </div>
              </div>
            )}

            {/* ВЕК ЭПОХИ (п.22 плана): золотой — выбор посвящения, тёмный — тяготы */}
            <div className={`mb-4 rounded-xl border px-3 py-2 ${hud.ageReport.era === 'golden' ? 'border-amber-300/50 bg-amber-400/10' : hud.ageReport.era === 'dark' ? 'border-slate-500/40 bg-slate-700/20' : 'border-white/10 bg-white/5'}`}>
              {hud.ageReport.era === 'golden' ? (
                <>
                  <div className="mb-1 flex items-center gap-1.5 text-[12px] font-black tracking-widest text-amber-300">
                    <Ico name={hud.ageReport.eraHeroic ? 'crown' : 'sun'} className="h-4 w-4" />
                    {hud.ageReport.eraHeroic ? 'ГЕРОИЧЕСКИЙ ВЕК (×1.5)' : 'ЗОЛОТОЙ ВЕК'}
                    <span className="ml-auto text-[10px] font-bold text-slate-300">счёт эпохи {hud.ageReport.eraScore}/{hud.ageReport.eraThreshold}</span>
                  </div>
                  <div className="mb-1.5 text-[10px] text-slate-300">Выберите посвящение — оно поведёт ханство до следующего перехода эпохи:</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(ENGINE?.DEDICATIONS ?? []).map(d => (
                      <button key={d.id} onClick={() => gameRef.current?.chooseDedication(d.id)}
                        className="rounded-lg border border-amber-300/40 bg-black/30 px-1.5 py-1.5 text-left transition hover:bg-amber-400/15">
                        <div className="flex items-center gap-1 text-[11px] font-black text-amber-200"><Ico name={d.icon} className="h-3.5 w-3.5" />{d.name}</div>
                        <div className="mt-0.5 text-[9px] leading-tight text-slate-400">{d.desc}</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : hud.ageReport.era === 'dark' ? (
                <div className="flex items-start gap-2 text-[11px] leading-snug text-slate-300">
                  <Ico name="moon" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span><b className="text-slate-200">Тёмный век</b> (счёт эпохи {hud.ageReport.eraScore}/{hud.ageReport.eraThreshold}): добыча −10%, войска и көш медленнее. Свершения в трудные годы куют <b className="text-amber-300">героический век</b> на следующем переходе.</span>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400">Век ровный (счёт эпохи {hud.ageReport.eraScore}/{hud.ageReport.eraThreshold}) — ни славы золотого, ни тягот тёмного.</div>
              )}
            </div>

            {hud.ageReport.era !== 'golden' && (
            <button onClick={() => gameRef.current?.closeAgeReport()}
              className="w-full rounded-2xl border border-amber-300/40 bg-amber-400/15 py-2.5 text-[13px] font-black tracking-wide text-amber-100 transition hover:bg-amber-400/25">
              Вести ханство дальше →
            </button>
            )}
          </div>
        </div>
      )}

      {/* ===== ЭКРАН ПЕРЕГОВОРОВ С ПРАВИТЕЛЕМ (Civilization-стиль) ===== */}
      {hud?.greeting && (
        <LeaderAudience
          name={hud.greeting.name} ruler={hud.greeting.ruler} title={hud.greeting.title}
          portrait={hud.greeting.portrait} quote={hud.greeting.greet} color="#e0b050" mood={'НОВЫЙ КОНТАКТ'}
          gold={hud.gold}
          actions={hud.greeting.choices.map(c => ({ key: c.id, label: c.label, desc: c.desc, gold: c.gold }))}
          onAction={(act) => gameRef.current?.greetingChoice(act)}
          onClose={() => gameRef.current?.closeGreeting()}
        />
      )}
      {hud?.audience && (
        <LeaderAudience
          name={hud.audience.name} ruler={hud.audience.ruler} title={hud.audience.title}
          portrait={hud.audience.portrait} color={hud.audience.color} mood={hud.audience.rel.toUpperCase()}
          atWar={hud.audience.atWar} quote={hud.nations.find(n => n.id === hud.audience!.id)?.greet ?? ''}
          gold={hud.gold}
          actions={
            hud.audience.kind === 'rival'
              ? (hud.audience.atWar ? [
                  { key: 'peace', label: '{i:dove} Предложить мир', desc: '120{i:gold}' },
                ] : [
                  { key: 'gift', label: '{i:gift} Послать дары', desc: '75{i:gold} · снизить неприязнь', gold: 75 },
                  { key: 'trade', label: `{i:camel} Торговый договор`, desc: hud.tradeRoute ? 'действует' : hud.hasMarket ? '60{i:gold} · нужен Базар' : 'нужен Базар', disabled: hud.tradeRoute || !hud.hasMarket },
                  { key: 'nap', label: '{i:scroll} Пакт о ненападении', desc: hud.napT ? `действует ${hud.napT}с` : '120{i:gold}', disabled: hud.napT > 0 },
                  { key: 'condemn', label: '{i:megaphone} Осуждение', desc: hud.condemned ? 'джунгары осуждены' : 'лишить повода к войне', disabled: hud.condemned },
                  { key: 'tribute', label: '{i:moneybag} Потребовать дань', desc: 'нужно превосходство в силе' },
                  { key: 'war', label: '{i:swords} Объявить войну', danger: true },
                ])
              : (hud.audience.atWar ? [
                  { key: 'gift', label: '{i:gift} Задобрить дарами', desc: `${hud.nations.find(n => n.id === hud.audience!.id)?.gift ?? 40}{i:gold} · прекратить вражду`, gold: hud.nations.find(n => n.id === hud.audience!.id)?.gift ?? 40 },
                ] : [
                  { key: 'gift', label: '{i:gift} Подарки и дары', desc: `${hud.nations.find(n => n.id === hud.audience!.id)?.gift ?? 40}{i:gold} · заключить дружбу`, gold: hud.nations.find(n => n.id === hud.audience!.id)?.gift ?? 40 },
                  { key: 'amanat', label: '{i:handshake} Просить аманат', desc: '150{i:gold} · союз скреплён заложником навеки (п.18)', gold: 150 },
                  { key: 'marry', label: '{i:crown} Свадебный союз', desc: '250{i:gold} · черта супруга и наследник (нужен сюзеренитет)', gold: 250 },
                  { key: 'attack', label: '{i:swords} Потребовать ухода', desc: 'разозлить народ', danger: true },
                ])
          }
          onAction={(act) => gameRef.current?.dipAction(hud.audience!.id, act)}
          onClose={() => gameRef.current?.closeAudience()}
        />
      )}

      {/* ===== ПАНЕЛЬ ДИПЛОМАТИИ ===== */}
      {showDip && hud && (
        <DiplomacyModal hud={hud} onClose={() => setShowDip(false)}
          onAudience={(nid) => gameRef.current?.openAudience(nid)}
          onEnvoy={(nid) => gameRef.current?.sendEnvoy(nid)} />
      )}

      {/* ===== SETTINGS MODAL (в игре) ===== */}
      {showSettings && (
        <SettingsPanel settings={settings} updateSettings={updateSettings} onClose={() => setShowSettings(false)} inGame />
      )}

      {/* ===== GAME OVER ===== */}
      {over && <GameOverScreen over={over} scores={scores} name={name} setName={setName} saved={saved} onSave={saveScore} onRestart={() => startGame(difficulty)} onMenu={() => { setInGame(false); setOver(null); setScreen('menu'); }} />}
    </div>
  );
}

/* ---------- pieces ---------- */
function Res({ icon, val }: { icon: React.ReactNode; val: number }) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-black/30 px-2 py-1 text-sm font-black tabular-nums">
      {icon}<span>{val}</span>
    </div>
  );
}
function IconBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  // min-h/min-w 44px — минимальная цель для пальца по гайдлайнам Apple/Google.
  // На десктопе визуально то же самое, промах мышью и так не проблема.
  return <button title={label} onClick={onClick}
    className="btn-iron flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2.5 text-slate-200 sm:min-h-0 sm:min-w-0">{children}</button>;
}
function MiniBtn({ children, onClick, active, onContextMenu, title }: { children: React.ReactNode; onClick: () => unknown; active?: boolean; onContextMenu?: (e: React.MouseEvent) => void; title?: string }) {
  return (
    <button title={title} onClick={onClick} onContextMenu={onContextMenu} className={`btn-iron flex min-h-[42px] items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-bold text-slate-200 sm:min-h-0 sm:text-[11px] ${active ? 'active text-amber-200' : ''}`}>
      {children}
    </button>
  );
}
function HpMini({ hp, max }: { hp: number; max: number }) {
  return (
    <div className="mt-0.5 h-1.5 w-40 overflow-hidden rounded-full bg-black/50">
      <div className="h-full rounded-full bg-gradient-to-r from-lime-400 to-emerald-400" style={{ width: `${Math.max(0, Math.min(100, (hp / max) * 100))}%` }} />
    </div>
  );
}
function unitStats(k: string): string {
  const d = UNIT_DEFS[k as keyof typeof UNIT_DEFS] as unknown as { hp: number; atk: number; range: number; speed: number; desc?: string };
  if (!d) return '';
  const melee = d.range <= 60;
  const base = `${d.desc ? d.desc + '\n' : ''}HP ${d.hp} · ATK ${d.atk} · ${melee ? 'ближний бой' : `дальность ${d.range}`} · скорость ${d.speed}`;
  const ct = ENGINE ? ENGINE.counterText(k as Parameters<EngineModule['counterText']>[0]) : '';   // контры из единой боевой таблицы (п.21)
  return ct ? `${base}\nКонтра: ${ct}` : base;
}
// цена постройки с учётом союзной скидки на дерево (ремесленные народы)
// и скидки рода (п.12: Арғын — загоны дешевле)
function bldCostOf(k: keyof typeof BUILDING_DEFS, disc: number, clan: ClanId) {
  const c = clanBldCost(clan, k);
  return { wood: Math.round(c.wood * disc), food: c.food, gold: c.gold };
}
function bldStats(k: string): string {
  const d = BUILDING_DEFS[k as keyof typeof BUILDING_DEFS] as unknown as { hp: number; desc?: string };
  if (!d) return '';
  return `${d.desc ? d.desc + '\n' : ''}Прочность: ${d.hp}`;
}
function TrainBtn({ label, icon, key_, cost, ok, onClick, active, lock, tip }: { label: string; icon: string; key_: string; cost: { wood: number; food: number; gold: number }; ok: boolean; onClick: () => void; active?: boolean; lock?: boolean; tip?: string }) {
  return (
    <button
      onClick={onClick}
      title={tip ? plainRich(tip) : undefined}
      className={`relative flex w-[76px] shrink-0 flex-col items-center rounded-xl border px-1 py-2 transition active:scale-95 sm:w-[72px] sm:py-1.5 ${active ? 'border-amber-300 bg-amber-400/20' : ok && !lock ? 'btn-iron hover:border-amber-300/50' : 'border-white/5 bg-black/40 opacity-45'}`}
    >
      <Ico name={lock ? 'lock' : icon} className="h-6 w-6" />
      <span className="mt-0.5 text-[11px] font-black leading-none text-slate-100 sm:text-[10px]">{label}</span>
      <span className="mt-0.5 flex items-center justify-center gap-0.5 text-[10px] font-bold leading-none text-slate-400 sm:text-[8.5px]"><RT t={costStr(cost)} /></span>
      <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[8px] font-black text-amber-200/90">{key_}</span>
      {!ok && !lock && <span className="absolute inset-x-2 bottom-6 h-0.5 rounded bg-red-500/70" />}
    </button>
  );
}
// ── Панели, общие для двух раскладок (1.0.137). На узком экране левая
// колонка не показывается: те же блоки открываются вкладками «Отряд»
// и «Сводка» в нижнем доке. Раньше это был единственный экземпляр разметки,
// прибитый к левому краю, — и он съедал 172px из 414. ──
function QuestsPanel({ hud, open, onToggle }: { hud: HudSnapshot | null; open: boolean; onToggle: () => void }) {
  return (
    <div className="panel-iron pointer-events-auto w-full rounded-xl p-2">
      <button onClick={onToggle} className="flex w-full items-center justify-between text-[11px] font-black tracking-widest text-amber-200">
        <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" />ЗАДАНИЯ</span>
        <ChevronUp className={`h-3.5 w-3.5 transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>
      {open && (
        <div className="mt-1.5 space-y-1">
          {hud?.quests.map(q => (
            <div key={q.id} className={`flex items-center justify-between rounded-lg px-2 py-1 text-[11px] font-semibold ${q.done ? 'bg-lime-500/15 text-lime-300' : 'bg-white/5 text-slate-200'}`}>
              <span className="flex items-center gap-1.5">{q.done ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}<RT t={q.label} /></span>
              <span className="text-[10px] opacity-70">{q.progress}</span>
            </div>
          ))}
          <div className="rounded-lg bg-black/30 px-2 py-1 text-[10px] leading-snug text-slate-400"><Ico name="bulb" /> <RT t={hud?.hint ?? ''} /></div>
        </div>
      )}
    </div>
  );
}

// ── Сводка экономики: куда распределены шаруа ──
function EconSummary({ hud, g }: { hud: HudSnapshot | null; g: () => GameEngine | null }) {
  if ((hud?.econ?.total ?? 0) === 0) return null;
  return (
    <div className="rounded-xl bg-black/35 px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between text-[10px] font-black tracking-widest text-amber-200/90">
        <span>ЭКОНОМИКА</span>
        <span className={`rounded px-1 ${(hud!.econ.idlePct) >= 25 ? 'bg-red-500/30 text-red-200' : (hud!.econ.idlePct) >= 10 ? 'bg-amber-400/25 text-amber-200' : 'bg-lime-500/20 text-lime-300'}`}>
          простой {hud!.econ.idlePct}%
        </span>
      </div>
      {/* полоска распределения: видно перекос одним взглядом */}
      <div className="mb-1 flex h-1.5 overflow-hidden rounded-full bg-black/50">
        {([['wood', 'bg-lime-600'], ['food', 'bg-rose-500'], ['gold', 'bg-amber-400'],
           ['build', 'bg-sky-500'], ['idle', 'bg-slate-600']] as const).map(([k, c]) => {
          const v = hud!.econ[k];
          const base = hud!.econ.total - hud!.econ.rest;
          return v > 0 && base > 0
            ? <span key={k} className={c} style={{ width: `${(v / base) * 100}%` }} />
            : null;
        })}
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-bold">
        {([['wood', 'wood', 'Лес', 'text-lime-300'], ['food', 'food', 'Еда', 'text-rose-300'],
           ['gold', 'gold', 'Золото', 'text-amber-300'], ['build', 'hammer', 'Стройка', 'text-sky-300']] as const)
          .map(([k, icon, label, cls]) => (
            <button key={k} onClick={() => g()?.tradeSelect(k)}
              title={`Выделить всех шаруа: ${label.toLowerCase()}`}
              className={`flex items-center justify-between rounded px-1 py-0.5 hover:bg-white/10 ${cls}`}>
              <span className="flex items-center gap-1"><Ico name={icon} /> {label}</span><b>{hud!.econ[k]}</b>
            </button>
          ))}
        <button onClick={() => g()?.idleSelect()} title="Выделить простаивающих"
          className="flex items-center justify-between rounded px-1 py-0.5 text-slate-300 hover:bg-white/10">
          <span><Ico name="sleep" /> Простой</span><b>{hud!.econ.idle}</b>
        </button>
        <div className="flex items-center justify-between px-1 py-0.5 text-indigo-300"
          title="Отдыхают в ночную смену — это не простой">
          <span><Ico name="moon" /> Отдых</span><b>{hud!.econ.rest}</b>
        </div>
      </div>
    </div>
  );
}

// ── Отряд: выделение, работы, камера, группы контроля ──
function SquadControls({ hud, g }: { hud: HudSnapshot | null; g: () => GameEngine | null }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-1">
        <MiniBtn onClick={() => g()?.armySelect()}><Swords className="h-3.5 w-3.5" />Армия</MiniBtn>
        <MiniBtn onClick={() => g()?.villsSelect()}><Axe className="h-3.5 w-3.5" />Кресты</MiniBtn>
        <MiniBtn onClick={() => g()?.idleSelect()}>Простой{(hud?.idleVills ?? 0) > 0 && <b className="ml-1 rounded bg-amber-400 px-1 text-[10px] text-black">{hud?.idleVills}</b>}</MiniBtn>
        <MiniBtn onClick={() => g()?.workIdle()}><Zap className="h-3.5 w-3.5" />Работа</MiniBtn>
      </div>
      {hud?.sel?.canEscort && (
        <MiniBtn onClick={() => g()?.orderEscortNearest()}><Ico name="caravan" className="h-3.5 w-3.5" />Сопровождать караван</MiniBtn>
      )}
      <div className="grid grid-cols-2 gap-1">
        <MiniBtn onClick={() => g()?.centerTC()}><MapIcon className="h-3.5 w-3.5" />Центр</MiniBtn>
        <MiniBtn onClick={() => g()?.focusSelection()} title="Камера к выделенному юниту/группе"><Crosshair className="h-3.5 w-3.5" />К юниту</MiniBtn>
        <MiniBtn active={hud?.camFollow} onClick={() => g()?.toggleFollow()} title="Авто-следование камеры за выделением (повторно — выкл)"><Video className="h-3.5 w-3.5" />{hud?.camFollow ? 'Следит' : 'Следить'}</MiniBtn>
        <MiniBtn active={hud?.attackArmed} onClick={() => { const gm = g(); if (gm) { gm.attackArmed = !gm.attackArmed; gm.pushHud(); } }}><Flag className="h-3.5 w-3.5" />Атака</MiniBtn>
        <MiniBtn active={hud?.panMode} onClick={() => { const gm = g(); if (gm) { gm.panMode = !gm.panMode; gm.pushHud(); } }}><Hand className="h-3.5 w-3.5" />{hud?.panMode ? 'Кам.' : 'Рамка'}</MiniBtn>
      </div>
      {/* группы контроля: ЛКМ/ПКМ по цифре = вызвать/назначить */}
      <div className="grid grid-cols-5 gap-1" title="ЛКМ — вызвать группу, ПКМ — назначить группу на выделение (или Ctrl/Alt+1..5)">
        {[0, 1, 2, 3, 4].map(i => (
          <MiniBtn
            key={i}
            onClick={() => g()?.recallGroup(i)}
            onContextMenu={(e) => { e.preventDefault(); g()?.setGroup(i); }}
          >{i + 1}</MiniBtn>
        ))}
      </div>
    </>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[88dvh] overflow-y-auto scroll-thin kz-corners panel-iron anim-banner w-full max-w-md rounded-3xl p-6 text-center">{children}</div>
    </div>
  );
}

function DockTab({ active, onClick, icon, label, className }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-[40px] items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-black tracking-wide transition active:scale-95 sm:min-h-0 sm:px-3 sm:text-[12px] sm:tracking-widest ${active ? 'btn-gold text-amber-950' : 'btn-iron text-slate-300 hover:text-white'} ${className ?? ''}`}
    >
      {icon}{label}
    </button>
  );
}

// ── Тумблер настройки ──
function Toggle({ on, onClick, label, desc }: { on: boolean; onClick: () => void; label: string; desc?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-left transition hover:border-amber-300/40">
      <span className="min-w-0">
        <span className="block text-[13px] font-bold text-slate-100">{label}</span>
        {desc && <span className="block text-[10.5px] leading-snug text-slate-400">{desc}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-amber-400/80' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

// ── Панель настроек: сложность, темп, звук, эффекты ──
function SettingsPanel({ settings, updateSettings, onClose, inGame }: { settings: Settings; updateSettings: (p: Partial<Settings>) => void; onClose: () => void; inGame?: boolean }) {
  // Расписание намаза на сегодня для выбранного города — считается локально,
  // без сети. Пересчитываем только при смене города.
  const azanToday = (() => {
    const city = AZAN_CITY_BY_ID[settings.azanCity] ?? AZAN_CITY_BY_ID.astana;
    const t = azanTimes(new Date(), city);
    return AZAN_ORDER.map(k => ({ key: k, name: AZAN_NAMES[k].kz, at: azanFmt(t[k]) }));
  })();
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="kz-corners panel-iron anim-banner max-h-[88dvh] w-full max-w-md overflow-y-auto scroll-thin rounded-3xl p-5 text-slate-100">
        <div className="mb-4 flex items-center justify-between">
          <div className="font-display flex items-center gap-2 text-lg font-black tracking-wide text-amber-100">
            <SettingsIcon className="h-5 w-5 text-amber-300" /> Настройки
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-slate-300 hover:bg-white/20"><X className="h-4 w-4" /></button>
        </div>

        {/* сложность */}
        <div className="mb-1 text-[11px] font-black tracking-widest text-slate-400">РЕЖИМ ПАРТИИ</div>
        <div className="mb-2 grid grid-cols-2 gap-2">
          {([[ 'settled', 'tower', 'Оседлый', 'Города и границы гексов; территориальная победа — 60% долины под сюзеренитетом' ],
             [ 'nomad', 'camel', 'Кочевник', 'Көш между жайляу: пастбища истощаются, қыстау и тайники на старых местах' ]] as const).map(([m, ic, t, d]) => (
            <button key={m} onClick={() => updateSettings({ mode: m })}
              className={`rounded-2xl border p-2.5 text-left transition ${settings.mode === m ? 'border-amber-300 bg-amber-400/15' : 'border-white/10 bg-black/30 hover:bg-black/20'}`}>
              <span className="flex items-center gap-1.5 text-[12px] font-black text-amber-100"><Ico name={ic} className="h-4 w-4" />{t}</span>
              <span className="mt-1 block text-[10px] leading-snug text-slate-400">{d}</span>
            </button>
          ))}
        </div>
        <div className="mb-4 text-[10px] text-slate-500">Применяется к новому походу; текущая партия доиграет свой режим.</div>
        <div className="mb-1 text-[11px] font-black tracking-widest text-slate-400">СЛОЖНОСТЬ</div>
        <div className="grid grid-cols-3 gap-2">
          {DIFFS.map(d => (
            <button
              key={d.id}
              onClick={() => updateSettings({ difficulty: d.id })}
              className={`rounded-2xl border p-2.5 text-center transition active:scale-95 ${settings.difficulty === d.id ? 'border-amber-300 bg-amber-400/15 shadow-[0_0_20px_rgba(245,158,11,.25)]' : 'border-white/10 bg-black/30 opacity-75 hover:opacity-100'}`}
            >
              <div className="flex justify-center text-amber-200"><Ico name={d.icon} className="h-6 w-6" /></div>
              <div className="mt-0.5 text-[12px] font-black text-amber-100">{d.name}</div>
            </button>
          ))}
        </div>
        <p className="mb-4 mt-1 text-[10.5px] leading-snug text-slate-400">{DIFFS.find(d => d.id === settings.difficulty)?.desc}{inGame ? ' • применится к ближайшему набегу' : ''}</p>

        {/* темп игры */}
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-black tracking-widest text-slate-400"><Gauge className="h-3.5 w-3.5" /> ТЕМП ИГРЫ</div>
        <div className="mb-4 grid grid-cols-4 gap-2">
          {SPEED_OPTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => updateSettings({ speed: s.id })}
              className={`rounded-xl border py-2 text-[13px] font-black transition active:scale-95 ${settings.speed === s.id ? 'border-amber-300 bg-amber-400/15 text-amber-100' : 'border-white/10 bg-black/30 text-slate-300 hover:opacity-100'}`}
            >{s.label}</button>
          ))}
        </div>

        {/* биом карты (новая игра) */}
        <div className="mb-1 mt-4 text-[11px] font-black tracking-widest text-slate-400">ТИП КАРТЫ <span className="font-bold normal-case text-slate-500">(с новой партии)</span></div>
        <div className="mb-4 grid grid-cols-4 gap-2">
          {BIOMES.map(bm => (
            <button
              key={bm.id}
              onClick={() => updateSettings({ biome: bm.id })}
              className={`rounded-xl border py-2 text-center transition active:scale-95 ${settings.biome === bm.id ? 'border-amber-300 bg-amber-400/15' : 'border-white/10 bg-black/30 opacity-80 hover:opacity-100'}`}
            >
              <div className="flex justify-center text-amber-200"><Ico name={bm.icon} className="h-5 w-5" /></div>
              <div className="text-[11px] font-bold text-slate-200">{bm.name}</div>
            </button>
          ))}
        </div>

        {/* тумблеры */}
        <div className="space-y-2">
          <Toggle on={!settings.muted} onClick={() => updateSettings({ muted: !settings.muted })} label="Звук" desc="Музыка и эффекты поля боя" />
          <Toggle on={settings.voices && !settings.muted} onClick={() => updateSettings({ voices: !settings.voices })} label="Голоса юнитов" desc="Короткие реплики воинов при выделении, приказах и атаке" />
          <div className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${settings.voices && !settings.muted ? 'bg-white/5' : 'bg-white/[0.02] opacity-50'}`}>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-100"><Ico name="speaker" /> Громкость фраз</div>
              <div className="text-[10px] text-slate-400">{Math.round((settings.voiceVolume ?? 0.3) * 100)}% — реплики юнитов</div>
            </div>
            <input type="range" min={0} max={1} step={0.05} value={settings.voiceVolume ?? 0.3} disabled={!settings.voices || settings.muted}
              onChange={e => updateSettings({ voiceVolume: parseFloat(e.target.value) })}
              className="h-1.5 w-28 cursor-pointer accent-amber-400" />
          </div>
          <Toggle on={settings.screenShake} onClick={() => updateSettings({ screenShake: !settings.screenShake })} label="Тряска камеры" desc="Вибрация при взрывах и разрушениях" />
          <Toggle on={settings.fogOfWar} onClick={() => updateSettings({ fogOfWar: !settings.fogOfWar })} label="Туман войны" desc="Враг скрыт вне обзора ваших войск и зданий" />
          <Toggle on={settings.dayNight} onClick={() => updateSettings({ dayNight: !settings.dayNight })} label="Смена времени суток" desc="Мягкое освещение день→ночь" />
          <Toggle on={settings.weather ?? true} onClick={() => updateSettings({ weather: !(settings.weather ?? true) })} label="Погода степи" desc="Дождь, туман и буран — с эффектами на обзор, скорость и стрельбу" />
          <Toggle on={settings.particles} onClick={() => updateSettings({ particles: !settings.particles })} label="Частицы" desc="Искры, дым, пыль из-под ног" />
          <Toggle on={settings.damageNumbers} onClick={() => updateSettings({ damageNumbers: !settings.damageNumbers })} label="Числа урона и очков" desc="Всплывающие +очки и награды" />
          <Toggle on={settings.autoPauseOnBlur} onClick={() => updateSettings({ autoPauseOnBlur: !settings.autoPauseOnBlur })} label="Авто-пауза" desc="Ставить игру на паузу при сворачивании вкладки" />
          <Toggle on={settings.autosave} onClick={() => updateSettings({ autosave: !settings.autosave })}
            label="Автосохранение"
            desc="Партия пишется каждые 20 секунд и при закрытии вкладки — перезагрузка страницы её не потеряет" />
          <Toggle on={settings.realAzan} onClick={() => updateSettings({ realAzan: !settings.realAzan })}
            label="Азан по реальному времени"
            desc="Призыв звучит в то же время, что и в настоящей мечети выбранного города" />
        </div>

        {/* город для расчёта времён намаза — только когда режим включён */}
        {settings.realAzan && (
          <div className="mt-3 rounded-2xl bg-black/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[12px] font-black text-slate-200"><Ico name="mosque" /> Город намаза</div>
              <div className="text-[10px] text-slate-500">времена считаются астрономически</div>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {AZAN_CITIES.map(c => (
                <button key={c.id} onClick={() => updateSettings({ azanCity: c.id })}
                  className={`rounded-xl px-1.5 py-1.5 text-[11px] font-bold transition ${
                    settings.azanCity === c.id
                      ? 'bg-amber-400/25 text-amber-100 ring-1 ring-amber-300/50'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                  {c.name}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1 text-center">
              {azanToday.map(t => (
                <div key={t.key} className="rounded-lg bg-black/30 px-0.5 py-1">
                  <div className="text-[9px] leading-tight text-slate-400">{t.name.replace(' намазы', '')}</div>
                  <div className="text-[11px] font-black text-teal-200">{t.at}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={onClose} className="btn-gold mt-5 w-full rounded-2xl py-3 text-sm font-black tracking-wide">
          {inGame ? 'Продолжить' : 'Готово'}
        </button>
      </div>
    </div>
  );
}
function BigBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="btn-gold flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black tracking-wide">{children}</button>;
}
function MidBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="btn-iron flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black text-slate-200">{children}</button>;
}
function TechTreeModal({ hud, onClose, onResearch }: { hud: HudSnapshot; onClose: () => void; onResearch: (id: string) => void }) {
  const bands = [0, 1, 2];
  const doneN = hud.techTree.filter(t => t.state === 'done').length;
  const busy = hud.techTree.some(t => t.state === 'researching');
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="kz-corners panel-iron anim-banner relative max-h-[88dvh] w-[min(94vw,820px)] overflow-y-auto scroll-thin rounded-3xl p-4 text-slate-100 sm:p-5">
        <button onClick={onClose} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Закрыть"><X className="h-5 w-5" /></button>
        <div className="mb-1 flex items-center gap-2 font-display text-lg font-black tracking-wide text-amber-200 sm:text-xl">
          <ScrollText className="h-5 w-5" /> Дерево технологий
        </div>
        <p className="mb-3 text-[11.5px] text-slate-400">Изучено {doneN} из {hud.techTree.length}. Технологии дают постоянный бонус и исследуются в указанном здании.</p>

        {/* лента эпох */}
        <div className="mb-4 flex items-center gap-1">
          {AGES.map((a, i) => (
            <div key={a.id} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 text-[11px] font-black ${i <= hud.age ? 'border-amber-300/50 bg-amber-400/10 text-amber-100' : 'border-white/10 bg-black/30 text-slate-500'}`}>
              <Ico name={a.icon} className="h-4 w-4" /><span className="hidden sm:inline">{a.name}</span>
              {i === hud.age && <span className="rounded-full bg-amber-400 px-1 text-[8px] text-black">ВЫ ЗДЕСЬ</span>}
            </div>
          ))}
        </div>

        {bands.map(age => {
          const rows = hud.techTree.filter(t => t.ageReq === age);
          const locked = hud.age < age;
          return (
            <div key={age} className="mb-4">
              <div className={`mb-2 flex items-center gap-2 text-[12px] font-black tracking-widest ${locked ? 'text-slate-500' : 'text-amber-200'}`}>
                <Ico name={AGES[age].icon} className="h-4 w-4" /> {AGES[age].name}
                {locked && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold text-slate-400">нужен переход в эпоху (T)</span>}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {rows.map(t => (
                  <div key={t.id} className={`rounded-xl border p-2.5 transition ${
                    t.state === 'done' ? 'border-lime-400/40 bg-lime-500/10'
                    : t.state === 'researching' ? 'border-sky-400/50 bg-sky-500/10'
                    : t.state === 'ready' ? 'border-amber-300/30 bg-white/5'
                    : 'border-white/10 bg-black/25 opacity-70'}`}>
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/30 text-amber-200"><Ico name={t.icon} className="h-6 w-6" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[13px] font-black text-slate-100">
                          {t.name}
                          {t.state === 'done' && <Check className="h-3.5 w-3.5 text-lime-400" />}
                          {t.state === 'researching' && <Clock className="h-3.5 w-3.5 animate-pulse text-sky-300" />}
                          {(t.state === 'age' || t.state === 'nobuild') && <Lock className="h-3 w-3 text-slate-500" />}
                        </div>
                        <div className="text-[11px] leading-snug text-slate-300">{t.desc}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold text-slate-400">
                          <span className="rounded bg-black/30 px-1.5 py-0.5"><Ico name="column" /> {t.bldName}</span>
                          <span><Ico name="clock" />{t.time}с</span>
                          <span className="text-amber-200/90"><RT t={t.cost} /></span>
                        </div>
                        {t.eureka && (
                          <div className={`mt-1 rounded-lg px-1.5 py-1 text-[10px] leading-snug ${t.eurekaDone ? 'bg-lime-500/15 text-lime-200' : 'bg-black/25 text-slate-400'}`}>
                            <Ico name="bulb" /> Эврика: {t.eureka}{t.eurekaDone && ' — выполнено!'}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-2">
                      {t.state === 'done' && <div className="rounded-lg bg-lime-500/15 py-1 text-center text-[11px] font-black text-lime-300"><Ico name="check" /> Изучено</div>}
                      {t.state === 'researching' && <div className="animate-pulse rounded-lg bg-sky-500/15 py-1 text-center text-[11px] font-black text-sky-300">Изучается…</div>}
                      {t.state === 'ready' && (
                        <button
                          onClick={() => onResearch(t.id)}
                          disabled={!t.canStart}
                          className={`w-full rounded-lg py-1 text-[11px] font-black transition active:scale-95 ${t.canStart ? 'bg-amber-400 text-black hover:bg-amber-300' : 'cursor-not-allowed bg-white/10 text-slate-500'}`}
                        >{busy ? 'Здание занято' : 'Исследовать'}</button>
                      )}
                      {t.state === 'nobuild' && <div className="rounded-lg bg-white/5 py-1 text-center text-[10.5px] font-bold text-slate-400">Нужна постройка: {t.bldName}</div>}
                      {t.state === 'age' && <div className="rounded-lg bg-white/5 py-1 text-center text-[10.5px] font-bold text-slate-400">Откроется в: {AGES[t.ageReq].name}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div className="rounded-xl bg-black/30 p-2.5 text-[10.5px] leading-snug text-slate-400">
          <Ico name="bulb" /> Бонусы технологий постоянны и действуют на всю армию/экономику. Начать исследование можно также, выбрав нужное здание. Переход в новую эпоху (клавиша T) открывает сильные техи и юнитов.
        </div>
      </div>
    </div>
  );
}

function ControlsRecap() {
  return (
    <div className="mt-4 grid grid-cols-2 gap-1.5 text-left text-[10.5px] font-semibold text-slate-400">
      <div className="rounded-lg bg-white/5 p-2"><Ico name="mouse" /> <b className="text-slate-200">Выбор:</b> рамка / двойной клик по типу</div>
      <div className="rounded-lg bg-white/5 p-2"><Ico name="swords" /> <b className="text-slate-200">Приказ:</b> правый клик / касание цели</div>
      <div className="rounded-lg bg-white/5 p-2"><Ico name="keyboard" /> <b className="text-slate-200">Клавиши:</b> 1-8 тренировка • Q/E/R/F/K/Z/X/C стройка • B/V стена/ворота (зажмите и тяните — протяжка) • W Чудо • L дерево технологий • G атака-мув • Y патруль • Ctrl/Alt+1..5 группы</div>
      <div className="rounded-lg bg-white/5 p-2"><Ico name="sheep" /> <b className="text-slate-200">Скот и дичь:</b> овцы, коровы и олени пасутся стадами и дают еду; волки и воины их вспугивают</div>
      <div className="rounded-lg bg-white/5 p-2"><Ico name="beads" /> <b className="text-slate-200">Реликвии:</b> отправьте имама (или любого юнита) правым кликом на сияющий сундук — +золото и пассивный доход</div>
      <div className="rounded-lg bg-white/5 p-2"><Ico name="camera" /> <b className="text-slate-200">Камера:</b> WASD • колесо • мини-карта • «.» прыжок к свободному шаруа</div>
    </div>
  );
}
function unitIcon(k: string) {
  if (k === 'villager') return 'farmer';
  if (k === 'swordsman') return 'saber';
  if (k === 'archer') return 'bow';
  if (k === 'knight') return 'horse';
  if (k === 'spearman') return 'spear';
  if (k === 'cavalry') return 'rider';
  if (k === 'horsearcher') return 'bow';
  if (k === 'ram') return 'hammer';
  if (k === 'musketeer') return 'fire';
  if (k === 'falconet') return 'explosion';
  if (k === 'catapult') return 'stone';
  if (k === 'monk') return 'mosque';
  if (k === 'trader') return 'camel';
  if (k === 'scout') return 'compass';
  if (k === 'sheep') return 'sheep';
  if (k === 'cow') return 'cow';
  if (k === 'deer') return 'deer';
  return 'question';
}
function bldIcon(k: BuildingKey) {
  if (k === 'towncenter') return 'castle';
  if (k === 'house') return 'yurt';
  if (k === 'barracks') return 'hammerpick';
  if (k === 'tower') return 'tower';
  if (k === 'stable') return 'horse';
  if (k === 'blacksmith') return 'hammer';
  if (k === 'market') return 'market';
  if (k === 'pen') return 'sheep';
  if (k === 'storehouse') return 'box';
  if (k === 'mosque') return 'mosque';
  if (k === 'wonder') return 'star';
  if (k === 'wall') return 'brick';
  if (k === 'gate') return 'door';
  return 'wheat';
}

/* ================= MENU ================= */
function MenuScreen({ scores, settings, updateSettings, onPlay, onResume, onPlayCampaign }: { scores: ScoreEntry[]; settings: Settings; updateSettings: (p: Partial<Settings>) => void; onPlay: () => void; onResume: () => void; onPlayCampaign: (id: string) => void }) {
  const [showSettings, setShowSettings] = useState(false);
  const [showCamp, setShowCamp] = useState(false);
  // Устав и Зал легенд живут в одной модалке с вкладками: null — закрыта.
  const [infoTab, setInfoTab] = useState<'how' | 'scores' | null>(null);
  const difficulty = settings.difficulty;
  const clan = settings.clan ?? DEFAULT_CLAN;   // род-таңба (п.12)
  const hasSave = gameHasSave();
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // Esc закрывает попап; Enter/пробел стартуют игру, но не когда открыто
      // окно — иначе игрок, читая устав, случайно улетал бы в бой.
      if (e.key === 'Escape') { setInfoTab(null); setShowCamp(false); return; }
      if (!showSettings && !infoTab && !showCamp && (e.key === 'Enter' || e.key === ' ')) onPlay();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onPlay, showSettings, infoTab, showCamp]);
  if (showSettings) return <SettingsPanel settings={settings} updateSettings={updateSettings} onClose={() => setShowSettings(false)} />;
  return (
    <div className="parchment relative min-h-[100dvh] overflow-y-auto text-white">
      {/* ambient glows */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-32 left-1/2 h-96 w-[700px] -translate-x-1/2 rounded-full bg-amber-500/15 blur-[100px]" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-emerald-600/15 blur-[90px]" />
        <div className="absolute bottom-10 right-0 h-72 w-72 rounded-full bg-red-600/10 blur-[90px]" />
        {/* Фон — авторская плитка pattern.svg (100x100, белое кружево
            fill-opacity .7): прежняя data-URI розетка қошқар мүйіз заменена
            файлом из ассетов. Слой держим очень слабым (opacity .03 — кружево файла
            имеет fill-opacity .7, просили ещё прозрачнее): узор остаётся
            фактурой войлока, а не обоями. */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("${menuPattern}")`,
          backgroundSize: '100px 100px',
        }} />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 pb-10 pt-8 sm:pt-12">
        {/* hero art: пункты-фичи живут НА самом баннере (нижняя лента поверх арта) */}
        <div className="kz-border-bottom relative overflow-hidden rounded-3xl border border-amber-200/25 shadow-[0_20px_80px_rgba(0,0,0,.55)]">
          <img src={heroKhanate} alt="Казахское Ханство — степь, юрты и конница на рассвете" className="h-64 w-full object-cover sm:h-80" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c1410]/70 via-[#0c1410]/25 to-[#0c1410]/30" />
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-black tracking-widest text-amber-200 backdrop-blur">
            <span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-lime-400 opacity-75" /><span className="h-2 w-2 rounded-full bg-lime-400" /></span>
            ВЕЛИКАЯ СТЕПЬ • ЖИВОЕ ПОЛЕ БОЯ • 60 КАДРОВ/С
          </div>
          <div className="absolute right-3 top-3">
            <div className="anim-floaty flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/50 bg-black/50 text-amber-200 backdrop-blur"><Ico name="horse" className="h-7 w-7" /></div>
          </div>
          {/* лента пунктов игры — поверх арта, а не отдельным блоком под баннером */}
          <div className="absolute inset-x-2 bottom-2 z-10 grid grid-cols-2 gap-1.5 sm:inset-x-3 sm:grid-cols-4">
            {([
              { i: 'sheep', c: 'text-rose-200', t: 'Стада и загоны' },
              { i: 'rider', c: 'text-red-300', t: 'Конница батыров' },
              { i: 'crown', c: 'text-amber-300', t: '4 эпохи ханства' },
              { i: 'handshake', c: 'text-sky-300', t: 'Дипломатия народов' },
            ] as const).map(f => (
              <div key={f.t} className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-200/25 bg-black/15 px-2 py-2 text-[11px] font-bold text-slate-100 backdrop-blur sm:text-xs">
                <Ico name={f.i} className={`h-4 w-4 shrink-0 ${f.c}`} />{f.t}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 text-center">
          <div className="kz-divider mx-auto max-w-md text-[11px] font-black tracking-[0.35em] text-amber-300/80">
            <span className="whitespace-nowrap px-1 text-[10px] sm:text-[11px]">ЭПОХА АБЫЛАЙ ХАНА</span>
          </div>
          <h1 className="font-display mt-1 text-4xl font-black leading-tight sm:text-6xl">
            <span className="gold-text">КАЗАХСКОЕ</span> <span className="text-sky-100">ХАНСТВО</span>
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300 sm:text-[15px]">
            Паси <Ico name="sheep" /> скот в степи, дои коров в загонах, добывай <Ico name="wood" /><Ico name="food" /><Ico name="gold" /> и собирай конницу батыров.
            Развивай эпохи, веди дипломатию с народами и <b className="text-amber-200">сотри джунгарский стан</b>, пока не пала твоя орда.
          </p>
        </div>

        {/* difficulty */}
        <div className="mt-5">
          <div className="mb-2 text-center text-[11px] font-black tracking-[0.25em] text-slate-400">ВЫБЕРИ СВОЮ СУДЬБУ</div>
          <div className="grid grid-cols-3 gap-2">
            {DIFFS.map(d => (
              <button
                key={d.id}
                onClick={() => updateSettings({ difficulty: d.id })}
                className={`rounded-2xl border p-3 text-center transition active:scale-95 ${difficulty === d.id ? 'border-amber-300 bg-amber-400/15 shadow-[0_0_24px_rgba(245,158,11,.3)]' : 'panel-iron opacity-70 hover:opacity-100'}`}
              >
                <div className="flex justify-center text-amber-200"><Ico name={d.icon} className="h-7 w-7" /></div>
                <div className="font-display mt-1 text-sm font-black text-amber-100">{d.name}</div>
                <div className="mt-0.5 hidden text-[11px] leading-snug text-slate-400 sm:block">{d.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* род-таңба (п.12): пассивки рода, видно до старта */}
        <div className="mt-4">
          <div className="mb-2 text-center text-[11px] font-black tracking-[0.25em] text-slate-400">ВЫБЕРИ СВОЙ РОД</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CLANS.map(c => (
              <button
                key={c.id}
                onClick={() => updateSettings({ clan: c.id })}
                title={c.desc}
                className={`rounded-2xl border p-2.5 text-center transition active:scale-95 ${clan === c.id ? 'border-amber-300 bg-amber-400/15 shadow-[0_0_20px_rgba(245,158,11,.25)]' : 'panel-iron opacity-70 hover:opacity-100'}`}
              >
                <div className="flex justify-center text-amber-200"><Ico name={c.tamga} className="h-7 w-7" /></div>
                <div className="font-display mt-1 text-[13px] font-black text-amber-100">{c.name}</div>
                <div className="mt-0.5 text-[10px] leading-tight text-slate-400">{c.perk}</div>
              </button>
            ))}
          </div>
        </div>

        {/* play */}
        <div className="mt-5 flex flex-col items-center">
          <div className="flex items-center gap-2">
            <button onClick={onPlay} className="btn-gold group flex items-center gap-3 rounded-2xl px-8 py-4 text-lg font-black tracking-wide sm:px-10" style={{ animation: 'marquee-glow 2.4s ease-in-out infinite' }}>
              <Play className="h-6 w-6 fill-current transition-transform group-hover:scale-125" /> В ПОХОД!
            </button>
            {hasSave && (
              <button onClick={onResume} className="btn-iron flex items-center gap-2 rounded-2xl px-5 py-4 text-sm font-black text-sky-200">
                <Ico name="save" /> Продолжить
              </button>
            )}
            <button onClick={() => setShowCamp(true)} className="btn-iron flex items-center gap-2 rounded-2xl px-5 py-4 text-sm font-black text-amber-200">
              <Ico name="scroll" /> Главы истории
            </button>
            <button
              onClick={() => setShowSettings(true)}
              title="Настройки"
              className="btn-iron flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-slate-200 transition active:scale-95"
            >
              <SettingsIcon className="h-6 w-6" />
            </button>
          </div>
          <div className="mt-2 text-[11px] font-bold text-slate-500">нажми <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-slate-300">Enter</kbd> для старта • <Ico name="gear" /> — сложность, темп и эффекты • сразу в бой</div>
        </div>

        {/* Устав и Зал легенд убраны в модалку: на экране меню они занимали
            весь второй экран и оттесняли кнопку «В ПОХОД!». Теперь — две
            кнопки, а содержимое открывается поверх. */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:mx-auto sm:max-w-md">
          <button onClick={() => setInfoTab('how')}
            className="btn-iron flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[13px] font-black text-amber-100">
            <span className="text-base"><Ico name="scroll" /></span>УСТАВ КОЧЕВНИКА
          </button>
          <button onClick={() => setInfoTab('scores')}
            className="btn-iron flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[13px] font-black text-amber-100">
            <span className="text-base"><Ico name="trophy" /></span>ЗАЛ ЛЕГЕНД
            {scores.length > 0 && <b className="rounded-full bg-amber-400/25 px-1.5 text-[10px]">{scores.length}</b>}
          </button>
        </div>

        <div className="mt-6 text-center text-[11px] font-semibold text-slate-600">
          60 кадров/с • движок на Canvas • синтезированные звуки битвы • великая степь ждёт своего хана <Ico name="spark" />
        </div>
      </div>
      {/* ===== ПОПАП: ГЛАВЫ ИСТОРИИ (п.34) ===== */}
      {showCamp && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowCamp(false)}>
          <div className="max-h-[88dvh] w-full max-w-3xl overflow-y-auto rounded-3xl border-2 border-amber-400/40 bg-[#1a140c] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 text-center">
              <div className="text-xl font-black tracking-wide text-amber-200"><Ico name="scroll" className="mr-1 inline h-5 w-5" /> ГЛАВЫ ИСТОРИИ ХАНСТВА</div>
              <div className="mt-1 text-[11px] font-semibold text-slate-400">Сценарии по вехам 1465–1726: каждая глава обучает своим механикам</div>
            </div>
            <div className="space-y-3">
              {CAMPAIGNS.map((c, ci) => {
                const done = (() => { try { return !!localStorage.getItem('khanate-camp-' + c.id); } catch { return false; } })();
                return (
                  <button key={c.id} onClick={() => onPlayCampaign(c.id)}
                    className="block w-full rounded-2xl border p-4 text-left transition active:scale-[0.99] border-amber-400/25 bg-gradient-to-br from-amber-900/30 via-black/30 to-black/40 hover:border-amber-300/60">
                    <div className="flex items-center justify-between">
                      <div className="text-base font-black text-amber-100">{c.part}: {c.title} <span className="ml-1 text-xs font-bold text-slate-400">{c.years} · {c.mode === 'nomad' ? 'кочевой' : 'оседлый'}</span></div>
                      {done && <span className="rounded-full bg-lime-500/25 px-2 py-0.5 text-[10px] font-black text-lime-300">ПРОЙДЕНО</span>}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-slate-300">{c.brief}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.objs.map((o, oi) => (
                        <span key={oi} className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] font-bold text-slate-300">· {o.t}</span>
                      ))}
                    </div>
                    <div className="mt-2 text-[10px] font-bold text-amber-300/80">Глава {['I', 'II', 'III'][ci]} — играть</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 text-center">
              <button onClick={() => setShowCamp(false)} className="btn-iron rounded-xl px-5 py-2 text-xs font-black text-slate-200">Закрыть (Esc)</button>
            </div>
          </div>
        </div>
      )}
      {/* ===== ПОПАП: УСТАВ / ЗАЛ ЛЕГЕНД ===== */}
      {infoTab && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm"
          onClick={() => setInfoTab(null)}>
          <div className="kz-corners panel-iron anim-banner flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-3xl"
            onClick={e => e.stopPropagation()}>
            {/* вкладки: переключение без закрытия окна */}
            <div className="flex items-center gap-1 border-b border-amber-300/15 p-3">
              {([['how', 'scroll', 'УСТАВ КОЧЕВНИКА'], ['scores', 'trophy', 'ЗАЛ ЛЕГЕНД']] as const).map(([id, ic, label]) => (
                <button key={id} onClick={() => setInfoTab(id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-black tracking-wide transition ${
                    infoTab === id ? 'bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/40' : 'text-slate-400 hover:bg-white/5'}`}>
                  <Ico name={ic} className="h-4 w-4" /><span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{label.split(' ')[0]}</span>
                </button>
              ))}
              <button onClick={() => setInfoTab(null)}
                className="ml-1 rounded-xl px-3 py-2 text-slate-400 hover:bg-white/10"><Ico name="cross" /></button>
            </div>

            <div className="scroll-thin overflow-y-auto overscroll-contain p-4">
              {infoTab === 'how' ? (
                <>
                  <div className="space-y-2 text-xs leading-relaxed text-slate-300">
                    <HowRow n="1" t="Сарбазы уже выбраны — правый клик / касание по {i:wolf} волкам для первой крови (+{i:food} +очки)." />
                    <HowRow n="2" t="Шаруа и работницы добывают: коснись деревьев {i:wood}, ягод {i:food} или золота {i:gold}. Женщины в платках сами собирают урожай и доят коров." />
                    <HowRow n="3" t="Загон (H): построй и нажми у рабочего «{i:horse} Пасти скот» — пастух верхом гонит овец и коров на дальний выпас и обратно в загон. Пашня (F) = бесконечная еда. Склад (K) у дальней рощи — шаруа сдают добычу туда, а не в ставку." />
                    <HowRow n="4" t="Юрта (Q) для населения → Казармы (E) → Сарбазы (2) и Мергены (3). Конюшня (Z) даёт жасауылов, кузница (X) — катапульты. Мешіт-медресе (M) готовит имамов-лекарей (8)." />
                    <HowRow n="5" t="Базар (C) шлёт көпес-торговцев (0) в становища друзей — караван возит золото сам. Новая эпоха (T) даёт +силу. Барлаушы (9) идёт на связь с народами." />
                    <HowRow n="6" t="Дипломатия: шлите {i:envelope} посланников племенам — на 1/3/6 посланниках открываются бонусы (воины в дар, золото, скидки, урожай). Джунгары шлют своих: у кого больше — тот сюзерен. Победа — сжечь ставку хунтайджи!" />
                  </div>
                  <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                    <div className="rounded-xl bg-black/30 p-2 text-[11px] font-semibold text-slate-300"><span className="mb-1 flex items-center gap-1 font-black text-slate-100"><MousePointer2 className="h-3.5 w-3.5" />ПК</span>Рамка — выбор • ПКМ — приказ • WASD + колесо камера • Home — к ставке • 0-9 / QERFKMZXC / G / H / N звук / Space</div>
                    <div className="rounded-xl bg-black/30 p-2 text-[11px] font-semibold text-slate-300"><span className="mb-1 flex items-center gap-1 font-black text-slate-100"><Hand className="h-3.5 w-3.5" />Сенсор</span>Касание — выбор • касание земли — приказ • Рамка/Камера • щипковый зум • прыжок по мини-карте</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-2 text-right text-[10px] font-bold text-slate-500">локально • топ-8</div>
                  {scores.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/15 p-5 text-center text-xs text-slate-400">
                      Легенд пока нет. <b className="text-amber-200">Твоё имя может стать первым.</b><br />Победа + убийства + скорость = вечная слава.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {scores.map((s2, i) => (
                        <div key={i} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold ${i === 0 ? 'bg-amber-400/15 text-amber-200' : 'bg-white/5 text-slate-300'}`}>
                          <span className="flex w-6 justify-center">{i === 0 ? <Ico name="trophy" className="h-4 w-4 text-amber-300" /> : i === 1 ? <Ico name="medal" className="h-4 w-4 text-slate-300" /> : i === 2 ? <Ico name="medal" className="h-4 w-4 text-orange-300" /> : `${i + 1}.`}</span>
                          <span className="flex-1 truncate">{s2.name}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] ${s2.result === 'victory' ? 'bg-lime-500/20 text-lime-300' : 'bg-red-500/20 text-red-300'}`}>{s2.result === 'victory' ? 'ПОБЕДА' : 'ПАЛ'}</span>
                          <span className="tabular-nums text-amber-300">{s2.score}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-500/10 p-2 text-[11px] font-semibold text-emerald-200">
                    <Shield className="h-4 w-4 shrink-0" />Совет: волки дают еду и очки. Охоться рано, развивайся быстро, ударь до 4-й волны.
                  </div>
                  {/* Дастаны жырау (п.19) */}
                  {(() => { const dst = loadDastans(); return dst.length ? (
                    <div className="mt-3">
                      <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-amber-300/90">Дастаны жырау ({dst.length})</div>
                      <div className="max-h-40 space-y-1 overflow-y-auto scroll-thin">
                        {dst.map((d, i) => (
                          <div key={i} className="rounded-lg bg-black/30 p-2">
                            <div className="flex items-center gap-2 text-[11px] font-black text-amber-100">
                              <span className="truncate">{d.name}</span>
                              <span className="rounded bg-amber-400/20 px-1 text-[9px] text-amber-200">{d.date}</span>
                              <span className="ml-auto tabular-nums text-amber-300">{d.score}</span>
                              <button onClick={() => { try { navigator.clipboard.writeText(d.text); } catch { /* noop */ } }} className="rounded bg-white/10 px-1.5 text-[9px] font-bold text-sky-200 hover:bg-white/20">копия</button>
                            </div>
                            <div className="mt-0.5 line-clamp-2 whitespace-pre-line text-[10px] leading-snug text-slate-400">{d.text.split('\n\n')[1] ?? d.text.slice(0, 90)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null; })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* версия — левый нижний угол меню */}
      <div className="pointer-events-none fixed bottom-2 left-3 z-10 select-none text-[10px] font-semibold tracking-wide text-white/40">
        Казахское Ханство • v{GAME_VERSION}
      </div>
    </div>
  );
}
function HowRow({ n, t }: { n: string; t: string }) {
  return (
    <div className="flex gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-[11px] font-black text-amber-200">{n}</span>
      <RT t={t} />
    </div>
  );
}

/* ================= DIPLOMACY (Civilization-style) ================= */
// ── ЭКРАН ПЕРЕГОВОРОВ С ПРАВИТЕЛЕМ (в духе Civilization) ──
// Слева — большой портрет правителя в золотой раме, справа — его речь,
// настроение и список доступных действий. Снизу — попрощаться.
interface AudienceAction { key: string; label: string; desc?: string; gold?: number; danger?: boolean; disabled?: boolean; }
function LeaderAudience({ name, ruler, title, portrait, color, mood, atWar, quote, gold, actions, onAction, onClose }: {
  name: string; ruler: string; title: string; portrait: string; color: string;
  mood: string; atWar?: boolean; quote: string; gold: number;
  actions: AudienceAction[];
  onAction: (act: string) => void;
  onClose: () => void;
}) {
  const moodColor = atWar ? '#f87171' : mood === 'ДРУЖБА' ? '#4ade80' : mood === 'ВРАЖДА' || mood === 'ВОЙНА' ? '#f87171' : mood === 'НЕЙТРАЛИТЕТ' ? '#e2e8f0' : '#e0b050';
  const afford = (a: AudienceAction) => a.gold === undefined || gold >= a.gold;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-[3px] sm:p-6">
      <div className="anim-banner grid max-h-[92dvh] w-full max-w-3xl grid-cols-1 overflow-hidden rounded-2xl border border-amber-300/40 bg-gradient-to-b from-[#231a12] via-[#17130e] to-[#0e0b08] shadow-[0_0_60px_rgba(0,0,0,0.9)] sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* левая панель: портрет в раме (на мобильных — баннер вверху) */}
        <div className="relative hidden sm:block">
          <img src={portrait} alt={ruler} className="absolute inset-0 h-full w-full object-cover object-top" draggable={false} />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#17130e]" />
          <div className="pointer-events-none absolute inset-2 rounded-xl border-2 border-amber-300/30 shadow-[inset_0_0_40px_rgba(0,0,0,0.55)]" />
        </div>
        <div className="relative h-32 w-full sm:hidden">
          <img src={portrait} alt={ruler} className="h-full w-full object-cover object-top" draggable={false} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0e0b08] via-transparent to-transparent" />
          <div className="pointer-events-none absolute inset-1.5 rounded-lg border-2 border-amber-300/30" />
        </div>
        {/* правая панель: речь и действия */}
        <div className="relative flex min-h-0 flex-col p-4 sm:p-5">
          <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-slate-300 hover:bg-black/80 hover:text-amber-200" aria-label="Закрыть"><X className="h-5 w-5" /></button>

          {/* шапка: имя и настроение */}
          <div className="mb-3 pr-8">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 shrink-0 rounded-full ring-2 ring-white/20" style={{ background: color }} />
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-300/90">{name}</span>
            </div>
            <div className="font-display text-2xl font-black leading-tight text-amber-100">{title} {ruler}</div>
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-0.5 text-[10.5px] font-black tracking-wider" style={{ color: moodColor }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: moodColor }} />
              {mood}
            </div>
          </div>

          {/* речь правителя */}
          <div className="mb-3 min-h-0 overflow-y-auto scroll-thin rounded-xl border border-amber-300/15 bg-black/45 p-3">
            <p className="font-serif text-[14px] italic leading-relaxed text-slate-100">«{quote}»</p>
          </div>

          {/* действия */}
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pr-0.5">
            <div className="grid gap-1.5">
              {actions.map(a => (
                <button
                  key={a.key}
                  disabled={a.disabled || !afford(a)}
                  onClick={() => onAction(a.key)}
                  className={`group flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${
                    a.danger
                      ? 'border-red-500/30 bg-red-900/25 hover:border-red-400/70 hover:bg-red-800/40'
                      : 'border-amber-300/20 bg-amber-400/5 hover:border-amber-300/60 hover:bg-amber-400/15'
                  }`}
                >
                  <span className={`text-[13px] font-black ${a.danger ? 'text-red-100' : 'text-amber-50'}`}><RT t={a.label} /></span>
                  <span className="shrink-0 text-right text-[10px] font-semibold text-slate-400 group-hover:text-slate-300">
                    {a.gold !== undefined && !afford(a) ? <span className="text-red-400">нужно {a.gold}<Ico name="gold" /></span> : <RT t={a.desc ?? ''} />}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* попрощаться */}
          <button
            onClick={onClose}
            className="mt-3 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[12px] font-black uppercase tracking-[0.15em] text-slate-300 transition hover:border-amber-300/50 hover:bg-amber-400/10 hover:text-amber-100 active:scale-[0.99]"
          >
            <Ico name="handshake" /> Попрощаться
          </button>
        </div>
      </div>
    </div>
  );
}

function DiplomacyModal({ hud, onClose, onAudience, onEnvoy }: {
  hud: HudSnapshot;
  onClose: () => void;
  onAudience: (nid: string) => void;
  onEnvoy: (nid: string) => void;
}) {
  const relColor = (n: HudSnapshot['nations'][number]) =>
    n.atWar ? 'text-red-400' : n.rel === 'Дружба' ? 'text-emerald-300' : n.rel === 'Нейтралитет' ? 'text-slate-200' : 'text-slate-400';
  const relIcon = (n: HudSnapshot['nations'][number]) =>
    n.atWar ? 'swords' : n.rel === 'Дружба' ? 'handshake' : n.rel === 'Нейтралитет' ? 'dove' : 'question';
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="kz-corners panel-iron anim-banner max-h-[88dvh] w-full max-w-2xl overflow-y-auto scroll-thin rounded-3xl p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-display flex items-center gap-2 text-lg font-black tracking-wide text-amber-200 sm:text-xl">
            <Landmark className="h-5 w-5" /> Дипломатия
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-slate-300 hover:bg-white/20 hover:text-white" aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-[11.5px] text-slate-400">
          Народы не знают о существовании друг друга, пока не встретятся в степи — отправляйте барлаушы <Ico name="compass" /> открывать земли. Джунгар видно лишь после первого контакта.
        </p>
        {/* наш хан */}
        <div className="mb-2.5 flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-gradient-to-r from-amber-500/15 via-amber-400/5 to-transparent p-2.5">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-amber-300/40">
            <img src={PLAYER_NATION.portrait} alt={PLAYER_NATION.ruler} className="h-full w-full object-cover object-top" draggable={false} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300/80">{PLAYER_NATION.name}</div>
            <div className="truncate font-display text-[15px] font-black text-amber-100">{PLAYER_NATION.title} {PLAYER_NATION.ruler}</div>
            <div className="text-[10.5px] text-slate-400">Вы — правитель казахского народа</div>
          </div>
        </div>
        <div className="grid gap-2.5">
          {hud.nations.map(n => (
            <div key={n.id} className={`rounded-2xl border p-3 transition ${n.met ? 'border-white/10 bg-white/5' : 'border-white/5 bg-black/25 opacity-70'}`}>
              <div className="flex items-center gap-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/15">
                  {n.met ? <img src={n.portrait} alt={n.ruler} className="h-full w-full object-cover object-top" draggable={false} />
                    : <div className="flex h-full w-full items-center justify-center bg-black/40 text-2xl text-slate-600">?</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: n.color }} />
                    <span className="truncate text-[14px] font-black text-slate-100">{n.met ? n.name : 'Неизвестный народ'}</span>
                  </div>
                  <div className="text-[11px] font-bold text-amber-200/90">{n.met ? `${n.title} ${n.ruler}` : 'Правитель не встречен'}</div>
                  <div className={`mt-0.5 text-[11px] font-black ${n.met ? relColor(n) : 'text-slate-500'}`}>
                    <Ico name={relIcon(n)} /> {n.met ? n.rel : '???'}
                    {n.met && <span className="ml-2 font-medium text-slate-400"><Ico name="scales" /> сила {n.power}{n.kind === 'tribe' ? ` · лагерей ${n.camps}` : ''}</span>}
                  </div>
                  {/* РОД ВРАГА (1.0.131): джунгары тоже выходят под своей таңбой */}
                  {n.met && n.kind === 'rival' && hud?.rivalClan && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] font-black text-rose-200"
                      title={`Род джунгар «${hud.rivalClan.name}»: ${hud.rivalClan.perk}. ${hud.rivalClan.note}`}>
                      <Ico name={hud.rivalClan.tamga} className="h-4 w-4" /> род врага: {hud.rivalClan.name}
                      <span className="font-medium text-slate-400">· {hud.rivalClan.note}</span>
                    </div>
                  )}
                </div>
              </div>
              {n.met && n.kind === 'tribe' && (
                <div className="mt-2 rounded-xl border border-white/10 bg-black/25 p-2">
                  <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="flex items-center gap-1 text-[11px] font-black text-slate-200">{n.typeIcon ? <Ico name={n.typeIcon} /> : null}{n.typeLabel} народ</span>
                    {n.suzerain === 'player' && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-black text-amber-200"><Ico name="crown" /> вы сюзерен</span>}
                    {n.suzerain === 'rival' && <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-black text-red-300"><Ico name="warn" /> под джунгарами</span>}
                  </div>
                  {/* вера народа (п.31): −100 шаманизм .. +100 ислам */}
                  <div className="mb-1.5 flex items-center gap-2 text-[10.5px] font-bold">
                    <span className="text-sky-300"><Ico name="crescent" /> вера:</span>
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-black/40">
                      <div className="absolute inset-y-0 left-1/2 w-1/2 bg-sky-400/70" style={{ width: `${Math.max(0, n.faith) / 2}%` }} />
                      <div className="absolute inset-y-0 right-1/2 w-1/2 bg-red-400/60" style={{ width: `${Math.max(0, -n.faith) / 2}%` }} />
                      <div className="absolute inset-y-0 left-1/2 w-px bg-white/40" />
                    </div>
                    <span className={n.faith >= 100 ? 'text-lime-300' : 'text-slate-400'}>{n.faith >= 100 ? 'ислам' : n.faith <= -100 ? 'шаманизм' : `${n.faith > 0 ? '+' : ''}${n.faith}`}</span>
                  </div>
                  {/* шкала влияния: посланники игрока против джунгарских */}
                  <div className="mb-1.5 flex items-center gap-2 text-[10.5px] font-bold">
                    <span className="text-emerald-300"><Ico name="handshake" /> вы: {n.envoys}</span>
                    <span className="text-slate-500">против</span>
                    <span className="text-red-300"><Ico name="crescent" /> джунгары: {n.rivalEnvoys}</span>
                    {n.envoyNext > 0 && <span className="ml-auto text-slate-400">до ур.{n.envoyLevel + 1}: ещё {n.envoyNext}</span>}
                  </div>
                  {/* три уровня бонусов */}
                  <div className="mb-2 grid gap-1">
                    {n.perks.map((p, i) => {
                      const active = n.envoyLevel >= i + 1 && n.suzerain !== 'rival';
                      return (
                        <div key={i} className={`flex items-start gap-1.5 text-[10.5px] ${active ? 'text-emerald-200' : 'text-slate-500'}`}>
                          <span className="flex shrink-0 items-center font-black">{active ? <Ico name="check" className="h-3 w-3" /> : `${[1, 3, 6][i]}·`}</span>
                          <RT t={p} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <DiplBtn onClick={() => onEnvoy(n.id)} title={plainRich(`Отправить посланника (${n.envoyCost}{i:gold}) — растит влияние`)}>
                      <Ico name="envelope" /> Посланник ({n.envoyCost}<Ico name="gold" />)
                    </DiplBtn>
                    <DiplBtn onClick={() => onAudience(n.id)} title="Начать переговоры с правителем"><Ico name="speech" /> Переговоры</DiplBtn>
                  </div>
                </div>
              )}
              {n.met && n.kind !== 'tribe' && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <DiplBtn onClick={() => onAudience(n.id)} title="Начать переговоры с правителем"><Ico name="speech" /> Переговоры с правителем</DiplBtn>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function DiplBtn({ children, onClick, title, disabled, danger }: { children: React.ReactNode; onClick: () => void; title?: string; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick} title={title} disabled={disabled}
      className={`rounded-lg px-2 py-1 text-[10.5px] font-black transition active:scale-95 disabled:opacity-40 ${
        danger ? 'bg-red-600/40 text-red-100 hover:bg-red-600/70' : 'bg-white/10 text-slate-100 hover:bg-amber-400/25'
      }`}
    >{children}</button>
  );
}

/* ================= GAME OVER ================= */
// ── ЖЫРАУ (п.19): генерируемый дастан о партии ──
const DASTAN_LS = 'khanate-dastans';
function loadDastans(): { name: string; text: string; score: number; date: string; result: string }[] {
  try { return JSON.parse(localStorage.getItem(DASTAN_LS) || '[]'); } catch { return []; }
}
function genDastan(over: GameStats, heroName: string): string {
  const n = heroName.trim() || 'Хан безымянный';
  const mins = Math.max(1, Math.round(over.timeSec / 60));
  const st: string[] = [];
  st.push(`Слушайте, степь, о деяниях ${n},\nчто свершались при ветрах и при звёздах:`);
  const pool: string[] = [];
  if (over.kills > 0) pool.push(`Как волков разгонял бураны,\nон бил врагов — ${over.kills} павших в степи,\nи орлы узнали в сезон туманов:\nс таким ханом орде не пройти!`);
  if ((over.razed ?? 0) > 0) pool.push(`Лаги врагов обратились в пепел —\n${over.razed ?? 0} становищ сровнял с травой;\nо пожарищах до рек Заравшана\nпели жайлау голосом седым.`);
  if ((over.built ?? 0) > 0) pool.push(`Он поднял аул из-под ладоней:\n${over.built ?? 0} юрт и стен встало в степной тишине,\nи верблюды, доски и керегь\nпомнят руки, что строили во сне.`);
  if (over.gathered > 500) pool.push(`Стадо тучное, береке в закромах —\n${over.gathered} мешков собрала земля;\nшаруа пели в предутренних туманах,\nчто трудом сытна любая семья.`);
  if (over.age >= 2) pool.push(`Он прошёл века, как джигит перевалы:\n${over.age} эпохи легли под копыта коней,\nи бии кивали: «Вот так-то, степь наша,\nрастём мы сильнее прежних дней».`);
  if (mins > 0) pool.push(`Всю ночь у огня догорали звезды,\n${mins} кругов прошептала луна:\n«Держи народ свой, как держит караванщик\nповодья верблюда, — крепко, до утра».`);
  if (over.campTitle) pool.push(`В ${(over.campTitle ?? '').toLowerCase()} он вписал своё имя,\nкак узорщик — узор на войлоке;\nглавы истории листались ими,\nи каждая строка была в итоге.`);
  pool.push(`Тунги знамённые в небо глядят:\nдва хвоста развеваются ветер гоня;\nгде пройдёт орда — там цветёт батырский сад,\nгде сгибнется трус — там и след не храня.`);
  for (const line of over.chronicle ?? []) pool.push(`Как говорил жырау, помня былое:\n${line.replace(/^[«"]|["»]$/g, '')}.`);
  pool.push(`Пусть же степь запомнит это лето:\n${over.score} очков — вес приданого хана!\n${over.result === 'victory' ? 'Победил он — и дастан мой воспет,' : 'Пал он в бою — но жива его слава,'}\nи поют о нём кобзы и домбры седого стана.`);
  // уникальность: тасуем и берём не больше 6 строф без повторов
  for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const picked = pool.slice(0, Math.min(7, pool.length));
  return [st[0], ...picked, `Дастан сложен жырау великой степи.\nСлава ${n} — от Иртыша до Каспия!`].join('\n\n');
}

// ── ТОЙ (п.20): байга, көкпар и асык ──
function ToyModal({ onClose, act }: { onClose: () => void; act: (kind: 'baiga' | 'kokpar' | 'asyq' | 'bet', amount?: number) => boolean | void }) {
  const [tab, setTab] = useState<'pick' | 'baiga' | 'kokpar' | 'asyq'>('pick');
  const [msg, setMsg] = useState('');
  // байга
  const horses = useMemo(() => [0, 1, 2].map(i => ({ name: ['Сырттанды', 'Кулагер', 'Тарлан'][i], sp: 0.9 + Math.random() * 0.35 })), []);
  const [betOn, setBetOn] = useState(-1);
  const [race, setRace] = useState<number[]>([0, 0, 0]);
  const [racing, setRacing] = useState(false);
  // көкпар
  const [marker, setMarker] = useState(50);
  const [zone, setZone] = useState(() => 25 + Math.random() * 50);
  const [hits, setHits] = useState(0);
  const [round, setRound] = useState(0);
  // асык
  const [rolls, setRolls] = useState<{ me: number; biy: number } | null>(null);
  useEffect(() => {
    if (!racing) return;
    const id = setInterval(() => {
      setRace(prev => {
        const nxt = prev.map((v, i) => v + horses[i].sp * (3 + Math.random() * 3));
        if (nxt.every(v => v >= 100)) {
          clearInterval(id);
          setRacing(false);
          const winner = nxt.indexOf(Math.max(...nxt));
          setTimeout(() => {
            if (winner === betOn) { act('baiga', 120); setMsg('Твоя лошадь первой! Выигрыш 120 золота!'); }
            else setMsg(`Победил «${horses[winner].name}». Ставка ушла к байге...`);
          }, 250);
        }
        return nxt;
      });
    }, 120);
    return () => clearInterval(id);
  }, [racing, betOn, horses]);
  useEffect(() => {
    if (tab !== 'kokpar') return;
    const id = setInterval(() => setMarker(m => 10 + (m + 7) % 90), 70);
    return () => clearInterval(id);
  }, [tab]);
  const kokparGrab = () => {
    const inZone = marker > zone && marker < zone + 20;
    const nh = hits + (inZone ? 1 : 0);
    setHits(nh); setZone(10 + Math.random() * 70);
    if (round >= 2) {
      const total = 40 + nh * 60;
      act('kokpar', total);
      setMsg(`Туша у пиршественной чаши! ${nh}/3 точных рывков — +${total} еды`);
    } else setRound(round + 1);
  };
  const asyqPlay = () => {
    if (!act('bet', 30)) { setMsg('Нет 30 золота на асыки...'); return; }
    const me = 2 + Math.floor(Math.random() * 11), biy = 2 + Math.floor(Math.random() * 11);
    setRolls({ me, biy });
    if (me > biy) { setTimeout(() => act('asyq', 70), 400); setMsg(`${me} против ${biy} — асыки твои! +70 золота`); }
    else setMsg(`${me} против ${biy} — бий забрал кон (ставка проиграна)`);
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div className="max-h-[88dvh] overflow-y-auto scroll-thin kz-corners panel-iron w-full max-w-md rounded-3xl p-5" onClick={e => e.stopPropagation()}>
        <div className="mb-3 text-center font-display text-xl font-black tracking-wide text-amber-200">ТОЙ! <span className="text-[11px] text-slate-400">праздник между волнами</span></div>
        {tab === 'pick' && (
          <div className="grid gap-2">
            {[['baiga', 'Байга', 'Ставка 50 золота на скакуна — забег на тулпаров'], ['kokpar', 'Көкпар', 'Три рывка за тушей: поймай момент в зелёной зоне'], ['asyq', 'Асык', 'Кости против бия: ставка 30, выигрыш 70']].map(([k, t, d]) => (
              <button key={k} onClick={() => setTab(k as typeof tab)} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-left transition hover:border-amber-300/40 hover:bg-amber-400/10">
                <div className="text-[13px] font-black text-slate-100">{t}</div>
                <div className="text-[11px] text-slate-400">{d}</div>
              </button>
            ))}
            <button onClick={onClose} className="mt-1 text-[11px] font-bold text-slate-500 hover:text-slate-300">Не сегодня (Esc)</button>
          </div>
        )}
        {tab === 'baiga' && (
          <div className="space-y-2">
            {horses.map((h, i) => (
              <div key={i} className="rounded-xl bg-black/30 p-2">
                <div className="flex items-center justify-between text-[12px] font-black text-slate-100"><span>{h.name}</span>
                  <button disabled={racing} onClick={() => { if (act('bet', 50)) setBetOn(i); }} className={`rounded px-2 py-0.5 text-[10px] font-black ${betOn === i ? 'bg-amber-400/30 text-amber-200' : 'btn-iron text-slate-200'}`}>{betOn === i ? 'твоя ставка' : 'ставка 50'}</button>
                </div>
                <div className="mt-1 h-2 rounded bg-white/10"><div className="h-2 rounded bg-lime-400" style={{ width: `${Math.min(100, race[i])}%` }} /></div>
              </div>
            ))}
            <button disabled={racing || betOn < 0} onClick={() => setRacing(true)} className="btn-gold w-full rounded-xl py-2 text-sm font-black">{racing ? 'Скачка!' : 'Пускай коней!'}</button>
            <button onClick={() => setTab('pick')} className="w-full text-[11px] font-bold text-slate-500 hover:text-slate-300">назад</button>
          </div>
        )}
        {tab === 'kokpar' && (
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-300">Рывок {Math.min(round + 1, 3)}/3 · точных: {hits}</div>
            <div className="relative h-10 overflow-hidden rounded-xl bg-black/40">
              <div className="absolute inset-y-0 bg-lime-500/30" style={{ left: `${zone}%`, width: '20%' }} />
              <div className="absolute inset-y-1 w-1.5 rounded bg-amber-300" style={{ left: `${marker}%` }} />
            </div>
            <button onClick={kokparGrab} className="btn-gold w-full rounded-xl py-2 text-sm font-black">Хватай тушу!</button>
            <button onClick={() => setTab('pick')} className="w-full text-[11px] font-bold text-slate-500 hover:text-slate-300">назад</button>
          </div>
        )}
        {tab === 'asyq' && (
          <div className="space-y-2 text-center">
            <div className="text-[12px] font-bold text-slate-300">Твои кости против костей бия</div>
            <div className="flex justify-center gap-3 text-3xl font-black text-amber-200">{rolls ? <><span>{rolls.me}</span><span className="text-slate-500">:</span><span>{rolls.biy}</span></> : <span className="text-slate-500">— : —</span>}</div>
            <button onClick={asyqPlay} className="btn-gold w-full rounded-xl py-2 text-sm font-black">Бросить асыки (30 золота)</button>
            <button onClick={() => setTab('pick')} className="w-full text-[11px] font-bold text-slate-500 hover:text-slate-300">назад</button>
          </div>
        )}
        {msg && <div className="mt-3 rounded-xl bg-amber-400/15 p-2 text-center text-[12px] font-black text-amber-200">{msg}</div>}
      </div>
    </div>
  );
}

function GameOverScreen({ over, scores, name, setName, saved, onSave, onRestart, onMenu }: {
  over: GameStats; scores: ScoreEntry[]; name: string; setName: (s: string) => void; saved: boolean;
  onSave: () => void; onRestart: () => void; onMenu: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input') return;
      if (e.key.toLowerCase() === 'r' || e.key === 'Enter') onRestart();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onRestart]);
  const win = over.result === 'victory';
  const dastan = useMemo(() => genDastan(over, name), [over, name]);
  const [dastanSaved, setDastanSaved] = useState(false);
  const saveDastan = () => {
    try {
      const list = loadDastans();
      list.unshift({ name: name.trim() || 'Безымянный хан', text: dastan, score: over.score, date: new Date().toLocaleDateString(), result: over.result });
      localStorage.setItem(DASTAN_LS, JSON.stringify(list.slice(0, 12)));
      setDastanSaved(true);
    } catch { /* noop */ }
  };
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
      <div className="kz-corners panel-iron anim-banner w-full max-w-lg rounded-3xl p-6 text-center">
        <div className={`flex justify-center ${win ? 'text-amber-300' : 'text-red-400'}`}><Ico name={win ? 'crown' : 'skull'} className="h-14 w-14" /></div>
        <div className={`font-display mt-1 text-4xl font-black tracking-wide ${win ? '' : 'text-red-400'}`}>
          {win ? <span className="gold-text">ПОБЕДА!</span> : 'ПОРАЖЕНИЕ'}
        </div>
        <p className="mt-1 text-xs font-semibold text-slate-400">
          {win ? 'Ставка джунгарского хунтайджи лежит в руинах. Жырау будут слагать песни об этом дне.' : 'Ваша ханская ставка пала... но легенды возрождаются. Мгновенный реванш?'}
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-400/15 px-4 py-1.5 text-sm font-black text-amber-200">
          <Trophy className="h-4 w-4" />{over.score} очков
          <span className="text-[10px] font-bold text-slate-400">• {DIFF[over.difficulty].name} • {AGES[over.age].name}</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          <Stat icon={<Skull className="h-3.5 w-3.5" />} v={`${over.kills}`} l="Убито" />
          <Stat icon={<Castle className="h-3.5 w-3.5" />} v={`${over.razed}`} l="Снесено" />
          <Stat icon={<Axe className="h-3.5 w-3.5" />} v={`${over.gathered}`} l="Добыто" />
          <Stat icon={<Timer className="h-3.5 w-3.5" />} v={fmtTime(over.timeSec)} l="Партия" />
          <Stat icon={<Users className="h-3.5 w-3.5" />} v={`${over.peakPop ?? 0}`} l="Пик народа" />
          <Stat icon={<Swords className="h-3.5 w-3.5" />} v={`${over.peakArmy ?? 0}`} l="Пик армии" />
          <Stat icon={<Castle className="h-3.5 w-3.5" />} v={`${over.built ?? 0}`} l="Построек" />
          <Stat icon={<Crown className="h-3.5 w-3.5" />} v={`${AGES[over.age].name}`} l="Эпоха" />
        </div>
        {over.history && over.history.length > 1 && (
          <div className="mt-3 rounded-xl bg-black/30 p-2">
            <div className="mb-1 text-[10px] font-black tracking-widest text-slate-400">РОСТ АРМИИ ПО ВРЕМЕНИ</div>
            <div className="flex h-14 items-end gap-px">
              {over.history.map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-sky-700 to-sky-400" style={{ height: `${Math.max(4, (h.army / Math.max(1, over.peakArmy ?? 1)) * 100)}%` }} title={`${fmtTime(Math.round(h.t))}: армия ${h.army}`} />
              ))}
            </div>
          </div>
        )}
        {!saved ? (
          <div className="mt-4 flex gap-2">
            <input
              value={name} onChange={e => setName(e.target.value)} maxLength={14} placeholder="Имя твоей легенды..."
              className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm font-bold text-white placeholder:text-slate-600 focus:border-amber-300 focus:outline-none"
            />
            <button onClick={onSave} className="btn-gold shrink-0 rounded-xl px-4 py-2.5 text-sm font-black">СОХРАНИТЬ</button>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-lime-500/15 py-2 text-xs font-black text-lime-300">
            <Check className="h-4 w-4" />Высечено в Зале легенд!
          </div>
        )}
        {/* Дастан жырау (п.19) */}
        <div className="mt-4 rounded-2xl border border-amber-400/30 bg-gradient-to-b from-amber-900/25 to-black/30 p-3 text-left">
          <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-amber-300">Жырау сложил дастан о партии</div>
          <div className="max-h-52 overflow-y-auto scroll-thin whitespace-pre-line rounded-xl bg-black/30 p-2.5 text-[11.5px] leading-relaxed text-amber-50/90">{dastan}</div>
          <div className="mt-1.5 flex gap-1.5">
            <button onClick={saveDastan} disabled={dastanSaved} className={`flex-1 rounded-xl px-3 py-1.5 text-[11px] font-black ${dastanSaved ? 'bg-lime-500/20 text-lime-300' : 'btn-iron text-amber-200'}`}>
              {dastanSaved ? '✓ В Зале Легенд' : 'Сохранить дастан'}
            </button>
            <button onClick={() => { try { navigator.clipboard.writeText(dastan); } catch { /* noop */ } }} className="btn-iron rounded-xl px-3 py-1.5 text-[11px] font-black text-sky-200">Скопировать</button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <BigBtn onClick={onRestart}><RotateCcw className="h-4 w-4" />РЕВАНШ (R)</BigBtn>
          <MidBtn onClick={onMenu}><Home className="h-4 w-4" />Меню</MidBtn>
        </div>
        {scores.length > 0 && (
          <div className="mt-4 max-h-36 overflow-y-auto scroll-thin rounded-xl bg-black/30 p-2 text-left">
            {scores.slice(0, 5).map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded px-2 py-1 text-[11px] font-bold text-slate-300">
                <span className="w-5">{i + 1}.</span>
                <span className="flex-1 truncate">{s.name}</span>
                <span className="tabular-nums text-amber-300">{s.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function Stat({ icon, v, l }: { icon: React.ReactNode; v: string; l: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-1 py-2">
      <div className="flex items-center justify-center gap-1 text-slate-300">{icon}<span className="text-sm font-black text-white">{v}</span></div>
      <div className="text-[9px] font-black tracking-widest text-slate-500">{l.toUpperCase()}</div>
    </div>
  );
}


