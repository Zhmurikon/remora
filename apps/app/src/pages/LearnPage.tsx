/**
 * Режим «Заучивание» — ядро продукта.
 *
 * Тип вопроса подбирается по стабильности карточки: узнавание (выбор из 4) →
 * ввод ответа → свободное воспроизведение с самооценкой. Раунды по 7–10
 * карточек с промежуточным экраном: длинная непрерывная лента выматывает,
 * а ощущение завершённости держит человека в тренировке.
 */

import {
  answerSimilarity,
  formatIntervalSeconds,
  generateOptions,
  normalizeOption,
  pluralWithCount,
  type Rating,
} from '@remora/core';
import { Badge, Button, Card, CardContent, Input } from '@remora/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Diff, SessionSummary } from '../features/study/SessionSummary';
import {
  answerImage,
  answerLang,
  answerSide,
  questionImage,
  questionSide,
} from '../features/study/card-sides';
import { StudyShell } from '../features/study/StudyShell';
import { selectCurrent, useStudyStore, type QueueItem } from '../features/study/study-store';
import {
  useStudySession,
  useStudySessionFinalizer,
  type StudyDirectionMode,
} from '../features/study/use-study-session';

/** Порог стабильности (в днях), после которого спрашиваем строже. */
const TYPING_THRESHOLD = 1;
const RECALL_THRESHOLD = 21;

type QuestionKind = 'choice' | 'typing' | 'recall';
type CheckedAnswer = { correct: boolean | null; value: string; similarity?: number };

