import type { ApiError, components } from '@remora/api-client';
import { Button, Card, Input } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../features/auth/auth-store';
import { api, setAdminSession } from '../lib/api';

type AdminUser = components['schemas']['AdminUserItem'];

export function AdminPage() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [unlocked, setUnlocked] = useState(false);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const status = useQuery({
    queryKey: ['admin', '2fa'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/2fa/status');
      if (error) throw new Error(errorMessage(error));
      return data;
    },
    enabled: user?.role === 'admin',
  });
  const dashboard = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/dashboard');
      if (error) throw new Error(errorMessage(error));
      return data;
    },
    enabled: unlocked,
  });
  const users = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/users', {
        params: { query: { query: search } },
      });
      if (error) throw new Error(errorMessage(error));
      return data;
    },
    enabled: unlocked,
  });
  const tasks = useQuery({
    queryKey: ['admin', 'tasks'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/tasks');
      if (error) throw new Error(errorMessage(error));
      return data;
    },
    enabled: unlocked,
  });
  const audit = useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/moderation/audit', {
        params: { query: { limit: 50 } },
      });
      if (error) throw new Error(errorMessage(error));
      return data;
    },
    enabled: unlocked,
  });

  if (user?.role !== 'admin') return <Navigate to="/" replace />;

  async function setup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password'));
    const { data, error } = await api.POST('/api/v1/admin/2fa/setup', { body: { password } });
    if (error) setMessage(errorMessage(error));
    else {
      setSetupSecret(data.secret);
      setMessage('Добавьте секрет в приложение-аутентификатор и подтвердите код.');
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>, enabling: boolean) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code')).trim();
    if (enabling) {
      const { data, error } = await api.POST('/api/v1/admin/2fa/enable', { body: { code } });
      if (error) return setMessage(errorMessage(error));
      setAdminSession(data.admin_token);
      setRecoveryCodes(data.recovery_codes);
      await status.refetch();
    } else {
      const { data, error } = await api.POST('/api/v1/admin/2fa/challenge', { body: { code } });
      if (error) return setMessage(errorMessage(error));
      setAdminSession(data.admin_token);
    }
    setUnlocked(true);
    setMessage(null);
  }

  async function update(target: AdminUser, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const role = String(form.get('role')) as 'user' | 'teacher' | 'moderator' | 'admin';
    const statusValue = String(form.get('status')) as 'active' | 'suspended' | 'deleted';
    const reason = String(form.get('reason')).trim();
    const { error } = await api.PATCH('/api/v1/admin/users/{user_id}', {
      params: { path: { user_id: target.id } },
      body: { role, status: statusValue === 'deleted' ? undefined : statusValue, reason },
    });
    if (error) setMessage(errorMessage(error));
    else {
      setMessage('Пользователь обновлён, действие записано в аудит.');
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    }
  }

  if (status.isPending) return <p className="text-fg-muted">Проверяем административный доступ…</p>;
  if (status.isError) return <p className="text-danger">{status.error.message}</p>;
  if (!status.data?.enabled || !unlocked) {
    const needsSetup = !status.data?.enabled && !setupSecret;
    return (
      <div className="mx-auto max-w-xl">
        <p className="text-primary text-sm font-medium">Защищённый контур</p>
        <h1 className="mt-2 text-3xl font-semibold">Администрирование</h1>
        <Card className="mt-8 p-6">
          {needsSetup ? (
            <form className="space-y-4" onSubmit={(event) => void setup(event)}>
              <p className="text-fg-muted text-sm">
                Перед первым входом подтвердите пароль и настройте TOTP.
              </p>
              <Input label="Текущий пароль" name="password" type="password" required />
              <Button type="submit">Создать секрет TOTP</Button>
            </form>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => void verify(event, !status.data?.enabled)}
            >
              {setupSecret && (
                <div className="bg-surface-muted rounded-xl p-4">
                  <p className="text-fg-muted text-sm">Секрет для ручного ввода</p>
                  <code className="mt-2 block break-all font-mono text-sm">{setupSecret}</code>
                </div>
              )}
              <Input
                label={status.data?.enabled ? 'Код TOTP или резервный код' : 'Код TOTP'}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
              <Button type="submit">Подтвердить второй фактор</Button>
            </form>
          )}
          {message && <p className="mt-4 text-sm">{message}</p>}
        </Card>
      </div>
    );
  }

  return (
    <div>
      <p className="text-primary text-sm font-medium">Защищённый контур</p>
      <h1 className="mt-2 text-3xl font-semibold">Администрирование</h1>
      {recoveryCodes.length > 0 && (
        <Card className="border-warning mt-6 p-5" role="alert">
          <h2 className="font-semibold">Сохраните резервные коды</h2>
          <p className="text-fg-muted mt-1 text-sm">
            Они показаны один раз и используются по одному.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
            {recoveryCodes.map((code) => (
              <code key={code}>{code}</code>
            ))}
          </div>
        </Card>
      )}
      {message && <p className="bg-surface-muted mt-5 rounded-xl p-4 text-sm">{message}</p>}
      {dashboard.data && (
        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Сводка">
          {Object.entries(dashboard.data).map(([key, value]) => (
            <Card key={key} className="p-4">
              <p className="text-fg-muted text-xs">{metricLabel(key)}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </Card>
          ))}
        </section>
      )}
      <section className="mt-10" aria-labelledby="users-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="users-title" className="text-2xl font-semibold">
            Пользователи
          </h2>
          <Input label="Поиск" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="mt-4 space-y-3">
          {users.data?.map((item) => (
            <Card key={item.id} className="p-4">
              <form
                className="grid items-end gap-3 lg:grid-cols-[1fr_150px_150px_1fr_auto]"
                onSubmit={(event) => void update(item, event)}
              >
                <div>
                  <p className="font-medium">@{item.username}</p>
                  <p className="text-fg-muted text-sm">{item.email}</p>
                </div>
                <label className="text-sm">
                  Роль
                  <select
                    name="role"
                    defaultValue={item.role}
                    className="border-border bg-surface mt-1 min-h-11 w-full rounded-lg border px-3"
                  >
                    <option value="user">user</option>
                    <option value="teacher">teacher</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
                <label className="text-sm">
                  Статус
                  <select
                    name="status"
                    defaultValue={item.status}
                    disabled={item.status === 'deleted'}
                    className="border-border bg-surface mt-1 min-h-11 w-full rounded-lg border px-3"
                  >
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                    {item.status === 'deleted' && <option value="deleted">deleted</option>}
                  </select>
                </label>
                <Input label="Причина" name="reason" minLength={3} required />
                <Button type="submit" size="sm">
                  Сохранить
                </Button>
              </form>
            </Card>
          ))}
        </div>
      </section>
      <section className="mt-10" aria-labelledby="tasks-title">
        <h2 id="tasks-title" className="text-2xl font-semibold">
          Фоновые задания
        </h2>
        <div className="divide-border mt-4 divide-y">
          {tasks.data?.map((task) => (
            <p key={`${task.kind}:${task.id}`} className="flex justify-between gap-4 py-3 text-sm">
              <span>
                {task.kind} · {task.status}
              </span>
              <span className="text-fg-muted">{task.progress}%</span>
            </p>
          ))}
          {tasks.data?.length === 0 && <p className="text-fg-muted py-4">Заданий нет.</p>}
        </div>
      </section>
      <section className="mt-10" aria-labelledby="audit-title">
        <h2 id="audit-title" className="text-2xl font-semibold">
          Журнал аудита
        </h2>
        <div className="divide-border mt-4 divide-y">
          {audit.data?.map((event) => (
            <div key={event.id} className="grid gap-1 py-3 text-sm md:grid-cols-[1fr_1fr_auto]">
              <span className="font-medium">{event.event}</span>
              <span className="text-fg-muted">
                {event.target_type}
                {event.target_id ? ` · ${event.target_id}` : ''}
              </span>
              <time className="text-fg-muted" dateTime={event.created_at}>
                {new Date(event.created_at).toLocaleString('ru-RU')}
              </time>
            </div>
          ))}
          {audit.data?.length === 0 && <p className="text-fg-muted py-4">Событий нет.</p>}
        </div>
      </section>
    </div>
  );
}

function metricLabel(key: string) {
  return (
    (
      {
        users_total: 'Всего',
        users_active: 'Активные',
        users_suspended: 'Приостановлены',
        open_reports: 'Жалобы',
        queued_jobs: 'Задания',
      } as Record<string, string>
    )[key] ?? key
  );
}

function errorMessage(error: unknown) {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String((error as ApiError).message)
    : 'Не удалось выполнить запрос';
}
