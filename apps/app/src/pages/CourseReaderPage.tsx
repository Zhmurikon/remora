import type { components } from '@remora/api-client';
import { pluralWithCount } from '@remora/core';
import { ArticleContent, Button, Card } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { CourseAttachments } from '../components/CourseAttachments';
import { MaterialDescription } from '../features/materials/MaterialDescription';
import { SettingsIcon } from '../components/SettingsIcon';
import bookImage from '../../../web/public/lecture-demo/course-books.webp';
import './materials.css';
import './course-reader.css';
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
              В вашей библиотеке появится публичный набор с независимой копией карточек, без теории
              и без курса. Вы сможете менять его и учиться, даже если автор снимет оригинал с
              публикации. Прогресс автора не копируется.
            </p>
            <CopySetButton setId={setId} />
          </Card>
        ) : (
          <Card className="space-y-4">
            <h2 className="text-xl font-semibold">{article?.title ?? query.data.title}</h2>
            <p>
              В вашей библиотеке появится публичный курс с независимой копией теории и карточек. Вы
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

type Course = components['schemas']['CourseDetail'];
type Section = Course['sections'][number];

function CourseActions({ course, primary = false }: { course: Course; primary?: boolean }) {
  return (
    <div className="material-actions">
      <Link className={primary ? 'material-primary' : undefined} to={`/courses/${course.id}/learn`}>
        Учить весь курс
      </Link>
      {course.can_edit !== false && (
        <Link
          className="material-settings"
          to={`/courses/${course.id}/edit`}
          aria-label="Редактировать курс"
          title="Редактировать курс"
        >
          <SettingsIcon />
        </Link>
      )}
    </div>
  );
}

function ReaderOutline({
  sections,
  selected,
  articleId,
  mobileOpen,
  onToggle,
  onHide,
  onSelect,
}: {
  sections: Section[];
  selected?: Section;
  articleId?: string;
  mobileOpen: boolean;
  onToggle: () => void;
  onHide: () => void;
  onSelect: (section: Section) => void;
}) {
  const [expandedId, setExpandedId] = useState(selected?.id);
  useEffect(() => setExpandedId(selected?.id), [selected?.id, articleId]);
  const label = articleId ? 'Уроки курса' : 'Разделы курса';
  return (
    <aside className="reader-rail" data-open={mobileOpen}>
      <div className="reader-rail-heading">
        <h2>{label}</h2>
        {articleId && (
          <button
            type="button"
            className="reader-control"
            aria-label="Скрыть список уроков"
            title="Скрыть список уроков"
            onClick={onHide}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
            </svg>
          </button>
        )}
      </div>
      <button
        type="button"
        className="reader-mobile-toggle"
        aria-expanded={mobileOpen}
        aria-controls="reader-outline"
        onClick={onToggle}
      >
        {label}
        <span className="material-caret" aria-hidden="true" />
      </button>
      <nav id="reader-outline" aria-label="Оглавление курса">
        {sections.map((s, i) => {
          const expanded = Boolean(articleId) && expandedId === s.id;
          return (
            <div key={s.id} className="reader-chapter">
              <button
                type="button"
                className="reader-chapter-button"
                data-selected={s.id === selected?.id}
                aria-pressed={articleId ? undefined : s.id === selected?.id}
                aria-expanded={articleId ? expanded : undefined}
                onClick={() =>
                  articleId ? setExpandedId(expanded ? undefined : s.id) : onSelect(s)
                }
              >
                <span className="reader-number">{String(i + 1).padStart(2, '0')}</span>
                <span>{s.title}</span>
              </button>
              {expanded &&
                (s.articles.length ? (
                  <ul className="reader-sublinks">
                    {s.articles.map((a) => (
                      <li key={a.id}>
                        <Link
                          to={`?article=${a.id}`}
                          onClick={() => {
                            if (mobileOpen) onToggle();
                          }}
                          aria-current={a.id === articleId ? 'page' : undefined}
                        >
                          {a.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="reader-meta">В этом разделе пока нет уроков.</p>
                ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function Reader({ course }: { course: Course }) {
  const canEdit = course.can_edit !== false;
  const [params, setParams] = useSearchParams();
  const [largeText, setLargeText] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [quizActive, setQuizActive] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const previousStep = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const sectionHeading = useRef<HTMLHeadingElement>(null);
  const articles = course.sections.flatMap((s) => s.articles);
  const active = articles.find((a) => a.id === params.get('article'));
  const index = articles.findIndex((a) => a.id === active?.id);
  const quiz = params.get('step') === 'quiz';
  const section = course.sections.find((s) => s.articles.some((a) => a.id === active?.id));
  const selected =
    section ?? course.sections.find((s) => s.id === params.get('section')) ?? course.sections[0];
  const selectedIndex = course.sections.findIndex((s) => s.id === selected?.id);
  const nextSection = course.sections[selectedIndex + 1];
  useEffect(() => {
    setMobileOpen(false);
    heading.current?.focus({ preventScroll: true });
    if (previousStep.current !== null && previousStep.current !== `${active?.id}:${quiz}`)
      heading.current?.scrollIntoView?.({ block: 'nearest' });
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
    if (article && article === active?.id && quiz === (step === 'quiz')) return;
    if (
      quizActive &&
      !window.confirm('Выйти из квиза? Ответы незавершённого квиза будут потеряны.')
    )
      return;
    setParams(
      article
        ? { article, ...(step === 'quiz' ? { step } : {}) }
        : selected
          ? { section: selected.id }
          : {},
    );
  }

  function selectSection(s: Section) {
    setParams({ section: s.id });
    setMobileOpen(false);
    requestAnimationFrame(() => sectionHeading.current?.focus());
  }

  function toggleFocusMode() {
    setFocusMode(!focusMode);
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }
  const hideOutline = Boolean(active) && focusMode;
  return (
    <div className="reader-page materials-page">
      <header className="reader-top">
        <div className="reader-crumbs">
          <Link to="/courses">
            <span aria-hidden="true">‹</span> Мои курсы
          </Link>
          <span aria-hidden="true">/</span>
          {active ? (
            <button aria-label="О курсе и оглавление" onClick={() => go()}>
              О курсе<span className="reader-crumb-tail">&nbsp;и оглавление</span>
            </button>
          ) : (
            <span>О курсе</span>
          )}
        </div>
        {active && <CourseActions course={course} />}
      </header>
      <div className="reader-spread">
        {!hideOutline && course.sections.length > 0 && (
          <ReaderOutline
            sections={course.sections}
            selected={selected}
            articleId={active?.id}
            mobileOpen={mobileOpen}
            onToggle={() => setMobileOpen(!mobileOpen)}
            onHide={toggleFocusMode}
            onSelect={selectSection}
          />
        )}
        {!active ? (
          <div className="reader-overview">
            <header className="material-folder reader-cover">
              <img className="material-cover" src={bookImage} width="90" height="100" alt="" />
              <p className="reader-meta">
                {pluralWithCount(course.sections.length, ['раздел', 'раздела', 'разделов'])} ·{' '}
                {pluralWithCount(articles.length, ['урок', 'урока', 'уроков'])}
              </p>
              <h1 ref={heading} tabIndex={-1}>
                {course.title}
              </h1>
              <MaterialDescription description={course.description}>
                <CourseActions course={course} primary />
              </MaterialDescription>
            </header>
            {params.has('article') && (
              <p role="status">Этот урок не найден. Выберите другой в оглавлении.</p>
            )}
            {articles.length === 0 && (
              <div className="reader-empty">
                <p>В курсе пока нет уроков.</p>
                {canEdit && (
                  <Link className={courseLink} to={`/courses/${course.id}/structure`}>
                    Добавить материалы
                  </Link>
                )}
              </div>
            )}
            {selected && (
              <section className="reader-section" aria-labelledby="reader-section-title">
                <p className="reader-meta">
                  Раздел {selectedIndex + 1} из {course.sections.length}
                </p>
                <h2 id="reader-section-title" ref={sectionHeading} tabIndex={-1}>
                  {selected.title}
                </h2>
                {selected.articles.length > 0 ? (
                  <ol className="reader-lessons">
                    {selected.articles.map((a) => (
                      <li key={a.id}>
                        <Link to={`?article=${a.id}`}>
                          {a.title}
                          <span aria-hidden="true">›</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="reader-meta">В этом разделе пока нет уроков.</p>
                )}
                {nextSection && (
                  <button
                    className="reader-next-section"
                    onClick={() => selectSection(nextSection)}
                  >
                    <small>Следующий раздел</small>
                    {nextSection.title} <span aria-hidden="true">›</span>
                  </button>
                )}
              </section>
            )}
            <details className="reader-files">
              <summary>Вложения курса</summary>
              <CourseAttachments courseId={course.id} canEdit={canEdit} />
            </details>
          </div>
        ) : (
          <article key={active.id} className="reader-article">
            <header>
              <p className="reader-meta">
                Урок {index + 1} из {articles.length} · {section?.title}
              </p>
              <h1 ref={heading} tabIndex={-1}>
                {active.title}
              </h1>
              {!quiz && (
                <p className="reader-time">
                  {active.body?.trim()
                    ? `Около ${Math.max(1, Math.ceil(active.body.trim().split(/\s+/).length / 180))} мин чтения`
                    : 'Материал без теории'}
                </p>
              )}
            </header>
            <div className="reader-tools">
              <div className="reader-tabs" aria-label="Шаги урока">
                <button aria-current={!quiz ? 'step' : undefined} onClick={() => go(active.id)}>
                  Материал
                </button>
                <button
                  aria-current={quiz ? 'step' : undefined}
                  onClick={() => go(active.id, 'quiz')}
                >
                  Квиз
                </button>
              </div>
              <div className="reader-options">
                {hideOutline && (
                  <button className="reader-control" onClick={toggleFocusMode}>
                    Показать список уроков
                  </button>
                )}
                {!quiz && (
                  <button
                    className="reader-control reader-type"
                    aria-label="Крупный текст"
                    title={largeText ? 'Обычный текст' : 'Крупный текст'}
                    aria-pressed={largeText}
                    onClick={() => setLargeText(!largeText)}
                  >
                    Аа
                  </button>
                )}
              </div>
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
                <div className="course-reading" data-large={largeText}>
                  {active.body ? (
                    <ArticleContent
                      value={active.body}
                      headingLevel={2}
                      articleTitle={active.title}
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
                <details className="reader-files">
                  <summary>Вложения урока</summary>
                  <CourseAttachments courseId={course.id} articleId={active.id} canEdit={canEdit} />
                </details>
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
        )}
      </div>
    </div>
  );
}
