import { PublicAnalytics } from '../../components/analytics/PublicAnalytics';
import type { components } from '@remora/api-client';
import Image from 'next/image';
import './catalog.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicAuthLink } from '../../components/auth/PublicSession';
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
    description: 'Найдите учебный курс и карточки по интересующей теме в сервисе «Запоминальня».',
    alternates: { canonical: '/kursy' },
    robots: { index: catalogParams(await searchParams).size === 0, follow: true },
    openGraph: {
      title: 'Каталог курсов',
      description: 'Найдите учебный курс и карточки по интересующей теме в сервисе «Запоминальня».',
      type: 'website',
      url: '/kursy',
      images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: 'Каталог Запоминальня' }],
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
  return (
    <main className="course-catalog">
      <PublicAnalytics path="/kursy" />
      {params.size === 0 && result && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            url: absoluteUrl('/kursy'),
            name: 'Каталог курсов «Запоминальни»',
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
      <nav aria-label="Основная навигация" className="catalog-nav">
        <div className="catalog-wrap">
          <Link href="/" className="catalog-brand">
            <Image src="/lecture-demo/remora-icon.png" alt="" width={40} height={40} />
            Запоминальня
          </Link>
          <PublicAuthLink className="catalog-link" />
        </div>
      </nav>
      <header className="catalog-hero">
        <div className="catalog-wrap">
          <div className="catalog-intro">
            <p className="catalog-eyebrow">Учебные материалы сообщества</p>
            <h1>
              Найдите <em>свою тему</em>
            </h1>
            <p className="catalog-lead">
              Курсы и карточки для следующего занятия, зачёта или нового интереса.
            </p>
            <Link href="/podborki" className="catalog-link">
              Подборки редакции →
            </Link>
          </div>
          <div className="catalog-drawer" aria-hidden="true">
            <Image
              src="/lecture-demo/catalog-drawer.webp"
              width={380}
              height={288}
              alt=""
              unoptimized
            />
          </div>
        </div>
      </header>
      <div className="catalog-wrap">
        <form action="/kursy" method="get" role="search" className="catalog-form">
          <div className="catalog-search">
            <label>
              Что хотите изучить?
              <input
                name="q"
                defaultValue={params.get('q') ?? ''}
                maxLength={200}
                placeholder="Например, линейная алгебра"
              />
            </label>
            <button type="submit">Найти курсы</button>
          </div>
          {params.get('author_id') && (
            <div className="text-fg-muted text-sm">
              Показаны курсы выбранного автора.
              <input type="hidden" name="author_id" value={params.get('author_id')!} />
            </div>
          )}
          <div className="catalog-filters">
            <label>
              Тег
              <input
                name="tag"
                maxLength={60}
                defaultValue={params.get('tag') ?? ''}
                placeholder="математика"
              />
            </label>
            <label>
              Язык
              <select name="language" defaultValue={params.get('language') ?? ''}>
                <option value="">Любой</option>
                <option value="ru">Русский</option>
                <option value="en">Английский</option>
                <option value="de">Немецкий</option>
                <option value="fr">Французский</option>
                <option value="es">Испанский</option>
                <option value="zh">Китайский</option>
              </select>
            </label>
            <label>
              Обновлены после
              <input
                type="date"
                name="updated_after"
                defaultValue={params.get('updated_after') ?? ''}
              />
            </label>
            <label>
              Минимум карточек
              <input
                type="number"
                min={0}
                name="min_cards"
                defaultValue={params.get('min_cards') ?? ''}
              />
            </label>
            <label>
              Максимум карточек
              <input
                type="number"
                min={0}
                name="max_cards"
                defaultValue={params.get('max_cards') ?? ''}
              />
            </label>
            <label>
              Порядок
              <select name="sort" defaultValue={params.get('sort') ?? 'relevance'}>
                <option value="relevance">По соответствию запросу</option>
                <option value="popular">Сначала популярные</option>
                <option value="updated">Недавно обновлённые</option>
                <option value="cards">Больше карточек</option>
              </select>
            </label>
          </div>
          <Link href="/kursy" className="catalog-link">
            Сбросить поиск и фильтры
          </Link>
        </form>
        <section aria-label="Результаты поиска" className="catalog-results">
          <h2>Курсы</h2>
          {error && (
            <div className="catalog-notice">
              <p role="alert">{error}</p>
              <Link className="catalog-link" href={`/kursy?${params}`}>
                Попробовать ещё раз
              </Link>
            </div>
          )}
          {result?.items.length === 0 && (
            <div className="catalog-notice">
              <h3>Курсы не найдены</h3>
              <p className="text-fg-muted mt-2">
                Попробуйте другую тему или уберите часть фильтров.
              </p>
            </div>
          )}
          <div className="catalog-list">
            {result?.items.map((course) => (
              <article key={course.id} className="catalog-course">
                <div className="catalog-tags">
                  {course.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
                <h3>
                  <Link href={`/kurs/${course.slug}`}>{course.title}</Link>
                </h3>
                {course.description && (
                  <p className="catalog-description line-clamp-3">{course.description}</p>
                )}
                <p className="catalog-meta">
                  Карточек: {course.cards_count} · Сохранений: {course.saves_count} ·{' '}
                  {course.languages.join(', ').toUpperCase()}
                </p>
                <div className="catalog-foot">
                  <Link className="catalog-link" href={`/kursy?author_id=${course.author_id}`}>
                    {course.author}
                  </Link>
                  <span>
                    Обновлён{' '}
                    {new Date(course.updated_at).toLocaleDateString('ru-RU', { timeZone: 'UTC' })}
                  </span>
                </div>
              </article>
            ))}
          </div>
          {result?.next_cursor != null && (
            <Link href={`/kursy?${next}`} className="catalog-link">
              Следующие курсы →
            </Link>
          )}
        </section>
      </div>
    </main>
  );
}
