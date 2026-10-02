import type { components } from '@remora/api-client';
import { useQuery } from '@tanstack/react-query';
import { Button, Input } from '@remora/ui/base';
import { useState, type FormEvent } from 'react';
import { api, getErrorMessage } from '../lib/api';

type UserItem = components['schemas']['AdminUserItem'];

const PAGE_SIZE = 25;
const integer = new Intl.NumberFormat('ru-RU');

export function UsersPage() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const users = useQuery({
    queryKey: ['admin', 'users', query, offset],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/users', {
        params: {
          query: {
            query: query || undefined,
            offset,
            limit: PAGE_SIZE,
          },
        },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось загрузить пользователей'));
      return data;
    },
    placeholderData: (previous) => previous,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setQuery(input.trim());
  }

  const end = Math.min(offset + PAGE_SIZE, users.data?.total ?? 0);

  return (
    <section aria-labelledby="users-title">
      <div>
        <h1 id="users-title" className="text-3xl font-semibold tracking-tight">
          Пользователи
        </h1>
        <p className="text-fg-muted mt-2">Поиск и основные показатели аккаунтов.</p>
      </div>

      <form className="mt-7 flex max-w-2xl items-end gap-3" onSubmit={submit}>
        <div className="min-w-0 flex-1">
          <Input
            label="Имя, почта или идентификатор"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Например, student@example.com"
          />
        </div>
        <Button type="submit" variant="secondary" className="min-h-10 shrink-0">
          Найти
        </Button>
      </form>

      {users.isPending ? (
        <UsersSkeleton />
      ) : users.isError ? (
        <div className="border-danger/30 bg-danger-subtle mt-7 rounded-lg border p-5" role="alert">
          <h2 className="font-semibold">Не удалось загрузить пользователей</h2>
          <p className="text-fg-muted mt-1 text-sm">{users.error.message}</p>
          <button
            type="button"
            className="text-primary mt-4 min-h-11 font-medium underline underline-offset-4"
            onClick={() => void users.refetch()}
          >
            Повторить
          </button>
        </div>
      ) : users.data.items.length === 0 ? (
        <div className="border-border bg-surface mt-7 rounded-lg border p-8 text-center">
          <h2 className="font-semibold">Пользователи не найдены</h2>
          <p className="text-fg-muted mt-2 text-sm">Измените запрос или очистите поле поиска.</p>
        </div>
      ) : (
        <>
          <p className="text-fg-subtle mt-7 text-sm" aria-live="polite">
            Показано с {integer.format(offset + 1)} по {integer.format(end)} из{' '}
            {integer.format(users.data.total)}
          </p>
          <UserTable items={users.data.items} />
          <div className="mt-5 flex justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={offset === 0}
              onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
            >
              Назад
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={offset + PAGE_SIZE >= users.data.total}
              onClick={() => setOffset((value) => value + PAGE_SIZE)}
            >
              Далее
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function UserTable({ items }: { items: UserItem[] }) {
  return (
    <div className="border-border bg-surface mt-3 overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="bg-surface-muted text-fg-muted">
            <tr>
              <th className="px-4 py-3 font-medium" scope="col">
                Пользователь
              </th>
              <th className="px-4 py-3 font-medium" scope="col">
                Состояние
              </th>
              <th className="px-4 py-3 font-medium" scope="col">
                Регистрация
              </th>
              <th className="px-4 py-3 font-medium" scope="col">
                Последняя учёба
              </th>
              <th className="px-4 py-3 text-right font-medium" scope="col">
                Материалы
              </th>
              <th className="px-4 py-3 text-right font-medium" scope="col">
                Ответы
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((user) => (
              <tr key={user.id} className="border-border border-t align-top">
                <td className="px-4 py-4">
                  <p className="font-medium">{user.display_name || user.username}</p>
                  <p className="text-fg-muted mt-0.5">{user.email || 'Почта не указана'}</p>
                  <p className="text-fg-subtle mt-1 font-mono text-xs">{user.username}</p>
                </td>
                <td className="px-4 py-4">
                  <p>{roleLabel(user.role)}</p>
                  <p className="text-fg-muted mt-1 text-xs">
                    {statusLabel(user.status)}.{' '}
                    {user.email_verified ? 'Почта подтверждена' : 'Почта не подтверждена'}
                  </p>
                </td>
                <td className="whitespace-nowrap px-4 py-4">{formatDate(user.created_at)}</td>
                <td className="whitespace-nowrap px-4 py-4">
                  {user.last_active_at ? formatDateTime(user.last_active_at) : 'Нет ответов'}
                </td>
                <td className="px-4 py-4 text-right font-mono tabular-nums">
                  {integer.format(user.sets_count)} наб. / {integer.format(user.courses_count)} кур.
                </td>
                <td className="px-4 py-4 text-right font-mono tabular-nums">
                  {integer.format(user.reviews_count)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsersSkeleton() {
  return (
    <div
      className="border-border bg-surface mt-7 space-y-3 rounded-lg border p-4"
      aria-label="Загрузка пользователей"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="bg-surface-muted h-16 animate-pulse rounded-md" />
      ))}
    </div>
  );
}

function roleLabel(role: string): string {
  return (
    {
      user: 'Пользователь',
      teacher: 'Преподаватель',
      moderator: 'Модератор',
      admin: 'Администратор',
    }[role] ?? role
  );
}

function statusLabel(status: string): string {
  return { active: 'Активен', suspended: 'Приостановлен', deleted: 'Удалён' }[status] ?? status;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}
