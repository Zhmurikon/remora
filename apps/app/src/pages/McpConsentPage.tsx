import { Button, Card } from '@remora/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { permissions, type Scope } from '../features/auth/agent-permissions';
import { useAuthStore } from '../features/auth/auth-store';
import { api } from '../lib/api';

export function McpConsentPage() {
  const [params] = useSearchParams();
  const ticket = params.get('request') ?? '';
  const email = useAuthStore((state) => state.user?.email);
  const [scopes, setScopes] = useState<Scope[]>(['materials:read']);
  const consent = useQuery({
    queryKey: ['mcp-consent', ticket, email],
    retry: false,
    enabled: !!ticket,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/mcp/consent/{ticket}', {
        params: { path: { ticket } },
      });
      if (error || !data) throw new Error('Запрос истёк. Начните подключение ещё раз в чате.');
      return data;
    },
  });
  const selected = scopes.filter((s) => consent.data?.scopes.includes(s));
  const decision = useMutation({
    mutationFn: async (allow: boolean) => {
      const { data, error } = await api.POST('/api/v1/mcp/consent/{ticket}', {
        params: { path: { ticket } },
        body: { allow, scopes: allow ? selected : [] },
      });
      if (error || !data)
        throw new Error('Не удалось завершить подключение. Начните его ещё раз в чате.');
      window.location.assign(data.redirect_uri);
    },
  });
  return (
    <main className="bg-surface-muted grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-lg space-y-4 p-6">
        <h1 className="text-2xl font-semibold">
          {consent.data ? 'Подключить ' + consent.data.client : 'Подключение к Запоминальне'}
        </h1>
        {!ticket || consent.isError ? (
          <p role="alert">Запрос недействителен или истёк. Начните подключение ещё раз в чате.</p>
        ) : consent.data ? (
          <>
            <p className="text-fg-muted">
              Аккаунт {email}. Выберите действия, которые приложение сможет выполнять от вашего
              имени.
            </p>
            <fieldset disabled={decision.isPending}>
              <legend className="font-semibold">Разрешения</legend>
              {permissions
                .filter((p) => consent.data.scopes.includes(p.value))
                .map(({ value, label }) => (
                  <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(value)}
                      onChange={(e) =>
                        setScopes((prev) =>
                          e.target.checked ? [...prev, value] : prev.filter((s) => s !== value),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
            </fieldset>
            <p className="text-fg-muted text-sm">
              Изменения опубликованного курса сразу доступны читателям. Доступ можно отозвать в
              настройках «API и ИИ-агенты».
            </p>
            {decision.isError && <p role="alert">{decision.error.message}</p>}
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={!selected.length || decision.isPending}
                onClick={() => decision.mutate(true)}
              >
                Разрешить
              </Button>
              <Button
                variant="secondary"
                disabled={decision.isPending}
                onClick={() => decision.mutate(false)}
              >
                Отказать
              </Button>
            </div>
          </>
        ) : (
          <p role="status">Загружаем запрос…</p>
        )}
      </Card>
    </main>
  );
}
