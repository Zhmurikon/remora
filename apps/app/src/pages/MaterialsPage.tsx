import type { components } from '@remora/api-client';
import { pluralWithCount } from '@remora/core';
import { Badge, Button, Input } from '@remora/ui';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createEmptySet } from '../features/materials/create-empty-set';
import { LibraryUpdateControl } from '../features/library/LibraryUpdateControl';
import {
  DropIndicator,
  moveCustomItem,
  moveCustomItemTo,
  sortItems,
  useCustomOrder,
  useDragOrder,
  type DropEdge,
} from '../features/library/ListSort';
import {
  aggregateStats,
  learningStatus,
  type MaterialProgress,
} from '../features/materials/materials-progress';
import { api } from '../lib/api';
import { SettingsIcon } from '../components/SettingsIcon';
import { MaterialDescription } from '../features/materials/MaterialDescription';
import cardsImage from '../../../web/public/lecture-demo/pricing-cards.webp';
import bookImage from '../../../web/public/lecture-demo/course-books.webp';
import './materials.css';

const courseCatalogUrl = `${import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000'}/kursy`;

type CourseSummary = components['schemas']['CourseSummary'];
type CourseDetail = components['schemas']['CourseDetail'];
type SavedCourse = components['schemas']['SavedCourseItem'];
type SetSummary = components['schemas']['SetSummary'];
type SavedSet = components['schemas']['SavedSetItem'];
type SetStats = components['schemas']['SetStats'];
type LibraryItem = components['schemas']['LibraryItem'];
type Folder = components['schemas']['FolderPublic'];
type MaterialView = 'courses' | 'sets' | 'library' | 'archive';

type CourseItem = {
  id: string;
  title: string;
  description: string;
  saved: boolean;
  hasUpdates: boolean;
  saveId?: string;
  slug: string;
  author?: string;
  orderDate: string;
};

type SetItem = {
  id: string;
  title: string;
  description: string;
  cardsCount: number;
  saved: boolean;
  archived: boolean;
  folderId: string | null;
  hasUpdates: boolean;
  saveId?: string;
  accessVia?: SavedSet['access_via'];
  sourceTitle?: string;
  orderDate: string;
};

const emptyProgress: MaterialProgress = {
  cardsTotal: 0,
  masteredCount: 0,
  learningCount: 0,
  studiedCount: 0,
  studiedPercent: 0,
  masteryPercent: 0,
  dueNow: 0,
  lastStudiedAt: null,
};

