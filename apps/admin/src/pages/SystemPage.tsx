import type { components } from '@remora/api-client';
import { Button, Card, Input } from '@remora/ui/base';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { AdminActionConfirmation } from '../features/security/AdminActionConfirmation';
import { api, getErrorMessage } from '../lib/api';

type Overview = components['schemas']['AdminSystemOverview'];
type Flag = components['schemas']['AdminFeatureFlagItem'];
type Incident = components['schemas']['AdminIncidentItem'];
type FlagWrite = components['schemas']['AdminFeatureFlagWrite'];
type IncidentCreate = components['schemas']['AdminIncidentCreate'];
type IncidentUpdate = components['schemas']['AdminIncidentUpdate'];
type PendingAction =
  | { type: 'flag'; body: Omit<FlagWrite, 'reason'> }
  | { type: 'incident-create'; body: Omit<IncidentCreate, 'reason'> }
  | { type: 'incident-update'; incident: Incident; status: IncidentUpdate['status'] };

const stateLabels: Record<string, string> = {
  ok: 'Работает',
  degraded: 'Требует внимания',
  disabled: 'Отключено',
  unknown: 'Неизвестно',
};

export function SystemPage() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const system = useQuery({
    queryKey: ['admin', 'system'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/system');
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось проверить систему'));
      return data;
    },
    refetchInterval: 30_000,
  });

  async function runAction(confirmation: string, reason: string) {
    if (!pending) return;
    const headers = {
      'X-Admin-Confirmation': confirmation,
      'Idempotency-Key': crypto.randomUUID(),
    };
    if (pending.type === 'flag') {
      const { data, error } = await api.PUT('/api/v1/admin/system/flags', {
        params: { header: headers },
        body: { ...pending.body, reason },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось сохранить фиче-флаг'));
      setMessage('Фиче-флаг сохранён.');
    } else if (pending.type === 'incident-create') {
      const { data, error } = await api.POST('/api/v1/admin/system/incidents', {
        params: { header: headers },
        body: { ...pending.body, reason },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось создать инцидент'));
      setMessage('Инцидент добавлен в журнал.');
    } else {
      const { incident, status } = pending;
      const { data, error } = await api.PATCH('/api/v1/admin/system/incidents/{incident_id}', {
        params: { path: { incident_id: incident.id }, header: headers },
        body: {
          summary: incident.summary,
          severity: incident.severity as IncidentUpdate['severity'],
          status,
          external_url: incident.external_url,
          reason,
        },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось обновить инцидент'));
      setMessage(status === 'resolved' ? 'Инцидент закрыт.' : 'Инцидент переведён в наблюдение.');
    }
    setPending(null);
    await queryClient.invalidateQueries({ queryKey: ['admin', 'system'] });
  }

  if (system.isPending) {
    return (
      <p className="text-fg-muted" aria-live="polite">
        Проверяем состояние системы…
      </p>
    );
  }
  if (system.isError) {
    return (
      <p className="text-danger" role="alert">
        {system.error.message}
      </p>
    );
  }

  return (
    <section aria-labelledby="system-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 id="system-title" className="text-3xl font-semibold tracking-tight">
            Состояние системы
          </h1>
          <p className="text-fg-muted mt-2 max-w-3xl">
            Живые зависимости, конфигурация интеграций, фиче-флаги и журнал инцидентов.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void system.refetch()}>
          Проверить снова
        </Button>
      </div>
      {message && (
        <p
          className="bg-success-subtle text-success mt-5 rounded-md px-4 py-3 text-sm"
          role="status"
        >
          {message}
        </p>
      )}
      <Checks overview={system.data} />
      <Flags flags={system.data.flags} onSave={(body) => setPending({ type: 'flag', body })} />
      <Incidents
        incidents={system.data.incidents}
        onCreate={(body) => setPending({ type: 'incident-create', body })}
        onStatus={(incident, status) => setPending({ type: 'incident-update', incident, status })}
      />
      {pending && (
        <div className="mt-8">
          <AdminActionConfirmation
            title={actionTitle(pending)}
            consequences={actionConsequences(pending)}
            submitLabel="Подтвердить"
            onConfirmed={runAction}
            onCancel={() => setPending(null)}
          />
        </div>
      )}
    </section>
  );
}

function Checks({ overview }: { overview: Overview }) {
  return (
    <section className="mt-8" aria-labelledby="checks-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="checks-title" className="text-xl font-semibold">
            Зависимости и интеграции
          </h2>
          <p className="text-fg-subtle mt-1 text-sm">Проверено {formatDate(overview.checked_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {overview.monitoring_links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="border-border hover:bg-surface-muted focus-visible:ring-primary inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {overview.checks.map((check) => (
          <Card key={check.key} className="p-4 shadow-none">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{check.label}</p>
                <p className="text-fg-subtle mt-0.5 text-xs">{check.group}</p>
              </div>
              <StateBadge state={check.state} />
            </div>
            <p className="text-fg-muted mt-4 text-sm">{check.detail}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Flags({
  flags,
  onSave,
}: {
  flags: Flag[];
  onSave: (body: Omit<FlagWrite, 'reason'>) => void;
}) {
  const [draft, setDraft] = useState({
    key: '',
    description: '',
    enabled: false,
    environment: 'local' as FlagWrite['environment'],
    owner: '',
    expires_at: '',
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      ...draft,
      expires_at: draft.expires_at ? new Date(draft.expires_at).toISOString() : null,
    });
  }

  return (
    <section className="mt-10" aria-labelledby="flags-title">
      <h2 id="flags-title" className="text-xl font-semibold">
        Фиче-флаги
      </h2>
      <p className="text-fg-muted mt-1 text-sm">
        У каждого флага есть окружение, владелец и срок пересмотра.
      </p>
      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <div className="space-y-3">
          {flags.length === 0 ? (
            <Card className="p-6 text-center shadow-none">
              <p className="text-fg-muted">Фиче-флагов пока нет.</p>
            </Card>
          ) : (
            flags.map((flag) => (
              <Card key={flag.id} className="p-4 shadow-none">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-sm font-semibold">{flag.key}</code>
                      <StateBadge
                        state={flag.effective ? 'ok' : flag.enabled ? 'degraded' : 'disabled'}
                      />
                    </div>
                    <p className="text-fg-muted mt-2 text-sm">{flag.description}</p>
                    <p className="text-fg-subtle mt-2 text-xs">
                      {flag.environment} · {flag.owner}
                      {flag.expires_at ? ` · до ${formatDate(flag.expires_at)}` : ' · без срока'}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setDraft({
                        key: flag.key,
                        description: flag.description,
                        enabled: !flag.enabled,
                        environment: flag.environment as FlagWrite['environment'],
                        owner: flag.owner,
                        expires_at: flag.expires_at ? flag.expires_at.slice(0, 16) : '',
                      })
                    }
                  >
                    {flag.enabled ? 'Подготовить отключение' : 'Подготовить включение'}
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
        <Card className="p-5 shadow-none">
          <h3 className="font-semibold">Настроить флаг</h3>
          <form className="mt-4 space-y-3" onSubmit={submit}>
            <Input
              label="Ключ"
              required
              minLength={3}
              value={draft.key}
              onChange={(event) => setDraft({ ...draft, key: event.target.value })}
            />
            <Input
              label="Описание"
              required
              minLength={3}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
            <Input
              label="Владелец"
              required
              minLength={2}
              value={draft.owner}
              onChange={(event) => setDraft({ ...draft, owner: event.target.value })}
            />
            <label className="block text-sm font-medium">
              Окружение
              <select
                className="border-border bg-surface mt-1 min-h-11 w-full rounded-md border px-3"
                value={draft.environment}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    environment: event.target.value as FlagWrite['environment'],
                  })
                }
              >
                <option value="local">local</option>
                <option value="staging">staging</option>
                <option value="production">production</option>
              </select>
            </label>
            <Input
              label="Срок пересмотра"
              type="datetime-local"
              value={draft.expires_at}
              onChange={(event) => setDraft({ ...draft, expires_at: event.target.value })}
            />
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={draft.enabled}
                onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
              />
              Флаг включён
            </label>
            <Button type="submit" fullWidth>
              Проверить и сохранить
            </Button>
          </form>
        </Card>
      </div>
    </section>
  );
}

function Incidents({
  incidents,
  onCreate,
  onStatus,
}: {
  incidents: Incident[];
  onCreate: (body: Omit<IncidentCreate, 'reason'>) => void;
  onStatus: (incident: Incident, status: IncidentUpdate['status']) => void;
}) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [severity, setSeverity] = useState<IncidentCreate['severity']>('medium');
  const [externalUrl, setExternalUrl] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      title,
      summary,
      severity,
      external_url: externalUrl || null,
      started_at: new Date().toISOString(),
    });
  }

  return (
    <section className="mt-10" aria-labelledby="incidents-title">
      <h2 id="incidents-title" className="text-xl font-semibold">
        Журнал инцидентов
      </h2>
      <p className="text-fg-muted mt-1 text-sm">
        Краткая операционная история со ссылками на подробные графики.
      </p>
      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <div className="space-y-3">
          {incidents.length === 0 ? (
            <Card className="p-6 text-center shadow-none">
              <p className="text-fg-muted">Инцидентов пока нет.</p>
            </Card>
          ) : (
            incidents.map((incident) => (
              <Card key={incident.id} className="p-4 shadow-none">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{incident.title}</h3>
                      <span className="bg-warning-subtle text-warning rounded-full px-2.5 py-1 text-xs font-medium">
                        {incident.severity}
                      </span>
                      <StateBadge
                        state={
                          incident.status === 'resolved'
                            ? 'ok'
                            : incident.status === 'monitoring'
                              ? 'degraded'
                              : 'unknown'
                        }
                        label={incident.status}
                      />
                    </div>
                    <p className="text-fg-muted mt-2 text-sm">{incident.summary}</p>
                    <p className="text-fg-subtle mt-2 text-xs">
                      Начало: {formatDate(incident.started_at)}
                    </p>
                    {incident.external_url && (
                      <a
                        className="text-primary mt-2 inline-block text-sm underline-offset-4 hover:underline"
                        href={incident.external_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть графики
                      </a>
                    )}
                  </div>
                  {incident.status !== 'resolved' && (
                    <div className="flex shrink-0 gap-2">
                      {incident.status === 'open' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onStatus(incident, 'monitoring')}
                        >
                          Наблюдать
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onStatus(incident, 'resolved')}
                      >
                        Закрыть
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
        <Card className="p-5 shadow-none">
          <h3 className="font-semibold">Зафиксировать инцидент</h3>
          <form className="mt-4 space-y-3" onSubmit={submit}>
            <Input
              label="Заголовок"
              required
              minLength={3}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <label className="block text-sm font-medium">
              Краткое описание
              <textarea
                className="border-border bg-surface mt-1 min-h-28 w-full rounded-md border p-3"
                required
                minLength={10}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Критичность
              <select
                className="border-border bg-surface mt-1 min-h-11 w-full rounded-md border px-3"
                value={severity}
                onChange={(event) => setSeverity(event.target.value as IncidentCreate['severity'])}
              >
                <option value="low">Низкая</option>
                <option value="medium">Средняя</option>
                <option value="high">Высокая</option>
                <option value="critical">Критическая</option>
              </select>
            </label>
            <Input
              label="Ссылка на графики"
              type="url"
              value={externalUrl}
              onChange={(event) => setExternalUrl(event.target.value)}
            />
            <Button type="submit" fullWidth>
              Проверить и добавить
            </Button>
          </form>
        </Card>
      </div>
    </section>
  );
}

function StateBadge({ state, label }: { state: string; label?: string }) {
  const tone =
    state === 'ok'
      ? 'bg-success-subtle text-success'
      : state === 'degraded'
        ? 'bg-warning-subtle text-warning'
        : state === 'disabled'
          ? 'bg-surface-muted text-fg-muted'
          : 'bg-danger-subtle text-danger';
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {label ?? stateLabels[state] ?? state}
    </span>
  );
}

function actionTitle(action: PendingAction) {
  if (action.type === 'flag') return 'Сохранить фиче-флаг';
  if (action.type === 'incident-create') return 'Добавить инцидент';
  return action.status === 'resolved' ? 'Закрыть инцидент' : 'Перевести в наблюдение';
}

function actionConsequences(action: PendingAction) {
  if (action.type === 'flag')
    return [
      `Флаг ${action.body.key} будет ${action.body.enabled ? 'включён' : 'отключён'} в окружении ${action.body.environment}.`,
      'Изменение попадёт в административный аудит.',
    ];
  if (action.type === 'incident-create')
    return [
      'Запись появится в общем операционном журнале.',
      'Секреты и персональные данные не следует указывать в описании.',
    ];
  return [
    `Состояние инцидента изменится на «${action.status}».`,
    'Изменение попадёт в административный аудит.',
  ];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}
