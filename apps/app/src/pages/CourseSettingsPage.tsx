import type { components } from '@remora/api-client';
import { Button, Card } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useMatch, useNavigate, useParams } from 'react-router-dom';
import { MaterialVisibility, useCanHideMaterials } from '../components/MaterialVisibility';
import { api } from '../lib/api';
import { CourseEditorPage } from './CourseEditorPage';
import { CoursePublicationPanel } from './CoursePublicationPanel';
import { CopyCourseButton } from './CourseReaderPage';
import { CourseSettingsNav, type SettingsSection } from './CourseSettingsNav';
import './course-settings.css';

type Course = components['schemas']['CourseDetail'];
const linkStyle = 'course-settings-link';
const fieldStyle = 'course-settings-field';
function failure(error: unknown): Error {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'CONFLICT') {
    return new Error('Этот набор уже входит в курс. Выберите другой набор.');
  }
  return new Error('Не удалось выполнить запрос. Проверьте соединение и повторите попытку.');
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
    <div className="course-settings">
      <Link to="/courses" className={linkStyle}>
        <span aria-hidden="true">←</span> Все курсы
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
    <div className="course-settings">
      <Link to="/courses" className={linkStyle}>
        <span aria-hidden="true">←</span> Все курсы
      </Link>
      <CourseForm />
    </div>
  );
}

function CourseForm({ course }: { course?: Course }) {
  const navigate = useNavigate();
  const location = useLocation();
  const showStructure = useMatch('/courses/:courseId/structure');
  const client = useQueryClient();
  const [title, setTitle] = useState(course?.title ?? '');
  const [description, setDescription] = useState(course?.description ?? '');
  const canHide = useCanHideMaterials();
  const [isPublic, setIsPublic] = useState(true);
  const [setId, setSetId] = useState('');
  const [structureActions, setStructureActions] = useState<HTMLDivElement | null>(null);
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
        : await api.POST('/api/v1/courses', {
            body: { ...metadata, is_published: isPublic, set_id: setId || null },
          });
      if (!result.data || result.error) throw failure(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      client.setQueryData(['course', data.id], data);
      void client.resetQueries({ queryKey: ['course-editor', data.id], exact: true });
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
  const base = course ? `/courses/${course.id}/edit` : '/courses/new';
  const sections: SettingsSection[] = [{ id: 'about', label: 'О курсе', to: base }];
  if (course) {
    sections.push(
      {
        id: 'structure',
        label: 'Структура',
        to: `/courses/${course.id}/structure`,
      },
      {
        id: 'access',
        label: 'Публикация и доступ',
        to: base + '?section=access',
      },
      { id: 'materials', label: 'Материалы курса', to: base + '?section=materials' },
      {
        id: 'actions',
        label: 'Другие действия',
        to: base + '?section=actions',
      },
    );
  } else {
    sections.push(
      {
        id: 'access',
        label: 'Доступ к курсу',
        to: base + '?section=access',
      },
      {
        id: 'first',
        label: 'Первый набор',
        to: base + '?section=first',
      },
    );
  }
  const selected = showStructure
    ? 'structure'
    : new URLSearchParams(location.search).get('section');
  const active = sections.find((item) => item.id === selected) ?? sections[0]!;
  const dirty = !!course && (title.trim() !== course.title || description !== course.description);
  return (
    <>
      <header
        className={
          active.id === 'structure' ? 'course-settings-head has-outline' : 'course-settings-head'
        }
      >
        <div>
          <h1>{course ? 'Настройки курса' : 'Новый курс'}</h1>
          {!course && (
            <small className="course-create-access">
              {isPublic ? 'Публичный доступ' : 'Только мне'}
            </small>
          )}
        </div>
        {active.id === 'structure' && <div ref={setStructureActions} />}
        {(!course || active.id === 'about' || (dirty && active.id === 'access')) && (
          <Button
            type="submit"
            form="course-metadata"
            className="min-h-11"
            loading={save.isPending}
            disabled={!title.trim() || save.isPending}
          >
            {course ? 'Сохранить' : 'Создать курс'}
          </Button>
        )}
      </header>
      {save.isError && (
        <p role="alert" className="text-danger">
          {save.error.message}
        </p>
      )}
      {saved && active.id === 'about' && (
        <p role="status" className="text-success">
          Изменения сохранены
        </p>
      )}
      <div className="course-settings-layout">
        <CourseSettingsNav sections={sections} active={active} />
        <div className="course-settings-content">
          <form
            id="course-metadata"
            hidden={!!course && active.id !== 'about'}
            onSubmit={(event) => {
              event.preventDefault();
              if (title.trim() && !save.isPending) save.mutate();
            }}
            onChange={() => {
              setSaved(false);
              save.reset();
            }}
          >
            <fieldset disabled={save.isPending} className="min-w-0">
              <div hidden={active.id !== 'about'} className="course-settings-pane">
                <h2>О курсе</h2>
                <label htmlFor="course-title">Название курса</label>
                <textarea
                  id="course-title"
                  className={fieldStyle + ' course-title'}
                  rows={1}
                  required
                  maxLength={160}
                  placeholder="Введите название"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <div className="course-description-label">
                  <label htmlFor="course-description">Описание</label>
                  <small>{description.length} / 5000</small>
                </div>
                <textarea
                  id="course-description"
                  rows={10}
                  maxLength={5000}
                  className={fieldStyle}
                  placeholder="О чём этот курс?"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
                {course && (
                  <Link className={linkStyle} to={`/courses/${course.id}/read`}>
                    Читать курс
                  </Link>
                )}
              </div>
              {!course && (
                <>
                  <div hidden={active.id !== 'access'} className="course-settings-pane">
                    <h2>Доступ к курсу</h2>
                    <MaterialVisibility
                      label="Кто видит курс"
                      isPublic={isPublic}
                      canHide={canHide}
                      onChange={setIsPublic}
                    />
                  </div>
                  <div hidden={active.id !== 'first'} className="course-settings-pane">
                    <h2>Первый набор</h2>
                    <label htmlFor="course-set" className="mb-2 block text-sm">
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
                </>
              )}
            </fieldset>
          </form>
          {course && (
            <>
              <div hidden={active.id !== 'access'} className="course-settings-pane">
                <CoursePublicationPanel
                  course={course}
                  hasUnsavedChanges={dirty || save.isPending}
                  canHide={canHide}
                />
              </div>
              {active.id === 'structure' && (
                <div className="course-settings-pane">
                  <CourseEditorPage saveTarget={structureActions} />
                </div>
              )}
              {active.id === 'materials' && (
                <section className="course-settings-pane">
                  <h2>Материалы курса</h2>
                  <Link className={linkStyle} to={`/courses/${course.id}/read`}>
                    Читать курс
                  </Link>
                  {course.sections.map((section) => (
                    <details key={section.id} className="course-material-group">
                      <summary>{section.title}</summary>
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
                    </details>
                  ))}
                </section>
              )}
              {active.id === 'actions' && (
                <section className="course-settings-pane space-y-5">
                  <h2>Другие действия</h2>
                  <CopyCourseButton courseId={course.id} />
                  <Card className="border-danger/40 max-w-2xl space-y-4">
                    <div>
                      <h3>Удаление курса</h3>
                      <p className="text-fg-muted mt-2">
                        Курс, его статьи и сохранения у других пользователей будут удалены. Наборы
                        карточек переместятся в архив вместе с вашим учебным прогрессом.
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
                      <Button
                        className="min-h-11"
                        variant="danger"
                        onClick={() => setConfirmDelete(true)}
                      >
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
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
