import type { components } from '@remora/api-client';
import { Button, Card } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api } from '../lib/api';

type Attachment = components['schemas']['CourseAttachmentPublic'];
const maxSize = 100 * 1024 * 1024;

function sizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
}

export function CourseAttachments({
  courseId,
  articleId,
  canEdit = false,
}: {
  courseId: string;
  articleId?: string;
  canEdit?: boolean;
}) {
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['course-attachments', courseId],
    queryFn: async () => {
      const result = await api.GET('/api/v1/courses/{course_id}/attachments', {
        params: { path: { course_id: courseId } },
      });
      if (result.error || !result.data) throw new Error('Не удалось загрузить вложения.');
      return Array.isArray(result.data) ? result.data : [];
    },
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > maxSize) throw new Error('Максимальный размер файла — 100 МБ.');
      const ticket = await api.POST('/api/v1/courses/{course_id}/attachments/upload-url', {
        params: { path: { course_id: courseId } },
        body: {
          filename: file.name,
          mime: file.type || 'application/octet-stream',
          size_bytes: file.size,
          article_id: articleId,
        },
      });
      if (!ticket.data) throw new Error('Не удалось начать загрузку файла.');
      const stored = await fetch(ticket.data.upload_url, {
        method: 'PUT',
        headers: ticket.data.headers,
        body: file,
      });
      if (!stored.ok) throw new Error('Хранилище не приняло файл. Повторите попытку.');
      const completed = await api.POST(
        '/api/v1/courses/{course_id}/attachments/{attachment_id}/complete',
        {
          params: {
            path: { course_id: courseId, attachment_id: ticket.data.id },
          },
        },
      );
      if (!completed.data) throw new Error('Не удалось завершить загрузку файла.');
      return completed.data;
    },
    onSuccess: () => {
      setError('');
      if (input.current) input.current.value = '';
      void client.invalidateQueries({ queryKey: ['course-attachments', courseId] });
    },
    onError: (reason) => setError(reason.message),
  });
  const remove = useMutation({
    mutationFn: async (attachment: Attachment) => {
      const result = await api.DELETE('/api/v1/courses/{course_id}/attachments/{attachment_id}', {
        params: { path: { course_id: courseId, attachment_id: attachment.id } },
      });
      if (result.error) throw new Error('Не удалось удалить файл.');
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ['course-attachments', courseId] }),
    onError: (reason) => setError(reason.message),
  });
  const visible = (query.data ?? []).filter((item) => item.article_id === (articleId ?? null));

  async function download(attachment: Attachment) {
    setError('');
    const result = await api.GET(
      '/api/v1/courses/{course_id}/attachments/{attachment_id}/download',
      { params: { path: { course_id: courseId, attachment_id: attachment.id } } },
    );
    if (!result.data) {
      setError('Не удалось получить ссылку на скачивание.');
      return;
    }
    window.location.assign(result.data.url);
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Вложения</h2>
        <p className="text-fg-muted mt-1 text-sm">
          {articleId ? 'Файлы к этому материалу.' : 'Общие файлы курса.'} До 100 МБ на файл.
        </p>
      </div>
      {query.isPending && <p role="status">Загружаем список файлов…</p>}
      {query.isError && <p role="alert">{query.error.message}</p>}
      {!query.isPending && visible.length === 0 && (
        <p className="text-fg-muted">Вложений пока нет.</p>
      )}
      {visible.length > 0 && (
        <ul className="divide-border divide-y">
          {visible.map((attachment) => (
            <li
              key={attachment.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="break-all font-medium">{attachment.filename}</p>
                <p className="text-fg-muted text-sm">{sizeLabel(attachment.size_bytes)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void download(attachment)}>
                  Скачать
                </Button>
                {canEdit && (
                  <Button
                    variant="danger"
                    loading={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Удалить файл «${attachment.filename}»?`))
                        remove.mutate(attachment);
                    }}
                  >
                    Удалить
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <label className="focus-within:outline-primary inline-flex min-h-11 cursor-pointer items-center rounded-xl focus-within:outline focus-within:outline-2">
          <span className="border-border bg-surface rounded-xl border px-4 py-2 font-medium">
            {upload.isPending ? 'Загружаем…' : 'Добавить файл'}
          </span>
          <input
            ref={input}
            className="sr-only"
            type="file"
            disabled={upload.isPending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file);
            }}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
