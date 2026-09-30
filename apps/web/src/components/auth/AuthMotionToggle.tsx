'use client';

import { useEffect, useState } from 'react';

export function AuthMotionToggle() {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncSvgMotion = () => {
      const map = document.querySelector<SVGSVGElement>('.auth-memory-map');
      if (!map) return;
      if (paused || preference.matches) map.pauseAnimations();
      else map.unpauseAnimations();
    };

    syncSvgMotion();
    preference.addEventListener('change', syncSvgMotion);
    return () => preference.removeEventListener('change', syncSvgMotion);
  }, [paused]);

  function toggleMotion() {
    setPaused((current) => {
      const next = !current;
      document.querySelector('.auth-page')?.classList.toggle('auth-motion-paused', next);
      return next;
    });
  }

  return (
    <button
      type="button"
      className="auth-motion-toggle"
      onClick={toggleMotion}
      aria-pressed={paused}
      aria-label={paused ? 'Включить фоновые анимации' : 'Остановить фоновые анимации'}
      title={paused ? 'Включить движение' : 'Остановить движение'}
    >
      <span aria-hidden="true">
        {paused ? (
          <svg viewBox="0 0 24 24">
            <path d="m8 5 11 7-11 7z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24">
            <path d="M8 6v12M16 6v12" />
          </svg>
        )}
      </span>
      <span>{paused ? 'Оживить фон' : 'Пауза'}</span>
    </button>
  );
}