export function MaterialsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const initialView = viewFromPath(location.pathname);
  const [view, setView] = useState<MaterialView>(initialView);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(initialView === 'library');
  const [courseOrder, setCourseOrder] = useCustomOrder('remora:order:courses');
  const [setOrder, setSetOrder] = useCustomOrder('remora:order:sets');

  useEffect(() => {
    setView(viewFromPath(location.pathname));
    setSelectedId(null);
    setMobileDetailOpen(viewFromPath(location.pathname) === 'library');
  }, [location.pathname]);

  const courses = useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/courses');
      if (!data || error) throw new Error('Не удалось загрузить курсы');
      return data;
    },
  });
  const savedCourses = useQuery({
    queryKey: ['library', 'courses'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/library/courses');
      if (!data || error) throw new Error('Не удалось загрузить сохранённые курсы');
      return data;
    },
  });
  const sets = useQuery({
    queryKey: ['sets'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/sets');
      if (!data || error) throw new Error('Не удалось загрузить наборы');
      return data;
    },
  });
  const savedSets = useQuery({
    queryKey: ['library', 'sets'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/library/sets');
      if (!data || error) throw new Error('Не удалось загрузить сохранённые наборы');
      return data;
    },
  });
  const archivedSets = useQuery({
    queryKey: ['sets', 'archived'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/sets/archived');
      if (!data || error) throw new Error('Не удалось загрузить архив');
      return data;
    },
  });
  const folders = useQuery({
    queryKey: ['folders'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/folders');
      if (!data || error) throw new Error('Не удалось загрузить папки');
      return data;
    },
  });
  const library = useQuery({
    queryKey: ['library'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/library');
      if (!data || error) throw new Error('Не удалось загрузить библиотеку');
      return data;
    },
  });

  const courseItems = useMemo(
    () => [
      ...(courses.data ?? []).map(ownedCourseItem),
      ...(savedCourses.data ?? []).map(savedCourseItem),
    ],
    [courses.data, savedCourses.data],
  );
  const setItems = useMemo(
    () => [
      ...(sets.data ?? []).map((item) => ownedSetItem(item, false)),
      ...(savedSets.data ?? []).map(savedSetItem),
    ],
    [savedSets.data, sets.data],
  );
  const archiveItems = useMemo(
    () => (archivedSets.data ?? []).map((item) => ownedSetItem(item, true)),
    [archivedSets.data],
  );

  const courseDetails = useQueries({
    queries: courseItems.map((course) => ({
      queryKey: ['course', course.id],
      queryFn: () => fetchCourse(course.id),
      staleTime: 60_000,
    })),
  });
  const courseDetailById = useMemo(() => {
    const result = new Map<string, CourseDetail>();
    courseDetails.forEach((query, index) => {
      const course = courseItems[index];
      if (query.data && course) result.set(course.id, query.data);
    });
    return result;
  }, [courseDetails, courseItems]);
  const allSetIds = useMemo(() => {
    const ids = new Set(setItems.map((item) => item.id));
    courseDetailById.forEach((course) => {
      course.sections.forEach((section) =>
        section.articles.forEach((article) => ids.add(article.set_id)),
      );
    });
    return [...ids];
  }, [courseDetailById, setItems]);
  const statsQueries = useQueries({
    queries: allSetIds.map((setId) => ({
      queryKey: ['study', 'set-stats', setId],
      queryFn: () => fetchSetStats(setId),
      staleTime: 30_000,
      retry: 1,
    })),
  });
  const statsBySetId = useMemo(() => {
    const result = new Map<string, SetStats>();
    statsQueries.forEach((query, index) => {
      const setId = allSetIds[index];
      if (query.data && setId) result.set(setId, query.data);
    });
    return result;
  }, [allSetIds, statsQueries]);

  const courseProgress = useMemo(() => {
    const result = new Map<string, MaterialProgress>();
    for (const course of courseItems) {
      const detail = courseDetailById.get(course.id);
      result.set(
        course.id,
        detail
          ? aggregateStats(
              detail.sections.flatMap((section) =>
                section.articles.map((article) => statsBySetId.get(article.set_id)),
              ),
            )
          : { ...emptyProgress, loading: true },
      );
    }
    return result;
  }, [courseDetailById, courseItems, statsBySetId]);

  const setProgress = useMemo(() => {
    const result = new Map<string, MaterialProgress>();
    for (const item of setItems) {
      const stats = statsBySetId.get(item.id);
      result.set(item.id, stats ? fromSetStats(stats) : { ...emptyProgress, loading: true });
    }
    return result;
  }, [setItems, statsBySetId]);

  const orderedCourses = useMemo(
    () =>
      sortItems(
        courseItems,
        'custom',
        (item) => ({ id: item.id, title: item.title, date: item.orderDate }),
        courseOrder,
      ),
    [courseItems, courseOrder],
  );
  const orderedSets = useMemo(
    () =>
      sortItems(
        setItems,
        'custom',
        (item) => ({
          id: item.id,
          title: item.title,
          date: item.orderDate,
          size: item.cardsCount,
        }),
        setOrder,
      ),
    [setItems, setOrder],
  );
  const filteredCourses = filterBySearch(orderedCourses, search);
  const filteredSets = filterBySearch(orderedSets, search);
  const filteredArchive = filterBySearch(archiveItems, search);
  const selectedCourse = courseItems.find((item) => item.id === selectedId);
  const selectedSet = [...setItems, ...archiveItems].find((item) => item.id === selectedId);

  useEffect(() => {
    if (selectedId) return;
    if (view === 'courses' && filteredCourses[0]) setSelectedId(filteredCourses[0].id);
    if (view === 'sets' && filteredSets[0]) setSelectedId(filteredSets[0].id);
    if (view === 'archive' && filteredArchive[0]) setSelectedId(filteredArchive[0].id);
  }, [filteredArchive, filteredCourses, filteredSets, selectedId, view]);

  const allCourseIds = orderedCourses.map((item) => item.id);
  const visibleCourseIds = filteredCourses.map((item) => item.id);
  const allSetOrderIds = orderedSets.map((item) => item.id);
  const visibleSetIds = filteredSets.map((item) => item.id);

  function moveCourse(courseId: string, direction: -1 | 1) {
    setCourseOrder(moveCustomItem(allCourseIds, visibleCourseIds, courseId, direction));
  }

  function moveSet(setId: string, direction: -1 | 1) {
    setSetOrder(moveCustomItem(allSetOrderIds, visibleSetIds, setId, direction));
  }

  const courseDrag = useDragOrder(
    (courseId, targetId, afterTarget) =>
      setCourseOrder(moveCustomItemTo(allCourseIds, courseId, targetId, afterTarget)),
    visibleCourseIds,
    moveCourse,
  );
  const setDrag = useDragOrder(
    (setId, targetId, afterTarget) =>
      setSetOrder(moveCustomItemTo(allSetOrderIds, setId, targetId, afterTarget)),
    visibleSetIds,
    moveSet,
  );

  function switchView(next: MaterialView) {
    setView(next);
    setSelectedId(null);
    setMobileDetailOpen(next === 'library');
    navigate(pathForView(next));
  }

  async function createSet() {
    const { data } = await createEmptySet();
    if (!data) return;
    await queryClient.invalidateQueries({ queryKey: ['sets'] });
    navigate(`/sets/${data.id}/edit`);
  }

  const removeLibraryItem = useMutation({
    mutationFn: async (saveId: string) => {
      const { error } = await api.DELETE('/api/v1/library/{save_id}', {
        params: { path: { save_id: saveId } },
      });
      if (error) throw new Error('Не удалось убрать материал');
    },
    onSuccess: async () => {
      setSelectedId(null);
      setMobileDetailOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['library'] }),
        queryClient.invalidateQueries({ queryKey: ['library', 'courses'] }),
        queryClient.invalidateQueries({ queryKey: ['library', 'sets'] }),
      ]);
    },
  });

  const deleteCourse = useMutation({
    mutationFn: async (courseId: string) => {
      const { error } = await api.DELETE('/api/v1/courses/{course_id}', {
        params: { path: { course_id: courseId } },
      });
      if (error) throw new Error('Не удалось удалить курс');
    },
    onSuccess: async () => {
      setSelectedId(null);
      setMobileDetailOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
        queryClient.invalidateQueries({ queryKey: ['sets'] }),
        queryClient.invalidateQueries({ queryKey: ['sets', 'archived'] }),
      ]);
    },
  });

  const deleteSet = useMutation({
    mutationFn: async ({ setId, permanent }: { setId: string; permanent: boolean }) => {
      const { error } = permanent
        ? await api.DELETE('/api/v1/sets/{set_id}/permanent', {
            params: { path: { set_id: setId } },
          })
        : await api.DELETE('/api/v1/sets/{set_id}', {
            params: { path: { set_id: setId } },
          });
      if (error) throw new Error('Не удалось удалить набор');
    },
    onSuccess: async () => {
      setSelectedId(null);
      setMobileDetailOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sets'] }),
        queryClient.invalidateQueries({ queryKey: ['sets', 'archived'] }),
      ]);
    },
  });

  const loading = [courses, savedCourses, sets, savedSets, archivedSets, library].some(
    (query) => query.isPending,
  );
  const failed = [courses, savedCourses, sets, savedSets, archivedSets, library].some(
    (query) => query.isError,
  );

  return (
    <div className="materials-page">
      <header className="materials-heading">
        <h1>Материалы</h1>
        <CreateMenu onCreateSet={() => void createSet()} />
      </header>
      <div className="materials-columns">
        <aside className={`materials-index ${mobileDetailOpen ? 'hidden lg:block' : 'block'}`}>
          <div>
            <div className="relative">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                className="text-fg-muted pointer-events-none absolute left-3 top-3.5 h-4 w-4"
              >
                <circle cx="10" cy="10" r="6.5" />
                <path d="m15 15 5 5" />
              </svg>
              <Input
                type="search"
                aria-label="Поиск по материалам"
                placeholder="Найти курс или набор"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 pl-9"
              />
            </div>
            <nav className="materials-views mt-4" aria-label="Разделы материалов">
              <ViewButton active={view === 'courses'} onClick={() => switchView('courses')}>
                Курсы
              </ViewButton>
              <ViewButton active={view === 'sets'} onClick={() => switchView('sets')}>
                Наборы
              </ViewButton>
              <ViewButton active={view === 'library'} onClick={() => switchView('library')}>
                Сохранено
              </ViewButton>
            </nav>
          </div>

          <div className="materials-index-list">
            {loading && <TreeSkeleton />}
            {failed && (
              <p className="text-danger px-3 py-6 text-sm" role="alert">
                Не всё загрузилось. Проверьте соединение и обновите страницу.
              </p>
            )}
            {!loading && view === 'courses' && (
              <>
                <TreeGroup title="Мои курсы" count={filteredCourses.length}>
                  {filteredCourses.map((course) => (
                    <MaterialTreeItem
                      key={course.id}
                      title={course.title}
                      meta={course.saved ? 'Сохранённый курс' : 'Ваш курс'}
                      progress={courseProgress.get(course.id) ?? emptyProgress}
                      active={selectedId === course.id}
                      dragProps={courseDrag.getDragProps(course.id, course.title)}
                      dragging={courseDrag.draggedId === course.id}
                      dropEdge={
                        courseDrag.dropTarget?.id === course.id
                          ? courseDrag.dropTarget.edge
                          : undefined
                      }
                      onClick={() => {
                        setSelectedId(course.id);
                        setMobileDetailOpen(true);
                      }}
                    />
                  ))}
                </TreeGroup>
                <nav className="material-course-links" aria-label="Навигация по курсам">
                  <a href={courseCatalogUrl}>Каталог курсов</a>
                  <Link to="/courses/manage">Настройки сортировки</Link>
                </nav>
              </>
            )}
            {!loading && view === 'sets' && (
              <>
                <TreeGroup title="Все наборы" count={filteredSets.length}>
                  {filteredSets.map((set) => (
                    <MaterialTreeItem
                      key={set.id}
                      title={set.title}
                      meta={folderName(folders.data, set.folderId, set.saved)}
                      progress={setProgress.get(set.id) ?? emptyProgress}
                      active={selectedId === set.id}
                      dragProps={setDrag.getDragProps(set.id, set.title)}
                      dragging={setDrag.draggedId === set.id}
                      dropEdge={
                        setDrag.dropTarget?.id === set.id ? setDrag.dropTarget.edge : undefined
                      }
                      onClick={() => {
                        setSelectedId(set.id);
                        setMobileDetailOpen(true);
                      }}
                    />
                  ))}
                </TreeGroup>
                <nav className="material-course-links" aria-label="Навигация по наборам">
                  <button type="button" onClick={() => switchView('archive')}>
                    Архив · {archiveItems.length}
                  </button>
                  <a href={courseCatalogUrl}>Каталог курсов</a>
                  <Link to="/sets/manage">Папки и настройки сортировки</Link>
                </nav>
              </>
            )}
            {!loading && view === 'archive' && (
              <TreeGroup title="Архив" count={filteredArchive.length}>
                {filteredArchive.map((set) => (
                  <MaterialTreeItem
                    key={set.id}
                    title={set.title}
                    meta="Удалённый набор"
                    progress={emptyProgress}
                    active={selectedId === set.id}
                    onClick={() => {
                      setSelectedId(set.id);
                      setMobileDetailOpen(true);
                    }}
                  />
                ))}
              </TreeGroup>
            )}
            {!loading && view === 'library' && (
              <>
                <LibraryTree library={library.data ?? []} search={search} />
                <ManagementLink to="/library/manage">Настроить порядок</ManagementLink>
              </>
            )}
          </div>
        </aside>

        <div className={`${mobileDetailOpen ? 'block' : 'hidden lg:block'} min-w-0`}>
          {mobileDetailOpen && (
            <button
              type="button"
              onClick={() => setMobileDetailOpen(false)}
              className="border-border text-fg-muted hover:text-fg flex min-h-12 w-full items-center gap-2 border-b px-5 text-sm font-medium lg:hidden"
            >
              <span aria-hidden="true">←</span>К списку материалов
            </button>
          )}
          {view === 'courses' && selectedCourse && (
            <CourseNavigator
              key={selectedCourse.id}
              course={selectedCourse}
              detail={courseDetailById.get(selectedCourse.id)}
              progress={
                courseProgress.get(selectedCourse.id) ?? { ...emptyProgress, loading: true }
              }
              statsBySetId={statsBySetId}
              deleting={
                selectedCourse.saved
                  ? removeLibraryItem.isPending &&
                    removeLibraryItem.variables === selectedCourse.saveId
                  : deleteCourse.isPending && deleteCourse.variables === selectedCourse.id
              }
              deleteError={selectedCourse.saved ? removeLibraryItem.error : deleteCourse.error}
              onDelete={() => {
                if (selectedCourse.saved && selectedCourse.saveId) {
                  removeLibraryItem.mutate(selectedCourse.saveId);
                } else {
                  deleteCourse.mutate(selectedCourse.id);
                }
              }}
            />
          )}
          {(view === 'sets' || view === 'archive') && selectedSet && (
            <SetNavigator
              key={selectedSet.id}
              item={selectedSet}
              progress={setProgress.get(selectedSet.id) ?? emptyProgress}
              onRestored={() => {
                void queryClient.invalidateQueries({ queryKey: ['sets'] });
                void queryClient.invalidateQueries({ queryKey: ['sets', 'archived'] });
                switchView('sets');
              }}
              deleting={
                selectedSet.saved
                  ? removeLibraryItem.isPending &&
                    removeLibraryItem.variables === selectedSet.saveId
                  : deleteSet.isPending && deleteSet.variables?.setId === selectedSet.id
              }
              deleteError={selectedSet.saved ? removeLibraryItem.error : deleteSet.error}
              onDelete={() => {
                if (selectedSet.saved && selectedSet.saveId) {
                  removeLibraryItem.mutate(selectedSet.saveId);
                } else {
                  deleteSet.mutate({ setId: selectedSet.id, permanent: selectedSet.archived });
                }
              }}
            />
          )}
          {view === 'library' && (
            <LibraryNavigator
              items={library.data ?? []}
              statsBySetId={statsBySetId}
              removingId={removeLibraryItem.isPending ? removeLibraryItem.variables : undefined}
              onRemove={(id) => removeLibraryItem.mutate(id)}
            />
          )}
          {!loading && view !== 'library' && !selectedCourse && !selectedSet && (
            <EmptyMaterials view={view} onCreateSet={() => void createSet()} />
          )}
        </div>
      </div>
    </div>
  );
}

