'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

type ArticleJacketProps = {
  title: string;
  category: string;
  children: ReactNode;
};

export function ArticleJacket({ title, category, children }: ArticleJacketProps) {
  const separator = title.indexOf(': ');
  const jacket = useRef<HTMLElement>(null);
  const face = useRef<HTMLDivElement>(null);
  const flap = useRef<SVGSVGElement>(null);
  const gradient = useId();

  useEffect(() => {
    const cover = jacket.current;
    const paper = face.current;
    const corner = flap.current;
    if (!cover || !paper || !corner || !paper.animate) return;

    const motion = window.matchMedia(
      '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    );
    let animations: Animation[] = [];
    function flatten() {
      for (const animation of animations) animation.cancel();
      animations = [];
    }
    const lift = (event: PointerEvent) => {
      if (
        !motion.matches ||
        event.pointerType === 'touch' ||
        animations.some((animation) => animation.playState === 'running')
      )
        return;
      const heading = paper.querySelector('h1');
      if (!heading) return;
      // На тесном листе сгиб помещается в поле под последней строкой.
      const margin = paper.clientHeight - heading.offsetTop - heading.offsetHeight;
      const fullSize = corner.clientWidth;
      const size = Math.min(fullSize, (margin - 3) / 0.62);
      if (size <= 0) return;
      const flat = 'polygon(0 0, 100% 0, 100% 100%, 100% 100%, 0 100%)';
      const lifted = `polygon(0 0, 100% 0, 100% calc(100% - ${0.62 * size}px), calc(100% - ${0.77 * size}px) 100%, 0 100%)`;
      const scale = `scale(${size / fullSize})`;
      const timing: KeyframeAnimationOptions = { duration: 1720 };
      const offsets = [0, 680 / 1720, 1030 / 1720, 1];
      const frames = (property: string, rest: string, peak: string) =>
        [rest, peak, peak, rest].map((value, index) => ({
          [property]: value,
          offset: offsets[index],
          easing: 'ease-in-out',
        }));
      animations = [
        paper.animate(frames('clipPath', flat, lifted), timing),
        corner.animate(frames('transform', 'scale(0)', scale), timing),
      ];
    };
    cover.addEventListener('pointerenter', lift);
    motion.addEventListener('change', flatten);
    return () => {
      cover.removeEventListener('pointerenter', lift);
      motion.removeEventListener('change', flatten);
      flatten();
    };
  }, []);

  return (
    <header className="article-jacket" ref={jacket}>
      <div className="article-jacket-media">{children}</div>
      <div className="article-sheet">
        <div className="article-sheet-face" ref={face}>
          <span className="article-category">{category}</span>
          <h1>
            {separator < 0 ? (
              title
            ) : (
              <>
                {title.slice(0, separator + 2)}
                <em>{title.slice(separator + 2)}</em>
              </>
            )}
          </h1>
        </div>
        <svg
          ref={flap}
          className="article-sheet-fold"
          viewBox="0 0 100 100"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient
              id={gradient}
              gradientUnits="userSpaceOnUse"
              x1="33"
              y1="50"
              x2="62"
              y2="69"
            >
              <stop stopColor="rgb(var(--rm-lecture-cream))" />
              <stop offset=".45" stopColor="rgb(var(--rm-lecture-cream))" />
              <stop offset="1" stopColor="rgb(var(--rm-lecture-line))" />
            </linearGradient>
          </defs>
          <path
            d="M23 100 Q38.4 80.78 33.01 50.4 Q68.43 44.82 100 38 Z"
            fill={`url(#${gradient})`}
            stroke="rgb(var(--rm-lecture-muted) / .6)"
            strokeWidth=".55"
          />
        </svg>
      </div>
    </header>
  );
}
