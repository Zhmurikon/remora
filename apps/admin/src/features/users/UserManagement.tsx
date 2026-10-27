import type { components } from '@remora/api-client';
import { Button, Card, Input } from '@remora/ui/base';
import { useMemo, useState } from 'react';
import { api, getErrorMessage } from '../../lib/api';
import { AdminActionConfirmation } from '../security/AdminActionConfirmation';

type UserDetail = components['schemas']['AdminUserDetail'];
type Role = components['schemas']['AdminUserRoleUpdate']['role'];

interface PendingAction {
  title: string;
  submitLabel: string;
  consequences: string[];
  idempotencyKey: string;
  run: (confirmationToken: string, reason: string, idempotencyKey: string) => Promise<void>;
}

const roleLabels: Record<Role, string> = {
  user: 'Пользователь',
  teacher: 'Преподаватель',
  moderator: 'Модератор',
  admin: 'Администратор',
};

export function UserManagement({ data, onUpdated }: { data: UserDetail; onUpdated: () => void }) {
  const [role, setRole] = useState<Role>(data.role as Role);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function runRole(confirmationToken: string, reason: string, idempotencyKey: string) {
    const { data: updated, error } = await api.PATCH('/api/v1/admin/users/{user_id}/role', {
      params: {
        path: { user_id: data.id },
        header: mutationHeaders(confirmationToken, idempotencyKey),
      },
      body: { role, reason },
    });
    if (!updated) throw new Error(getErrorMessage(error, 'Не удалось изменить роль'));
    setPending(null);
    setNotice('Роль изменена, активные refresh-сессии отозваны.');
    onUpdated();
  }

  async function runStatus(confirmationToken: string, reason: string, idempotencyKey: string) {
    const nextStatus = data.status === 'suspended' ? 'active' : 'suspended';
    const { data: updated, error } = await api.PATCH('/api/v1/admin/users/{user_id}/status', {
      params: {
        path: { user_id: data.id },
        header: mutationHeaders(confirmationToken, idempotencyKey),
      },
      body: { status: nextStatus, reason },
    });
    if (!updated) throw new Error(getErrorMessage(error, 'Не удалось изменить состояние'));
    setPending(null);
    setNotice(nextStatus === 'active' ? 'Доступ восстановлен.' : 'Аккаунт приостановлен.');
    onUpdated();
  }

  if (pending) {
    return (
      <AdminActionConfirmation
        title={pending.title}
        consequences={pending.consequences}
        submitLabel={pending.submitLabel}
        onCancel={() => setPending(null)}
        onConfirmed={(token, reason) => pending.run(token, reason, pending.idempotencyKey)}
      />
    );
  }

  const isDeleted = data.status === 'deleted';
  return (
    <Card className="p-5 shadow-none">
      <h2 className="text-xl font-semibold">Управление аккаунтом</h2>
      <p className="text-fg-muted mt-1 text-sm">
        Изменения требуют причины и повторного кода подтверждения.
      </p>
      {notice && (
        <p className="bg-success-subtle text-success mt-4 rounded-md p-3 text-sm" role="status">
          {notice}
        </p>
      )}
      <div className="mt-5 space-y-5">
        <div>
          <label htmlFor="admin-user-role" className="text-sm font-medium">
            Роль
          </label>
          <select
            id="admin-user-role"
            value={role}
            disabled={isDeleted}
            onChange={(event) => setRole(event.target.value as Role)}
            className="border-border bg-surface focus-visible:ring-primary mt-2 min-h-11 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
          >
            {Object.entries(roleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            className="mt-3"
            disabled={isDeleted || role === data.role}
            onClick={() =>
              setPending({
                title: `Изменить роль на «${roleLabels[role]}»?`,
                submitLabel: 'Изменить роль',
                idempotencyKey: crypto.randomUUID(),
                consequences: [
                  `Текущая роль «${roleLabels[data.role as Role]}» будет заменена.`,
                  'Активные refresh-сессии пользователя будут отозваны.',
                  role === 'admin'
                    ? 'Для входа в админку пользователь должен будет настроить собственный TOTP.'
                    : 'Новые права начнут действовать сразу.',
                ],
                run: runRole,
              })
            }
          >
            Сохранить роль
          </Button>
        </div>

        <div className="border-border border-t pt-5">
          <p className="font-medium">
            {data.status === 'suspended' ? 'Восстановление доступа' : 'Приостановка аккаунта'}
          </p>
          <p className="text-fg-muted mt-1 text-sm">
            Материалы и учебный прогресс пользователя не удаляются.
          </p>
          <Button
            type="button"
            variant={data.status === 'suspended' ? 'secondary' : 'danger'}
            fullWidth
            className="mt-3"
            disabled={isDeleted}
            onClick={() =>
              setPending({
                title:
                  data.status === 'suspended'
                    ? 'Восстановить доступ к аккаунту?'
                    : 'Приостановить аккаунт?',
                submitLabel: data.status === 'suspended' ? 'Восстановить' : 'Приостановить',
                idempotencyKey: crypto.randomUUID(),
                consequences:
                  data.status === 'suspended'
                    ? ['Пользователь снова сможет войти.', 'Материалы останутся без изменений.']
                    : [
                        'Пользователь сразу потеряет доступ ко всем защищённым API.',
                        'Все refresh-сессии будут отозваны.',
                        'Материалы и прогресс сохранятся.',
                      ],
                run: runStatus,
              })
            }
          >
            {data.status === 'suspended' ? 'Восстановить доступ' : 'Приостановить аккаунт'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function EntitlementManagement({
  data,
  onUpdated,
}: {
  data: UserDetail;
  onUpdated: () => void;
}) {
  const options = useMemo(
    () => [
      ...Object.keys(data.access.features).map((key) => `feature.${key}`),
      ...Object.keys(data.access.limits).map((key) => `limit.${key}`),
    ],
    [data.access.features, data.access.limits],
  );
  const [key, setKey] = useState(options[0] ?? '');
  const [rawValue, setRawValue] = useState('1');
  const [unlimited, setUnlimited] = useState(false);
  const [validUntil, setValidUntil] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isFeature = key.startsWith('feature.');

  async function grant(confirmationToken: string, reason: string, idempotencyKey: string) {
    const value = isFeature ? rawValue === 'true' : unlimited ? 'unlimited' : Number(rawValue);
    const { data: updated, error } = await api.POST('/api/v1/admin/users/{user_id}/entitlements', {
      params: {
        path: { user_id: data.id },
        header: mutationHeaders(confirmationToken, idempotencyKey),
      },
      body: {
        key,
        value,
        valid_until: validUntil ? new Date(validUntil).toISOString() : null,
        reason,
      },
    });
    if (!updated) throw new Error(getErrorMessage(error, 'Не удалось выдать право'));
    setPending(null);
    setNotice('Персональное право выдано.');
    onUpdated();
  }

  async function revoke(
    entitlementId: string,
    confirmationToken: string,
    reason: string,
    idempotencyKey: string,
  ) {
    const { data: updated, error } = await api.DELETE(
      '/api/v1/admin/users/{user_id}/entitlements/{entitlement_id}',
      {
        params: {
          path: { user_id: data.id, entitlement_id: entitlementId },
          header: mutationHeaders(confirmationToken, idempotencyKey),
        },
        body: { reason },
      },
    );
    if (!updated) throw new Error(getErrorMessage(error, 'Не удалось отозвать право'));
    setPending(null);
    setNotice('Персональное право отозвано.');
    onUpdated();
  }

  if (pending) {
    return (
      <AdminActionConfirmation
        title={pending.title}
        consequences={pending.consequences}
        submitLabel={pending.submitLabel}
        onCancel={() => setPending(null)}
        onConfirmed={(token, reason) => pending.run(token, reason, pending.idempotencyKey)}
      />
    );
  }

  return (
    <Card className="p-5 shadow-none">
      <h2 className="text-xl font-semibold">Персональные права</h2>
      <p className="text-fg-muted mt-1 text-sm">
        Ручное значение имеет приоритет над тарифом. Новая выдача заменяет прежнюю по тому же ключу.
      </p>
      {notice && (
        <p className="bg-success-subtle text-success mt-4 rounded-md p-3 text-sm" role="status">
          {notice}
        </p>
      )}
      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="entitlement-key" className="text-sm font-medium">
            Возможность или квота
          </label>
          <select
            id="entitlement-key"
            value={key}
            onChange={(event) => {
              setKey(event.target.value);
              setRawValue(event.target.value.startsWith('feature.') ? 'true' : '1');
              setUnlimited(false);
            }}
            className="border-border bg-surface focus-visible:ring-primary mt-2 min-h-11 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
          >
            {options.map((item) => (
              <option key={item} value={item}>
                {entitlementLabel(item)}
              </option>
            ))}
          </select>
        </div>
        {isFeature ? (
          <div>
            <label htmlFor="entitlement-feature-value" className="text-sm font-medium">
              Значение
            </label>
            <select
              id="entitlement-feature-value"
              value={rawValue}
              onChange={(event) => setRawValue(event.target.value)}
              className="border-border bg-surface focus-visible:ring-primary mt-2 min-h-11 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
            >
              <option value="true">Доступно</option>
              <option value="false">Недоступно</option>
            </select>
          </div>
        ) : (
          <>
            <Input
              label="Значение квоты"
              type="number"
              min={0}
              required={!unlimited}
              disabled={unlimited}
              value={rawValue}
              onChange={(event) => setRawValue(event.target.value)}
            />
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={unlimited}
                onChange={(event) => setUnlimited(event.target.checked)}
                className="accent-primary h-5 w-5"
              />
              Без лимита
            </label>
          </>
        )}
        <Input
          label="Действует до (необязательно)"
          type="datetime-local"
          value={validUntil}
          onChange={(event) => setValidUntil(event.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          fullWidth
          disabled={!key || (!isFeature && !unlimited && (!rawValue || Number(rawValue) < 0))}
          onClick={() =>
            setPending({
              title: 'Выдать персональное право?',
              submitLabel: 'Выдать право',
              idempotencyKey: crypto.randomUUID(),
              consequences: [
                `${entitlementLabel(key)} получит ручное значение.`,
                validUntil
                  ? `Право завершится ${new Date(validUntil).toLocaleString('ru-RU')}.`
                  : 'Право будет действовать без срока.',
                'Прежнее ручное значение этого ключа перестанет действовать.',
              ],
              run: grant,
            })
          }
        >
          Выдать право
        </Button>
      </div>

      {data.access.overrides.some((item) => item.revocable) && (
        <div className="border-border mt-6 border-t pt-5">
          <h3 className="font-semibold">Можно отозвать</h3>
          <ul className="mt-3 space-y-3">
            {data.access.overrides
              .filter((item) => item.revocable)
              .map((item) => (
                <li key={item.id} className="bg-surface-muted rounded-md p-3 text-sm">
                  <p className="font-medium">{entitlementLabel(item.key)}</p>
                  <p className="text-fg-muted mt-1">
                    {String(item.value)} · {item.reason}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-danger mt-2"
                    onClick={() =>
                      setPending({
                        title: 'Отозвать персональное право?',
                        submitLabel: 'Отозвать право',
                        idempotencyKey: crypto.randomUUID(),
                        consequences: [
                          `${entitlementLabel(item.key)} вернётся к значению тарифа.`,
                          'Материалы и обучение не будут удалены или заблокированы.',
                        ],
                        run: (token, reason, idempotencyKey) =>
                          revoke(item.id, token, reason, idempotencyKey),
                      })
                    }
                  >
                    Отозвать
                  </Button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function mutationHeaders(confirmationToken: string, idempotencyKey: string) {
  return {
    'X-Admin-Confirmation': confirmationToken,
    'Idempotency-Key': idempotencyKey,
  };
}

function entitlementLabel(key: string): string {
  const normalized = key.replace(/^(feature|limit)\./, '');
  return normalized.replaceAll('.', ' · ');
}
