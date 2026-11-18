import type { components } from '@remora/api-client';
import { type ArticleMedia, Button, Card } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { CourseOutline } from '../features/course-structure/CourseOutline';
import type { OutlineSection as Section } from '../features/course-structure/order';
import { CourseAttachments } from '../components/CourseAttachments';
import { articleMediaIds } from '@remora/ui/article-markdown';
import { useAuthStore } from '../features/auth/auth-store';
import { ArticleDraftRecovery } from '../features/article-editor/ArticleDraftRecovery';
import {
  readLocalArticleDrafts,
  writeLocalArticleDraft,
  removeLocalArticleDraft,
  sameArticle,
  type LocalArticleDraft,
} from '../features/article-editor/local-drafts';

type Detail = components['schemas']['CourseEditorDetail'];
class CourseSaveError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
function canRetrySave(error: Error | null) {
  return error instanceof TypeError || (error instanceof CourseSaveError && error.retryable);
}
function fromDetail(data: Detail, previous?: Section[]): Section[] {
  return data.sections.map((section, i) => ({
    title: section.title,
    id: section.id,
    key: previous?.[i]?.key ?? section.id,
    articles: section.articles.map((article, j) => ({
      id: article.id,
      title: article.title,
      body: article.body,
      set_id: article.set_id,
      key: previous?.[i]?.articles[j]?.key ?? article.id,
    })),
  }));
}
type SaveRequest = { base: Detail; sections: Section[]; key: string };
const drafts = new Map<
  string,
  {
    base: Detail;
    sections: Section[];
    media: Record<string, ArticleMedia>;
    pending?: SaveRequest;
    reviewRequired?: boolean;
  }
>();
const ArticleWorkspace = lazy(async () => ({
  default: (await import('../features/article-editor/ArticleWorkspace')).ArticleWorkspace,
}));
export const courseLink =
  'text-primary inline-flex min-h-11 items-center rounded-lg underline focus-visible:outline focus-visible:outline-2';

export function CourseEditorPage({ saveTarget }: { saveTarget?: HTMLElement | null }) {
  const { courseId = '', articleId } = useParams();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const query = useQuery({
    queryKey: ['course-editor', courseId],
    queryFn: async () => {
      const result = await api.GET('/api/v1/courses/{course_id}/editor', {
        params: { path: { course_id: courseId } },
      });
      if (!result.data)
        throw new Error('Не удалось открыть редактор. Курс недоступен или нет соединения.');
      return result.data;
    },
  });
  return (
    <div className="space-y-6">
      {query.isPending && <p role="status">Загружаем редактор…</p>}
      {query.isError && (
        <div role="alert">
          {query.error.message}
          <Button onClick={() => void query.refetch()}>Повторить</Button>
        </div>
      )}
      {query.data && (
        <StructureForm
          key={`${userId}:${query.data.id}`}
          saveTarget={saveTarget}
          initial={query.data}
          userId={userId}
          articleId={articleId}
        />
      )}
    </div>
  );
}

