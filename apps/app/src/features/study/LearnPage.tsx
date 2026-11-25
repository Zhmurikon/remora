import { Button, Card, CardContent, Input } from '@remora/ui';
import { answerSimilarity } from '@remora/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Diff, SessionSummary } from './SessionSummary';
import { answerSide, questionSide, sideLanguage } from './card-sides';
import { StudyHint, StudyShell, StudyState } from './StudyShell';
import { useStudyTransition } from './study-transition';
import { StudyFlipCard } from './StudyFlipCard';
import { StudyCardFace } from './StudyCardFace';
import {
  exerciseTitles,
  prepareLearnExercise,
  type ExerciseKind,
  type LearnExercise,
  type WritingModes,
} from './learn-exercise';
import { MatchPairs } from './MatchPairs';
import { useCardTraining } from './use-card-training';
import { useLearnNarration } from './use-learn-narration';
import { useStudyStore, type QueueItem, type StudyQueue } from './study-store';
import type { LearnQuestionType } from './LearnSettingsControls';

const defaults: LearnQuestionType[] = ['choice', 'recall'];

export function LearnPage() {
  const navigate = useNavigate();
  const transition = useStudyTransition();
  const training = useCardTraining({ mode: 'learn', scope: 'due' });
  const {
    query,
    items,
    index,
    answers,
    current,
    targetId,
    sessionId,
    finished,
    backHref,
    backLabel,
    setFinished,
    finalizeSession,
    shownAt,
    answer,
  } = training;
  const queue = query.data?.queue;
  const types = queue?.learn_question_types ?? defaults;
  const previous = useRef<ExerciseKind | undefined>(undefined);
  const [turn, setTurn] = useState(0);
  const [held, setHeld] = useState<LearnExercise | null>(null);
  const [writingOverride, setWriting] = useState<WritingModes | null>(null);
  const writing = useMemo(
    () =>
      writingOverride ?? {
        term: types.includes('typing') && current?.direction === 'def_to_term',
        definition: types.includes('typing') && current?.direction !== 'def_to_term',
      },
    [writingOverride, types, current?.direction],
  );
  const plan = useMemo(
    () =>
      held ??
      prepareLearnExercise(
        items,
        index,
        turn,
        types,
        writing,
        sessionId ?? targetId,
        previous.current,
      ),
    [held, items, index, turn, types, writing, sessionId, targetId],
  );
  const introduced = useRef(new Set<string>());
  const preview =
    !!current &&
    !held &&
    types.includes('recall') &&
    types.includes('choice') &&
    current.state.reps === 0 &&
    !introduced.current.has(current.card.id) &&
    !answers.some((entry) => entry.cardId === current.card.id) &&
    (turn === 0 || turn % 4 === 0);
  const narration = useLearnNarration();
  const { speak, stop } = narration;
  const [previewFlipped, setPreviewFlipped] = useState(false);
  const next = useCallback(() => {
    stop();
    setHeld(null);
    setTurn((value) => value + 1);
    shownAt.current = Date.now();
  }, [shownAt, stop]);
  useEffect(() => {
    if (preview && current && !finished) {
      const role = previewFlipped ? 'answer' : 'question';
      speak({
        text: previewFlipped ? answerSide(current) : questionSide(current),
        lang: sideLanguage(current, role, queue),
      });
      return stop;
    }
  }, [preview, previewFlipped, current, queue, finished, speak, stop]);
  function grade(item: QueueItem, correct: boolean, typed?: string, consumed?: QueueItem) {
    if (!plan) return;
    previous.current = plan.kind;
    setHeld(plan);
    const successes = answers.filter(
      (entry) =>
        entry.cardId === item.card.id && entry.direction === item.direction && entry.correct,
    ).length;
    answer({
      item,
      rating: correct ? 3 : 1,
      correct,
      typed,
      consume: consumed,
      showReward: !consumed,
      durationMs: Date.now() - shownAt.current,
      requeue: !correct || successes + 1 < (queue?.learn_successes_required ?? 1),
    });
    shownAt.current = Date.now();
  }
  function exit() {
    transition.cancel();
    stop();
    void finalizeSession();
    setFinished(true);
  }
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
  if (!items.length)
    return (
      <StudyState
        title="Пока нечего повторять"
        actions={<Button onClick={() => navigate(backHref)}>К материалам</Button>}
      />
    );
  if (finished || !plan) {
    const last = answers.at(-1);
    const interval = items
      .find((item) => item.card.id === last?.cardId && item.direction === last.direction)
      ?.previews.find((p) => p.rating === 3)?.interval_seconds;
    return (
      <SessionSummary
        setId={targetId}
        backHref={backHref}
        backLabel={backLabel}
        answers={answers}
        nextDueSeconds={interval}
        onRestart={async () => {
          if (!(await finalizeSession())) return;
          await query.refetch();
          introduced.current.clear();
          setPreviewFlipped(false);
          previous.current = undefined;
          setTurn(0);
          setHeld(null);
          setFinished(false);
        }}
      />
    );
  }
  return (
    <StudyShell
      bodyRef={transition.bodyRef}
      title="Заучивание"
      subtitle={preview ? 'Знакомство с карточкой' : exerciseTitles[plan.kind]}
      done={index}
      questionIndex={turn}
      total={items.length}
      onExit={exit}
      footer={
        <div className="space-y-3">
          {narration.available && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                aria-pressed={narration.enabled}
                onClick={narration.toggle}
              >
                {narration.enabled ? 'Выключить озвучку' : 'Включить озвучку'}
              </Button>
            </div>
          )}
          {narration.failed && (
            <p role="status">Не удалось воспроизвести озвучку. Можно включить её снова.</p>
          )}
          <details>
            <summary>Упражнения с письмом</summary>
            <p>Выберите, что писать в этой тренировке.</p>
            {(['term', 'definition'] as const).map((side) => (
              <label key={side} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!!held}
                  checked={writing[side]}
                  onChange={(event) => setWriting({ ...writing, [side]: event.target.checked })}
                />
                {side === 'term' ? 'Писать термин' : 'Писать определение'}
              </label>
            ))}
          </details>
        </div>
      }
    >
      {preview && current ? (
        <div className="study-introduction">
          <StudyFlipCard
            item={current}
            flipped={previewFlipped}
            onFlip={() => setPreviewFlipped((value) => !value)}
          />
          <Button
            onClick={() => {
              if (!previewFlipped) {
                setPreviewFlipped(true);
                return;
              }
              setPreviewFlipped(false);
              introduced.current.add(current.card.id);
              useStudyStore.getState().deferCurrent();
              next();
            }}
          >
            Дальше
          </Button>
        </div>
      ) : plan.kind === 'pairs' && plan.pairs ? (
        <MatchPairs
          key={turn}
          items={plan.pairs}
          seed={`${sessionId}:${turn}`}
          speak={speak}
          onComplete={() => transition.schedule(next, 1000, 800)}
          onPair={(item, correct, firstSide) =>
            grade(
              { ...item, direction: firstSide === 'definition' ? 'def_to_term' : 'term_to_def' },
              correct,
              undefined,
              item,
            )
          }
        />
      ) : (
        <SingleExercise
          key={`${turn}:${plan.kind}`}
          plan={plan}
          queue={queue}
          grade={grade}
          next={next}
          narration={narration}
          transition={transition}
        />
      )}
    </StudyShell>
  );
}