function MaterialActionLink({
  to,
  className,
  label,
  description,
  children,
}: {
  to: string;
  className?: string;
  label?: string;
  description: string;
  children: ReactNode;
}) {
  const tipId = useId();
  const [dismissed, setDismissed] = useState(false);
  return (
    <span className="material-action" onPointerEnter={() => setDismissed(false)}>
      <Link
        to={to}
        className={className}
        aria-label={label}
        aria-describedby={tipId}
        onFocus={() => setDismissed(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setDismissed(true);
        }}
      >
        {children}
      </Link>
      <span id={tipId} role="tooltip" className="material-action-tip" hidden={dismissed}>
        {description}
      </span>
    </span>
  );
}

function CourseNavigator({
  course,
  detail,
  progress,
  statsBySetId,
  deleting,
  deleteError,
  onDelete,
}: {
  course: CourseItem;
  detail?: CourseDetail;
  progress: MaterialProgress;
  statsBySetId: Map<string, SetStats>;
  deleting: boolean;
  deleteError: Error | null;
  onDelete: () => void;
}) {
  const sections = detail?.sections ?? [];
  const weakestSection = weakestSectionIndex(sections, statsBySetId);
  return (
    <div className="material-course">
      <section className="material-folder">
        <span className="material-tab">{course.saved ? 'Сохранённый курс' : 'Ваш курс'}</span>
        <img className="material-cover" src={bookImage} width="90" height="100" alt="" />
        <h2>
          <Link to={`/courses/${course.id}/read`}>{course.title}</Link>
        </h2>
        {course.author && <p className="text-fg-muted mt-2 text-sm">Автор: {course.author}</p>}
        {course.hasUpdates && course.saveId && (
          <div className="mt-2">
            <Badge tone="warning">Есть обновление</Badge>
            <LibraryUpdateControl saveId={course.saveId} title={course.title} />
          </div>
        )}
        <MaterialDescription description={course.description}>
          <div className="material-actions">
            <MaterialActionLink
              className="material-primary"
              to={`/courses/${course.id}/learn`}
              description="Продолжить тренировку по карточкам курса"
            >
              Продолжить
            </MaterialActionLink>
            <MaterialActionLink
              to={`/courses/${course.id}/read`}
              description="Открыть статьи курса"
            >
              Читать
            </MaterialActionLink>
            {!course.saved && (
              <MaterialActionLink
                className="material-settings"
                to={`/courses/${course.id}/edit`}
                label="Настроить курс"
                description="Открыть редактор курса"
              >
                <SettingsIcon />
              </MaterialActionLink>
            )}
          </div>
        </MaterialDescription>
      </section>
      <section className="material-study-stats">
        <div className="flex items-center justify-between gap-3">
          <h3>Прогресс курса</h3>
          <strong>{progress.loading ? '—' : `${Math.round(progress.studiedPercent)}%`}</strong>
        </div>
        <ProgressBar progress={progress} className="my-2" />
        <p className="text-fg-muted text-sm">
          Изучено {progress.studiedCount} из {progress.cardsTotal} карточек · Закреплено{' '}
          {progress.masteredCount} · {learningStatus(progress).label}
        </p>
      </section>

      <section className="material-sections">
        <h3>Разделы курса</h3>
        {!detail && <CourseStructureSkeleton />}
        {detail && sections.length === 0 && <EmptyBlock>В курсе пока нет разделов.</EmptyBlock>}
        <div className="mt-5 space-y-3">
          {sections.map((section, sectionIndex) => {
            const sectionProgress = aggregateStats(
              section.articles.map((article) => statsBySetId.get(article.set_id)),
            );
            return (
              <details
                key={section.id}
                open={sectionIndex === weakestSection}
                className="border-border bg-surface group rounded-2xl border"
              >
                <summary className="hover:bg-surface-muted flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3">
                  <span className="text-fg-subtle w-6 text-center text-sm tabular-nums">
                    {String(sectionIndex + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1 font-semibold">{section.title}</span>
                  <span className="text-fg-muted text-sm tabular-nums">
                    {sectionProgress.loading
                      ? '—'
                      : `${Math.round(sectionProgress.studiedPercent)}%`}
                  </span>
                  <Chevron className="text-fg-subtle h-5 w-5 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-border border-t px-3 py-2 sm:px-5">
                  {section.articles.map((article) => (
                    <ArticleProgressRow
                      key={article.id}
                      courseId={course.id}
                      articleId={article.id}
                      title={article.title}
                      progress={
                        statsBySetId.has(article.set_id)
                          ? fromSetStats(statsBySetId.get(article.set_id)!)
                          : { ...emptyProgress, loading: true }
                      }
                    />
                  ))}
                  {section.articles.length !== 1 && (
                    <p className="text-fg-muted flex flex-wrap items-baseline gap-x-3 py-2 text-sm">
                      <span>
                        Всего в разделе:{' '}
                        {pluralWithCount(sectionProgress.cardsTotal, [
                          'карточка',
                          'карточки',
                          'карточек',
                        ])}
                      </span>
                      <LearningStatus progress={sectionProgress} courseId={course.id} />
                    </p>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <DangerZone
        title={course.saved ? 'Удалить сохранённый курс' : 'Удалить курс'}
        description={
          course.saved
            ? 'Курс исчезнет из ваших сохранённых материалов. Оригинал автора и ваш учебный прогресс не удалятся.'
            : 'Курс и его статьи будут удалены. Входящие в него наборы переместятся в архив вместе с учебным прогрессом.'
        }
        buttonLabel={course.saved ? 'Убрать из сохранённых' : 'Удалить курс'}
        confirmText={`Удалить «${course.title}»? ${course.saved ? 'При необходимости вы сможете сохранить оригинал снова.' : 'Удаление курса нельзя отменить.'}`}
        pending={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </div>
  );
}

function SetNavigator({
  item,
  progress,
  onRestored,
  deleting,
  deleteError,
  onDelete,
}: {
  item: SetItem;
  progress: MaterialProgress;
  onRestored: () => void;
  deleting: boolean;
  deleteError: Error | null;
  onDelete: () => void;
}) {
  const restore = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/sets/{set_id}/restore', {
        params: { path: { set_id: item.id } },
      });
      if (error) throw new Error('Не удалось восстановить набор. Попробуйте ещё раз.');
    },
    onSuccess: onRestored,
  });
  const learnPath = `/sets/${item.id}/learn`;
  const cardsPath = `/sets/${item.id}/flashcards`;
  return (
    <div className="material-course material-set">
      <section className="material-folder">
        <span className="material-tab">
          {item.archived ? 'В архиве' : item.saved ? 'Сохранённый набор' : 'Ваш набор'}
        </span>
        <img className="material-cover" src={cardsImage} width="90" height="100" alt="" />
        <h2>{item.archived ? item.title : <Link to={cardsPath}>{item.title}</Link>}</h2>
        {item.hasUpdates && <Badge tone="warning">Есть обновление</Badge>}
        <MaterialDescription description={item.description}>
          {!item.archived && (
            <div className="material-actions">
              <MaterialActionLink
                className="material-primary"
                to={learnPath}
                description="Продолжить тренировку по набору"
              >
                Продолжить
              </MaterialActionLink>
              <MaterialActionLink to={cardsPath} description="Открыть карточки набора">
                Карточки
              </MaterialActionLink>
              {!item.saved && (
                <MaterialActionLink
                  className="material-settings"
                  to={`/sets/${item.id}/edit`}
                  label="Редактировать набор"
                  description="Открыть редактор набора"
                >
                  <SettingsIcon />
                </MaterialActionLink>
              )}
            </div>
          )}
        </MaterialDescription>
      </section>
      {item.archived ? (
        <section className="mt-8">
          <h3 className="text-xl font-semibold">Набор находится в архиве</h3>
          <p className="text-fg-muted mt-2">Восстановите его, чтобы снова продолжить обучение.</p>
          <Button
            className="mt-5 min-h-11"
            loading={restore.isPending}
            onClick={() => restore.mutate()}
          >
            Восстановить
          </Button>
          {restore.isError && (
            <p role="alert" className="text-danger mt-2">
              {restore.error.message}
            </p>
          )}
        </section>
      ) : (
        <section className="material-study-stats">
          <div className="flex items-center justify-between gap-3">
            <h3>Прогресс набора</h3>
            <strong>{progress.loading ? '—' : `${Math.round(progress.studiedPercent)}%`}</strong>
          </div>
          <ProgressBar progress={progress} className="my-2" />
          <p className="text-fg-muted text-sm">
            {progress.loading ? (
              'Считаем прогресс'
            ) : (
              <>
                Изучено {progress.studiedCount} из {item.cardsCount} карточек · Закреплено{' '}
                {progress.masteredCount} ·{' '}
                {progress.dueNow > 0 ? (
                  <MaterialActionLink to={learnPath} description="повторить карточки">
                    {learningStatus(progress).label}
                  </MaterialActionLink>
                ) : (
                  learningStatus(progress).label
                )}
              </>
            )}
          </p>
        </section>
      )}
      <DangerZone
        title={
          item.archived
            ? 'Удалить набор навсегда'
            : item.saved
              ? 'Удалить сохранённый набор'
              : 'Удалить набор'
        }
        description={
          item.archived
            ? 'Набор, карточки и связанный учебный прогресс будут удалены без возможности восстановления.'
            : item.saved
              ? savedSetRemovalDescription(item)
              : 'Набор переместится в архив. Карточки и учебный прогресс сохранятся, пока вы не удалите его навсегда.'
        }
        buttonLabel={
          item.archived
            ? 'Удалить навсегда'
            : item.saved
              ? item.accessVia === 'course'
                ? 'Убрать курс из сохранённых'
                : item.accessVia === 'article'
                  ? 'Убрать раздел из сохранённых'
                  : 'Убрать из сохранённых'
              : 'Переместить в архив'
        }
        confirmText={`Удалить «${item.title}»? ${item.archived ? 'Это действие нельзя отменить.' : ''}`}
        pending={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </div>
  );
}

function DangerZone({
  title,
  description,
  buttonLabel,
  confirmText,
  pending,
  error,
  onConfirm,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  confirmText: string;
  pending: boolean;
  error: Error | null;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [tipDismissed, setTipDismissed] = useState(false);
  const tipId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <section className="material-delete" aria-label={title}>
      <div
        className="material-delete-control"
        onPointerEnter={() => setTipDismissed(false)}
        onFocus={() => setTipDismissed(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setTipDismissed(true);
        }}
      >
        <button
          ref={trigger}
          type="button"
          className="material-delete-button"
          aria-label={buttonLabel}
          aria-describedby={tipId}
          aria-expanded={confirming}
          disabled={pending}
          onClick={() => setConfirming(!confirming)}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3.5 7h17M9 7V4h6v3M6 7l1 13h10l1-13M10 10.5v6M14 10.5v6" />
          </svg>
        </button>
        <div
          id={tipId}
          role="tooltip"
          className="material-delete-tip"
          hidden={tipDismissed || confirming}
        >
          <strong>{title}</strong>
          {description}
        </div>
      </div>
      {confirming && (
        <>
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="text-fg-muted mt-2 max-w-2xl">{description}</p>
          <div className="mt-4 space-y-3">
            <p>{confirmText}</p>
            <div className="flex flex-wrap gap-3">
              <Button className="min-h-11" variant="danger" loading={pending} onClick={onConfirm}>
                Подтвердить удаление
              </Button>
              <Button
                className="min-h-11"
                variant="ghost"
                disabled={pending}
                autoFocus
                onClick={() => {
                  setConfirming(false);
                  trigger.current?.focus();
                }}
              >
                Отмена
              </Button>
            </div>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-danger mt-3 text-sm">
          {error.message}. Проверьте соединение и повторите попытку.
        </p>
      )}
    </section>
  );
}

function LibraryNavigator({
  items,
  statsBySetId,
  removingId,
  onRemove,
}: {
  items: LibraryItem[];
  statsBySetId: Map<string, SetStats>;
  removingId?: string;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <div className="border-border flex min-h-16 items-center border-b px-5 text-sm sm:px-8">
        <span className="font-medium">Сохранённые материалы</span>
      </div>
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-fg-subtle text-xs font-semibold uppercase tracking-[0.14em]">
              Ваша библиотека
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Сохранено для изучения
            </h2>
            <p className="text-fg-muted mt-3 max-w-2xl">
              Курсы и наборы авторов остаются связанными с оригиналом, а ваш прогресс — личным.
            </p>
          </div>
          <a href={courseCatalogUrl}>
            <Button size="lg" variant="secondary">
              Найти курсы
            </Button>
          </a>
        </div>
        {items.length === 0 ? (
          <EmptyBlock>Сохранённых материалов пока нет.</EmptyBlock>
        ) : (
          <div className="divide-border border-border mt-8 divide-y border-y">
            {items.map((item) => {
              const title = item.article_title ?? item.set_title ?? item.course_title;
              const stats = item.set_id ? statsBySetId.get(item.set_id) : undefined;
              const progress = stats ? fromSetStats(stats) : { ...emptyProgress, loading: true };
              return (
                <div
                  key={item.id}
                  className="grid gap-4 py-5 md:grid-cols-[1fr_220px_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>
                        {item.target_type === 'course'
                          ? 'Курс'
                          : item.target_type === 'article'
                            ? 'Раздел'
                            : 'Набор'}
                      </Badge>
                      {item.has_updates && <Badge tone="warning">Есть обновление</Badge>}
                    </div>
                    <h3 className="mt-3 break-words text-lg font-semibold">{title}</h3>
                    <p className="text-fg-muted mt-1 text-sm">
                      {item.course_title} · {item.cards_count} карточек
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-fg-muted">Прогресс</span>
                      <span className="font-semibold tabular-nums">
                        {item.set_id && !progress.loading
                          ? `${Math.round(progress.studiedPercent)}%`
                          : '—'}
                      </span>
                    </div>
                    <ProgressBar progress={progress} className="mt-2" />
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {item.has_updates && <LibraryUpdateControl saveId={item.id} title={title} />}
                    {item.set_id ? (
                      <Link to={`/sets/${item.set_id}/learn`}>
                        <Button size="sm">Учить</Button>
                      </Link>
                    ) : (
                      <a
                        href={`${import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000'}/kurs/${item.course_slug}`}
                      >
                        <Button size="sm">Открыть</Button>
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={removingId === item.id}
                      onClick={() => onRemove(item.id)}
                    >
                      Убрать
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function LibraryTree({ library, search }: { library: LibraryItem[]; search: string }) {
  const filtered = filterBySearch(
    library.map((item) => ({
      ...item,
      title: item.article_title ?? item.set_title ?? item.course_title,
    })),
    search,
  );
  return (
    <TreeGroup title="Сохранено" count={filtered.length}>
      {filtered.slice(0, 12).map((item) => (
        <div key={item.id} className="border-border mx-2 border-b px-2 py-3 last:border-0">
          <p className="break-words text-sm font-medium">{item.title}</p>
          <p className="text-fg-muted mt-1 text-xs">
            {item.target_type === 'course'
              ? 'Курс'
              : item.target_type === 'article'
                ? 'Раздел курса'
                : 'Набор'}
          </p>
        </div>
      ))}
    </TreeGroup>
  );
}

function ArticleProgressRow({
  courseId,
  articleId,
  title,
  progress,
}: {
  courseId: string;
  articleId: string;
  title: string;
  progress: MaterialProgress;
}) {
  return (
    <div className="border-border grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 border-b py-2 last-of-type:border-0 sm:grid-cols-[minmax(0,1fr)_auto_minmax(70px,16%)]">
      <div className="col-span-full min-w-0 sm:col-span-1">
        <Link
          to={`/courses/${courseId}/read?article=${articleId}`}
          className="hover:text-primary focus-visible:outline-primary flex min-h-11 min-w-0 items-center break-words rounded-lg font-medium focus-visible:outline focus-visible:outline-2"
          aria-label={`Читать материал «${title}»`}
        >
          {title}
        </Link>
        <p className="text-fg-muted flex flex-wrap items-baseline gap-x-3 text-sm">
          <span>{pluralWithCount(progress.cardsTotal, ['карточка', 'карточки', 'карточек'])}</span>
          <LearningStatus progress={progress} courseId={courseId} />
        </p>
      </div>
      {progress.dueNow === 0 && (
        <Link className="material-repeat" to={`/courses/${courseId}/learn`}>
          Учить
        </Link>
      )}
      <div
        className={progress.dueNow > 0 ? 'col-span-full sm:col-span-1 sm:col-start-3' : undefined}
      >
        <div className="flex items-center justify-between text-xs">
          <span className="text-fg-muted">Прогресс</span>
          <span className="font-semibold tabular-nums">
            {progress.loading ? '—' : `${Math.round(progress.studiedPercent)}%`}
          </span>
        </div>
        <ProgressBar progress={progress} className="mt-2" />
      </div>
    </div>
  );
}

function MaterialTreeItem({
  title,
  meta,
  progress,
  active,
  dragProps,
  dragging = false,
  dropEdge,
  onClick,
}: {
  title: string;
  meta: string;
  progress: MaterialProgress;
  active: boolean;
  dragProps?: HTMLAttributes<HTMLDivElement>;
  dragging?: boolean;
  dropEdge?: DropEdge;
  onClick: () => void;
}) {
  return (
    <div
      {...dragProps}
      className={`focus-visible:outline-primary relative mb-1 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${dragProps ? 'cursor-grab active:cursor-grabbing' : ''} ${dragging ? 'opacity-55' : ''}`}
    >
      {dropEdge && <DropIndicator edge={dropEdge} />}
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`group min-h-16 w-full rounded-xl px-3 py-2.5 text-left transition-colors ${active ? 'bg-primary-subtle text-fg' : 'hover:bg-surface-muted text-fg'}`}
      >
        <div className="flex items-start gap-2.5">
          {dragProps && <DragHandle />}
          <div className="min-w-0 flex-1">
            <span className="block break-words text-sm font-semibold">{title}</span>
            <div className="text-fg-muted mt-1 flex items-center gap-2 text-xs">
              <StatusDot progress={progress} />
              <span className="min-w-0 flex-1">
                {progress.dueNow > 0 ? `${progress.dueNow} на повторение` : meta}
              </span>
              <span className="tabular-nums">
                {progress.loading ? '—' : `${Math.round(progress.studiedPercent)}%`}
              </span>
            </div>
            <ProgressBar progress={progress} className="mt-2" />
          </div>
        </div>
      </button>
    </div>
  );
}

function DragHandle() {
  return (
    <span className="text-fg-subtle mt-1.5 grid shrink-0 grid-cols-2 gap-0.5" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} className="h-1 w-1 rounded-full bg-current" />
      ))}
    </span>
  );
}

const statusStyles = {
  urgent: ['text-danger', 'bg-danger-subtle'],
  weak: ['text-warning', 'bg-warning-subtle'],
  learning: ['text-primary', 'bg-primary-subtle'],
  good: ['text-success', 'bg-success-subtle'],
  new: ['text-fg-muted', 'bg-surface-muted'],
} as const;

function LearningStatus({ progress, courseId }: { progress: MaterialProgress; courseId?: string }) {
  const status = learningStatus(progress);
  const [color, background] = statusStyles[status.kind];
  if (courseId && status.kind === 'urgent') {
    return (
      <MaterialActionLink
        to={`/courses/${courseId}/learn`}
        className={color}
        description="повторить карточки"
      >
        {status.label}
      </MaterialActionLink>
    );
  }
  return (
    <span
      className={
        courseId
          ? color
          : `${color} ${background} inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium`
      }
    >
      {status.label}
    </span>
  );
}

function StatusDot({ progress }: { progress: MaterialProgress }) {
  const kind = learningStatus(progress).kind;
  const color =
    kind === 'urgent'
      ? 'bg-danger'
      : kind === 'weak'
        ? 'bg-warning'
        : kind === 'learning'
          ? 'bg-primary'
          : kind === 'good'
            ? 'bg-success'
            : 'bg-fg-subtle';
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} aria-hidden="true" />;
}

function ProgressBar({
  progress,
  className = '',
}: {
  progress: MaterialProgress;
  className?: string;
}) {
  const value = Math.max(0, Math.min(100, progress.studiedPercent));
  return (
    <div
      className={`materials-progress-track h-1.5 overflow-hidden rounded-full ${className}`}
      role="progressbar"
      aria-label="Освоение материала"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <div
        className="materials-progress-fill h-full rounded-full transition-[width] duration-300"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function TreeGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="materials-group-heading flex items-center gap-2 px-2 py-3">
        <span>{title}</span>
        <span>{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-fg-muted px-3 py-5 text-sm">Ничего не найдено</p>
      ) : (
        children
      )}
    </section>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 rounded-lg px-2 text-sm font-medium ${active ? 'bg-primary-subtle text-primary' : 'text-fg-muted hover:bg-surface-muted hover:text-fg'}`}
    >
      {children}
    </button>
  );
}

function ManagementLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="text-fg-muted hover:bg-surface-muted hover:text-fg mt-2 flex min-h-11 items-center rounded-xl px-3 text-sm font-medium"
    >
      {children}
    </Link>
  );
}

function CreateMenu({ onCreateSet }: { onCreateSet: () => void }) {
  return (
    <details className="group relative">
      <summary className="materials-create" aria-label="Создать материал" title="Создать материал">
        <span aria-hidden="true">+</span>
      </summary>
      <div className="border-border bg-surface shadow-pop absolute right-0 z-20 mt-2 w-48 rounded-xl border p-1.5">
        <Link
          to="/courses/new"
          className="hover:bg-surface-muted flex min-h-11 items-center rounded-lg px-3 text-sm font-medium"
        >
          Создать курс
        </Link>
        <button
          type="button"
          onClick={onCreateSet}
          className="hover:bg-surface-muted min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium"
        >
          Создать набор
        </button>
      </div>
    </details>
  );
}

function EmptyMaterials({ view, onCreateSet }: { view: MaterialView; onCreateSet: () => void }) {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-6 text-center">
      <div className="max-w-md">
        <img
          src={bookImage}
          className="material-empty-cover mx-auto h-24 w-24 object-contain"
          alt=""
        />
        <h2 className="mt-5 text-2xl font-semibold">Здесь пока пусто</h2>
        <p className="text-fg-muted mt-2">
          Создайте первый материал — прогресс и подсказки появятся здесь автоматически.
        </p>
        {view === 'courses' ? (
          <Link to="/courses/new">
            <Button className="mt-5">Создать курс</Button>
          </Link>
        ) : (
          <Button className="mt-5" onClick={onCreateSet}>
            Создать набор
          </Button>
        )}
      </div>
    </div>
  );
}

function EmptyBlock({ children }: { children: ReactNode }) {
  return (
    <div className="border-border bg-surface-muted text-fg-muted mt-6 rounded-2xl border px-6 py-10 text-center">
      {children}
    </div>
  );
}

function TreeSkeleton() {
  return (
    <div className="space-y-2 px-2 py-3" aria-label="Загружаем материалы">
      <div className="bg-surface-muted h-16 animate-pulse rounded-xl" />
      <div className="bg-surface-muted h-16 animate-pulse rounded-xl" />
      <div className="bg-surface-muted h-16 animate-pulse rounded-xl" />
    </div>
  );
}

function CourseStructureSkeleton() {
  return (
    <div className="mt-5 space-y-3" aria-label="Загружаем структуру курса">
      <div className="bg-surface-muted h-16 animate-pulse rounded-2xl" />
      <div className="bg-surface-muted h-16 animate-pulse rounded-2xl" />
      <div className="bg-surface-muted h-16 animate-pulse rounded-2xl" />
    </div>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m7 9 5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

async function fetchCourse(courseId: string): Promise<CourseDetail> {
  const { data, error } = await api.GET('/api/v1/courses/{course_id}', {
    params: { path: { course_id: courseId } },
  });
  if (!data || error) throw new Error('Не удалось загрузить структуру курса');
  return data;
}

async function fetchSetStats(setId: string): Promise<SetStats> {
  const { data, error } = await api.GET('/api/v1/study/sets/{set_id}/stats', {
    params: { path: { set_id: setId } },
  });
  if (!data || error) throw new Error('Не удалось загрузить прогресс');
  return data;
}

function fromSetStats(stats: SetStats): MaterialProgress {
  return {
    cardsTotal: stats.cards_total,
    masteredCount: stats.mastered_count,
    learningCount: stats.learning_count,
    studiedCount: stats.mastered_count + stats.learning_count,
    studiedPercent: stats.cards_total
      ? ((stats.mastered_count + stats.learning_count) / stats.cards_total) * 100
      : 0,
    masteryPercent: stats.mastery_percent,
    dueNow: stats.due_now,
    lastStudiedAt: stats.last_studied_at,
  };
}

function weakestSectionIndex(
  sections: CourseDetail['sections'],
  stats: Map<string, SetStats>,
): number {
  let weakest = 0;
  let weakestScore = Number.POSITIVE_INFINITY;
  sections.forEach((section, index) => {
    const progress = aggregateStats(section.articles.map((article) => stats.get(article.set_id)));
    const score = progress.loading
      ? 101
      : progress.masteryPercent +
        progress.studiedPercent * 0.25 -
        Math.min(progress.dueNow, 20) * 2;
    if (score < weakestScore) {
      weakest = index;
      weakestScore = score;
    }
  });
  return weakest;
}

function ownedCourseItem(course: CourseSummary): CourseItem {
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    saved: false,
    hasUpdates: false,
    slug: course.slug,
    orderDate: course.updated_at,
  };
}

function savedCourseItem(course: SavedCourse): CourseItem {
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    saved: true,
    hasUpdates: course.has_updates,
    saveId: course.save_id,
    slug: course.slug,
    author: course.author.display_name || `@${course.author.username}`,
    orderDate: course.saved_at,
  };
}

function ownedSetItem(set: SetSummary, archived: boolean): SetItem {
  return {
    id: set.id,
    title: set.title,
    description: set.description,
    cardsCount: set.cards_count,
    saved: false,
    archived,
    folderId: set.folder_id ?? null,
    hasUpdates: false,
    orderDate: set.updated_at,
  };
}

function savedSetItem(set: SavedSet): SetItem {
  return {
    id: set.id,
    title: set.title,
    description: set.description,
    cardsCount: set.cards_count,
    saved: true,
    archived: false,
    folderId: set.folder_id ?? null,
    hasUpdates: set.has_updates,
    saveId: set.save_id,
    accessVia: set.access_via,
    sourceTitle: set.access_via === 'course' ? set.course_title : set.article_title,
    orderDate: set.saved_at,
  };
}

function savedSetRemovalDescription(item: SetItem): string {
  if (item.accessVia === 'course') {
    return `Набор сохранён вместе с курсом «${item.sourceTitle ?? 'Без названия'}». Курс и все его наборы исчезнут из вашей библиотеки, но оригинал автора и учебный прогресс сохранятся.`;
  }
  if (item.accessVia === 'article') {
    return `Набор сохранён вместе с разделом «${item.sourceTitle ?? 'Без названия'}». Раздел исчезнет из вашей библиотеки, но оригинал автора и учебный прогресс сохранятся.`;
  }
  return 'Набор исчезнет из ваших сохранённых материалов. Оригинал автора и ваш учебный прогресс не удалятся.';
}

function filterBySearch<T extends { title: string }>(items: T[], search: string): T[] {
  const needle = search.trim().toLocaleLowerCase('ru');
  return needle
    ? items.filter((item) => item.title.toLocaleLowerCase('ru').includes(needle))
    : items;
}

function folderName(
  folders: Folder[] | undefined,
  folderId: string | null,
  saved: boolean,
): string {
  if (saved) return 'Сохранённый набор';
  if (!folderId) return 'Без папки';
  return folders?.find((folder) => folder.id === folderId)?.title ?? 'Папка';
}

function viewFromPath(path: string): MaterialView {
  if (path.startsWith('/sets')) return 'sets';
  if (path.startsWith('/library')) return 'library';
  return 'courses';
}

function pathForView(view: MaterialView): string {
  if (view === 'sets' || view === 'archive') return '/sets';
  if (view === 'library') return '/library';
  return '/materials';
}
