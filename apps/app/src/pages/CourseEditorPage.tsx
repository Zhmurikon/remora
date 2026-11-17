import type { components } from '@remora/api-client';
import { ArticleContent, type ArticleMedia, Button, Card, Input } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { CourseOutline } from '../features/course-structure/CourseOutline';
import type { OutlineSection as Section } from '../features/course-structure/order';
import { CourseAttachments } from '../components/CourseAttachments';

type Detail = components['schemas']['CourseEditorDetail'];
function fromDetail(data: Detail, previous?: Section[]): Section[] {
  return data.sections.map((section, i) => ({
    ...section,
    key: previous?.[i]?.key ?? section.id,
    articles: section.articles.map((article, j) => ({
      ...article,
      key: previous?.[i]?.articles[j]?.key ?? article.id,
    })),
  }));
}
const drafts = new Map<string, { base: Detail; sections: Section[] }>();
const field =
  'border-border bg-surface min-h-11 w-full rounded-xl border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';
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
      {articleId && (
        <Link to={`/courses/${courseId}`} className={courseLink}>
          К курсу
        </Link>
      )}
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
  const navigate = useNavigate();
  const draft = drafts.get(initial.id);
  // Если менялись только настройки курса, черновик можно сохранить с новой ревизией.
  // При изменении самих разделов сервер проверит прежнюю ревизию и покажет конфликт.
  const [base, setBase] = useState(() =>
    draft && JSON.stringify(draft.base.sections) !== JSON.stringify(initial.sections)
      ? draft.base
      : initial,
  );
  const [sections, setSections] = useState<Section[]>(() => draft?.sections ?? fromDetail(initial));
  const [dirty, setDirty] = useState(!!draft);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState('');
  const request = useRef<{ payload: string; key: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Подписанные ссылки картинок из последней загрузки редактора плюс добавленные в этой сессии.
  const serverMedia = useMemo<Record<string, ArticleMedia>>(() => {
    const map: Record<string, ArticleMedia> = {};
    for (const s of initial.sections)
      for (const a of s.articles) for (const m of a.media ?? []) map[m.id] = m;
    return map;
  }, [initial]);
  const [uploadedMedia, setUploadedMedia] = useState<Record<string, ArticleMedia>>({});
  const previewMedia = { ...serverMedia, ...uploadedMedia };
  function insertImageMarker(id: string) {
    const marker = `\n\n![](media:${id})\n\n`;
    const current =
      sections.flatMap((s) => s.articles ?? []).find((a) => a.id === articleId)?.body ?? '';
    const area = textareaRef.current;
    const start = area?.selectionStart ?? current.length;
    const end = area?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + marker + current.slice(end);
    change(
      sections.map((s) => ({
        ...s,
        articles: s.articles.map((a) => (a.id === articleId ? { ...a, body: next } : a)),
      })),
    );
  }
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
    drafts.set(base.id, { base, sections: next });
    setSections(next);
    setDirty(true);
    setNotice('');
    save.reset();
  }
  function updateSection(index: number, patch: Partial<Section>) {
    change(sections.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  const selected = sections.flatMap((s) => s.articles ?? []).find((a) => a.id === articleId);
  if (articleId && !selected)
    return (
      <Card>
        Материал не найден.{' '}
        <Link className={courseLink} to={`/courses/${base.id}/structure`}>
          К структуре курса
        </Link>
      </Card>
    );
  return (
    <div className="space-y-6">
      {articleId && (
        <>
          <nav
            aria-label="Управление курсом"
            className="border-border flex flex-wrap gap-5 border-b pb-3"
          >
            <Link className={courseLink} to={`/courses/${base.id}/read`}>
              Читать курс
            </Link>
            <Link className={courseLink} to={`/courses/${base.id}/structure`}>
              Структура курса
            </Link>
            <Link className={courseLink} to={`/courses/${base.id}/edit`}>
              Настройки и публикация
            </Link>
          </nav>
          <header>
            <p className="text-fg-muted">{base.title}</p>
            <h1 className="text-3xl font-semibold">Редактор материала</h1>
            <p className="text-fg-muted mt-2">
              Напишите теорию, проверьте её вид и подготовьте карточки для квиза.
            </p>
          </header>
        </>
      )}
      {articleId && (
        <label className="block max-w-xl space-y-2">
          <span className="text-fg-muted text-sm">Материал курса</span>
          <select
            className={field}
            value={articleId}
            onChange={(event) => {
              if (dirty && !window.confirm('Изменения не сохранены. Перейти к другому материалу?'))
                return;
              navigate(`/courses/${base.id}/materials/${event.target.value}/edit`);
            }}
          >
            {sections.map((s) => (
              <optgroup key={s.key} label={s.title}>
                {s.articles
                  ?.filter((a) => a.id)
                  .map((a) => (
                    <option key={a.id} value={a.id!}>
                      {a.title}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      <form
        id="course-editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (dirty && !save.isPending) save.mutate();
        }}
        className={articleId ? 'max-w-4xl space-y-6' : 'space-y-6'}
      >
        {articleId && (
          <div className="border-border bg-bg sticky top-16 z-10 flex flex-wrap items-center gap-3 border-b py-3 lg:top-0">
            <Button
              className="min-h-11"
              type="submit"
              loading={save.isPending}
              disabled={!dirty || save.isPending}
            >
              Сохранить материал
            </Button>
            <Button
              className="min-h-11"
              type="button"
              variant="secondary"
              onClick={() => setPreview(!preview)}
            >
              {preview ? 'Продолжить редактирование' : 'Предпросмотр теории'}
            </Button>
            <span role="status">
              {save.isPending ? 'Сохраняем…' : dirty ? 'Есть несохранённые изменения' : notice}
            </span>
          </div>
        )}
        {save.isError && (
          <div role="alert" className="text-danger space-y-2">
            <p>{save.error.message}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (
                  window.confirm(
                    'Загрузить актуальную версию? Несохранённые правки будут потеряны.',
                  )
                ) {
                  setDirty(false);
                  window.location.reload();
                }
              }}
            >
              Загрузить актуальную версию
            </Button>
          </div>
        )}
        <fieldset disabled={save.isPending} className="min-w-0 space-y-6">
          {!articleId ? (
            <CourseOutline
              sections={sections}
              change={change}
              courseId={base.id}
              sets={sets.data ?? []}
              dirty={dirty}
              saving={save.isPending}
              saveTarget={saveTarget}
              notice={notice}
            />
          ) : (
            sections.map((section, si) =>
              section.articles.map(
                (article, ai) =>
                  article.id === articleId && (
                    <Card key={article.key} className="min-w-0 space-y-4">
                      <Input
                        label={`Статья ${si + 1}.${ai + 1}`}
                        className="min-h-11"
                        required
                        maxLength={160}
                        value={article.title}
                        onChange={(e) =>
                          updateSection(si, {
                            articles: section.articles.map((a, i) =>
                              i === ai ? { ...a, title: e.target.value } : a,
                            ),
                          })
                        }
                      />
                      {preview ? (
                        <ArticleContent
                          value={article.body ?? ''}
                          headingLevel={2}
                          media={previewMedia}
                        />
                      ) : (
                        <>
                          <MaterialImageButton
                            onUploaded={(id, media) => {
                              setUploadedMedia((prev) => ({ ...prev, [id]: media }));
                              insertImageMarker(id);
                            }}
                          />
                          <label className="block space-y-2">
                            <span>
                              Теория статьи {si + 1}.{ai + 1}
                            </span>
                            <textarea
                              ref={textareaRef}
                              className={field}
                              rows={22}
                              maxLength={100000}
                              value={article.body ?? ''}
                              onChange={(e) =>
                                updateSection(si, {
                                  articles: section.articles.map((a, i) =>
                                    i === ai ? { ...a, body: e.target.value } : a,
                                  ),
                                })
                              }
                            />
                            <span className="text-fg-muted block text-sm">
                              Разметка Markdown: # заголовки, **жирный** и *курсив*, списки и
                              нумерация, таблицы, цитаты через «&gt;», разделитель «---», ссылки,
                              изображения, формулы $…$ и $$…$$, блоки кода с указанием языка.
                            </span>
                          </label>
                        </>
                      )}
                      <Link className={courseLink} to={`/sets/${article.set_id}/edit`}>
                        Редактировать карточки
                      </Link>
                    </Card>
                  ),
              ),
            )
          )}
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
      <CourseAttachments courseId={base.id} articleId={articleId} canEdit compact={!articleId} />
    </div>
  );
}

function MaterialImageButton({
  onUploaded,
}: {
  onUploaded: (id: string, media: ArticleMedia) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  async function upload(file: File) {
    setUploading(true);
    setError('');
    try {
      const ticket = await api.POST('/api/v1/media/upload-url', {
        body: { filename: file.name, mime: file.type, size_bytes: file.size },
      });
      if (ticket.error || !ticket.data) throw new Error();
      const put = await fetch(ticket.data.upload_url, {
        method: ticket.data.method,
        headers: ticket.data.headers,
        body: file,
      });
      if (!put.ok) throw new Error();
      const done = await api.POST('/api/v1/media/{asset_id}/complete', {
        params: { path: { asset_id: ticket.data.id } },
      });
      if (done.error || !done.data?.download_url) throw new Error();
      onUploaded(done.data.id, {
        url: done.data.download_url,
        width: done.data.width,
        height: done.data.height,
      });
    } catch {
      setError('Не удалось загрузить изображение. Поддерживаются JPEG, PNG, WebP, GIF и SVG.');
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="space-y-2">
      <label className="border-border text-fg hover:bg-surface-muted inline-flex h-11 cursor-pointer items-center rounded-xl border px-4 text-sm font-medium">
        {uploading ? 'Загружаем…' : '＋ Вставить изображение'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = '';
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
