import type { EditorialCollection } from '../../content/collections';
import type { CollectionCourse } from '../../lib/collections';

export function CollectionArt({ tone }: { tone: EditorialCollection['tone'] }) {
  return (
    <div className={`collection-art blog-tone-${tone}`} aria-hidden="true">
      <span className="collection-art-orbit" />
      <div className="collection-art-sheet">
        <span />
        <i />
        <i />
        <i />
      </div>
      <div className="collection-art-sheet">
        <span />
        <i />
        <i />
        <i />
      </div>
      <div className="collection-art-sheet">
        <span />
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

export function CollectionCards({ collections }: { collections: readonly EditorialCollection[] }) {
  if (!collections.length)
    return (
      <div className="collection-empty">
        <h2>Первые подборки готовятся</h2>
        <p>
          Здесь появятся курсы, которые редакция объединит по темам. Пока можно найти материалы
          самостоятельно в каталоге.
        </p>
        <a className="home-button" href="/kursy">
          Найти курс <span aria-hidden="true">→</span>
        </a>
      </div>
    );
  return (
    <div className="blog-grid">
      {collections.map((collection) => (
        <article className="blog-card" key={collection.slug}>
          <a className="blog-card-link" href={`/podborki/${collection.slug}`}>
            <CollectionArt tone={collection.tone} />
            <div className="blog-card-copy">
              <span className="home-kicker">Выбор редакции</span>
              <h2>{collection.title}</h2>
              <p>{collection.description}</p>
              <span className="home-link">
                Посмотреть курсы <span aria-hidden="true">→</span>
              </span>
            </div>
          </a>
        </article>
      ))}
    </div>
  );
}

export function SelectedCourseCards({
  collection,
  courses,
}: {
  collection: EditorialCollection;
  courses: CollectionCourse[];
}) {
  return (
    <ol className="collection-courses">
      {courses.map((course, index) => (
        <li key={course.id}>
          <article className="collection-course">
            <span className="collection-number" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="collection-course-copy">
              <h3>
                <a href={`/kurs/${course.slug}`}>{course.title}</a>
              </h3>
              {course.description && <p className="collection-description">{course.description}</p>}
              <p className="blog-meta">
                {course.author} · Карточек: {course.cards_count} · Сохранений: {course.saves_count}
              </p>
              <p className="collection-note">
                <span>От редакции</span>
                {collection.courses.find((item) => item.id === course.id)?.note}
              </p>
            </div>
          </article>
        </li>
      ))}
    </ol>
  );
}
