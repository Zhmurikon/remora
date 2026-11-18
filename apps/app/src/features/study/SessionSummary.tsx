/** Разбор остаётся открытым, пока пользователь помнит свои ответы. */
import { useMemo } from 'react';
import { CardContent } from '@remora/ui';
import { formatIntervalSeconds, pluralWithCount } from '@remora/core';
import { Link } from 'react-router-dom';
import { useStudyStore, type AnswerLog } from './study-store';
import './session-summary.css';

interface SessionSummaryProps {
  setId: string;
  answers: AnswerLog[];
  /** Секунды до ближайшего повторения, если сервер уже подтвердил расписание. */
  nextDueSeconds?: number | null;
  onRepeatMistakes?: () => void;
  onRestart: () => void;
  backHref?: string;
  backLabel?: string;
}

export function SessionSummary({
  setId,
  answers,
  nextDueSeconds,
  onRepeatMistakes,
  onRestart,
  backHref,
  backLabel,
}: SessionSummaryProps) {
  const items = useStudyStore((state) => state.items);
  const mode = useStudyStore((state) => state.mode);
  const cards = useMemo(() => new Map(items.map((item) => [item.card.id, item.card])), [items]);
  const correct = answers.filter((answer) => answer.correct).length;
  const mistakes = answers.filter((answer) => !answer.correct);
  const percent = answers.length > 0 ? Math.round((correct / answers.length) * 100) : 0;
  const hasNextDue = nextDueSeconds != null && Number.isFinite(nextDueSeconds);

  return (
    <article className="session-result" aria-labelledby="session-result-title">
      <header className="session-result__header">
        <Link className="session-result__back" to={backHref ?? `/sets/${setId}`}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m14 6-6 6 6 6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {backLabel ?? 'К набору'}
        </Link>
        <h1 id="session-result-title">Сессия завершена</h1>
        <p>
          {answers.length === 0
            ? 'В этот раз вы не ответили ни на одну карточку.'
            : mistakes.length === 0
              ? 'Все ответы верные. Можно закончить или продолжить заниматься.'
              : 'Посмотрите правильные ответы и сравните их со своими.'}
        </p>
      </header>

      <dl className="session-result__stats" aria-label="Итоги сессии">
        <div>
          <dt>Всего ответов</dt>
          <dd>{answers.length}</dd>
        </div>
        <div>
          <dt>Верно</dt>
          <dd>
            {correct} <span>{answers.length > 0 ? `${percent}%` : '—'}</span>
          </dd>
        </div>
        <div>
          <dt>С ошибкой</dt>
          <dd>{mistakes.length}</dd>
        </div>
      </dl>

      {hasNextDue && (
        <p className="session-result__next">
          Следующее повторение{' '}
          <strong>
            {nextDueSeconds <= 0
              ? 'уже доступно'
              : `через ${formatIntervalSeconds(nextDueSeconds)}`}
          </strong>
        </p>
      )}

      <div className="session-result__actions">
        {mistakes.length > 0 && onRepeatMistakes && (
          <button
            type="button"
            className="session-result__button session-result__button--primary"
            onClick={onRepeatMistakes}
          >
            Повторить ошибки
          </button>
        )}
        <button
          type="button"
          className={`session-result__button ${mistakes.length > 0 && onRepeatMistakes ? '' : 'session-result__button--primary'}`}
          onClick={onRestart}
        >
          Продолжить учить
        </button>
      </div>

      {mistakes.length > 0 && (
        <section className="session-result__review" aria-labelledby="session-result-review">
          <div className="session-result__review-heading">
            <h2 id="session-result-review">Разбор ошибок</h2>
            <span>{pluralWithCount(mistakes.length, ['ответ', 'ответа', 'ответов'])}</span>
          </div>
          <ol className="session-result__mistakes">
            {mistakes.map((answer, index) => {
              const card = cards.get(answer.cardId);
              const reverse = answer.direction === 'def_to_term';
              const question = reverse ? answer.definition : answer.term;
              // В диктанте вводят услышанную сторону, в остальных режимах — оборотную.
              const expectedIsTerm = mode === 'listen' ? !reverse : reverse;
              const expected = expectedIsTerm ? answer.term : answer.definition;
              return (
                <li key={`${answer.cardId}-${index}`} className="session-result__mistake">
                  <div className="session-result__question">
                    <span className="session-result__number" aria-label={`Ошибка ${index + 1}`}>
                      {index + 1}
                    </span>
                    <CardContent
                      value={question}
                      type={card?.content_type}
                      codeLanguage={card?.code_language}
                      imageUrl={reverse ? card?.definition_image_url : card?.term_image_url}
                      imageAlt="Изображение вопроса"
                    />
                  </div>
                  <div className="session-result__comparison">
                    <div className="session-result__answer">
                      <h3>Ваш ответ</h3>
                      {answer.typed === undefined ? (
                        <p className="session-result__unrecorded">
                          Ответ отмечен как неверный. Текст ответа не записан.
                        </p>
                      ) : answer.typed === '' ? (
                        <p className="session-result__unrecorded">Ответ не введён.</p>
                      ) : (
                        <p className="session-result__typed">
                          <Diff expected={expected} typed={answer.typed} />
                        </p>
                      )}
                    </div>
                    <div className="session-result__answer session-result__answer--expected">
                      <h3>Правильный ответ</h3>
                      <CardContent
                        value={expected}
                        type={card?.content_type}
                        codeLanguage={card?.code_language}
                        imageUrl={
                          expectedIsTerm ? card?.term_image_url : card?.definition_image_url
                        }
                        imageAlt="Изображение правильного ответа"
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </article>
  );
}

/** Сохраняем посимвольную подсветку; скринридер читает ответ одной фразой. */
export function Diff({ expected, typed }: { expected: string; typed: string }) {
  let common = 0;
  while (
    common < expected.length &&
    common < typed.length &&
    expected[common]?.toLowerCase() === typed[common]?.toLowerCase()
  ) {
    common += 1;
  }
  return (
    <span className="font-medium">
      <span className="sr-only">{typed}</span>
      <span aria-hidden="true">
        <span className="text-success">{typed.slice(0, common)}</span>
        <span className="text-danger underline decoration-wavy">{typed.slice(common)}</span>
      </span>
    </span>
  );
}
