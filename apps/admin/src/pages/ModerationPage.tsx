import type { components } from '@remora/api-client';
import { Button, Card, Input } from '@remora/ui/base';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { AdminActionConfirmation } from '../features/security/AdminActionConfirmation';
import { api, getErrorMessage } from '../lib/api';

type Report = components['schemas']['AdminModerationReportItem'];
type Course = components['schemas']['AdminModerationCourseItem'];
type CourseDetail = components['schemas']['AdminModerationCourseDetail'];
type ReportStatus = components['schemas']['ReportStatus'];
type CourseAction = components['schemas']['AdminModerationCourseAction']['action'];

interface PendingAction {
  title: string;
  submitLabel: string;
  consequences: string[];
  idempotencyKey: string;
  run: (confirmation: string, reason: string, idempotencyKey: string) => Promise<void>;
}

const reportReasonLabels: Record<string, string> = {
  spam: 'Спам',
  misleading: 'Вводит в заблуждение',
  copyright: 'Нарушение авторских прав',
  offensive: 'Оскорбительный материал',
  adult: 'Материал для взрослых',
  other: 'Другая причина',
};

const historyLabels: Record<string, string> = {
  'admin.moderation.report_resolved': 'Решение по жалобе',
  'admin.moderation.course_warn': 'Предупреждение автору',
  'admin.moderation.course_unpublish': 'Снятие с публикации',
  'admin.moderation.course_block': 'Блокировка публикации',
  'admin.moderation.course_restore': 'Восстановление публикации',
};

