import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Axe, Coins, Drumstick, TreePine, Swords, Crown, Home, Castle,
  Play, Pause, RotateCcw, Volume2, VolumeX, Trophy, Shield, Skull, Timer,
  ChevronUp, Map as MapIcon, Zap, Flag, Users, MousePointer2, Keyboard, Hand, X, Check, Sparkles,
} from 'lucide-react';
import { Game, type GameStats, type HudSnapshot } from './game/engine';
import { AGES, BUILDING_DEFS, DIFF, UNIT_DEFS, type BuildingKey, type Difficulty } from './game/config';
import heroBattle from './assets/hero-battle.jpg';

type Screen = 'menu' | 'game';
interface ScoreEntry { name: string; score: number; result: string; difficulty: string; kills: number; time: number; date: string }

const LS_KEY = 'empires-dawn-highscores-v1';
function loadScores(): ScoreEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
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

const DIFFS: { id: Difficulty; name: string; desc: string; icon: string }[] = [
  { id: 'easy', name: 'Поселенец', desc: 'Спокойные набеги. Для обучения.', icon: '🌱' },
  { id: 'normal', name: 'Воевода', desc: 'Классический напор AoE. Баланс.', icon: '⚔️' },
  { id: 'hard', name: 'Завоеватель', desc: 'Беспощадные волны. Без пощады.', icon: '🔥' },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState<GameStats | null>(null);
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [showQuests, setShowQuests] = useState(true);
  const [gameId, setGameId] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const overRef = useRef<GameStats | null>(null);
  overRef.current = over;

  const startGame = useCallback((d: Difficulty) => {
    setDifficulty(d);
    setOver(null); setSaved(false); setName(''); setHud(null); setPaused(false);
    setScreen('game');
    setGameId(g => g + 1);
  }, []);

  // create / destroy engine
  useEffect(() => {
    if (screen !== 'game') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, {
      difficulty,
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
    <MenuScreen scores={scores} difficulty={difficulty} setDifficulty={setDifficulty} onPlay={() => startGame(difficulty)} />
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
          </div>

          {/* buttons */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            <div className="panel-iron hidden items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-amber-200 sm:flex">
              <Crown className="h-4 w-4" />{hud?.ageName ?? 'Тёмный век'}
            </div>
            <IconBtn onClick={() => g()?.toggleMute()} label="Звук">
              {(hud?.muted) ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
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
        </div>
      </div>

      {/* ===== SELECTION CARD (above dock) ===== */}
      {hud && hud.sel.kind !== 'none' && (
        <div className="absolute inset-x-0 bottom-[132px] z-20 flex justify-center px-2 sm:bottom-[128px]">
          <div className="panel-iron pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl px-3 py-2">
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
                  <div className="mt-1 flex gap-1">
                    <MiniBtn onClick={() => { const gm = g(); if (gm) { gm.attackArmed = true; gm.pushHud(); } }}><Flag className="h-3 w-3" />Атака-мув (G)</MiniBtn>
                    <MiniBtn onClick={() => g()?.clearSel() ?? g()?.pushHud()}>✕ Снять выбор</MiniBtn>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-xl">{bldIcon(hud.sel.bkey!)}</div>
                <div>
                  <div className="text-xs font-black text-white">{hud.sel.blabel} {(hud.sel.done ?? 1) < 1 && <span className="text-lime-300">• стройка {Math.round((hud.sel.done ?? 0) * 100)}%</span>}</div>
                  <HpMini hp={hud.sel.hp ?? 1} max={hud.sel.bmax ?? 1} />
                  {(hud.sel.queue?.length ?? 0) > 0 && (
                    <div className="mt-0.5 text-[10px] font-bold text-amber-200">
                      Обучение: {hud.sel.queue![0].label} {Math.round((hud.sel.queue![0].t / hud.sel.queue![0].total) * 100)}%{hud.sel.queue!.length > 1 && ` (+${hud.sel.queue!.length - 1})`}
                    </div>
                  )}
                  {(hud.sel.bkey === 'towncenter' || hud.sel.bkey === 'barracks') && (
                    <div className="mt-1 flex gap-1">
                      <MiniBtn onClick={() => { const gm = g(); if (gm) { gm.rallyArmed = true; gm.pushHud(); } }} active={hud.rallyArmed}><Flag className="h-3 w-3" />Сбор</MiniBtn>
                      <MiniBtn onClick={() => g()?.clearSel() ?? g()?.pushHud()}>✕</MiniBtn>
                    </div>
                  )}
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
            <div className="scroll-thin flex items-stretch gap-1.5 overflow-x-auto">
              <TrainBtn label="Крестьянин" icon="🧑‍🌾" key_="1" cost={UNIT_DEFS.villager.cost} ok={canAfford(UNIT_DEFS.villager.cost)} onClick={() => g()?.train('villager')} />
              <TrainBtn label="Ополченец" icon="🗡️" key_="2" cost={UNIT_DEFS.swordsman.cost} ok={canAfford(UNIT_DEFS.swordsman.cost)} onClick={() => g()?.train('swordsman')} />
              <TrainBtn label="Лучник" icon="🏹" key_="3" cost={UNIT_DEFS.archer.cost} ok={canAfford(UNIT_DEFS.archer.cost)} onClick={() => g()?.train('archer')} />
              <TrainBtn label="Рыцарь" icon="🐎" key_="4" cost={UNIT_DEFS.knight.cost} ok={canAfford(UNIT_DEFS.knight.cost) && (hud?.age ?? 0) >= 1} lock={(hud?.age ?? 0) < 1} onClick={() => g()?.train('knight')} />
              <div className="mx-0.5 w-px shrink-0 bg-white/10" />
              <TrainBtn label="Дом" icon="🏠" key_="Q" cost={BUILDING_DEFS.house.cost} ok={canAfford(BUILDING_DEFS.house.cost)} active={hud?.placement === 'house'} onClick={() => g()?.enterPlacement('house')} />
              <TrainBtn label="Казармы" icon="⚒️" key_="E" cost={BUILDING_DEFS.barracks.cost} ok={canAfford(BUILDING_DEFS.barracks.cost)} active={hud?.placement === 'barracks'} onClick={() => g()?.enterPlacement('barracks')} />
              <TrainBtn label="Башня" icon="🗼" key_="R" cost={BUILDING_DEFS.tower.cost} ok={canAfford(BUILDING_DEFS.tower.cost) && (hud?.age ?? 0) >= 1} lock={(hud?.age ?? 0) < 1} active={hud?.placement === 'tower'} onClick={() => g()?.enterPlacement('tower')} />
              <TrainBtn label="Ферма" icon="🌾" key_="F" cost={BUILDING_DEFS.farm.cost} ok={canAfford(BUILDING_DEFS.farm.cost)} active={hud?.placement === 'farm'} onClick={() => g()?.enterPlacement('farm')} />
              <div className="mx-0.5 w-px shrink-0 bg-white/10" />
              <button
                onClick={() => g()?.ageUp()}
                disabled={(hud?.age ?? 0) >= 3}
                className={`flex w-[86px] shrink-0 flex-col items-center justify-center rounded-xl px-2 py-1.5 text-center transition ${(hud?.ageAfford && (hud?.age ?? 0) < 3) ? 'btn-gold animate-pulse' : 'btn-iron opacity-80'} disabled:opacity-40`}
              >
                <span className="text-lg leading-none">{(hud?.age ?? 0) >= 3 ? '👑' : AGES[(hud?.age ?? 0) + 1].icon}</span>
                <span className="mt-0.5 text-[10px] font-black leading-tight">{(hud?.age ?? 0) >= 3 ? 'МАКС. ВЕК' : `Эпоха (T)`}</span>
                <span className="text-[9px] font-bold opacity-80">{hud?.ageCost}</span>
              </button>
            </div>
            {!isMobile && (
              <div className="mt-1 hidden items-center justify-center gap-3 text-[10px] font-semibold text-slate-400 sm:flex">
                <span className="flex items-center gap-1"><MousePointer2 className="h-3 w-3" />Рамка — выбор • ПКМ — приказ • Колесо — зум • камера к краю</span>
                <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" />WASD камера • 1-4 тренировка • Q/E/R/F стройка • G атака • H домой • Space пауза</span>
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
            <div className="grid grid-cols-2 gap-2">
              <MidBtn onClick={() => { setPaused(false); startGame(difficulty); }}><RotateCcw className="h-4 w-4" />Заново</MidBtn>
              <MidBtn onClick={() => { gameRef.current?.destroy(); setScreen('menu'); setPaused(false); }}><Home className="h-4 w-4" />Меню</MidBtn>
            </div>
            <MidBtn onClick={() => g()?.toggleMute()}>{hud?.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}{hud?.muted ? 'Включить звук' : 'Выключить звук'} (M)</MidBtn>
          </div>
          <ControlsRecap />
        </Overlay>
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
function MiniBtn({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={`btn-iron flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-200 ${active ? 'active text-amber-200' : ''}`}>
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
function TrainBtn({ label, icon, key_, cost, ok, onClick, active, lock }: { label: string; icon: string; key_: string; cost: { wood: number; food: number; gold: number }; ok: boolean; onClick: () => void; active?: boolean; lock?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex w-[72px] shrink-0 flex-col items-center rounded-xl border px-1 py-1.5 transition active:scale-95 ${active ? 'border-amber-300 bg-amber-400/20' : ok && !lock ? 'btn-iron' : 'border-white/5 bg-black/40 opacity-45'}`}
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
function BigBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="btn-gold flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black tracking-wide">{children}</button>;
}
function MidBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="btn-iron flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black text-slate-200">{children}</button>;
}
function ControlsRecap() {
  return (
    <div className="mt-4 grid grid-cols-2 gap-1.5 text-left text-[10.5px] font-semibold text-slate-400">
      <div className="rounded-lg bg-white/5 p-2">🖱️ <b className="text-slate-200">Выбор:</b> рамка / двойной клик по типу</div>
      <div className="rounded-lg bg-white/5 p-2">⚔️ <b className="text-slate-200">Приказ:</b> правый клик / касание цели</div>
      <div className="rounded-lg bg-white/5 p-2">⌨️ <b className="text-slate-200">Клавиши:</b> 1-4 тренировка • Q/E/R/F стройка</div>
      <div className="rounded-lg bg-white/5 p-2">📷 <b className="text-slate-200">Камера:</b> WASD • колесо • мини-карта</div>
    </div>
  );
}
function unitIcon(k: string) {
  if (k === 'villager') return '🧑‍🌾';
  if (k === 'swordsman') return '🗡️';
  if (k === 'archer') return '🏹';
  if (k === 'knight') return '🐎';
  return '❓';
}
function bldIcon(k: BuildingKey) {
  if (k === 'towncenter') return '🏰';
  if (k === 'house') return '🏠';
  if (k === 'barracks') return '⚒️';
  if (k === 'tower') return '🗼';
  return '🌾';
}

/* ================= MENU ================= */
function MenuScreen({ scores, difficulty, setDifficulty, onPlay }: { scores: ScoreEntry[]; difficulty: Difficulty; setDifficulty: (d: Difficulty) => void; onPlay: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') onPlay(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onPlay]);
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
                onClick={() => setDifficulty(d.id)}
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
          <button onClick={onPlay} className="btn-gold group flex items-center gap-3 rounded-2xl px-10 py-4 text-lg font-black tracking-wide" style={{ animation: 'marquee-glow 2.4s ease-in-out infinite' }}>
            <Play className="h-6 w-6 fill-current transition-transform group-hover:scale-125" /> В ПОХОД!
          </button>
          <div className="mt-2 text-[11px] font-bold text-slate-500">нажми <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-slate-300">Enter</kbd> для старта • сразу в бой, без загрузки</div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {/* how to play */}
          <div className="panel-iron rounded-2xl p-4">
            <div className="font-display text-sm font-black tracking-widest text-amber-200">⚔️ УСТАВ КОМАНДИРА</div>
            <div className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
              <HowRow n="1" t="Ваше ополчение уже выбрано — правый клик / касание по 🐺 волкам для первой крови (+🍖 +очки)." />
              <HowRow n="2" t="Крестьяне добывают: выбери крестьянина и коснись деревьев 🪵, ягод 🍖 или золота 🪙. Ресурсы носят в центр сами." />
              <HowRow n="3" t="Развитие: Дом (Q) для населения → Казармы (E) → штампуй Ополченцев (2) и Лучников (3). Ферма (F) = бесконечная еда." />
              <HowRow n="4" t="Новая эпоха (T) даёт +силу. Башни (R) крошат набеги. Победа — разрушить красный Городской центр!" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <div className="rounded-xl bg-black/30 p-2 text-[11px] font-semibold text-slate-300"><span className="mb-1 flex items-center gap-1 font-black text-slate-100"><MousePointer2 className="h-3.5 w-3.5" />ПК</span>Рамка — выбор • ПКМ — приказ • WASD + колесо камера • 1-4 / QERF / G / H / Space</div>
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
        </div>
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


