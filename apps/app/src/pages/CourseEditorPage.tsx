import type { components } from '@remora/api-client';
import { ArticleContent, Button, Card, Input } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';

type Detail = components['schemas']['CourseEditorDetail'];
type Section = components['schemas']['SectionWrite'] & { key: string };
const drafts = new Map<string, { base: Detail; sections: Section[] }>();
const field =
  'border-border bg-surface min-h-11 w-full rounded-xl border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';
export const courseLink =
  'text-primary inline-flex min-h-11 items-center rounded-lg underline focus-visible:outline focus-visible:outline-2';

export function CourseEditorPage() {
  const { courseId = '' } = useParams();
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
      {query.data && <StructureForm key={query.data.id} initial={query.data} />}
    </div>
  );
}

function StructureForm({ initial }: { initial: Detail }) {
  const client = useQueryClient();
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
      setNotice('Структура и теория сохранены');
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
  return (
    <div className="space-y-6">
      <header>
        <p className="text-fg-muted">{base.title}</p>
        <h1 className="text-3xl font-semibold">Редактор курса</h1>
        <p className="text-fg-muted mt-2">
          Разделы, теория и карточки — в порядке, в котором вы хотите учиться.
        </p>
      </header>
      {base.is_published && (
        <p role="alert">
          Для редактирования структуры снимите курс с публикации в настройках курса.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!save.isPending) save.mutate();
        }}
        className="space-y-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="min-h-11"
            type="submit"
            loading={save.isPending}
            disabled={!dirty || base.is_published}
          >
            Сохранить материалы
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
          {sections.map((section, si) => (
            <Card key={section.key} className="min-w-0 space-y-5">
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
                    Удалить раздел и тексты его статей из курса? Наборы карточек останутся в вашей
                    библиотеке. Изменение применится после сохранения.
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
                  <Button type="button" variant="ghost" onClick={() => setConfirmRemove(null)}>
                    Отмена
                  </Button>
                </div>
              )}
              {(section.articles ?? []).map((article, ai) => (
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
                  {preview ? (
                    <ArticleContent value={article.body ?? ''} />
                  ) : (
                    <label className="block space-y-2">
                      <span>
                        Теория статьи {si + 1}.{ai + 1}
                      </span>
                      <textarea
                        className={field}
                        rows={12}
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
                        Поддерживаются # заголовки, **жирный текст**, списки с «-» и блоки кода в
                        тройных обратных кавычках.
                      </span>
                    </label>
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
                      <Button type="button" variant="ghost" onClick={() => setConfirmRemove(null)}>
                        Отмена
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                disabled={articleCount >= 100}
                onClick={() =>
                  updateSection(si, {
                    articles: [...(section.articles ?? []), { title: 'Новая статья', body: '' }],
                  })
                }
              >
                Добавить статью
              </Button>
            </Card>
          ))}
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
