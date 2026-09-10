// React-обёртки над векторным набором иконок (iconset.ts).
// <Ico name="sheep"/> — одна пиктограмма; <RT t="+12 {i:wood}"/> — строка с
// токенами иконок (замена эмодзи в тексте). Иконки наследуют currentColor.
import React from 'react';
import { iconDef, iconName, parseRich } from './iconset';

// Почему у иконок «плыл» масштаб (1.0.103):
// 1. Без className иконка = 1em, а её ставили внутрь span'ов с text-[9px]…[11px]:
//    контур 24×24 ужимался до 9 px, и обводка 1.7/24 ≈ 0.6 px размывалась в кашу —
//    иконка выглядела то жирной кляксой, то пропадала. Теперь размер по умолчанию
//    не опускается ниже MIN_PX (12 px → обводка ≥ 0.85 px, читается).
// 2. Preflight Tailwind делает <svg> display:block; inline-block выставлялся только
//    в классе по умолчанию, а любой явный className (h-4 w-4) его терял — иконка
//    выпадала из строки текста и «прыгала» по вертикали. inline-block теперь всегда.
// 3. Родитель с text-sm leading-none + иконка h-6 давала строке высоту 24 px при
//    шрифте 14 px, и соседние плашки разъезжались. shrink-0 + align фикс.
const MIN_PX = 12;
export function Ico({ name, className, style, title }: {
  name: string; className?: string; style?: React.CSSProperties; title?: string;
}) {
  const def = iconDef(name);
  const sized = !!className && /\b(h-|w-|size-)/.test(className);
  const cls = ['inline-block shrink-0 align-[-0.14em]', sized ? '' : 'h-[max(1em,12px)] w-[max(1em,12px)]', className ?? '']
    .filter(Boolean).join(' ');
  return (
    <svg
      viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}
      className={cls}
      style={{ minWidth: sized ? undefined : MIN_PX, minHeight: sized ? undefined : MIN_PX, ...style }}
      fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round"
    >
      {title ? <title>{title}</title> : null}
      {def.parts.map((p, i) => (
        <path
          key={i} d={p.d}
          fill={p.f === 'cur' ? 'currentColor' : (p.f ?? 'none')}
          stroke={p.s === 'none' ? 'none' : (p.s === 'cur' ? 'currentColor' : (p.s ?? 'currentColor'))}
          strokeWidth={p.w ?? 1.7}
        />
      ))}
    </svg>
  );
}

/** строка с токенами {i:name} → текст + иконки в одну линию */
export function RT({ t, className, icoClass }: { t: string; className?: string; icoClass?: string }) {
  const segs = parseRich(t);
  return (
    <span className={className}>
      {segs.map((s, i) =>
        s.t === 'txt'
          ? <React.Fragment key={i}>{s.s}</React.Fragment>
          : <Ico key={i} name={s.n} className={icoClass ?? 'h-[max(1.05em,12px)] w-[max(1.05em,12px)] align-[-0.16em]'} />)}
    </span>
  );
}

export { iconName };
