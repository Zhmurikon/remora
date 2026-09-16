import type { components } from '@remora/api-client';
import { Badge, Button, Card, Input } from '@remora/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';

type Course = components['schemas']['CourseDetail'];
const WEB_URL = import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000';

export function CoursePublicationPanel({
  course,
  hasUnsavedChanges,
}: {
  course: Course;
  hasUnsavedChanges: boolean;
}) {
  const client = useQueryClient();
  const [tags, setTags] = useState(course.tags.join(', '));
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
      void client.invalidateQueries({ queryKey: ['courses'] });
      setTags(data.tags.join(', '));
      setConfirmHide(false);
      setNotice(
        data.is_published
          ? 'Курс опубликован. Ссылкой можно поделиться.'
          : 'Курс снят с публикации. Ваши материалы сохранены.',
      );
    },
  });
  return (
    <Card className="max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold">Публикация</h2>
        <Badge>{blocked ? 'Заблокирован' : course.is_published ? 'Опубликован' : 'Черновик'}</Badge>
      </div>
      <p className="text-fg-muted">
        После публикации курс и его карточки доступны всем. Обложка и описание необязательны.
      </p>
      {blocked && (
        <p role="alert" className="text-danger">
          Курс скрыт модератором. Редактирование ваших материалов остаётся доступным.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!mutation.isPending && !hasUnsavedChanges && !blocked) {
            setNotice('');
            mutation.mutate('publish');
          }
        }}
        className="space-y-3"
      >
        <Input
          className="min-h-11"
          label="Теги через запятую"
          hint="Например: математика, линейная алгебра. До 20 независимых тегов."
          value={tags}
          maxLength={1300}
          disabled={mutation.isPending || blocked}
          onChange={(event) => {
            setTags(event.target.value);
            setNotice('');
            mutation.reset();
          }}
        />
        {hasUnsavedChanges && (
          <p className="text-fg-muted">Сначала сохраните название и описание курса.</p>
        )}
        <Button
          className="min-h-11"
          type="submit"
          variant="secondary"
          loading={mutation.isPending && mutation.variables === 'publish'}
          disabled={mutation.isPending || hasUnsavedChanges || blocked}
        >
          {course.is_published ? 'Сохранить теги' : 'Опубликовать курс'}
        </Button>
      </form>
      {course.is_published && !blocked && (
        <a
          className="text-primary inline-flex min-h-11 items-center rounded-lg underline"
          href={`${WEB_URL}/kurs/${course.slug}`}
          target="_blank"
          rel="noreferrer"
        >
          Открыть публичную страницу
        </a>
      )}
      {course.is_published && (
        <div className="border-border border-t pt-4">
          {confirmHide ? (
            <div className="space-y-3">
              <p>
                Курс и вложенные материалы станут недоступны другим пользователям. Ваши карточки и
                независимые копии останутся.
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
              disabled={mutation.isPending}
              onClick={() => setConfirmHide(true)}
            >
              Снять с публикации
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
    </Card>
  );
}
