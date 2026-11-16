'use client';

import Image from 'next/image';
import { useRef, type PointerEvent } from 'react';

export function CatalogDrawer() {
  const card = useRef<SVGGElement>(null);

  function liftCard(event: PointerEvent<HTMLDivElement>) {
    const sheet = card.current;
    if (
      event.pointerType === 'touch' ||
      !window.matchMedia(
        '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
      ).matches ||
      !sheet ||
      sheet.getAnimations().length
    )
      return;

    // Анимация живёт до конца жеста, даже если указатель уже ушёл к строке поиска.
    const rest = 'translate(0, 0) rotate(0deg)';
    const raised = 'translate(2px, -53px) rotate(2deg)';
    sheet.animate(
      [
        { transform: rest, offset: 0, easing: 'ease-in-out' },
        {
          transform: 'translate(0, -6px) rotate(.25deg)',
          offset: 220 / 1840,
          easing: 'ease-in-out',
        },
        { transform: raised, offset: 760 / 1840 },
        { transform: raised, offset: 1180 / 1840, easing: 'ease-in-out' },
        { transform: rest, offset: 1 },
      ],
      1840,
    );
  }

  return (
    <div className="catalog-drawer" aria-hidden="true" onPointerEnter={liftCard}>
      <Image src="/lecture-demo/catalog-drawer.webp" width={380} height={288} alt="" unoptimized />
      <svg viewBox="0 0 380 288" focusable="false">
        <defs>
          <clipPath id="catalog-drawer-slot">
            <path d="M0 0H380V138L170 125 57 114 0 110Z" />
          </clipPath>
        </defs>
        <g clipPath="url(#catalog-drawer-slot)">
          <g ref={card} className="catalog-index-card">
            <path
              className="catalog-index-paper"
              d="M59 129Q59 127 61 127L70 127 73 122 101 124 104 129 169 134Q172 134 172 136L170 191 58 182Z"
            />
            <path d="M68 143v18l29 2m-27-5 6-5 6 2 7-9 6 2m11-3 52 4m-52 2 47 4m-47 2 42 4" />
          </g>
        </g>
      </svg>
    </div>
  );
}
