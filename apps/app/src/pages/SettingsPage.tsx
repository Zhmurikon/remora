import type { ApiError, components } from '@remora/api-client';
import { formatBytes } from '@remora/core';
import { Button, Card, Input } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../features/auth/auth-store';
import { StudySettingsForm } from '../features/study/StudySettingsForm';
import { api, clearAccessToken } from '../lib/api';
import { ApiTokens } from './ApiTokens';
import { BotConnections } from './BotConnections';

type Session = components['schemas']['SessionPublic'];

export function SettingsPage() {
  return (
    <div>
      <p className="text-primary text-sm font-medium">Аккаунт</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Настройки</h1>
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <ProfileForm />
        <PasswordForm />
        <StudySettingsForm />
        <AccountExport />
      </div>
      <ApiTokens />
      <BotConnections />
      <Sessions />
    </div>
  );
}

type AccountExportJob = components['schemas']['AccountExportPublic'];

function AccountExport() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const query = useQuery({
    queryKey: ['account-export'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/users/me/export/latest');
      if (error) throw new Error(errorMessage(error));
      return data;
    },
    refetchInterval: (state) => {
      const job = state.state.data;
      return job?.status === 'queued' || job?.status === 'processing' ? 2_000 : false;
    },
  });
  const job = query.data as AccountExportJob | null | undefined;
  const active = job?.status === 'queued' || job?.status === 'processing';

  async function start() {
    setStarting(true);
    setMessage(null);
    const { data, error } = await api.POST('/api/v1/users/me/export');
    if (error) setMessage(errorMessage(error));
    else {
      queryClient.setQueryData(['account-export'], data);
      setMessage('Архив поставлен в очередь. Ссылку также отправим на ваш email.');
    }
    setStarting(false);
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Ваши данные</h2>
      <p className="text-fg-muted mt-1 text-sm leading-relaxed">
        Скачайте ZIP со всеми наборами, историей обучения, настройками и медиафайлами. Пароли и
        токены в архив не входят.
      </p>

      {active && job && (
        <div className="bg-surface-muted mt-5 rounded-xl p-4" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">
              {job.status === 'queued' ? 'Ожидает обработки' : 'Собираем архив'}
            </span>
            <span className="text-fg-muted">{job.progress}%</span>
          </div>
          <div
            className="bg-border mt-3 h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={job.progress}
          >
            <div className="bg-primary h-full rounded-full" style={{ width: `${job.progress}%` }} />
          </div>
        </div>
      )}

      {job?.status === 'completed' && job.download_url && (
        <div className="bg-success-subtle mt-5 rounded-xl p-4">
          <p className="font-medium">Архив готов</p>
          <p className="text-fg-muted mt-1 text-sm">
            {job.size_bytes ? formatBytes(job.size_bytes) : 'ZIP'} · ссылка действует до{' '}
            {job.expires_at ? new Date(job.expires_at).toLocaleString('ru-RU') : 'истечения срока'}
          </p>
          <a
            href={job.download_url}
            className="bg-primary text-primary-fg mt-4 inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-medium"
          >
            Скачать ZIP
          </a>
        </div>
      )}

      {job?.status === 'completed' && !job.download_url && (
        <p className="bg-warning-subtle mt-5 rounded-xl p-4 text-sm" role="status">
          Срок ссылки истёк. Запросите новый архив.
        </p>
      )}
      {job?.status === 'failed' && (
        <p className="bg-danger-subtle text-danger mt-5 rounded-xl p-4 text-sm" role="alert">
          {job.error_message || 'Не удалось подготовить архив. Попробуйте ещё раз.'}
        </p>
      )}

      <Status text={message} />
      <Button
        variant={job?.status === 'completed' ? 'secondary' : 'primary'}
        className="mt-5"
        loading={starting}
        disabled={active}
        onClick={() => void start()}
      >
        {active ? 'Архив готовится' : job ? 'Создать новый архив' : 'Запросить архив'}
      </Button>
    </Card>
  );
}

