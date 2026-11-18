'use client';

import { ReaderHeading, ReaderLayout, ReaderOutline, ReaderToolbar } from '@remora/ui/reader';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { PublicReadingCover } from '../../../components/reading/PublicReadingCover';
import { CourseCoverActions, type CourseActionsData } from './CourseCoverActions';

type Lesson = {
  setId: string;
  id: string;
  title: string;
  meta: string;
  byline: string;
  content: ReactNode;
  resources: ReactNode;
  hasCards: boolean;
};
type Section = { id: string; title: string; articles: Lesson[] };

export function CourseReader({
  sections,
  top,
  course,
  coverDetails,
}: {
  sections: Section[];
  top: ReactNode;
  course: CourseActionsData;
  coverDetails: ReactNode;
}) {
  const lessons = sections.flatMap((section) => section.articles);
  const [location, setLocation] = useState<{ id: string; cards: boolean }>();
  const activeId = location?.id;
  const [largeText, setLargeText] = useState(false);
  const [hideOutline, setHideOutline] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentHeading = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);

  useEffect(() => {
    function readLocation() {
      const hash = window.location.hash;
      const match = sections
        .flatMap((section) => section.articles)
        .find(
          (lesson) =>
            hash === `#article-${lesson.id}` ||
            (lesson.hasCards && hash === `#article-${lesson.id}-cards`),
        );
      if (match) {
        shouldFocus.current = true;
        setMobileOpen(false);
        setLocation({ id: match.id, cards: hash === `#article-${match.id}-cards` });
      } else {
        const first = sections.find((section) => section.articles.length)?.articles[0];
        if (first) setLocation((previous) => (hash && previous) || { id: first.id, cards: false });
      }
    }
    readLocation();
    window.addEventListener('hashchange', readLocation);
    return () => window.removeEventListener('hashchange', readLocation);
  }, [sections]);

  useEffect(() => {
    if (!location || !shouldFocus.current) return;
    const target = location.cards
      ? document.getElementById(`article-${location.id}-cards`)
      : currentHeading.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: 'start' });
    shouldFocus.current = false;
  }, [location]);

  function toggleOutline() {
    setHideOutline(!hideOutline);
    requestAnimationFrame(() => currentHeading.current?.focus({ preventScroll: true }));
  }

  const hasOutline = lessons.length > 1;
  const current = lessons.findIndex((lesson) => lesson.id === activeId);
  function jump(lesson?: Lesson) {
    return (
      lesson && {
        title: lesson.title,
        go: () => {
          window.location.hash = 'article-' + lesson.id;
        },
      }
    );
  }
  return (
    <ReaderLayout
      className="public-reader course-width"
      top={top}
      outline={
        hasOutline &&
        !hideOutline && (
          <ReaderOutline
            sections={sections}
            selected={sections.find((section) =>
              section.articles.some((article) => article.id === activeId),
            )}
            articleId={activeId ?? lessons[0]?.id}
            expandAll={!activeId}
            mobileOpen={mobileOpen || !activeId}
            onToggle={() => setMobileOpen(!mobileOpen)}
            onHide={toggleOutline}
            lessonLink={(lesson, selected, closeMenu) => (
              <a
                href={`#article-${lesson.id}`}
                aria-current={selected ? 'location' : undefined}
                onClick={(event) => {
                  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                  closeMenu();
                  if (event.currentTarget.hash === window.location.hash) {
                    event.preventDefault();
                    shouldFocus.current = true;
                    setLocation({ id: lesson.id, cards: false });
                  }
                }}
              >
                {lesson.title}
              </a>
            )}
          />
        )
      }
    >
      <div className="reader-article">
        <PublicReadingCover title={course.title}>
          {coverDetails}
          <CourseCoverActions course={course} lesson={lessons[current] ?? lessons[0]} />
        </PublicReadingCover>
        {lessons.map((lesson, index) => (
          <article
            key={lesson.id}
            id={`article-${lesson.id}`}
            hidden={!!activeId && activeId !== lesson.id}
            className="course-material"
          >
            <ReaderHeading
              level={2}
              headingRef={activeId === lesson.id ? currentHeading : undefined}
              meta={`Урок ${index + 1} из ${lessons.length} · ${lesson.meta}`}
              title={lesson.title}
            >
              <p className="reader-time">{lesson.byline}</p>
            </ReaderHeading>
            {activeId === lesson.id && (
              <ReaderToolbar
                tabs={
                  <>
                    <a
                      href={`#article-${lesson.id}`}
                      aria-current={location?.cards ? undefined : 'location'}
                    >
                      Материал
                    </a>
                    {lesson.hasCards && (
                      <a
                        href={`#article-${lesson.id}-cards`}
                        aria-current={location?.cards ? 'location' : undefined}
                      >
                        Карточки
                      </a>
                    )}
                  </>
                }
                largeText={largeText}
                toggleText={() => setLargeText(!largeText)}
                showOutline={hideOutline ? toggleOutline : undefined}
                neighbors={
                  hasOutline
                    ? { previous: jump(lessons[current - 1]), next: jump(lessons[current + 1]) }
                    : undefined
                }
              />
            )}
            <div className="course-reading" data-large={largeText}>
              {lesson.content}
            </div>
            {lesson.resources}
          </article>
        ))}
      </div>
    </ReaderLayout>
  );
}