export function ModerationPage() {
  const [view, setView] = useState<'reports' | 'courses'>('reports');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [reportStatus, setReportStatus] = useState<ReportStatus | 'all'>('open');
  const [courseStatus, setCourseStatus] = useState<'all' | 'pending' | 'ok' | 'blocked'>('all');
  const [offset, setOffset] = useState(0);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const limit = 25;

  const reports = useQuery({
    queryKey: ['admin', 'moderation', 'reports', submittedQuery, reportStatus, offset],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/moderation/reports', {
        params: {
          query: {
            query: submittedQuery || undefined,
            status: reportStatus === 'all' ? undefined : reportStatus,
            offset,
            limit,
          },
        },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось загрузить жалобы'));
      return data;
    },
    enabled: view === 'reports',
  });
  const courses = useQuery({
    queryKey: ['admin', 'moderation', 'courses', submittedQuery, courseStatus, offset],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/moderation/courses', {
        params: {
          query: {
            query: submittedQuery || undefined,
            moderation_status: courseStatus === 'all' ? undefined : courseStatus,
            offset,
            limit,
          },
        },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось загрузить публикации'));
      return data;
    },
    enabled: view === 'courses',
  });
  const detail = useQuery({
    queryKey: ['admin', 'moderation', 'course', selectedCourseId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/moderation/courses/{course_id}', {
        params: { path: { course_id: selectedCourseId ?? '' } },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось загрузить публикацию'));
      return data;
    },
    enabled: selectedCourseId !== null,
  });

  const activeList = view === 'reports' ? reports.data : courses.data;
  const isPending = view === 'reports' ? reports.isPending : courses.isPending;
  const error = view === 'reports' ? reports.error : courses.error;

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setSubmittedQuery(query.trim());
  }

  async function refresh(message: string, data?: CourseDetail) {
    setPending(null);
    setNotice(message);
    if (data) setSelectedCourseId(data.id);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation', 'reports'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation', 'courses'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation', 'course'] }),
    ]);
  }

  function confirmReport(report: Report, outcome: 'accepted' | 'rejected') {
    const accepted = outcome === 'accepted';
    setPending({
      title: accepted ? 'Принять жалобу и заблокировать курс?' : 'Отклонить жалобу?',
      submitLabel: accepted ? 'Принять жалобу' : 'Отклонить жалобу',
      idempotencyKey: crypto.randomUUID(),
      consequences: accepted
        ? [
            'Курс сразу исчезнет из публичного доступа и поиска.',
            'Материалы автора и учебный прогресс сохранятся.',
            'Решение и причина попадут в историю модерации.',
          ]
        : [
            'Жалоба будет закрыта как необоснованная.',
            'Курс останется доступным, если не заблокирован другим решением.',
          ],
      run: async (confirmation, reason, idempotencyKey) => {
        const { data, error } = await api.POST(
          '/api/v1/admin/moderation/reports/{report_id}/resolve',
          {
            params: {
              path: { report_id: report.id },
              header: mutationHeaders(confirmation, idempotencyKey),
            },
            body: { outcome, reason },
          },
        );
        if (!data) throw new Error(getErrorMessage(error, 'Не удалось сохранить решение'));
        await refresh(accepted ? 'Жалоба принята, курс заблокирован.' : 'Жалоба отклонена.', data);
      },
    });
  }

  function confirmCourseAction(course: CourseDetail, action: CourseAction) {
    const config = actionConfig(action);
    setPending({
      ...config,
      idempotencyKey: crypto.randomUUID(),
      run: async (confirmation, reason, idempotencyKey) => {
        const { data, error } = await api.POST(
          '/api/v1/admin/moderation/courses/{course_id}/actions',
          {
            params: {
              path: { course_id: course.id },
              header: mutationHeaders(confirmation, idempotencyKey),
            },
            body: { action, reason },
          },
        );
        if (!data) throw new Error(getErrorMessage(error, 'Не удалось выполнить действие'));
        await refresh(config.success, data);
      },
    });
  }

  return (
    <section aria-labelledby="moderation-title">
      <h1 id="moderation-title" className="text-3xl font-semibold tracking-tight">
        Модерация
      </h1>
      <p className="text-fg-muted mt-2 max-w-2xl">
        Жалобы, публикации и история решений. Блокировка не удаляет материалы автора.
      </p>

      <div className="border-border mt-7 flex gap-2 border-b" role="tablist" aria-label="Очереди">
        <Tab active={view === 'reports'} onClick={() => switchView('reports')}>
          Жалобы
        </Tab>
        <Tab active={view === 'courses'} onClick={() => switchView('courses')}>
          Публикации
        </Tab>
      </div>

      <form
        className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]"
        onSubmit={submitSearch}
      >
        <Input
          label="Поиск"
          placeholder="Курс, автор, жалоба"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="text-sm font-medium">
          Состояние
          {view === 'reports' ? (
            <select
              className="border-border bg-surface focus-visible:ring-primary mt-1 min-h-11 w-full rounded-md border px-3 focus-visible:outline-none focus-visible:ring-2"
              value={reportStatus}
              onChange={(event) => {
                setOffset(0);
                setReportStatus(event.target.value as ReportStatus | 'all');
              }}
            >
              <option value="open">Открытые</option>
              <option value="accepted">Принятые</option>
              <option value="rejected">Отклонённые</option>
              <option value="all">Все</option>
            </select>
          ) : (
            <select
              className="border-border bg-surface focus-visible:ring-primary mt-1 min-h-11 w-full rounded-md border px-3 focus-visible:outline-none focus-visible:ring-2"
              value={courseStatus}
              onChange={(event) => {
                setOffset(0);
                setCourseStatus(event.target.value as typeof courseStatus);
              }}
            >
              <option value="all">Все</option>
              <option value="pending">Ожидают проверки</option>
              <option value="ok">Проверены</option>
              <option value="blocked">Заблокированы</option>
            </select>
          )}
        </label>
        <Button type="submit" className="min-h-11 self-end">
          Найти
        </Button>
      </form>

      {notice && (
        <p className="bg-success-subtle text-success mt-4 rounded-md p-3 text-sm" role="status">
          {notice}
        </p>
      )}
      {pending ? (
        <div className="mt-6 max-w-2xl">
          <AdminActionConfirmation
            title={pending.title}
            consequences={pending.consequences}
            submitLabel={pending.submitLabel}
            onCancel={() => setPending(null)}
            onConfirmed={(token, reason) => pending.run(token, reason, pending.idempotencyKey)}
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <div>
            {error ? (
              <ErrorState message={error.message} />
            ) : isPending ? (
              <div className="border-border bg-surface h-48 animate-pulse rounded-lg border" />
            ) : !activeList || activeList.items.length === 0 ? (
              <Card className="p-6 text-center shadow-none">
                <h2 className="font-semibold">Ничего не найдено</h2>
                <p className="text-fg-muted mt-1 text-sm">Измените поиск или фильтр.</p>
              </Card>
            ) : view === 'reports' ? (
              <div className="space-y-3">
                {reports.data?.items.map((report) => (
                  <ReportRow
                    key={report.id}
                    report={report}
                    selected={selectedCourseId === report.course_id}
                    onSelect={() => setSelectedCourseId(report.course_id)}
                    onResolve={confirmReport}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {courses.data?.items.map((course) => (
                  <CourseRow
                    key={course.id}
                    course={course}
                    selected={selectedCourseId === course.id}
                    onSelect={() => setSelectedCourseId(course.id)}
                  />
                ))}
              </div>
            )}
            {activeList && (
              <Pagination
                offset={offset}
                limit={limit}
                total={activeList.total}
                onChange={setOffset}
              />
            )}
          </div>
          <CoursePanel
            data={detail.data}
            loading={detail.isPending && selectedCourseId !== null}
            error={detail.error?.message}
            onAction={confirmCourseAction}
            onResolve={confirmReport}
          />
        </div>
      )}
    </section>
  );

  function switchView(next: 'reports' | 'courses') {
    setView(next);
    setOffset(0);
    setSelectedCourseId(null);
    setNotice(null);
  }
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`focus-visible:ring-primary min-h-11 border-b-2 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 ${active ? 'border-primary text-primary' : 'text-fg-muted border-transparent'}`}
    >
      {children}
    </button>
  );
}

