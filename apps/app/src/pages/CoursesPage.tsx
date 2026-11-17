import { Badge, Button, Card } from '@remora/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  DropIndicator,
  ListSort,
  moveCustomItem,
  moveCustomItemTo,
  sortItems,
  useCustomOrder,
  useDragOrder,
  useListSort,
} from '../features/library/ListSort';
import { LibraryUpdateControl } from '../features/library/LibraryUpdateControl';

const WEB_URL = import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000';
const primaryActionStyle =
  'bg-primary text-primary-fg hover:bg-primary-hover focus-visible:outline-primary inline-flex min-h-11 items-center justify-center rounded-md px-4 font-medium transition-colors focus-visible:outline focus-visible:outline-2';
const secondaryActionStyle =
  'border-border bg-surface text-fg hover:bg-surface-muted focus-visible:outline-primary inline-flex min-h-11 items-center justify-center rounded-md border px-4 font-medium transition-colors focus-visible:outline focus-visible:outline-2';
function failure(error: unknown): Error {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'CONFLICT') {
    return new Error('Этот набор уже входит в курс. Выберите другой набор.');
  }
  return new Error('Не удалось выполнить запрос. Проверьте соединение и повторите попытку.');
}

export function CoursesPage() {
  const [origin, setOrigin] = useState<'all' | 'owned' | 'saved'>('all');
  const [sortMode, setSortMode] = useListSort('remora:sort:courses', 'custom', false);
  const [customOrder, setCustomOrder] = useCustomOrder('remora:order:courses');
  const courses = useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/courses');
      if (!data || error) throw failure(error);
      return data;
    },
  });
  const savedCourses = useQuery({
    queryKey: ['library', 'courses'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/library/courses');
      if (!data || error) throw failure(error);
      return data;
    },
  });
  const isEmpty =
    !courses.isPending &&
    !savedCourses.isPending &&
    (origin === 'saved'
      ? savedCourses.data?.length === 0
      : origin === 'owned'
        ? courses.data?.length === 0
        : courses.data?.length === 0 && savedCourses.data?.length === 0);
  const sortedCourses = useMemo(
    () =>
      sortItems(
        courses.data ?? [],
        sortMode,
        (course) => ({
          id: course.id,
          title: course.title,
          date: course.updated_at,
        }),
        customOrder,
      ),
    [courses.data, customOrder, sortMode],
  );
  const sortedSavedCourses = useMemo(
    () =>
      sortItems(
        savedCourses.data ?? [],
        sortMode,
        (course) => ({
          id: course.id,
          title: course.title,
          date: course.saved_at,
          size: course.cards_count,
        }),
        customOrder,
      ),
    [customOrder, savedCourses.data, sortMode],
  );
  const allOrderedIds = [...sortedCourses, ...sortedSavedCourses].map((course) => course.id);
  const visibleOwnedIds = origin === 'saved' ? [] : sortedCourses.map((course) => course.id);
  const visibleSavedIds = origin === 'owned' ? [] : sortedSavedCourses.map((course) => course.id);

  function moveCourse(courseId: string, direction: -1 | 1) {
    const visibleIds = visibleOwnedIds.includes(courseId) ? visibleOwnedIds : visibleSavedIds;
    setCustomOrder(moveCustomItem(allOrderedIds, visibleIds, courseId, direction));
  }
  const moveCourseByDrag = (courseId: string, targetId: string, afterTarget: boolean) => {
    setCustomOrder(moveCustomItemTo(allOrderedIds, courseId, targetId, afterTarget));
  };
  const ownedCourseDrag = useDragOrder(moveCourseByDrag, visibleOwnedIds, moveCourse);
  const savedCourseDrag = useDragOrder(moveCourseByDrag, visibleSavedIds, moveCourse);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Мои курсы</h1>
        <p className="text-fg-muted mt-2">
          Новые курсы публичны. Ссылкой на курс можно поделиться сразу.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className={primaryActionStyle} to="/courses/new">
            Создать курс
          </Link>
          <a className={secondaryActionStyle} href={`${WEB_URL}/kursy`}>
            Найти курсы
          </a>
        </div>
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Фильтр курсов">
          {(
            [
              ['all', 'Все'],
              ['owned', 'Созданные мной'],
              ['saved', 'Сохранённые'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={origin === value ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={origin === value}
              onClick={() => setOrigin(value)}
            >
              {label}
            </Button>
          ))}
        </nav>
        {origin === 'saved' && (
          <Link
            to="/library/manage"
            className="text-primary inline-flex min-h-11 items-center text-sm underline underline-offset-2"
          >
            Управлять сохранениями
          </Link>
        )}
      </header>
      {(courses.isPending || savedCourses.isPending) && <p role="status">Загружаем курсы…</p>}
      {(courses.isError || savedCourses.isError) && (
        <div role="alert">
          <p>{courses.error?.message ?? savedCourses.error?.message}</p>
          <Button className="min-h-11" variant="secondary" onClick={() => void courses.refetch()}>
            Повторить
          </Button>
        </div>
      )}
      {isEmpty && (
        <Card>
          <h2 className="text-xl font-semibold">Ваш первый курс</h2>
          <p className="text-fg-muted mt-2">
            Создайте курс с нуля или выберите свой набор карточек как первый материал.
          </p>
        </Card>
      )}
      <div className="flex justify-end">
        <ListSort
          value={sortMode}
          onChange={setSortMode}
          label="Сортировка курсов"
          includeSize={false}
        />
      </div>
      {sortMode === 'custom' && (
        <p className="text-fg-muted text-sm">
          Перетаскивайте карточки. Новые курсы будут появляться сверху.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {origin !== 'saved' &&
          sortedCourses.map((course) => (
            <div
              key={course.id}
              {...(sortMode === 'custom'
                ? ownedCourseDrag.getDragProps(course.id, course.title)
                : {})}
              className={`focus-visible:outline-primary relative transition-opacity focus-visible:outline focus-visible:outline-2 ${
                sortMode === 'custom' ? 'cursor-grab active:cursor-grabbing' : ''
              } ${ownedCourseDrag.draggedId === course.id ? 'opacity-40' : ''}`}
            >
              {ownedCourseDrag.dropTarget?.id === course.id && (
                <DropIndicator edge={ownedCourseDrag.dropTarget.edge} />
              )}
              <Card className="h-full break-words">
                <Link
                  to={`/courses/${course.id}`}
                  draggable={sortMode !== 'custom'}
                  className="focus-visible:outline-primary block rounded-lg focus-visible:outline focus-visible:outline-2"
                >
                  <Badge>Ваш курс</Badge>
                  <h2 className="text-xl font-semibold">{course.title}</h2>
                  <p className="text-fg-muted mt-2 line-clamp-3">
                    {course.description || 'Описание пока не добавлено'}
                  </p>
                  <p className="text-fg-subtle mt-4 text-sm">
                    Изменён {new Date(course.updated_at).toLocaleDateString('ru-RU')}
                  </p>
                </Link>
              </Card>
            </div>
          ))}
        {origin !== 'owned' &&
          sortedSavedCourses.map((course) => (
            <div
              key={course.id}
              {...(sortMode === 'custom'
                ? savedCourseDrag.getDragProps(course.id, course.title)
                : {})}
              className={`focus-visible:outline-primary relative transition-opacity focus-visible:outline focus-visible:outline-2 ${
                sortMode === 'custom' ? 'cursor-grab active:cursor-grabbing' : ''
              } ${savedCourseDrag.draggedId === course.id ? 'opacity-40' : ''}`}
            >
              {savedCourseDrag.dropTarget?.id === course.id && (
                <DropIndicator edge={savedCourseDrag.dropTarget.edge} />
              )}
              <Card className="h-full break-words">
                <Link
                  to={`/courses/${course.id}`}
                  draggable={sortMode !== 'custom'}
                  className="focus-visible:outline-primary block rounded-lg focus-visible:outline focus-visible:outline-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>Сохранённый</Badge>
                  </div>
                  <h2 className="mt-3 text-xl font-semibold">{course.title}</h2>
                  <p className="text-fg-muted mt-2 line-clamp-3">
                    {course.description || 'Описание пока не добавлено'}
                  </p>
                  <p className="text-fg-subtle mt-4 text-sm">
                    Автор: {course.author.display_name || `@${course.author.username}`} ·{' '}
                    {course.cards_count} карточек
                  </p>
                </Link>
                <div className="mt-5 flex flex-wrap gap-2">
                  {course.has_updates && (
                    <LibraryUpdateControl
                      saveId={course.save_id}
                      title={course.title}
                      targetType="course"
                    />
                  )}
                  <Link to={`/courses/${course.id}/learn`}>
                    <Button size="sm">Учить весь курс</Button>
                  </Link>
                  <Link to={`/courses/${course.id}`}>
                    <Button size="sm" variant="secondary">
                      Открыть курс
                    </Button>
                  </Link>
                  <a href={`${WEB_URL}/kurs/${course.slug}`}>
                    <Button size="sm" variant="ghost">
                      Публичная страница
                    </Button>
                  </a>
                </div>
              </Card>
            </div>
          ))}
      </div>
    </div>
  );
}
