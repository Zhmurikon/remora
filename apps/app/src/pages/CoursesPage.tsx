import type { components } from '@remora/api-client';
import { Button, Card, Input } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { CoursePublicationPanel } from './CoursePublicationPanel';

type Course = components['schemas']['CourseDetail'];
const linkStyle =
  'text-primary inline-flex min-h-11 items-center rounded-lg underline focus-visible:outline focus-visible:outline-2';
const fieldStyle =
  'border-border bg-surface w-full rounded-xl border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';

function failure(error: unknown): Error {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'CONFLICT') {
    return new Error('Этот набор уже входит в курс. Выберите другой набор.');
  }
  return new Error('Не удалось выполнить запрос. Проверьте соединение и повторите попытку.');
}

export function CoursesPage() {
  const courses = useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/courses');
      if (!data || error) throw failure(error);
      return data;
    },
  });
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Мои курсы</h1>
        <p className="text-fg-muted mt-2">
          Объединяйте учебные материалы в курсы и делитесь ими после публикации.
        </p>
        <Link className={linkStyle} to="/courses/new">
          Создать курс
        </Link>
      </header>
      {courses.isPending && <p role="status">Загружаем курсы…</p>}
      {courses.isError && (
        <div role="alert">
          <p>{courses.error.message}</p>
          <Button className="min-h-11" variant="secondary" onClick={() => void courses.refetch()}>
            Повторить
          </Button>
        </div>
      )}
      {courses.data?.length === 0 && (
        <Card>
          <h2 className="text-xl font-semibold">Ваш первый курс</h2>
          <p className="text-fg-muted mt-2">
            Выберите свой набор карточек — он станет первым материалом курса.
          </p>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {courses.data?.map((course) => (
          <Link
            key={course.id}
            to={`/courses/${course.id}`}
            className="focus-visible:outline-primary rounded-xl focus-visible:outline focus-visible:outline-2"
          >
            <Card interactive className="h-full break-words">
              <h2 className="text-xl font-semibold">{course.title}</h2>
              <p className="text-fg-muted mt-2 line-clamp-3">
                {course.description || 'Описание пока не добавлено'}
              </p>
              <p className="text-fg-subtle mt-4 text-sm">
                Изменён {new Date(course.updated_at).toLocaleDateString('ru-RU')}
              </p>
            </Card>
          </Link>
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
        : await api.POST('/api/v1/courses', { body: { ...metadata, set_id: setId } });
      if (!result.data || result.error) throw failure(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      client.setQueryData(['course', data.id], data);
      void client.invalidateQueries({ queryKey: ['courses'] });
      setSaved(true);
      if (!course) navigate(`/courses/${data.id}`, { replace: true });
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
                required
                className={fieldStyle}
                value={setId}
                onChange={(event) => setSetId(event.target.value)}
              >
                <option value="">Выберите набор</option>
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
                  Сначала создайте набор карточек
                </Link>
              )}
            </div>
          )}
          <Button
            className="min-h-11"
            type="submit"
            loading={save.isPending}
            disabled={!title.trim() || (!course && !setId)}
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
          {course.sections.map((section) => (
            <Card key={section.id}>
              <h3 className="text-lg font-semibold">{section.title}</h3>
              <ul>
                {section.articles.map((article) => (
                  <li key={article.id} className="mt-3">
                    <p className="break-words">{article.title}</p>
                    <div className="flex flex-wrap gap-x-5">
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
    </>
  );
}