function ProfileForm() {
  const user = useAuthStore((state) => state.user);
  const authenticate = useAuthStore((state) => state.authenticate);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const data = new FormData(event.currentTarget);
    const { data: updated, error } = await api.PATCH('/api/v1/auth/me', {
      body: {
        username: String(data.get('username')),
        display_name: String(data.get('display_name')) || null,
        locale: String(data.get('locale')),
        timezone: String(data.get('timezone')),
      },
    });
    if (updated) {
      authenticate(updated);
      setMessage('Профиль сохранён');
    } else setMessage(errorMessage(error));
    setSaving(false);
  }
  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Профиль</h2>
      <p className="text-fg-muted mt-1 text-sm">Основные данные вашего аккаунта.</p>
      <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        <Input label="Email" value={user?.email ?? ''} disabled />
        <Input
          label="Имя пользователя"
          name="username"
          defaultValue={user?.username}
          minLength={3}
          maxLength={32}
          pattern="[a-zA-Z0-9_-]+"
          required
        />
        <Input
          label="Отображаемое имя"
          name="display_name"
          defaultValue={user?.display_name ?? ''}
          maxLength={64}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Язык" name="locale" defaultValue={user?.locale ?? 'ru'} required />
          <Input
            label="Часовой пояс"
            name="timezone"
            defaultValue={user?.timezone ?? 'Europe/Moscow'}
            required
          />
        </div>
        <Status text={message} />
        <Button type="submit" loading={saving}>
          Сохранить профиль
        </Button>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const next = String(data.get('new_password'));
    const repeat = String(data.get('repeat_password'));
    if (next !== repeat) {
      setMessage('Новые пароли не совпадают');
      setSaving(false);
      return;
    }
    const { error } = await api.POST('/api/v1/auth/change-password', {
      body: { current_password: String(data.get('current_password')), new_password: next },
    });
    if (error) setMessage(errorMessage(error));
    else {
      setMessage('Пароль изменён');
      form.reset();
    }
    setSaving(false);
  }
  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Пароль</h2>
      <p className="text-fg-muted mt-1 text-sm">
        После смены пароля остальные устройства выйдут из аккаунта.
      </p>
      <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        <Input
          label="Текущий пароль"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
        />
        <Input
          label="Новый пароль"
          name="new_password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <Input
          label="Повторите новый пароль"
          name="repeat_password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <Status text={message} />
        <Button type="submit" loading={saving}>
          Изменить пароль
        </Button>
      </form>
    </Card>
  );
}

function Sessions() {
  const queryClient = useQueryClient();
  const becomeGuest = useAuthStore((state) => state.becomeGuest);
  const sessions = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/auth/sessions');
      if (error) throw new Error(errorMessage(error));
      return data;
    },
  });
  async function revoke(session: Session) {
    const { error } = await api.DELETE('/api/v1/auth/sessions/{session_id}', {
      params: { path: { session_id: session.id } },
    });
    if (!error && session.current) {
      clearAccessToken();
      becomeGuest();
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
  }
  return (
    <Card className="mt-6 p-6">
      <h2 className="text-xl font-semibold">Активные устройства</h2>
      <p className="text-fg-muted mt-1 text-sm">Сессии, в которых сейчас открыт ваш аккаунт.</p>
      <div className="divide-border mt-5 divide-y">
        {sessions.isPending && <p className="text-fg-muted py-4">Загружаем устройства…</p>}
        {sessions.isError && <p className="text-danger py-4">{sessions.error.message}</p>}
        {sessions.data?.map((session) => (
          <div key={session.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div>
              <p className="font-medium">
                {deviceName(session.user_agent)}{' '}
                {session.current && (
                  <span className="text-primary ml-2 text-xs">Это устройство</span>
                )}
              </p>
              <p className="text-fg-muted mt-1 text-sm">
                {session.ip || 'IP не определён'} · до{' '}
                {new Date(session.expires_at).toLocaleDateString('ru-RU')}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void revoke(session)}>
              {session.current ? 'Выйти' : 'Завершить'}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Status({ text }: { text: string | null }) {
  return text ? (
    <p className="text-fg-muted text-sm" role="status">
      {text}
    </p>
  ) : null;
}
function errorMessage(error: unknown) {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String((error as ApiError).message)
    : 'Не удалось выполнить запрос';
}
function deviceName(agent: string | null) {
  if (!agent) return 'Неизвестное устройство';
  if (agent.includes('Firefox')) return 'Firefox';
  if (agent.includes('Edg/')) return 'Microsoft Edge';
  if (agent.includes('Chrome')) return 'Google Chrome';
  if (agent.includes('Safari')) return 'Safari';
  return agent.slice(0, 60);
}
