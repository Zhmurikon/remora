import { PublicAnalytics } from '../../components/analytics/PublicAnalytics';
import { JsonLd } from '../../components/JsonLd';
import { CollectionCards } from '../../components/collections/CollectionCards';
import './collection-index.css';
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
      <PublicAnalytics path="/podborki" />
      <JsonLd data={collectionsStructuredData()} />
      <div className="collections-index">
        <header className="collections-intro">
          <div>
            <h1>
              Меньше искать.
              <br />
              <span>Больше разбираться.</span>
            </h1>
            <p>
              Курсы по одной теме, собранные редакцией. Выберите то, что интересно сейчас, и
              переходите к учёбе.
            </p>
          </div>
          <img
            className="collections-intro-art"
            src="/lecture-demo/create-tray.webp"
            width="494"
            height="335"
            alt=""
          />
        </header>
        <section aria-label="Редакционные подборки">
          <CollectionCards collections={publishedCollections()} />
        </section>
        <aside className="collections-create">
          <img
            src="/lecture-demo/pricing-cards.webp"
            width="232"
            height="184"
            alt=""
            loading="lazy"
          />
          <div>
            <h2>Учитесь по своему конспекту</h2>
            <p>Создайте карточки или импортируйте готовый набор.</p>
          </div>
          <a className="collections-button collections-button-outline" href="/register">
            Создать карточки
          </a>
        </aside>
      </div>
    </>
  );
}
