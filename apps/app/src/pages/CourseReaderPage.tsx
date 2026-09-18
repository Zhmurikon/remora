import type { components } from '@remora/api-client';
import { ArticleContent, Button, Card } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { courseLink } from './CourseEditorPage';

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
      <Link to={`/courses/${courseId}`} className={courseLink}>
        Настройки курса
      </Link>
      {query.isPending && <p role="status">Загружаем материалы…</p>}
      {query.isError && (
        <div role="alert">
          {query.error.message}
          <Button onClick={() => void query.refetch()}>Повторить</Button>
        </div>
      )}
      {query.data && <Reader course={query.data} />}
    </div>
  );
}

function Reader({ course }: { course: components['schemas']['CourseDetail'] }) {
  const [params, setParams] = useSearchParams();
  const articles = course.sections.flatMap((s) => s.articles);
  const active = articles.find((a) => a.id === params.get('article')) ?? articles[0];
  const index = articles.findIndex((a) => a.id === active?.id);
  return (
    <>
      <header>
        <h1 className="break-words text-3xl font-semibold">{course.title}</h1>
        <p className="text-fg-muted mt-2 whitespace-pre-wrap break-words">{course.description}</p>
      </header>
      {!active ? (
        <Card>
          В курсе пока нет статей.{' '}
          <Link className={courseLink} to={`/courses/${course.id}/edit`}>
            Добавить материалы
          </Link>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <nav aria-label="Оглавление курса" className="space-y-4">
            {course.sections.map((s) => (
              <div key={s.id}>
                <h2 className="break-words font-semibold">{s.title}</h2>
                <ul>
                  {s.articles.map((a) => (
                    <li key={a.id}>
                      <button
                        className={`focus-visible:outline-primary min-h-11 w-full rounded-xl p-3 text-left ${a.id === active.id ? 'bg-surface-muted text-primary' : 'text-fg-muted'}`}
                        aria-current={a.id === active.id ? 'page' : undefined}
                        onClick={() => setParams({ article: a.id })}
                      >
                        {a.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <article className="min-w-0 space-y-6" key={active.id}>
            <p className="text-fg-muted text-sm">
              Статья {index + 1} из {articles.length}
            </p>
            <h2 className="break-words text-2xl font-semibold">{active.title}</h2>
            {active.body ? (
              <ArticleContent value={active.body} />
            ) : (
              <p className="text-fg-muted">
                Теория пока не добавлена. Можно сразу перейти к карточкам.
              </p>
            )}
            <div className="border-border flex flex-wrap gap-5 border-t pt-5">
              <Link className={courseLink} to={`/sets/${active.set_id}/learn`}>
                Начать заучивание
              </Link>
              <Link className={courseLink} to={`/sets/${active.set_id}`}>
                Все режимы обучения
              </Link>
            </div>
            <div className="flex flex-wrap justify-between gap-3">
              <Button
                variant="secondary"
                disabled={index <= 0}
                onClick={() => setParams({ article: articles[index - 1]!.id })}
              >
                Предыдущая статья
              </Button>
              <Button
                variant="secondary"
                disabled={index >= articles.length - 1}
                onClick={() => setParams({ article: articles[index + 1]!.id })}
              >
                Следующая статья
              </Button>
            </div>
            <CopyCourseButton courseId={course.id} articleId={active.id} />
          </article>
        </div>
      )}
    </>
  );
}
