import type { components } from '@remora/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, downloadFile } from '../lib/api';
import { ClassIcon } from '../features/classes/ClassNavigator';
import '../features/classes/class-screens.css';

type Classroom = components['schemas']['ClassroomOut'];
type ClassroomDetail = components['schemas']['ClassroomDetailOut'];
type Assignment = components['schemas']['AssignmentOut'];
type AssignmentStatus = components['schemas']['AssignmentProgressStatus'];
const roles = { teacher: 'преподаватель', assistant: 'ассистент', student: 'ученик' };
const statusLabels: Record<AssignmentStatus, string> = {
  not_started: 'Не начато',
  in_progress: 'В работе',
  done: 'Выполнено',
  late: 'Просрочено',
};
export { ClassNavigator as ClassesPage } from '../features/classes/ClassNavigator';

function useClassAction() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  async function run(work: () => Promise<string | void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const message = await work();
      if (message) setFeedback({ text: message, error: false });
    } catch (cause) {
      setFeedback({ text: errorText(cause), error: true });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { busy, feedback, run };
}
function Feedback({ action }: { action: ReturnType<typeof useClassAction> }) {
  return action.feedback ? (
    <p
      className={`cs-feedback ${action.feedback.error ? 'cs-error' : ''}`}
      role={action.feedback.error ? 'alert' : 'status'}
    >
      {action.feedback.text}
    </p>
  ) : null;
}
function BackLink({
  to = '/classes',
  children = 'Все классы',
}: {
  to?: string;
  children?: ReactNode;
}) {
  return (
    <Link className="cs-text-button cs-back" to={to}>
      <ClassIcon name="back" />
      {children}
    </Link>
  );
}

