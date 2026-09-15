import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthBootstrap } from './features/auth/AuthBootstrap';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { FlashcardsPage } from './pages/FlashcardsPage';
import { LearnPage } from './pages/LearnPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { SettingsPage } from './pages/SettingsPage';
import { SetEditorPage } from './pages/SetEditorPage';
import { SetPage } from './pages/SetPage';
import { SetsPage } from './pages/SetsPage';

export function App() {
  return (
    <BrowserRouter>
      <AuthBootstrap>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="sets" element={<SetsPage />} />
              <Route path="sets/:setId" element={<SetPage />} />
              <Route path="sets/:setId/edit" element={<SetEditorPage />} />
              <Route path="sets/:setId/learn" element={<LearnPage />} />
              <Route path="sets/:setId/flashcards" element={<FlashcardsPage />} />
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
