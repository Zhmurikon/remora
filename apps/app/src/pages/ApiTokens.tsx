import type { components } from '@remora/api-client';
import { Button, Card, Input } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { useAuthStore } from '../features/auth/auth-store';
import { api } from '../lib/api';
import {
  SettingsFeedback,
  useSettingsDirty,
  settingsError,
} from '../features/settings/SettingsFeedback';

type Scope = components['schemas']['ApiTokenCreate']['scopes'][number];
const permissions: { value: Scope; label: string; adminOnly?: boolean }[] = [
  { value: 'materials:read', label: 'Читать свои наборы и курсы' },
  { value: 'materials:write', label: 'Создавать и изменять материалы' },
  { value: 'courses:publish', label: 'Публиковать курсы и снимать с публикации' },
  { value: 'blog:read', label: 'Читать редакционные черновики', adminOnly: true },
  { value: 'blog:write', label: 'Создавать и изменять статьи блога', adminOnly: true },
  { value: 'blog:publish', label: 'Публиковать статьи и снимать их с публикации', adminOnly: true },
];

export function ApiTokens() {
  const cache = useQueryClient();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const availablePermissions = permissions.filter(({ adminOnly }) => !adminOnly || isAdmin);
  const [secret, setSecret] = useState<{ id: string; token: string } | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useSettingsDirty('api', secret !== null || draftDirty);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['api-tokens'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/users/me/api-tokens');
      if (error) throw new Error('Не удалось загрузить токены');
      return data;
    },
  });
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    if (!form.getAll('scope').length) {
      setFailed(true);
      setMessage('Выберите хотя бы одно право доступа.');
      return;
    }
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      const { data, error } = await api.POST('/api/v1/users/me/api-tokens', {
        body: {
          name: String(form.get('name')),
          expires_in_days: Number(form.get('days')),
          scopes: form.getAll('scope') as Scope[],
        },
      });
      if (error || !data) throw new Error(settingsError(error));
      // Секрет не попадает в кеш запросов или постоянное хранилище браузера.
      setSecret({ id: data.id, token: data.token });
      setDraftDirty(false);
      await cache.invalidateQueries({ queryKey: ['api-tokens'] });
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : 'Не удалось создать токен');
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      const { error } = await api.DELETE('/api/v1/users/me/api-tokens/{token_id}', {
        params: { path: { token_id: id } },
      });
      if (error) throw new Error('Не удалось отозвать токен');
      setConfirmId(null);
      setSecret((current) => (current?.id === id ? null : current));
      await cache.invalidateQueries({ queryKey: ['api-tokens'] });
      setMessage('Токен отозван. Новые запросы с ним отклоняются.');
      heading.current?.focus();
    } catch {
      setFailed(true);
      setMessage('Не удалось отозвать токен. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="mt-6 min-w-0 p-6">
      <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold">
        API и ИИ-агенты
      </h2>
      <p className="text-fg-muted mt-2 text-sm">
        Подключите своего агента, чтобы собирать карточки и курсы из конспектов. Токен даёт доступ к
        выбранным действиям от вашего имени. Не отправляйте его в чат или репозиторий.
      </p>
      {secret ? (
        <div className="bg-surface-muted mt-5 space-y-3 rounded-xl p-4">
          <p role="status">Сохраните токен сейчас: повторно показать его нельзя.</p>
          <Input
            className="min-h-11"
            label="Новый API-токен"
            value={secret.token}
            readOnly
            type="password"
            autoComplete="off"
          />
          <div className="flex flex-wrap gap-3">
            <Button
              className="min-h-11"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(secret.token);
                  setFailed(false);
                  setMessage('Токен скопирован');
                } catch {
                  setFailed(true);
                  setMessage('Копирование недоступно. Выделите поле и скопируйте вручную.');
                }
              }}
            >
              Скопировать токен
            </Button>
            <Button
              className="min-h-11"
              variant="secondary"
              onClick={() => {
                setSecret(null);
                setMessage('');
                heading.current?.focus();
              }}
            >
              Сохранено, скрыть
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => void create(event)}
          onChange={(event) => {
            const values = new FormData(event.currentTarget);
            const scopes = values.getAll('scope');
            setDraftDirty(
              Boolean(values.get('name')) ||
                values.get('days') !== '90' ||
                scopes.length !== 2 ||
                !scopes.includes('materials:read') ||
                !scopes.includes('materials:write'),
            );
          }}
        >
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <Input
              className="min-h-11"
              label="Название токена"
              name="name"
              required
              maxLength={100}
              placeholder="Мой учебный агент"
            />
            <label className="text-sm font-medium">
              Срок действия
              <select
                name="days"
                defaultValue="90"
                className="border-border bg-surface focus-visible:ring-primary mt-2 min-h-11 w-full rounded-xl border px-3 focus-visible:ring-2"
              >
                <option value="30">30 дней</option>
                <option value="90">90 дней</option>
                <option value="365">1 год</option>
              </select>
            </label>
          </fieldset>
          <fieldset disabled={busy}>
            <legend className="text-sm font-medium">Права доступа</legend>
            {availablePermissions.map(({ value, label }) => (
              <label key={value} className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  className="accent-primary focus-visible:ring-primary h-5 w-5 focus-visible:ring-2"
                  type="checkbox"
                  name="scope"
                  value={value}
                  defaultChecked={value === 'materials:read' || value === 'materials:write'}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <Button className="min-h-11" type="submit" loading={busy}>
            Создать токен
          </Button>
        </form>
      )}
      <SettingsFeedback
        notice={message ? { kind: failed ? 'error' : 'success', text: message } : null}
      />
      {query.isPending && <p className="text-fg-muted mt-4">Загружаем токены…</p>}
      {query.isError && (
        <p role="alert">
          Не удалось загрузить токены.{' '}
          <Button className="min-h-11" variant="secondary" onClick={() => void query.refetch()}>
            Повторить
          </Button>
        </p>
      )}
      {query.data?.length === 0 && <p className="text-fg-muted mt-4 text-sm">Токенов пока нет.</p>}
      <ul className="mt-4 space-y-3">
        {query.data?.map((token) => {
          const inactive = token.revoked_at || new Date(token.expires_at).getTime() <= Date.now();
          return (
            <li key={token.id} className="border-border rounded-xl border p-4">
              <p className="break-words font-medium">
                {token.name} <span className="text-fg-muted text-sm">{token.prefix}…</span>
              </p>
              <p className="text-fg-muted mt-1 text-sm">
                {token.revoked_at
                  ? 'Отозван'
                  : inactive
                    ? 'Срок действия истёк'
                    : `Действует до ${new Date(token.expires_at).toLocaleDateString('ru-RU')}`}
              </p>
              <p className="text-fg-muted mt-1 text-sm">
                Последнее использование:{' '}
                {token.last_used_at
                  ? new Date(token.last_used_at).toLocaleString('ru-RU')
                  : 'ещё не использовался'}
              </p>
              <p className="text-fg-muted mt-1 text-sm">
                {permissions
                  .filter((p) => token.scopes.includes(p.value))
                  .map((p) => p.label)
                  .join(' · ')}
              </p>
              {!inactive &&
                (confirmId === token.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span>Отозвать «{token.name}»? Новые запросы с ним будут отклонены.</span>
                    <Button
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => void revoke(token.id)}
                    >
                      Да, отозвать
                    </Button>
                    <Button
                      className="min-h-11"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setConfirmId(null);
                        trigger.current?.focus();
                      }}
                    >
                      Отмена
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="mt-3 min-h-11"
                    variant="secondary"
                    disabled={busy}
                    onClick={(event) => {
                      trigger.current = event.currentTarget;
                      setConfirmId(token.id);
                    }}
                  >
                    Отозвать
                  </Button>
                ))}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
