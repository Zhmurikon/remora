import type { components } from '@remora/api-client';
import { Button, StudyNotesPreview } from '@remora/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { MaterialVisibility } from './MaterialVisibility';
import { RichArticleEditor } from '../features/article-editor/RichArticleEditor';
import '../features/article-editor/article-editor.css';
import { useAuthStore } from '../features/auth/auth-store';

type Job = components['schemas']['GenerationPublic'];
type Entitlements = components['schemas']['EntitlementsPublic'];
const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : 'Не удалось выполнить действие. Повторите ещё раз.';

export function AssistantNoteEditor({
  job,
  entitlements,
  onSaved,
  onNext,
  sources,
  versions,
  hasCards,
}: {
  job: Job;
  entitlements?: Entitlements;
  onSaved: () => Promise<void>;
  onNext: () => void;
  sources?: ReactNode;
  versions: ReactNode;
  hasCards: boolean;
}) {
  const userId = useAuthStore((s) => s.user?.id);
  const draftKey = `ai-note:${userId ?? 'guest'}:${job.id}`;
  const [initial] = useState(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null') as {
        text: string;
        revision: string;
      } | null;
      return v && typeof v.text === 'string' && typeof v.revision === 'string' ? v : null;
    } catch {
      return null;
    }
  });
  const [recovered, setRecovered] = useState(!!initial && initial.text !== (job.markdown ?? ''));
  const [text, setText] = useState(initial?.text ?? job.markdown ?? '');
  const [revision, setRevision] = useState(initial?.revision ?? job.updated_at);
  const [baseline, setBaseline] = useState(job.markdown ?? '');
  const [editing, setEditing] = useState(false);
  const proposalKey = `ai-proposal:${userId ?? 'guest'}:${job.id}`;
  const savedProposal = () => {
    try {
      return sessionStorage.getItem(proposalKey);
    } catch {
      return null;
    }
  };
  const [refining, setRefining] = useState(() => !!savedProposal());
  const [fragment, setFragment] = useState('');
  const [scope, setScope] = useState<'all' | 'fragment'>('all');
  const [instruction, setInstruction] = useState('');
  const [proposalId, setProposalId] = useState<string | null>(savedProposal);
  useEffect(() => {
    try {
      if (proposalId) sessionStorage.setItem(proposalKey, proposalId);
      else sessionStorage.removeItem(proposalKey);
    } catch {
      /* Результат запроса остаётся на сервере. */
    }
  }, [proposalId, proposalKey]);
  const [showCourse, setShowCourse] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [courseTitle, setCourseTitle] = useState(job.title.slice(0, 160));
  const [courseMode, setCourseMode] = useState<'new' | 'existing'>('new');
  const [showHistory, setShowHistory] = useState(false);
  const requestId = useRef<string | null>(null);
  const article = useRef<HTMLDivElement>(null);
  const dirty = text !== baseline;
  const save = useMutation({
    mutationFn: async (snapshot: { text: string; revision: string }) => {
      const { data, error } = await api.PATCH('/api/v1/generations/{job_id}', {
        params: { path: { job_id: job.id } },
        body: { revision: snapshot.revision, markdown: snapshot.text },
      });
      if (error || !data) throw new Error(errorMessage(error));
      setRevision(data.updated_at);
      setBaseline(snapshot.text);
      setRecovered(false);
      await onSaved();
    },
  });
  useEffect(() => {
    try {
      if (dirty) sessionStorage.setItem(draftKey, JSON.stringify({ text, revision }));
      else sessionStorage.removeItem(draftKey);
    } catch {
      /* Предупреждение при выходе остаётся активным. */
    }
  }, [text, revision, dirty, draftKey]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!dirty || !text.trim() || save.isPending || save.isError || recovered) return;
    const timer = setTimeout(() => save.mutate({ text, revision }), 1200);
    return () => clearTimeout(timer);
  }, [text, revision, dirty, save.isPending, save.isError, recovered]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (dirty || save.isPending) return;
    setText(job.markdown ?? '');
    setBaseline(job.markdown ?? '');
    setRevision(job.updated_at);
  }, [job.markdown, job.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const courses = useQuery({
    queryKey: ['assistant-courses'],
    enabled: showCourse && courseMode === 'existing',
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/courses');
      if (error || !data) throw new Error(errorMessage(error));
      return data;
    },
  });
  const attach = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/generations/{note_id}/course', {
        params: { path: { note_id: job.id } },
        body: {
          revision,
          course_id: courseMode === 'existing' ? courseId : null,
          title: courseTitle,
        },
      });
      if (error) throw new Error(errorMessage(error));
      setShowCourse(false);
      await onSaved();
    },
  });
  const visibility = useMutation({
    mutationFn: async (isPublic: boolean) => {
      const { data, error } = await api.PATCH('/api/v1/generations/{job_id}', {
        params: { path: { job_id: job.id } },
        body: { revision, is_public: isPublic },
      });
      if (error || !data) throw new Error(errorMessage(error));
      setRevision(data.updated_at);
      await onSaved();
    },
  });
  const refine = useMutation({
    mutationFn: async () => {
      requestId.current ??= crypto.randomUUID();
      const { data, error, response } = await api.POST('/api/v1/generations/{note_id}/refine', {
        params: { path: { note_id: job.id } },
        body: {
          request_id: requestId.current,
          revision,
          instruction,
          scope,
          fragment: scope === 'fragment' ? fragment : null,
        },
      });
      if (error || !data) {
        if (response.status < 500 && response.status !== 408) requestId.current = null;
        throw new Error(errorMessage(error));
      }
      requestId.current = null;
      setProposalId(data.id);
    },
  });
  const proposal = useQuery({
    queryKey: ['ai-proposal', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/generations/{job_id}', {
        params: { path: { job_id: proposalId! } },
      });
      if (error || !data) throw new Error(errorMessage(error));
      return data;
    },
    refetchInterval: (query) =>
      query.state.data && ['completed', 'failed'].includes(query.state.data.status) ? false : 2000,
  });
  const apply = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/generations/{note_id}/apply', {
        params: { path: { note_id: job.id } },
        body: { revision, proposal_id: proposalId! },
      });
      if (error || !data) throw new Error(errorMessage(error));
      setText(data.markdown ?? '');
      setBaseline(data.markdown ?? '');
      setRevision(data.updated_at);
      setProposalId(null);
      setRefining(false);
      await onSaved();
    },
  });
  const history = useQuery({
    queryKey: ['note-revisions', job.id, revision],
    enabled: showHistory,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/generations/{note_id}/revisions', {
        params: { path: { note_id: job.id } },
      });
      if (error || !data) throw new Error(errorMessage(error));
      return data;
    },
  });
  const canRefine = entitlements?.features['ai.refinement'] === true;
  const busy = save.isPending || visibility.isPending || attach.isPending || apply.isPending;
  function selectFragment() {
    const selection = window.getSelection();
    if (
      selection &&
      article.current?.contains(selection.anchorNode) &&
      article.current.contains(selection.focusNode)
    ) {
      const selected = selection.toString().trim();
      if (selected && text.includes(selected)) setFragment(selected);
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.title.replace(/[/\\]/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const errors = [
    save.error,
    attach.error,
    visibility.error,
    refine.error,
    apply.error,
    proposal.error,
  ].filter(Boolean);
  return (
    <div className="ai-result-grid">
      <section className="ai-document">
        <div className="ai-document-toolbar">
          <span role="status">
            {save.isPending
              ? 'Сохраняем…'
              : save.isError
                ? 'Не удалось сохранить'
                : dirty
                  ? 'Есть несохранённые правки'
                  : 'Все изменения сохранены'}
          </span>
          <button onClick={() => setEditing(!editing)}>
            {editing ? 'Читать' : 'Редактировать'}
          </button>
          <button onClick={download}>Скачать .md</button>
        </div>
        {errors.map((error, index) => (
          <p className="ai-notice" role="alert" key={index}>
            {errorMessage(error)}
          </p>
        ))}
        {dirty && (save.isError || recovered) ? (
          <Button disabled={busy || !text.trim()} onClick={() => save.mutate({ text, revision })}>
            Сохранить изменения
          </Button>
        ) : null}
        {dirty ? (
          <button
            className="ai-small"
            disabled={busy}
            onClick={() => {
              setText(job.markdown ?? '');
              setBaseline(job.markdown ?? '');
              setRevision(job.updated_at);
              save.reset();
              setRecovered(false);
            }}
          >
            Отменить правки
          </button>
        ) : null}
        {editing ? (
          <div className="ai-note-editor ae-page">
            <RichArticleEditor
              value={text}
              onChange={setText}
              media={{}}
              onImage={() => {}}
              allowImages={false}
              busy={apply.isPending}
              onUploading={() => {}}
            />
          </div>
        ) : (
          <div
            className="ai-note-content"
            ref={article}
            onMouseUp={selectFragment}
            onKeyUp={selectFragment}
          >
            <StudyNotesPreview value={text} articleTitle={job.title} />
          </div>
        )}
      </section>
      <aside className="ai-result-rail">
        {refining ? (
          <section className="ai-refine-panel">
            <header>
              <h2>Доработать с ИИ</h2>
              <button aria-label="Закрыть помощника" onClick={() => setRefining(false)}>
                ×
              </button>
            </header>
            <label>
              Что изменить?
              <select
                value={scope}
                disabled={refine.isPending}
                onChange={(e) => {
                  setScope(e.target.value as typeof scope);
                  requestId.current = null;
                }}
              >
                <option value="all">Весь конспект</option>
                <option value="fragment" disabled={!fragment}>
                  Выделенный фрагмент
                </option>
              </select>
            </label>
            <p className="ai-small ai-muted">
              Чтобы изменить часть статьи, выделите её текст в режиме чтения.
            </p>
            {scope === 'fragment' ? (
              <blockquote className="ai-proposal">{fragment}</blockquote>
            ) : null}
            <label>
              Ваша правка
              <textarea
                className="ai-field"
                value={instruction}
                maxLength={2000}
                onChange={(e) => {
                  setInstruction(e.target.value);
                  requestId.current = null;
                }}
                placeholder="Например: сократи статью и добавь пример к каждому определению"
              />
            </label>
            {canRefine ? (
              <p className="ai-small ai-muted">
                Доработка расходует недельный лимит генерации Pro.
              </p>
            ) : null}
            {!canRefine ? (
              <p>
                Доработка с ИИ доступна на Pro. Читать и редактировать вручную можно на любом
                тарифе. <Link to="/billing">Посмотреть тариф</Link>
              </p>
            ) : null}
            <Button
              fullWidth
              disabled={
                !canRefine ||
                dirty ||
                busy ||
                !instruction.trim() ||
                refine.isPending ||
                (!!proposalId &&
                  proposal.data?.status !== 'completed' &&
                  proposal.data?.status !== 'failed')
              }
              onClick={() => refine.mutate()}
            >
              {refine.isPending ? 'Отправляем…' : 'Подготовить изменения'}
            </Button>
            {dirty ? <p>Сначала сохраните изменения конспекта.</p> : null}
            {proposalId &&
            proposal.data?.status !== 'completed' &&
            proposal.data?.status !== 'failed' ? (
              <p role="status">Подготавливаем предложение. Исходный текст не меняется.</p>
            ) : null}
            {proposal.data?.status === 'failed' ? (
              <p role="alert">{proposal.data.error_message}</p>
            ) : null}
            {proposal.data?.status === 'completed' ? (
              <>
                <h3>Предложение</h3>
                <div className="ai-proposal">
                  <StudyNotesPreview value={proposal.data.markdown ?? ''} />
                </div>
                <div className="ai-stack">
                  <Button disabled={dirty || busy} onClick={() => apply.mutate()}>
                    Применить
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setProposalId(null);
                      apply.reset();
                    }}
                  >
                    Отменить предложение
                  </Button>
                </div>
                <p>Исходный текст сохранится в истории версий.</p>
              </>
            ) : null}
          </section>
        ) : (
          <>
            <section>
              <h2>Курс</h2>
              {job.course_id && job.article_id ? (
                <>
                  <p>Конспект связан с уроком. Правки общие.</p>
                  <Link to={`/courses/${job.course_id}?article=${job.article_id}`}>
                    Открыть урок →
                  </Link>
                </>
              ) : (
                <>
                  <p>Пока не добавлен в курс</p>
                  <Button
                    className="mt-3"
                    variant="secondary"
                    disabled={dirty || busy}
                    onClick={() => setShowCourse(!showCourse)}
                  >
                    Добавить в курс
                  </Button>
                </>
              )}
              {showCourse ? (
                <div className="ai-stack">
                  <select
                    aria-label="Куда добавить конспект"
                    value={courseMode}
                    onChange={(e) => setCourseMode(e.target.value as typeof courseMode)}
                  >
                    <option value="new">В новый курс</option>
                    <option value="existing">В существующий курс</option>
                  </select>
                  {courseMode === 'new' ? (
                    <input
                      aria-label="Название курса"
                      className="ai-field"
                      value={courseTitle}
                      onChange={(e) => setCourseTitle(e.target.value)}
                      maxLength={160}
                    />
                  ) : (
                    <select
                      aria-label="Существующий курс"
                      value={courseId}
                      onChange={(e) => setCourseId(e.target.value)}
                    >
                      <option value="">Выберите курс</option>
                      {courses.data?.map((course) => (
                        <option value={course.id} key={course.id}>
                          {course.title}
                        </option>
                      ))}
                    </select>
                  )}
                  {courses.isError ? (
                    <button onClick={() => void courses.refetch()}>
                      Повторить загрузку курсов
                    </button>
                  ) : null}
                  <Button
                    disabled={
                      busy ||
                      (courseMode === 'existing' && !courseId) ||
                      (courseMode === 'new' && !courseTitle.trim())
                    }
                    onClick={() => attach.mutate()}
                  >
                    Добавить
                  </Button>
                </div>
              ) : null}
            </section>
            <section>
              <h2>Работа с конспектом</h2>
              <p>Карточки будут созданы по тексту с учётом ваших правок.</p>
              <div className="ai-stack mt-4">
                <Button disabled={dirty || busy} onClick={onNext}>
                  {hasCards ? 'Открыть карточки' : 'Создать карточки'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setScope('all');
                    setRefining(true);
                  }}
                >
                  Доработать с ИИ{canRefine ? '' : ' · Pro'}
                </Button>
              </div>
            </section>
            <section>
              <h2>Источники</h2>
              {sources}
            </section>
          </>
        )}
        <details>
          <summary>Версии и доступ</summary>
          <div className="ai-stack">
            {versions}
            <MaterialVisibility
              label="Доступ к этому конспекту"
              isPublic={job.is_public}
              canHide={entitlements?.features['materials.private'] === true}
              disabled={dirty || busy}
              onChange={(value) => visibility.mutate(value)}
            />
            {job.is_public ? (
              <a
                href={`${import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000'}/konspekt/${job.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Открыть публичный конспект
              </a>
            ) : null}
            <button onClick={() => setShowHistory(!showHistory)}>История правок</button>
            {showHistory ? (
              <div>
                {history.isLoading ? (
                  <p>Загружаем…</p>
                ) : history.isError ? (
                  <button onClick={() => void history.refetch()}>Повторить</button>
                ) : !history.data?.length ? (
                  <p>Сохранённых правок пока нет.</p>
                ) : (
                  history.data.map((v) => (
                    <details key={v.id}>
                      <summary>{new Date(v.created_at).toLocaleString('ru')}</summary>
                      <div className="ai-proposal">
                        <StudyNotesPreview value={v.markdown} />
                      </div>
                      <Button
                        variant="secondary"
                        disabled={dirty || busy}
                        onClick={() => {
                          setText(v.markdown);
                          setEditing(true);
                        }}
                      >
                        Восстановить текст
                      </Button>
                    </details>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </details>
      </aside>
    </div>
  );
}
