/**
 * Режим «Заучивание» — ядро продукта.
 *
 * Тип вопроса подбирается по стабильности карточки: узнавание (выбор из 4) →
 * ввод ответа → свободное воспроизведение с самооценкой. Раунды по 7–10
 * карточек с промежуточным экраном: длинная непрерывная лента выматывает,
 * а ощущение завершённости держит человека в тренировке.
 */

import {
  canAskMultipleChoice,
  checkAnswer,
  formatIntervalSeconds,
  generateOptions,
  normalizeAnswer,
  pluralWithCount,
  type Rating,
} from '@remora/core';
import { Badge, Button, Card, CardContent, Input } from '@remora/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Diff, SessionSummary } from '../features/study/SessionSummary';
import { answerLang, answerSide, questionImage, questionSide } from '../features/study/card-sides';
import { StudyShell } from '../features/study/StudyShell';
import { selectCurrent, useStudyStore, type QueueItem } from '../features/study/study-store';
import {
  finishSession,
  useStudySession,
  type StudyDirectionMode,
} from '../features/study/use-study-session';

const ROUND_SIZE = 8;

/** Порог стабильности (в днях), после которого спрашиваем строже. */
const TYPING_THRESHOLD = 1;
const RECALL_THRESHOLD = 21;

type QuestionKind = 'choice' | 'typing' | 'recall';

