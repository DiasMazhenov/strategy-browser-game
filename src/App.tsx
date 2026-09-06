import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Axe, Coins, Drumstick, TreePine, Swords, Crown, Home, Castle,
  Play, Pause, RotateCcw, Volume2, VolumeX, Trophy, Shield, Skull, Timer,
  ChevronUp, Map as MapIcon, Zap, Flag, Users, MousePointer2, Keyboard, Hand, X, Check, Sparkles,
  Settings as SettingsIcon, Gauge, ScrollText, Lock, Clock,
} from 'lucide-react';
import { Game, type GameStats, type HudSnapshot } from './game/engine';
import { AGES, BIOMES, BUILDING_DEFS, DEFAULT_SETTINGS, DIFF, SPEED_OPTIONS, UNIT_DEFS, type BuildingKey, type Difficulty, type Settings } from './game/config';
import heroBattle from './assets/hero-battle.jpg';

type Screen = 'menu' | 'game';
interface ScoreEntry { name: string; score: number; result: string; difficulty: string; kills: number; time: number; date: string }

const LS_KEY = 'empires-dawn-highscores-v1';
const LS_SETTINGS = 'empires-dawn-settings-v1';
// версия игры — единый источник для показа в меню.
// При обновлениях поднимаем ТРЕТЬЮ цифру на 1: 1.0.008 → 1.0.009 → 1.0.010 …
export const GAME_VERSION = '1.0.018';
function loadScores(): ScoreEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function loadSettings(): Settings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
function fmtTime(s: number) {
  const m = Math.floor(s / 60), ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}
function costStr(c: { wood: number; food: number; gold: number }) {
  const p: string[] = [];
  if (c.wood) p.push(`${c.wood}🪵`);
  if (c.food) p.push(`${c.food}🍖`);
  if (c.gold) p.push(`${c.gold}🪙`);
  return p.join(' ') || 'Бесплатно';
}
const clampPct = (v: number) => Math.max(0, Math.min(1, isFinite(v) ? v : 0));

