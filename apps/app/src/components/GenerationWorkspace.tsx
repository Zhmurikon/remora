import type { components } from '@remora/api-client';
import { Button } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { StudyNotesPreview } from './StudyNotesPreview';

type Job = components['schemas']['GenerationPublic'];
type Card = components['schemas']['GeneratedCard'];
type Source = components['schemas']['TranscriptionPublic'];
type Entitlements = components['schemas']['EntitlementsPublic'];
type Draft = { markdown: string; cards: Card[]; revision: string };
function readDraft(job: Job): Draft | null {
  if (job.saved_set_id) return null;
  try {
    const value = JSON.parse(
      sessionStorage.getItem(`generation-draft:${job.id}`) ?? 'null',
    ) as Draft | null;
    return value &&
      typeof value.markdown === 'string' &&
      typeof value.revision === 'string' &&
      Array.isArray(value.cards)
      ? value
      : null;
  } catch {
    return null;
  }
}
const LIMIT = 'ai.generation_tokens_per_week';
const pending = (job: Job) => job.status === 'queued' || job.status === 'processing';
const message = (error: unknown) => {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Не удалось выполнить действие. Попробуйте ещё раз.';
};

export function GenerationWorkspace({
  source,
  kind,
  sourceReady,
  entitlements,
  onNext,
}: {
  source: Source;
  kind: 'notes' | 'cards';
  sourceReady: boolean;
  entitlements?: Entitlements;
  onNext: () => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ['generations', source.id];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // При неясном сетевом исходе повторяем тот же ключ, а не создаём новый платный запрос.
  const requestId = useRef<string | null>(null);
  const jobs = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/transcriptions/{source_id}/generations', {
        params: { path: { source_id: source.id } },
      });
      if (error || !data) throw new Error(message(error));
      return data;
    },
    refetchInterval: (query) => (query.state.data?.some(pending) ? 2500 : false),
  });
  const versions = jobs.data?.filter((job) => job.kind === kind) ?? [];
  const selected = versions.find((job) => job.id === selectedId) ?? versions[0];
  const notes = jobs.data?.find((job) => job.kind === 'notes' && job.status === 'completed');
  const active = jobs.data?.some(pending) ?? false;
  const allowed = entitlements?.features['ai.generation'] === true;
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ['billing-entitlements'] }),
    ]);
  }
  const create = useMutation({
    mutationFn: async () => {
      requestId.current ??= crypto.randomUUID();
      const { data, error } = await api.POST('/api/v1/transcriptions/{source_id}/generations', {
        params: { path: { source_id: source.id } },
        body: {
          request_id: requestId.current,
          kind,
          parent_id: kind === 'cards' ? notes?.id : null,
        },
      });
      if (error || !data) {
        // Ответ сервера однозначен: следующая попытка может использовать новый ключ.
        if (error) requestId.current = null;
        throw new Error(message(error));
      }
      requestId.current = null;
      setSelectedId(data.id);
      await refresh();
    },
  });
  const completedCount =
    jobs.data?.filter((job) => job.status === 'completed' || job.status === 'failed').length ?? 0;
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ['billing-entitlements'] });
  }, [completedCount, queryClient]);

  return (
    <section
      className="border-border bg-surface mt-5 rounded-xl border p-5 sm:p-8"
      aria-label={kind === 'notes' ? 'Генерация конспекта' : 'Генерация карточек'}
    >
      <h2 className="text-xl font-semibold">
        {kind === 'notes' ? 'Конспект лекции' : 'Карточки для запоминания'}
      </h2>
      <p className="text-fg-muted mt-2 max-w-2xl text-sm leading-6">
        {kind === 'notes'
          ? 'Основные идеи, определения, формулы и примеры из расшифровки. Готовый конспект можно отредактировать и скачать.'
          : 'Только важные понятия из последнего готового конспекта. Проверьте определения и три неверных варианта перед сохранением в набор.'}
      </p>
      {entitlements ? (
        <p className="text-fg-muted mt-3 text-sm">
          {entitlements.remaining[LIMIT] === null
            ? 'Генерация без недельного лимита'
            : `На этой неделе осталось ${(entitlements.remaining[LIMIT] ?? 0).toLocaleString('ru')} токенов генерации`}
        </p>
      ) : null}
      {!allowed && entitlements ? (
        <p className="mt-3 text-sm">
          Новая генерация доступна с подпиской.{' '}
          <Link className="text-primary underline" to="/billing">
            Посмотреть тарифы
          </Link>
        </p>
      ) : null}
      {kind === 'cards' && !notes && !jobs.isLoading ? (
        <p className="text-fg-muted mt-4">Сначала создайте конспект на шаге 2.</p>
      ) : null}
      {!sourceReady && kind === 'notes' ? (
        <p className="text-warning mt-3 text-sm">Дождитесь сохранения расшифровки на шаге 1.</p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          disabled={
            !allowed ||
            active ||
            create.isPending ||
            jobs.isLoading ||
            jobs.isError ||
            (kind === 'notes' ? !sourceReady : !notes)
          }
          onClick={() => create.mutate()}
        >
          {create.isPending
            ? 'Запускаем…'
            : versions.length
              ? 'Создать новую версию'
              : kind === 'notes'
                ? 'Создать конспект'
                : 'Создать карточки'}
        </Button>
        {versions.length > 1 ? (
          <label className="text-fg-muted text-sm">
            Версия
            <select
              aria-label="Версия результата"
              className="border-border bg-surface text-fg ml-2 min-h-11 rounded-lg border px-3"
              value={selected?.id}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {versions.map((job, index) => (
                <option key={job.id} value={job.id}>
                  {versions.length - index} · {new Date(job.created_at).toLocaleString('ru')}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {versions.length ? (
        <p className="text-fg-subtle mt-2 text-xs">
          Новая версия расходует квоту. Предыдущие результаты сохраняются.
        </p>
      ) : null}
      {jobs.isLoading ? (
        <p role="status" className="mt-5">
          Загружаем результаты…
        </p>
      ) : null}
      {jobs.isError ? (
        <div role="alert" className="text-danger mt-4">
          {message(jobs.error)}{' '}
          <button className="min-h-11 underline" onClick={() => void jobs.refetch()}>
            Повторить загрузку
          </button>
        </div>
      ) : null}
      {create.isError ? (
        <p role="alert" className="text-danger mt-4">
          {message(create.error)}
        </p>
      ) : null}
      {selected && pending(selected) ? (
        <p role="status" className="bg-primary-subtle mt-6 rounded-lg p-5">
          {selected.status === 'queued' ? 'Задание в очереди.' : 'Готовим материал.'} Можно закрыть
          страницу и вернуться позже.
        </p>
      ) : null}
      {selected?.status === 'failed' ? (
        <p role="alert" className="text-danger mt-6">
          {selected.error_message} Квота за неудачную генерацию возвращена.
        </p>
      ) : null}
      {selected?.status === 'completed' ? (
        <ResultEditor key={selected.id} job={selected} onSaved={refresh} onNext={onNext} />
      ) : null}
    </section>
  );
}

function ResultEditor({
  job,
  onSaved,
  onNext,
}: {
  job: Job;
  onSaved: () => Promise<void>;
  onNext: () => void;
}) {
  const [draft] = useState(() => readDraft(job));
  const [markdown, setMarkdown] = useState(draft?.markdown ?? job.markdown ?? '');
  const [cards, setCards] = useState<Card[]>(draft?.cards ?? job.cards ?? []);
  const [revision, setRevision] = useState(draft?.revision ?? job.updated_at);
  const [baseline, setBaseline] = useState(
    JSON.stringify({ markdown: job.markdown ?? '', cards: job.cards ?? [] }),
  );
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(job.title.slice(0, 160));
  const dirty = JSON.stringify({ markdown, cards }) !== baseline;
  useEffect(() => {
    try {
      if (dirty)
        sessionStorage.setItem(
          `generation-draft:${job.id}`,
          JSON.stringify({ markdown, cards, revision }),
        );
      else sessionStorage.removeItem(`generation-draft:${job.id}`);
    } catch {
      /* При недоступном хранилище остаётся предупреждение перед закрытием. */
    }
  }, [cards, dirty, job.id, markdown, revision]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.PATCH('/api/v1/generations/{job_id}', {
        params: { path: { job_id: job.id } },
        body: { revision, ...(job.kind === 'notes' ? { markdown } : { cards }) },
      });
      if (error || !data) throw new Error(message(error));
      setRevision(data.updated_at);
      setBaseline(JSON.stringify({ markdown, cards }));
      await onSaved();
    },
  });
  const saveSet = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/generations/{job_id}/save-set', {
        params: { path: { job_id: job.id } },
        body: { revision, title },
      });
      if (error || !data) throw new Error(message(error));
      await onSaved();
    },
  });
  const fieldClass =
    'border-border bg-surface text-fg focus:ring-primary min-h-11 w-full rounded-lg border px-3 py-2 outline-none focus:ring-2';
  const busy = save.isPending || saveSet.isPending;
  function changeCard(index: number, patch: Partial<Card>) {
    setCards((previous) => previous.map((card, i) => (i === index ? { ...card, ...patch } : card)));
  }
  return (
    <div className="mt-7 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {job.kind === 'notes' ? (
          <Button variant="secondary" onClick={() => setEditing(!editing)}>
            {editing ? 'Предпросмотр' : 'Редактировать'}
          </Button>
        ) : null}
        {!job.saved_set_id ? (
          <Button variant="secondary" disabled={!dirty || busy} onClick={() => save.mutate()}>
            {save.isPending ? 'Сохраняем…' : 'Сохранить изменения'}
          </Button>
        ) : null}
        {job.kind === 'notes' ? (
          <Button
            variant="secondary"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
              );
              const a = document.createElement('a');
              a.href = url;
              a.download = `${job.title.replace(/[/\\]/g, '-')}.md`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Скачать .md
          </Button>
        ) : null}
        <span className="text-fg-muted text-sm" aria-live="polite">
          {dirty ? 'Есть несохранённые изменения' : 'Сохранено'}
        </span>
      </div>
      {save.isError || saveSet.isError ? (
        <p role="alert" className="text-danger">
          {message(save.error ?? saveSet.error)}
        </p>
      ) : null}
      {job.kind === 'notes' ? (
        <>
          {editing ? (
            <textarea
              aria-label="Markdown конспекта"
              className={`${fieldClass} min-h-[480px] font-mono text-sm leading-6`}
              value={markdown}
              disabled={busy}
              onChange={(event) => setMarkdown(event.target.value)}
            />
          ) : (
            <StudyNotesPreview value={markdown} />
          )}
          <Button disabled={dirty || busy} onClick={onNext}>
            Перейти к карточкам
          </Button>
        </>
      ) : (
        <>
          {!cards.length ? (
            <p className="text-fg-muted">В тексте не нашлось отдельных понятий для карточек.</p>
          ) : null}
          {(job.issues ?? []).length ? (
            <div className="bg-warning-subtle rounded-lg p-4">
              <p className="font-medium">Перед сохранением исправьте определения</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {(job.issues ?? []).map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm">
                После правки нажмите «Сохранить изменения», чтобы обновить проверку.
              </p>
            </div>
          ) : null}
          {cards.map((card, index) => (
            <fieldset
              key={index}
              disabled={busy || !!job.saved_set_id}
              className="border-border space-y-3 rounded-xl border p-4"
            >
              <legend className="px-2 font-medium">Карточка {index + 1}</legend>
              <label className="block text-sm">
                Термин
                <input
                  className={`${fieldClass} mt-1`}
                  value={card.term}
                  maxLength={160}
                  onChange={(event) => changeCard(index, { term: event.target.value })}
                />
              </label>
              <label className="block text-sm">
                Правильное определение
                <textarea
                  className={`${fieldClass} mt-1`}
                  value={card.definition}
                  maxLength={1000}
                  onChange={(event) => changeCard(index, { definition: event.target.value })}
                />
              </label>
              {card.wrong_definition_answers.map((wrong, wrongIndex) => (
                <label key={wrongIndex} className="block text-sm">
                  Неверное определение {wrongIndex + 1}
                  <textarea
                    className={`${fieldClass} mt-1`}
                    value={wrong}
                    maxLength={1000}
                    onChange={(event) =>
                      changeCard(index, {
                        wrong_definition_answers: card.wrong_definition_answers.map((value, i) =>
                          i === wrongIndex ? event.target.value : value,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              {!job.saved_set_id ? (
                <button
                  className="text-danger min-h-11 rounded px-2 text-sm underline"
                  onClick={() => setCards(cards.filter((_, i) => i !== index))}
                >
                  Убрать карточку
                </button>
              ) : null}
            </fieldset>
          ))}
          {job.saved_set_id ? (
            <Link
              className="text-primary inline-flex min-h-11 items-center font-medium underline"
              to={`/sets/${job.saved_set_id}/edit`}
            >
              Открыть сохранённый набор
            </Link>
          ) : cards.length ? (
            <div className="space-y-3">
              <label className="block text-sm">
                Название набора
                <input
                  className={`${fieldClass} mt-1`}
                  value={title}
                  maxLength={160}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <p className="text-fg-muted text-sm">
                Набор будет виден только вам. Перед сохранением проверьте смысл ответов.
              </p>
              <Button
                disabled={dirty || busy || !!(job.issues ?? []).length || !title.trim()}
                onClick={() => saveSet.mutate()}
              >
                {saveSet.isPending ? 'Сохраняем набор…' : 'Сохранить в новый набор'}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
