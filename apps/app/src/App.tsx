import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthBootstrap } from './features/auth/AuthBootstrap';
import { AchievementCelebration } from './features/achievements/AchievementCelebration';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { CoursePage, CoursesPage, NewCoursePage } from './pages/CoursesPage';
import { CourseEditorPage } from './pages/CourseEditorPage';
import { CourseCopyPage, CourseReaderPage } from './pages/CourseReaderPage';
import { FlashcardsPage } from './pages/FlashcardsPage';
import { LearnPage } from './pages/LearnPage';
import { LibraryPage } from './pages/LibraryPage';
import { MaterialsPage } from './pages/MaterialsPage';
import { ListenPage } from './pages/ListenPage';
import { PracticePage, PythonPracticePage, PythonTaskPage } from './pages/PracticePage';
import { SettingsPage } from './pages/SettingsPage';
import { SetEditorPage } from './pages/SetEditorPage';
import { SetPage } from './pages/SetPage';
import { SetsPage } from './pages/SetsPage';
import { TestPage } from './pages/TestPage';
import { WritePage } from './pages/WritePage';
import { AchievementsPage } from './pages/AchievementsPage';
import { BattlePage } from './pages/BattlePage';

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthBootstrap>
        <AchievementCelebration />
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="materials" element={<MaterialsPage />} />
              <Route path="sets" element={<MaterialsPage />} />
              <Route path="courses" element={<MaterialsPage />} />
              <Route path="sets/manage" element={<SetsPage />} />
              <Route path="courses/manage" element={<CoursesPage />} />
              <Route path="library/manage" element={<LibraryPage />} />
              <Route path="courses/new" element={<NewCoursePage />} />
              <Route path="courses/:courseId" element={<CourseReaderPage />} />
              <Route path="courses/:courseId/edit" element={<CoursePage />} />
              <Route path="courses/:courseId/structure" element={<CourseEditorPage />} />
              <Route
                path="courses/:courseId/materials/:articleId/edit"
                element={<CourseEditorPage />}
              />
              <Route path="courses/:courseId/read" element={<CourseReaderPage />} />
              <Route path="courses/:courseId/learn" element={<LearnPage />} />
              <Route path="folders/:folderId/learn" element={<LearnPage />} />
              <Route path="folders/:folderId/flashcards" element={<FlashcardsPage />} />
              <Route path="folders/:folderId/write" element={<WritePage />} />
              <Route path="folders/:folderId/listen" element={<ListenPage />} />
              <Route path="courses/copy/:slug" element={<CourseCopyPage />} />
              <Route path="sets/:setId" element={<SetPage />} />
              <Route path="sets/:setId/edit" element={<SetEditorPage />} />
              <Route path="sets/:setId/learn" element={<LearnPage />} />
              <Route path="sets/:setId/flashcards" element={<FlashcardsPage />} />
              <Route path="sets/:setId/write" element={<WritePage />} />
              <Route path="sets/:setId/test" element={<TestPage />} />
              <Route path="sets/:setId/battle" element={<BattlePage />} />
              <Route path="battles/:battleId" element={<BattlePage />} />
              <Route path="sets/:setId/listen" element={<ListenPage />} />
              <Route path="library" element={<MaterialsPage />} />
              <Route path="practice" element={<PracticePage />} />
              <Route path="practice/python" element={<PythonPracticePage />} />
              <Route path="practice/python/:taskSlug" element={<PythonTaskPage />} />
              <Route path="achievements" element={<AchievementsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthBootstrap>
    </BrowserRouter>
  );
}
