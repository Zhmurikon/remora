import { JsonLd } from '../../components/JsonLd';
import { CollectionCards } from '../../components/collections/CollectionCards';
import {
  collectionMetadata,
  collectionsStructuredData,
  publishedCollections,
} from '../../lib/collections';

export function generateMetadata() {
  return collectionMetadata(undefined, publishedCollections().length > 0);
}

export default function CollectionsPage() {
  return (
    <>
      <JsonLd data={collectionsStructuredData()} />
      <header className="blog-intro">
        <span className="home-kicker">Подборки Remora</span>
        <h1>
          Меньше искать.
          <br />
          <span>Больше разбираться.</span>
        </h1>
        <p>
          Курсы по одной теме, собранные редакцией. Выберите то, что интересно сейчас, и переходите
          к учёбе.
        </p>
      </header>
      <section aria-label="Редакционные подборки">
        <CollectionCards collections={publishedCollections()} />
      </section>
      <aside className="blog-cta">
        <div>
          <span className="home-kicker">Свой материал</span>
          <h2>Учитесь по своему конспекту</h2>
          <p>Создайте карточки или импортируйте готовый набор.</p>
        </div>
        <a className="home-button" href="/register">
          Создать карточки <span aria-hidden="true">→</span>
        </a>
      </aside>
    </>
  );
}
