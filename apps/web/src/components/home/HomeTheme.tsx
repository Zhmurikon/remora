'use client';

import { useEffect, useState } from 'react';

export function HomeTheme() {
  const [theme, setTheme] = useState('system');
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-theme');
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    return () => {
      if (previous === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', previous);
    };
  }, [theme]);
  return (
    <label className="home-theme">
      Тема
      <select
        aria-label="Цветовая тема"
        value={theme}
        onChange={(event) => setTheme(event.target.value)}
      >
        <option value="system">Как на устройстве</option>
        <option value="light">Светлая</option>
        <option value="dark">Тёмная</option>
      </select>
    </label>
  );
}