const DIFFS: { id: Difficulty; name: string; desc: string; icon: string }[] = [
  { id: 'easy', name: 'Поселенец', desc: 'Спокойные набеги. Для обучения.', icon: '🌱' },
  { id: 'normal', name: 'Воевода', desc: 'Классический напор AoE. Баланс.', icon: '⚔️' },
  { id: 'hard', name: 'Завоеватель', desc: 'Беспощадные волны. Без пощады.', icon: '🔥' },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [dockTab, setDockTab] = useState<'units' | 'build'>('units');
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState<GameStats | null>(null);
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [showQuests, setShowQuests] = useState(true);
  const [showTech, setShowTech] = useState(false);
  const [gameId, setGameId] = useState(0);
  const [loadSave, setLoadSave] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const overRef = useRef<GameStats | null>(null);
  overRef.current = over;

  const difficulty = settings.difficulty;

  // горячая клавиша досье технологий — L (рус. Д)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((k === 'l' || k === 'д') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        setShowTech(s => !s);
      }
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

  const startGame = useCallback((d?: Difficulty, resume = false) => {
    if (d) setSettings(prev => { const next = { ...prev, difficulty: d }; try { localStorage.setItem(LS_SETTINGS, JSON.stringify(next)); } catch { /* noop */ } return next; });
    setLoadSave(resume);
    setOver(null); setSaved(false); setName(''); setHud(null); setPaused(false); setShowSettings(false); setShowTech(false);
    setDockTab('units');
    setScreen('game');
    setGameId(g => g + 1);
  }, []);

  // create / destroy engine
  useEffect(() => {
    if (screen !== 'game') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, {
      settings, loadSave,
      onHud: (h) => setHud(h),
      onGameOver: (s) => {
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
    gameRef.current = game;
    game.sound.ensure();
    return () => { game.destroy(); gameRef.current = null; };
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

  if (screen === 'menu') return (
    <MenuScreen
      scores={scores} settings={settings} updateSettings={updateSettings}
      onPlay={() => startGame()}
      onResume={() => startGame(undefined, true)}
    />
  );

  const isMobile = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0c1410] text-white">
      <canvas ref={canvasRef} className="game-canvas absolute inset-0" />

      {/* ===== TOP HUD ===== */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
        <div className="flex items-start justify-between gap-2 p-2 sm:p-3">
          {/* resources */}
          <div className="panel-iron pointer-events-auto flex items-center gap-1 rounded-xl px-2 py-1.5 sm:gap-2 sm:px-3">
            <Res icon={<TreePine className="h-4 w-4 text-lime-300" />} val={hud?.wood ?? 0} />
            <Res icon={<Drumstick className="h-4 w-4 text-rose-300" />} val={hud?.food ?? 0} />
            <Res icon={<Coins className="h-4 w-4 text-yellow-300" />} val={hud?.gold ?? 0} />
            <div className="ml-1 hidden items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs font-bold sm:flex">
              <Users className="h-3.5 w-3.5 text-sky-300" />
              <span className={(hud && hud.pop >= hud.popCap) ? 'text-red-400' : 'text-white'}>{hud?.pop ?? 0}/{hud?.popCap ?? 10}</span>
            </div>
            <div className="ml-1 flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs font-bold sm:hidden">
              <Users className="h-3.5 w-3.5 text-sky-300" />{hud?.pop ?? 0}/{hud?.popCap ?? 10}
            </div>
          </div>

          {/* score / wave center */}
          <div className="panel-iron pointer-events-auto hidden flex-col items-center rounded-xl px-4 py-1.5 md:flex">
            <div className="flex items-center gap-3 text-xs font-bold">
              <span className="flex items-center gap-1 text-amber-300"><Trophy className="h-3.5 w-3.5" />{hud?.score ?? 0}</span>
              <span className="flex items-center gap-1 text-slate-300"><Timer className="h-3.5 w-3.5" />{fmtTime(hud?.timeSec ?? 0)}</span>
              <span className={`flex items-center gap-1 ${(hud?.nextWave ?? 99) <= 10 ? 'animate-pulse text-red-400' : 'text-orange-300'}`}>
                <Swords className="h-3.5 w-3.5" />Волна {hud?.wave ?? 0} → {hud?.nextWave ?? 0}с
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <TcBar label="ВЫ" hp={hud?.pTc ?? 1} max={hud?.pTcMax ?? 1} color="bg-sky-400" />
              <span className="font-display text-[10px] font-bold tracking-widest text-amber-200/80">VS</span>
              <TcBar label="ВРАГ" hp={hud?.eTc ?? 1} max={hud?.eTcMax ?? 1} color="bg-red-400" />
            </div>
            {/* дипломатия */}
            <div className="mt-1.5 flex items-center gap-2">
              {hud?.atWar ? (
                <>
                  <span className="flex items-center gap-1 text-[11px] font-black text-red-400">⚔️ ВОЙНА</span>
                  <span className="text-[10px] text-slate-300" title="Боевой дух соперника: низкий = его армия слабее">
                    дух {(hud?.morale ?? 1) < 0.85 ? <span className="text-orange-300">↓{Math.round((hud?.morale ?? 1) * 100)}%</span> : `${Math.round((hud?.morale ?? 1) * 100)}%`}
                  </span>
                  <button onClick={() => g()?.sueForPeace(false)} title="Предложить мир за 120 🪙" className="rounded bg-emerald-600/40 px-1.5 py-0.5 text-[10px] font-bold text-emerald-100 hover:bg-emerald-600/70">🕊️ Мир (120🪙)</button>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1 text-[11px] font-black text-emerald-300">🕊️ МИР</span>
                  <span className="text-[10px] text-slate-300" title="Неприязнь соперника: высокая — скоро война. Повод (casus belli) влияет на боевой дух врага">
                    неприязнь <b className={hud && hud.grievance > 55 ? 'text-red-400' : 'text-amber-300'}>{hud?.grievance ?? 0}</b>/100
                  </span>
                  <button onClick={() => g()?.bribe()} title="Отправить дары (75 🪙) — снизить неприязнь" className="rounded bg-sky-600/40 px-1.5 py-0.5 text-[10px] font-bold text-sky-100 hover:bg-sky-600/70">🤝 Дары (75🪙)</button>
                </>
              )}
              <span className="hidden text-[10px] text-slate-400 lg:inline" title="Соотношение сил: вы / соперник">⚖️{hud?.playerPow ?? 0} vs {hud?.enemyPow ?? 0}</span>
              {(hud?.relics ?? 0) > 0 && <span className="text-[11px] font-black text-amber-300" title="Реликвии дают золото каждые 10 секунд">📿 {hud?.relics}</span>}
            </div>
            {(hud?.wonderT ?? 0) > 0 && (
              <div className="mt-1 flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-black text-amber-200" title="Защитите Чудо света до конца отсчёта — это победа">
                ⭐ Чудо: {Math.floor((hud?.wonderT ?? 0) / 60)}:{String((hud?.wonderT ?? 0) % 60).padStart(2, '0')}
              </div>
            )}
          </div>

          {/* buttons */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            <div className="panel-iron hidden items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-amber-200 sm:flex">
              <Crown className="h-4 w-4" />{hud?.ageName ?? 'Тёмный век'}
            </div>
            <IconBtn onClick={() => g()?.jumpToIdleVillager()} label="Свободные крестьяне (.)">
              <span className="relative text-sm leading-none">🧑‍🌾{(hud?.idleVills ?? 0) > 0 && <span className="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-400 px-0.5 text-[8px] font-black text-black">{hud?.idleVills}</span>}</span>
            </IconBtn>
            <IconBtn onClick={() => g()?.toggleMute()} label="Звук">
              {(hud?.muted) ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </IconBtn>
            <IconBtn onClick={() => setShowTech(true)} label="Дерево технологий (L)">
              <ScrollText className="h-4 w-4" />
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
            <span className="text-amber-300">🏆{hud?.score ?? 0}</span>
            <span className="text-slate-300">{fmtTime(hud?.timeSec ?? 0)}</span>
            <span className={(hud?.nextWave ?? 99) <= 10 ? 'animate-pulse text-red-400' : 'text-orange-300'}>🌊{hud?.nextWave ?? 0}с</span>
            <span className="text-amber-200">{AGES[hud?.age ?? 0].icon}</span>
          </div>
        </div>

        {/* banner */}
        {hud?.banner && (
          <div className="mt-2 flex justify-center px-4">
            <div className="anim-banner panel-iron rounded-2xl border-amber-300/40 px-5 py-2 text-center" style={{ animation: 'marquee-glow 2s ease-in-out infinite' }}>
              <div className="font-display text-base font-black tracking-wide text-amber-200 sm:text-xl">{hud.banner.title}</div>
              <div className="text-[11px] font-semibold text-slate-300 sm:text-xs">{hud.banner.sub}</div>
            </div>
          </div>
        )}
      </div>

      {/* ===== QUESTS (left) ===== */}
      <div className="absolute left-2 top-[74px] z-20 sm:top-[86px]">
        <div className="panel-iron pointer-events-auto w-[172px] rounded-xl p-2 sm:w-[196px]">
          <button onClick={() => setShowQuests(s => !s)} className="flex w-full items-center justify-between text-[11px] font-black tracking-widest text-amber-200">
            <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" />ЗАДАНИЯ</span>
            <ChevronUp className={`h-3.5 w-3.5 transition-transform ${showQuests ? '' : 'rotate-180'}`} />
          </button>
          {showQuests && (
            <div className="mt-1.5 space-y-1">
              {hud?.quests.map(q => (
                <div key={q.id} className={`flex items-center justify-between rounded-lg px-2 py-1 text-[11px] font-semibold ${q.done ? 'bg-lime-500/15 text-lime-300' : 'bg-white/5 text-slate-200'}`}>
                  <span className="flex items-center gap-1.5">{q.done ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}{q.label}</span>
                  <span className="text-[10px] opacity-70">{q.progress}</span>
                </div>
              ))}
              <div className="rounded-lg bg-black/30 px-2 py-1 text-[10px] leading-snug text-slate-400">💡 {hud?.hint ?? ''}</div>
            </div>
          )}
        </div>
        {/* army controls */}
        <div className="pointer-events-auto mt-2 flex w-[172px] flex-col gap-1 sm:w-[196px]">
          <div className="grid grid-cols-2 gap-1">
            <MiniBtn onClick={() => g()?.armySelect()}><Swords className="h-3.5 w-3.5" />Армия</MiniBtn>
            <MiniBtn onClick={() => g()?.villsSelect()}><Axe className="h-3.5 w-3.5" />Кресты</MiniBtn>
            <MiniBtn onClick={() => g()?.idleSelect()}>Простой{(hud?.idleVills ?? 0) > 0 && <b className="ml-1 rounded bg-amber-400 px-1 text-[10px] text-black">{hud?.idleVills}</b>}</MiniBtn>
            <MiniBtn onClick={() => g()?.workIdle()}><Zap className="h-3.5 w-3.5" />Работа</MiniBtn>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <MiniBtn onClick={() => g()?.centerTC()}><MapIcon className="h-3.5 w-3.5" />Центр</MiniBtn>
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
        </div>
      </div>

      {/* ===== SELECTION CARD (above dock, grows upward) ===== */}
      {hud && hud.sel.kind !== 'none' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[236px] z-30 flex justify-center px-2 sm:bottom-[156px]">
          <div className="panel-iron scroll-thin pointer-events-auto flex max-h-[40dvh] w-[min(94vw,560px)] items-start gap-3 overflow-y-auto overscroll-contain rounded-2xl px-3 py-2">
            {hud.sel.kind === 'units' ? (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-xl">
                  {hud.sel.types?.length === 1 ? unitIcon(hud.sel.types[0].key) : <Users className="h-5 w-5 text-sky-300" />}
                </div>
                <div>
                  <div className="text-xs font-black text-white">
                    Выбрано: {hud.sel.count} • {hud.sel.types?.map(t => `${t.count} ${t.label}`).join(' · ')}
                  </div>
                  <HpMini hp={hud.sel.avgHp ?? 1} max={hud.sel.maxHp ?? 1} />
                  {(hud.sel.maxLevel ?? 1) >= 2 && (
                    <div className="mt-0.5 text-[10px] font-bold text-amber-300">
                      ⭐ Ветеран: ранг {hud.sel.maxLevel} · убийств {hud.sel.totalKills}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    <MiniBtn onClick={() => { const gm = g(); if (gm) { gm.attackArmed = true; gm.pushHud(); } }}><Flag className="h-3 w-3" />Атака-мув (G)</MiniBtn>
                    <MiniBtn onClick={() => g()?.clearSel() ?? g()?.pushHud()}>✕ Снять выбор</MiniBtn>
                  </div>
                  {!(hud.sel.types?.every(t => t.key === 'villager') || false) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="text-[9px] font-black uppercase tracking-wide text-sky-300/80">Стойка:</span>
                      <MiniBtn active={(hud.sel.stance ?? 'aggressive') === 'aggressive'} title="Преследовать врага далеко от позиции" onClick={() => g()?.setStance('aggressive')}>⚔️ Атак.</MiniBtn>
                      <MiniBtn active={(hud.sel.stance ?? '') === 'defensive'} title="Дать отпор рядом, не убегая далеко" onClick={() => g()?.setStance('defensive')}>🛡 Оборон.</MiniBtn>
                      <MiniBtn active={(hud.sel.stance ?? '') === 'stand'} title="Держать точку — не сходить с места" onClick={() => g()?.setStance('stand')}>⛳ Стоять</MiniBtn>
                      <MiniBtn active={hud.patrolArmed} title="Кликните по конечной точке маршрута — войска будут ходить между позициями (клавиша Y)" onClick={() => { const gm = g(); if (gm) { gm.patrolArmed = !gm.patrolArmed; gm.attackArmed = false; gm.pushHud(); } }}>👁 Патруль (Y)</MiniBtn>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-xl">{bldIcon(hud.sel.bkey!)}</div>
                <div className="max-w-[260px]">
                  <div className="text-xs font-black text-white">{hud.sel.blabel} {(hud.sel.done ?? 1) < 1 && <span className="text-lime-300">• стройка {Math.round((hud.sel.done ?? 0) * 100)}%</span>}</div>
                  <HpMini hp={hud.sel.hp ?? 1} max={hud.sel.bmax ?? 1} />
                  {hud.sel.research && (
                    <div className="mt-0.5 text-[10px] font-bold text-sky-300">📜 {hud.sel.research.name} {Math.round((hud.sel.research.t / hud.sel.research.total) * 100)}%</div>
                  )}
                  {(hud.sel.queue?.length ?? 0) > 0 && (
                    <div className="mt-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-black uppercase tracking-wide text-amber-300/80">Очередь:</span>
                        {hud.sel.queue!.map((q, i) => {
                          const prog = i === 0 ? clampPct(q.t / q.total) : 0;
                          return (
                            <div key={i} className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-amber-400/40 bg-black/40 text-base leading-none" title={`${q.label}${i === 0 ? ` — ${Math.round(prog * 100)}%` : ''}`}>
                              <span className={i === 0 ? '' : 'opacity-70 grayscale'}>{unitIcon(q.key)}</span>
                              {i === 0 && (
                                <span className="absolute -bottom-0.5 left-0.5 right-0.5 h-1 overflow-hidden rounded-full bg-black/60">
                                  <span className="block h-full bg-amber-400" style={{ width: `${prog * 100}%` }} />
                                </span>
                              )}
                              {i > 0 && <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[8px] font-black text-black">{i + 1}</span>}
                            </div>
                          );
                        })}
                        <button onClick={() => g()?.cancelTrain(hud.sel.bid!)} title="Отменить последнего (возврат ресурсов)" className="ml-1 rounded bg-red-500/30 px-1.5 py-0.5 text-[10px] font-bold text-red-200 hover:bg-red-500/50">✕</button>
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
                          title={`${t.name}\n${t.desc}\n${t.cost}`}
                          disabled={t.done || t.busy}
                          onClick={() => g()?.research(t.id)}
                          className={`flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[10px] font-bold transition ${t.done ? 'border-lime-400/40 bg-lime-500/15 text-lime-300' : t.available && !t.busy ? 'border-sky-400/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/30' : 'border-white/10 bg-black/30 text-slate-400'}`}
                        >
                          <span>{t.done ? '✓' : t.icon}</span>{t.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {hud.sel.bkey === 'market' && (
                    <div className="mt-1 flex gap-1">
                      <MiniBtn onClick={() => g()?.trade('wood')} title="Обмен дерева на золото">🪵→🪙 Торговля</MiniBtn>
                      <MiniBtn onClick={() => g()?.trade('food')} title="Обмен еды на золото">🍖→🪙</MiniBtn>
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(hud.sel.done ?? 1) >= 1 && (hud.sel.hp ?? 0) < (hud.sel.bmax ?? 1) - 1 && (
                      <MiniBtn onClick={() => g()?.repairBuilding(hud.sel.bid!)} title="Отправить крестьян чинить (тратит дерево)">🔧 Чинить</MiniBtn>
                    )}
                    {(hud.sel.garrisonCap ?? 0) > 0 && (
                      <>
                        <MiniBtn onClick={() => g()?.garrisonUnits(hud.sel.bid!)}>🛡 В укрытие ({hud.sel.garrison}/{hud.sel.garrisonCap})</MiniBtn>
                        {(hud.sel.garrison ?? 0) > 0 && <MiniBtn onClick={() => g()?.ungarrisonUnits(hud.sel.bid!, true)}>Выпустить</MiniBtn>}
                      </>
                    )}
                    {['towncenter', 'barracks', 'stable', 'blacksmith', 'market'].includes(hud.sel.bkey ?? '') && (
                      <MiniBtn onClick={() => { const gm = g(); if (gm) { gm.rallyArmed = true; gm.pushHud(); } }} active={hud.rallyArmed} title="Кликните по точке сбора; если это ресурс — новые крестьяне сразу идут на работу"><Flag className="h-3 w-3" />Сбор</MiniBtn>
                    )}
                    {hud.sel.bkey === 'wall' && (
                      <MiniBtn onClick={() => g()?.buildGateOnWall(hud.sel.bid!)} title="Вставить ворота вместо этого участка стены (стоимость ворот)">🚪 Ворота</MiniBtn>
                    )}
                    <MiniBtn
                      onClick={() => { const gm = g(); if (gm) gm.demolish(hud.sel.bid!); }}
                      title={hud.sel.bkey === 'towncenter' ? 'Городской центр снести нельзя' : 'Снести строение (Delete) — возврат части ресурсов'}
                    >⛏ Снести</MiniBtn>
                    <MiniBtn onClick={() => g()?.clearSel() ?? g()?.pushHud()}>✕</MiniBtn>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* placement / attack banners */}
      {hud?.placement && (
        <div className="absolute inset-x-0 bottom-[132px] z-20 flex justify-center sm:bottom-[128px]">
          <div className="anim-banner pointer-events-auto flex items-center gap-2 rounded-full border border-lime-300/50 bg-lime-950/90 px-4 py-1.5 text-xs font-bold text-lime-200">
            🏗️ Строим: {BUILDING_DEFS[hud.placement].name} — кликните по карте
            <button onClick={() => g()?.cancelPlacement()} className="rounded-full bg-white/10 p-1"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}
      {hud?.attackArmed && !hud?.placement && (
        <div className="absolute inset-x-0 bottom-[132px] z-20 flex justify-center sm:bottom-[128px]">
          <div className="anim-banner pointer-events-auto rounded-full border border-red-300/50 bg-red-950/90 px-4 py-1.5 text-xs font-bold text-red-200">
            🎯 Атака-мув готова — укажите точку набега! (Esc — отмена)
          </div>
        </div>
      )}

      {/* ===== BOTTOM DOCK ===== */}
      <div className="absolute inset-x-0 bottom-0 z-20 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-3xl px-2">
          <div className="panel-iron pointer-events-auto rounded-2xl p-2">
            {/* вкладки: Войска / Стройка */}
            <div className="mb-1.5 flex items-center gap-1.5">
              <DockTab active={dockTab === 'units'} onClick={() => setDockTab('units')} icon={<Swords className="h-3.5 w-3.5" />} label="ВОЙСКА" />
              <DockTab active={dockTab === 'build'} onClick={() => setDockTab('build')} icon={<Castle className="h-3.5 w-3.5" />} label="СТРОЙКА" />
              <div className="ml-auto">
                <button
                  onClick={() => g()?.ageUp()}
                  disabled={(hud?.age ?? 0) >= 3}
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-black transition ${(hud?.ageAfford && (hud?.age ?? 0) < 3) ? 'btn-gold animate-pulse' : 'btn-iron opacity-80'} disabled:opacity-40`}
                >
                  <span className="text-base leading-none">{(hud?.age ?? 0) >= 3 ? '👑' : AGES[(hud?.age ?? 0) + 1].icon}</span>
                  <span className="text-left leading-tight">
                    <span className="block">{(hud?.age ?? 0) >= 3 ? 'МАКС. ВЕК' : 'Эпоха (T)'}</span>
                    <span className="block text-[9px] font-bold opacity-80">{hud?.ageCost}</span>
                  </span>
                </button>
              </div>
            </div>
            <div className="scroll-thin flex items-stretch gap-1.5 overflow-x-auto">
              {dockTab === 'units' ? (
                <>
                  <TrainBtn label="Крестьянин" icon="🧑‍🌾" key_="1" cost={UNIT_DEFS.villager.cost} ok={canAfford(UNIT_DEFS.villager.cost)} tip={unitStats('villager')} onClick={() => g()?.train('villager')} />
                  <TrainBtn label="Ополченец" icon="🗡️" key_="2" cost={UNIT_DEFS.swordsman.cost} ok={canAfford(UNIT_DEFS.swordsman.cost)} tip={unitStats('swordsman')} onClick={() => g()?.train('swordsman')} />
                  <TrainBtn label="Лучник" icon="🏹" key_="3" cost={UNIT_DEFS.archer.cost} ok={canAfford(UNIT_DEFS.archer.cost)} tip={unitStats('archer')} onClick={() => g()?.train('archer')} />
                  <TrainBtn label="Рыцарь" icon="🐎" key_="4" cost={UNIT_DEFS.knight.cost} ok={canAfford(UNIT_DEFS.knight.cost) && (hud?.age ?? 0) >= 1} lock={(hud?.age ?? 0) < 1} tip={unitStats('knight')} onClick={() => g()?.train('knight')} />
                  <TrainBtn label="Копейщик" icon="🔱" key_="5" cost={UNIT_DEFS.spearman.cost} ok={canAfford(UNIT_DEFS.spearman.cost)} tip={unitStats('spearman')} onClick={() => g()?.train('spearman')} />
                  <TrainBtn label="Всадник" icon="🏇" key_="6" cost={UNIT_DEFS.cavalry.cost} ok={canAfford(UNIT_DEFS.cavalry.cost) && (hud?.age ?? 0) >= 1} lock={(hud?.age ?? 0) < 1} tip={unitStats('cavalry')} onClick={() => g()?.train('cavalry')} />
                  <TrainBtn label="Катапульта" icon="🪨" key_="7" cost={UNIT_DEFS.catapult.cost} ok={canAfford(UNIT_DEFS.catapult.cost) && (hud?.age ?? 0) >= 2} lock={(hud?.age ?? 0) < 2} tip={unitStats('catapult')} onClick={() => g()?.train('catapult')} />
                  <TrainBtn label="Монах" icon="✝️" key_="8" cost={UNIT_DEFS.monk.cost} ok={canAfford(UNIT_DEFS.monk.cost)} tip={unitStats('monk')} onClick={() => g()?.train('monk')} />
                </>
              ) : (
                <>
                  <TrainBtn label="Дом" icon="🏠" key_="Q" cost={BUILDING_DEFS.house.cost} ok={canAfford(BUILDING_DEFS.house.cost)} active={hud?.placement === 'house'} tip={bldStats('house')} onClick={() => g()?.enterPlacement('house')} />
                  <TrainBtn label="Казармы" icon="⚒️" key_="E" cost={BUILDING_DEFS.barracks.cost} ok={canAfford(BUILDING_DEFS.barracks.cost)} active={hud?.placement === 'barracks'} tip={bldStats('barracks')} onClick={() => g()?.enterPlacement('barracks')} />
                  <TrainBtn label="Башня" icon="🗼" key_="R" cost={BUILDING_DEFS.tower.cost} ok={canAfford(BUILDING_DEFS.tower.cost) && (hud?.age ?? 0) >= 1} lock={(hud?.age ?? 0) < 1} active={hud?.placement === 'tower'} tip={bldStats('tower')} onClick={() => g()?.enterPlacement('tower')} />
                  <TrainBtn label="Ферма" icon="🌾" key_="F" cost={BUILDING_DEFS.farm.cost} ok={canAfford(BUILDING_DEFS.farm.cost)} active={hud?.placement === 'farm'} tip={bldStats('farm')} onClick={() => g()?.enterPlacement('farm')} />
                  <TrainBtn label="Конюшня" icon="🐴" key_="Z" cost={BUILDING_DEFS.stable.cost} ok={canAfford(BUILDING_DEFS.stable.cost) && (hud?.age ?? 0) >= 1} lock={(hud?.age ?? 0) < 1} active={hud?.placement === 'stable'} tip={bldStats('stable')} onClick={() => g()?.enterPlacement('stable')} />
                  <TrainBtn label="Кузница" icon="🔨" key_="X" cost={BUILDING_DEFS.blacksmith.cost} ok={canAfford(BUILDING_DEFS.blacksmith.cost) && (hud?.age ?? 0) >= 2} lock={(hud?.age ?? 0) < 2} active={hud?.placement === 'blacksmith'} tip={bldStats('blacksmith')} onClick={() => g()?.enterPlacement('blacksmith')} />
                  <TrainBtn label="Рынок" icon="🏪" key_="C" cost={BUILDING_DEFS.market.cost} ok={canAfford(BUILDING_DEFS.market.cost)} active={hud?.placement === 'market'} tip={bldStats('market')} onClick={() => g()?.enterPlacement('market')} />
                  <div className="mx-0.5 w-px shrink-0 bg-white/10" />
                  <TrainBtn label="Стена" icon="🧱" key_="B" cost={BUILDING_DEFS.wall.cost} ok={canAfford(BUILDING_DEFS.wall.cost)} active={hud?.placement === 'wall'} tip={bldStats('wall')} onClick={() => g()?.enterPlacement('wall')} />
                  <TrainBtn label="Ворота" icon="🚪" key_="V" cost={BUILDING_DEFS.gate.cost} ok={canAfford(BUILDING_DEFS.gate.cost)} active={hud?.placement === 'gate'} tip={bldStats('gate')} onClick={() => g()?.enterPlacement('gate')} />
                  <TrainBtn label="Чудо света" icon="⭐" key_="W" cost={BUILDING_DEFS.wonder.cost} ok={canAfford(BUILDING_DEFS.wonder.cost) && (hud?.age ?? 0) >= 3} lock={(hud?.age ?? 0) < 3} active={hud?.placement === 'wonder'} tip={bldStats('wonder')} onClick={() => g()?.enterPlacement('wonder')} />
                </>
              )}
            </div>
            {!isMobile && (
              <div className="mt-1 hidden items-center justify-center gap-3 text-[10px] font-semibold text-slate-400 sm:flex">
                <span className="flex items-center gap-1"><MousePointer2 className="h-3 w-3" />Рамка — выбор • ПКМ — приказ • Колесо — зум • камера к краю</span>
                <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" />WASD камера • B/V стена (тянуть) • Ctrl+1..5 группа • G атака • «.» крестьянин • Space пауза</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== PAUSE ===== */}
      {paused && !over && (
        <Overlay>
          <div className="font-display text-3xl font-black tracking-wide sm:text-4xl"><span className="gold-text">ПАУЗА</span></div>
          <p className="mt-1 text-sm text-slate-400">Ваша империя ждёт вашего возвращения, повелитель.</p>
          <div className="mt-5 grid w-full gap-2">
            <BigBtn onClick={() => setPaused(false)}><Play className="h-4 w-4" />Продолжить (Space)</BigBtn>
            <MidBtn onClick={() => g()?.saveGame()}><span className="text-base">💾</span>Сохранить партию</MidBtn>
            <div className="grid grid-cols-2 gap-2">
              <MidBtn onClick={() => { setPaused(false); startGame(difficulty); }}><RotateCcw className="h-4 w-4" />Заново</MidBtn>
              <MidBtn onClick={() => { gameRef.current?.destroy(); setScreen('menu'); setPaused(false); }}><Home className="h-4 w-4" />Меню</MidBtn>
            </div>
            <MidBtn onClick={() => setShowSettings(true)}><SettingsIcon className="h-4 w-4" />Настройки</MidBtn>
            <MidBtn onClick={() => g()?.toggleMute()}>{hud?.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}{hud?.muted ? 'Включить звук' : 'Выключить звук'} (M)</MidBtn>
          </div>
          <ControlsRecap />
        </Overlay>
      )}

      {/* ===== TECH TREE DOSSIER ===== */}
      {showTech && hud && (
        <TechTreeModal hud={hud} onClose={() => setShowTech(false)} onResearch={(id) => gameRef.current?.research(id)} />
      )}

      {/* ===== SETTINGS MODAL (в игре) ===== */}
      {showSettings && (
        <SettingsPanel settings={settings} updateSettings={updateSettings} onClose={() => setShowSettings(false)} inGame />
      )}

      {/* ===== GAME OVER ===== */}
      {over && <GameOverScreen over={over} scores={scores} name={name} setName={setName} saved={saved} onSave={saveScore} onRestart={() => startGame(difficulty)} onMenu={() => { setOver(null); setScreen('menu'); }} />}
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
  return <button title={label} onClick={onClick} className="btn-iron rounded-xl p-2.5 text-slate-200">{children}</button>;
}
function MiniBtn({ children, onClick, active, onContextMenu, title }: { children: React.ReactNode; onClick: () => unknown; active?: boolean; onContextMenu?: (e: React.MouseEvent) => void; title?: string }) {
  return (
    <button title={title} onClick={onClick} onContextMenu={onContextMenu} className={`btn-iron flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-200 ${active ? 'active text-amber-200' : ''}`}>
      {children}
    </button>
  );
}
function TcBar({ label, hp, max, color }: { label: string; hp: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] font-black text-slate-400">{label}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-black/50 sm:w-20">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, (hp / max) * 100))}%` }} />
      </div>
    </div>
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
  return `${d.desc ? d.desc + '\n' : ''}❤ ${d.hp}  ⚔ ${d.atk}  ${melee ? 'ближний бой' : `🎯 дальность ${d.range}`}  👟 ${d.speed}`;
}
function bldStats(k: string): string {
  const d = BUILDING_DEFS[k as keyof typeof BUILDING_DEFS] as unknown as { hp: number; desc?: string };
  if (!d) return '';
  return `${d.desc ? d.desc + '\n' : ''}❤ ${d.hp}`;
}
function TrainBtn({ label, icon, key_, cost, ok, onClick, active, lock, tip }: { label: string; icon: string; key_: string; cost: { wood: number; food: number; gold: number }; ok: boolean; onClick: () => void; active?: boolean; lock?: boolean; tip?: string }) {
  return (
    <button
      onClick={onClick}
      title={tip}
      className={`relative flex w-[72px] shrink-0 flex-col items-center rounded-xl border px-1 py-1.5 transition active:scale-95 ${active ? 'border-amber-300 bg-amber-400/20' : ok && !lock ? 'btn-iron hover:border-amber-300/50' : 'border-white/5 bg-black/40 opacity-45'}`}
    >
      <span className="text-xl leading-none">{lock ? '🔒' : icon}</span>
      <span className="mt-0.5 text-[10px] font-black leading-none text-slate-100">{label}</span>
      <span className="mt-0.5 text-[8.5px] font-bold leading-none text-slate-400">{costStr(cost)}</span>
      <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[8px] font-black text-amber-200/90">{key_}</span>
      {!ok && !lock && <span className="absolute inset-x-2 bottom-6 h-0.5 rounded bg-red-500/70" />}
    </button>
  );
}
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="panel-iron anim-banner w-full max-w-md rounded-3xl p-6 text-center">{children}</div>
    </div>
  );
}

function DockTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-black tracking-widest transition active:scale-95 ${active ? 'btn-gold text-amber-950' : 'btn-iron text-slate-300 hover:text-white'}`}
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
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="panel-iron anim-banner max-h-[88dvh] w-full max-w-md overflow-y-auto scroll-thin rounded-3xl p-5 text-slate-100">
        <div className="mb-4 flex items-center justify-between">
          <div className="font-display flex items-center gap-2 text-lg font-black tracking-wide text-amber-100">
            <SettingsIcon className="h-5 w-5 text-amber-300" /> Настройки
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-slate-300 hover:bg-white/20"><X className="h-4 w-4" /></button>
        </div>

        {/* сложность */}
        <div className="mb-1 text-[11px] font-black tracking-widest text-slate-400">СЛОЖНОСТЬ</div>
        <div className="grid grid-cols-3 gap-2">
          {DIFFS.map(d => (
            <button
              key={d.id}
              onClick={() => updateSettings({ difficulty: d.id })}
              className={`rounded-2xl border p-2.5 text-center transition active:scale-95 ${settings.difficulty === d.id ? 'border-amber-300 bg-amber-400/15 shadow-[0_0_20px_rgba(245,158,11,.25)]' : 'border-white/10 bg-black/30 opacity-75 hover:opacity-100'}`}
            >
              <div className="text-xl">{d.icon}</div>
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
              <div className="text-lg">{bm.icon}</div>
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
              <div className="text-xs font-bold text-slate-100">🔊 Громкость фраз</div>
              <div className="text-[10px] text-slate-400">{Math.round((settings.voiceVolume ?? 0.3) * 100)}% — реплики юнитов</div>
            </div>
            <input type="range" min={0} max={1} step={0.05} value={settings.voiceVolume ?? 0.3} disabled={!settings.voices || settings.muted}
              onChange={e => updateSettings({ voiceVolume: parseFloat(e.target.value) })}
              className="h-1.5 w-28 cursor-pointer accent-amber-400" />
          </div>
          <Toggle on={settings.screenShake} onClick={() => updateSettings({ screenShake: !settings.screenShake })} label="Тряска камеры" desc="Вибрация при взрывах и разрушениях" />
          <Toggle on={settings.fogOfWar} onClick={() => updateSettings({ fogOfWar: !settings.fogOfWar })} label="Туман войны" desc="Враг скрыт вне обзора ваших войск и зданий" />
          <Toggle on={settings.dayNight} onClick={() => updateSettings({ dayNight: !settings.dayNight })} label="Смена времени суток" desc="Мягкое освещение день→ночь" />
          <Toggle on={settings.particles} onClick={() => updateSettings({ particles: !settings.particles })} label="Частицы" desc="Искры, дым, пыль из-под ног" />
          <Toggle on={settings.damageNumbers} onClick={() => updateSettings({ damageNumbers: !settings.damageNumbers })} label="Числа урона и очков" desc="Всплывающие +очки и награды" />
          <Toggle on={settings.autoPauseOnBlur} onClick={() => updateSettings({ autoPauseOnBlur: !settings.autoPauseOnBlur })} label="Авто-пауза" desc="Ставить игру на паузу при сворачивании вкладки" />
        </div>

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
      <div className="panel-iron anim-banner relative max-h-[88dvh] w-[min(94vw,820px)] overflow-y-auto scroll-thin rounded-3xl p-4 text-slate-100 sm:p-5">
        <button onClick={onClose} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Закрыть"><X className="h-5 w-5" /></button>
        <div className="mb-1 flex items-center gap-2 font-display text-lg font-black tracking-wide text-amber-200 sm:text-xl">
          <ScrollText className="h-5 w-5" /> Дерево технологий
        </div>
        <p className="mb-3 text-[11.5px] text-slate-400">Изучено {doneN} из {hud.techTree.length}. Технологии дают постоянный бонус и исследуются в указанном здании.</p>

        {/* лента эпох */}
        <div className="mb-4 flex items-center gap-1">
          {AGES.map((a, i) => (
            <div key={a.id} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 text-[11px] font-black ${i <= hud.age ? 'border-amber-300/50 bg-amber-400/10 text-amber-100' : 'border-white/10 bg-black/30 text-slate-500'}`}>
              <span>{a.icon}</span><span className="hidden sm:inline">{a.name}</span>
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
                <span>{AGES[age].icon}</span> {AGES[age].name}
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
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/30 text-2xl">{t.icon}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[13px] font-black text-slate-100">
                          {t.name}
                          {t.state === 'done' && <Check className="h-3.5 w-3.5 text-lime-400" />}
                          {t.state === 'researching' && <Clock className="h-3.5 w-3.5 animate-pulse text-sky-300" />}
                          {(t.state === 'age' || t.state === 'nobuild') && <Lock className="h-3 w-3 text-slate-500" />}
                        </div>
                        <div className="text-[11px] leading-snug text-slate-300">{t.desc}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold text-slate-400">
                          <span className="rounded bg-black/30 px-1.5 py-0.5">🏛 {t.bldName}</span>
                          <span>⏱{t.time}с</span>
                          <span className="text-amber-200/90">{t.cost}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2">
                      {t.state === 'done' && <div className="rounded-lg bg-lime-500/15 py-1 text-center text-[11px] font-black text-lime-300">✓ Изучено</div>}
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
          💡 Бонусы технологий постоянны и действуют на всю армию/экономику. Начать исследование можно также, выбрав нужное здание. Переход в новую эпоху (клавиша T) открывает сильные техи и юнитов.
        </div>
      </div>
    </div>
  );
}

function ControlsRecap() {
  return (
    <div className="mt-4 grid grid-cols-2 gap-1.5 text-left text-[10.5px] font-semibold text-slate-400">
      <div className="rounded-lg bg-white/5 p-2">🖱️ <b className="text-slate-200">Выбор:</b> рамка / двойной клик по типу</div>
      <div className="rounded-lg bg-white/5 p-2">⚔️ <b className="text-slate-200">Приказ:</b> правый клик / касание цели</div>
      <div className="rounded-lg bg-white/5 p-2">⌨️ <b className="text-slate-200">Клавиши:</b> 1-8 тренировка • Q/E/R/F/Z/X/C стройка • B/V стена/ворота (зажмите и тяните — протяжка) • W Чудо • L дерево технологий • G атака-мув • Y патруль • Ctrl/Alt+1..5 группы</div>
      <div className="rounded-lg bg-white/5 p-2">🐑 <b className="text-slate-200">Скот и дичь:</b> овцы, коровы и олени пасутся стадами и дают еду; волки и воины их вспугивают</div>
      <div className="rounded-lg bg-white/5 p-2">📿 <b className="text-slate-200">Реликвии:</b> отправьте монаха (или любого юнита) правым кликом на сияющий сундук — +золото и пассивный доход</div>
      <div className="rounded-lg bg-white/5 p-2">📷 <b className="text-slate-200">Камера:</b> WASD • колесо • мини-карта • «.» прыжок к свободному крестьянину</div>
    </div>
  );
}
function unitIcon(k: string) {
  if (k === 'villager') return '🧑‍🌾';
  if (k === 'swordsman') return '🗡️';
  if (k === 'archer') return '🏹';
  if (k === 'knight') return '🐎';
  if (k === 'spearman') return '🔱';
  if (k === 'cavalry') return '🏇';
  if (k === 'catapult') return '🪨';
  if (k === 'monk') return '✝️';
  if (k === 'sheep') return '🐑';
  if (k === 'cow') return '🐄';
  if (k === 'deer') return '🦌';
  return '❓';
}
function bldIcon(k: BuildingKey) {
  if (k === 'towncenter') return '🏰';
  if (k === 'house') return '🏠';
  if (k === 'barracks') return '⚒️';
  if (k === 'tower') return '🗼';
  if (k === 'stable') return '🐴';
  if (k === 'blacksmith') return '🔨';
  if (k === 'market') return '🏪';
  if (k === 'wonder') return '⭐';
  if (k === 'wall') return '🧱';
  if (k === 'gate') return '🚪';
  return '🌾';
}

/* ================= MENU ================= */
function MenuScreen({ scores, settings, updateSettings, onPlay, onResume }: { scores: ScoreEntry[]; settings: Settings; updateSettings: (p: Partial<Settings>) => void; onPlay: () => void; onResume: () => void }) {
  const [showSettings, setShowSettings] = useState(false);
  const difficulty = settings.difficulty;
  const hasSave = Game.hasSave();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (!showSettings && (e.key === 'Enter' || e.key === ' ')) onPlay(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onPlay, showSettings]);
  if (showSettings) return <SettingsPanel settings={settings} updateSettings={updateSettings} onClose={() => setShowSettings(false)} />;
  return (
    <div className="parchment relative min-h-[100dvh] overflow-y-auto text-white">
      {/* ambient glows */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-32 left-1/2 h-96 w-[700px] -translate-x-1/2 rounded-full bg-amber-500/15 blur-[100px]" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-emerald-600/15 blur-[90px]" />
        <div className="absolute bottom-10 right-0 h-72 w-72 rounded-full bg-red-600/10 blur-[90px]" />
        <div className="absolute inset-0 opacity-[0.13]" style={{ backgroundImage: 'linear-gradient(rgba(253,230,138,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(253,230,138,.4) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 pb-10 pt-8 sm:pt-12">
        {/* hero art */}
        <div className="relative overflow-hidden rounded-3xl border border-amber-200/25 shadow-[0_20px_80px_rgba(0,0,0,.55)]">
          <img src={heroBattle} alt="Империи на рассвете" className="h-44 w-full object-cover sm:h-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c1410] via-[#0c1410]/25 to-transparent" />
          <div className="absolute left-1/2 top-3 -translate-x-1/2">
            <div className="anim-floaty flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/50 bg-black/50 text-3xl backdrop-blur">🏰</div>
          </div>
          <div className="absolute bottom-2 left-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-black tracking-widest text-amber-200 backdrop-blur">
            <span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-lime-400 opacity-75" /><span className="h-2 w-2 rounded-full bg-lime-400" /></span>
            ЖИВОЕ ПОЛЕ БОЯ • 60 КАДРОВ/С
          </div>
          <div className="absolute bottom-2 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-slate-300 backdrop-blur">⚔️ Синие против Красных • Завоевание</div>
        </div>
        <div className="mt-3 text-center">
          <div className="text-[11px] font-black tracking-[0.35em] text-amber-300/80">МИНИ-STRATEGY В ДУХЕ AGE OF EMPIRES</div>
          <h1 className="font-display mt-1 text-4xl font-black leading-tight sm:text-6xl">
            <span className="gold-text">ИМПЕРИИ</span> <span className="text-emerald-100">РАССВЕТА</span>
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300 sm:text-[15px]">
            Добывай 🪵🍖🪙 • Собирай армию • Развивай эпохи • <b className="text-amber-200">Снеси вражеский Городской центр</b>, пока не снесли твой.
            Волки, набеги и слава ждут — веселье с первых 10 секунд, гарантируем.
          </p>
        </div>

        {/* feature strip */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { i: <Axe className="h-4 w-4 text-lime-300" />, t: 'Добыча и рост' },
            { i: <Swords className="h-4 w-4 text-red-300" />, t: 'Набеги и захват' },
            { i: <Crown className="h-4 w-4 text-amber-300" />, t: '4 эпохи власти' },
            { i: <Trophy className="h-4 w-4 text-yellow-300" />, t: 'Очки и легенды' },
          ].map((f, i) => (
            <div key={i} className="panel-iron flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-xs font-bold text-slate-200">{f.i}{f.t}</div>
          ))}
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
                <div className="text-2xl">{d.icon}</div>
                <div className="font-display mt-1 text-sm font-black text-amber-100">{d.name}</div>
                <div className="mt-0.5 hidden text-[11px] leading-snug text-slate-400 sm:block">{d.desc}</div>
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
                💾 Продолжить
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              title="Настройки"
              className="btn-iron flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-slate-200 transition active:scale-95"
            >
              <SettingsIcon className="h-6 w-6" />
            </button>
          </div>
          <div className="mt-2 text-[11px] font-bold text-slate-500">нажми <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-slate-300">Enter</kbd> для старта • ⚙️ — сложность, темп и эффекты • сразу в бой</div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {/* how to play */}
          <div className="panel-iron rounded-2xl p-4">
            <div className="font-display text-sm font-black tracking-widest text-amber-200">⚔️ УСТАВ КОМАНДИРА</div>
            <div className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
              <HowRow n="1" t="Ваше ополчение уже выбрано — правый клик / касание по 🐺 волкам для первой крови (+🍖 +очки)." />
              <HowRow n="2" t="Крестьяне добывают: выбери крестьянина и коснись деревьев 🪵, ягод 🍖 или золота 🪙. Ресурсы носят в центр сами." />
              <HowRow n="3" t="Развитие: Дом (Q) для населения → Казармы (E) → штампуй Ополченцев (2) и Лучников (3). Ферма (F) = бесконечная еда." />
              <HowRow n="4" t="Конюшня (Z) даёт всадников, кузница (X) — катапульты против стен, рынок (C) — монахов-лекарей. Копейщики (5) страшны против конницы!" />
              <HowRow n="5" t="Новая эпоха (T) даёт +силу. Башни (R) крошат набеги. Победа — разрушить красный Городской центр!" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <div className="rounded-xl bg-black/30 p-2 text-[11px] font-semibold text-slate-300"><span className="mb-1 flex items-center gap-1 font-black text-slate-100"><MousePointer2 className="h-3.5 w-3.5" />ПК</span>Рамка — выбор • ПКМ — приказ • WASD + колесо камера • 1-8 / QERFZXC / G / H / Space</div>
              <div className="rounded-xl bg-black/30 p-2 text-[11px] font-semibold text-slate-300"><span className="mb-1 flex items-center gap-1 font-black text-slate-100"><Hand className="h-3.5 w-3.5" />Сенсор</span>Касание — выбор • касание земли — приказ • Рамка/Камера • щипковый зум • прыжок по мини-карте</div>
            </div>
          </div>
          {/* highscores */}
          <div className="panel-iron rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="font-display text-sm font-black tracking-widest text-amber-200">🏆 ЗАЛ ЛЕГЕНД</div>
              <div className="text-[10px] font-bold text-slate-500">локально • топ-8</div>
            </div>
            {scores.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-white/15 p-5 text-center text-xs text-slate-400">
                Легенд пока нет. <b className="text-amber-200">Твоё имя может стать первым.</b><br />Победа + убийства + скорость = вечная слава.
              </div>
            ) : (
              <div className="mt-3 space-y-1">
                {scores.map((s, i) => (
                  <div key={i} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold ${i === 0 ? 'bg-amber-400/15 text-amber-200' : 'bg-white/5 text-slate-300'}`}>
                    <span className="w-6 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                    <span className="flex-1 truncate">{s.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${s.result === 'victory' ? 'bg-lime-500/20 text-lime-300' : 'bg-red-500/20 text-red-300'}`}>{s.result === 'victory' ? 'ПОБЕДА' : 'ПАЛ'}</span>
                    <span className="tabular-nums text-amber-300">{s.score}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-500/10 p-2 text-[11px] font-semibold text-emerald-200">
              <Shield className="h-4 w-4 shrink-0" />Совет: волки дают еду и очки. Охоться рано, развивайся быстро, ударь до 4-й волны.
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-[11px] font-semibold text-slate-600">
          60 кадров/с • движок на Canvas • синтезированные звуки битвы • без ассетов, один сочный экшен 🎇
        </div>
      </div>
      {/* версия — левый нижний угол меню */}
      <div className="pointer-events-none fixed bottom-2 left-3 z-10 select-none text-[10px] font-semibold tracking-wide text-white/40">
        Империи Рассвета • v{GAME_VERSION}
      </div>
    </div>
  );
}
function HowRow({ n, t }: { n: string; t: string }) {
  return (
    <div className="flex gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-[11px] font-black text-amber-200">{n}</span>
      <span>{t}</span>
    </div>
  );
}

/* ================= GAME OVER ================= */
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
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
      <div className="panel-iron anim-banner w-full max-w-lg rounded-3xl p-6 text-center">
        <div className="text-5xl">{win ? '👑' : '💀'}</div>
        <div className={`font-display mt-1 text-4xl font-black tracking-wide ${win ? '' : 'text-red-400'}`}>
          {win ? <span className="gold-text">ПОБЕДА!</span> : 'ПОРАЖЕНИЕ'}
        </div>
        <p className="mt-1 text-xs font-semibold text-slate-400">
          {win ? 'Вражеский Городской центр лежит в руинах. Барды будут слагать песни об этом дне.' : 'Ваш Городской центр пал... но легенды возрождаются. Мгновенный реванш?'}
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


