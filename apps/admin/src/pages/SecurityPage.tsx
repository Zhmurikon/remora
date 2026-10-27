import type { components } from '@remora/api-client';
import { Card } from '@remora/ui/base';
import { useQuery } from '@tanstack/react-query';
import { api, getErrorMessage } from '../lib/api';

type AuditItem = components['schemas']['AdminAuditItem'];

const actionLabels: Record<string, string> = {
  'admin.login.password': 'Проверка пароля',
  'admin.2fa.setup_started': 'Начало настройки 2FA',
  'admin.2fa.enabled': 'Включение 2FA',
  'admin.login.2fa': 'Проверка второго фактора',
  'admin.confirmation': 'Повторное подтверждение',
  'admin.user.role_changed': 'Изменение роли пользователя',
  'admin.user.status_changed': 'Изменение состояния пользователя',
  'admin.user.entitlement_granted': 'Выдача персонального права',
  'admin.user.entitlement_revoked': 'Отзыв персонального права',
  'admin.moderation.report_resolved': 'Решение по жалобе',
  'admin.moderation.course_warn': 'Предупреждение автору',
  'admin.moderation.course_unpublish': 'Снятие курса с публикации',
  'admin.moderation.course_block': 'Блокировка курса',
  'admin.moderation.course_restore': 'Восстановление курса',
};

export function SecurityPage() {
  const status = useQuery({
    queryKey: ['admin', 'security', 'status'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/security/status');
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось загрузить состояние защиты'));
      return data;
    },
  });
  const audit = useQuery({
    queryKey: ['admin', 'security', 'audit'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/security/audit', {
        params: { query: { offset: 0, limit: 50 } },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось загрузить журнал'));
      return data;
    },
  });

  return (
    <section aria-labelledby="security-title">
      <h1 id="security-title" className="text-3xl font-semibold tracking-tight">
        Безопасность
      </h1>
      <p className="text-fg-muted mt-2 max-w-2xl">
        Настройки дополнительной защиты и журнал административных действий.
      </p>

      {status.isError ? (
        <ErrorState message={status.error.message} />
      ) : (
        <Card className="mt-7 p-5 shadow-none sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Двухфакторный вход</h2>
              <p className="text-fg-muted mt-1 text-sm">
                {status.data?.required
                  ? 'Для доступа к панели требуется пароль и одноразовый код.'
                  : 'Сейчас вход выполняется по паролю администратора.'}
              </p>
            </div>
            <span className="bg-success-subtle text-success rounded-full px-3 py-1 text-sm font-medium">
              {status.isPending
                ? 'Проверяем…'
                : status.data.required
                  ? 'Обязателен'
                  : 'Не обязателен'}
            </span>
          </div>
          {status.data && (
            <dl className="border-border mt-6 grid gap-5 border-t pt-5 sm:grid-cols-3">
              <StatusValue label="Включён" value={formatDate(status.data.enabled_at)} />
              <StatusValue
                label="Последнее подтверждение"
                value={formatDate(status.data.last_used_at)}
              />
              <StatusValue
                label="Кодов восстановления"
                value={String(status.data.recovery_codes_remaining)}
              />
            </dl>
          )}
        </Card>
      )}

      <section className="mt-9" aria-labelledby="audit-title">
        <h2 id="audit-title" className="text-xl font-semibold">
          Журнал действий
        </h2>
        <p className="text-fg-muted mt-1 text-sm">
          Последние входы, проверки безопасности и изменения пользователей.
        </p>
        {audit.isError ? (
          <ErrorState message={audit.error.message} />
        ) : audit.isPending ? (
          <div className="border-border bg-surface mt-5 h-40 animate-pulse rounded-lg border" />
        ) : audit.data.items.length === 0 ? (
          <p className="text-fg-muted mt-5">Записей пока нет.</p>
        ) : (
          <div className="border-border mt-5 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-surface-muted text-fg-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Время</th>
                  <th className="px-4 py-3 font-medium">Администратор</th>
                  <th className="px-4 py-3 font-medium">Действие</th>
                  <th className="px-4 py-3 font-medium">Результат</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {audit.data.items.map((item) => (
                  <AuditRow key={item.id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function StatusValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function AuditRow({ item }: { item: AuditItem }) {
  const success = item.outcome === 'success';
  return (
    <tr>
      <td className="whitespace-nowrap px-4 py-3">{formatDate(item.created_at)}</td>
      <td className="px-4 py-3">{item.actor_username ?? 'Система'}</td>
      <td className="px-4 py-3">
        <span>{actionLabels[item.action] ?? item.action}</span>
        {item.reason && <span className="text-fg-muted mt-1 block text-xs">{item.reason}</span>}
      </td>
      <td className={`px-4 py-3 font-medium ${success ? 'text-success' : 'text-danger'}`}>
        {success ? 'Успешно' : 'Отклонено'}
      </td>
      <td className="text-fg-muted px-4 py-3 font-mono">{item.ip ?? '—'}</td>
    </tr>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="border-danger/30 bg-danger-subtle mt-5 rounded-lg border p-5" role="alert">
      <p className="font-medium">Не удалось загрузить данные</p>
      <p className="text-fg-muted mt-1 text-sm">{message}</p>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
