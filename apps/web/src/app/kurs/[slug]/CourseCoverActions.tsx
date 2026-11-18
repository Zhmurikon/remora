'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CourseLikeButton } from './CourseLikeButton';
import { CourseReactionIcon } from './CourseReactionIcon';
import { ReportCourseForm } from './ReportCourseForm';
import { useLibrarySave } from './useLibrarySave';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5173';

export type CourseActionsData = {
  id: string;
  slug: string;
  title: string;
  likesCount: number;
  savesCount: number;
  liked: boolean;
};

type Lesson = { id: string; title: string; setId: string; hasCards: boolean };

export function CourseCoverActions({
  course,
  lesson,
}: {
  course: CourseActionsData;
  lesson?: Lesson;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const [report, setReport] = useState<'closed' | 'open' | 'sent'>('closed');
  const { save, isSaved, pending, feedback } = useLibrarySave();
  const copyUrl = `${APP_URL}/courses/copy/${encodeURIComponent(course.slug)}`;
  const courseSaved = isSaved('course', course.id);

  function closeMenu() {
    if (menu.current) menu.current.open = false;
    trigger.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    const element = menu.current;
    if (!element) return;
    const closeOutside = (event: Event) => {
      if (element.open && event.target instanceof Node && !element.contains(event.target))
        element.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
    };
  }, []);

  function menuKeys(event: KeyboardEvent<HTMLDetailsElement>) {
    const details = event.currentTarget;
    if (event.key === 'Escape' && details.open) {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(
      details.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'),
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    const positions: Record<string, number> = {
      Home: 0,
      End: items.length - 1,
      ArrowDown: (index + 1) % items.length,
      ArrowUp: index <= 0 ? items.length - 1 : index - 1,
    };
    event.preventDefault();
    details.open = true;
    items[positions[event.key]!]?.focus();
  }

  function closeReport(sent: boolean) {
    setReport(sent ? 'sent' : 'closed');
    trigger.current?.focus({ preventScroll: true });
  }

  return (
    <div className="course-cover-footer">
      <button
        type="button"
        className="course-primary"
        disabled={pending || courseSaved}
        onClick={() => void save('course', course.id, 'Курс сохранён в библиотеке.')}
      >
        <CourseReactionIcon icon="bookmark" />
        {courseSaved ? 'Курс сохранён' : 'Сохранить курс'}
      </button>
      <div className="course-reactions">
        <CourseLikeButton
          slug={course.slug}
          initialCount={course.likesCount}
          initialLiked={course.liked}
        />
        <span className="course-stat" title={`Сохранений: ${course.savesCount}`}>
          <CourseReactionIcon icon="bookmark" />
          <span className="sr-only">Сохранений: </span>
          {course.savesCount}
        </span>
        <details ref={menu} className="course-more" onKeyDown={menuKeys}>
          <summary
            ref={trigger}
            className="reader-control course-reaction"
            aria-label="Ещё действия"
            title="Ещё действия"
          >
            <CourseReactionIcon icon="more" />
          </summary>
          <div
            className="course-more-list shadow-pop"
            role="group"
            aria-label="Действия с материалом"
          >
            <a href={copyUrl} onClick={closeMenu}>
              Сделать копию
            </a>
            <button
              type="button"
              disabled={report === 'sent'}
              onClick={() => {
                closeMenu();
                setReport('open');
              }}
            >
              Пожаловаться
            </button>
            {lesson && (
              <>
                <a
                  className="course-menu-divider"
                  href={`${copyUrl}?article=${lesson.id}&text_only=1`}
                  onClick={closeMenu}
                >
                  Скопировать только статью
                </a>
                {lesson.hasCards && (
                  <a href={`${copyUrl}?set=${lesson.setId}`} onClick={closeMenu}>
                    Скопировать только карточки
                  </a>
                )}
                <button
                  type="button"
                  disabled={pending || isSaved('article', lesson.id)}
                  onClick={() => {
                    closeMenu();
                    void save(
                      'article',
                      lesson.id,
                      `Статья «${lesson.title}» сохранена в библиотеке.`,
                    );
                  }}
                >
                  Сохранить только статью
                </button>
                {lesson.hasCards && (
                  <button
                    type="button"
                    disabled={pending || isSaved('set', lesson.setId)}
                    onClick={() => {
                      closeMenu();
                      void save(
                        'set',
                        lesson.setId,
                        `Карточки урока «${lesson.title}» сохранены в библиотеке.`,
                      );
                    }}
                  >
                    Сохранить только карточки
                  </button>
                )}
              </>
            )}
          </div>
        </details>
      </div>
      {feedback && (
        <p
          className={feedback.error ? 'course-feedback text-danger' : 'course-feedback'}
          role={feedback.error ? 'alert' : 'status'}
        >
          {feedback.message}
          {!feedback.error && (
            <>
              {' '}
              <a href={`${APP_URL}/library/manage`}>Открыть библиотеку</a>
            </>
          )}
        </p>
      )}
      {report === 'sent' && (
        <p className="course-feedback" role="status">
          Жалоба отправлена. Курс остаётся доступным, пока её не рассмотрит модератор.
        </p>
      )}
      {report === 'open' && (
        <ReportCourseForm
          slug={course.slug}
          onClose={() => closeReport(false)}
          onSent={() => closeReport(true)}
        />
      )}
    </div>
  );
}