function ReportRow({
  report,
  selected,
  onSelect,
  onResolve,
}: {
  report: Report;
  selected: boolean;
  onSelect: () => void;
  onResolve: (report: Report, outcome: 'accepted' | 'rejected') => void;
}) {
  return (
    <Card className={`p-4 shadow-none ${selected ? 'ring-primary ring-2' : ''}`}>
      <button type="button" className="w-full text-left" onClick={onSelect}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">{report.course_title}</h2>
            <p className="text-fg-muted mt-1 text-sm">
              Автор: {report.author_username} · Жалоба: {report.reporter_username}
            </p>
          </div>
          <StatusBadge value={report.status} />
        </div>
        <p className="mt-3 text-sm font-medium">{reportReasonLabels[report.reason]}</p>
        {report.comment && <p className="text-fg-muted mt-1 text-sm">{report.comment}</p>}
        <p className="text-fg-subtle mt-3 text-xs">{formatDate(report.created_at)}</p>
      </button>
      {report.status === 'open' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="danger" onClick={() => onResolve(report, 'accepted')}>
            Принять
          </Button>
          <Button type="button" variant="secondary" onClick={() => onResolve(report, 'rejected')}>
            Отклонить
          </Button>
        </div>
      )}
    </Card>
  );
}

function CourseRow({
  course,
  selected,
  onSelect,
}: {
  course: Course;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className="w-full text-left" onClick={onSelect}>
      <Card
        className={`p-4 shadow-none transition-colors ${selected ? 'ring-primary ring-2' : ''}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">{course.title}</h2>
            <p className="text-fg-muted mt-1 text-sm">{course.author_username}</p>
          </div>
          <StatusBadge value={course.moderation_status} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {course.risk_signals.map((signal) => (
            <span
              key={signal}
              className="bg-warning-subtle text-warning rounded-full px-2.5 py-1 text-xs"
            >
              {signal}
            </span>
          ))}
          {course.risk_signals.length === 0 && (
            <span className="text-success text-sm">Сигналов риска нет</span>
          )}
        </div>
      </Card>
    </button>
  );
}

function CoursePanel({
  data,
  loading,
  error,
  onAction,
  onResolve,
}: {
  data?: CourseDetail;
  loading: boolean;
  error?: string;
  onAction: (course: CourseDetail, action: CourseAction) => void;
  onResolve: (report: Report, outcome: 'accepted' | 'rejected') => void;
}) {
  if (error) return <ErrorState message={error} />;
  if (loading)
    return <div className="border-border bg-surface h-64 animate-pulse rounded-lg border" />;
  if (!data) {
    return (
      <Card className="p-6 shadow-none">
        <h2 className="font-semibold">Выберите публикацию</h2>
        <p className="text-fg-muted mt-1 text-sm">Здесь появятся содержание и история решений.</p>
      </Card>
    );
  }
  return (
    <aside className="space-y-4" aria-label="Карточка публикации">
      <Card className="p-5 shadow-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{data.title}</h2>
            <p className="text-fg-muted mt-1 text-sm">Автор: {data.author_username}</p>
          </div>
          <StatusBadge value={data.moderation_status} />
        </div>
        <p className="text-fg-muted mt-4 text-sm">{data.description || 'Описание не заполнено.'}</p>
        <dl className="border-border mt-5 grid grid-cols-2 gap-4 border-t pt-4 text-sm">
          <Meta label="Публикация" value={data.is_published ? 'Опубликована' : 'Снята'} />
          <Meta
            label="Жалобы"
            value={`${data.reports_open} открытых · ${data.reports_total} всего`}
          />
        </dl>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="secondary" onClick={() => onAction(data, 'warn')}>
            Предупредить автора
          </Button>
          {data.is_published && (
            <Button type="button" variant="secondary" onClick={() => onAction(data, 'unpublish')}>
              Снять с публикации
            </Button>
          )}
          {data.moderation_status === 'blocked' ? (
            <Button type="button" variant="secondary" onClick={() => onAction(data, 'restore')}>
              Снять блокировку
            </Button>
          ) : (
            <Button type="button" variant="danger" onClick={() => onAction(data, 'block')}>
              Заблокировать
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-5 shadow-none">
        <h3 className="font-semibold">Жалобы</h3>
        {data.reports.length === 0 ? (
          <p className="text-fg-muted mt-3 text-sm">Жалоб пока нет.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.reports.map((report) => (
              <li key={report.id} className="border-border border-t pt-3 first:border-0 first:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{reportReasonLabels[report.reason]}</span>
                  <StatusBadge value={report.status} />
                </div>
                {report.comment && <p className="text-fg-muted mt-1 text-sm">{report.comment}</p>}
                {report.status === 'open' && (
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => onResolve(report, 'accepted')}
                    >
                      Принять
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => onResolve(report, 'rejected')}
                    >
                      Отклонить
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5 shadow-none">
        <h3 className="font-semibold">История решений</h3>
        {data.history.length === 0 ? (
          <p className="text-fg-muted mt-3 text-sm">Решений пока нет.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {data.history.map((item) => (
              <li key={item.id} className="border-border border-t pt-3 first:border-0 first:pt-0">
                <p className="text-sm font-medium">{historyLabels[item.action] ?? item.action}</p>
                <p className="text-fg-muted mt-1 text-sm">{item.reason ?? 'Причина не указана'}</p>
                <p className="text-fg-subtle mt-1 text-xs">
                  {item.actor_username ?? 'Система'} · {formatDate(item.created_at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </aside>
  );
}

function StatusBadge({ value }: { value: string }) {
  const labels: Record<string, string> = {
    open: 'Открыта',
    accepted: 'Принята',
    rejected: 'Отклонена',
    pending: 'Ожидает проверки',
    ok: 'Проверен',
    blocked: 'Заблокирован',
  };
  const tone =
    value === 'blocked' || value === 'accepted'
      ? 'bg-danger-subtle text-danger'
      : value === 'ok' || value === 'rejected'
        ? 'bg-success-subtle text-success'
        : 'bg-warning-subtle text-warning';
  return (
    <span className={`${tone} rounded-full px-2.5 py-1 text-xs font-medium`}>
      {labels[value] ?? value}
    </span>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function Pagination({
  offset,
  limit,
  total,
  onChange,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
}) {
  if (total <= limit) return null;
  return (
    <div className="mt-5 flex items-center justify-between gap-3">
      <Button
        type="button"
        variant="secondary"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        Назад
      </Button>
      <span className="text-fg-muted text-sm">
        {offset + 1}–{Math.min(offset + limit, total)} из {total}
      </span>
      <Button
        type="button"
        variant="secondary"
        disabled={offset + limit >= total}
        onClick={() => onChange(offset + limit)}
      >
        Дальше
      </Button>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="border-danger/30 bg-danger-subtle rounded-lg border p-5" role="alert">
      <p className="font-medium">Не удалось загрузить данные</p>
      <p className="text-fg-muted mt-1 text-sm">{message}</p>
    </div>
  );
}

function actionConfig(action: CourseAction) {
  const configs = {
    warn: {
      title: 'Предупредить автора?',
      submitLabel: 'Отправить предупреждение',
      success: 'Предупреждение отправлено автору.',
      consequences: [
        'Автор получит письмо с указанной причиной.',
        'Состояние публикации не изменится.',
      ],
    },
    unpublish: {
      title: 'Снять курс с публикации?',
      submitLabel: 'Снять с публикации',
      success: 'Курс снят с публикации.',
      consequences: [
        'Курс исчезнет из публичного доступа.',
        'Материалы автора и прогресс сохранятся.',
      ],
    },
    block: {
      title: 'Заблокировать курс?',
      submitLabel: 'Заблокировать',
      success: 'Курс заблокирован.',
      consequences: [
        'Курс сразу исчезнет из публичного доступа и поиска.',
        'Материалы автора не удаляются.',
      ],
    },
    restore: {
      title: 'Снять блокировку?',
      submitLabel: 'Снять блокировку',
      success: 'Блокировка снята.',
      consequences: [
        'Курс снова сможет быть доступен, если он опубликован.',
        'История решения сохранится.',
      ],
    },
  } satisfies Record<
    CourseAction,
    { title: string; submitLabel: string; success: string; consequences: string[] }
  >;
  return configs[action];
}

function mutationHeaders(confirmation: string, idempotencyKey: string) {
  return { 'X-Admin-Confirmation': confirmation, 'Idempotency-Key': idempotencyKey };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