export function LearnPage() {
  const { setId = '' } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const direction = (params.get('direction') as StudyDirectionMode | null) ?? 'term_to_def';

  const query = useStudySession({ setId, mode: 'learn', scope: 'due', direction });
  const queue = query.data?.queue;

  const items = useStudyStore((state) => state.items);
  const index = useStudyStore((state) => state.index);
  const answers = useStudyStore((state) => state.answers);
  const sessionId = useStudyStore((state) => state.sessionId);
  const current = useStudyStore(selectCurrent);
  const answer = useStudyStore((state) => state.answer);

  const [typed, setTyped] = useState('');
  const [typoHint, setTypoHint] = useState<string | null>(null);
  const [checked, setChecked] = useState<{ correct: boolean; value: string } | null>(null);
  const [roundBreak, setRoundBreak] = useState(false);
  const [finished, setFinished] = useState(false);
  const shownAt = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const pool = useMemo(
    () => items.map((item) => answerSide(item)).filter((value) => value.length > 0),
    [items],
  );

  const kind: QuestionKind = current ? questionKind(current, pool) : 'choice';
  const options = useMemo(() => {
    if (!current || kind !== 'choice') return [];
    return generateOptions({
      correct: answerSide(current),
      pool: pool.filter((value) => value !== answerSide(current)),
      seed: `${current.card.id}:${current.direction}:${index}`,
    });
  }, [current, index, kind, pool]);

  const advance = useCallback(
    (rating: Rating, correct: boolean, typedValue?: string) => {
      if (!current) return;
      answer({
        item: current,
        rating,
        correct,
        typed: typedValue,
        durationMs: Date.now() - shownAt.current,
        // Ошибку возвращаем в конец очереди: карточка не пройдена,
        // пока пользователь не воспроизвёл ответ верно.
        requeue: !correct,
      });
      setTyped('');
      setTypoHint(null);
      setChecked(null);
      shownAt.current = Date.now();
      const answered = index + 1;
      if (answered > 0 && answered % ROUND_SIZE === 0 && answered < items.length) {
        setRoundBreak(true);
      }
    },
    [answer, current, index, items.length],
  );

  const check = useCallback(() => {
    if (!current || checked) return;
    const verdict = checkAnswer(typed, answerSide(current), {
      strictness: queue?.answer_strictness ?? 'moderate',
      alternatives: current.card.alt_answers ?? [],
      lang: answerLang(current, queue?.lang_term, queue?.lang_definition),
    });
    // Опечатка — не ошибка: просим ввести заново, ничего не записывая.
    if (verdict.verdict === 'typo') {
      setTypoHint(typed);
      setTyped('');
      return;
    }
    const correct = verdict.verdict === 'correct';
    setChecked({ correct, value: typed });
    if (correct) {
      // Верный ввод — оценка «хорошо», карточка уходит по расписанию.
      setTimeout(() => advance(3, true, typed), 450);
    }
  }, [advance, checked, current, queue, typed]);

  useEffect(() => {
    if (kind !== 'choice') inputRef.current?.focus();
  }, [index, kind]);

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

  if (items.length === 0) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="text-4xl" aria-hidden="true">
          🎯
        </p>
        <h1 className="mt-4 text-xl font-semibold">На сегодня всё повторено</h1>
        <p className="text-fg-muted mt-2">
          Новые карточки и повторения появятся, когда подойдёт срок. Пока можно пройтись по набору в
          режиме «Карточки».
        </p>
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
    const last = answers.at(-1);
    return (
      <SessionSummary
        setId={setId}
        answers={answers}
        nextDueSeconds={nextDueSeconds(items, last?.cardId)}
        onRestart={() => {
          setFinished(false);
          void query.refetch();
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
              void finishSession(sessionId);
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
      subtitle={
        kind === 'choice'
          ? 'Выберите верный ответ'
          : kind === 'typing'
            ? 'Введите ответ'
            : 'Вспомните ответ и оцените себя'
      }
      done={index}
      total={items.length}
      onExit={() => {
        void finishSession(sessionId);
        setFinished(true);
      }}
    >
      <Card className="p-6 sm:p-8">
        <Badge tone="neutral">
          {current.direction === 'term_to_def' ? 'Термин → определение' : 'Определение → термин'}
        </Badge>
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
              className={`focus-visible:ring-primary min-h-16 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 ${optionStyle(option, expected, checked)}`}
            >
              <span className="text-fg-subtle mr-2 text-sm">{position + 1}</span>
              {option}
            </button>
          ))}
        </div>
      )}

      {kind === 'typing' && (
        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (checked && !checked.correct) advance(1, false, checked.value);
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
            error={typoHint ? 'Почти верно — проверьте написание и введите ещё раз' : undefined}
            disabled={checked?.correct === true}
          />
          {typoHint && (
            <p className="text-warning mt-2 text-sm">
              Вы ввели: <Diff expected={expected} typed={typoHint} />
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-3">
            <Button type="submit">{checked && !checked.correct ? 'Дальше' : 'Проверить'}</Button>
            {!checked && (
              <Button type="button" variant="ghost" onClick={() => advance(1, false, '')}>
                Не знаю
              </Button>
            )}
          </div>
        </form>
      )}

      {kind === 'recall' && (
        <div className="mt-5">
          {!checked ? (
            <Button onClick={() => setChecked({ correct: true, value: '' })}>Показать ответ</Button>
          ) : (
            <>
              <Card className="p-5">
                <CardContent value={expected} type={current.card.content_type} />
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

      {checked && !checked.correct && (
        <Card className="border-danger mt-5 p-5">
          <p className="text-danger text-sm font-medium">Не совсем</p>
          <p className="mt-2">
            Правильно: <span className="font-medium">{expected}</span>
          </p>
          {checked.value && (
            <p className="text-fg-subtle mt-1 text-sm">
              Вы ввели: <Diff expected={expected} typed={checked.value} />
            </p>
          )}
        </Card>
      )}
    </StudyShell>
  );
}

const ratingLabels = ['Не помню', 'Трудно', 'Хорошо', 'Легко'];

/** Тип вопроса по стабильности: чем крепче карточка, тем строже спрашиваем. */
function questionKind(item: QueueItem, pool: readonly string[]): QuestionKind {
  const stability = item.state.stability ?? 0;
  if (stability >= RECALL_THRESHOLD) return 'recall';
  if (stability >= TYPING_THRESHOLD) return 'typing';
  return canAskMultipleChoice(pool) ? 'choice' : 'typing';
}

/** Совпадение вариантов выбора: опечаток здесь быть не может, нужна только нормализация. */
function sameAnswer(left: string, right: string): boolean {
  const normalized = normalizeAnswer(right);
  return normalized.length > 0 && normalizeAnswer(left) === normalized;
}

function optionStyle(
  option: string,
  expected: string,
  checked: { correct: boolean; value: string } | null,
): string {
  if (!checked) return 'border-border bg-surface hover:bg-surface-muted';
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
