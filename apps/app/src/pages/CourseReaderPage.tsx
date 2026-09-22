import type { components } from '@remora/api-client';
import { ArticleContent, Button, Card } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { TestPage } from './TestPage';
import { courseLink } from './CourseEditorPage';

export function CopySetButton({ setId }: { setId: string }) {
  const key = useRef(crypto.randomUUID());
  const navigate = useNavigate();
  const client = useQueryClient();
  const copy = useMutation({
    mutationFn: async () => {
      const result = await api.POST('/api/v1/sets/{set_id}/copy', {
        params: { path: { set_id: setId }, header: { 'idempotency-key': key.current } },
        headers: { 'Idempotency-Key': key.current },
      });
      if (!result.data)
        throw new Error(
          'Не удалось скопировать набор. Возможно, автор закрыл доступ. Проверьте соединение и повторите попытку.',
        );
      return result.data;
    },
    onSuccess: (data) => {
      void client.invalidateQueries({ queryKey: ['sets'] });
      navigate(`/sets/${data.id}`);
    },
  });
  return (
    <div className="space-y-2">
      <Button
        className="min-h-11"
        variant="secondary"
        loading={copy.isPending}
        onClick={() => copy.mutate()}
      >
        Создать копию набора
      </Button>
      {copy.isError && (
        <p role="alert" className="text-danger">
          {copy.error.message}
        </p>
      )}
    </div>
  );
}

export function CopyCourseButton({
  courseId,
  articleId,
}: {
  courseId: string;
  articleId?: string;
}) {
  const key = useRef(crypto.randomUUID());
  const navigate = useNavigate();
  const client = useQueryClient();
  const copy = useMutation({
    mutationFn: async () => {
      const result = await api.POST('/api/v1/courses/{course_id}/copy', {
        params: { path: { course_id: courseId }, header: { 'idempotency-key': key.current } },
        body: { article_id: articleId },
        headers: { 'Idempotency-Key': key.current },
      });
      if (!result.data)
        throw new Error(
          'Не удалось скопировать материал. Возможно, автор закрыл доступ. Проверьте соединение и повторите попытку.',
        );
      return result.data;
    },
    onSuccess: (data) => {
      client.setQueryData(['course', data.id], data);
      void client.invalidateQueries({ queryKey: ['courses'] });
      void client.invalidateQueries({ queryKey: ['sets'] });
      navigate(`/courses/${data.id}/read`);
    },
  });
  return (
    <div className="space-y-2">
      <Button
        className="min-h-11"
        variant="secondary"
        loading={copy.isPending}
        onClick={() => copy.mutate()}
      >
        {articleId ? 'Создать копию статьи с карточками' : 'Создать копию курса'}
      </Button>
      {copy.isError && (
        <p role="alert" className="text-danger">
          {copy.error.message}
        </p>
      )}
    </div>
  );
}

export function CourseCopyPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const articleId = params.get('article') ?? undefined;
  const setId = params.get('set') ?? undefined;
  const query = useQuery({
    queryKey: ['public-course', slug],
    queryFn: async () => {
      const result = await api.GET('/api/v1/courses/public/{slug}', { params: { path: { slug } } });
      if (!result.data) throw new Error('Курс недоступен или не удалось загрузить материалы.');
      return result.data;
    },
  });
  const article = query.data?.sections.flatMap((s) => s.articles).find((a) => a.id === articleId);
  return (
    <div className="max-w-2xl space-y-6">
      <Link className={courseLink} to="/courses">
        Мои курсы
      </Link>
      <h1 className="text-3xl font-semibold">Копирование материала</h1>
      {query.isPending && <p role="status">Загружаем курс…</p>}
      {query.isError && (
        <div role="alert">
          {query.error.message}
          <Button onClick={() => void query.refetch()}>Повторить</Button>
        </div>
      )}
      {query.data &&
        (articleId && !article ? (
          <p role="alert">Статья не найдена.</p>
        ) : setId ? (
          <Card className="space-y-4">
            <h2 className="text-xl font-semibold">
              {query.data.sections.flatMap((s) => s.articles).find((a) => a.set_id === setId)
                ?.title ?? query.data.title}
            </h2>
            <p>
              В вашей библиотеке появится приватный набор с независимой копией карточек, без теории
              и без курса. Вы сможете менять его и учиться, даже если автор снимет оригинал с
              публикации. Прогресс автора не копируется.
            </p>
            <CopySetButton setId={setId} />
          </Card>
        ) : (
          <Card className="space-y-4">
            <h2 className="text-xl font-semibold">{article?.title ?? query.data.title}</h2>
            <p>
              В вашей библиотеке появится приватный курс с независимой копией теории и карточек. Вы
              сможете менять её и учиться, даже если автор снимет оригинал с публикации. Прогресс
              автора не копируется.
            </p>
            <CopyCourseButton courseId={query.data.id} articleId={articleId} />
          </Card>
        ))}
    </div>
  );
}

