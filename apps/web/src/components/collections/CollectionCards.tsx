import type { EditorialCollection } from '../../content/collections';
import type { CollectionCourse } from '../../lib/collections';

export function CollectionArt({ tone }: { tone: EditorialCollection['tone'] }) {
  return (
    <div className={`collection-art collection-art-${tone}`} aria-hidden="true">
      <img
        src="/images/collections/study-folder.webp"
        width="1200"
        height="800"
        alt=""
        fetchPriority="high"
      />
      <span>Выбор редакции</span>
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
        <a className="collections-button" href="/kursy">
          Найти курс <span aria-hidden="true">→</span>
        </a>
      </div>
    );
  return (
    <div className="collections-folders">
      {collections.map((collection) => (
        <article className="collections-folder" key={collection.slug}>
          <span className="collections-folder-tab">Выбор редакции</span>
          <a className="collections-folder-link" href={`/podborki/${collection.slug}`}>
            <img
              className="collections-folder-art"
              src="/images/collections/study-folder.webp"
              width="1200"
              height="800"
              alt=""
            />
            <div className="collections-folder-copy">
              <h2>{collection.title}</h2>
              <p>{collection.description}</p>
              <span className="collections-button">Посмотреть курсы</span>
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
            <p className="collection-number" aria-label={`Материал ${index + 1}`}>
              {String(index + 1).padStart(2, '0')}
            </p>
            <div className="collection-course-copy">
              <h3>
                <a href={`/kurs/${course.slug}`}>
                  <span>{course.title}</span>
                  <span aria-hidden="true">→</span>
                </a>
              </h3>
              {course.description && <p className="collection-description">{course.description}</p>}
              <p className="collection-course-meta">
                {course.author} · Карточек: {course.cards_count} · Сохранений: {course.saves_count}
              </p>
              <p className="collection-note">
                <strong>От редакции</strong>
                {collection.courses.find((item) => item.id === course.id)?.note}
              </p>
            </div>
          </article>
        </li>
      ))}
    </ol>
  );
}
