// Карта местности (?dev=map) — прототип, чтобы выбрать глазами, как должна
// выглядеть земля: гекс-мозаикой (как сейчас в игре) или непрерывной местностью
// с гекс-сеткой поверх (как в Civ V). Местность та же самая — terrain.ts, —
// меняется только способ отрисовки.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Terrain } from './game/terrain';
import { buildField, buildFieldFrom, drawReliefTop, drawHexGridTop, reliefColor, type ReliefMode } from './game/relief';
import { Worldgen } from './game/worldgen';
import { GAME_VERSION } from './game/version';
import { WORLD } from './game/config';

const WORLD_VIEW = 620;                       // размер мини-карты в пикселях
const WORLD_PER_PX = WORLD.w / WORLD_VIEW;    // мировых единиц на пиксель мини-карты
const WIN_W = 760, WIN_H = 560;               // окно крупным планом

const LEGEND: [string, [number, number, number]][] = [
  ['глубина', reliefColor(0.02, 0.5, 0, 0.13)],
  ['вода', reliefColor(0.11, 0.5, 0, 0.13)],
  ['берег', reliefColor(0.145, 0.5, 0, 0.13)],
  ['река', reliefColor(0.5, 0.5, 0.9, 0.13)],
  ['степь', reliefColor(0.4, 0.5, 0, 0.13)],
  ['лес', reliefColor(0.4, 0.75, 0, 0.13)],
  ['сухая степь', reliefColor(0.4, 0.3, 0, 0.13)],
  ['холмы', reliefColor(0.71, 0.5, 0, 0.13)],
  ['горы', reliefColor(0.80, 0.5, 0, 0.13)],
  ['скалы/снег', reliefColor(0.88, 0.5, 0, 0.13)],
];

