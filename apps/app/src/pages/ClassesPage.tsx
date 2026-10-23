import type { components } from '@remora/api-client';
import { Button, Card, Input } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, downloadFile } from '../lib/api';

type Classroom = components['schemas']['ClassroomOut'];
type Assignment = components['schemas']['AssignmentOut'];
type AssignmentStatus = components['schemas']['AssignmentProgressStatus'];

const roleLabels = { teacher: 'Преподаватель', assistant: 'Ассистент', student: 'Ученик' };
const statusLabels: Record<AssignmentStatus, string> = {
  not_started: 'Не начато',
  in_progress: 'В работе',
  done: 'Выполнено',
  late: 'Просрочено',
};
const statusClasses: Record<AssignmentStatus, string> = {
  not_started: 'text-fg-muted bg-surface-muted',
  in_progress: 'text-primary bg-primary-subtle',
  done: 'text-success bg-success-subtle',
  late: 'text-danger bg-danger-subtle',
};

export function ClassesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState<'teaching' | 'learning'>('teaching');
  const [title, setTitle] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const classes = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/classes');
      if (error) throw new Error(errorText(error));
      return data;
    },
  });
  const teaching = (classes.data ?? []).filter((item) => item.my_role !== 'student');
  const learning = (classes.data ?? []).filter((item) => item.my_role === 'student');
  const visible = view === 'teaching' ? teaching : learning;

  useEffect(() => {
    if (classes.data && teaching.length === 0 && learning.length > 0) setView('learning');
  }, [classes.data, learning.length, teaching.length]);

  async function createClass(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setMessage(null);
    const { data, error } = await api.POST('/api/v1/classes', {
      body: { title: title.trim(), description: '', requires_approval: false },
    });
    setBusy(false);
    if (error) return setMessage(errorText(error));
    await queryClient.invalidateQueries({ queryKey: ['classes'] });
    navigate(`/classes/${data.id}`);
  }

  async function joinClass(event: FormEvent) {
    event.preventDefault();
    if (!joinCode.trim()) return;
    setBusy(true);
    setMessage(null);
    const { data, error } = await api.POST('/api/v1/classes/join', {
      body: { join_code: joinCode.trim().toUpperCase() },
    });
    setBusy(false);
    if (error) return setMessage(errorText(error));
    await queryClient.invalidateQueries({ queryKey: ['classes'] });
    if (data.status === 'active') navigate(`/classes/${data.class_id}`);
    else setMessage('Заявка отправлена. Класс появится после одобрения преподавателем.');
  }

  return (
    <div>
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Классы</h1>
        <p className="text-fg-muted mt-3">
          Выдавайте задания своим группам или продолжайте обучение в классах преподавателей.
        </p>
      </header>

      <div
        className="border-border mt-8 flex gap-1 border-b"
        role="tablist"
        aria-label="Роль в классах"
      >
        <RoleTab active={view === 'teaching'} onClick={() => setView('teaching')}>
          Преподаю <span className="text-fg-subtle">{teaching.length}</span>
        </RoleTab>
        <RoleTab active={view === 'learning'} onClick={() => setView('learning')}>
          Учусь <span className="text-fg-subtle">{learning.length}</span>
        </RoleTab>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-live="polite">
          {classes.isPending && <ClassListSkeleton />}
          {classes.isError && (
            <ErrorState title="Не удалось загрузить классы" retry={() => void classes.refetch()} />
          )}
          {classes.data && visible.length === 0 && (
            <Card className="border-dashed p-8 text-center shadow-none">
              <h2 className="text-xl font-semibold">
                {view === 'teaching' ? 'Создайте первый класс' : 'Вступите по коду приглашения'}
              </h2>
              <p className="text-fg-muted mx-auto mt-2 max-w-md">
                {view === 'teaching'
                  ? 'Добавьте учебный набор, назначьте цель и следите за прогрессом в одной таблице.'
                  : 'После вступления здесь появятся задания и ближайшие дедлайны.'}
              </p>
            </Card>
          )}
          <div className="divide-border divide-y">
            {visible.map((classroom) => (
              <Link
                key={classroom.id}
                to={`/classes/${classroom.id}`}
                className="hover:bg-surface-muted focus-visible:ring-primary -mx-3 flex min-h-20 items-center justify-between gap-4 rounded-xl px-3 py-4 transition-colors focus-visible:outline-none focus-visible:ring-2"
              >
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{classroom.title}</h2>
                  <p className="text-fg-muted mt-1 line-clamp-1 text-sm">
                    {classroom.description || roleLabels[classroom.my_role]}
                  </p>
                </div>
                <span className="text-primary shrink-0 text-sm font-medium">Открыть</span>
              </Link>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          {view === 'teaching' ? (
            <Card className="p-5 shadow-none">
              <h2 className="text-lg font-semibold">Новый класс</h2>
              <form className="mt-4 space-y-4" onSubmit={(event) => void createClass(event)}>
                <Input
                  label="Название"
                  placeholder="Например, 9Б — география"
                  value={title}
                  maxLength={160}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <Button
                  type="submit"
                  fullWidth
                  className="min-h-11"
                  loading={busy}
                  disabled={!title.trim()}
                >
                  Создать класс
                </Button>
              </form>
            </Card>
          ) : (
            <Card className="p-5 shadow-none">
              <h2 className="text-lg font-semibold">Вступить в класс</h2>
              <form className="mt-4 space-y-4" onSubmit={(event) => void joinClass(event)}>
                <Input
                  label="Код приглашения"
                  placeholder="8 символов"
                  value={joinCode}
                  maxLength={12}
                  className="uppercase"
                  onChange={(event) => setJoinCode(event.target.value)}
                />
                <Button
                  type="submit"
                  fullWidth
                  className="min-h-11"
                  loading={busy}
                  disabled={joinCode.trim().length < 8}
                >
                  Вступить
                </Button>
              </form>
            </Card>
          )}
          {message && (
            <p className="text-fg-muted text-sm" role="status">
              {message}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

export function JoinClassPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const code = searchParams.get('code')?.trim().toUpperCase() ?? '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (code.length < 8) return setError('В ссылке нет действующего кода приглашения.');
    setBusy(true);
    const result = await api.POST('/api/v1/classes/join', { body: { join_code: code } });
    setBusy(false);
    if (result.error) return setError(errorText(result.error));
    await queryClient.invalidateQueries({ queryKey: ['classes'] });
    if (result.data.status === 'active')
      navigate(`/classes/${result.data.class_id}`, { replace: true });
    else setError('Заявка отправлена. Преподаватель должен одобрить вступление.');
  }

  return (
    <div className="mx-auto max-w-xl py-8">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">Приглашение в класс</h1>
        <p className="text-fg-muted mt-3">
          После вступления вы увидите материалы, задания и сроки их выполнения.
        </p>
        <div className="bg-surface-muted mt-6 rounded-xl p-4">
          <p className="text-fg-muted text-sm">Код приглашения</p>
          <p className="mt-1 font-mono text-xl font-semibold tracking-wider">
            {code || 'Не указан'}
          </p>
        </div>
        <Button className="mt-6" size="lg" loading={busy} onClick={() => void join()}>
          Вступить в класс
        </Button>
        {error && (
          <p className="text-danger mt-4 text-sm" role="alert">
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}

export function ClassPage() {
  const { classId = '' } = useParams();
  const detail = useClassDetail(classId);
  if (detail.isPending) return <ClassPageSkeleton />;
  if (detail.isError || !detail.data) {
    return <ErrorState title="Не удалось открыть класс" retry={() => void detail.refetch()} />;
  }
  return detail.data.my_role === 'student' ? (
    <StudentClass classroom={detail.data} />
  ) : (
    <TeacherClass classroom={detail.data} />
  );
}

export function StudentReportPage() {
  const { classId = '', studentId = '' } = useParams();
  const report = useQuery({
    queryKey: ['classes', classId, 'student-report', studentId],
    queryFn: async () => {
      const { data, error } = await api.GET(
        '/api/v1/classes/{class_id}/reports/students/{student_id}',
        { params: { path: { class_id: classId, student_id: studentId } } },
      );
      if (error) throw new Error(errorText(error));
      return data;
    },
    enabled: Boolean(classId && studentId),
  });
  if (report.isPending) return <ClassPageSkeleton />;
  if (report.isError || !report.data) {
    return (
      <ErrorState title="Не удалось загрузить отчёт ученика" retry={() => void report.refetch()} />
    );
  }
  const completed = report.data.assignments.filter(
    (assignment) => assignment.progress?.status === 'done',
  ).length;
  return (
    <div>
      <header>
        <Link
          className="text-primary inline-flex min-h-11 items-center text-sm font-medium"
          to={`/classes/${classId}`}
        >
          ← К отчёту класса
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {report.data.display_name || report.data.username}
        </h1>
        <p className="text-fg-muted mt-2">
          @{report.data.username} · выполнено {completed} из {report.data.assignments.length}
        </p>
      </header>
      <section className="mt-10" aria-labelledby="student-progress-title">
        <h2 id="student-progress-title" className="text-2xl font-semibold">
          Задания
        </h2>
        <div className="divide-border mt-5 divide-y">
          {report.data.assignments.map((assignment) => {
            const progress = assignment.progress;
            if (!progress) return null;
            const percent = Math.min(100, (progress.progress_value / assignment.goal_value) * 100);
            return (
              <article
                key={assignment.id}
                className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_160px] md:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{assignment.title}</h3>
                    <StatusBadge status={progress.status} />
                  </div>
                  <p className="text-fg-muted mt-2 text-sm">
                    {assignment.set_title} · {goalLabel(assignment)}
                  </p>
                  <div
                    className="bg-surface-muted mt-3 h-2 max-w-xl overflow-hidden rounded-full"
                    role="progressbar"
                    aria-label={`Прогресс: ${assignment.title}`}
                    aria-valuenow={progress.progress_value}
                    aria-valuemin={0}
                    aria-valuemax={assignment.goal_value}
                  >
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
                <div className="md:text-right">
                  <p className="font-semibold tabular-nums">
                    {progress.progress_value} из {assignment.goal_value}
                  </p>
                  <p className="text-fg-subtle mt-1 text-xs">
                    {progress.last_activity_at
                      ? `Активность ${formatDate(progress.last_activity_at)}`
                      : 'Ещё не приступал'}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TeacherClass({ classroom }: { classroom: components['schemas']['ClassroomDetailOut'] }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentSet, setAssignmentSet] = useState('');
  const [goalType, setGoalType] = useState<'mastery_percent' | 'cards_count' | 'test_score'>(
    'mastery_percent',
  );
  const [goalValue, setGoalValue] = useState(80);
  const [dueAt, setDueAt] = useState('');
  const [shareSet, setShareSet] = useState('');
  const [busy, setBusy] = useState(false);
  const classId = classroom.id;
  const report = useQuery({
    queryKey: ['classes', classId, 'report'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/classes/{class_id}/reports', {
        params: { path: { class_id: classId } },
      });
      if (error) throw new Error(errorText(error));
      return data;
    },
  });
  const cardReport = useQuery({
    queryKey: ['classes', classId, 'card-report'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/classes/{class_id}/reports/cards', {
        params: { path: { class_id: classId } },
      });
      if (error) throw new Error(errorText(error));
      return data;
    },
  });
  const sets = useClassSets(classId);
  const ownedSets = useQuery({
    queryKey: ['sets'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/sets');
      if (error) throw new Error(errorText(error));
      return data;
    },
  });
  const availableSets = (ownedSets.data ?? []).filter(
    (item) => !(sets.data ?? []).some((shared) => shared.set_id === item.id),
  );
  const pending = classroom.members.filter((member) => member.status === 'pending');

  async function copyInvite() {
    const { data, error } = await api.GET('/api/v1/classes/{class_id}/invite', {
      params: { path: { class_id: classId } },
    });
    if (error) return setMessage(errorText(error));
    const text = `Присоединяйтесь к классу «${classroom.title}» в Remora: ${data.join_url}\nКод: ${data.join_code}`;
    await navigator.clipboard.writeText(text);
    setMessage('Приглашение скопировано.');
  }

  async function addSharedSet() {
    if (!shareSet) return;
    setBusy(true);
    const { error } = await api.POST('/api/v1/classes/{class_id}/sets', {
      params: { path: { class_id: classId } },
      body: { set_id: shareSet },
    });
    setBusy(false);
    if (error) return setMessage(errorText(error));
    setShareSet('');
    await sets.refetch();
    setMessage('Набор добавлен в класс.');
  }

  async function createAssignment(event: FormEvent) {
    event.preventDefault();
    if (!assignmentSet || !assignmentTitle.trim()) return;
    setBusy(true);
    const { error } = await api.POST('/api/v1/classes/{class_id}/assignments', {
      params: { path: { class_id: classId } },
      body: {
        set_id: assignmentSet,
        title: assignmentTitle.trim(),
        goal_type: goalType,
        goal_value: goalValue,
        mode_required:
          goalType === 'test_score' ? 'test' : goalType === 'cards_count' ? 'learn' : null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        open_at: null,
      },
    });
    setBusy(false);
    if (error) return setMessage(errorText(error));
    setAssignmentTitle('');
    await queryClient.invalidateQueries({ queryKey: ['classes', classId, 'report'] });
    setMessage('Задание опубликовано для класса.');
  }

  async function approve(memberId: string) {
    const { error } = await api.POST('/api/v1/classes/{class_id}/members/{member_id}/approve', {
      params: { path: { class_id: classId, member_id: memberId } },
    });
    if (error) return setMessage(errorText(error));
    await queryClient.invalidateQueries({ queryKey: ['classes', classId] });
    await queryClient.invalidateQueries({ queryKey: ['classes', classId, 'report'] });
  }

  return (
    <div>
      <ClassHeader
        classroom={classroom}
        actions={
          <>
            <Button className="min-h-11" variant="secondary" onClick={() => void copyInvite()}>
              Скопировать приглашение
            </Button>
            <Button
              className="min-h-11"
              variant="secondary"
              onClick={() =>
                void downloadFile(
                  `/api/v1/classes/${classId}/reports.xlsx`,
                  `Отчёт — ${classroom.title}.xlsx`,
                )
              }
            >
              Скачать XLSX
            </Button>
          </>
        }
      />
      {message && (
        <p className="text-primary mt-4 text-sm" role="status">
          {message}
        </p>
      )}

      {pending.length > 0 && (
        <section className="bg-warning-subtle mt-6 rounded-2xl p-5" aria-labelledby="pending-title">
          <h2 id="pending-title" className="font-semibold">
            Заявки на вступление
          </h2>
          <div className="mt-3 space-y-3">
            {pending.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>{member.display_name || member.username}</span>
                <Button className="min-h-11" size="sm" onClick={() => void approve(member.id)}>
                  Принять
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10" aria-labelledby="progress-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="progress-title" className="text-2xl font-semibold">
              Прогресс класса
            </h2>
            <p className="text-fg-muted mt-1 text-sm">
              Значения пересчитываются по учебным ответам и завершённым тестам.
            </p>
          </div>
          {report.data && (
            <p className="text-fg-subtle text-sm">{report.data.students.length} учеников</p>
          )}
        </div>
        {report.isPending && <ReportSkeleton />}
        {report.isError && (
          <ErrorState
            title="Не удалось загрузить отчёт"
            retry={() => void report.refetch()}
            compact
          />
        )}
        {report.data && <ProgressMatrix report={report.data} />}
      </section>

      <div className="mt-10 grid gap-8 xl:grid-cols-2">
        <section aria-labelledby="assignment-title">
          <h2 id="assignment-title" className="text-2xl font-semibold">
            Новое задание
          </h2>
          <form className="mt-5 space-y-4" onSubmit={(event) => void createAssignment(event)}>
            <Input
              label="Название задания"
              value={assignmentTitle}
              maxLength={160}
              onChange={(event) => setAssignmentTitle(event.target.value)}
            />
            <SelectField
              label="Набор"
              value={assignmentSet}
              onChange={setAssignmentSet}
              options={(sets.data ?? []).map((item) => [
                item.set_id,
                `${item.title} · ${item.cards_count} карточек`,
              ])}
              placeholder="Выберите набор класса"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Цель"
                value={goalType}
                onChange={(value) => setGoalType(value as typeof goalType)}
                options={[
                  ['mastery_percent', 'Освоение, %'],
                  ['cards_count', 'Пройдено карточек'],
                  ['test_score', 'Результат теста, %'],
                ]}
              />
              <Input
                label="Значение"
                type="number"
                min={1}
                max={goalType === 'cards_count' ? 100000 : 100}
                value={goalValue}
                onChange={(event) => setGoalValue(Number(event.target.value))}
              />
            </div>
            <Input
              label="Дедлайн"
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
            <Button
              type="submit"
              className="min-h-11"
              loading={busy}
              disabled={!assignmentSet || !assignmentTitle.trim()}
            >
              Опубликовать задание
            </Button>
          </form>
        </section>

        <section aria-labelledby="materials-title">
          <h2 id="materials-title" className="text-2xl font-semibold">
            Материалы класса
          </h2>
          <div className="mt-5 space-y-4">
            <SelectField
              label="Добавить мой набор"
              value={shareSet}
              onChange={setShareSet}
              options={availableSets.map((item) => [item.id, item.title])}
              placeholder="Выберите набор"
            />
            <Button
              className="min-h-11"
              variant="secondary"
              loading={busy}
              disabled={!shareSet}
              onClick={() => void addSharedSet()}
            >
              Добавить в класс
            </Button>
            <div className="divide-border divide-y pt-2">
              {(sets.data ?? []).map((item) => (
                <div
                  key={item.set_id}
                  className="flex min-h-14 items-center justify-between gap-3 py-3"
                >
                  <Link
                    className="hover:text-primary inline-flex min-h-11 items-center font-medium"
                    to={`/sets/${item.set_id}`}
                  >
                    {item.title}
                  </Link>
                  <span className="text-fg-subtle text-sm">{item.cards_count} карточек</span>
                </div>
              ))}
              {sets.data?.length === 0 && (
                <p className="text-fg-muted py-4 text-sm">
                  Добавьте набор, чтобы создать первое задание.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="mt-10" aria-labelledby="cards-report-title">
        <h2 id="cards-report-title" className="text-2xl font-semibold">
          Карточки, где чаще ошибаются
        </h2>
        <p className="text-fg-muted mt-1 text-sm">
          Агрегат не раскрывает ответы конкретного ученика.
        </p>
        {cardReport.data && <CardErrors cards={cardReport.data.cards} />}
      </section>
    </div>
  );
}

function StudentClass({ classroom }: { classroom: components['schemas']['ClassroomDetailOut'] }) {
  const assignments = useAssignments(classroom.id);
  const sets = useClassSets(classroom.id);
  return (
    <div>
      <ClassHeader classroom={classroom} />
      <section className="mt-10" aria-labelledby="my-assignments-title">
        <h2 id="my-assignments-title" className="text-2xl font-semibold">
          Мои задания
        </h2>
        <p className="text-fg-muted mt-1">Сначала показаны ближайшие дедлайны.</p>
        {assignments.isPending && <ReportSkeleton />}
        {assignments.isError && (
          <ErrorState
            title="Не удалось загрузить задания"
            retry={() => void assignments.refetch()}
            compact
          />
        )}
        {assignments.data?.length === 0 && (
          <Card className="mt-5 border-dashed p-8 text-center shadow-none">
            <h3 className="font-semibold">Заданий пока нет</h3>
            <p className="text-fg-muted mt-2 text-sm">
              Преподаватель ещё не опубликовал задания для класса.
            </p>
          </Card>
        )}
        <div className="divide-border mt-5 divide-y">
          {(assignments.data ?? []).map((assignment) => (
            <StudentAssignment key={assignment.id} assignment={assignment} />
          ))}
        </div>
      </section>
      <section className="mt-10" aria-labelledby="class-materials-title">
        <h2 id="class-materials-title" className="text-2xl font-semibold">
          Материалы класса
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(sets.data ?? []).map((item) => (
            <Link
              key={item.set_id}
              to={`/sets/${item.set_id}`}
              className="border-border hover:border-primary focus-visible:ring-primary min-h-20 rounded-xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2"
            >
              <span className="font-semibold">{item.title}</span>
              <span className="text-fg-muted mt-1 block text-sm">{item.cards_count} карточек</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProgressMatrix({ report }: { report: components['schemas']['ClassReportOut'] }) {
  if (report.assignments.length === 0)
    return (
      <Card className="mt-5 border-dashed p-8 text-center shadow-none">
        <p className="text-fg-muted">Создайте задание — здесь появится таблица прогресса.</p>
      </Card>
    );
  return (
    <div className="border-border mt-5 overflow-x-auto rounded-2xl border">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-surface-muted">
          <tr>
            <th className="text-fg sticky left-0 z-10 min-w-48 bg-inherit px-4 py-3 font-semibold">
              Ученик
            </th>
            {report.assignments.map((assignment) => (
              <th key={assignment.id} className="min-w-44 px-4 py-3 font-semibold">
                <span className="block">{assignment.title}</span>
                <span className="text-fg-subtle mt-1 block text-xs font-normal">
                  {goalLabel(assignment)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {report.students.map((student) => (
            <tr key={student.user_id}>
              <th className="bg-surface sticky left-0 px-4 py-4 font-medium">
                <Link
                  className="hover:text-primary inline-flex min-h-11 items-center"
                  to={`reports/students/${student.user_id}`}
                >
                  {student.display_name || student.username}
                </Link>
                <span className="text-fg-subtle mt-0.5 block text-xs font-normal">
                  @{student.username}
                </span>
              </th>
              {report.assignments.map((assignment) => {
                const progress = student.assignments[assignment.id];
                if (!progress) {
                  return (
                    <td key={assignment.id} className="text-fg-subtle px-4 py-4">
                      Нет данных
                    </td>
                  );
                }
                return (
                  <td key={assignment.id} className="px-4 py-4">
                    <StatusBadge status={progress.status} />
                    <span className="text-fg-muted mt-2 block tabular-nums">
                      {progress.progress_value} из {assignment.goal_value}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
          {report.students.length === 0 && (
            <tr>
              <td
                colSpan={report.assignments.length + 1}
                className="text-fg-muted px-4 py-8 text-center"
              >
                В классе пока нет учеников.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StudentAssignment({ assignment }: { assignment: Assignment }) {
  const progress = assignment.progress;
  const unavailable = assignment.open_at ? Date.parse(assignment.open_at) > Date.now() : false;
  return (
    <article className="flex flex-wrap items-center justify-between gap-4 py-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{assignment.title}</h3>
          {progress && <StatusBadge status={progress.status} />}
        </div>
        <p className="text-fg-muted mt-2 text-sm">
          {goalLabel(assignment)}
          {assignment.due_at ? ` · до ${formatDate(assignment.due_at)}` : ' · без дедлайна'}
          {progress ? ` · ${progress.progress_value} из ${assignment.goal_value}` : ''}
        </p>
        {progress && (
          <div
            className="bg-surface-muted mt-3 h-2 max-w-lg overflow-hidden rounded-full"
            role="progressbar"
            aria-label={`Прогресс задания ${assignment.title}`}
            aria-valuemin={0}
            aria-valuemax={assignment.goal_value}
            aria-valuenow={progress.progress_value}
          >
            <div
              className="bg-primary h-full rounded-full"
              style={{
                width: `${Math.min(100, (progress.progress_value / assignment.goal_value) * 100)}%`,
              }}
            />
          </div>
        )}
      </div>
      {unavailable ? (
        <span className="text-fg-subtle text-sm">Откроется {formatDate(assignment.open_at!)}</span>
      ) : (
        <Link
          className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex min-h-11 items-center rounded-md px-4 font-medium"
          to={studyPath(assignment)}
        >
          Продолжить
        </Link>
      )}
    </article>
  );
}

function CardErrors({ cards }: { cards: components['schemas']['CardErrorOut'][] }) {
  if (cards.length === 0)
    return (
      <p className="text-fg-muted mt-5">Ошибок пока нет — данные появятся после первых ответов.</p>
    );
  return (
    <div className="divide-border mt-5 divide-y">
      {cards.slice(0, 10).map((card) => (
        <div
          key={card.card_id}
          className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center"
        >
          <div>
            <p className="font-medium">{card.term}</p>
            <p className="text-fg-muted mt-1 line-clamp-1 text-sm">
              {card.definition} · {card.set_title}
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-danger tabular-nums">{card.errors_count} ошибок</span>
              <span className="text-fg-subtle tabular-nums">{Math.round(card.error_percent)}%</span>
            </div>
            <div
              className="bg-surface-muted mt-2 h-2 overflow-hidden rounded-full"
              role="img"
              aria-label={`${Math.round(card.error_percent)} процентов ответов с ошибкой`}
            >
              <div
                className="bg-danger h-full rounded-full"
                style={{ width: `${Math.min(100, card.error_percent)}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ClassHeader({ classroom, actions }: { classroom: Classroom; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div>
        <Link
          className="text-primary inline-flex min-h-11 items-center text-sm font-medium"
          to="/classes"
        >
          ← Все классы
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {classroom.title}
        </h1>
        <p className="text-fg-muted mt-3 max-w-2xl">
          {classroom.description || roleLabels[classroom.my_role]}
        </p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

function RoleTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-11 border-b-2 px-4 text-sm font-medium ${active ? 'border-primary text-primary' : 'text-fg-muted hover:text-fg border-transparent'}`}
    >
      {children}
    </button>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <select
        className="border-border bg-surface text-fg min-h-11 w-full rounded-md border px-3 text-base"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusBadge({ status }: { status: AssignmentStatus }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${statusClasses[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

function useClassDetail(classId: string) {
  return useQuery({
    queryKey: ['classes', classId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/classes/{class_id}', {
        params: { path: { class_id: classId } },
      });
      if (error) throw new Error(errorText(error));
      return data;
    },
    enabled: Boolean(classId),
  });
}

function useAssignments(classId: string) {
  return useQuery({
    queryKey: ['classes', classId, 'assignments'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/classes/{class_id}/assignments', {
        params: { path: { class_id: classId } },
      });
      if (error) throw new Error(errorText(error));
      return data;
    },
  });
}

function useClassSets(classId: string) {
  return useQuery({
    queryKey: ['classes', classId, 'sets'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/classes/{class_id}/sets', {
        params: { path: { class_id: classId } },
      });
      if (error) throw new Error(errorText(error));
      return data;
    },
  });
}

function goalLabel(assignment: Assignment) {
  if (assignment.goal_type === 'mastery_percent') return `Освоить на ${assignment.goal_value}%`;
  if (assignment.goal_type === 'test_score') return `Набрать ${assignment.goal_value}% в тесте`;
  return `Пройти ${assignment.goal_value} карточек`;
}

function studyPath(assignment: Assignment) {
  const mode =
    assignment.mode_required ?? (assignment.goal_type === 'test_score' ? 'test' : 'learn');
  return `/sets/${assignment.set_id}/${mode}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function errorText(error: unknown) {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message)
    : 'Не удалось выполнить запрос. Попробуйте ещё раз.';
}

function ErrorState({
  title,
  retry,
  compact = false,
}: {
  title: string;
  retry: () => void;
  compact?: boolean;
}) {
  return (
    <Card className={`${compact ? 'mt-5' : ''} p-6 text-center`} role="alert">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-fg-muted mt-2 text-sm">Проверьте соединение и повторите запрос.</p>
      <Button variant="secondary" className="mt-4 min-h-11" onClick={retry}>
        Повторить
      </Button>
    </Card>
  );
}

function ClassListSkeleton() {
  return (
    <div className="space-y-3" aria-label="Загрузка классов" aria-busy="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="bg-surface-muted h-20 animate-pulse rounded-xl motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
function ClassPageSkeleton() {
  return (
    <div aria-label="Загрузка класса" aria-busy="true">
      <div className="bg-surface-muted h-11 w-72 animate-pulse rounded-xl motion-reduce:animate-none" />
      <div className="bg-surface-muted mt-10 h-64 animate-pulse rounded-2xl motion-reduce:animate-none" />
    </div>
  );
}
function ReportSkeleton() {
  return (
    <div
      className="bg-surface-muted mt-5 h-48 animate-pulse rounded-2xl motion-reduce:animate-none"
      aria-label="Загрузка отчёта"
      aria-busy="true"
    />
  );
}
