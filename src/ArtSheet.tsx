// Лист процедурного арта: открывается по адресу /?dev=art
//
// Зачем: править графику, не видя результата, нельзя — а посмотреть на юнита
// размером 20 пикселей в бою тоже мало что даёт. Здесь все юниты нарисованы
// крупно, в трёх фазах (покой, шаг, удар) и в обе стороны; кнопка подгружает
// PNG-спрайты, чтобы сравнить процедурный вид с готовым артом.
// Страница нужна только для работы над графикой: в основной бандл не попадает
// (main.tsx подключает её динамическим импортом).
import { useEffect, useRef, useState } from 'react';
import { drawPixelUnit, procCacheClear, procCacheSize } from './game/pixelart';
import { UNIT_DEFS, type UnitKey } from './game/config';
import { GAME_VERSION } from './game/version';

type Owner = 'player' | 'enemy' | 'neutral';
interface FakeU {
  key: UnitKey; owner: Owner; face: number; anim: number; atkAnim: number; state: string;
  walk?: boolean; level?: number; fmode?: 0 | 1 | 2; herder?: boolean;
}

const COLS = 4;                 // покой • шаг • удар • влево
// Масштаб переключается: ×1 — как в бою, ×3 и ×6 — чтобы разглядеть проработку.
const ZOOMS = [1, 3, 6];
const cellFor = (z: number) => Math.round(70 + 46 * z);   // ширина ячейки
const ROW = 44;                 // подпись под ячейкой

const KEYS = Object.keys(UNIT_DEFS) as UnitKey[];

// покой / шаг / удар / разворот — те же состояния, что рисует бой
const variants: ((k: UnitKey, o: Owner) => FakeU)[] = [
  (k, o) => ({ key: k, owner: o, face: 1, anim: 0, atkAnim: 0, state: 'idle', walk: false }),
  (k, o) => ({ key: k, owner: o, face: 1, anim: 1.2, atkAnim: 0, state: 'move', walk: true }),
  (k, o) => ({ key: k, owner: o, face: 1, anim: 0, atkAnim: 0.85, state: 'attack', walk: false }),
  (k, o) => ({ key: k, owner: o, face: -1, anim: 0, atkAnim: 0, state: 'idle', walk: false }),
];

export default function ArtSheet() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [owner, setOwner] = useState<Owner>('player');
  const [art, setArt] = useState(false);          // подгружены ли PNG-спрайты
  const [zoom, setZoom] = useState(6);            // масштаб предпросмотра
  const [info, setInfo] = useState('');

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const CELL = cellFor(zoom);
    const w = COLS * CELL + 16;
    const h = KEYS.length * (CELL + ROW) + 16;
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0c1410'; ctx.fillRect(0, 0, w, h);

    KEYS.forEach((k, i) => {
      const top = 8 + i * (CELL + ROW);
      // подложка клетки — чтобы видеть границы кадра
      for (let c = 0; c < COLS; c++) {
        ctx.fillStyle = (i + c) % 2 ? '#132019' : '#0f1a15';
        ctx.fillRect(8 + c * CELL, top, CELL - 4, CELL - 4);
      }
      variants.forEach((mk, c) => {
        const u = mk(k, owner);
        const cx = 8 + c * CELL + (CELL - 4) / 2;
        const cy = top + CELL - 26;               // земля чуть выше низа ячейки
        drawPixelUnit(ctx, u as never, cx, cy, 0, false, 0, zoom);
        // Лист статичный и каждый кадр уникален: кэш только копит мегабайты
        // (при ×6 черновик одного юнита — несколько мегабайт), поэтому после
        // каждого кадра его сбрасываем. В бою кэш, наоборот, включён на полную.
        if (zoom >= 3) procCacheClear();
      });
      ctx.fillStyle = '#fde68a';
      ctx.font = '600 15px Inter, system-ui, sans-serif';
      ctx.fillText(`${UNIT_DEFS[k]?.name ?? k}  (${k})`, 10, top + CELL + 20);
    });
    setInfo(`юнитов: ${KEYS.length} • кадров: ${KEYS.length * COLS} • масштаб ×${zoom}`
      + (zoom >= 3 ? ' • кэш сбрасывается (кадры уникальны)' : ` • в кэше: ${procCacheSize()}`));
  }, [owner, art, zoom]);

  const loadArt = async () => {
    setInfo('грузим PNG-спрайты…');
    // движок подтягивается отдельным чанком: на этой странице он нужен только
    // затем, чтобы прогреть спрайты (warmGameSprites)
    const m = await import('./game/engine');
    m.warmGameSprites();
    setTimeout(() => setArt(a => !a), 2500);
  };

  return (
    <div className="min-h-[100dvh] bg-[#0c1410] p-4 text-slate-200">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <b className="font-display text-lg text-amber-200">Лист процедурного арта</b>
        <span className="rounded-md bg-amber-400/20 px-2 py-0.5 text-[12px] font-bold text-amber-200">v{GAME_VERSION}</span>
        <span className="text-[12px] text-slate-400">{info}</span>
        <div className="ml-auto flex gap-2">
          {ZOOMS.map(z => (
            <button key={z} onClick={() => setZoom(z)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${z === zoom ? 'bg-amber-400 text-black' : 'bg-white/10 text-slate-200'}`}>
              ×{z}
            </button>
          ))}
          {(['player', 'enemy', 'neutral'] as Owner[]).map(o => (
            <button key={o} onClick={() => setOwner(o)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${o === owner ? 'bg-amber-400 text-black' : 'bg-white/10 text-slate-200'}`}>
              {o === 'player' ? 'Казахи' : o === 'enemy' ? 'Джунгары' : 'Нейтралы'}
            </button>
          ))}
          <button onClick={loadArt}
            className="rounded-lg bg-sky-500/25 px-3 py-1.5 text-[12px] font-bold text-sky-100">
            {art ? 'Перерисовать' : 'Показать PNG-арт'}
          </button>
        </div>
      </div>
      <div className="max-h-[calc(100dvh-90px)] overflow-auto rounded-xl border border-white/10">
        <canvas ref={ref} className="block" />
      </div>
      <p className="mt-2 text-[12px] text-slate-500">
        Колонки: покой • шаг • удар • разворот влево. Кнопка «Показать PNG-арт» подгружает
        настоящие спрайты — там, где они есть, процедурный рисунок заменится готовым кадром.
      </p>
    </div>
  );
}