export function CourseReaderPage() {
  const { courseId = '' } = useParams();
  const query = useQuery({
    queryKey: ['course', courseId],
    queryFn: async () => {
      const result = await api.GET('/api/v1/courses/{course_id}', {
        params: { path: { course_id: courseId } },
      });
      if (!result.data) throw new Error('Курс недоступен или нет соединения с сервером.');
      return result.data;
    },
  });
  return (
    <div className="space-y-6">
      {query.isPending && <p role="status">Загружаем материалы…</p>}
      {query.isError && (
        <div role="alert">
          {query.error.message}
          <Button onClick={() => void query.refetch()}>Повторить</Button>
        </div>
      )}
      {query.data && <Reader key={query.data.id} course={query.data} />}
    </div>
  );
}

function Reader({ course }: { course: components['schemas']['CourseDetail'] }) {
  const [params, setParams] = useSearchParams();
  const [largeText, setLargeText] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [quizActive, setQuizActive] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(
    () => window.matchMedia?.('(min-width: 1280px)').matches ?? true,
  );
  const previousStep = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const articles = course.sections.flatMap((s) => s.articles);
  const active = articles.find((a) => a.id === params.get('article'));
  const index = articles.findIndex((a) => a.id === active?.id);
  const quiz = params.get('step') === 'quiz';
  const section = course.sections.find((s) => s.articles.some((a) => a.id === active?.id));
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (previousStep.current !== null && previousStep.current !== `${active?.id}:${quiz}`)
      heading.current?.scrollIntoView?.({ block: 'start' });
    previousStep.current = `${active?.id}:${quiz}`;
    setQuizActive(false);
    setQuizFinished(false);
  }, [active?.id, quiz]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (quizActive) event.preventDefault();
    };
    const leave = (event: MouseEvent) => {
      if (
        quizActive &&
        event.target instanceof Element &&
        event.target.closest('a[href]') &&
        !window.confirm('Выйти из квиза? Ответы незавершённого квиза будут потеряны.')
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', leave, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', leave, true);
    };
  }, [quizActive]);
  function go(article?: string, step = 'read') {
    if (
      quizActive &&
      !window.confirm('Выйти из квиза? Ответы незавершённого квиза будут потеряны.')
    )
      return;
    if (window.matchMedia?.('(max-width: 1279px)').matches) setOutlineOpen(false);
    setParams(article ? { article, ...(step === 'quiz' ? { step } : {}) } : {});
  }
  return (
    <div className="space-y-6 [overflow-wrap:anywhere] [&_a]:max-w-full [&_button]:h-auto [&_button]:min-h-11 [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:py-2 [&_button]:[overflow-wrap:anywhere]">
      <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <Link to="/courses" className={courseLink}>
          Мои курсы
        </Link>
        <div className="flex min-w-0 max-w-full flex-wrap gap-4">
          {active && (
            <>
              <Button variant="ghost" onClick={() => go()}>
                О курсе и оглавление
              </Button>
              <Button
                variant="ghost"
                aria-pressed={focusMode}
                onClick={() => setFocusMode(!focusMode)}
              >
                {focusMode ? 'Показать список уроков' : 'Скрыть список уроков'}
              </Button>
            </>
          )}
          <Link to={`/courses/${course.id}/edit`} className={courseLink}>
            Редактировать курс
          </Link>
        </div>
      </header>
      {!active ? (
        <div className="mx-auto max-w-3xl space-y-8">
          <header>
            <p className="text-fg-muted mb-3 text-sm">Учебный курс · Уроков: {articles.length}</p>
            <h1
              ref={heading}
              tabIndex={-1}
              className="text-3xl font-semibold tracking-tight focus:outline-none"
            >
              {course.title}
            </h1>
            {course.description && (
              <p className="text-fg-muted mt-4 whitespace-pre-wrap text-lg leading-relaxed">
                {course.description}
              </p>
            )}
            <p className="text-fg-muted mt-4">
              Выберите урок, прочитайте материал и проверьте себя в квизе.
            </p>
          </header>
          {params.has('article') && (
            <p role="status">Этот урок не найден. Выберите другой в оглавлении.</p>
          )}
          {articles.length === 0 && (
            <Card>
              <p>В курсе пока нет уроков.</p>
              <Link className={courseLink} to={`/courses/${course.id}/structure`}>
                Добавить материалы
              </Link>
            </Card>
          )}
          <nav aria-label="Оглавление курса" className="space-y-6">
            <h2 className="text-2xl font-semibold">Оглавление</h2>
            {course.sections.map((s, si) => (
              <section key={s.id} className="space-y-3">
                <h3 className="text-lg font-semibold">
                  {si + 1}. {s.title}
                </h3>
                {s.articles.length === 0 && (
                  <p className="text-fg-muted">В этом разделе пока нет уроков.</p>
                )}
                <ol className="border-border divide-border bg-surface divide-y overflow-hidden rounded-2xl border">
                  {s.articles.map((a, ai) => (
                    <li key={a.id}>
                      <Link
                        to={`?article=${a.id}`}
                        className="hover:bg-surface-muted focus-visible:outline-primary flex min-h-11 items-start gap-4 p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                      >
                        <span className="text-fg-muted shrink-0">
                          {si + 1}.{ai + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium">{a.title}</span>
                          <span className="text-fg-muted mt-1 block text-sm">
                            {a.body?.trim() ? 'Материал и квиз' : 'Квиз по карточкам'}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </nav>
        </div>
      ) : (
        <div
          className={`grid min-w-0 gap-8 ${focusMode ? '' : 'xl:grid-cols-[16rem_minmax(0,1fr)]'}`}
        >
          {!focusMode && (
            <aside className="min-w-0 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:self-start xl:overflow-y-auto">
              <details
                className="border-border bg-surface rounded-2xl border p-5"
                open={outlineOpen}
                onToggle={(event) => setOutlineOpen(event.currentTarget.open)}
              >
                <summary className="min-h-11 cursor-pointer font-semibold">
                  Оглавление курса
                </summary>
                <p className="mt-3 break-words text-lg font-semibold">{course.title}</p>
                <p className="text-fg-muted mt-2 text-sm">
                  Урок {index + 1} из {articles.length}
                </p>
                <nav aria-label="Оглавление курса" className="mt-6 space-y-6">
                  {course.sections.map((s, si) => (
                    <div key={s.id}>
                      <h2 className="text-fg-muted mb-2 break-words text-sm font-medium">
                        {si + 1}. {s.title}
                      </h2>
                      <ol className="space-y-1">
                        {s.articles.map((a, ai) => (
                          <li key={a.id}>
                            <button
                              className={`focus-visible:outline-primary min-h-11 w-full rounded-xl p-3 text-left text-sm ${a.id === active.id ? 'bg-primary-subtle text-primary font-semibold' : 'text-fg-muted hover:bg-surface-muted'}`}
                              aria-current={a.id === active.id ? 'page' : undefined}
                              onClick={() => go(a.id)}
                            >
                              <span className="mr-2">
                                {si + 1}.{ai + 1}
                              </span>
                              {a.title}
                            </button>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </nav>
              </details>
            </aside>
          )}
          <div className="min-w-0">
            <article className="border-border bg-surface mx-auto max-w-3xl rounded-2xl border p-5 sm:p-8 lg:p-10">
              <p className="text-fg-muted text-sm">
                {section?.title} · Урок {index + 1} из {articles.length}
              </p>
              <h1
                ref={heading}
                tabIndex={-1}
                className="mt-3 scroll-mt-24 break-words text-3xl font-semibold tracking-tight focus:outline-none"
              >
                {active.title}
              </h1>
              <div className="border-border my-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                <div className="flex flex-wrap gap-2" aria-label="Шаги урока">
                  <Button
                    variant={quiz ? 'ghost' : 'secondary'}
                    aria-current={!quiz ? 'step' : undefined}
                    onClick={() => go(active.id)}
                  >
                    1. Материал
                  </Button>
                  <Button
                    variant={quiz ? 'secondary' : 'ghost'}
                    aria-current={quiz ? 'step' : undefined}
                    onClick={() => go(active.id, 'quiz')}
                  >
                    2. Квиз
                  </Button>
                </div>
                {!quiz && (
                  <Button
                    variant="ghost"
                    aria-pressed={largeText}
                    onClick={() => setLargeText(!largeText)}
                  >
                    {largeText ? 'Обычный текст' : 'Крупный текст'}
                  </Button>
                )}
              </div>
              {quiz ? (
                <TestPage
                  key={active.id}
                  setIdOverride={active.set_id}
                  embedded
                  onActivityChange={(value) => {
                    setQuizActive(value);
                    if (value) setQuizFinished(false);
                  }}
                  onCompleted={() => setQuizFinished(true)}
                />
              ) : (
                <>
                  <p className="text-fg-muted mb-8 text-sm">
                    {active.body?.trim()
                      ? `Около ${Math.max(1, Math.ceil(active.body.trim().split(/\s+/).length / 180))} мин чтения`
                      : 'Материал без теории'}{' '}
                    · Затем квиз по теме
                  </p>
                  <div className={`course-reading ${largeText ? 'text-xl' : 'text-lg'}`}>
                    {active.body ? (
                      <ArticleContent
                        value={active.body}
                        headingLevel={2}
                        media={Object.fromEntries(
                          (active.media ?? []).map((item) => [item.id, item]),
                        )}
                      />
                    ) : (
                      <p className="text-fg-muted">
                        Теория пока не добавлена. Можно сразу перейти к квизу.
                      </p>
                    )}
                  </div>
                  <div className="bg-primary-subtle mt-10 rounded-2xl p-4 sm:p-6">
                    <h2 className="text-xl font-semibold">Проверьте, что запомнили</h2>
                    <p className="text-fg-muted mb-5 mt-2">
                      Ответьте на вопросы по карточкам этого урока. После проверки вы увидите
                      результат и разбор ошибок.
                    </p>
                    <Button onClick={() => go(active.id, 'quiz')}>Пройти квиз</Button>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-x-5">
                    <Link className={courseLink} to={`/sets/${active.set_id}/learn`}>
                      Начать заучивание
                    </Link>
                    <Link className={courseLink} to={`/sets/${active.set_id}`}>
                      Все режимы обучения
                    </Link>
                  </div>
                </>
              )}
              {(!quiz || quizFinished) && (
                <nav
                  aria-label="Переход между уроками"
                  className="border-border mt-8 flex flex-wrap justify-between gap-3 border-t pt-5"
                >
                  <Button
                    variant="ghost"
                    disabled={index <= 0}
                    onClick={() => go(articles[index - 1]!.id)}
                  >
                    Предыдущий урок
                  </Button>
                  {index < articles.length - 1 ? (
                    <Button variant="secondary" onClick={() => go(articles[index + 1]!.id)}>
                      Следующий урок
                    </Button>
                  ) : (
                    <p className="text-fg-muted flex min-h-11 items-center">
                      Это последний урок курса
                    </p>
                  )}
                </nav>
              )}
            </article>
          </div>
        </div>
      )}
    </div>
  );
}
