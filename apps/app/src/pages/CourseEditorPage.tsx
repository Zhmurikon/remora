import type { components } from '@remora/api-client';
import { ArticleContent, type ArticleMedia, Button, Card, Input } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';

type Detail = components['schemas']['CourseEditorDetail'];
type Section = components['schemas']['SectionWrite'] & { key: string };
const drafts = new Map<string, { base: Detail; sections: Section[] }>();
const field =
  'border-border bg-surface min-h-11 w-full rounded-xl border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';
export const courseLink =
  'text-primary inline-flex min-h-11 items-center rounded-lg underline focus-visible:outline focus-visible:outline-2';

export function CourseEditorPage() {
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
      <Link to={`/courses/${courseId}`} className={courseLink}>
        К курсу
      </Link>
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
          initial={query.data}
          articleId={articleId}
        />
      )}
    </div>
  );
}

function StructureForm({ initial, articleId }: { initial: Detail; articleId?: string }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [base, setBase] = useState(drafts.get(initial.id)?.base ?? initial);
  const fromDetail = (data: Detail): Section[] => data.sections.map((s) => ({ ...s, key: s.id }));
  const [sections, setSections] = useState<Section[]>(
    () => drafts.get(initial.id)?.sections ?? fromDetail(initial),
  );
  const [dirty, setDirty] = useState(drafts.has(initial.id));
  const [preview, setPreview] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
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
        articles: s.articles?.map((a) => (a.id === articleId ? { ...a, body: next } : a)),
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
    queryFn: async () => {
      const result = await api.GET('/api/v1/sets');
      if (!result.data) throw new Error('Не удалось загрузить наборы');
      return result.data;
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const body = { revision: base.revision, sections: sections.map(({ key: _key, ...s }) => s) };
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
              ? 'Проверьте, что курс снят с публикации, а выбранные наборы не входят в другие статьи.'
              : 'Не удалось сохранить. Ваш текст остаётся в редакторе. Повторите попытку.',
        );
      }
      return result.data;
    },
    onSuccess: (data) => {
      drafts.delete(base.id);
      setBase(data);
      setSections(fromDetail(data));
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
  function moveSection(index: number, delta: number) {
    const next = [...sections];
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    change(next);
  }
  const articleCount = sections.reduce((n, s) => n + (s.articles?.length ?? 0), 0);
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
      <nav
        aria-label="Управление курсом"
        className="border-border flex flex-wrap gap-5 border-b pb-3"
      >
        <Link className={courseLink} to={`/courses/${base.id}/read`}>
          Читать курс
        </Link>
        <Link
          className={courseLink}
          aria-current={!articleId ? 'page' : undefined}
          to={`/courses/${base.id}/structure`}
        >
          Структура курса
        </Link>
        <Link className={courseLink} to={`/courses/${base.id}/edit`}>
          Настройки и публикация
        </Link>
      </nav>
      <header>
        <p className="text-fg-muted">{base.title}</p>
        <h1 className="text-3xl font-semibold">
          {articleId ? 'Редактор материала' : 'Структура курса'}
        </h1>
        <p className="text-fg-muted mt-2">
          {articleId
            ? 'Напишите теорию, проверьте её вид и подготовьте карточки для квиза.'
            : 'Соберите разделы и уроки в нужном порядке. Теория каждого урока редактируется отдельно.'}
        </p>
      </header>
      {base.is_published && (
        <p role="alert">
          Для редактирования структуры снимите курс с публикации в настройках курса.
        </p>
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
        onSubmit={(event) => {
          event.preventDefault();
          if (!save.isPending) save.mutate();
        }}
        className={articleId ? 'max-w-4xl space-y-6' : 'space-y-6'}
      >
        <div className="border-border bg-bg sticky top-16 z-10 flex flex-wrap items-center gap-3 border-b py-3 lg:top-0">
          <Button
            className="min-h-11"
            type="submit"
            loading={save.isPending}
            disabled={!dirty || base.is_published}
          >
            {articleId ? 'Сохранить материал' : 'Сохранить структуру'}
          </Button>
          {articleId && (
            <Button
              className="min-h-11"
              type="button"
              variant="secondary"
              onClick={() => setPreview(!preview)}
            >
              {preview ? 'Продолжить редактирование' : 'Предпросмотр теории'}
            </Button>
          )}
          <span role="status">
            {save.isPending ? 'Сохраняем…' : dirty ? 'Есть несохранённые изменения' : notice}
          </span>
        </div>
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
        <fieldset disabled={save.isPending || base.is_published} className="min-w-0 space-y-6">
          {sections.length === 0 && (
            <Card>В курсе пока нет разделов. Добавьте первый раздел и статью.</Card>
          )}
          {sections.map((section, si) =>
            articleId && !section.articles?.some((a) => a.id === articleId) ? null : (
              <Card key={section.key} className="min-w-0 space-y-5">
                {!articleId && (
                  <>
                    <Input
                      label={`Название раздела ${si + 1}`}
                      required
                      maxLength={160}
                      className="min-h-11"
                      value={section.title}
                      onChange={(e) => updateSection(si, { title: e.target.value })}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-11"
                        disabled={si === 0}
                        onClick={() => moveSection(si, -1)}
                      >
                        Раздел выше
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-11"
                        disabled={si === sections.length - 1}
                        onClick={() => moveSection(si, 1)}
                      >
                        Раздел ниже
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-11"
                        onClick={() => setConfirmRemove(section.key)}
                      >
                        Удалить раздел
                      </Button>
                    </div>
                    {confirmRemove === section.key && (
                      <div className="space-y-3">
                        <p>
                          Удалить раздел и тексты его статей из курса? Наборы карточек останутся в
                          вашей библиотеке. Изменение применится после сохранения.
                        </p>
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => {
                            change(sections.filter((_, i) => i !== si));
                            setConfirmRemove(null);
                          }}
                        >
                          Подтвердить удаление раздела
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setConfirmRemove(null)}
                        >
                          Отмена
                        </Button>
                      </div>
                    )}
                  </>
                )}
                {(section.articles ?? []).map((article, ai) =>
                  articleId && article.id !== articleId ? null : (
                    <div
                      key={article.id ?? `new-${ai}`}
                      className="border-border min-w-0 space-y-4 border-t pt-5"
                    >
                      <Input
                        label={`Статья ${si + 1}.${ai + 1}`}
                        className="min-h-11"
                        required
                        maxLength={160}
                        value={article.title}
                        onChange={(e) =>
                          updateSection(si, {
                            articles: section.articles?.map((a, i) =>
                              i === ai ? { ...a, title: e.target.value } : a,
                            ),
                          })
                        }
                      />
                      {articleId &&
                        (preview ? (
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
                                    articles: section.articles?.map((a, i) =>
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
                        ))}
                      {!articleId && article.id && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-fg-muted text-sm">
                            {article.body?.trim() ? 'Теория добавлена' : 'Теория пока не добавлена'}{' '}
                            · Квиз по карточкам
                          </p>
                          <Link
                            className={courseLink}
                            to={`/courses/${base.id}/materials/${article.id}/edit`}
                          >
                            Редактировать материал
                          </Link>
                        </div>
                      )}
                      {!article.id ? (
                        <label className="block space-y-2">
                          <span>
                            Набор для статьи {si + 1}.{ai + 1}
                          </span>
                          <select
                            className={field}
                            value={article.set_id ?? ''}
                            onChange={(e) =>
                              updateSection(si, {
                                articles: section.articles?.map((a, i) =>
                                  i === ai ? { ...a, set_id: e.target.value || null } : a,
                                ),
                              })
                            }
                          >
                            <option value="">Создать новый пустой набор</option>
                            {sets.data?.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.title}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <Link className={courseLink} to={`/sets/${article.set_id}/edit`}>
                          Редактировать карточки
                        </Link>
                      )}
                      {!articleId && (
                        <>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              className="min-h-11"
                              disabled={ai === 0}
                              onClick={() => {
                                const next = [...(section.articles ?? [])];
                                [next[ai], next[ai - 1]] = [next[ai - 1]!, next[ai]!];
                                updateSection(si, { articles: next });
                              }}
                            >
                              Статья выше
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="min-h-11"
                              disabled={ai === (section.articles?.length ?? 0) - 1}
                              onClick={() => {
                                const next = [...(section.articles ?? [])];
                                [next[ai], next[ai + 1]] = [next[ai + 1]!, next[ai]!];
                                updateSection(si, { articles: next });
                              }}
                            >
                              Статья ниже
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="min-h-11"
                              onClick={() => setConfirmRemove(`${section.key}:${ai}`)}
                            >
                              Удалить статью
                            </Button>
                          </div>
                          <label className="block space-y-2">
                            <span>
                              Раздел статьи {si + 1}.{ai + 1}
                            </span>
                            <select
                              className={field}
                              value={section.key}
                              onChange={(e) =>
                                change(
                                  sections.map((s) =>
                                    s.key === section.key
                                      ? { ...s, articles: s.articles?.filter((_, i) => i !== ai) }
                                      : s.key === e.target.value
                                        ? { ...s, articles: [...(s.articles ?? []), article] }
                                        : s,
                                  ),
                                )
                              }
                            >
                              {sections.map((s) => (
                                <option key={s.key} value={s.key}>
                                  {s.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          {confirmRemove === `${section.key}:${ai}` && (
                            <div className="space-y-3">
                              <p>
                                Текст статьи будет удалён из курса после сохранения. Набор карточек
                                останется.
                              </p>
                              <Button
                                type="button"
                                variant="danger"
                                onClick={() => {
                                  updateSection(si, {
                                    articles: section.articles?.filter((_, i) => i !== ai),
                                  });
                                  setConfirmRemove(null);
                                }}
                              >
                                Подтвердить удаление статьи
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setConfirmRemove(null)}
                              >
                                Отмена
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ),
                )}
                {!articleId && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11"
                    disabled={articleCount >= 100}
                    onClick={() =>
                      updateSection(si, {
                        articles: [
                          ...(section.articles ?? []),
                          { title: 'Новая статья', body: '' },
                        ],
                      })
                    }
                  >
                    Добавить статью
                  </Button>
                )}
              </Card>
            ),
          )}
          {!articleId && (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={sections.length >= 50}
              onClick={() =>
                change([
                  ...sections,
                  { key: crypto.randomUUID(), title: 'Новый раздел', articles: [] },
                ])
              }
            >
              Добавить раздел
            </Button>
          )}
          {sets.isError && (
            <p role="alert">
              Не удалось загрузить существующие наборы.{' '}
              <Button type="button" variant="ghost" onClick={() => void sets.refetch()}>
                Повторить загрузку наборов
              </Button>
            </p>
          )}
        </fieldset>
      </form>
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
