import { Button, FishMark } from '@remora/ui';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../features/auth/auth-store';
import { api, clearAccessToken } from '../lib/api';

const navigation = [
  { to: '/', label: 'Главная', icon: 'home', end: true },
  {
    to: '/materials',
    label: 'Материалы',
    icon: 'materials',
    matches: ['/materials', '/sets', '/courses', '/library'],
  },
  { to: '/practice', label: 'Практика', icon: 'practice' },
  { to: '/achievements', label: 'Достижения', icon: 'achievement' },
  { to: '/settings', label: 'Настройки', icon: 'settings' },
];

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const becomeGuest = useAuthStore((state) => state.becomeGuest);

  async function logout() {
    setLoggingOut(true);
    try {
      await api.POST('/api/v1/auth/logout');
    } finally {
      clearAccessToken();
      becomeGuest();
    }
  }

  const name = user?.display_name || user?.username || 'Пользователь';

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <header className="border-border bg-surface sticky top-0 z-30 flex h-16 items-center justify-between border-b px-4 lg:hidden">
        <Brand />
        <button
          type="button"
          className="hover:bg-surface-muted grid h-11 w-11 place-items-center rounded-xl text-2xl"
          aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? '×' : '☰'}
        </button>
      </header>

      <aside
        className={`${menuOpen ? 'flex' : 'hidden'} border-border bg-surface fixed inset-x-0 bottom-0 top-16 z-20 flex-col border-r p-5 lg:sticky lg:top-0 lg:flex lg:h-dvh`}
      >
        <div className="hidden px-2 py-2 lg:block">
          <Brand />
        </div>
        <nav className="mt-5 space-y-1" aria-label="Основная навигация">
          {navigation.map(({ to, label, icon, end, matches }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => {
                const selected =
                  isActive || matches?.some((path) => location.pathname.startsWith(path));
                return `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${selected ? 'bg-primary-subtle text-primary' : 'text-fg-muted hover:bg-surface-muted hover:text-fg'}`;
              }}
            >
              <NavigationIcon name={icon} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-border mt-auto border-t pt-5">
          <div className="mb-4 flex min-w-0 items-center gap-3 px-2">
            <span className="bg-accent-subtle text-accent grid h-10 w-10 shrink-0 place-items-center rounded-full font-semibold">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="text-fg-subtle truncate text-xs">{user?.email}</p>
            </div>
          </div>
          <ThemeToggle />
          <Button variant="ghost" fullWidth loading={loggingOut} onClick={() => void logout()}>
            Выйти
          </Button>
        </div>
      </aside>

      <main
        className={`min-w-0 ${isMaterialsPath(location.pathname) ? '' : 'px-5 py-8 sm:px-8 lg:px-12 lg:py-10'}`}
      >
        <div className={isMaterialsPath(location.pathname) ? '' : 'mx-auto max-w-6xl'}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 font-semibold tracking-tight">
      <FishMark className="h-9 w-9 shrink-0" />
      <span className="text-xl">Remora</span>
    </div>
  );
}

type ThemeChoice = 'system' | 'light' | 'dark';

function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeChoice>(readThemeChoice);

  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('remora:theme', theme);
    } catch {
      // Тема остаётся рабочей, даже если браузер запретил локальное хранилище.
    }
  }, [theme]);

  const next: Record<ThemeChoice, ThemeChoice> = {
    system: 'dark',
    dark: 'light',
    light: 'system',
  };
  const labels: Record<ThemeChoice, string> = {
    system: 'Тема: системная',
    dark: 'Тема: тёмная',
    light: 'Тема: светлая',
  };

  return (
    <button
      type="button"
      onClick={() => setTheme(next[theme])}
      className="text-fg-muted hover:bg-surface-muted hover:text-fg mb-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M20 15.2A8 8 0 0 1 8.8 4a7.5 7.5 0 1 0 11.2 11.2Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {labels[theme]}
    </button>
  );
}

function readThemeChoice(): ThemeChoice {
  try {
    const saved = window.localStorage.getItem('remora:theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Системная тема безопасна как резервный вариант.
  }
  return 'system';
}

function isMaterialsPath(pathname: string) {
  return ['/materials', '/sets', '/courses', '/library'].some((path) => pathname === path);
}

function NavigationIcon({ name }: { name: string }) {
  const common = 'h-5 w-5 shrink-0';
  if (name === 'home') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === 'materials') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M5 4.5h10.5A2.5 2.5 0 0 1 18 7v13H7.5A2.5 2.5 0 0 1 5 17.5v-13Zm0 13A2.5 2.5 0 0 1 7.5 15H18M9 8h5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === 'practice') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="m7 10 2 2-2 2m5 0h5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === 'achievement') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="m12 3 2.4 4.8 5.3.8-3.8 3.7.9 5.3-4.8-2.5-4.8 2.5.9-5.3L4.3 8.6l5.3-.8L12 3Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M19 13.5v-3l-2-.7-.6-1.4.9-1.9-2.1-2.1-1.9.9-1.4-.6-.7-2h-3l-.7 2-1.4.6-1.9-.9-2.1 2.1.9 1.9-.6 1.4-2 .7v3l2 .7.6 1.4-.9 1.9 2.1 2.1 1.9-.9 1.4.6.7 2h3l.7-2 1.4-.6 1.9.9 2.1-2.1-.9-1.9.6-1.4 2-.7Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
