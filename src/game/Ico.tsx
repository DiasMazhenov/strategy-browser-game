// React-обёртки над векторным набором иконок (iconset.ts).
// <Ico name="sheep"/> — одна пиктограмма; <RT t="+12 {i:wood}"/> — строка с
// токенами иконок (замена эмодзи в тексте). Иконки наследуют currentColor.
import React from 'react';
import { iconDef, iconName, parseRich } from './iconset';

export function Ico({ name, className, style, title }: {
  name: string; className?: string; style?: React.CSSProperties; title?: string;
}) {
  const def = iconDef(name);
  return (
    <svg
      viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}
      className={className ?? 'inline-block h-[1em] w-[1em] align-[-0.14em]'}
      style={style} fill="none" stroke="currentColor" strokeWidth={1.7}
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
          : <Ico key={i} name={s.n} className={icoClass ?? 'inline-block h-[1.05em] w-[1.05em] align-[-0.16em]'} />)}
    </span>
  );
}

export { iconName };
