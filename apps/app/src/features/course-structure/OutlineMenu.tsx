import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { CourseIcon } from '../../components/CourseAction';
import type { OutlineSection, Position } from './order';

type Page = 'actions' | 'sections' | 'remove';

export function OutlineMenu({
  sections,
  position,
  onMove,
  onRemove,
}: {
  sections: OutlineSection[];
  position: Position;
  onMove: (to: Position) => void;
  onRemove: () => void;
}) {
  const { section, lesson } = position;
  const group = sections[section]!;
  const article = lesson === undefined ? undefined : group.articles[lesson];
  const label =
    lesson === undefined
      ? `Действия с разделом ${section + 1}`
      : `Действия с уроком ${section + 1}.${lesson + 1}`;
  const removeLabel = article ? 'Удалить урок' : 'Удалить раздел';
  const index = lesson ?? section;
  const length = article ? group.articles.length : sections.length;
  const [page, setPage] = useState<Page | null>(null);
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const startAtEnd = useRef(false);

  function close() {
    setPage(null);
    anchor.current?.focus({ preventScroll: true });
  }
  useLayoutEffect(() => {
    const trigger = anchor.current;
    const popup = panel.current;
    if (!page || !trigger || !popup) return;
    function positionPopup() {
      if (!trigger || !popup) return;
      const rect = trigger.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 10;
      const above = rect.top - 10;
      const up = below < popup.scrollHeight + 2 && above > below;
      popup.style.top = up ? 'auto' : 'calc(100% + 3px)';
      popup.style.bottom = up ? 'calc(100% + 3px)' : 'auto';
      popup.style.maxHeight = Math.max(0, up ? above : below) + 'px';
      popup.style.left = Math.max(8 - rect.left, rect.width - popup.offsetWidth) + 'px';
    }
    function dismissOutside(e: Event) {
      if (e.target instanceof Node && !trigger?.parentElement?.contains(e.target)) setPage(null);
    }
    positionPopup();
    const items = popup.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not(:disabled), button:not(:disabled)',
    );
    const initial = startAtEnd.current ? items[items.length - 1] : items[0];
    initial?.focus({ preventScroll: true });
    startAtEnd.current = false;
    window.addEventListener('resize', positionPopup);
    document.addEventListener('scroll', positionPopup, true);
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('focusin', dismissOutside);
    return () => {
      window.removeEventListener('resize', positionPopup);
      document.removeEventListener('scroll', positionPopup, true);
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('focusin', dismissOutside);
    };
  }, [page]);

  function navigate(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (page === 'remove') return;
    if (e.key === 'Tab') {
      close();
      return;
    }
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'),
    );
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: items.length - 1 }[
      e.key
    ];
    if (next === undefined || !items.length) return;
    e.preventDefault();
    items[(next + items.length) % items.length]?.focus();
  }
  function move(to: Position) {
    close();
    onMove(to);
  }
  const adjacent = (offset: number) =>
    lesson === undefined ? { section: section + offset } : { section, lesson: lesson + offset };
  return (
    <div className="outline-menu-anchor">
      <button
        ref={anchor}
        type="button"
        className="outline-more"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={!!page}
        aria-controls={page ? id : undefined}
        onClick={() => setPage(page ? null : 'actions')}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            startAtEnd.current = e.key === 'ArrowUp';
            setPage('actions');
          }
        }}
      >
        <CourseIcon name="more" />
      </button>
      {page && (
        <div
          ref={panel}
          id={id}
          className="outline-menu"
          role={page === 'remove' ? 'dialog' : 'menu'}
          aria-label={
            page === 'remove' ? removeLabel : page === 'sections' ? 'Перенести в раздел' : label
          }
          aria-describedby={page === 'remove' ? id + '-message' : undefined}
          onKeyDown={navigate}
        >
          {page === 'actions' && (
            <>
              {article?.id && (
                <Link
                  tabIndex={-1}
                  role="menuitem"
                  to={`/sets/${article.set_id}/edit`}
                  onClick={() => setPage(null)}
                >
                  <CourseIcon name="cards" />
                  Редактировать карточки
                </Link>
              )}
              <button
                role="menuitem"
                tabIndex={-1}
                type="button"
                disabled={index === 0}
                onClick={() => move(adjacent(-1))}
              >
                <CourseIcon name="up" />
                Переместить выше
              </button>
              <button
                role="menuitem"
                tabIndex={-1}
                type="button"
                disabled={index === length - 1}
                onClick={() => move(adjacent(1))}
              >
                <CourseIcon name="down" />
                Переместить ниже
              </button>
              {article && (
                <button
                  role="menuitem"
                  tabIndex={-1}
                  type="button"
                  disabled={sections.length < 2}
                  onClick={() => setPage('sections')}
                >
                  <CourseIcon name="move" />
                  Перенести в раздел…
                </button>
              )}
              <button
                role="menuitem"
                tabIndex={-1}
                type="button"
                className="outline-menu-danger"
                onClick={() => setPage('remove')}
              >
                <CourseIcon name="trash" />
                {removeLabel}
              </button>
            </>
          )}
          {page === 'sections' && (
            <>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => setPage('actions')}
              >
                <span className="outline-menu-back">
                  <CourseIcon name="chevron" />
                </span>
                Назад
              </button>
              {sections.map(
                (s, i) =>
                  i !== section && (
                    <button
                      key={s.key}
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      onClick={() => move({ section: i, lesson: s.articles.length })}
                    >
                      <CourseIcon name="folder" />
                      {s.title}
                    </button>
                  ),
              )}
            </>
          )}
          {page === 'remove' && (
            <>
              <p id={id + '-message'}>
                {article
                  ? 'Удалить текст урока? Набор карточек останется.'
                  : 'Удалить раздел и тексты его уроков? Наборы карточек останутся.'}{' '}
                Изменение применится после сохранения.
              </p>
              <button type="button" onClick={() => setPage('actions')}>
                <CourseIcon name="cancel" />
                Отмена
              </button>
              <button
                type="button"
                className="outline-menu-danger"
                onClick={() => {
                  close();
                  onRemove();
                }}
              >
                <CourseIcon name="trash" />
                Подтвердить удаление
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