function StructureForm({
  initial,
  userId,
  articleId,
  saveTarget,
}: {
  initial: Detail;
  userId: string | null;
  articleId?: string;
  saveTarget?: HTMLElement | null;
}) {
  const client = useQueryClient();
  const memoryKey = `${userId}:${initial.id}`;
  const draft = drafts.get(memoryKey);
  const writer = useRef(crypto.randomUUID());
  const restored = useRef<LocalArticleDraft[]>([]);
  const [localDrafts, setLocalDrafts] = useState(() =>
    userId ? readLocalArticleDrafts(userId, initial.id) : [],
  );
  const [localError, setLocalError] = useState(false);
  const [reviewRecovery, setReviewRecovery] = useState(draft?.reviewRequired ?? false);
  const recoveryReview = useRef(draft?.reviewRequired ?? false);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    const refresh = () => setLocalDrafts(userId ? readLocalArticleDrafts(userId, initial.id) : []);
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [userId, initial.id]);
  useEffect(() => {
    if (!userId) return;
    const serverArticles = initial.sections.flatMap((s) => s.articles);
    for (const local of readLocalArticleDrafts(userId, initial.id)) {
      const server = serverArticles.find((a) => a.id === local.articleId);
      if (server && sameArticle(local, { title: server.title, body: server.body ?? '' }))
        removeLocalArticleDraft(local);
    }
    setLocalDrafts(readLocalArticleDrafts(userId, initial.id));
  }, [userId, initial]);
  // Если менялись только настройки курса, черновик можно сохранить с новой ревизией.
  // При изменении самих разделов сервер проверит прежнюю ревизию и покажет конфликт.
  const [base, setBase] = useState(() =>
    draft && JSON.stringify(fromDetail(draft.base)) !== JSON.stringify(fromDetail(initial))
      ? draft.base
      : initial,
  );
  const [sections, setSections] = useState<Section[]>(() => draft?.sections ?? fromDetail(initial));
  const [dirty, setDirty] = useState(!!draft);
  const [notice, setNotice] = useState('');
  const request = useRef<SaveRequest | null>(draft?.pending ?? null);
  const savingRequest = useRef(false);
  const discarding = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Подписанные ссылки картинок из последней загрузки редактора плюс добавленные в этой сессии.
  const serverMedia = useMemo<Record<string, ArticleMedia>>(() => {
    const map: Record<string, ArticleMedia> = {};
    for (const s of initial.sections)
      for (const a of s.articles) for (const m of a.media ?? []) map[m.id] = m;
    return map;
  }, [initial]);
  const uploadedMedia = useRef<Record<string, ArticleMedia>>(draft?.media ?? {});
  const previewMedia = { ...uploadedMedia.current, ...serverMedia };
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty && !discarding.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    // Перехватываем также ссылки SPA: уход не должен молча терять текст статьи.
    const link = (event: MouseEvent) => {
      if (
        dirty &&
        event.button === 0 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        event.target instanceof Element &&
        !event.target.closest('.ProseMirror') &&
        event.target.closest('a[href]:not([target="_blank"])') &&
        !window.confirm('Изменения не сохранены. Уйти со страницы?')
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', link, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', link, true);
    };
  }, [dirty]);
  const sets = useQuery({
    queryKey: ['sets'],
    enabled: !articleId,
    queryFn: async () => {
      const result = await api.GET('/api/v1/sets');
      if (!result.data) throw new Error('Не удалось загрузить наборы');
      return result.data;
    },
  });
  const save = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      // После потери ответа повторяем тот же снимок с тем же ключом, затем отправляем новые правки.
      const snapshot = request.current ?? { base, sections, key: crypto.randomUUID() };
      request.current = snapshot;
      const currentDraft = drafts.get(memoryKey);
      if (currentDraft) drafts.set(memoryKey, { ...currentDraft, pending: snapshot });
      const body = {
        revision: snapshot.base.revision,
        sections: snapshot.sections.map(({ id, title, articles }) => ({
          id,
          title,
          articles: articles.map(({ id, title, body, set_id }) => ({ id, title, body, set_id })),
        })),
      };
      const result = await api.PUT('/api/v1/courses/{course_id}/structure', {
        params: {
          path: { course_id: snapshot.base.id },
          header: { 'idempotency-key': snapshot.key },
        },
        body,
        headers: { 'Idempotency-Key': snapshot.key },
      });
      if (!result.data) {
        const error = result.error as { code?: string; details?: { reason?: string } } | undefined;
        throw new CourseSaveError(
          error?.details?.reason === 'stale_revision'
            ? 'Курс изменился в другой вкладке или агентом. Скопируйте свой текст перед загрузкой актуальной версии.'
            : error?.code === 'CONFLICT'
              ? 'Проверьте видимость наборов и их привязку к другим статьям.'
              : 'Не удалось сохранить. Ваш текст остаётся в редакторе. Повторите попытку.',
          result.response.status >= 500 || result.response.status === 429,
        );
      }
      return { data: result.data, snapshot };
    },
    onSuccess: ({ data, snapshot }) => {
      const latest = drafts.get(memoryKey);
      const newer = latest && latest.sections !== snapshot.sections;
      const next = newer ? latest.sections : fromDetail(data, snapshot.sections);
      request.current =
        newer && !mounted.current ? { base: data, sections: next, key: crypto.randomUUID() } : null;
      if (newer)
        drafts.set(memoryKey, {
          ...latest,
          base: data,
          pending: request.current ?? undefined,
          reviewRequired: false,
        });
      else drafts.delete(memoryKey);
      // Нормализация названия на сервере не должна съедать пробел в конце слова во время набора.
      if (!newer && articleId) {
        const sent = snapshot.sections.flatMap((s) => s.articles).find((a) => a.id === articleId);
        const received = next.flatMap((s) => s.articles).find((a) => a.id === articleId);
        if (sent && received) received.title = sent.title;
      }
      if (userId) {
        const savedArticles = data.sections.flatMap((s) => s.articles);
        for (const local of readLocalArticleDrafts(userId, base.id)) {
          if (local.writer !== writer.current) continue;
          const saved = savedArticles.find((a) => a.id === local.articleId);
          if (!saved) continue;
          const text = { title: saved.title, body: saved.body ?? '' };
          const ok = sameArticle(local, text)
            ? removeLocalArticleDraft(local)
            : writeLocalArticleDraft({ ...local, base: text, needsReview: false });
          if (!ok) setLocalError(true);
        }
        for (const source of restored.current) {
          if (!removeLocalArticleDraft(source)) setLocalError(true);
        }
        restored.current = [];
      }
      recoveryReview.current = false;
      setReviewRecovery(false);
      if (!newer) setLocalError(false);
      setBase(data);
      setSections(next);
      setDirty(!!newer);
      setNotice(newer ? '' : articleId ? 'Материал сохранён' : 'Структура сохранена');
      client.setQueryData(['course-editor', base.id], data);
      client.setQueryData(['course', base.id], data);
      void client.invalidateQueries({ queryKey: ['courses'] });
      void client.invalidateQueries({ queryKey: ['sets'] });
    },
    onError: (error) => {
      if (!canRetrySave(error)) {
        request.current = null;
        const currentDraft = drafts.get(memoryKey);
        if (currentDraft) drafts.set(memoryKey, { ...currentDraft, pending: undefined });
      }
    },
    onSettled: (_data, error) => {
      savingRequest.current = false;
      // Завершаем очередь при уходе по общей навигации или кнопке браузера «Назад».
      if (!mounted.current && !error && request.current) persist();
    },
  });
  function persist() {
    if (savingRequest.current || !dirty) return;
    savingRequest.current = true;
    save.mutate();
  }
  function change(next: Section[]) {
    // Синхронная локальная запись переживает закрытие вкладки до сетевого автосохранения.
    if (userId && articleId) {
      const changed = next.flatMap((s) => s.articles).find((a) => a.id === articleId);
      const original = base.sections.flatMap((s) => s.articles).find((a) => a.id === articleId);
      if (changed && original)
        setLocalError(
          !writeLocalArticleDraft({
            version: 1,
            writer: writer.current,
            userId,
            courseId: base.id,
            articleId,
            title: changed.title,
            body: changed.body ?? '',
            base: { title: original.title, body: original.body ?? '' },
            updatedAt: Date.now(),
            needsReview: recoveryReview.current,
          }),
        );
    }
    drafts.set(memoryKey, {
      base,
      sections: next,
      media: uploadedMedia.current,
      pending: request.current ?? undefined,
      reviewRequired: recoveryReview.current,
    });
    setSections(next);
    setDirty(true);
    setNotice('');
  }
  const section = articleId
    ? sections.find((s) => s.articles.some((a) => a.id === articleId))
    : undefined;
  const selected = section?.articles.find((a) => a.id === articleId);
  const recoverable = localDrafts.filter((local) => {
    const server = initial.sections.flatMap((s) => s.articles).find((a) => a.id === articleId);
    return (
      local.articleId === articleId &&
      local.writer !== writer.current &&
      !restored.current.some(
        (source) => source.writer === local.writer && source.articleId === local.articleId,
      ) &&
      !!server &&
      !sameArticle(local, { title: server.title, body: server.body ?? '' })
    );
  });
  async function restoreLocal(local: LocalArticleDraft) {
    if (dirty && !window.confirm('Заменить текущие несохранённые правки выбранным черновиком?'))
      return;
    const server = base.sections.flatMap((s) => s.articles).find((a) => a.id === articleId);
    if (!server) return;
    setRestoring(true);
    await Promise.allSettled(
      articleMediaIds(local.body)
        .filter((id) => !previewMedia[id])
        .map(async (id) => {
          const result = await api.GET('/api/v1/media/{asset_id}', {
            params: { path: { asset_id: id } },
            signal: AbortSignal.timeout(10000),
          });
          if (result.data?.download_url)
            uploadedMedia.current[id] = {
              url: result.data.download_url,
              width: result.data.width,
              height: result.data.height,
            };
        }),
    );
    if (!mounted.current) return;
    setRestoring(false);
    recoveryReview.current =
      local.needsReview ||
      !sameArticle(local.base, { title: server.title, body: server.body ?? '' });
    setReviewRecovery(recoveryReview.current);
    restored.current.push(local);
    change(
      sections.map((s) => ({
        ...s,
        articles: s.articles.map((a) =>
          a.id === articleId ? { ...a, title: local.title, body: local.body } : a,
        ),
      })),
    );
    setLocalDrafts((items) =>
      items.filter((item) => item.writer !== local.writer || item.articleId !== local.articleId),
    );
  }
  function discardLocal(local: LocalArticleDraft) {
    if (!window.confirm('Удалить этот локальный черновик?')) return;
    if (!removeLocalArticleDraft(local)) {
      setLocalError(true);
      return;
    }
    setLocalDrafts((items) =>
      items.filter((item) => item.writer !== local.writer || item.articleId !== local.articleId),
    );
  }
  if (articleId && !selected)
    return (
      <Card>
        Материал не найден.{' '}
        <Link className={courseLink} to={`/courses/${base.id}/structure`}>
          К структуре курса
        </Link>
      </Card>
    );
  const error = save.isError && (
    <div role="alert" className="text-danger space-y-2">
      <p>
        {save.error instanceof TypeError
          ? 'Не удалось сохранить. Ваш текст остаётся в редакторе. Проверьте соединение и повторите попытку.'
          : save.error.message}
      </p>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          if (window.confirm('Загрузить актуальную версию? Несохранённые правки будут потеряны.')) {
            discarding.current = true;
            setDirty(false);
            window.location.reload();
          }
        }}
      >
        Загрузить актуальную версию
      </Button>
    </div>
  );
  if (selected && section)
    return (
      <div>
        <ArticleDraftRecovery
          drafts={recoverable}
          disabled={save.isPending || restoring}
          restore={(local) => void restoreLocal(local)}
          discard={discardLocal}
        />
        {localError && (
          <p role="alert" className="text-danger mb-4">
            Не удалось записать резервный черновик в этом браузере. Дождитесь сохранения на сервере
            перед закрытием страницы.
          </p>
        )}
        {reviewRecovery && (
          <p role="status" className="mb-4">
            Статья на сервере изменилась после создания черновика. Проверьте восстановленный текст и
            нажмите «Сохранить», чтобы применить его.
          </p>
        )}
        <Suspense fallback={<p role="status">Загружаем редактор статьи…</p>}>
          <ArticleWorkspace
            key={selected.key}
            courseId={base.id}
            sections={sections}
            article={selected}
            section={section}
            dirty={dirty}
            saving={save.isPending}
            restoring={restoring}
            saveFailed={save.isError}
            autoSaveBlocked={reviewRecovery || (save.isError && !canRetrySave(save.error))}
            notice={notice}
            error={error}
            media={previewMedia}
            addMedia={(id, m) => {
              uploadedMedia.current[id] = m;
            }}
            update={(patch) =>
              change(
                sections.map((s) =>
                  s.key !== section.key
                    ? s
                    : {
                        ...s,
                        articles: s.articles.map((a) =>
                          a.key === selected.key ? { ...a, ...patch } : a,
                        ),
                      },
                ),
              )
            }
            save={persist}
          />
        </Suspense>
      </div>
    );
  return (
    <div className="space-y-6">
      <form
        id="course-editor-form"
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          persist();
        }}
      >
        {error}
        <fieldset disabled={save.isPending} className="min-w-0 space-y-6">
          <CourseOutline
            sections={sections}
            change={change}
            courseId={base.id}
            sets={sets.data ?? []}
            dirty={dirty}
            saving={save.isPending}
            saveTarget={saveTarget}
            notice={notice}
          />{' '}
          {!articleId && sets.isError && (
            <p role="alert">
              Не удалось загрузить существующие наборы.{' '}
              <Button type="button" variant="ghost" onClick={() => void sets.refetch()}>
                Повторить загрузку наборов
              </Button>
            </p>
          )}
        </fieldset>
      </form>
      <CourseAttachments courseId={base.id} canEdit compact />
    </div>
  );
}
