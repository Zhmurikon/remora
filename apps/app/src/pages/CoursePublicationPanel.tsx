import type { components } from '@remora/api-client';
import { Button } from '@remora/ui';
import { CourseIcon } from '../components/CourseAction';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';

type Course = components['schemas']['CourseDetail'];
const WEB_URL = import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000';

export function CoursePublicationPanel({
  course,
  hasUnsavedChanges,
  canHide,
}: {
  course: Course;
  hasUnsavedChanges: boolean;
  canHide: boolean;
}) {
  const client = useQueryClient();
  const [tags, setTags] = useState(course.tags.join(', '));
  const [editingTags, setEditingTags] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const [notice, setNotice] = useState('');
  const blocked = course.moderation_status === 'blocked';
  const mutation = useMutation({
    mutationFn: async (action: 'publish' | 'unpublish') => {
      const params = { path: { course_id: course.id } };
      const result =
        action === 'publish'
          ? await api.POST('/api/v1/courses/{course_id}/publish', {
              params,
              body: {
                tags: tags
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              },
            })
          : await api.POST('/api/v1/courses/{course_id}/unpublish', { params });
      if (!result.data || result.error) {
        const code = (result.error as { code?: string } | undefined)?.code;
        throw new Error(
          code === 'CONFLICT'
            ? 'Для публикации в каждой статье нужен доступный набор хотя бы с одной карточкой.'
            : code === 'FORBIDDEN'
              ? 'Публикация недоступна. Курс мог быть заблокирован модератором.'
              : code === 'VALIDATION_ERROR'
                ? 'Проверьте теги: до 20 тегов по 60 символов, без специальных знаков.'
                : 'Не удалось изменить публикацию. Проверьте соединение и повторите попытку.',
        );
      }
      return result.data;
    },
    onSuccess: (data) => {
      client.setQueryData(['course', course.id], data);
      void client.resetQueries({ queryKey: ['course-editor', data.id], exact: true });
      void client.invalidateQueries({ queryKey: ['courses'] });
      setTags(data.tags.join(', '));
      setEditingTags(false);
      setConfirmHide(false);
      setNotice(
        data.is_published
          ? course.is_published
            ? 'Теги сохранены.'
            : 'Курс опубликован. Ссылкой можно поделиться.'
          : 'Курс снят с публикации. Ваши материалы сохранены.',
      );
    },
  });
  return (
    <section className="course-publication">
      <h2>Публикация</h2>
      <div className="course-publication-status">
        <span className="publication-symbol">
          <CourseIcon name={course.is_published && !blocked ? 'globe' : 'lock'} />
        </span>
        <div>
          <strong>
            {blocked ? 'Заблокирован' : course.is_published ? 'Опубликован' : 'Черновик'}
          </strong>
          <p>
            {blocked
              ? 'Публичная страница скрыта.'
              : course.is_published
                ? 'Курс доступен по ссылке.'
                : 'Статьи курса видны только вам.'}
          </p>
        </div>
        {course.is_published && !blocked && (
          <a
            className="publication-page-link"
            href={`${WEB_URL}/kurs/${course.slug}`}
            target="_blank"
            rel="noreferrer"
          >
            Открыть публичную страницу <CourseIcon name="external" />
          </a>
        )}
      </div>
      {blocked && (
        <p role="alert" className="text-danger">
          Курс скрыт модератором. Редактирование ваших материалов остаётся доступным.
        </p>
      )}
      <section className="publication-tags">
        <header>
          <h3>Теги курса</h3>
          {course.is_published && !editingTags && !blocked && (
            <button
              type="button"
              className="course-settings-link"
              disabled={mutation.isPending}
              onClick={() => {
                setEditingTags(true);
                setNotice('');
                mutation.reset();
              }}
            >
              <CourseIcon name="edit" />
              Изменить теги
            </button>
          )}
        </header>
        {(course.is_published && !editingTags) || blocked ? (
          course.tags.length ? (
            <ul className="publication-tag-list">
              {course.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-muted">Теги пока не добавлены.</p>
          )
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!mutation.isPending && !hasUnsavedChanges && !blocked) {
                setNotice('');
                mutation.mutate('publish');
              }
            }}
          >
            <label htmlFor="publication-tags">Теги через запятую</label>
            <textarea
              id="publication-tags"
              autoFocus={editingTags}
              className="course-settings-field"
              rows={2}
              value={tags}
              maxLength={1300}
              aria-describedby="publication-tags-limit"
              placeholder="Например, математика, теория вероятностей"
              disabled={mutation.isPending}
              onChange={(event) => {
                setTags(event.target.value);
                setNotice('');
                mutation.reset();
              }}
            />
            <small id="publication-tags-limit">До 20 тегов, каждый до 60 символов.</small>
            {hasUnsavedChanges && (
              <p className="text-fg-muted">Сначала сохраните название и описание курса.</p>
            )}
            <div className="publication-controls">
              <Button
                className="min-h-11"
                type="submit"
                loading={mutation.isPending && mutation.variables === 'publish'}
                disabled={mutation.isPending || hasUnsavedChanges || blocked}
              >
                {course.is_published ? 'Сохранить теги' : 'Опубликовать курс'}
              </Button>
              {editingTags && (
                <Button
                  type="button"
                  className="min-h-11"
                  variant="ghost"
                  disabled={mutation.isPending}
                  onClick={() => {
                    setTags(course.tags.join(', '));
                    setEditingTags(false);
                    mutation.reset();
                  }}
                >
                  Отмена
                </Button>
              )}
            </div>
          </form>
        )}
      </section>
      {course.is_published && (
        <div className="publication-access">
          <h3>Доступ к курсу</h3>
          {!canHide && <p className="text-fg-muted">Скрыть курс можно на Plus и Pro.</p>}
          {confirmHide ? (
            <div className="space-y-3">
              <p>
                Статьи курса станут доступны только вам. Доступ к наборам карточек можно изменить в
                редакторе каждого набора.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  className="min-h-11"
                  variant="danger"
                  loading={mutation.isPending}
                  onClick={() => {
                    setNotice('');
                    mutation.mutate('unpublish');
                  }}
                >
                  Подтвердить снятие
                </Button>
                <Button
                  className="min-h-11"
                  variant="ghost"
                  disabled={mutation.isPending}
                  onClick={() => setConfirmHide(false)}
                >
                  Отмена
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="min-h-11"
              variant="ghost"
              disabled={mutation.isPending || !canHide}
              onClick={() => setConfirmHide(true)}
            >
              <CourseIcon name="lock" /> Снять с публикации
            </Button>
          )}
        </div>
      )}
      {mutation.isError && (
        <p role="alert" className="text-danger">
          {mutation.error instanceof TypeError
            ? 'Нет соединения с сервером. Повторите попытку.'
            : mutation.error.message}
        </p>
      )}
      <p role="status" className="text-success">
        {notice}
      </p>
    </section>
  );
}
