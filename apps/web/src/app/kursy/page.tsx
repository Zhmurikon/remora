import type { components } from '@remora/api-client';
import { Badge, Button, Card, Input } from '@remora/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '../../components/JsonLd';
import { absoluteUrl, DEFAULT_OG_IMAGE } from '../../lib/seo';

type Params = Record<string, string | string[] | undefined>;
type Result = components['schemas']['CourseSearchResult'];
const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8000';
const keys = [
  'q',
  'tag',
  'language',
  'author_id',
  'min_cards',
  'max_cards',
  'updated_after',
  'sort',
  'cursor',
];

function catalogParams(values: Params): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = values[key];
    if (typeof value === 'string' && value.trim()) params.set(key, value.trim());
  }
  return params;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  return {
    title: 'Каталог курсов',
    description: 'Найдите учебный курс и карточки по интересующей теме на Remora.',
    alternates: { canonical: '/kursy' },
    robots: { index: catalogParams(await searchParams).size === 0, follow: true },
    openGraph: {
      title: 'Каталог курсов',
      description: 'Найдите учебный курс и карточки по интересующей теме на Remora.',
      type: 'website',
      url: '/kursy',
      images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: 'Каталог Remora' }],
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = catalogParams(await searchParams);
  const apiParams = new URLSearchParams(params);
  const date = apiParams.get('updated_after');
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) apiParams.set('updated_after', `${date}T00:00:00Z`);
  let result: Result | null = null;
  let error = '';
  try {
    const response = await fetch(`${API_URL}/api/v1/search/courses?${apiParams}`, {
      // Выдача каталога не кэшируется: множество комбинаций фильтров раздуло бы
      // ключи, а снятый с публикации курс не должен оставаться в списке.
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    if (response.ok) result = (await response.json()) as Result;
    else
      error =
        response.status === 422
          ? 'Проверьте фильтры: минимум карточек не должен превышать максимум, а дата должна быть корректной.'
          : 'Не удалось загрузить курсы. Попробуйте ещё раз.';
  } catch {
    error = 'Поиск временно недоступен. Попробуйте ещё раз.';
  }
  const next = new URLSearchParams(params);
  if (result?.next_cursor != null) next.set('cursor', String(result.next_cursor));
  const field = 'grid min-w-0 gap-2 text-sm font-medium';
  return (
    <main className="mx-auto min-h-dvh max-w-6xl px-4 py-6 sm:px-8">
      {params.size === 0 && result && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            url: absoluteUrl('/kursy'),
            name: 'Каталог курсов Remora',
            mainEntity: {
              '@type': 'ItemList',
              itemListElement: result.items.map((course, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name: course.title,
                url: absoluteUrl(`/kurs/${course.slug}`),
              })),
            },
          }}
        />
      )}
      <nav aria-label="Основная навигация" className="flex items-center justify-between">
        <Link
          href="/"
          className="text-primary inline-flex min-h-11 items-center text-xl font-semibold"
        >
          Remora
        </Link>
        <Link href="/login" className="text-primary inline-flex min-h-11 items-center underline">
          Войти
        </Link>
      </nav>
      <header className="py-10 sm:py-12">
        <p className="text-primary text-sm font-medium">Учебные материалы сообщества</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Найдите свою тему
        </h1>
        <p className="text-fg-muted mt-4 max-w-prose text-lg">
          Курсы и карточки для следующего занятия, зачёта или нового интереса.
        </p>
        <Link
          href="/podborki"
          className="text-primary mt-4 inline-flex min-h-11 items-center underline"
        >
          Подборки редакции →
        </Link>
      </header>
      <Card>
        <form action="/kursy" method="get" role="search" className="space-y-5 [&_input]:min-h-11">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className={`${field} flex-1`}>
              Что хотите изучить?
              <Input
                name="q"
                defaultValue={params.get('q') ?? ''}
                maxLength={200}
                placeholder="Например, линейная алгебра"
              />
            </label>
            <Button type="submit" className="min-h-11">
              Найти курсы
            </Button>
          </div>
          {params.get('author_id') && (
            <div className="text-fg-muted text-sm">
              Показаны курсы выбранного автора.
              <input type="hidden" name="author_id" value={params.get('author_id')!} />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className={field}>
              Тег
              <Input
                name="tag"
                maxLength={60}
                defaultValue={params.get('tag') ?? ''}
                placeholder="математика"
              />
            </label>
            <label className={field}>
              Язык
              <select
                name="language"
                defaultValue={params.get('language') ?? ''}
                className="border-border bg-surface min-h-11 rounded-xl border px-3"
              >
                <option value="">Любой</option>
                <option value="ru">Русский</option>
                <option value="en">Английский</option>
                <option value="de">Немецкий</option>
                <option value="fr">Французский</option>
                <option value="es">Испанский</option>
                <option value="zh">Китайский</option>
              </select>
            </label>
            <label className={field}>
              Обновлены после
              <Input
                type="date"
                name="updated_after"
                defaultValue={params.get('updated_after') ?? ''}
              />
            </label>
            <label className={field}>
              Минимум карточек
              <Input
                type="number"
                min={0}
                name="min_cards"
                defaultValue={params.get('min_cards') ?? ''}
              />
            </label>
            <label className={field}>
              Максимум карточек
              <Input
                type="number"
                min={0}
                name="max_cards"
                defaultValue={params.get('max_cards') ?? ''}
              />
            </label>
            <label className={field}>
              Порядок
              <select
                name="sort"
                defaultValue={params.get('sort') ?? 'relevance'}
                className="border-border bg-surface min-h-11 rounded-xl border px-3"
              >
                <option value="relevance">По соответствию запросу</option>
                <option value="popular">Сначала популярные</option>
                <option value="updated">Недавно обновлённые</option>
                <option value="cards">Больше карточек</option>
              </select>
            </label>
          </div>
          <Link href="/kursy" className="text-primary inline-flex min-h-11 items-center underline">
            Сбросить поиск и фильтры
          </Link>
        </form>
      </Card>
      <section aria-label="Результаты поиска" className="py-8">
        {error && (
          <Card>
            <p role="alert">{error}</p>
            <Link
              className="text-primary mt-3 inline-flex min-h-11 items-center underline"
              href={`/kursy?${params}`}
            >
              Попробовать ещё раз
            </Link>
          </Card>
        )}
        {result?.items.length === 0 && (
          <Card>
            <h2 className="text-xl font-semibold">Курсы не найдены</h2>
            <p className="text-fg-muted mt-2">Попробуйте другую тему или уберите часть фильтров.</p>
          </Card>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          {result?.items.map((course) => (
            <Card key={course.id} className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                {course.tags.map((tag) => (
                  <Badge key={tag}>#{tag}</Badge>
                ))}
              </div>
              <h2 className="break-words text-2xl font-semibold">
                <Link
                  href={`/kurs/${course.slug}`}
                  className="inline-flex min-h-11 items-center hover:underline"
                >
                  {course.title}
                </Link>
              </h2>
              {course.description && (
                <p className="text-fg-muted line-clamp-3 break-words">{course.description}</p>
              )}
              <p className="text-fg-muted mt-auto text-sm">
                Карточек: {course.cards_count} · Сохранений: {course.saves_count} ·{' '}
                {course.languages.join(', ').toUpperCase()}
              </p>
              <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm">
                <Link
                  className="text-primary inline-flex min-h-11 max-w-full items-center break-words underline"
                  href={`/kursy?author_id=${course.author_id}`}
                >
                  {course.author}
                </Link>
                <span className="text-fg-muted">
                  Обновлён{' '}
                  {new Date(course.updated_at).toLocaleDateString('ru-RU', { timeZone: 'UTC' })}
                </span>
              </div>
            </Card>
          ))}
        </div>
        {result?.next_cursor != null && (
          <Link
            href={`/kursy?${next}`}
            className="border-border bg-surface mt-6 inline-flex min-h-11 items-center rounded-xl border px-5"
          >
            Следующие курсы →
          </Link>
        )}
      </section>
    </main>
  );
}
