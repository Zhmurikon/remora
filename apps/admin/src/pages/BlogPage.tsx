import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArticleContent } from '@remora/ui';
import { Button, Card, Input } from '@remora/ui/base';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AdminActionConfirmation } from '../features/security/AdminActionConfirmation';
import { api, getErrorMessage } from '../lib/api';

type BlogState = 'draft' | 'scheduled' | 'published';
type Tone = 'mint' | 'lavender' | 'peach';

interface BlogSection {
  id: string;
  title: string;
  paragraphs: string[];
  rich_text: string;
  steps: string[];
  example: { question: string; answer: string } | null;
}

interface BlogSource {
  title: string;
  url: string;
}

interface BlogItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  state: BlogState;
  revision: number;
  author_username: string;
  published_at: string | null;
  updated_at: string;
}

interface BlogDetail extends BlogItem {
  status: 'draft' | 'scheduled' | 'published';
  tone: Tone;
  diagram: [string, string, string];
  cover_media_id: string | null;
  cover_alt: string | null;
  sections: BlogSection[];
  sources: BlogSource[];
  related: string[];
  history: Array<{
    id: string;
    action: string;
    actor_username: string | null;
    reason: string | null;
    created_at: string;
  }>;
}

interface BlogList {
  items: BlogItem[];
  total: number;
  offset: number;
  limit: number;
}

interface EditorState {
  id: string | null;
  revision: number | null;
  state: BlogState;
  slug: string;
  title: string;
  description: string;
  category: string;
  tone: Tone;
  diagram: [string, string, string];
  cover_media_id: string;
  cover_alt: string;
  sections: BlogSection[];
  sources: BlogSource[];
  related: string;
}

const PAGE_SIZE = 25;

function emptySection(): BlogSection {
  return {
    id: 'razdel',
    title: 'Новый раздел',
    paragraphs: [],
    rich_text: '',
    steps: [],
    example: null,
  };
}

function emptyEditor(): EditorState {
  return {
    id: null,
    revision: null,
    state: 'draft',
    slug: '',
    title: '',
    description: '',
    category: '',
    tone: 'mint',
    diagram: ['Тема', 'Практика', 'Повторение'],
    cover_media_id: '',
    cover_alt: '',
    sections: [emptySection()],
    sources: [],
    related: '',
  };
}

function editorFromDetail(post: BlogDetail): EditorState {
  return {
    id: post.id,
    revision: post.revision,
    state: post.state,
    slug: post.slug,
    title: post.title,
    description: post.description,
    category: post.category,
    tone: post.tone,
    diagram: post.diagram,
    cover_media_id: post.cover_media_id ?? '',
    cover_alt: post.cover_alt ?? '',
    sections: post.sections,
    sources: post.sources,
    related: post.related.join('\n'),
  };
}

