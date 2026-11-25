import { useId } from 'react';
import { sideName } from './card-sides';
import { StudyCardFace } from './StudyCardFace';
import type { QueueItem } from './study-store';

interface Props {
  item: QueueItem;
  flipped: boolean;
  onFlip: () => void;
  recall?: boolean;
}

export function StudyFlipCard({ item, flipped, onFlip, recall = false }: Props) {
  const id = useId();
  const visible = flipped ? 'answer' : 'question';
  const nextSide = sideName(item, flipped ? 'question' : 'answer');
  const label = recall
    ? flipped
      ? 'Показать вопрос'
      : 'Показать ответ'
    : nextSide === 'term'
      ? 'Показать термин'
      : 'Показать определение';
  return (
    <button
      type="button"
      className="study-flip"
      aria-label={label}
      aria-pressed={flipped}
      aria-describedby={id + visible}
      onClick={onFlip}
    >
      <span className="study-flip-body">
        {(['question', 'answer'] as const).map((role) => {
          const side = sideName(item, role);
          const transcription = item.card[`${side}_transcription`];
          return (
            <span
              key={role}
              className="study-question study-flip-face"
              aria-hidden={role !== visible}
              inert={role !== visible}
              data-face={role}
            >
              <span className="study-side">{side === 'term' ? 'Термин' : 'Определение'}</span>
              {recall && item.source_set_title && (
                <span className="text-fg-muted text-sm">
                  {item.source_article_title ?? item.source_set_title}
                </span>
              )}
              <span className="study-question-content" id={id + role}>
                <StudyCardFace item={item} role={role} />
              </span>
              {transcription && <span className="text-fg-subtle text-base">{transcription}</span>}
              {!recall && role === 'question' && item.card.hint && (
                <span className="text-fg-subtle text-sm">Подсказка: {item.card.hint}</span>
              )}
              <span className="study-flip-cue">
                {recall
                  ? role === 'question'
                    ? 'Показать ответ'
                    : 'Вернуться к вопросу'
                  : side === 'term'
                    ? 'Показать определение'
                    : 'Показать термин'}
              </span>
            </span>
          );
        })}
      </span>
    </button>
  );
}
