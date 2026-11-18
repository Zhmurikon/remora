'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ReaderIconButton } from './ReaderToolbar';

type OutlineLesson = { id: string; title: string };
type OutlineSection = { id: string; title: string; articles: OutlineLesson[] };

export function ReaderOutline<Section extends OutlineSection>({
  sections,
  selected,
  articleId,
  mobileOpen,
  onToggle,
  onHide,
  onSelect,
  lessonLink,
  expandAll = false,
}: {
  sections: Section[];
  selected?: Section;
  articleId?: string;
  mobileOpen: boolean;
  onToggle: () => void;
  onHide: () => void;
  onSelect?: (section: Section) => void;
  lessonLink: (lesson: OutlineLesson, current: boolean, closeMenu: () => void) => ReactNode;
  expandAll?: boolean;
}) {
  const navId = useId();
  const outline = useRef<HTMLElement>(null);
  const [expandedId, setExpandedId] = useState(selected?.id);
  useEffect(() => setExpandedId(selected?.id), [selected?.id, articleId]);
  useEffect(() => {
    const list = outline.current;
    const lesson = list?.querySelector('[aria-current]');
    if (!list?.clientHeight || !lesson) return;
    // При смене урока прокручиваем только оглавление, сохраняя положение статьи.
    const bounds = list.getBoundingClientRect();
    const item = lesson.getBoundingClientRect();
    if (item.top < bounds.top) list.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
  }, [articleId, expandedId, mobileOpen]);

  const label = articleId ? 'Уроки курса' : 'Разделы курса';
  return (
    <aside className="reader-rail" data-open={mobileOpen}>
      <div className="reader-rail-heading">
        <h2>{label}</h2>
        {articleId && (
          <ReaderIconButton icon="outline" label="Скрыть список уроков" onClick={onHide} />
        )}
      </div>
      <button
        type="button"
        className="reader-mobile-toggle"
        aria-expanded={mobileOpen}
        aria-controls={navId}
        onClick={onToggle}
      >
        {label}
        <span className="reader-caret" aria-hidden="true" />
      </button>
      <nav ref={outline} id={navId} aria-label="Оглавление курса">
        {sections.map((s, i) => {
          const expanded = expandAll || (Boolean(articleId) && expandedId === s.id);
          return (
            <div key={s.id} className="reader-chapter">
              <button
                type="button"
                className="reader-chapter-button"
                data-selected={s.id === selected?.id}
                aria-pressed={articleId ? undefined : s.id === selected?.id}
                aria-expanded={articleId ? expanded : undefined}
                onClick={() =>
                  articleId ? setExpandedId(expanded ? undefined : s.id) : onSelect?.(s)
                }
              >
                <span className="reader-number">{String(i + 1).padStart(2, '0')}</span>
                <span>{s.title}</span>
              </button>
              {expanded &&
                (s.articles.length ? (
                  <ul className="reader-sublinks">
                    {s.articles.map((a) => (
                      <li key={a.id}>
                        {lessonLink(a, a.id === articleId, () => {
                          if (mobileOpen) onToggle();
                        })}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="reader-meta">В этом разделе пока нет уроков.</p>
                ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
