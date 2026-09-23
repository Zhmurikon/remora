import type { SVGProps } from 'react';

/** Официальный знак Remora; растровый экспорт собран из мастер-SVG. */
export function FishMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" focusable="false" {...props}>
      <image href="/icons/icon-512.png" width="512" height="512" />
    </svg>
  );
}
