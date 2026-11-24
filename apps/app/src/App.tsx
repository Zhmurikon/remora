import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthBootstrap } from './features/auth/AuthBootstrap';
import { AchievementCelebration } from './features/achievements/AchievementCelebration';
import { McpConsentPage } from './pages/McpConsentPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { StudyActivity } from './features/study/StudyActivity';
import { studyRoutes } from './features/study/study-routes';
import { AppLayout } from './layouts/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { CoursesPage } from './pages/CoursesPage';
import { CoursePage, NewCoursePage } from './pages/CourseSettingsPage';
import { CourseEditorPage } from './pages/CourseEditorPage';
import { CourseCopyPage, CourseReaderPage } from './pages/CourseReaderPage';
import { SavedArticlePage } from './pages/SavedArticlePage';
import { LibraryPage } from './pages/LibraryPage';
import { MaterialsPage } from './pages/MaterialsPage';
import { PracticePage, PythonPracticePage, PythonTaskPage } from './pages/PracticePage';
import { SettingsPage } from './pages/SettingsPage';
import { SetEditorPage } from './pages/SetEditorPage';
import { SetPage } from './pages/SetPage';
import { SetsPage } from './pages/SetsPage';
import { AchievementsPage } from './pages/AchievementsPage';
import { BattlePage } from './pages/BattlePage';
import { ClassPage, ClassesPage, JoinClassPage, StudentReportPage } from './pages/ClassesPage';
import { BillingPage } from './pages/BillingPage';
import { TranscriptionsPage } from './pages/TranscriptionsPage';

import { useAuthStore } from './features/auth/auth-store';
import { pendingLectureId } from './features/study/lecture-demo-draft';

function DashboardEntry() {
  const email = useAuthStore((state) => state.user?.email);
  const draft = email ? pendingLectureId(email) : null;
  return draft ? <Navigate to={'/transcriptions/new?draft=' + draft} replace /> : <DashboardPage />;
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthBootstrap>
        <AchievementCelebration />
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="mcp/connect" element={<McpConsentPage />} />
            <Route element={<AppLayout />}>
              <Route index element={<DashboardEntry />} />
              <Route path="materials" element={<MaterialsPage />} />
              <Route path="sets" element={<MaterialsPage />} />
              <Route path="courses" element={<MaterialsPage />} />
              <Route path="sets/manage" element={<SetsPage />} />
              <Route path="courses/manage" element={<CoursesPage />} />
              <Route path="library/:saveId/read" element={<SavedArticlePage />} />
              <Route path="library/manage" element={<LibraryPage />} />
              <Route path="courses/new" element={<NewCoursePage />} />
              <Route path="courses/:courseId" element={<CourseReaderPage />} />
              <Route path="courses/:courseId/edit" element={<CoursePage />} />
              <Route path="courses/:courseId/structure" element={<CoursePage />} />
              <Route
                path="courses/:courseId/materials/:articleId/edit"
                element={<CourseEditorPage />}
              />
              <Route path="courses/:courseId/read" element={<CourseReaderPage />} />
              {studyRoutes.map(({ path, mode }) => (
                <Route key={path} path={path} element={<StudyActivity mode={mode} />} />
              ))}
              <Route path="courses/copy/:slug" element={<CourseCopyPage />} />
              <Route path="sets/:setId" element={<SetPage />} />
              <Route path="sets/:setId/edit" element={<SetEditorPage />} />
              <Route path="sets/:setId/battle" element={<BattlePage />} />
              <Route path="battles/:battleId" element={<BattlePage />} />
              <Route path="library" element={<Navigate to="/materials" replace />} />
              <Route path="transcriptions" element={<TranscriptionsPage />} />
              <Route path="transcriptions/:jobId" element={<TranscriptionsPage />} />
              <Route path="practice" element={<PracticePage />} />
              <Route path="practice/python" element={<PythonPracticePage />} />
              <Route path="practice/python/:taskSlug" element={<PythonTaskPage />} />
              <Route path="achievements" element={<AchievementsPage />} />
              <Route path="classes" element={<ClassesPage />} />
              <Route path="classes/join" element={<JoinClassPage />} />
              <Route
                path="classes/:classId/reports/students/:studentId"
                element={<StudentReportPage />}
              />
              <Route path="classes/:classId" element={<ClassPage />} />
              <Route path="billing" element={<BillingPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthBootstrap>
    </BrowserRouter>
  );
}
