'use client';

import { useEffect, useRef, useState } from 'react';
import { FishMark } from '@remora/ui';
import { PublicAuthLink } from '../auth/PublicSession';

export function HomeNav() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <header className="home-header">
      <a className="home-brand" href="/" aria-label="Remora, главная">
        <FishMark />
        Remora
      </a>
      <nav className="home-desktop-nav" aria-label="Основная навигация">
        <a href="#features">Возможности</a>
        <a href="/kursy">Каталог</a>
        <a href="/podborki">Подборки</a>
        <a href="/blog">Блог</a>
        <a href="#questions">Вопросы</a>
      </nav>
      <div className="home-nav-actions">
        <PublicAuthLink />
        <a className="home-button home-button-small" href="#demo">
          Попробовать
        </a>
      </div>
      <button
        ref={toggleRef}
        className="home-menu-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="home-mobile-menu"
        aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
        onClick={() => setOpen(!open)}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d={open ? 'm6 6 12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16'} />
        </svg>
      </button>
      <nav
        id="home-mobile-menu"
        className="home-mobile-nav"
        aria-label="Мобильная навигация"
        hidden={!open}
      >
        <a href="#features" onClick={() => setOpen(false)}>
          Возможности
        </a>
        <a href="/kursy">Каталог курсов</a>
        <a href="/podborki">Подборки</a>
        <a href="/blog">Блог</a>
        <a href="#questions" onClick={() => setOpen(false)}>
          Вопросы и ответы
        </a>
        <PublicAuthLink />
        <a href="#demo" onClick={() => setOpen(false)}>
          Попробовать без регистрации
        </a>
      </nav>
    </header>
  );
}
