import type { components } from '@remora/api-client';
import { Badge, Button, FishMark, Input } from '@remora/ui';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type HTMLAttributes, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
    const { data } = await api.POST('/api/v1/sets', {
      body: {
        title: 'Новый набор',
        description: '',
        visibility: 'private',
        lang_term: 'ru',
        lang_definition: 'ru',
        folder_id: null,
      },
    });
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['library'] }),
        queryClient.invalidateQueries({ queryKey: ['library', 'courses'] }),
        queryClient.invalidateQueries({ queryKey: ['library', 'sets'] }),
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
    <div className="materials-page min-h-[calc(100dvh-4rem)] lg:min-h-dvh">
      <div className="grid min-h-[inherit] lg:grid-cols-[318px_minmax(0,1fr)]">
        <aside
          className={`${mobileDetailOpen ? 'hidden lg:block' : 'block'} border-border bg-surface border-b lg:border-b-0 lg:border-r`}
        >
          <div className="border-border flex items-center justify-between gap-3 border-b px-5 py-5">
            <div>
              <p className="text-fg-subtle text-xs font-semibold uppercase tracking-[0.14em]">
                Навигатор знаний
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Материалы</h1>
            </div>
            <CreateMenu onCreateSet={() => void createSet()} />
          </div>
          <div className="p-4">
            <Input
              type="search"
              aria-label="Поиск по материалам"
              placeholder="Найти курс или набор"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11"
            />
            <nav className="mt-4 grid grid-cols-3 gap-1" aria-label="Разделы материалов">
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

          <div className="max-h-[44dvh] overflow-y-auto px-3 pb-4 lg:max-h-[calc(100dvh-206px)]">
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
                <ManagementLink to="/courses/manage">Другие способы сортировки</ManagementLink>
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
                <button
                  type="button"
                  onClick={() => switchView('archive')}
                  className="text-fg-muted hover:bg-surface-muted mt-3 flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-sm"
                >
                  <span>Архив</span>
                  <span>{archiveItems.length}</span>
                </button>
                <ManagementLink to="/sets/manage">Папки и другие сортировки</ManagementLink>
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

        <main className={`${mobileDetailOpen ? 'block' : 'hidden lg:block'} min-w-0`}>
          {mobileDetailOpen && view !== 'library' && (
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
              course={selectedCourse}
              detail={courseDetailById.get(selectedCourse.id)}
              progress={
                courseProgress.get(selectedCourse.id) ?? { ...emptyProgress, loading: true }
              }
              statsBySetId={statsBySetId}
            />
          )}
          {(view === 'sets' || view === 'archive') && selectedSet && (
            <SetNavigator
              item={selectedSet}
              progress={setProgress.get(selectedSet.id) ?? emptyProgress}
              onRestored={() => {
                void queryClient.invalidateQueries({ queryKey: ['sets'] });
                void queryClient.invalidateQueries({ queryKey: ['sets', 'archived'] });
                switchView('sets');
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
        </main>
      </div>
    </div>
  );
}

function CourseNavigator({
  course,
  detail,
  progress,
  statsBySetId,
}: {
  course: CourseItem;
  detail?: CourseDetail;
  progress: MaterialProgress;
  statsBySetId: Map<string, SetStats>;
}) {
  const sections = detail?.sections ?? [];
  const weakestSection = weakestSectionIndex(sections, statsBySetId);
  return (
    <div>
      <div className="border-border flex min-h-16 items-center border-b px-5 text-sm sm:px-8">
        <span className="text-fg-muted">Материалы</span>
        <span className="text-fg-subtle px-2" aria-hidden="true">
          /
        </span>
        <span className="truncate font-medium">{course.title}</span>
      </div>
      <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
        <section className="grid gap-6 sm:grid-cols-[168px_1fr]">
          <div className="materials-course-cover border-border grid aspect-[1.25] place-items-center overflow-hidden rounded-2xl border sm:aspect-square">
            <FishMark className="h-28 w-28 opacity-90 sm:h-32 sm:w-32" />
          </div>
          <div className="min-w-0 self-center">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{course.saved ? 'Сохранённый курс' : 'Ваш курс'}</Badge>
              {course.hasUpdates && <Badge tone="warning">Есть обновление</Badge>}
            </div>
            <Link
              to={`/courses/${course.id}/read`}
              className="focus-visible:outline-primary group mt-4 inline-block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
              aria-label={`Читать курс «${course.title}»`}
            >
              <h2 className="group-hover:text-primary text-3xl font-semibold tracking-tight sm:text-4xl">
                {course.title}
              </h2>
              <span className="text-primary mt-2 inline-flex text-sm font-semibold">
                Читать курс →
              </span>
            </Link>
            <p className="text-fg-muted mt-3 max-w-2xl">
              {course.description || 'Описание пока не добавлено.'}
            </p>
            {course.author && <p className="text-fg-subtle mt-2 text-sm">Автор: {course.author}</p>}
          </div>
        </section>

        <section className="border-border mt-8 grid gap-5 border-y py-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-fg-muted text-sm">Прогресс курса</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {progress.loading ? '—' : `${Math.round(progress.studiedPercent)}%`}
                </p>
              </div>
              <LearningStatus progress={progress} />
            </div>
            <ProgressBar progress={progress} className="mt-4" />
            <p className="text-fg-muted mt-2 text-sm">
              {progress.studiedCount} из {progress.cardsTotal} карточек изучались ·{' '}
              {progress.masteredCount} закреплено
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {course.hasUpdates && course.saveId && (
              <LibraryUpdateControl saveId={course.saveId} title={course.title} />
            )}
            <Link to={`/courses/${course.id}/learn`} className="inline-flex">
              <Button size="lg">Продолжить курс</Button>
            </Link>
            {!course.saved && (
              <Link to={`/courses/${course.id}/edit`} className="inline-flex">
                <Button size="lg" variant="secondary">
                  Настроить
                </Button>
              </Link>
            )}
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-fg-subtle text-xs font-semibold uppercase tracking-[0.14em]">
                Структура
              </p>
              <h3 className="mt-1 text-2xl font-semibold">Разделы курса</h3>
            </div>
            <p className="text-fg-muted text-sm">Сначала показан проседающий раздел</p>
          </div>
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
                  <summary className="hover:bg-surface-muted flex min-h-16 cursor-pointer list-none items-center gap-4 rounded-2xl px-4 py-3 sm:px-5">
                    <span className="text-fg-subtle w-6 text-center text-sm tabular-nums">
                      {String(sectionIndex + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{section.title}</span>
                        <LearningStatus progress={sectionProgress} compact />
                      </div>
                      <ProgressBar progress={sectionProgress} className="mt-2" />
                    </div>
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
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function SetNavigator({
  item,
  progress,
  onRestored,
}: {
  item: SetItem;
  progress: MaterialProgress;
  onRestored: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function restore() {
    setBusy(true);
    const { error } = await api.POST('/api/v1/sets/{set_id}/restore', {
      params: { path: { set_id: item.id } },
    });
    setBusy(false);
    if (!error) onRestored();
  }
  return (
    <div>
      <div className="border-border flex min-h-16 items-center border-b px-5 text-sm sm:px-8">
        <span className="text-fg-muted">Материалы</span>
        <span className="text-fg-subtle px-2" aria-hidden="true">
          /
        </span>
        <span className="truncate font-medium">{item.title}</span>
      </div>
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>
            {item.archived ? 'В архиве' : item.saved ? 'Сохранённый набор' : 'Ваш набор'}
          </Badge>
          {item.hasUpdates && <Badge tone="warning">Есть обновление</Badge>}
        </div>
        <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">{item.title}</h2>
        <p className="text-fg-muted mt-3 max-w-2xl">
          {item.description || 'Описание пока не добавлено.'}
        </p>

        {!item.archived && (
          <section className="border-border bg-surface mt-8 rounded-2xl border p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-fg-muted text-sm">Прогресс набора</p>
                <p className="mt-1 text-4xl font-semibold tabular-nums">
                  {progress.loading ? '—' : `${Math.round(progress.studiedPercent)}%`}
                </p>
              </div>
              <LearningStatus progress={progress} />
            </div>
            <ProgressBar progress={progress} className="mt-5" />
            <p className="text-fg-muted mt-3 text-sm">
              {progress.studiedCount} изучались · {progress.masteredCount} закреплено ·{' '}
              {progress.dueNow} ждут повторения · {item.cardsCount} всего
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to={`/sets/${item.id}/learn`}>
                <Button size="lg">Продолжить</Button>
              </Link>
              <Link to={`/sets/${item.id}/flashcards`}>
                <Button size="lg" variant="secondary">
                  Карточки
                </Button>
              </Link>
              {!item.saved && (
                <Link to={`/sets/${item.id}/edit`}>
                  <Button size="lg" variant="ghost">
                    Редактировать
                  </Button>
                </Link>
              )}
            </div>
          </section>
        )}
        {item.archived && (
          <section className="border-border bg-surface mt-8 rounded-2xl border p-6">
            <h3 className="text-xl font-semibold">Набор находится в архиве</h3>
            <p className="text-fg-muted mt-2">Восстановите его, чтобы снова продолжить обучение.</p>
            <Button className="mt-5" loading={busy} onClick={() => void restore()}>
              Восстановить
            </Button>
          </section>
        )}
      </div>
    </div>
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
          <a href={`${import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000'}/kursy`}>
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
                    <h3 className="mt-3 truncate text-lg font-semibold">{title}</h3>
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
          <p className="truncate text-sm font-medium">{item.title}</p>
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
    <div className="border-border grid gap-3 border-b py-4 last:border-0 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-center">
      <div className="min-w-0">
        <Link
          to={`/courses/${courseId}/read?article=${articleId}`}
          className="group/read focus-visible:outline-primary flex min-h-11 min-w-0 items-center gap-2 rounded-lg font-medium focus-visible:outline focus-visible:outline-2"
          aria-label={`Читать материал «${title}»`}
        >
          <span className="group-hover/read:text-primary truncate">{title}</span>
          <span className="text-primary shrink-0 text-xs font-semibold">Читать →</span>
        </Link>
        <p className="text-fg-muted text-sm">{progress.cardsTotal} карточек</p>
      </div>
      <div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-fg-muted">Прогресс</span>
          <span className="font-semibold tabular-nums">
            {progress.loading ? '—' : `${Math.round(progress.studiedPercent)}%`}
          </span>
        </div>
        <ProgressBar progress={progress} className="mt-2" />
      </div>
      <Link to={`/courses/${courseId}/learn`}>
        <Button size="sm" variant={progress.dueNow > 0 ? 'primary' : 'secondary'}>
          {progress.dueNow > 0 ? `Повторить ${progress.dueNow}` : 'Учить'}
        </Button>
      </Link>
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
        className={`group min-h-16 w-full rounded-xl px-3 py-2.5 text-left transition-colors ${active ? 'bg-primary-subtle text-fg' : 'hover:bg-surface-muted text-fg'}`}
      >
        <div className="flex items-start gap-2.5">
          {dragProps && <DragHandle />}
          <StatusDot progress={progress} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <span className="truncate text-sm font-semibold">{title}</span>
              <span className="text-fg-muted shrink-0 text-xs tabular-nums">
                {progress.loading ? '—' : `${Math.round(progress.studiedPercent)}%`}
              </span>
            </div>
            <p className="text-fg-muted mt-0.5 truncate text-xs">
              {progress.dueNow > 0 ? `${progress.dueNow} ждут повторения` : meta}
            </p>
            <ProgressBar progress={progress} className="mt-2" />
          </div>
        </div>
      </button>
    </div>
  );
}

function DragHandle() {
  return (
    <span className="text-fg-subtle mt-0.5 grid shrink-0 grid-cols-2 gap-0.5" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} className="h-1 w-1 rounded-full bg-current" />
      ))}
    </span>
  );
}

function LearningStatus({
  progress,
  compact = false,
}: {
  progress: MaterialProgress;
  compact?: boolean;
}) {
  const status = learningStatus(progress);
  const tone =
    status.kind === 'urgent'
      ? 'text-danger bg-danger-subtle'
      : status.kind === 'weak'
        ? 'text-warning bg-warning-subtle'
        : status.kind === 'learning'
          ? 'text-primary bg-primary-subtle'
          : status.kind === 'good'
            ? 'text-success bg-success-subtle'
            : 'text-fg-muted bg-surface-muted';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${compact ? 'text-xs' : 'text-sm'} ${tone}`}
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
  return (
    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${color}`} aria-hidden="true" />
  );
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
      <div className="text-fg-muted flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em]">
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
      <summary
        className="bg-primary text-primary-fg hover:bg-primary-hover grid h-11 w-11 cursor-pointer list-none place-items-center rounded-xl text-2xl"
        aria-label="Создать материал"
      >
        +
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
        <FishMark className="mx-auto h-24 w-24 opacity-70" />
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
    orderDate: set.saved_at,
  };
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
