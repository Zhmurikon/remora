import type { ReactNode } from 'react';

type OutlineSection = { id: string; title: string; articles: { id: string; title: string }[] };

export function CourseReader({
  sections,
  children,
}: {
  sections: OutlineSection[];
  children: ReactNode;
}) {
  const hasOutline = sections.reduce((total, section) => total + section.articles.length, 0) > 1;
  return (
    <div className="course-reader course-width">
      {hasOutline && (
        <details className="course-index" open>
          <summary>Оглавление</summary>
          <nav aria-label="Оглавление курса">
            {sections.map((section) => (
              <div key={section.id}>
                <p>{section.title}</p>
                {section.articles.map((article) => (
                  <a key={article.id} href={`#article-${article.id}`}>
                    <span aria-hidden="true" />
                    {article.title}
                  </a>
                ))}
              </div>
            ))}
          </nav>
        </details>
      )}
      <div className="course-pages">{children}</div>
    </div>
  );
}
