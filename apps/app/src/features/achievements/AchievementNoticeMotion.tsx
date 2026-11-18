import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { startAchievementMotion } from './achievement-motion';
import type { AchievementMotionVariant } from './achievement-motion';
import './achievement-motion.css';

function Seal() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="m6 12 4 4 8-9" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function AchievementNoticeMotion({
  children,
  artwork,
}: {
  children: ReactNode;
  artwork: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  // Новый выбор только для новой порции наград, а не при обновлении query или темы.
  const [variant] = useState<AchievementMotionVariant>(() => (Math.random() < 0.5 ? 'b' : 'c'));
  useLayoutEffect(() => startAchievementMotion(root.current!, variant), [variant]);

  return (
    <div ref={root} className="achievement-motion" data-motion-variant={variant}>
      {children}
      <div className="achievement-motion-effects" aria-hidden="true">
        {variant === 'b' ? (
          <div className="achievement-motion-envelope">
            <div className="achievement-motion-back" />
            <div className="achievement-motion-ticket">
              <img src={artwork} width={138} height={138} alt="" />
            </div>
            <div className="achievement-motion-front" />
            <div className="achievement-motion-flap" />
            <div className="achievement-motion-seal">
              <Seal />
            </div>
          </div>
        ) : (
          <>
            {[1, 2, 3].map((index) => (
              <div
                key={index}
                className={`achievement-motion-paper achievement-motion-deck-${index}`}
              >
                {index === 3 && <img src={artwork} width={80} height={80} alt="" />}
              </div>
            ))}
            <div className="achievement-motion-stamp">
              <Seal />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
