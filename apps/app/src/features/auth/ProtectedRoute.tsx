import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuthStore } from './auth-store';

const WEB_URL = import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000';

export function ProtectedRoute() {
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status === 'guest') {
      const next = window.location.pathname + window.location.search;
      window.location.replace(`${WEB_URL}/login?next=${encodeURIComponent(next)}`);
    }
  }, [status]);

  if (status === 'checking') {
    return (
      <main className="grid min-h-dvh place-items-center px-6" aria-live="polite">
        <div className="text-center">
          <span className="border-primary mx-auto block h-9 w-9 animate-spin rounded-full border-2 border-r-transparent" />
          <p className="text-fg-muted mt-4 text-sm">Открываем кабинет…</p>
        </div>
      </main>
    );
  }
  if (status === 'guest') {
    return (
      <main className="grid min-h-dvh place-items-center px-6" aria-live="polite">
        <p className="text-fg-muted text-sm">Переходим на страницу входа…</p>
      </main>
    );
  }
  return <Outlet />;
}
