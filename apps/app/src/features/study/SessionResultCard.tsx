import { pluralWithCount } from '@remora/core';
import { RoundFinale } from './rewards/StudyRewards';
import { sessionOutcome } from './rewards/round';
import './session-summary.css';

interface Props {
  correct: number;
  total: number;
  complete: boolean;
  score?: number;
  answers: ReadonlyArray<{ correct: boolean }>;
}

export function SessionResultCard({ correct, total, complete, answers, score }: Props) {
  const outcome = sessionOutcome(correct, total, complete);
  if (!outcome) return null;
  const mistakes = total - correct;
  return (
    <section className="session-result__card" aria-label="Итоги сессии">
      <div className="session-result__numbers">
        <p className="session-result__eyebrow">Точность ответов</p>
        <p className="session-result__score">
          {Math.round(score ?? (100 * correct) / total)}
          <small>%</small>
        </p>
        <p className="session-result__fraction">
          Верно {correct} из {total}
        </p>
        {answers.length === total && (
          <div className="session-result__strip" aria-hidden="true" data-dense={total > 40}>
            {answers.map((answer, i) => (
              <i key={i} data-error={!answer.correct} />
            ))}
          </div>
        )}
        <p className="session-result__legend">
          <span>
            <b aria-hidden="true">✓</b> {pluralWithCount(correct, ['верный', 'верных', 'верных'])}
          </span>
          <span>
            <b aria-hidden="true">×</b> {pluralWithCount(mistakes, ['ошибка', 'ошибки', 'ошибок'])}
          </span>
        </p>
      </div>
      <RoundFinale outcome={outcome} />
    </section>
  );
}