export function LearnPage() {
  const { setId, courseId, folderId } = useParams();
  const targetId = setId ?? courseId ?? folderId ?? '';
  const isCourse = Boolean(courseId);
  const isFolder = Boolean(folderId);
  const [params] = useSearchParams();
  const direction = (params.get('direction') as StudyDirectionMode | null) ?? 'term_to_def';

  const query = useStudySession({
    setId,
    courseId,
    folderId,
    mode: 'learn',
    scope: 'due',
    direction,
  });
  const queue = query.data?.queue;

  const items = useStudyStore((state) => state.items);
  const index = useStudyStore((state) => state.index);
  const answers = useStudyStore((state) => state.answers);
  const sessionId = useStudyStore((state) => state.sessionId);
  const current = useStudyStore(selectCurrent);
  const answer = useStudyStore((state) => state.answer);
  const finalizeSession = useStudySessionFinalizer(sessionId);

  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState<CheckedAnswer | null>(null);
  const [roundBreak, setRoundBreak] = useState(false);
  const [finished, setFinished] = useState(false);
  const shownAt = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const pool = useMemo(
    () =>
      items
        .map((item) =>
          current?.direction === 'def_to_term' ? item.card.term : item.card.definition,
        )
        .filter((value) => value.length > 0),
    [items, current?.direction],
  );
  const currentSuccesses = current
    ? answers.filter(
        (entry) =>
          entry.cardId === current.card.id &&
          entry.direction === current.direction &&
          entry.correct,
      ).length
    : 0;

  const kind: QuestionKind = current
    ? questionKind(current, pool, queue?.learn_question_types ?? ['choice', 'typing', 'recall'])
    : 'choice';
  const options = useMemo(() => {
    if (!current || kind !== 'choice') return [];
    return generateOptions({
      correct: answerSide(current),
      pool: pool.filter((value) => value !== answerSide(current)),
      preferred:
        current.direction === 'term_to_def'
          ? current.card.wrong_definition_answers
          : current.card.wrong_term_answers,
      alternatives: current.card.alt_answers,
      seed: `${sessionId}:${current.card.id}:${current.direction}:${index}`,
    });
  }, [current, index, kind, pool, sessionId]);

  const advance = useCallback(
    (rating: Rating, correct: boolean, typedValue?: string) => {
      if (!current) return;
      answer({
        item: current,
        rating,
        correct,
        typed: typedValue,
        durationMs: Date.now() - shownAt.current,
        // Карточка возвращается, пока не наберёт заданное число успешных
        // ответов в этой сессии. Ошибка не обнуляет уже набранные успехи.
        requeue:
          !correct ||
          answers.filter(
            (entry) =>
              entry.cardId === current.card.id &&
              entry.direction === current.direction &&
              entry.correct,
          ).length +
            1 <
            (queue?.learn_successes_required ?? 1),
      });
      setTyped('');
      setChecked(null);
      shownAt.current = Date.now();
    },
    [answer, answers, current, queue?.learn_successes_required],
  );

  const check = useCallback(() => {
    if (!current || checked) return;
    const candidates = [answerSide(current), ...(current.card.alt_answers ?? [])];
    const similarity = Math.max(
      ...candidates.map((candidate) =>
        answerSimilarity(typed, candidate, {
          strictness: queue?.answer_strictness ?? 'moderate',
          lang: answerLang(
            current,
            current.lang_term ?? queue?.lang_term,
            current.lang_definition ?? queue?.lang_definition,
          ),
        }),
      ),
    );
    if (queue?.learn_typing_check === 'self_check') {
      setChecked({ correct: null, value: typed, similarity });
      return;
    }
    const correct = similarity >= (queue?.learn_match_percent ?? 90);
    setChecked({ correct, value: typed, similarity });
    if (correct) {
      // Верный ввод — оценка «хорошо», карточка уходит по расписанию.
      setTimeout(() => advance(3, true, typed), 450);
    }
  }, [advance, checked, current, queue, typed]);

  useEffect(() => {
    if (kind === 'typing') inputRef.current?.focus();
  }, [index, kind]);

  useEffect(() => {
    if (items.length > 0 && (finished || !current)) void finalizeSession();
  }, [current, finalizeSession, finished, items.length]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const position = Number(event.key);
      if (!Number.isInteger(position) || position < 1) return;

      // Цифры выбирают вариант, а на экране самооценки — оценку FSRS.
      if (kind === 'recall' && checked) {
        if (position > 4) return;
        event.preventDefault();
        advance(position as Rating, position >= 3, undefined);
        return;
      }
      if (kind !== 'choice' || checked || position > options.length) return;
      event.preventDefault();
      const chosen = options[position - 1];
      if (chosen !== undefined) pick(chosen);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advance, checked, kind, options]);

  function pick(option: string) {
    if (!current || checked) return;
    const correct = sameAnswer(option, answerSide(current));
    setChecked({ correct, value: option });
    // Выбор из вариантов маппится в two-way оценку: верно → «хорошо»,
    // неверно → «не помню». Промежуточных градаций тут нет.
    setTimeout(() => advance(correct ? 3 : 1, correct, option), correct ? 450 : 1400);
  }

  if (query.isPending) return <p className="text-fg-muted">Собираем очередь…</p>;
  if (query.isError) return <p className="text-danger">Не удалось загрузить очередь.</p>;

  if (items.length === 0)
    return <p className="text-fg-muted">В этом наборе пока нет карточек для заучивания.</p>;

  if (finished || !current) {
    const last = answers.at(-1);
    return (
      <SessionSummary
        setId={targetId}
        backHref={isCourse ? '/courses' : isFolder ? '/sets' : undefined}
        backLabel={isCourse ? 'К курсам' : isFolder ? 'К папке' : undefined}
        answers={answers}
        nextDueSeconds={nextDueSeconds(items, last?.cardId)}
        onRestart={async () => {
          if (!(await finalizeSession())) return;
          setFinished(false);
          await query.refetch();
        }}
      />
    );
  }

  if (roundBreak) {
    const done = index;
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="text-4xl" aria-hidden="true">
          ⚡
        </p>
        <h1 className="mt-4 text-xl font-semibold">Раунд пройден</h1>
        <p className="text-fg-muted mt-2">
          {pluralWithCount(done, ['карточка', 'карточки', 'карточек'])} позади, осталось{' '}
          {items.length - done}.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => setRoundBreak(false)}>Продолжить</Button>
          <Button
            variant="ghost"
            onClick={() => {
              void finalizeSession();
              setFinished(true);
            }}
          >
            Закончить
          </Button>
        </div>
      </Card>
    );
  }

  const question = questionSide(current);
  const expected = answerSide(current);

  return (
    <StudyShell
      title="Заучивание"
      subtitle={`${
        kind === 'choice'
          ? 'Выберите верный ответ'
          : kind === 'typing'
            ? 'Введите ответ'
            : 'Вспомните ответ и оцените себя'
      }${
        (queue?.learn_successes_required ?? 1) > 1
          ? ` · успешно ${currentSuccesses} из ${queue?.learn_successes_required}`
          : ''
      }`}
      done={index}
      total={items.length}
      onExit={() => {
        void finalizeSession();
        setFinished(true);
      }}
    >
      <Card className="p-6 sm:p-8">
        <Badge tone="neutral">
          {current.direction === 'term_to_def' ? 'Термин → определение' : 'Определение → термин'}
        </Badge>
        {current.source_set_title && (
          <p className="text-fg-subtle mt-3 text-sm">
            {current.source_article_title ?? current.source_set_title}
          </p>
        )}
        <div className="mt-5 text-2xl">
          <CardContent
            value={question}
            type={current.card.content_type}
            codeLanguage={current.card.code_language}
            imageUrl={questionImage(current)}
            imageAlt="Изображение вопроса"
          />
        </div>
        {current.card.hint && !checked && (
          <p className="text-fg-subtle mt-3 text-sm">Подсказка: {current.card.hint}</p>
        )}
      </Card>

      {kind === 'choice' && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {options.map((option, position) => (
            <button
              key={option}
              type="button"
              onClick={() => pick(option)}
              disabled={checked !== null}
              className={`focus-visible:ring-primary flex min-h-16 items-start gap-2 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 ${optionStyle(option, expected, checked)}`}
            >
              <span className="text-fg-subtle shrink-0 text-sm">{position + 1}</span>
              <div className="min-w-0 flex-1">
                <CardContent
                  value={option}
                  type={current.card.content_type}
                  codeLanguage={current.card.code_language}
                />
              </div>
            </button>
          ))}
        </div>
      )}

      {kind === 'typing' && (
        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (checked?.correct === false) advance(1, false, checked.value);
            else check();
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
            disabled={checked !== null}
          />
          <div className="mt-3 flex flex-wrap gap-3">
            {!checked || checked.correct === false ? (
              <Button type="submit">{checked?.correct === false ? 'Дальше' : 'Проверить'}</Button>
            ) : null}
            {!checked && (
              <Button type="button" variant="ghost" onClick={() => advance(1, false, '')}>
                Не знаю
              </Button>
            )}
          </div>
          {checked?.correct === null && (
            <Card className="mt-4 p-5">
              <p className="text-fg-muted text-sm">Правильный ответ</p>
              <CardContent
                value={expected}
                type={current.card.content_type}
                codeLanguage={current.card.code_language}
                className="mt-1 font-medium"
              />
              <p className="text-fg-subtle mt-3 text-sm">
                Ваш ответ: <Diff expected={expected} typed={checked.value} />
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button type="button" onClick={() => advance(3, true, checked.value)}>
                  Засчитать
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => advance(1, false, checked.value)}
                >
                  Не засчитывать
                </Button>
              </div>
            </Card>
          )}
        </form>
      )}

      {kind === 'recall' && (
        <div className="mt-5">
          {!checked ? (
            <Button onClick={() => setChecked({ correct: true, value: '' })}>Показать ответ</Button>
          ) : (
            <>
              <Card className="p-5">
                <CardContent
                  value={expected}
                  type={current.card.content_type}
                  codeLanguage={current.card.code_language}
                  imageUrl={answerImage(current)}
                  imageAlt="Изображение ответа"
                />
              </Card>
              <p className="text-fg-muted mt-4 text-sm">
                Насколько легко вспомнилось? Клавиши 1–4.
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                {current.previews.map((preview) => (
                  <Button
                    key={preview.rating}
                    variant={preview.rating >= 3 ? 'primary' : 'secondary'}
                    onClick={() =>
                      advance(preview.rating as Rating, preview.rating >= 3, undefined)
                    }
                    className="h-auto flex-col py-3"
                  >
                    <span>
                      <span className="opacity-70">{preview.rating}</span>{' '}
                      {ratingLabels[preview.rating - 1]}
                    </span>
                    <span className="text-xs opacity-80">
                      {formatIntervalSeconds(preview.interval_seconds)}
                    </span>
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {checked?.correct === false && (
        <Card className="border-danger mt-5 p-5">
          <p className="text-danger text-sm font-medium">Не совсем</p>
          <p className="mt-2 text-sm">Правильно:</p>
          <CardContent
            value={expected}
            type={current.card.content_type}
            codeLanguage={current.card.code_language}
            imageUrl={answerImage(current)}
            imageAlt="Изображение ответа"
            className="font-medium"
          />
          {checked.value && (
            <p className="text-fg-subtle mt-1 text-sm">
              Вы ввели: <Diff expected={expected} typed={checked.value} />
            </p>
          )}
          {checked.similarity !== undefined && (
            <p className="text-fg-subtle mt-2 text-sm">
              Совпадение: {checked.similarity}% · нужно {queue?.learn_match_percent ?? 90}%
            </p>
          )}
        </Card>
      )}
    </StudyShell>
  );
}

const ratingLabels = ['Не помню', 'Трудно', 'Хорошо', 'Легко'];

/** Тип вопроса по стабильности: чем крепче карточка, тем строже спрашиваем. */
export function questionKind(
  item: QueueItem,
  pool: readonly string[],
  enabled: readonly QuestionKind[],
): QuestionKind {
  const stability = item.state.stability ?? 0;
  const hasChoice =
    enabled.includes('choice') &&
    generateOptions({
      correct: answerSide(item),
      pool,
      preferred:
        item.direction === 'term_to_def'
          ? item.card.wrong_definition_answers
          : item.card.wrong_term_answers,
      alternatives: item.card.alt_answers,
      seed: item.card.id,
    }).length === 4;
  const available = enabled.filter((kind) => kind !== 'choice' || hasChoice);
  const fallback = available[0] ?? 'recall';
  if (stability >= RECALL_THRESHOLD) {
    return available.includes('recall') ? 'recall' : fallback;
  }
  if (stability >= TYPING_THRESHOLD) {
    return available.includes('typing')
      ? 'typing'
      : available.includes('recall')
        ? 'recall'
        : fallback;
  }
  return hasChoice ? 'choice' : available.includes('typing') ? 'typing' : fallback;
}

/** Совпадение вариантов выбора: опечаток здесь быть не может, нужна только нормализация. */
function sameAnswer(left: string, right: string): boolean {
  const normalized = normalizeOption(right);
  return normalized.length > 0 && normalizeOption(left) === normalized;
}

function optionStyle(option: string, expected: string, checked: CheckedAnswer | null): string {
  if (!checked || checked.correct === null)
    return 'border-border bg-surface hover:bg-surface-muted';
  if (sameAnswer(option, expected)) return 'border-success bg-success-subtle text-success';
  if (option === checked.value) return 'border-danger bg-danger-subtle text-danger';
  return 'border-border bg-surface opacity-60';
}

/** Когда вернётся последняя отвеченная карточка — по предрасчёту сервера. */
function nextDueSeconds(items: QueueItem[], cardId?: string): number | null {
  if (!cardId) return null;
  const item = items.find((candidate) => candidate.card.id === cardId);
  const preview = item?.previews.find((candidate) => candidate.rating === 3);
  return preview?.interval_seconds ?? null;
}
