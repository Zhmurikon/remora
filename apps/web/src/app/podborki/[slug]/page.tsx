import { PublicAnalytics } from '../../../components/analytics/PublicAnalytics';
import { notFound } from 'next/navigation';
import { JsonLd } from '../../../components/JsonLd';
import {
  CollectionArt,
  SelectedCourseCards,
} from '../../../components/collections/CollectionCards';
import {
  collectionMetadata,
  collectionsStructuredData,
  getCollection,
  loadCollectionCourses,
} from '../../../lib/collections';
import { formatBlogDate } from '../../../lib/blog';

// Доступность оригиналов проверяется при каждом запросе, в том числе после снятия публикации.
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const collection = getCollection((await params).slug);
  if (!collection) notFound();
  const result = await loadCollectionCourses(collection);
  return collectionMetadata(collection, result.ok && result.courses.length > 0);
}

export default async function CollectionPage({ params }: Props) {
  const collection = getCollection((await params).slug);
  if (!collection) notFound();
  const result = await loadCollectionCourses(collection);
  return (
    <div className="collection-detail">
      <PublicAnalytics path={`/podborki/${encodeURIComponent(collection.slug)}`} />
      {result.ok && <JsonLd data={collectionsStructuredData(collection, result.courses)} />}
      <nav className="collection-breadcrumbs" aria-label="Хлебные крошки">
        <ol>
          <li>
            <a href="/">Главная</a>
          </li>
          <li>
            <a href="/podborki">Подборки</a>
          </li>
          <li aria-current="page">{collection.title}</li>
        </ol>
      </nav>
      <header className="collection-hero">
        <div className="collection-hero-copy">
          <h1>{collection.title}</h1>
          <p className="collection-description-lead">{collection.description}</p>
          <p className="collection-updated">
            Редакция «Запоминальни» · Обновлено{' '}
            <time dateTime={collection.updatedAt}>{formatBlogDate(collection.updatedAt)}</time>
          </p>
        </div>
        <CollectionArt tone={collection.tone} />
      </header>
      <section className="collection-selection" aria-labelledby="selected-courses">
        <div className="collection-context">
          <h2 id="selected-courses">Что изучить</h2>
          <p>{collection.introduction}</p>
          <aside className="collection-hint">
            Курсы принадлежат их авторам. Сохраняйте нужные материалы в библиотеку и учитесь в своём
            темпе.
          </aside>
        </div>
        {!result.ok ? (
          <div className="collection-result-state">
            <h3>Не удалось загрузить курсы</h3>
            <p role="alert">Материалы временно недоступны. Попробуйте обновить страницу.</p>
            <a className="collection-action" href={`/podborki/${collection.slug}`}>
              Попробовать ещё раз
            </a>
          </div>
        ) : result.courses.length === 0 ? (
          <div className="collection-result-state">
            <h3>В подборке пока нет доступных курсов</h3>
            <p>Материалы могли быть сняты с публикации. Другие темы можно найти в каталоге.</p>
            <a className="collection-action" href="/kursy">
              Перейти в каталог
            </a>
          </div>
        ) : (
          <SelectedCourseCards collection={collection} courses={result.courses} />
        )}
      </section>
      <footer className="collection-closing">
        <a className="collection-back" href="/podborki">
          <span aria-hidden="true">←</span> Все подборки
        </a>
        <a className="collection-catalog-link" href="/kursy">
          Найти курсы по другой теме <span aria-hidden="true">→</span>
        </a>
      </footer>
    </div>
  );
}
