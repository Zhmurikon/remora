/**
 * Режим «Карточки»: переворот, навигация, свайпы, автопроигрывание.
 *
 * По умолчанию это просмотр без влияния на расписание — так решено в
 * docs/02-functional-spec.md. Метка «знаю / не знаю» пишет в FSRS только когда
 * пользователь сам включил «учитывать в расписании».
 */

import { Button } from '@remora/ui';
import { pluralWithCount } from '@remora/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SessionSummary } from './SessionSummary';
import { StudyShell, StudyState } from './StudyShell';
import { useStudyTransition } from './study-transition';
import { StudyFlipCard } from './StudyFlipCard';
import { useCardTraining } from './use-card-training';
import { type StudyScope } from './use-study-session';

const AUTOPLAY_MS = 4000;

const scopeLabels: Record<StudyScope, string> = {
  all: 'все карточки',
  due: 'к повторению',
  hard: 'только сложные',
  new: 'только новые',
};

export function FlashcardsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const scope = (params.get('scope') as StudyScope | null) ?? 'all';
  const track = params.get('track') === '1';

  const [flipped, setFlipped] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const { schedule, cancel, bodyRef } = useStudyTransition();

  const {
    query,
    current,
    answeredItem,
    setAnsweredItem,
    items,
    index,
    answers,
    answer,
    targetId,
    backHref,
    backLabel,
    finished,
    setFinished,
    finalizeSession,
    shownAt,
    goTo,
  } = useCardTraining({
    mode: 'flashcards',
    scope,
    shuffle: params.get('shuffle') !== '0',
    trackProgress: track,
  });

  const displayIndex = answeredItem ? index - 1 : index;
  const move = useCallback(
    (delta: number) => {
      if (answeredItem) return;
      setFlipped(false);
      shownAt.current = Date.now();
      goTo(Math.max(0, Math.min(items.length, index + delta)));
    },
    [answeredItem, goTo, index, items.length, shownAt],
  );

  const mark = useCallback(
    (known: boolean) => {
      if (!current || answeredItem) return;
      if (known) setAnsweredItem(current);
      answer({
        item: current,
        rating: known ? 3 : 1,
        correct: known,
        durationMs: Date.now() - shownAt.current,
        updatesSchedule: track,
      });
      const advance = () => {
        setAnsweredItem(null);
        setFlipped(false);
        shownAt.current = Date.now();
      };
      if (known) schedule(advance, 300);
      else advance();
    },
    [answer, answeredItem, current, schedule, setAnsweredItem, shownAt, track],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        answeredItem ||
        finished ||
        !current ||
        (event.target instanceof HTMLElement &&
          event.target.closest('input, textarea, select, [contenteditable="true"]'))
      )
        return;
      if (
        (event.key === ' ' || event.key === 'Enter') &&
        event.target instanceof HTMLElement &&
        event.target.closest('button, a, summary')
      )
        return;
      const actions: Record<string, () => void> = {
        ' ': () => setFlipped((value) => !value),
        Enter: () => setFlipped((value) => !value),
        ArrowRight: () => move(1),
        ArrowLeft: () => move(-1),
        ArrowUp: () => mark(true),
        ArrowDown: () => mark(false),
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answeredItem, current, finished, mark, move]);

  useEffect(() => {
    if (!autoplay || answeredItem || finished || !current) return;
    const timer = setTimeout(() => {
      if (flipped) move(1);
      else setFlipped(true);
    }, AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [autoplay, answeredItem, current, finished, flipped, move]);

  const touchStart = useRef<number | null>(null);

  if (query.isPending) return <StudyState title="Готовим карточки" loading />;
  if (query.isError)
    return (
      <StudyState
        title="Не удалось загрузить карточки"
        error
        actions={
          <>
            <Button onClick={() => void query.refetch()}>Попробовать снова</Button>
            <Button variant="ghost" onClick={() => navigate(backHref)}>
              К материалам
            </Button>
          </>
        }
      >
        Проверьте подключение и попробуйте ещё раз.
      </StudyState>
    );
  if (items.length === 0) {
    return (
      <EmptyQueue
        scope={scope}
        backLabel={backLabel}
        onAll={() => setParams({ scope: 'all' })}
        onBack={() => navigate(backHref)}
      />
    );
  }

  if (finished || !current) {
    return (
      <SessionSummary
        setId={targetId}
        backHref={backHref}
        backLabel={backLabel}
        answers={answers}
        onRestart={async () => {
          if (!(await finalizeSession())) return;
          setFlipped(false);
          setAutoplay(false);
          setFinished(false);
          await query.refetch();
        }}
      />
    );
  }

  return (
    <StudyShell
      bodyRef={bodyRef}
      questionIndex={displayIndex}
      title="Карточки"
      subtitle={`${scopeLabels[scope]} · ${pluralWithCount(items.length, ['карточка', 'карточки', 'карточек'])}`}
      done={index}
      total={items.length}
      onExit={() => {
        cancel();
        void finalizeSession();
        setFinished(true);
      }}
      footer={
        <div className="study-autoplay">
          <label className="text-fg-muted flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={track}
              onChange={(event) => {
                const updated = new URLSearchParams(params);
                updated.set('track', event.target.checked ? '1' : '0');
                setParams(updated);
              }}
              className="h-4 w-4"
            />
            Учитывать в расписании
          </label>
          <Button
            variant="ghost"
            aria-pressed={autoplay}
            onClick={() => setAutoplay((value) => !value)}
          >
            {autoplay ? 'Остановить автопоказ' : 'Автопоказ · 4 секунды'}
          </Button>
        </div>
      }
    >
      <div
        onTouchStart={(event) => {
          touchStart.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          const end = event.changedTouches[0]?.clientX;
          if (start === null || end === undefined) return;
          if (Math.abs(end - start) > 60) move(end < start ? 1 : -1);
        }}
      >
        <StudyFlipCard
          key={`${displayIndex}:${current.card.id}:${current.direction}`}
          item={current}
          flipped={flipped}
          onFlip={() => {
            if (!answeredItem) setFlipped((value) => !value);
          }}
        />
      </div>

      <div className="study-flash-controls">
        <Button
          variant="ghost"
          aria-label="Предыдущая карточка"
          onClick={() => move(-1)}
          disabled={index === 0 || !!answeredItem}
        >
          ← <span className="study-flash-nav-label">Назад</span>
        </Button>
        <Button variant="secondary" disabled={!!answeredItem} onClick={() => mark(false)}>
          Не знаю
        </Button>
        <Button disabled={!!answeredItem} onClick={() => mark(true)}>
          Знаю
        </Button>
        <Button
          variant="ghost"
          aria-label="Следующая карточка"
          disabled={!!answeredItem}
          onClick={() => move(1)}
        >
          <span className="study-flash-nav-label">Вперёд</span> →
        </Button>
      </div>
      <p className="study-shortcuts">
        <kbd>Пробел</kbd> перевернуть · <kbd>← →</kbd> листать · <kbd>↑</kbd> знаю · <kbd>↓</kbd> не
        знаю
      </p>
    </StudyShell>
  );
}

function EmptyQueue({
  scope,
  onAll,
  onBack,
  backLabel,
}: {
  scope: StudyScope;
  backLabel: string;
  onAll: () => void;
  onBack: () => void;
}) {
  return (
    <StudyState title={scope === 'due' ? 'На сегодня всё повторено' : 'Здесь пока нет карточек'}>
      <p className="text-fg-muted mt-2">
        {scope === 'due'
          ? 'Можно пройтись по набору целиком — это не повлияет на расписание.'
          : 'Добавьте карточки в набор или выберите другой фильтр.'}
      </p>
      <div className="study-state-actions">
        {scope !== 'all' && <Button onClick={onAll}>Смотреть все карточки</Button>}
        <Button variant="ghost" onClick={onBack}>
          {backLabel}
        </Button>
      </div>
    </StudyState>
  );
}
