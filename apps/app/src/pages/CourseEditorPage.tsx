import type { components } from '@remora/api-client';
import { type ArticleMedia, Button, Card } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { CourseOutline } from '../features/course-structure/CourseOutline';
import type { OutlineSection as Section } from '../features/course-structure/order';
import { CourseAttachments } from '../components/CourseAttachments';

type Detail = components['schemas']['CourseEditorDetail'];
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
const drafts = new Map<
  string,
  { base: Detail; sections: Section[]; media: Record<string, ArticleMedia> }
>();
const ArticleWorkspace = lazy(async () => ({
  default: (await import('../features/article-editor/ArticleWorkspace')).ArticleWorkspace,
}));
export const courseLink =
  'text-primary inline-flex min-h-11 items-center rounded-lg underline focus-visible:outline focus-visible:outline-2';

export function CourseEditorPage({ saveTarget }: { saveTarget?: HTMLElement | null }) {
  const { courseId = '', articleId } = useParams();
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
          key={`${query.data.id}:${articleId ?? 'structure'}`}
          saveTarget={saveTarget}
          initial={query.data}
          articleId={articleId}
        />
      )}
    </div>
  );
}

function StructureForm({
  initial,
  articleId,
  saveTarget,
}: {
  initial: Detail;
  articleId?: string;
  saveTarget?: HTMLElement | null;
}) {
  const client = useQueryClient();
  const draft = drafts.get(initial.id);
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
  const request = useRef<{ payload: string; key: string } | null>(null);
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
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    // Перехватываем также ссылки SPA: уход не должен молча терять текст статьи.
    const link = (event: MouseEvent) => {
      if (
        dirty &&
        event.target instanceof Element &&
        !event.target.closest('.ProseMirror') &&
        event.target.closest('a[href]') &&
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
    mutationFn: async () => {
      const body = {
        revision: base.revision,
        sections: sections.map(({ id, title, articles }) => ({
          id,
          title,
          articles: articles.map(({ id, title, body, set_id }) => ({ id, title, body, set_id })),
        })),
      };
      const payload = JSON.stringify(body);
      if (request.current?.payload !== payload)
        request.current = { payload, key: crypto.randomUUID() };
      const result = await api.PUT('/api/v1/courses/{course_id}/structure', {
        params: {
          path: { course_id: base.id },
          header: { 'idempotency-key': request.current.key },
        },
        body,
        headers: { 'Idempotency-Key': request.current.key },
      });
      if (!result.data) {
        const error = result.error as { code?: string; details?: { reason?: string } } | undefined;
        throw new Error(
          error?.details?.reason === 'stale_revision'
            ? 'Курс изменился в другой вкладке или агентом. Скопируйте свой текст перед загрузкой актуальной версии.'
            : error?.code === 'CONFLICT'
              ? 'Проверьте видимость наборов и их привязку к другим статьям.'
              : 'Не удалось сохранить. Ваш текст остаётся в редакторе. Повторите попытку.',
        );
      }
      return result.data;
    },
    onSuccess: (data) => {
      drafts.delete(base.id);
      setBase(data);
      setSections(fromDetail(data, sections));
      setDirty(false);
      setNotice(articleId ? 'Материал сохранён' : 'Структура сохранена');
      client.setQueryData(['course-editor', base.id], data);
      client.setQueryData(['course', base.id], data);
      void client.invalidateQueries({ queryKey: ['courses'] });
      void client.invalidateQueries({ queryKey: ['sets'] });
    },
  });
  function change(next: Section[]) {
    // Черновик живёт в памяти вкладки и переживает переход назад без записи теории на диск.
    drafts.set(base.id, { base, sections: next, media: uploadedMedia.current });
    setSections(next);
    setDirty(true);
    setNotice('');
    save.reset();
  }
  const section = articleId
    ? sections.find((s) => s.articles.some((a) => a.id === articleId))
    : undefined;
  const selected = section?.articles.find((a) => a.id === articleId);
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
      <Suspense fallback={<p role="status">Загружаем редактор статьи…</p>}>
        <ArticleWorkspace
          courseId={base.id}
          sections={sections}
          article={selected}
          section={section}
          dirty={dirty}
          saving={save.isPending}
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
          save={() => {
            if (!save.isPending && dirty) save.mutate();
          }}
        />
      </Suspense>
    );
  return (
    <div className="space-y-6">
      <form
        id="course-editor-form"
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !save.isPending) save.mutate();
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
