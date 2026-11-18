/**
 * Режим «Карточки»: переворот, навигация, свайпы, автопроигрывание.
 *
 * По умолчанию это просмотр без влияния на расписание — так решено в
 * docs/02-functional-spec.md. Метка «знаю / не знаю» пишет в FSRS только когда
 * пользователь сам включил «учитывать в расписании».
 */

import { Button, CardContent } from '@remora/ui';
import { pluralWithCount } from '@remora/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SessionSummary } from '../features/study/SessionSummary';
import { StudyShell, StudyState } from '../features/study/StudyShell';
import { selectCurrent, useStudyStore } from '../features/study/study-store';
import {
  useStudySession,
  useStudySessionFinalizer,
  type StudyScope,
} from '../features/study/use-study-session';

const AUTOPLAY_MS = 4000;

const scopeLabels: Record<StudyScope, string> = {
  all: 'все карточки',
  due: 'к повторению',
  hard: 'только сложные',
  new: 'только новые',
};

export function FlashcardsPage() {
  const { setId, folderId } = useParams();
  const targetId = setId ?? folderId ?? '';
  const isFolder = Boolean(folderId);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const scope = (params.get('scope') as StudyScope | null) ?? 'all';
  const track = params.get('track') === '1';

  const [flipped, setFlipped] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [finished, setFinished] = useState(false);
  const shownAt = useRef(Date.now());

  const query = useStudySession({
    setId,
    folderId,
    mode: 'flashcards',
    scope,
    shuffle: params.get('shuffle') !== '0',
    trackProgress: track,
  });

  const items = useStudyStore((state) => state.items);
  const index = useStudyStore((state) => state.index);
  const answers = useStudyStore((state) => state.answers);
  const sessionId = useStudyStore((state) => state.sessionId);
  const current = useStudyStore(selectCurrent);
  const goTo = useStudyStore((state) => state.goTo);
  const answer = useStudyStore((state) => state.answer);
  const finalizeSession = useStudySessionFinalizer(sessionId);

  const move = useCallback(
    (delta: number) => {
      setFlipped(false);
      shownAt.current = Date.now();
      goTo(Math.max(0, Math.min(items.length, index + delta)));
    },
    [goTo, index, items.length],
  );

  const mark = useCallback(
    (known: boolean) => {
      if (!current) return;
      answer({
        item: current,
        rating: known ? 3 : 1,
        correct: known,
        durationMs: Date.now() - shownAt.current,
        updatesSchedule: track,
      });
      setFlipped(false);
      shownAt.current = Date.now();
    },
    [answer, current, track],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
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
  }, [current, finished, mark, move]);

  useEffect(() => {
    if (!autoplay || finished || !current) return;
    const timer = setTimeout(() => {
      if (flipped) move(1);
      else setFlipped(true);
    }, AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [autoplay, current, finished, flipped, move]);

  useEffect(() => {
    if (items.length > 0 && (finished || !current)) void finalizeSession();
  }, [current, finalizeSession, finished, items.length]);

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
            <Button
              variant="ghost"
              onClick={() => navigate(isFolder ? '/sets/manage' : `/sets/${targetId}`)}
            >
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
        backLabel={isFolder ? 'К папкам' : 'К набору'}
        onAll={() => setParams({ scope: 'all' })}
        onBack={() => navigate(isFolder ? '/sets/manage' : `/sets/${targetId}`)}
      />
    );
  }

  if (finished || !current) {
    return (
      <SessionSummary
        setId={targetId}
        backHref={isFolder ? '/sets/manage' : undefined}
        backLabel={isFolder ? 'К папкам' : undefined}
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

  const side = flipped ? 'definition' : 'term';
  const transcription = flipped
    ? current.card.definition_transcription
    : current.card.term_transcription;

  return (
    <StudyShell
      title="Карточки"
      subtitle={`${scopeLabels[scope]} · ${pluralWithCount(items.length, ['карточка', 'карточки', 'карточек'])}`}
      done={index}
      total={items.length}
      onExit={() => {
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
        <button
          type="button"
          onClick={() => setFlipped((value) => !value)}
          aria-label={flipped ? 'Показать термин' : 'Показать определение'}
          aria-pressed={flipped}
          className="study-question study-flip"
        >
          <div className="w-full">
            <span className="study-side">{flipped ? 'Определение' : 'Термин'}</span>
            <div className="study-question-content mt-6">
              <CardContent
                value={flipped ? current.card.definition : current.card.term}
                type={current.card.content_type}
                codeLanguage={current.card.code_language}
                imageUrl={flipped ? current.card.definition_image_url : current.card.term_image_url}
                imageAlt={side === 'term' ? 'Изображение термина' : 'Изображение определения'}
              />
            </div>
            {transcription && <p className="text-fg-subtle mt-3 text-base">{transcription}</p>}
            {!flipped && current.card.hint && (
              <p className="text-fg-subtle mt-4 text-sm">Подсказка: {current.card.hint}</p>
            )}
            <p className="study-flip-cue">
              Нажмите, чтобы {flipped ? 'вернуться к вопросу' : 'увидеть ответ'}
            </p>
          </div>
        </button>
      </div>

      <div className="study-flash-controls">
        <Button
          variant="ghost"
          aria-label="Предыдущая карточка"
          onClick={() => move(-1)}
          disabled={index === 0}
        >
          ← <span className="study-flash-nav-label">Назад</span>
        </Button>
        <Button variant="secondary" onClick={() => mark(false)}>
          Не знаю
        </Button>
        <Button onClick={() => mark(true)}>Знаю</Button>
        <Button variant="ghost" aria-label="Следующая карточка" onClick={() => move(1)}>
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
