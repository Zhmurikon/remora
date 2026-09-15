/**
 * Режим «Карточки»: переворот, навигация, свайпы, автопроигрывание.
 *
 * По умолчанию это просмотр без влияния на расписание — так решено в
 * docs/02-functional-spec.md. Метка «знаю / не знаю» пишет в FSRS только когда
 * пользователь сам включил «учитывать в расписании».
 */

import { Badge, Button, Card, CardContent } from '@remora/ui';
import { pluralWithCount } from '@remora/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SessionSummary } from '../features/study/SessionSummary';
import { StudyShell } from '../features/study/StudyShell';
import { selectCurrent, useStudyStore } from '../features/study/study-store';
import {
  finishSession,
  useStudySession,
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
  const { setId = '' } = useParams();
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
      if (track) {
        answer({
          item: current,
          rating: known ? 3 : 1,
          correct: known,
          durationMs: Date.now() - shownAt.current,
        });
        setFlipped(false);
        shownAt.current = Date.now();
      } else {
        move(1);
      }
    },
    [answer, current, move, track],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;
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
  }, [mark, move]);

  useEffect(() => {
    if (!autoplay || finished || !current) return;
    const timer = setTimeout(() => {
      if (flipped) move(1);
      else setFlipped(true);
    }, AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [autoplay, current, finished, flipped, move]);

  const touchStart = useRef<number | null>(null);

  if (query.isPending) return <p className="text-fg-muted">Готовим карточки…</p>;
  if (query.isError) return <p className="text-danger">Не удалось загрузить карточки.</p>;
  if (items.length === 0) {
    return (
      <EmptyQueue
        scope={scope}
        onAll={() => setParams({ scope: 'all' })}
        onBack={() => navigate(`/sets/${setId}`)}
      />
    );
  }

  if (finished || !current) {
    return (
      <SessionSummary
        setId={setId}
        answers={answers}
        onRestart={() => {
          setFinished(false);
          void query.refetch();
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
        void finishSession(sessionId);
        setFinished(true);
      }}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-fg-muted flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={track}
              onChange={(event) => setParams({ scope, track: event.target.checked ? '1' : '0' })}
              className="h-4 w-4"
            />
            Учитывать в расписании
          </label>
          <Button variant="ghost" onClick={() => setAutoplay((value) => !value)}>
            {autoplay ? '⏸ Пауза' : '▶ Автопроигрывание'}
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
          className="border-border bg-surface shadow-card focus-visible:ring-primary grid min-h-[320px] w-full place-items-center rounded-lg border p-8 text-center focus-visible:outline-none focus-visible:ring-2"
        >
          <div className="w-full">
            <Badge tone={flipped ? 'primary' : 'neutral'}>
              {flipped ? 'Определение' : 'Термин'}
            </Badge>
            <div className="mt-6 text-2xl">
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
          </div>
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button variant="secondary" onClick={() => move(-1)} disabled={index === 0}>
          ← Назад
        </Button>
        <Button variant="secondary" onClick={() => mark(false)}>
          Не знаю
        </Button>
        <Button onClick={() => mark(true)}>Знаю</Button>
        <Button variant="secondary" onClick={() => move(1)}>
          Вперёд →
        </Button>
      </div>
      <p className="text-fg-subtle mt-4 text-center text-sm">
        Пробел — перевернуть, стрелки — навигация и оценка
      </p>
    </StudyShell>
  );
}

function EmptyQueue({
  scope,
  onAll,
  onBack,
}: {
  scope: StudyScope;
  onAll: () => void;
  onBack: () => void;
}) {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <p className="text-4xl" aria-hidden="true">
        ✅
      </p>
      <h1 className="mt-4 text-xl font-semibold">
        {scope === 'due' ? 'На сегодня всё повторено' : 'Здесь пока нет карточек'}
      </h1>
      <p className="text-fg-muted mt-2">
        {scope === 'due'
          ? 'Можно пройтись по набору целиком — это не повлияет на расписание.'
          : 'Добавьте карточки в набор или выберите другой фильтр.'}
      </p>
      <div className="mt-6 flex justify-center gap-3">
        {scope !== 'all' && <Button onClick={onAll}>Смотреть все карточки</Button>}
        <Button variant="ghost" onClick={onBack}>
          К набору
        </Button>
      </div>
    </Card>
  );
}
