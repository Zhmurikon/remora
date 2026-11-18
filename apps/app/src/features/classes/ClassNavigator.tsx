import type { components } from '@remora/api-client';
import { Button, Input } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import books from '../../../../web/public/lecture-demo/course-books.webp';
import { api } from '../../lib/api';
import './class-navigator.css';

type Classroom = components['schemas']['ClassroomOut'];
type View = 'teaching' | 'learning';
type FormMode = 'create' | 'join';
const roles = { teacher: 'Преподаватель', assistant: 'Ассистент', student: 'Ученик' };

export function ClassNavigator() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [title, setTitle] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const formInput = useRef<HTMLInputElement>(null);
  const formTrigger = useRef<HTMLButtonElement | null>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const focusRequest = useRef<string | null>(null);
  const classes = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/classes');
      if (error) throw new Error(requestError(error));
      return data;
    },
  });
  const teaching = (classes.data ?? []).filter((item) => item.my_role !== 'student');
  const learning = (classes.data ?? []).filter((item) => item.my_role === 'student');
  const requestedView = params.get('role');
  const view: View =
    requestedView === 'teaching' || requestedView === 'learning'
      ? requestedView
      : teaching.length === 0 && learning.length > 0
        ? 'learning'
        : 'teaching';
  const visible = view === 'teaching' ? teaching : learning;
  const active = visible.filter((item) => !item.archived_at);
  const archived = visible.filter((item) => item.archived_at);
  const selected = visible.find((item) => item.id === params.get('class')) ?? active[0];
  const mobilePreview = Boolean(selected && params.get('class') === selected.id);
  const normalizedCode = joinCode.trim().toUpperCase();

  useEffect(() => {
    if (selected?.archived_at) setArchiveOpen(true);
  }, [selected?.id, selected?.archived_at]);

  useEffect(() => {
    if (formMode) formInput.current?.focus();
  }, [formMode]);

  useEffect(() => {
    if (!focusRequest.current) return;
    const target =
      focusRequest.current === 'preview'
        ? previewHeading.current
        : document.getElementById(focusRequest.current);
    target?.focus();
    focusRequest.current = null;
  }, [params]);

  function changeView(next: View) {
    const nextParams = new URLSearchParams(params);
    nextParams.set('role', next);
    nextParams.delete('class');
    setParams(nextParams);
    setArchiveOpen(false);
  }

  function selectClass(classroom: Classroom) {
    const nextParams = new URLSearchParams(params);
    nextParams.set('role', view);
    nextParams.set('class', classroom.id);
    if (window.matchMedia?.('(max-width: 1199px)').matches) {
      focusRequest.current = 'preview';
    }
    setParams(nextParams);
  }

  function backToList() {
    const id = selected?.id;
    const nextParams = new URLSearchParams(params);
    nextParams.delete('class');
    focusRequest.current = `class-option-${id}`;
    setParams(nextParams);
  }

  function openForm(mode: FormMode, trigger: HTMLButtonElement) {
    formTrigger.current = trigger;
    setFormError(null);
    setFormMode(mode);
    if (mode === formMode) formInput.current?.focus();
  }

  function closeForm() {
    if (submitting.current) return;
    setFormMode(null);
    setFormError(null);
    formTrigger.current?.focus();
  }

  function tabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 'teaching'
        : event.key === 'End'
          ? 'learning'
          : view === 'teaching'
            ? 'learning'
            : 'teaching';
    changeView(next);
    document.getElementById(`classes-tab-${next}`)?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !formMode) return;
    if (
      formMode === 'create'
        ? !title.trim()
        : normalizedCode.length < 8 || normalizedCode.length > 12 || normalizedCode === pendingCode
    )
      return;
    submitting.current = true;
    setBusy(true);
    setFormError(null);
    try {
      if (formMode === 'create') {
        const { data, error } = await api.POST('/api/v1/classes', {
          body: { title: title.trim(), description: '', requires_approval: false },
        });
        if (error) throw new Error(requestError(error));
        void queryClient.invalidateQueries({ queryKey: ['classes'] });
        navigate(`/classes/${data.id}`);
      } else {
        const { data, error } = await api.POST('/api/v1/classes/join', {
          body: { join_code: normalizedCode },
        });
        if (error) throw new Error(requestError(error));
        void queryClient.invalidateQueries({ queryKey: ['classes'] });
        if (data.status === 'active') navigate(`/classes/${data.class_id}`);
        else {
          setPendingCode(normalizedCode);
          setPendingTitle(data.class_title);
        }
      }
    } catch (error) {
      setFormError(requestError(error));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function classRow(classroom: Classroom) {
    return (
      <li key={classroom.id}>
        <button
          id={`class-option-${classroom.id}`}
          className="classes-row"
          type="button"
          aria-pressed={selected?.id === classroom.id}
          aria-controls="class-preview"
          onClick={() => selectClass(classroom)}
        >
          <span className="classes-row-title">{classroom.title}</span>
          <span className="classes-role">
            {roles[classroom.my_role]}
            {classroom.archived_at ? ' · В архиве' : ''}
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="classes-page">
      <header className="classes-heading">
        <div>
          <h1>Классы</h1>
          <p>Выберите класс, чтобы перейти к совместной работе.</p>
        </div>
        <div className="classes-actions">
          <Button
            variant="secondary"
            disabled={busy}
            aria-expanded={formMode === 'join'}
            aria-controls="classes-form"
            onClick={(event) => openForm('join', event.currentTarget)}
          >
            Вступить по коду
          </Button>
          <Button
            disabled={busy}
            aria-expanded={formMode === 'create'}
            aria-controls="classes-form"
            onClick={(event) => openForm('create', event.currentTarget)}
          >
            <ClassIcon name="plus" />
            Создать класс
          </Button>
        </div>
      </header>

      {formMode && (
        <section
          className="classes-form"
          id="classes-form"
          aria-labelledby="classes-form-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              closeForm();
            }
          }}
        >
          <div className="classes-form-heading">
            <h2 id="classes-form-title">
              {formMode === 'create' ? 'Новый класс' : 'Вступить в класс'}
            </h2>
            <button
              type="button"
              className="classes-text-button"
              disabled={busy}
              onClick={closeForm}
            >
              Закрыть
              <ClassIcon name="close" />
            </button>
          </div>
          <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
            <Input
              ref={formInput}
              label={formMode === 'create' ? 'Название' : 'Код приглашения'}
              value={formMode === 'create' ? title : joinCode}
              maxLength={formMode === 'create' ? 160 : 12}
              placeholder={formMode === 'create' ? 'Например, 9Б — география' : '8–12 символов'}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              aria-describedby={formError ? 'classes-form-error' : 'classes-form-hint'}
              onChange={(event) => {
                if (formMode === 'create') setTitle(event.target.value);
                else setJoinCode(event.target.value);
                setFormError(null);
              }}
            />
            <Button
              type="submit"
              loading={busy}
              disabled={
                busy ||
                (formMode === 'create'
                  ? !title.trim()
                  : normalizedCode.length < 8 ||
                    normalizedCode.length > 12 ||
                    normalizedCode === pendingCode)
              }
            >
              {formMode === 'create'
                ? 'Создать и открыть'
                : normalizedCode === pendingCode
                  ? 'Заявка отправлена'
                  : 'Вступить'}
            </Button>
          </form>
          <p id="classes-form-hint" className="classes-form-hint">
            {formMode === 'create'
              ? 'После создания добавьте учебный набор и первое задание.'
              : 'Попросите код у преподавателя. В некоторых классах нужно дождаться одобрения.'}
          </p>
          {formError && (
            <p id="classes-form-error" className="classes-form-error" role="alert">
              {formError}
            </p>
          )}
        </section>
      )}
      {pendingTitle !== null && (
        <p className="classes-notice" role="status">
          Заявка в класс «{pendingTitle}» отправлена. Класс появится после одобрения преподавателем.
        </p>
      )}

      <div className={`classes-columns ${mobilePreview ? 'classes-show-preview' : ''}`}>
        <section className="classes-index" aria-label="Выбор класса">
          <div className="classes-tabs" role="tablist" aria-label="Роль в классах">
            {(['teaching', 'learning'] as const).map((tab) => (
              <button
                key={tab}
                id={`classes-tab-${tab}`}
                type="button"
                role="tab"
                aria-selected={view === tab}
                tabIndex={view === tab ? 0 : -1}
                aria-controls="classes-list"
                onKeyDown={tabKey}
                onClick={() => changeView(tab)}
              >
                {tab === 'teaching' ? 'Преподаю' : 'Учусь'}{' '}
                <span>
                  {classes.data ? (tab === 'teaching' ? teaching.length : learning.length) : '—'}
                </span>
              </button>
            ))}
          </div>
          <div id="classes-list" role="tabpanel" aria-labelledby={`classes-tab-${view}`}>
            {classes.isPending && (
              <div
                className="classes-skeleton"
                role="status"
                aria-label="Загрузка классов"
                aria-busy="true"
              >
                <span />
                <span />
                <span />
              </div>
            )}
            {classes.isError && (
              <div className="classes-list-error" role="alert">
                <h2>Не удалось загрузить классы</h2>
                <p>Проверьте соединение и повторите запрос.</p>
                <Button
                  variant="secondary"
                  loading={classes.isFetching}
                  disabled={classes.isFetching}
                  onClick={() => void classes.refetch()}
                >
                  Повторить
                </Button>
              </div>
            )}
            {classes.data && (
              <>
                <ul className="classes-list">{active.map(classRow)}</ul>
                {active.length === 0 && (
                  <p className="classes-list-empty">
                    {archived.length
                      ? 'Все классы этой группы в архиве.'
                      : view === 'teaching'
                        ? 'Здесь появятся классы, где вы преподаёте или помогаете преподавателю.'
                        : 'Здесь появятся классы ваших преподавателей.'}
                  </p>
                )}
                {archived.length > 0 && (
                  <details
                    className="classes-archive"
                    open={archiveOpen}
                    onToggle={(event) => setArchiveOpen(event.currentTarget.open)}
                  >
                    <summary>
                      <ClassIcon name="chevron" />
                      <ClassIcon name="archive" />
                      Архив <span>{archived.length}</span>
                    </summary>
                    <ul className="classes-list">{archived.map(classRow)}</ul>
                  </details>
                )}
              </>
            )}
          </div>
          <p className="classes-index-hint">
            {view === 'teaching'
              ? 'Вкладка «Учусь» покажет классы ваших преподавателей.'
              : 'Чтобы вести собственную группу, создайте класс.'}
          </p>
        </section>

        <section
          id="class-preview"
          className="classes-detail"
          aria-label="Описание выбранного класса"
        >
          {selected ? (
            <>
              <button
                type="button"
                className="classes-text-button classes-back"
                onClick={backToList}
              >
                <ClassIcon name="back" />К списку классов
              </button>
              <div className="classes-preview-caption">
                <span>Выбранный класс</span>
                <span>
                  {selected.archived_at
                    ? 'В архиве'
                    : `${active.indexOf(selected) + 1} из ${active.length} активных`}
                </span>
              </div>
              <ClassPreview key={selected.id} classroom={selected} headingRef={previewHeading} />
            </>
          ) : classes.data && !classes.isError ? (
            <div className="classes-empty">
              <img src={books} width="84" height="96" alt="" />
              <h2>
                {archived.length
                  ? 'Активных классов нет'
                  : view === 'teaching'
                    ? 'Создайте первый класс'
                    : 'Вступите по коду приглашения'}
              </h2>
              <p>
                {archived.length
                  ? 'Откройте архив слева, чтобы выбрать прежний класс. Материалы остаются доступны.'
                  : view === 'teaching'
                    ? 'Добавьте учебный набор, назначьте цель и следите за прогрессом учеников.'
                    : 'Попросите код у преподавателя. После вступления вы увидите материалы и задания.'}
              </p>
              <Button
                disabled={busy}
                onClick={(event) =>
                  openForm(view === 'teaching' ? 'create' : 'join', event.currentTarget)
                }
              >
                {view === 'teaching' ? 'Создать класс' : 'Вступить по коду'}
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ClassPreview({
  classroom,
  headingRef,
}: {
  classroom: Classroom;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = classroom.description.length > 240;
  const description =
    long && !expanded ? `${classroom.description.slice(0, 240).trimEnd()}…` : classroom.description;
  return (
    <article className="classes-preview">
      <h2 ref={headingRef} tabIndex={-1}>
        {classroom.title}
      </h2>
      <p className="classes-role">
        Вы — {roles[classroom.my_role].toLocaleLowerCase('ru-RU')}
        {classroom.archived_at ? ' · Класс в архиве' : ''}
      </p>
      {description && (
        <p id="class-description" className="classes-description">
          {description}
        </p>
      )}
      {long && (
        <button
          type="button"
          className="classes-text-button classes-description-toggle"
          aria-expanded={expanded}
          aria-controls="class-description"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Свернуть описание' : 'Полное описание'}
          <ClassIcon name="chevron" />
        </button>
      )}
      <Link className="classes-open" to={`/classes/${classroom.id}`}>
        Открыть класс
        <ClassIcon name="arrow" />
      </Link>
      <div className="classes-preview-note">
        <h3>Внутри класса</h3>
        <p>
          {classroom.my_role === 'student'
            ? 'Ваши задания, сроки и учебные материалы. Продолжайте обучение в нужном режиме.'
            : classroom.my_role === 'assistant'
              ? 'Материалы, задания и отчёт о прогрессе. Приглашениями и участниками управляет преподаватель.'
              : 'Материалы, задания и отчёт о прогрессе. Здесь же можно пригласить учеников.'}
        </p>
      </div>
    </article>
  );
}

export function ClassIcon({
  name,
}: {
  name: 'plus' | 'close' | 'arrow' | 'chevron' | 'archive' | 'back';
}) {
  const paths = {
    plus: 'M12 5v14M5 12h14',
    close: 'm6 6 12 12M6 18 18 6',
    arrow: 'M5 12h14m-5-5 5 5-5 5',
    back: 'M19 12H5m5-5-5 5 5 5',
    chevron: 'm9 5 7 7-7 7',
    archive: 'M3 3h18v5H3zM5 8v13h14V8M10 12h4',
  };
  return (
    <svg
      className="classes-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

function requestError(error: unknown) {
  if (error instanceof TypeError)
    return 'Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.';
  return typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message)
    : 'Не удалось выполнить запрос. Проверьте соединение и попробуйте ещё раз.';
}
