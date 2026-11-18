/**
 * Режим «Письмо»: ответ вводится целиком.
 *
 * Ключевая механика — статус «опечатка». Промах по клавише не считается
 * ошибкой и не портит расписание, но ответ нужно ввести заново: иначе
 * пользователь запоминает не слово, а то, что «почти» засчитывается.
 */

import { STRICTNESS_LABELS, checkAnswer, pluralWithCount, type AnswerResult } from '@remora/core';
import { Button, Card, CardContent, Input } from '@remora/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Diff, SessionSummary } from '../features/study/SessionSummary';
import { StudyHint, StudyShell, StudyState } from '../features/study/StudyShell';
import { useStudyTransition } from '../features/study/study-transition';
import { answerImage, answerSide, questionImage, questionSide } from '../features/study/card-sides';
import { selectCurrent, useStudyStore, type QueueItem } from '../features/study/study-store';
import {
  useStudySession,
  useStudySessionFinalizer,
  type StudyDirectionMode,
} from '../features/study/use-study-session';

export function WritePage() {
  const { setId, folderId } = useParams();
  const targetId = setId ?? folderId ?? '';
  const isFolder = Boolean(folderId);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const direction = (params.get('direction') as StudyDirectionMode | null) ?? 'term_to_def';

  const query = useStudySession({ setId, folderId, mode: 'write', scope: 'due', direction });

  const items = useStudyStore((state) => state.items);
  const index = useStudyStore((state) => state.index);
  const answers = useStudyStore((state) => state.answers);
  const sessionId = useStudyStore((state) => state.sessionId);
  const activeItem = useStudyStore(selectCurrent);
  const [answeredItem, setAnsweredItem] = useState<QueueItem | null>(null);
  const current = answeredItem ?? activeItem;
  const answer = useStudyStore((state) => state.answer);

  const { schedule, cancel } = useStudyTransition();
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [typoHint, setTypoHint] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const shownAt = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const finalizeSession = useStudySessionFinalizer(sessionId);

  const queue = query.data?.queue;
  const answerLang =
    current?.direction === 'term_to_def' ? queue?.lang_definition : queue?.lang_term;

  useEffect(() => {
    inputRef.current?.focus();
  }, [current?.card.id, index, result]);

  useEffect(() => {
    if (items.length > 0 && (finished || !current)) void finalizeSession();
  }, [current, finalizeSession, finished, items.length]);

  const next = useCallback(() => {
    setAnsweredItem(null);
    setTyped('');
    setResult(null);
    setTypoHint(null);
    shownAt.current = Date.now();
  }, []);

  const submit = useCallback(() => {
    if (!current || result) return;
    const expected = answerSide(current);
    const verdict = checkAnswer(typed, expected, {
      strictness: queue?.answer_strictness ?? 'moderate',
      alternatives: current.card.alt_answers ?? [],
      lang: answerLang,
    });

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
  }, [answer, answerLang, current, next, queue?.answer_strictness, result, schedule, typed]);

  if (query.isPending) return <StudyState title="Готовим тренировку" loading />;
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
      <StudyState title="На сегодня всё повторено">
        <p className="text-fg-muted mt-2">Карточки вернутся, когда подойдёт срок повторения.</p>
        <div className="study-state-actions">
          <Button
            onClick={() =>
              navigate(
                isFolder ? `/folders/${targetId}/flashcards` : `/sets/${targetId}/flashcards`,
              )
            }
          >
            Открыть карточки
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate(isFolder ? '/sets/manage' : `/sets/${targetId}`)}
          >
            {isFolder ? 'К папкам' : 'К набору'}
          </Button>
        </div>
      </StudyState>
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
      title="Письмо"
      subtitle={`Введите ответ · проверка «${STRICTNESS_LABELS[queue?.answer_strictness ?? 'moderate'].toLowerCase()}»`}
      done={index}
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
          <CardContent
            value={questionSide(current)}
            type={current.card.content_type}
            codeLanguage={current.card.code_language}
            imageUrl={questionImage(current)}
            imageAlt="Изображение вопроса"
          />
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
          <CardContent
            value={expected}
            type={current.card.content_type}
            codeLanguage={current.card.code_language}
            imageUrl={answerImage(current)}
            imageAlt="Изображение ответа"
            className="font-medium"
          />
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
