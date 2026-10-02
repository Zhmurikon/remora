import { Button, FishMark } from '@remora/ui/base';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

const navigation = [
  { to: '/', label: 'Сводка', end: true },
  { to: '/users', label: 'Пользователи', end: false },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <a
        href="#admin-content"
        className="bg-primary text-primary-fg fixed left-3 top-3 z-50 -translate-y-20 rounded-md px-4 py-2 focus:translate-y-0"
      >
        К содержимому
      </a>
      <aside className="border-border bg-surface border-b px-4 py-3 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r lg:p-5">
        <div className="flex items-center justify-between gap-4 lg:block">
          <div className="flex items-center gap-2.5 px-1">
            <FishMark className="h-9 w-9 shrink-0" />
            <div>
              <p className="font-semibold leading-tight">Remora</p>
              <p className="text-fg-subtle text-xs">Управление</p>
            </div>
          </div>
          <nav className="flex gap-1 lg:mt-8 lg:block lg:space-y-1" aria-label="Разделы панели">
            {navigation.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors ${isActive ? 'bg-primary-subtle text-primary' : 'text-fg-muted hover:bg-surface-muted hover:text-fg'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="border-border mt-5 hidden border-t pt-5 lg:block">
          <p className="truncate text-sm font-medium">{user?.display_name || user?.username}</p>
          <p className="text-fg-subtle mt-0.5 truncate text-xs">{user?.email}</p>
          <Button
            variant="ghost"
            fullWidth
            className="mt-4 justify-start"
            loading={loggingOut}
            onClick={() => void handleLogout()}
          >
            Выйти
          </Button>
        </div>
      </aside>
      <main id="admin-content" className="min-w-0 px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
