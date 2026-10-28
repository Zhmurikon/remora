import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './features/auth/AuthContext';
import { LoginPage } from './features/auth/LoginPage';
import { AdminLayout } from './layouts/AdminLayout';
import { BlogPage } from './pages/BlogPage';
import { JobsPage } from './pages/JobsPage';
import { ModerationPage } from './pages/ModerationPage';
import { OverviewPage } from './pages/OverviewPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { PlansPage } from './pages/PlansPage';
import { PromotionsPage } from './pages/PromotionsPage';
import { SecurityPage } from './pages/SecurityPage';
import { SystemPage } from './pages/SystemPage';
import { UserDetailPage } from './pages/UserDetailPage';
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
        <Route path="users/:userId" element={<UserDetailPage />} />
        <Route path="moderation" element={<ModerationPage />} />
        <Route path="blog" element={<BlogPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="promotions" element={<PromotionsPage />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="system" element={<SystemPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
