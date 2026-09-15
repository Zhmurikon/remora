/**
 * Режим «Письмо»: ответ вводится целиком.
 *
 * Ключевая механика — статус «опечатка». Промах по клавише не считается
 * ошибкой и не портит расписание, но ответ нужно ввести заново: иначе
 * пользователь запоминает не слово, а то, что «почти» засчитывается.
 */

import { STRICTNESS_LABELS, checkAnswer, pluralWithCount, type AnswerResult } from '@remora/core';
import { Badge, Button, Card, CardContent, Input } from '@remora/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Diff, SessionSummary } from '../features/study/SessionSummary';
import { StudyShell } from '../features/study/StudyShell';
import { answerSide, questionImage, questionSide } from '../features/study/card-sides';
import { selectCurrent, useStudyStore } from '../features/study/study-store';
import {
  finishSession,
  useStudySession,
  type StudyDirectionMode,
} from '../features/study/use-study-session';

export function WritePage() {
  const { setId = '' } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const direction = (params.get('direction') as StudyDirectionMode | null) ?? 'term_to_def';

  const query = useStudySession({ setId, mode: 'write', scope: 'due', direction });

  const items = useStudyStore((state) => state.items);
  const index = useStudyStore((state) => state.index);
  const answers = useStudyStore((state) => state.answers);
  const sessionId = useStudyStore((state) => state.sessionId);
  const current = useStudyStore(selectCurrent);
  const answer = useStudyStore((state) => state.answer);

  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [typoHint, setTypoHint] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const shownAt = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const queue = query.data?.queue;
  const answerLang =
    current?.direction === 'term_to_def' ? queue?.lang_definition : queue?.lang_term;

  useEffect(() => {
    inputRef.current?.focus();
  }, [index, result]);

  const next = useCallback(() => {
    setTyped('');
    setResult(null);
    setTypoHint(null);
    shownAt.current = Date.now();
  }, []);

  const submit = useCallback(() => {
    if (!current) return;
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
    setResult(verdict);
    answer({
      item: current,
      rating: correct ? 3 : 1,
      correct,
      typed,
      durationMs: Date.now() - shownAt.current,
      requeue: !correct,
    });
    if (correct) setTimeout(next, 500);
  }, [answer, answerLang, current, next, queue?.answer_strictness, typed]);

  if (query.isPending) return <p className="text-fg-muted">Собираем очередь…</p>;
  if (query.isError) return <p className="text-danger">Не удалось загрузить очередь.</p>;

  if (items.length === 0) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="text-4xl" aria-hidden="true">
          ✍️
        </p>
        <h1 className="mt-4 text-xl font-semibold">На сегодня всё повторено</h1>
        <p className="text-fg-muted mt-2">Карточки вернутся, когда подойдёт срок повторения.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => navigate(`/sets/${setId}/flashcards`)}>Открыть карточки</Button>
          <Button variant="ghost" onClick={() => navigate(`/sets/${setId}`)}>
            К набору
          </Button>
        </div>
      </Card>
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

  const expected = answerSide(current);
  const wrong = result !== null && result.verdict !== 'correct';

  return (
    <StudyShell
      title="Письмо"
      subtitle={`Введите ответ · проверка «${STRICTNESS_LABELS[queue?.answer_strictness ?? 'moderate'].toLowerCase()}»`}
      done={index}
      total={items.length}
      onExit={() => {
        void finishSession(sessionId);
        setFinished(true);
      }}
      footer={
        <p className="text-fg-subtle text-center text-sm">
          Enter — проверить, дальше{' '}
          {pluralWithCount(items.length - index, ['карточка', 'карточки', 'карточек'])}
        </p>
      }
    >
      <Card className="p-6 sm:p-8">
        <Badge tone="neutral">
          {current.direction === 'term_to_def' ? 'Термин → определение' : 'Определение → термин'}
        </Badge>
        <div className="mt-5 text-2xl">
          <CardContent
            value={questionSide(current)}
            type={current.card.content_type}
            codeLanguage={current.card.code_language}
            imageUrl={questionImage(current)}
            imageAlt="Изображение вопроса"
          />
        </div>
        {current.card.hint && !result && (
          <p className="text-fg-subtle mt-3 text-sm">Подсказка: {current.card.hint}</p>
        )}
      </Card>

      <form
        className="mt-5"
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
          placeholder="Ваш ответ"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Ваш ответ"
          error={typoHint ? 'Почти верно — проверьте написание и введите ещё раз' : undefined}
          disabled={result?.verdict === 'correct'}
        />
        {typoHint && (
          <p className="text-warning mt-2 text-sm">
            Вы ввели: <Diff expected={expected} typed={typoHint} />
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-3">
          <Button type="submit">{wrong ? 'Дальше' : 'Проверить'}</Button>
          {!result && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
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
        <Card className="border-success mt-5 p-5">
          <p className="text-success font-medium">Верно</p>
          {result.matched !== expected && (
            <p className="text-fg-muted mt-1 text-sm">
              Засчитан синоним: <span className="text-fg font-medium">{result.matched}</span>
            </p>
          )}
        </Card>
      )}

      {wrong && (
        <Card className="border-danger mt-5 p-5">
          <p className="text-danger text-sm font-medium">Не совсем</p>
          <p className="mt-2">
            Правильно: <span className="font-medium">{expected}</span>
          </p>
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
