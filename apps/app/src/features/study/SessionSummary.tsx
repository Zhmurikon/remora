/**
 * Экран результатов сессии: что пройдено, где ошиблись и когда возвращаться.
 * Разбор ошибок показываем сразу — это последний момент, когда пользователь
 * ещё помнит, что именно он отвечал.
 */

import { Badge, Button, Card, CardContent } from '@remora/ui';
import { formatIntervalSeconds, pluralWithCount } from '@remora/core';
import { Link } from 'react-router-dom';
import type { AnswerLog } from './study-store';

interface SessionSummaryProps {
  setId: string;
  answers: AnswerLog[];
  /** Секунды до ближайшего повторения, если сервер уже подтвердил расписание. */
  nextDueSeconds?: number | null;
  onRepeatMistakes?: () => void;
  onRestart: () => void;
}

export function SessionSummary({
  setId,
  answers,
  nextDueSeconds,
  onRepeatMistakes,
  onRestart,
}: SessionSummaryProps) {
  const correct = answers.filter((answer) => answer.correct).length;
  const mistakes = answers.filter((answer) => !answer.correct);
  const percent = answers.length > 0 ? Math.round((correct / answers.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center">
        <p className="text-5xl" aria-hidden="true">
          {percent >= 80 ? '🎉' : percent >= 50 ? '👍' : '💪'}
        </p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Сессия завершена</h1>
        <p className="text-fg-muted mt-2">
          {answers.length === 0
            ? 'В этот раз вы не ответили ни на одну карточку.'
            : `Верно ${correct} из ${pluralWithCount(answers.length, ['ответа', 'ответов', 'ответов'])} — ${percent}%`}
        </p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Пройдено" value={String(answers.length)} />
        <Stat label="Верно" value={`${percent}%`} />
        <Stat
          label="Следующее повторение"
          value={
            nextDueSeconds === null || nextDueSeconds === undefined
              ? '—'
              : `через ${formatIntervalSeconds(nextDueSeconds)}`
          }
        />
      </div>

      {mistakes.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Разбор ошибок</h2>
          <div className="mt-3 space-y-3">
            {mistakes.map((answer, index) => (
              <Card key={`${answer.cardId}-${index}`} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <CardContent value={answer.term} className="font-medium" />
                  <Badge tone="danger">ошибка</Badge>
                </div>
                <p className="text-fg-muted mt-2 text-sm">
                  Правильно: <span className="text-fg font-medium">{answer.definition}</span>
                </p>
                {answer.typed && (
                  <p className="text-fg-subtle mt-1 text-sm">
                    Вы ввели: <Diff expected={answer.definition} typed={answer.typed} />
                  </p>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        {mistakes.length > 0 && onRepeatMistakes && (
          <Button onClick={onRepeatMistakes}>Повторить ошибки</Button>
        )}
        <Button variant="secondary" onClick={onRestart}>
          Ещё раз
        </Button>
        <Link to={`/sets/${setId}`}>
          <Button variant="ghost">К набору</Button>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4 text-center">
      <p className="text-fg-subtle text-xs uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </Card>
  );
}

/** Подсветка расхождения по символам: видно, где именно промахнулись. */
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
      <span className="text-success">{typed.slice(0, common)}</span>
      <span className="text-danger underline decoration-wavy">{typed.slice(common)}</span>
    </span>
  );
}
