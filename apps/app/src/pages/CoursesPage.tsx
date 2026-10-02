import type { components } from '@remora/api-client';
import { Badge, Button, Card, Input } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { CoursePublicationPanel } from './CoursePublicationPanel';
import { CopyCourseButton } from './CourseReaderPage';
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

type Course = components['schemas']['CourseDetail'];
const WEB_URL = import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000';
const linkStyle =
  'text-primary inline-flex min-h-11 items-center rounded-lg underline focus-visible:outline focus-visible:outline-2';
const primaryActionStyle =
  'bg-primary text-primary-fg hover:bg-primary-hover focus-visible:outline-primary inline-flex min-h-11 items-center justify-center rounded-md px-4 font-medium transition-colors focus-visible:outline focus-visible:outline-2';
const secondaryActionStyle =
  'border-border bg-surface text-fg hover:bg-surface-muted focus-visible:outline-primary inline-flex min-h-11 items-center justify-center rounded-md border px-4 font-medium transition-colors focus-visible:outline focus-visible:outline-2';
const fieldStyle =
  'border-border bg-surface w-full rounded-xl border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';

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
          Объединяйте учебные материалы в курсы и делитесь ими после публикации.
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
                    {course.has_updates && <Badge tone="warning">Есть обновление</Badge>}
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
                    <LibraryUpdateControl saveId={course.save_id} title={course.title} />
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

export function CoursePage() {
  const { courseId = '' } = useParams();
  const course = useQuery({
    queryKey: ['course', courseId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/courses/{course_id}', {
        params: { path: { course_id: courseId } },
      });
      if (!data || error) throw failure(error);
      return data;
    },
  });
  return (
    <div className="space-y-6">
      <Link to="/courses" className={linkStyle}>
        Все курсы
      </Link>
      {course.isPending && <p role="status">Загружаем курс…</p>}
      {course.isError && (
        <div role="alert">
          <p>Курс недоступен или не удалось подключиться к серверу.</p>
          <Button className="min-h-11" variant="secondary" onClick={() => void course.refetch()}>
            Повторить
          </Button>
        </div>
      )}
      {course.data && <CourseForm key={course.data.id} course={course.data} />}
    </div>
  );
}

export function NewCoursePage() {
  return (
    <div className="space-y-6">
      <Link to="/courses" className={linkStyle}>
        Все курсы
      </Link>
      <CourseForm />
    </div>
  );
}

