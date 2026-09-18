import type { SVGProps } from 'react';

/** Знак остаётся читаемым в маленьком размере и наследует цвет темы. */
export function FishMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 40 28" fill="none" aria-hidden="true" {...props}>
      <path
        d="M11 14C17 4 30 4 37 11C32 22 19 24 11 14ZM11 14L3 7L5 14L3 21L11 14Z"
        fill="currentColor"
      />
      <path d="M20 7L25 3L29 7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="29" cy="12" r="2" className="fill-surface" />
      <path d="M17 16C20 18 23 18 25 17" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