export function BlogPage() {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<BlogState | ''>('');
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [pendingAction, setPendingAction] = useState<'publish' | 'schedule' | 'unpublish' | null>(
    null,
  );

  const posts = useQuery({
    queryKey: ['admin', 'blog', query, status, offset],
    queryFn: async () => {
      const { data, error: apiError } = await api.GET('/api/v1/admin/blog/posts', {
        params: {
          query: {
            query: query || undefined,
            status: status || undefined,
            offset,
            limit: PAGE_SIZE,
          },
        },
      });
      if (!data) throw new Error(getErrorMessage(apiError, 'Не удалось загрузить статьи'));
      return data as BlogList;
    },
    placeholderData: (previous) => previous,
  });

  const detail = useQuery({
    queryKey: ['admin', 'blog', selectedId],
    enabled: selectedId !== null,
    queryFn: async () => {
      const { data, error: apiError } = await api.GET('/api/v1/admin/blog/posts/{post_id}', {
        params: { path: { post_id: selectedId! } },
      });
      if (!data) throw new Error(getErrorMessage(apiError, 'Не удалось загрузить статью'));
      return data as BlogDetail;
    },
  });

  useEffect(() => {
    if (detail.data) setEditor(editorFromDetail(detail.data));
  }, [detail.data]);

  const editing = creating || selectedId !== null;
  const previewText = useMemo(
    () =>
      editor.sections.map((section) => `## ${section.title}\n\n${section.rich_text}`).join('\n\n'),
    [editor.sections],
  );

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setQuery(input.trim());
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);
    const body = {
      slug: editor.slug.trim(),
      title: editor.title.trim(),
      description: editor.description.trim(),
      category: editor.category.trim(),
      tone: editor.tone,
      diagram: editor.diagram,
      cover_media_id: editor.cover_media_id.trim() || null,
      cover_alt: editor.cover_alt.trim() || null,
      sections: editor.sections,
      sources: editor.sources.filter((source) => source.title.trim() && source.url.trim()),
      related: editor.related
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean),
    };
    try {
      const headers = { 'Idempotency-Key': crypto.randomUUID() };
      const response = editor.id
        ? await api.PUT('/api/v1/admin/blog/posts/{post_id}', {
            params: { path: { post_id: editor.id }, header: headers },
            body: { ...body, revision: editor.revision! },
          })
        : await api.POST('/api/v1/admin/blog/posts', { params: { header: headers }, body });
      if (!response.data)
        throw new Error(getErrorMessage(response.error, 'Не удалось сохранить статью'));
      const saved = response.data as BlogDetail;
      setCreating(false);
      setSelectedId(saved.id);
      setEditor(editorFromDetail(saved));
      setMessage('Черновик сохранён.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'blog'] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить статью.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadCover(file: File) {
    setUploading(true);
    setError(null);
    try {
      const dataBase64 = await fileBase64(file);
      const { data, error: apiError } = await api.POST('/api/v1/admin/blog/media', {
        params: { header: { 'Idempotency-Key': crypto.randomUUID() } },
        body: {
          data_base64: dataBase64,
          mime: file.type,
          filename: file.name,
          alt: editor.cover_alt,
        },
      });
      if (!data) throw new Error(getErrorMessage(apiError, 'Не удалось загрузить обложку'));
      setEditor((value) => ({ ...value, cover_media_id: data.id }));
      setMessage('Обложка загружена. Сохраните черновик.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить обложку.');
    } finally {
      setUploading(false);
    }
  }

  async function publication(confirmation: string, reason: string) {
    if (!editor.id || !editor.revision || !pendingAction) return;
    const action = pendingAction;
    const publishAt = action === 'schedule' ? new Date(scheduleAt).toISOString() : undefined;
    const { data, error: apiError } = await api.POST(
      '/api/v1/admin/blog/posts/{post_id}/publication',
      {
        params: {
          path: { post_id: editor.id },
          header: { 'X-Admin-Confirmation': confirmation, 'Idempotency-Key': crypto.randomUUID() },
        },
        body: { action, revision: editor.revision, reason, publish_at: publishAt },
      },
    );
    if (!data) throw new Error(getErrorMessage(apiError, 'Не удалось изменить публикацию'));
    const changed = data as BlogDetail;
    setEditor(editorFromDetail(changed));
    setPendingAction(null);
    setMessage(
      action === 'unpublish'
        ? 'Статья снята с публикации.'
        : action === 'schedule'
          ? 'Публикация запланирована.'
          : 'Статья опубликована.',
    );
    await queryClient.invalidateQueries({ queryKey: ['admin', 'blog'] });
  }

  if (editing) {
    return (
      <section aria-labelledby="blog-editor-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button
              type="button"
              className="text-primary min-h-11 font-medium"
              onClick={() => {
                setCreating(false);
                setSelectedId(null);
                setEditor(emptyEditor());
              }}
            >
              ← К списку статей
            </button>
            <h1 id="blog-editor-title" className="mt-2 text-3xl font-semibold tracking-tight">
              {editor.id ? 'Редактирование статьи' : 'Новая статья'}
            </h1>
            <p className="text-fg-muted mt-2">Черновик, SEO, обложка и публичный предпросмотр.</p>
          </div>
          {editor.id && editor.state === 'published' ? (
            <a
              className="text-primary inline-flex min-h-11 items-center font-medium underline underline-offset-4"
              href={`https://zapominalnya.ru/blog/${editor.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              Открыть на сайте
            </a>
          ) : null}
        </div>

        {detail.isPending && selectedId ? (
          <p className="text-fg-muted mt-7">Загружаем статью…</p>
        ) : (
          <form className="mt-7 space-y-7" onSubmit={(event) => void save(event)}>
            <Card className="p-5 shadow-none">
              <h2 className="text-xl font-semibold">Основное и SEO</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Input
                  label="Заголовок"
                  required
                  maxLength={180}
                  value={editor.title}
                  onChange={(event) => setEditor({ ...editor, title: event.target.value })}
                />
                <Input
                  label="Адрес статьи"
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  value={editor.slug}
                  onChange={(event) => setEditor({ ...editor, slug: event.target.value })}
                />
                <Input
                  label="Рубрика"
                  required
                  maxLength={80}
                  value={editor.category}
                  onChange={(event) => setEditor({ ...editor, category: event.target.value })}
                />
                <label className="text-sm font-medium">
                  Тон обложки
                  <select
                    className="border-border bg-surface mt-1 min-h-11 w-full rounded-md border px-3"
                    value={editor.tone}
                    onChange={(event) => setEditor({ ...editor, tone: event.target.value as Tone })}
                  >
                    <option value="mint">Мятный</option>
                    <option value="lavender">Лавандовый</option>
                    <option value="peach">Персиковый</option>
                  </select>
                </label>
              </div>
              <label className="mt-4 block text-sm font-medium">
                SEO-описание
                <textarea
                  className="border-border bg-surface mt-1 min-h-24 w-full rounded-md border px-3 py-2"
                  required
                  maxLength={500}
                  value={editor.description}
                  onChange={(event) => setEditor({ ...editor, description: event.target.value })}
                />
              </label>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {editor.diagram.map((value, index) => (
                  <Input
                    key={index}
                    label={`Шаг схемы ${index + 1}`}
                    required
                    value={value}
                    onChange={(event) => {
                      const diagram = [...editor.diagram] as [string, string, string];
                      diagram[index] = event.target.value;
                      setEditor({ ...editor, diagram });
                    }}
                  />
                ))}
              </div>
            </Card>

            <Card className="p-5 shadow-none">
              <h2 className="text-xl font-semibold">Обложка</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input
                  label="Описание изображения"
                  maxLength={300}
                  value={editor.cover_alt}
                  onChange={(event) => setEditor({ ...editor, cover_alt: event.target.value })}
                />
                <Input
                  label="Идентификатор изображения"
                  value={editor.cover_media_id}
                  onChange={(event) => setEditor({ ...editor, cover_media_id: event.target.value })}
                />
              </div>
              <label className="border-border mt-4 flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-4 text-sm font-medium">
                {uploading ? 'Загружаем…' : 'Загрузить обложку'}
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadCover(file);
                  }}
                />
              </label>
            </Card>

            <Card className="p-5 shadow-none">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Разделы</h2>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setEditor({
                      ...editor,
                      sections: [
                        ...editor.sections,
                        { ...emptySection(), id: `razdel-${editor.sections.length + 1}` },
                      ],
                    })
                  }
                >
                  Добавить раздел
                </Button>
              </div>
              <div className="mt-5 space-y-5">
                {editor.sections.map((section, index) => (
                  <div key={index} className="border-border rounded-lg border p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input
                        label="Якорь"
                        required
                        value={section.id}
                        onChange={(event) =>
                          updateSection(editor, setEditor, index, { id: event.target.value })
                        }
                      />
                      <Input
                        label="Заголовок раздела"
                        required
                        value={section.title}
                        onChange={(event) =>
                          updateSection(editor, setEditor, index, { title: event.target.value })
                        }
                      />
                    </div>
                    <label className="mt-3 block text-sm font-medium">
                      Текст Markdown
                      <textarea
                        className="border-border bg-surface mt-1 min-h-64 w-full rounded-md border px-3 py-2 font-mono text-sm"
                        value={section.rich_text}
                        onChange={(event) =>
                          updateSection(editor, setEditor, index, { rich_text: event.target.value })
                        }
                      />
                    </label>
                    {editor.sections.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-danger mt-3"
                        onClick={() =>
                          setEditor({
                            ...editor,
                            sections: editor.sections.filter(
                              (_, sectionIndex) => sectionIndex !== index,
                            ),
                          })
                        }
                      >
                        Удалить раздел
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>

            <div className="grid gap-7 xl:grid-cols-2">
              <Card className="p-5 shadow-none">
                <h2 className="text-xl font-semibold">Связи и источники</h2>
                <label className="mt-4 block text-sm font-medium">
                  Связанные статьи, по одному slug в строке
                  <textarea
                    className="border-border bg-surface mt-1 min-h-28 w-full rounded-md border px-3 py-2"
                    value={editor.related}
                    onChange={(event) => setEditor({ ...editor, related: event.target.value })}
                  />
                </label>
                {editor.sources.map((source, index) => (
                  <div key={index} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      label="Название источника"
                      value={source.title}
                      onChange={(event) =>
                        updateSource(editor, setEditor, index, { title: event.target.value })
                      }
                    />
                    <Input
                      label="HTTPS-ссылка"
                      type="url"
                      value={source.url}
                      onChange={(event) =>
                        updateSource(editor, setEditor, index, { url: event.target.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="self-end"
                      onClick={() =>
                        setEditor({
                          ...editor,
                          sources: editor.sources.filter((_, sourceIndex) => sourceIndex !== index),
                        })
                      }
                    >
                      Убрать
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-4"
                  onClick={() =>
                    setEditor({ ...editor, sources: [...editor.sources, { title: '', url: '' }] })
                  }
                >
                  Добавить источник
                </Button>
              </Card>
              <Card className="p-5 shadow-none">
                <p className="text-fg-subtle text-sm">Предпросмотр публичного текста</p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {editor.title || 'Заголовок статьи'}
                </h2>
                <p className="text-fg-muted mt-2">{editor.description || 'Описание статьи'}</p>
                <ArticleContent className="mt-6" value={previewText || 'Добавьте текст раздела.'} />
              </Card>
            </div>

            {error ? (
              <p className="text-danger" role="alert">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="text-success" role="status">
                {message}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={saving} disabled={editor.state === 'published'}>
                {editor.id ? 'Сохранить черновик' : 'Создать черновик'}
              </Button>
              {editor.id && editor.state !== 'published' ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPendingAction('publish')}
                >
                  Опубликовать
                </Button>
              ) : null}
              {editor.id && editor.state !== 'published' ? (
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    label="Дата публикации"
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(event) => setScheduleAt(event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!scheduleAt}
                    onClick={() => setPendingAction('schedule')}
                  >
                    Запланировать
                  </Button>
                </div>
              ) : null}
              {editor.id && editor.state !== 'draft' ? (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setPendingAction('unpublish')}
                >
                  Снять с публикации
                </Button>
              ) : null}
            </div>
          </form>
        )}

        {detail.data?.history.length ? (
          <Card className="mt-7 p-5 shadow-none">
            <h2 className="text-xl font-semibold">История изменений</h2>
            <ol className="mt-4 space-y-3">
              {detail.data.history.map((item) => (
                <li key={item.id} className="border-border border-t pt-3 text-sm">
                  <p className="font-medium">{historyLabel(item.action)}</p>
                  <p className="text-fg-muted mt-1">
                    {item.actor_username || 'Система'} · {formatDate(item.created_at)}
                    {item.reason ? ` · ${item.reason}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        ) : null}

        {pendingAction ? (
          <div className="mt-7">
            <AdminActionConfirmation
              title={actionTitle(pendingAction)}
              consequences={actionConsequences(pendingAction, scheduleAt)}
              submitLabel={
                pendingAction === 'unpublish'
                  ? 'Снять с публикации'
                  : pendingAction === 'schedule'
                    ? 'Запланировать'
                    : 'Опубликовать'
              }
              onCancel={() => setPendingAction(null)}
              onConfirmed={publication}
            />
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="blog-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 id="blog-title" className="text-3xl font-semibold tracking-tight">
            Блог
          </h1>
          <p className="text-fg-muted mt-2">Черновики, публикации и редакционный календарь.</p>
        </div>
        <Button
          onClick={() => {
            setCreating(true);
            setEditor(emptyEditor());
            setMessage(null);
            setError(null);
          }}
        >
          Новая статья
        </Button>
      </div>
      <form
        className="mt-7 grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end"
        onSubmit={submitSearch}
      >
        <Input
          label="Заголовок, slug, рубрика или автор"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <label className="text-sm font-medium">
          Состояние
          <select
            className="border-border bg-surface mt-1 min-h-11 w-full rounded-md border px-3"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as BlogState | '');
              setOffset(0);
            }}
          >
            <option value="">Все</option>
            <option value="draft">Черновики</option>
            <option value="scheduled">Запланированные</option>
            <option value="published">Опубликованные</option>
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Найти
        </Button>
      </form>
      {posts.isPending ? (
        <p className="text-fg-muted mt-7">Загружаем статьи…</p>
      ) : posts.isError ? (
        <p className="text-danger mt-7" role="alert">
          {posts.error.message}
        </p>
      ) : posts.data.items.length === 0 ? (
        <Card className="mt-7 p-8 text-center shadow-none">
          <h2 className="font-semibold">Статей пока нет</h2>
          <p className="text-fg-muted mt-2 text-sm">Создайте первый редакционный черновик.</p>
        </Card>
      ) : (
        <>
          <div className="border-border bg-surface mt-7 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-surface-muted text-fg-muted">
                <tr>
                  <th className="px-4 py-3">Статья</th>
                  <th className="px-4 py-3">Состояние</th>
                  <th className="px-4 py-3">Автор</th>
                  <th className="px-4 py-3">Обновлена</th>
                </tr>
              </thead>
              <tbody>
                {posts.data.items.map((post) => (
                  <tr key={post.id} className="border-border border-t">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="text-primary min-h-11 text-left font-medium hover:underline"
                        onClick={() => setSelectedId(post.id)}
                      >
                        {post.title}
                      </button>
                      <p className="text-fg-subtle font-mono text-xs">
                        /{post.slug} · {post.category}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {stateLabel(post.state)}
                      {post.published_at ? (
                        <p className="text-fg-subtle text-xs">{formatDate(post.published_at)}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{post.author_username}</td>
                    <td className="px-4 py-3">{formatDate(post.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Назад
            </Button>
            <span className="text-fg-muted text-sm">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, posts.data.total)} из {posts.data.total}
            </span>
            <Button
              variant="secondary"
              disabled={offset + PAGE_SIZE >= posts.data.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Далее
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function updateSection(
  editor: EditorState,
  setEditor: (value: EditorState) => void,
  index: number,
  patch: Partial<BlogSection>,
) {
  const sections = editor.sections.map((section, sectionIndex) =>
    sectionIndex === index ? { ...section, ...patch } : section,
  );
  setEditor({ ...editor, sections });
}
function updateSource(
  editor: EditorState,
  setEditor: (value: EditorState) => void,
  index: number,
  patch: Partial<BlogSource>,
) {
  const sources = editor.sources.map((source, sourceIndex) =>
    sourceIndex === index ? { ...source, ...patch } : source,
  );
  setEditor({ ...editor, sources });
}
function stateLabel(state: BlogState) {
  return { draft: 'Черновик', scheduled: 'Запланирована', published: 'Опубликована' }[state];
}
function historyLabel(action: string) {
  return (
    (
      {
        'admin.blog.created': 'Черновик создан',
        'admin.blog.updated': 'Черновик изменён',
        'admin.blog.publish': 'Статья опубликована',
        'admin.blog.schedule': 'Публикация запланирована',
        'admin.blog.unpublish': 'Статья снята с публикации',
      } as Record<string, string>
    )[action] ?? action
  );
}
function actionTitle(action: 'publish' | 'schedule' | 'unpublish') {
  return action === 'unpublish'
    ? 'Снять статью с публикации?'
    : action === 'schedule'
      ? 'Запланировать публикацию?'
      : 'Опубликовать статью?';
}
function actionConsequences(action: 'publish' | 'schedule' | 'unpublish', scheduleAt: string) {
  if (action === 'unpublish')
    return ['Статья исчезнет с публичного сайта.', 'Черновик и история изменений сохранятся.'];
  if (action === 'schedule')
    return [
      `Статья станет доступна ${scheduleAt ? formatDate(new Date(scheduleAt).toISOString()) : 'в выбранное время'}.`,
      'До этого момента публичная ссылка будет закрыта.',
    ];
  return [
    'Статья сразу появится в блоге и sitemap.',
    'После публикации для редактирования её нужно снять с публикации.',
  ];
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
async function fileBase64(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
    reader.onload = () => {
      const value = String(reader.result);
      resolve(value.slice(value.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}