export default function MapDev() {
  const [seed, setSeed] = useState(() => 20250929);
  const [sea0, setSea] = useState(0.13);
  const [mode, setMode] = useState<ReliefMode>('relief');
  const [grid, setGrid] = useState(true);
  const [shade, setShade] = useState(true);
  const [perPx, setPerPx] = useState(8);
  const [water, setWater] = useState(0.30);
  const [gen, setGen] = useState<'old' | 'new'>('new');
  const [center, setCenter] = useState<[number, number]>([WORLD.w / 2, WORLD.h / 2]);
  const worldRef = useRef<HTMLCanvasElement>(null);
  const winRef = useRef<HTMLCanvasElement>(null);

  // Поля шума зависят только от сида и области — НЕ от уровня моря, режима и
  // теней. Иначе каждое движение ползунка пересчитывало бы ~100 тыс. узлов
  // фрактального шума и страница откликалась бы через секунду-две.
  const terrain = useMemo(() => new Terrain(seed), [seed]);
  const worldgen = useMemo(() => { const w = new Worldgen(seed, 0.42, 7); w.fit(water); return w; }, [seed, water]);
  const sea = gen === 'new' ? worldgen.sea : sea0;
  const classAt = useMemo(
    () => (gen === 'new' ? (x: number, y: number) => worldgen.classAt(x, y) : (x: number, y: number) => terrain.classAt(x, y)),
    [gen, worldgen, terrain]);
  const worldField = useMemo(
    () => (gen === 'new'
      ? buildFieldFrom(worldgen, 0, 0, WORLD.w, WORLD.h, WORLD_PER_PX * 2)
      : buildField(terrain, 0, 0, WORLD.w, WORLD.h, WORLD_PER_PX * 2)),
    [gen, worldgen, terrain]);
  const winKey = `${gen}|${seed}|${Math.round(center[0] / 64)}|${Math.round(center[1] / 64)}|${perPx}|${water}`;
  const winField = useMemo(() => {
    const view = { wx: center[0] - (WIN_W / 2) * perPx, wy: center[1] - (WIN_H / 2) * perPx, perPx };
    const box = [view.wx - perPx * 2, view.wy - perPx * 2, WIN_W * perPx + perPx * 4, WIN_H * perPx + perPx * 4, perPx * 2] as const;
    return gen === 'new' ? buildFieldFrom(worldgen, ...box) : buildField(terrain, ...box);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen, worldgen, terrain, winKey]);

  // ── мини-карта всего мира ──
  useEffect(() => {
    const cv = worldRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const f = worldField;
    drawReliefTop(ctx, f, { classAt }, { wx: 0, wy: 0, perPx: WORLD_PER_PX, w: WORLD_VIEW, h: WORLD_VIEW }, mode, sea, shade);
    // рамка текущего окна
    const cx = (center[0] - (WIN_W / 2) * perPx) / WORLD_PER_PX;
    const cy = (center[1] - (WIN_H / 2) * perPx) / WORLD_PER_PX;
    ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, (WIN_W * perPx) / WORLD_PER_PX, (WIN_H * perPx) / WORLD_PER_PX);
  }, [seed, sea, mode, shade, perPx, center, classAt]);

  // ── окно крупным планом ──
  useEffect(() => {
    const cv = winRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const view = { wx: center[0] - (WIN_W / 2) * perPx, wy: center[1] - (WIN_H / 2) * perPx, perPx, w: WIN_W, h: WIN_H };
    const f = winField;
    drawReliefTop(ctx, f, { classAt }, view, mode, sea, shade);
    if (grid) drawHexGridTop(ctx, view, 'rgba(255,255,255,0.20)', 1);
    // подпись масштаба
    ctx.fillStyle = '#fde68a'; ctx.font = '600 13px Inter, system-ui, sans-serif';
    ctx.fillText(`${Math.round(WIN_W * perPx)}×${Math.round(WIN_H * perPx)} мировых единиц · гекс ≈ ${(34.6 / perPx).toFixed(1)} px`, 10, WIN_H - 10);
  }, [seed, sea, mode, shade, grid, perPx, center, classAt]);

  const onWorldClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * WORLD.w;
    const y = ((e.clientY - r.top) / r.height) * WORLD.h;
    setCenter([x, y]);
  };

  const btn = (on: boolean) => ({ padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
    background: on ? '#fde68a' : '#1b2a22', color: on ? '#1a1206' : '#cbd5e1', border: '1px solid #2f4a3a', fontWeight: 600 as const });

  return (
    <div style={{ background: '#0c1410', color: '#e2e8f0', minHeight: '100vh', padding: 16, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>Карта местности <span style={{ color: '#fde68a' }}>v{GAME_VERSION}</span></h1>
      <p style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: 13 }}>
        Местность одна и та же (<code>terrain.ts</code>: высота, влажность, русла фрактальным шумом). Меняется только
        способ отрисовки: непрерывная местность против гекс-мозаики. Клик по мини-карте — переезд окна.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button style={btn(false)} onClick={() => setSeed((Math.random() * 1e9) | 0)}>новый сид</button>
        <span style={{ fontSize: 13 }}>сид <b>{seed}</b></span>
        {gen === 'old' && (
          <label style={{ fontSize: 13 }}>уровень моря
            <input type="range" min={0.03} max={0.3} step={0.005} value={sea0} onChange={(e) => setSea(+e.target.value)}
              style={{ marginLeft: 8, verticalAlign: 'middle' }} />
            <b style={{ marginLeft: 6 }}>{sea0.toFixed(3)}</b>
          </label>
        )}
        <label style={{ fontSize: 13 }}>масштаб
          <input type="range" min={3} max={40} step={1} value={perPx} onChange={(e) => setPerPx(+e.target.value)}
            style={{ marginLeft: 8, verticalAlign: 'middle' }} />
          <b style={{ marginLeft: 6 }}>{perPx} ед/px</b>
        </label>
        <span style={{ fontSize: 13 }}>генератор:</span>
        <button style={btn(gen === 'old')} onClick={() => setGen('old')}>старый (terrain.ts)</button>
        <button style={btn(gen === 'new')} onClick={() => setGen('new')}>новый (worldgen.ts)</button>
        {gen === 'new' && (
          <label style={{ fontSize: 13 }}>доля воды
            <input type="range" min={0.1} max={0.5} step={0.02} value={water} onChange={(e) => setWater(+e.target.value)}
              style={{ marginLeft: 8, verticalAlign: 'middle' }} />
            <b style={{ marginLeft: 6 }}>{(water * 100).toFixed(0)}%</b>
          </label>
        )}
        <span style={{ fontSize: 13 }}>режим:</span>
        {(['relief', 'biome', 'height'] as ReliefMode[]).map((m) => (
          <button key={m} style={btn(mode === m)} onClick={() => setMode(m)}>
            {m === 'relief' ? 'рельеф' : m === 'biome' ? 'биомы (как в игре)' : 'высоты'}
          </button>
        ))}
        <button style={btn(grid)} onClick={() => setGrid(!grid)}>гекс-сетка</button>
        <button style={btn(shade)} onClick={() => setShade(!shade)}>тени склонов</button>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>весь мир {WORLD.w}×{WORLD.h} (клик — переезд)</div>
          <canvas ref={worldRef} width={WORLD_VIEW} height={WORLD_VIEW} onClick={onWorldClick}
            style={{ border: '1px solid #2f4a3a', borderRadius: 8, cursor: 'crosshair', display: 'block' }} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>крупный план (окно)</div>
          <canvas ref={winRef} width={WIN_W} height={WIN_H}
            style={{ border: '1px solid #2f4a3a', borderRadius: 8, display: 'block' }} />
        </div>
        <div style={{ fontSize: 12 }}>
          <div style={{ color: '#94a3b8', marginBottom: 6 }}>легенда</div>
          {LEGEND.map(([name, [r, g, b]]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ width: 16, height: 12, background: `rgb(${r},${g},${b})`, border: '1px solid #2f4a3a', borderRadius: 3 }} />
              {name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
