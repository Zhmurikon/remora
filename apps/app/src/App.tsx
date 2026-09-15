import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthBootstrap } from './features/auth/AuthBootstrap';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <BrowserRouter>
      <AuthBootstrap>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route
                path="sets"
                element={
                  <PlaceholderPage
                    title="Мои наборы"
                    description="Здесь появятся ваши наборы карточек."
                  />
                }
              />
              <Route
                path="library"
                element={
                  <PlaceholderPage
                    title="Библиотека"
                    description="Сохраняйте интересные публичные наборы и возвращайтесь к ним позже."
                  />
                }
              />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthBootstrap>
    </BrowserRouter>
  );
}
