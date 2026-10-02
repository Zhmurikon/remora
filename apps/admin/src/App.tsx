import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './features/auth/AuthContext';
import { LoginPage } from './features/auth/LoginPage';
import { AdminLayout } from './layouts/AdminLayout';
import { OverviewPage } from './pages/OverviewPage';
import { UsersPage } from './pages/UsersPage';

export function App() {
  const { status } = useAuth();

  if (status === 'checking') {
    return (
      <main className="grid min-h-dvh place-items-center px-4" aria-live="polite">
        <div className="text-center">
          <div className="border-border bg-surface mx-auto h-12 w-40 animate-pulse rounded-md border" />
          <p className="text-fg-muted mt-4 text-sm">Проверяем доступ…</p>
        </div>
      </main>
    );
  }

  if (status === 'guest') return <LoginPage />;

  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="users" element={<UsersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
