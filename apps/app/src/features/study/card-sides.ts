import { checkAnswer } from '@remora/core';
import type { QueueItem, StudyQueue } from './study-store';

export type CardRole = 'question' | 'answer';

export function sideName(item: QueueItem, role: CardRole) {
  return (item.direction === 'term_to_def') === (role === 'question') ? 'term' : 'definition';
}

export function questionSide(item: QueueItem): string {
  return item.card[sideName(item, 'question')];
}

export function answerSide(item: QueueItem): string {
  return item.card[sideName(item, 'answer')];
}

// У карточек в очереди курса или папки могут быть разные языки.
export function sideLanguage(item: QueueItem, role: CardRole, queue?: StudyQueue) {
  const key = sideName(item, role) === 'term' ? 'lang_term' : 'lang_definition';
  return item[key] ?? queue?.[key];
}

export function checkTypedSide(typed: string, item: QueueItem, role: CardRole, queue?: StudyQueue) {
  return checkAnswer(typed, item.card[sideName(item, role)], {
    strictness: queue?.answer_strictness ?? 'moderate',
    lang: sideLanguage(item, role, queue),
    alternatives: role === 'answer' ? item.card.alt_answers : undefined,
  });
}
