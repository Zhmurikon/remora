'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type OutlineSection = { id: string; title: string; articles: { id: string; title: string }[] };

export function CourseReader({
  sections,
  children,
}: {
  sections: OutlineSection[];
  children: ReactNode;
}) {
  const hasOutline = sections.reduce((total, section) => total + section.articles.length, 0) > 1;
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reader = root.current;
    const menu = reader?.querySelector('details');
    const nav = menu?.querySelector('nav');
    if (!reader || !menu || !nav) return;
    const articles = Array.from(reader.querySelectorAll<HTMLElement>('.course-material'));
    const links = Array.from(nav.querySelectorAll('a'));
    const compact = window.matchMedia('(max-width: 48rem)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const controller = new AbortController();
    const { signal } = controller;
    let current = articles[0]!;
    let headingMotion: Animation | undefined;

    function positionMarker() {
      const link = links.find((item) => item.hash.slice(1) === current.id);
      if (!link || !nav || !menu?.open) return;
      nav.style.setProperty('--marker-y', link.offsetTop + 'px');
      nav.style.setProperty('--marker-height', link.offsetHeight + 'px');
    }

    function applyLocation(focusHeading: boolean) {
      const target = articles.find((article) => article.id === window.location.hash.slice(1));
      current = target ?? (window.location.hash ? current : articles[0]!);
      // Все статьи остаются в DOM: сохраняются дочитанные карточки, а без JS работают обычные якоря.
      for (const article of articles) article.hidden = article !== current;
      for (const link of links) {
        if (link.hash.slice(1) === current.id) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
      positionMarker();
      if (!target || !focusHeading) return;
      if (compact.matches && menu) menu.open = false;
      const heading = current.querySelector<HTMLElement>('.course-material-title')!;
      heading.focus({ preventScroll: true });
      const bounds = heading.getBoundingClientRect();
      if (compact.matches || bounds.top < 0 || bounds.bottom > window.innerHeight) {
        current.scrollIntoView({ block: 'start' });
      }
      headingMotion?.cancel();
      if (!reduced.matches) {
        headingMotion = heading.animate(
          [
            { opacity: 0.68, transform: 'translateY(5px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 260, easing: 'ease-out' },
        );
      }
    }

    function resizeMenu() {
      if (menu) menu.open = !compact.matches;
      positionMarker();
    }
    resizeMenu();
    applyLocation(Boolean(window.location.hash));
    compact.addEventListener('change', resizeMenu, { signal });
    reduced.addEventListener('change', () => headingMotion?.cancel(), { signal });
    window.addEventListener('hashchange', () => applyLocation(true), { signal });
    menu.addEventListener('toggle', positionMarker, { signal });
    nav.addEventListener(
      'click',
      (event) => {
        const link = event.target instanceof Element ? event.target.closest('a') : null;
        if (
          link?.hash === window.location.hash &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          applyLocation(true);
        }
      },
      { signal },
    );
    const observer = new ResizeObserver(positionMarker);
    observer.observe(nav);
    return () => {
      controller.abort();
      observer.disconnect();
      headingMotion?.cancel();
      for (const article of articles) article.hidden = false;
    };
  }, [sections]);

  return (
    <div className="course-reader course-width" ref={root}>
      {hasOutline && (
        <details className="course-index" open>
          <summary>Оглавление</summary>
          <nav aria-label="Оглавление курса">
            <span className="course-index-marker" aria-hidden="true" />
            {sections.map((section) => (
              <div key={section.id}>
                <p>{section.title}</p>
                {section.articles.map((article) => (
                  <a key={article.id} href={`#article-${article.id}`}>
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
