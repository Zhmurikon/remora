import type { ApiError, components } from '@remora/api-client';
import { Button, Card, Input } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../features/auth/auth-store';
import { api } from '../lib/api';

type Course = components['schemas']['ModerationCourseItem'];
type Action = components['schemas']['ModerationActionItem'];
type ActionName = components['schemas']['ModerationActionRequest']['action'];

export function ModerationPage() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const courses = useQuery({
    queryKey: ['moderation', 'courses'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/moderation/courses');
      if (error) throw new Error(errorMessage(error));
      return data;
    },
  });
  const actions = useQuery({
    queryKey: ['moderation', 'actions'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/moderation/actions');
      if (error) throw new Error(errorMessage(error));
      return data;
    },
  });

  if (user?.role !== 'moderator' && user?.role !== 'admin') return <Navigate to="/" replace />;

  async function act(course: Course, action: ActionName) {
    const explanation = reason[course.id]?.trim();
    if (!explanation || explanation.length < 3) {
      setMessage('Укажите причину длиной не менее трёх символов.');
      return;
    }
    setActing(`${course.id}:${action}`);
    setMessage(null);
    const { error } = await api.POST('/api/v1/moderation/courses/{course_id}/actions', {
      params: { path: { course_id: course.id } },
      body: { action, reason: explanation },
    });
    if (error) setMessage(errorMessage(error));
    else {
      setMessage('Действие записано в журнал.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['moderation', 'courses'] }),
        queryClient.invalidateQueries({ queryKey: ['moderation', 'actions'] }),
      ]);
    }
    setActing(null);
  }

  return (
    <div>
      <p className="text-primary text-sm font-medium">Служебный раздел</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Модерация</h1>
      <p className="text-fg-muted mt-2 max-w-3xl">
        Публикации отсортированы по числу жалоб и автоматическим сигналам. Каждое решение
        сохраняется в неизменяемом журнале.
      </p>
      {message && (
        <p className="bg-surface-muted mt-5 rounded-xl p-4 text-sm" role="status">
          {message}
        </p>
      )}
      <section className="mt-8 space-y-4" aria-labelledby="queue-title">
        <h2 id="queue-title" className="text-2xl font-semibold">
          Очередь публикаций
        </h2>
        {courses.isPending && <p className="text-fg-muted">Загружаем очередь…</p>}
        {courses.isError && <p className="text-danger">{courses.error.message}</p>}
        {courses.data?.length === 0 && <p className="text-fg-muted">Очередь пуста.</p>}
        {courses.data?.map((course) => (
          <Card key={course.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">{course.title}</h3>
                <p className="text-fg-muted mt-1 text-sm">
                  @{course.owner_username} · жалоб: {course.open_reports} · приоритет:{' '}
                  {course.priority}
                </p>
              </div>
              <span className="bg-surface-muted rounded-full px-3 py-1 text-sm">
                {course.moderation_status}
              </span>
            </div>
            {course.automatic_signals.length > 0 && (
              <ul className="text-warning mt-4 list-disc space-y-1 pl-5 text-sm">
                {course.automatic_signals.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            )}
            <div className="mt-5">
              <Input
                label={`Причина решения по курсу «${course.title}»`}
                value={reason[course.id] ?? ''}
                maxLength={2000}
                onChange={(event) =>
                  setReason((current) => ({ ...current, [course.id]: event.target.value }))
                }
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton course={course} action="warn" acting={acting} onAct={act}>
                Предупредить
              </ActionButton>
              <ActionButton course={course} action="unpublish" acting={acting} onAct={act}>
                Снять с публикации
              </ActionButton>
              <ActionButton course={course} action="block" acting={acting} onAct={act} danger>
                Заблокировать
              </ActionButton>
              <ActionButton course={course} action="restore" acting={acting} onAct={act}>
                Восстановить
              </ActionButton>
              {user.role === 'admin' && (
                <ActionButton
                  course={course}
                  action="ban_author"
                  acting={acting}
                  onAct={act}
                  danger
                >
                  Заблокировать автора
                </ActionButton>
              )}
            </div>
          </Card>
        ))}
      </section>
      <section className="mt-10" aria-labelledby="history-title">
        <h2 id="history-title" className="text-2xl font-semibold">
          Журнал действий
        </h2>
        <div className="divide-border mt-4 divide-y">
          {actions.data?.map((action) => (
            <HistoryRow key={action.id} action={action} />
          ))}
          {actions.data?.length === 0 && <p className="text-fg-muted py-4">Действий пока нет.</p>}
        </div>
      </section>
    </div>
  );
}

function ActionButton({
  course,
  action,
  acting,
  onAct,
  danger = false,
  children,
}: {
  course: Course;
  action: ActionName;
  acting: string | null;
  onAct: (course: Course, action: ActionName) => Promise<void>;
  danger?: boolean;
  children: string;
}) {
  return (
    <Button
      size="sm"
      variant={danger ? 'danger' : 'secondary'}
      loading={acting === `${course.id}:${action}`}
      onClick={() => void onAct(course, action)}
    >
      {children}
    </Button>
  );
}

function HistoryRow({ action }: { action: Action }) {
  return (
    <div className="py-4 text-sm">
      <p className="font-medium">{action.action}</p>
      <p className="text-fg-muted mt-1">
        {action.reason} · {new Date(action.created_at).toLocaleString('ru-RU')}
      </p>
    </div>
  );
}

function errorMessage(error: unknown) {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String((error as ApiError).message)
    : 'Не удалось выполнить запрос';
}
