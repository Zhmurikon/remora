import type { components } from '@remora/api-client';
import { pluralWithCount } from '@remora/core';
import { Button, Input } from '@remora/ui';
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
import {
  materialSortLabels,
  sortMaterials,
  useMaterialSort,
} from '../features/materials/material-sort';
import { FolderPicker } from '../features/materials/FolderPicker';
import { createEmptySet } from '../features/materials/create-empty-set';
import { SavedMaterialSource } from '../features/library/SavedMaterialSource';
import {
  DropIndicator,
  moveCustomItem,
  moveCustomItemTo,
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
import { SetDetails } from '../features/materials/SetDetails';
import { setStatsQuery } from '../features/materials/set-queries';
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
type Folder = components['schemas']['FolderPublic'];
type MaterialView = 'courses' | 'sets' | 'archive';

type CourseItem = {
  id: string;
  title: string;
  description: string;
  saved: boolean;
  hasUpdates: boolean;
  saveId?: string;
  slug: string;
  author?: string;
  addedAt: string;
  orderDate: string;
};

type SetItem = {
  id: string;
  title: string;
  description: string;
  saved: boolean;
  archived: boolean;
  folderId: string | null;
  saveId?: string;
  source?: SavedSet;
  addedAt: string;
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
  const [folder, setFolder] = useState('all');
  const [search, setSearch] = useState('');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [courseSort, selectCourseSort] = useMaterialSort('courses');
  const [setSort, selectSetSort] = useMaterialSort('sets');
  const [courseOrder, setCourseOrder] = useCustomOrder('remora:order:courses');
  const [setOrder, setSetOrder] = useCustomOrder('remora:order:sets');

  useEffect(() => {
    setView(viewFromPath(location.pathname));
    setSelectedId(null);
    setMobileDetailOpen(false);
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
    queries: allSetIds.map(setStatsQuery),
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
    () => sortMaterials(courseItems, courseSort, courseOrder, courseProgress),
    [courseItems, courseSort, courseOrder, courseProgress],
  );
  const orderedSets = useMemo(
    () => sortMaterials(setItems, setSort, setOrder, setProgress),
    [setItems, setSort, setOrder, setProgress],
  );
  const filteredCourses = filterBySearch(orderedCourses, search);
  const matchingSets = filterBySearch(orderedSets, search);
  const activeFolder =
    folder === 'none' || folders.data?.some((item) => item.id === folder) ? folder : 'all';
  const filteredSets =
    activeFolder === 'all'
      ? matchingSets
      : matchingSets.filter((item) => (item.folderId ?? 'none') === activeFolder);
  const setsEmptyMessage = search.trim() ? 'Ничего не найдено' : 'В этой папке пока нет наборов';
  const filteredArchive = filterBySearch(archiveItems, search);
  const selectedCourse =
    filteredCourses.find((item) => item.id === selectedId) ?? filteredCourses[0];
  const visibleSets = view === 'archive' ? filteredArchive : filteredSets;
  const selectedSet = visibleSets.find((item) => item.id === selectedId) ?? visibleSets[0];

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
    setMobileDetailOpen(false);
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

  const loading = [courses, savedCourses, sets, savedSets, archivedSets].some(
    (query) => query.isPending,
  );
  const failed = [courses, savedCourses, sets, savedSets, archivedSets].some(
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
                <TreeGroup
                  title="Мои курсы"
                  count={filteredCourses.length}
                  sortControl={
                    <QuickSort
                      label="Сортировка курсов"
                      mode={courseSort}
                      onChange={selectCourseSort}
                    />
                  }
                >
                  {filteredCourses.map((course) => (
                    <MaterialTreeItem
                      key={course.id}
                      title={course.title}
                      meta={course.saved ? 'Сохранённый курс' : 'Ваш курс'}
                      progress={courseProgress.get(course.id) ?? emptyProgress}
                      active={selectedCourse?.id === course.id}
                      dragProps={
                        courseSort === 'custom'
                          ? courseDrag.getDragProps(course.id, course.title)
                          : undefined
                      }
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
                <TreeGroup
                  title={
                    <FolderPicker
                      folders={folders.data ?? []}
                      items={matchingSets}
                      value={activeFolder}
                      onChange={setFolder}
                    />
                  }
                  emptyMessage={activeFolder !== 'all' ? setsEmptyMessage : undefined}
                  count={filteredSets.length}
                  sortControl={
                    <QuickSort label="Сортировка наборов" mode={setSort} onChange={selectSetSort} />
                  }
                >
                  {filteredSets.map((set) => (
                    <MaterialTreeItem
                      key={set.id}
                      title={set.title}
                      meta={folderName(folders.data, set.folderId, set.saved)}
                      progress={setProgress.get(set.id) ?? emptyProgress}
                      active={selectedSet?.id === set.id}
                      dragProps={
                        setSort === 'custom' ? setDrag.getDragProps(set.id, set.title) : undefined
                      }
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
                {folders.isError && (
                  <p className="text-fg-muted px-2 text-sm" role="alert">
                    Не удалось загрузить папки.{' '}
                    <button
                      type="button"
                      className="min-h-11 underline"
                      onClick={() => void folders.refetch()}
                    >
                      Повторить
                    </button>
                  </p>
                )}
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
                    active={selectedSet?.id === set.id}
                    onClick={() => {
                      setSelectedId(set.id);
                      setMobileDetailOpen(true);
                    }}
                  />
                ))}
              </TreeGroup>
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
          {!loading &&
            !(view === 'courses' ? selectedCourse : selectedSet) &&
            (view === 'sets' && (activeFolder !== 'all' || search.trim()) ? (
              <EmptyBlock>{setsEmptyMessage}</EmptyBlock>
            ) : (
              <EmptyMaterials view={view} onCreateSet={() => void createSet()} />
            ))}
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
        {course.saved && course.saveId && course.author && (
          <SavedMaterialSource
            slug={course.slug}
            sourceLabel="Источник:"
            linkText="Оригинал курса"
            author={course.author}
            saveId={course.saveId}
            hasUpdates={course.hasUpdates}
            title={course.title}
            targetType="course"
          />
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
  onRestored,
  deleting,
  deleteError,
  onDelete,
}: {
  item: SetItem;
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
  return (
    <div className="material-course material-set">
      {item.archived ? (
        <>
          <section className="material-folder">
            <span className="material-tab">В архиве</span>
            <img className="material-cover" src={cardsImage} width="90" height="100" alt="" />
            <h2>{item.title}</h2>
            <MaterialDescription description={item.description} />
          </section>
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
        </>
      ) : (
        <SetDetails setId={item.id} librarySource={item.source ?? null} />
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
              ? item.source?.access_via === 'course'
                ? 'Убрать курс из сохранённых'
                : item.source?.access_via === 'article'
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
      </button>
    </div>
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

function QuickSort({
  label,
  mode,
  onChange,
}: {
  label: string;
  mode: keyof typeof materialSortLabels;
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="material-quick-sort"
      value={mode}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
    >
      {Object.entries(materialSortLabels).map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </select>
  );
}

function TreeGroup({
  title,
  count,
  emptyMessage = 'Ничего не найдено',
  sortControl,
  children,
}: {
  title: ReactNode;
  emptyMessage?: string;
  count: number;
  sortControl?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="materials-group-heading flex items-center gap-2 px-2 py-3">
        {typeof title === 'string' ? <span>{title}</span> : title}
        <span className="material-group-count">{count}</span>
        {sortControl}
      </div>
      {count === 0 ? <p className="text-fg-muted px-3 py-5 text-sm">{emptyMessage}</p> : children}
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
    addedAt: course.created_at,
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
    addedAt: course.saved_at,
    orderDate: course.saved_at,
  };
}

function ownedSetItem(set: SetSummary, archived: boolean): SetItem {
  return {
    id: set.id,
    title: set.title,
    description: set.description,
    saved: false,
    archived,
    folderId: set.folder_id ?? null,
    addedAt: set.created_at,
    orderDate: set.updated_at,
  };
}

function savedSetItem(set: SavedSet): SetItem {
  return {
    id: set.id,
    title: set.title,
    description: set.description,
    saved: true,
    archived: false,
    folderId: set.folder_id ?? null,
    saveId: set.save_id,
    source: set,
    addedAt: set.saved_at,
    orderDate: set.saved_at,
  };
}

function savedSetRemovalDescription(item: SetItem): string {
  if (item.source?.access_via === 'course') {
    return `Набор сохранён вместе с курсом «${item.source.course_title}». Курс и все его наборы исчезнут из вашей библиотеки, но оригинал автора и учебный прогресс сохранятся.`;
  }
  if (item.source?.access_via === 'article') {
    return `Набор сохранён вместе с разделом «${item.source.article_title}». Раздел исчезнет из вашей библиотеки, но оригинал автора и учебный прогресс сохранятся.`;
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
  return 'courses';
}

function pathForView(view: MaterialView): string {
  if (view === 'sets' || view === 'archive') return '/sets';
  return '/materials';
}
