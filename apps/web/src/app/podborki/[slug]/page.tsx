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
    <>
      {result.ok && <JsonLd data={collectionsStructuredData(collection, result.courses)} />}
      <nav className="blog-breadcrumbs" aria-label="Хлебные крошки">
        <a href="/">Главная</a>
        <span aria-hidden="true">/</span>
        <a href="/podborki">Подборки</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{collection.title}</span>
      </nav>
      <header className="collection-hero">
        <div>
          <span className="home-kicker">Выбор редакции</span>
          <h1>{collection.title}</h1>
          <p>{collection.description}</p>
          <p className="blog-meta">
            Редакция Remora · Обновлено{' '}
            <time dateTime={collection.updatedAt}>{formatBlogDate(collection.updatedAt)}</time>
          </p>
        </div>
        <CollectionArt tone={collection.tone} />
      </header>
      <section className="collection-selection" aria-labelledby="selected-courses">
        <div className="collection-context">
          <h2 id="selected-courses">Что изучить</h2>
          <p>{collection.introduction}</p>
          <p className="collection-hint">
            Курсы принадлежат их авторам. Сохраняйте нужные материалы в библиотеку и учитесь в своём
            темпе.
          </p>
        </div>
        {!result.ok ? (
          <div className="collection-empty">
            <h3>Не удалось загрузить курсы</h3>
            <p role="alert">Материалы временно недоступны. Попробуйте обновить страницу.</p>
            <a className="home-link" href={`/podborki/${collection.slug}`}>
              Попробовать ещё раз →
            </a>
          </div>
        ) : result.courses.length === 0 ? (
          <div className="collection-empty">
            <h3>В подборке пока нет доступных курсов</h3>
            <p>Материалы могли быть сняты с публикации. Другие темы можно найти в каталоге.</p>
            <a className="home-link" href="/kursy">
              Перейти в каталог →
            </a>
          </div>
        ) : (
          <SelectedCourseCards collection={collection} courses={result.courses} />
        )}
      </section>
      <a className="home-link collection-back" href="/podborki">
        ← Все подборки
      </a>
    </>
  );
}
