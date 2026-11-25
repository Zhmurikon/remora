/**
 * Режим «Письмо»: ответ вводится целиком.
 *
 * Ключевая механика — статус «опечатка». Промах по клавише не считается
 * ошибкой и не портит расписание, но ответ нужно ввести заново: иначе
 * пользователь запоминает не слово, а то, что «почти» засчитывается.
 */

import { STRICTNESS_LABELS, pluralWithCount, type AnswerResult } from '@remora/core';
import { Button, Card, Input } from '@remora/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Diff, SessionSummary } from './SessionSummary';
import { StudyHint, StudyShell, StudyState } from './StudyShell';
import { useStudyTransition } from './study-transition';
import { answerSide, checkTypedSide } from './card-sides';
import { StudyCardFace } from './StudyCardFace';
import { useCardTraining } from './use-card-training';

export function WritePage() {
  const navigate = useNavigate();

  const {
    query,
    current,
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
    setAnsweredItem,
    basePath,
  } = useCardTraining({ mode: 'write', scope: 'due' });

  const { schedule, cancel, bodyRef } = useStudyTransition();
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [typoHint, setTypoHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const queue = query.data?.queue;

  useEffect(() => {
    inputRef.current?.focus();
  }, [current?.card.id, index, result]);

  const next = useCallback(() => {
    setAnsweredItem(null);
    setTyped('');
    setResult(null);
    setTypoHint(null);
    shownAt.current = Date.now();
  }, [setAnsweredItem, shownAt]);

  const submit = useCallback(() => {
    if (!current || result) return;
    const verdict = checkTypedSide(typed, current, 'answer', queue);

    if (verdict.verdict === 'typo') {
      // Ответ не записываем: опечатка — это не ошибка, но и не знание.
      setTypoHint(typed);
      setTyped('');
      return;
    }
    const correct = verdict.verdict === 'correct';
    setAnsweredItem(current);
    setResult(verdict);
    answer({
      item: current,
      rating: correct ? 3 : 1,
      correct,
      typed,
      durationMs: Date.now() - shownAt.current,
      requeue: !correct,
    });
    if (correct) schedule(next, 500);
  }, [answer, current, next, queue, result, schedule, setAnsweredItem, shownAt, typed]);

  if (query.isPending) return <StudyState title="Готовим тренировку" loading />;
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
      <StudyState title="На сегодня всё повторено">
        <p className="text-fg-muted mt-2">Карточки вернутся, когда подойдёт срок повторения.</p>
        <div className="study-state-actions">
          <Button onClick={() => navigate(`${basePath}/flashcards`)}>Открыть карточки</Button>
          <Button variant="ghost" onClick={() => navigate(backHref)}>
            {backLabel}
          </Button>
        </div>
      </StudyState>
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
          next();
          setFinished(false);
          await query.refetch();
        }}
      />
    );
  }

  const expected = answerSide(current);
  const wrong = result !== null && result.verdict !== 'correct';

  return (
    <StudyShell
      bodyRef={bodyRef}
      title="Письмо"
      subtitle={`Введите ответ · проверка «${STRICTNESS_LABELS[queue?.answer_strictness ?? 'moderate'].toLowerCase()}»`}
      done={index}
      questionIndex={result ? index - 1 : index}
      total={items.length}
      onExit={() => {
        cancel();
        void finalizeSession();
        setFinished(true);
      }}
      footer={
        <p className="study-shortcuts">
          <kbd>Enter</kbd> — проверить или продолжить · осталось{' '}
          {pluralWithCount(items.length - index, ['карточка', 'карточки', 'карточек'])}
        </p>
      }
    >
      <Card className="study-question">
        <p className="study-side">
          {current.direction === 'term_to_def' ? 'Термин → определение' : 'Определение → термин'}
        </p>
        <div className="study-question-content">
          <StudyCardFace item={current} role="question" />
        </div>
        {current.card.hint && !result && (
          <StudyHint key={current.card.id}>{current.card.hint}</StudyHint>
        )}
      </Card>

      <form
        className="study-answer-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (wrong) next();
          else submit();
        }}
      >
        <Input
          ref={inputRef}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          label="Ваш ответ"
          placeholder="Введите ответ по памяти"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Ваш ответ"
          hint={typoHint ? 'Почти верно — проверьте написание и введите ещё раз' : undefined}
          readOnly={result !== null}
        />
        {typoHint && (
          <p className="text-warning mt-2 text-sm">
            Вы ввели: <Diff expected={expected} typed={typoHint} />
          </p>
        )}
        <div className="study-actions">
          <Button type="submit" disabled={result !== null && !wrong}>
            {wrong ? 'Дальше' : 'Проверить'}
          </Button>
          {!result && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAnsweredItem(current);
                setResult({ verdict: 'incorrect', matched: null, distance: Infinity });
                answer({
                  item: current,
                  rating: 1,
                  correct: false,
                  typed: '',
                  durationMs: Date.now() - shownAt.current,
                  requeue: true,
                });
              }}
            >
              Не знаю
            </Button>
          )}
        </div>
      </form>

      {result?.verdict === 'correct' && (
        <Card className="study-feedback study-feedback-success" role="status">
          <p className="text-success study-feedback-title">
            <span aria-hidden="true">✓</span> Верно
          </p>
          {result.matched !== expected && (
            <p className="text-fg-muted mt-1 text-sm">
              Засчитан синоним: <span className="text-fg font-medium">{result.matched}</span>
            </p>
          )}
        </Card>
      )}

      {wrong && (
        <Card className="study-feedback study-feedback-error" role="status">
          <p className="text-danger study-feedback-title">
            <span aria-hidden="true">↺</span> Повторим эту карточку
          </p>
          <p className="mt-2 text-sm">Правильно:</p>
          <StudyCardFace item={current} role="answer" className="font-medium" />
          {typed && (
            <p className="text-fg-subtle mt-1 text-sm">
              Вы ввели: <Diff expected={expected} typed={typed} />
            </p>
          )}
        </Card>
      )}
    </StudyShell>
  );
}