function SingleExercise({
  plan,
  queue,
  grade,
  next,
  narration,
  transition,
}: {
  plan: LearnExercise;
  queue?: StudyQueue;
  grade: (item: QueueItem, correct: boolean, typed?: string) => void;
  next: () => void;
  narration: ReturnType<typeof useLearnNarration>;
  transition: ReturnType<typeof useStudyTransition>;
}) {
  const { item, kind } = plan;
  const writing = kind === 'writeTerm' || kind === 'writeDefinition';
  const [typed, setTyped] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<{
    correct: boolean;
    value: string;
    similarity?: number;
  } | null>(null);
  const submitted = useRef(false);
  const nextButton = useRef<HTMLButtonElement>(null);
  const { schedule, cancel } = transition;
  const { speak, stop, enabled: audio } = narration;
  const question = questionSide(item);
  const questionLang = sideLanguage(item, 'question', queue);
  const answerLang = sideLanguage(item, 'answer', queue);
  const expected = answerSide(item);
  const choices = kind === 'truth' ? ['Неверно', 'Верно'] : plan.options;
  const correctChoice = kind === 'truth' ? (plan.trueStatement ? 'Верно' : 'Неверно') : expected;
  useEffect(() => {
    if (!revealed && !result) {
      const sides = [{ text: question, lang: questionLang }];
      if (kind === 'truth' && plan.statement)
        sides.push({ text: plan.statement, lang: answerLang });
      void speak(...sides);
      return stop;
    }
    const speech = speak({ text: expected, lang: answerLang });
    if (!result) return stop;
    nextButton.current?.focus({ preventScroll: true });
    let active = true;
    if (kind === 'recall') {
      schedule(next, 300);
    } else if (result.correct && !(writing && audio)) {
      void speech.then(() => {
        if (active) schedule(next, 600);
      });
    }
    return () => {
      active = false;
      cancel();
      stop();
    };
  }, [
    speak,
    stop,
    question,
    questionLang,
    expected,
    answerLang,
    kind,
    plan.statement,
    revealed,
    result,
    writing,
    audio,
    schedule,
    next,
    cancel,
  ]);
  function record(correct: boolean, value: string, similarity?: number) {
    if (submitted.current) return;
    submitted.current = true;
    grade(item, correct, value);
    if (kind === 'recall' && !correct) {
      next();
      return;
    }
    setResult({ correct, value, similarity });
  }
  function optionVerdict(choice: string) {
    if (!result) return;
    if (choice === result.value) return result.correct ? 'correct' : 'wrong';
    if (choice === correctChoice) return 'expected';
  }
  function check() {
    if (!typed.trim() || result || revealed) return;
    if (queue?.learn_typing_check === 'self_check') {
      setRevealed(true);
      return;
    }
    const candidates = [expected, ...(item.card.alt_answers ?? [])];
    const similarity = Math.max(
      ...candidates.map((value) =>
        answerSimilarity(typed, value, {
          strictness: queue?.answer_strictness ?? 'moderate',
          lang: sideLanguage(item, 'answer', queue),
        }),
      ),
    );
    record(similarity >= (queue?.learn_match_percent ?? 90), typed, similarity);
  }
  const controls = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.repeat ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        (e.target instanceof HTMLElement &&
          e.target.closest('input,textarea,select,summary,[contenteditable=true]'))
      )
        return;
      if (!/^[1-4]$/.test(e.key)) return;
      const button = controls.current?.querySelector<HTMLButtonElement>(`[data-number="${e.key}"]`);
      if (button && !button.disabled) {
        e.preventDefault();
        button.click();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="space-y-4" ref={controls}>
      {kind === 'recall' ? (
        <>
          <StudyFlipCard
            item={item}
            flipped={revealed}
            onFlip={() => {
              if (!submitted.current) setRevealed((value) => !value);
            }}
            recall
          />
          {!revealed && item.card.hint && <StudyHint>{item.card.hint}</StudyHint>}
        </>
      ) : (
        <Card className="study-question">
          <p className="study-side">
            {item.direction === 'term_to_def' ? 'Термин' : 'Определение'}
          </p>
          {item.source_set_title && (
            <p className="text-fg-muted text-sm">
              {item.source_article_title ?? item.source_set_title}
            </p>
          )}
          <div className="study-question-content">
            <StudyCardFace item={item} role="question" />
          </div>
          {kind === 'truth' && (
            <div className="mt-4">
              <CardContent
                value={plan.statement ?? ''}
                type={item.card.content_type}
                codeLanguage={item.card.code_language}
              />
            </div>
          )}
          {item.card.hint && (!result || choices) && !revealed && (
            <StudyHint>{item.card.hint}</StudyHint>
          )}
        </Card>
      )}
      {choices && (
        <div className="study-options">
          {choices.map((choice, i) => (
            <button
              key={choice}
              type="button"
              data-number={i + 1}
              disabled={!!result}
              className="study-option bg-surface"
              data-verdict={optionVerdict(choice)}
              onClick={() => record(choice === correctChoice, choice)}
            >
              <span aria-hidden="true" className="study-option-number">
                {i + 1}
              </span>
              <CardContent
                value={choice}
                type={kind === 'truth' ? 'text' : item.card.content_type}
                codeLanguage={item.card.code_language}
              />
            </button>
          ))}
        </div>
      )}
      {writing && (
        <form
          className="study-answer-form"
          onSubmit={(e) => {
            e.preventDefault();
            check();
          }}
        >
          {kind === 'writeDefinition' ? (
            <textarea
              aria-label="Ваш ответ"
              className="border-border bg-surface text-fg min-h-24 w-full rounded-md border p-3"
              autoFocus
              readOnly={revealed || !!result}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  check();
                }
              }}
            />
          ) : (
            <Input
              label="Ваш ответ"
              autoFocus
              autoComplete="off"
              readOnly={revealed || !!result}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          )}
          {!revealed && !result && (
            <div className="study-actions">
              <Button type="submit" disabled={!typed.trim()}>
                Проверить
              </Button>
              <Button type="button" variant="ghost" onClick={() => record(false, '')}>
                Не знаю
              </Button>
            </div>
          )}
        </form>
      )}
      {revealed && (!result || kind === 'recall') && (
        <>
          {writing && (
            <Card className="study-feedback">
              <p>Правильный ответ</p>
              <StudyCardFace item={item} role="answer" />
            </Card>
          )}
          <div className="study-actions">
            <Button
              variant="secondary"
              data-number="1"
              aria-keyshortcuts="1"
              disabled={!!result}
              onClick={() => record(false, typed)}
            >
              {writing ? 'Не засчитывать' : 'Не помню'}
            </Button>
            <Button
              data-number="2"
              aria-keyshortcuts="2"
              disabled={!!result}
              onClick={() => record(true, typed)}
            >
              {writing ? 'Засчитать' : 'Помню'}
            </Button>
          </div>
        </>
      )}
      {writing && result && (
        <>
          <Card
            className={
              'study-feedback ' +
              (result.correct ? 'study-feedback-success' : 'study-feedback-error')
            }
            role="status"
          >
            <p>{result.correct ? 'Верно' : 'Повторим эту карточку'}</p>
            <StudyCardFace item={item} role="answer" />
            {!result.correct && result.value && <Diff expected={expected} typed={result.value} />}
            {result.similarity !== undefined && <p>Совпадение {result.similarity}%</p>}
          </Card>
          <div className="study-actions">
            <Button ref={nextButton} onClick={next}>
              Дальше
            </Button>
          </div>
        </>
      )}
      {choices && (
        <div className="study-actions study-choice-continuation">
          <span className="sr-only" role="status">
            {result && (result.correct ? 'Верно' : `Неверно. Правильный ответ — ${correctChoice}.`)}
          </span>
          {result && !result.correct && (
            <Button ref={nextButton} onClick={next}>
              Дальше
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
