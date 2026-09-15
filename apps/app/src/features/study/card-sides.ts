/**
 * Какая сторона карточки показывается, а какая ожидается в ответе.
 * Одна и та же логика нужна всем режимам с вводом, поэтому вынесена сюда.
 */

import type { QueueItem } from './study-store';

export function questionSide(item: QueueItem): string {
  return item.direction === 'term_to_def' ? item.card.term : item.card.definition;
}

export function answerSide(item: QueueItem): string {
  return item.direction === 'term_to_def' ? item.card.definition : item.card.term;
}

export function questionImage(item: QueueItem): string | null | undefined {
  return item.direction === 'term_to_def'
    ? item.card.term_image_url
    : item.card.definition_image_url;
}

export function answerImage(item: QueueItem): string | null | undefined {
  return item.direction === 'term_to_def'
    ? item.card.definition_image_url
    : item.card.term_image_url;
}

/** Язык стороны, которую пользователь вводит: по нему работают артикли. */
export function answerLang(
  item: QueueItem,
  langTerm: string | undefined,
  langDefinition: string | undefined,
): string | undefined {
  return item.direction === 'term_to_def' ? langDefinition : langTerm;
}