function CourseForm({ course }: { course?: Course }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [title, setTitle] = useState(course?.title ?? '');
  const [description, setDescription] = useState(course?.description ?? '');
  const [setId, setSetId] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sets = useQuery({
    queryKey: ['sets'],
    enabled: !course,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/sets');
      if (!data || error) throw failure(error);
      return data;
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const metadata = { title: title.trim(), description };
      const result = course
        ? await api.PUT('/api/v1/courses/{course_id}', {
            params: { path: { course_id: course.id } },
            body: metadata,
          })
        : await api.POST('/api/v1/courses', { body: { ...metadata, set_id: setId || null } });
      if (!result.data || result.error) throw failure(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      client.setQueryData(['course', data.id], data);
      void client.invalidateQueries({ queryKey: ['courses'] });
      setSaved(true);
      if (!course) navigate(`/courses/${data.id}/edit`, { replace: true });
    },
  });
  const remove = useMutation({
    mutationFn: async () => {
      if (!course) throw new Error('Курс не найден');
      const { error } = await api.DELETE('/api/v1/courses/{course_id}', {
        params: { path: { course_id: course.id } },
      });
      if (error) throw failure(error);
    },
    onSuccess: async () => {
      if (!course) return;
      client.removeQueries({ queryKey: ['course', course.id] });
      await client.invalidateQueries({ queryKey: ['courses'] });
      navigate('/courses', { replace: true });
    },
  });
  return (
    <>
      <h1 className="text-3xl font-semibold">{course ? 'Настройки курса' : 'Новый курс'}</h1>
      <form
        className="max-w-2xl space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim() && !save.isPending) save.mutate();
        }}
        onChange={() => {
          setSaved(false);
          save.reset();
        }}
      >
        <fieldset disabled={save.isPending} className="space-y-5">
          <div>
            <label htmlFor="course-title" className="mb-2 block text-sm font-medium">
              Название курса
            </label>
            <Input
              id="course-title"
              className="min-h-11"
              required
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="course-description" className="mb-2 block text-sm font-medium">
              Описание
            </label>
            <textarea
              id="course-description"
              className={fieldStyle}
              rows={4}
              maxLength={5000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          {!course && (
            <div>
              <label htmlFor="course-set" className="mb-2 block text-sm font-medium">
                Первый набор карточек
              </label>
              <select
                id="course-set"
                className={fieldStyle}
                value={setId}
                onChange={(event) => setSetId(event.target.value)}
              >
                <option value="">Создать новый пустой набор</option>
                {sets.data?.map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.title}
                  </option>
                ))}
              </select>
              <p className="text-fg-muted mt-2 text-sm">
                Набор можно включить только в один курс. Карточки остаются в вашем редакторе.
              </p>
              {sets.isPending && <p role="status">Загружаем наборы…</p>}
              {sets.isError && (
                <div role="alert">
                  <p>{sets.error.message}</p>
                  <Button
                    className="min-h-11"
                    type="button"
                    variant="secondary"
                    onClick={() => void sets.refetch()}
                  >
                    Повторить
                  </Button>
                </div>
              )}
              {sets.data?.length === 0 && (
                <Link className={linkStyle} to="/sets">
                  Открыть мои наборы
                </Link>
              )}
            </div>
          )}
          <Button
            className="min-h-11"
            type="submit"
            loading={save.isPending}
            disabled={!title.trim()}
          >
            {course ? 'Сохранить' : 'Создать курс'}
          </Button>
        </fieldset>
        {save.isError && (
          <p role="alert" className="text-danger">
            {save.error.message}
          </p>
        )}
        <p role="status" className="text-success">
          {saved ? 'Изменения сохранены' : ''}
        </p>
      </form>
      {course && (
        <CoursePublicationPanel
          course={course}
          hasUnsavedChanges={
            save.isPending || title.trim() !== course.title || description !== course.description
          }
        />
      )}
      {course && (
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Материалы курса</h2>
          <div className="flex flex-wrap gap-5">
            <Link className={linkStyle} to={`/courses/${course.id}/read`}>
              Читать курс
            </Link>
            <Link className={linkStyle} to={`/courses/${course.id}/structure`}>
              Редактировать структуру
            </Link>
          </div>
          <CopyCourseButton courseId={course.id} />
          {course.sections.map((section) => (
            <Card key={section.id}>
              <h3 className="text-lg font-semibold">{section.title}</h3>
              <ul>
                {section.articles.map((article) => (
                  <li key={article.id} className="mt-3">
                    <p className="break-words">{article.title}</p>
                    <div className="flex flex-wrap gap-x-5">
                      <Link
                        className={linkStyle}
                        to={`/courses/${course.id}/read?article=${article.id}`}
                      >
                        Читать и пройти квиз
                      </Link>
                      <Link
                        className={linkStyle}
                        to={`/courses/${course.id}/materials/${article.id}/edit`}
                      >
                        Редактировать материал
                      </Link>
                      <Link className={linkStyle} to={`/sets/${article.set_id}`}>
                        Открыть набор
                      </Link>
                      <Link className={linkStyle} to={`/sets/${article.set_id}/edit`}>
                        Редактировать карточки
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </section>
      )}
      {course && (
        <Card className="border-danger/40 max-w-2xl space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">Удаление курса</h2>
            <p className="text-fg-muted mt-2">
              Курс, его статьи и сохранения у других пользователей будут удалены. Наборы карточек
              переместятся в архив вместе с вашим учебным прогрессом.
            </p>
          </div>
          {confirmDelete ? (
            <div className="space-y-3">
              <p>Удалить курс «{course.title}»? Это действие нельзя отменить.</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  className="min-h-11"
                  variant="danger"
                  loading={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  Подтвердить удаление
                </Button>
                <Button
                  className="min-h-11"
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => {
                    setConfirmDelete(false);
                    remove.reset();
                  }}
                >
                  Отмена
                </Button>
              </div>
            </div>
          ) : (
            <Button className="min-h-11" variant="danger" onClick={() => setConfirmDelete(true)}>
              Удалить курс
            </Button>
          )}
          {remove.isError && (
            <p role="alert" className="text-danger">
              {remove.error instanceof TypeError
                ? 'Нет соединения с сервером. Повторите попытку.'
                : remove.error.message}
            </p>
          )}
        </Card>
      )}
    </>
  );
}