export function JoinClassPage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code')?.trim().toUpperCase() ?? '';
  return <ClassInvitation key={code} code={code} />;
}
function ClassInvitation({ code }: { code: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const action = useClassAction();
  const [pending, setPending] = useState(false);
  const validCode = code.length >= 8 && code.length <= 12;
  function join() {
    if (pending || !validCode) return;
    void action.run(async () => {
      const result = await api.POST('/api/v1/classes/join', { body: { join_code: code } });
      if (result.error) throw new Error(errorText(result.error));
      void queryClient.invalidateQueries({ queryKey: ['classes'] });
      if (result.data.status === 'active')
        navigate(`/classes/${result.data.class_id}`, { replace: true });
      else setPending(true);
    });
  }
  return (
    <div className="class-screen">
      <BackLink />
      <div className="cs-invite-layout">
        <section className="cs-invitation" aria-labelledby="invitation-title">
          <span className="cs-invite-icon" aria-hidden="true">
            <ClassSymbol />
          </span>
          <h1 id="invitation-title">
            Присоединиться
            <br />к классу
          </h1>
          <p className="cs-invite-intro">
            Приглашение от преподавателя откроет доступ к заданиям и материалам класса.
          </p>
          <div className="cs-invite-code">
            <span>Код приглашения</span>
            <strong>{code || 'Не указан'}</strong>
          </div>
          <button
            className="cs-button"
            disabled={action.busy || pending || !validCode}
            onClick={join}
          >
            {action.busy ? (
              'Отправляем…'
            ) : pending ? (
              'Заявка отправлена'
            ) : (
              <>
                Вступить в класс <ClassIcon name="arrow" />
              </>
            )}
          </button>
          {!validCode && (
            <p className="cs-feedback cs-error" role="alert">
              В ссылке нет действующего кода приглашения. Попросите преподавателя прислать новую
              ссылку.
            </p>
          )}
          <Feedback action={action} />
          {pending ? (
            <p className="cs-notice" role="status">
              Заявка отправлена. Класс появится после одобрения преподавателем.
            </p>
          ) : (
            <p className="cs-help">
              Если в классе включено одобрение, преподаватель сначала примет вашу заявку.
            </p>
          )}
        </section>
        <aside className="cs-invite-note">
          <h2>Учиться вместе</h2>
          <p>Выполняйте задания, следите за сроками и возвращайтесь к материалам для повторения.</p>
          <p>
            Класс появится в разделе
            <br />
            <strong>«Классы» → «Учусь».</strong>
          </p>
        </aside>
      </div>
    </div>
  );
}

export function ClassPage() {
  const { classId = '' } = useParams();
  const detail = useClassDetail(classId);
  if (detail.isPending) return <ClassPageSkeleton />;
  if (detail.isError || !detail.data)
    return (
      <div className="class-screen">
        <BackLink />
        <ErrorState title="Не удалось открыть класс" retry={() => void detail.refetch()} />
      </div>
    );
  return detail.data.my_role === 'student' ? (
    <StudentClass key={classId} classroom={detail.data} />
  ) : (
    <TeacherClass key={classId} classroom={detail.data} />
  );
}

export function StudentReportPage() {
  const { classId = '', studentId = '' } = useParams();
  const detail = useClassDetail(classId);
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
  const back = <BackLink to={`/classes/${classId}`}>К отчёту класса</BackLink>;
  if (report.isError || !report.data)
    return (
      <div className="class-screen">
        {back}
        <ErrorState
          title="Не удалось загрузить отчёт ученика"
          retry={() => void report.refetch()}
        />
      </div>
    );
  const completed = report.data.assignments.filter((a) => a.progress?.status === 'done').length;
  const count = report.data.assignments.length;
  return (
    <div className="class-screen cs-student-report">
      {back}
      <header className="cs-header">
        <div>
          <h1>{report.data.display_name || report.data.username}</h1>
          <p>
            @{report.data.username}
            {detail.data?.title ? ` · ${detail.data.title}` : ''}
          </p>
        </div>
      </header>
      <section aria-labelledby="student-progress-title">
        <div className="cs-report-summary">
          <div>
            <h2 id="student-progress-title">Задания</h2>
            <p>
              Выполнено {completed} из {count}
            </p>
          </div>
          {count > 0 && (
            <div className="cs-completion" aria-hidden="true">
              <i style={{ width: `${(completed / count) * 100}%` }} />
            </div>
          )}
        </div>
        {count === 0 && (
          <EmptyState title="Заданий пока нет">
            После публикации заданий здесь появится прогресс ученика.
          </EmptyState>
        )}
        {report.data.assignments.map((assignment) => (
          <article className="cs-report-row" key={assignment.id}>
            <div className="cs-row-title">
              <h3>{assignment.title}</h3>
              {assignment.progress && <StatusBadge status={assignment.progress.status} />}
            </div>
            <p>
              {assignment.set_title} · {goalLabel(assignment)}
            </p>
            {assignment.progress ? (
              <>
                <div className="cs-report-progress">
                  <ProgressBar assignment={assignment} label={`Прогресс: ${assignment.title}`} />
                  <strong>
                    {assignment.progress.progress_value} из {assignment.goal_value}
                  </strong>
                </div>
                <small>
                  {assignment.progress.last_activity_at
                    ? `Последняя активность: ${formatDate(assignment.progress.last_activity_at)}`
                    : 'Ещё не приступал'}
                </small>
              </>
            ) : (
              <p>Нет данных о прогрессе</p>
            )}
          </article>
        ))}
      </section>
      <div className="cs-report-foot">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7h.01" />
        </svg>
        <p>
          Прогресс по заданиям и время последней активности.
          <br />
          Ответы на отдельные карточки в этот отчёт не входят.
        </p>
      </div>
    </div>
  );
}

function TeacherClass({ classroom }: { classroom: ClassroomDetail }) {
  const queryClient = useQueryClient();
  const classId = classroom.id;
  const inviteAction = useClassAction();
  const exportAction = useClassAction();
  const assignmentAction = useClassAction();
  const materialAction = useClassAction();
  const approvalAction = useClassAction();
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentSet, setAssignmentSet] = useState('');
  const [goalType, setGoalType] = useState<'mastery_percent' | 'cards_count' | 'test_score'>(
    'mastery_percent',
  );
  const [goalValue, setGoalValue] = useState('80');
  const [dueAt, setDueAt] = useState('');
  const [shareSet, setShareSet] = useState('');
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
    enabled: !classroom.is_read_only,
  });
  const availableSets = (ownedSets.data ?? []).filter(
    (item) => !(sets.data ?? []).some((shared) => shared.set_id === item.id),
  );
  const pending =
    classroom.my_role === 'teacher' ? classroom.members.filter((m) => m.status === 'pending') : [];

  function copyInvite() {
    void inviteAction.run(async () => {
      const { data, error } = await api.GET('/api/v1/classes/{class_id}/invite', {
        params: { path: { class_id: classId } },
      });
      if (error) throw new Error(errorText(error));
      if (!navigator.clipboard)
        throw new Error(
          'Браузер не разрешает копирование. Проверьте разрешение на доступ к буферу обмена.',
        );
      try {
        await navigator.clipboard.writeText(
          `Присоединяйтесь к классу «${classroom.title}» в «Запоминальне»: ${data.join_url}\nКод: ${data.join_code}`,
        );
      } catch {
        throw new Error(
          'Не удалось скопировать приглашение. Разрешите доступ к буферу обмена и повторите.',
        );
      }
      return 'Приглашение скопировано.';
    });
  }
  function addSharedSet(event: FormEvent) {
    event.preventDefault();
    if (!shareSet || classroom.is_read_only) return;
    void materialAction.run(async () => {
      const { error } = await api.POST('/api/v1/classes/{class_id}/sets', {
        params: { path: { class_id: classId } },
        body: { set_id: shareSet },
      });
      if (error) throw new Error(errorText(error));
      setShareSet('');
      await sets.refetch();
      return 'Набор добавлен в класс.';
    });
  }
  function createAssignment(event: FormEvent) {
    event.preventDefault();
    if (!assignmentSet || !assignmentTitle.trim() || !classroom.can_create_assignments) return;
    void assignmentAction.run(async () => {
      const { error } = await api.POST('/api/v1/classes/{class_id}/assignments', {
        params: { path: { class_id: classId } },
        body: {
          set_id: assignmentSet,
          title: assignmentTitle.trim(),
          goal_type: goalType,
          goal_value: Number(goalValue),
          mode_required:
            goalType === 'test_score' ? 'test' : goalType === 'cards_count' ? 'learn' : null,
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
          open_at: null,
        },
      });
      if (error) throw new Error(errorText(error));
      setAssignmentTitle('');
      await queryClient.invalidateQueries({ queryKey: ['classes', classId, 'report'] });
      return 'Задание опубликовано для класса.';
    });
  }
  function approve(memberId: string) {
    void approvalAction.run(async () => {
      const { error } = await api.POST('/api/v1/classes/{class_id}/members/{member_id}/approve', {
        params: { path: { class_id: classId, member_id: memberId } },
      });
      if (error) throw new Error(errorText(error));
      await queryClient.invalidateQueries({ queryKey: ['classes', classId] });
      return 'Заявка принята.';
    });
  }
  return (
    <div className="class-screen">
      <ClassHeader
        classroom={classroom}
        actions={
          classroom.my_role === 'teacher' && !classroom.is_read_only ? (
            <div>
              <button
                className="cs-button cs-secondary"
                disabled={inviteAction.busy}
                onClick={copyInvite}
              >
                {inviteAction.busy ? 'Копируем…' : 'Скопировать приглашение'}
              </button>
              <Feedback action={inviteAction} />
            </div>
          ) : undefined
        }
      />
      {classroom.is_read_only && (
        <section className="cs-notice" aria-labelledby="class-read-only-title">
          <h2 id="class-read-only-title">Класс доступен для просмотра</h2>
          <p>
            Новые задания сейчас недоступны по лимиту тарифа. Материалы, ученики и прежние задания
            остаются на месте.
          </p>
        </section>
      )}
      {pending.length > 0 && (
        <section className="cs-pending" aria-labelledby="pending-title">
          <h2 id="pending-title">Заявки на вступление</h2>
          {pending.map((member) => (
            <div className="cs-pending-row" key={member.id}>
              <p>
                {member.display_name || member.username} <span>· @{member.username}</span>
              </p>
              {!classroom.is_read_only && (
                <button
                  className="cs-button cs-secondary"
                  disabled={approvalAction.busy}
                  onClick={() => approve(member.id)}
                >
                  Принять
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      <Feedback action={approvalAction} />
      <section className="cs-progress-section" aria-labelledby="progress-title">
        <div className="cs-section-head">
          <div className="cs-title-count">
            <h2 id="progress-title">Прогресс класса</h2>
            {report.data?.students && <span>Учеников: {report.data.students.length}</span>}
          </div>
          <button
            className="cs-text-button"
            disabled={exportAction.busy}
            onClick={() =>
              void exportAction.run(() =>
                downloadFile(
                  `/api/v1/classes/${classId}/reports.xlsx`,
                  `Отчёт — ${classroom.title}.xlsx`,
                ),
              )
            }
          >
            {exportAction.busy ? 'Готовим файл…' : 'Скачать XLSX'}
            <ClassIcon name="arrow" />
          </button>
        </div>
        <Feedback action={exportAction} />
        {report.isPending && <ReportSkeleton />}
        {report.isError && (
          <ErrorState title="Не удалось загрузить отчёт" retry={() => void report.refetch()} />
        )}
        {report.data && (
          <ProgressMatrix report={report.data} canCreate={classroom.can_create_assignments} />
        )}
      </section>
      <div
        className={`cs-teacher-lower ${classroom.can_create_assignments ? '' : 'cs-without-form'}`}
      >
        {classroom.can_create_assignments && (
          <section className="cs-assignment-form" aria-labelledby="assignment-title">
            <h2 id="assignment-title">Новое задание</h2>
            <p className="cs-intro">Выберите материал и цель для учеников.</p>
            <form onSubmit={createAssignment}>
              <fieldset disabled={assignmentAction.busy}>
                <label>
                  Название задания
                  <input
                    required
                    maxLength={160}
                    value={assignmentTitle}
                    onChange={(event) => setAssignmentTitle(event.target.value)}
                  />
                </label>
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
                <div className="cs-goal-fields">
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
                  <label>
                    Значение
                    <input
                      required
                      type="number"
                      min={1}
                      max={goalType === 'cards_count' ? 100000 : 100}
                      value={goalValue}
                      onChange={(event) => setGoalValue(event.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Срок <span className="cs-muted">· необязательно</span>
                  <input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(event) => setDueAt(event.target.value)}
                  />
                </label>
                <button
                  className="cs-button"
                  type="submit"
                  disabled={
                    !assignmentSet || !assignmentTitle.trim() || sets.isPending || sets.isError
                  }
                >
                  {assignmentAction.busy ? 'Публикуем…' : 'Опубликовать задание'}
                </button>
              </fieldset>
              <Feedback action={assignmentAction} />
            </form>
          </section>
        )}
        <div className="cs-resources">
          <section aria-labelledby="materials-title">
            <div className="cs-title-count">
              <h2 id="materials-title">Материалы класса</h2>
              {sets.data && <span>Наборов: {sets.data.length}</span>}
            </div>
            <ClassMaterials sets={sets} teacher={true} />
            {!classroom.is_read_only && (
              <form className="cs-add-material" onSubmit={addSharedSet}>
                {ownedSets.isPending ? (
                  <ReportSkeleton label="Загрузка ваших наборов" />
                ) : ownedSets.isError ? (
                  <ErrorState
                    title="Не удалось загрузить ваши наборы"
                    retry={() => void ownedSets.refetch()}
                  />
                ) : (
                  <>
                    <fieldset disabled={materialAction.busy || sets.isPending || sets.isError}>
                      <SelectField
                        label="Добавить мой набор"
                        value={shareSet}
                        onChange={setShareSet}
                        options={availableSets.map((item) => [item.id, item.title])}
                        placeholder="Выберите набор"
                      />
                      <button className="cs-button cs-secondary" disabled={!shareSet} type="submit">
                        {materialAction.busy ? 'Добавляем…' : 'Добавить в класс'}
                      </button>
                    </fieldset>
                    {availableSets.length === 0 && (
                      <p className="cs-help">
                        Нет наборов для добавления. Создайте новый в{' '}
                        <Link to="/sets">разделе «Наборы»</Link>.
                      </p>
                    )}
                  </>
                )}
                <Feedback action={materialAction} />
              </form>
            )}
          </section>
          <section className="cs-card-errors" aria-labelledby="cards-report-title">
            <h2 id="cards-report-title">Где чаще ошибаются</h2>
            <p className="cs-intro">Общая статистика класса, без ответов отдельных учеников.</p>
            {cardReport.isPending && <ReportSkeleton label="Загрузка частых ошибок" />}
            {cardReport.isError && (
              <ErrorState
                title="Не удалось загрузить частые ошибки"
                retry={() => void cardReport.refetch()}
              />
            )}
            {cardReport.data && <CardErrors cards={cardReport.data.cards} />}
          </section>
        </div>
      </div>
    </div>
  );
}

function StudentClass({ classroom }: { classroom: ClassroomDetail }) {
  const assignments = useAssignments(classroom.id);
  const sets = useClassSets(classroom.id);
  return (
    <div className="class-screen">
      <ClassHeader classroom={classroom} />
      <div className="cs-student-layout">
        <section aria-labelledby="my-assignments-title">
          <div className="cs-title-count">
            <h2 id="my-assignments-title">Мои задания</h2>
            {assignments.data && <span>{assignments.data.length}</span>}
          </div>
          <p className="cs-intro">Ближайшие сроки — в начале списка.</p>
          {assignments.isPending && <ReportSkeleton label="Загрузка заданий" />}
          {assignments.isError && (
            <ErrorState
              title="Не удалось загрузить задания"
              retry={() => void assignments.refetch()}
            />
          )}
          {assignments.data?.length === 0 && (
            <EmptyState title="Заданий пока нет">
              Преподаватель ещё не опубликовал задания для класса.
            </EmptyState>
          )}
          {(assignments.data ?? []).map((assignment) => (
            <StudentAssignment
              key={assignment.id}
              assignment={assignment}
              setTitle={sets.data?.find((item) => item.set_id === assignment.set_id)?.title}
            />
          ))}
        </section>
        <aside className="cs-student-materials" aria-labelledby="class-materials-title">
          <h2 id="class-materials-title">Материалы класса</h2>
          <p className="cs-intro">Открывайте наборы и повторяйте материал в своём темпе.</p>
          <ClassMaterials sets={sets} />
        </aside>
      </div>
    </div>
  );
}
function ClassMaterials({
  sets,
  teacher = false,
}: {
  sets: ReturnType<typeof useClassSets>;
  teacher?: boolean;
}) {
  return (
    <>
      {sets.isPending && <ReportSkeleton label="Загрузка материалов" />}
      {sets.isError && (
        <ErrorState title="Не удалось загрузить материалы" retry={() => void sets.refetch()} />
      )}
      <div className="cs-materials">
        {(sets.data ?? []).map((item) => (
          <Link className="cs-material" key={item.set_id} to={`/sets/${item.set_id}`}>
            <span className="cs-book-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="6" y="3" width="12" height="18" rx="1" />
                <path d="M6 15h12M10 7h4" />
              </svg>
            </span>
            <span>
              <strong>{item.title}</strong>
              <small>{item.cards_count} карточек</small>
            </span>
            <ClassIcon name="arrow" />
          </Link>
        ))}
      </div>
      {sets.data?.length === 0 && (
        <p className="cs-empty-copy">
          {teacher
            ? 'Добавьте набор, чтобы создать первое задание.'
            : 'Преподаватель ещё не добавил материалы.'}
        </p>
      )}
    </>
  );
}
function ProgressMatrix({
  report,
  canCreate,
}: {
  report: components['schemas']['ClassReportOut'];
  canCreate: boolean;
}) {
  if (report.assignments.length === 0)
    return (
      <EmptyState title="Заданий пока нет">
        {canCreate
          ? 'Создайте задание — здесь появится таблица прогресса.'
          : 'После публикации заданий здесь появится таблица прогресса.'}
      </EmptyState>
    );
  return (
    <>
      <div
        className="cs-table-scroll"
        role="region"
        aria-label="Прогресс учеников по заданиям"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Ученик</th>
              {report.assignments.map((a) => (
                <th scope="col" key={a.id}>
                  {a.title}
                  <small>{goalLabel(a)}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.students.map((student) => (
              <tr key={student.user_id}>
                <th scope="row">
                  <Link to={`reports/students/${student.user_id}`}>
                    {student.display_name || student.username}
                    <ClassIcon name="chevron" />
                  </Link>
                  <small>@{student.username}</small>
                </th>
                {report.assignments.map((a) => {
                  const progress = student.assignments[a.id];
                  return (
                    <td key={a.id}>
                      {progress ? (
                        <>
                          <StatusBadge status={progress.status} />
                          <span className="cs-cell-value">
                            {progress.progress_value} из {a.goal_value}
                          </span>
                        </>
                      ) : (
                        <span className="cs-muted">Нет данных</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {report.students.length === 0 && (
              <tr>
                <td colSpan={report.assignments.length + 1}>В классе пока нет учеников.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="cs-helper">Нажмите на имя ученика, чтобы открыть подробный отчёт.</p>
    </>
  );
}
function StudentAssignment({
  assignment,
  setTitle,
}: {
  assignment: Assignment;
  setTitle?: string;
}) {
  const progress = assignment.progress;
  const unavailable = assignment.open_at ? Date.parse(assignment.open_at) > Date.now() : false;
  return (
    <article className="cs-assignment">
      <div className="cs-row-title">
        <div>
          <h3>{assignment.title}</h3>
          {setTitle && <p>{setTitle}</p>}
        </div>
        {progress && <StatusBadge status={progress.status} />}
      </div>
      <div className="cs-assignment-info">
        <span>{goalLabel(assignment)}</span>
        <span>{assignment.due_at ? `До ${formatDate(assignment.due_at)}` : 'Без дедлайна'}</span>
      </div>
      {progress && (
        <ProgressBar assignment={assignment} label={`Прогресс задания ${assignment.title}`} />
      )}
      <div className="cs-assignment-bottom">
        <span>
          {progress
            ? `${progress.progress_value} из ${assignment.goal_value}`
            : 'Нет данных о прогрессе'}
        </span>
        {unavailable ? (
          <span>Откроется {formatDate(assignment.open_at!)}</span>
        ) : (
          <Link
            className={`cs-button ${progress?.status === 'done' ? 'cs-secondary' : ''}`}
            to={studyPath(assignment)}
          >
            Продолжить
            <ClassIcon name="arrow" />
          </Link>
        )}
      </div>
    </article>
  );
}
function ProgressBar({ assignment, label }: { assignment: Assignment; label: string }) {
  const value = assignment.progress?.progress_value ?? 0;
  const goal = assignment.goal_value;
  return (
    <div
      className={`cs-meter ${assignment.progress?.status === 'done' ? 'cs-done' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={Math.max(0, Math.min(goal, value))}
      aria-valuetext={`${value} из ${goal}`}
    >
      <i style={{ width: `${goal > 0 ? Math.max(0, Math.min(100, (value / goal) * 100)) : 0}%` }} />
    </div>
  );
}
function CardErrors({ cards }: { cards: components['schemas']['CardErrorOut'][] }) {
  if (cards.length === 0)
    return <p className="cs-empty-copy">Ошибок пока нет — данные появятся после первых ответов.</p>;
  return (
    <div>
      {cards.slice(0, 10).map((card) => (
        <div className="cs-error-row" key={card.card_id}>
          <div>
            <strong>{card.term}</strong>
            <p>
              {card.definition} · {card.set_title}
            </p>
          </div>
          <div className="cs-error-number">
            <span>{card.errors_count} ошибок</span>
            <small aria-label={`${Math.round(card.error_percent)} процентов ответов с ошибкой`}>
              {Math.round(card.error_percent)}% ответов
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}
function ClassHeader({ classroom, actions }: { classroom: Classroom; actions?: ReactNode }) {
  return (
    <>
      <BackLink />
      <header className="cs-header">
        <div>
          <h1>{classroom.title}</h1>
          <div className="cs-role">Вы — {roles[classroom.my_role]}</div>
          {classroom.description && <p>{classroom.description}</p>}
        </div>
        {actions && <div className="cs-header-actions">{actions}</div>}
      </header>
    </>
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
    <label>
      {label}
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
function StatusBadge({ status }: { status: AssignmentStatus }) {
  return <span className={`cs-status cs-status-${status}`}>{statusLabels[status]}</span>;
}
function ClassSymbol() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 21V9h16v12M9 21v-6h6v6M8 9V5h8v4M10 5V3h4v2" />
    </svg>
  );
}
function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="cs-empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function ErrorState({ title, retry }: { title: string; retry: () => void }) {
  return (
    <div className="cs-query-error" role="alert">
      <h3>{title}</h3>
      <p>Проверьте соединение и повторите запрос.</p>
      <button className="cs-text-button" onClick={retry}>
        Повторить
        <ClassIcon name="arrow" />
      </button>
    </div>
  );
}
function ClassPageSkeleton() {
  return (
    <div className="class-screen">
      <BackLink />
      <div className="cs-skeleton-page" aria-label="Загрузка класса" aria-busy="true">
        <div />
        <ReportSkeleton />
      </div>
    </div>
  );
}
function ReportSkeleton({ label = 'Загрузка отчёта' }: { label?: string }) {
  return (
    <div className="cs-skeleton" aria-label={label} aria-busy="true">
      <i />
      <i />
      <i />
    </div>
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
  if (error instanceof TypeError)
    return 'Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.';
  return typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message)
    : 'Не удалось выполнить запрос. Попробуйте ещё раз.';
}
