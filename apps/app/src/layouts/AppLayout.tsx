import { Button, FishMark } from '@remora/ui';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../features/auth/auth-store';
import { api, clearAccessToken } from '../lib/api';

const navigation = [
  { to: '/', label: 'Главная', icon: '⌂', end: true },
  { to: '/sets', label: 'Мои наборы', icon: '▣' },
  { to: '/courses', label: 'Мои курсы', icon: '▤' },
  { to: '/library', label: 'Библиотека', icon: '◇' },
  { to: '/settings', label: 'Настройки', icon: '⚙' },
];

export function AppLayout() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
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

  if (/^\/courses\/[^/]+\/read$/.test(location.pathname)) {
    return (
      <main className="min-h-dvh px-4 py-4 sm:px-8 sm:py-6">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    );
  }

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
          {navigation.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${isActive ? 'bg-primary-subtle text-primary' : 'text-fg-muted hover:bg-surface-muted hover:text-fg'}`
              }
            >
              <span className="w-5 text-center text-lg" aria-hidden="true">
                {icon}
              </span>
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
          <Button variant="ghost" fullWidth loading={loggingOut} onClick={() => void logout()}>
            Выйти
          </Button>
        </div>
      </aside>

      <main className="min-w-0 px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-6xl">
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
