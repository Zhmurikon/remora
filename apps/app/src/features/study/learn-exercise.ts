import { generateOptions, normalizeOption, shuffleWithSeed } from '@remora/core';
import type { LearnQuestionType } from './LearnSettingsControls';
import type { QueueItem } from './study-store';

export type ExerciseKind =
  | 'recall'
  | 'easyTerm'
  | 'pairs'
  | 'truth'
  | 'definition'
  | 'term'
  | 'writeTerm'
  | 'writeDefinition';
export interface LearnExercise {
  kind: ExerciseKind;
  item: QueueItem;
  options?: string[];
  pairs?: QueueItem[];
  statement?: string;
  trueStatement?: boolean;
}

export const exerciseTitles: Record<ExerciseKind, string> = {
  recall: 'Вспомните ответ',
  easyTerm: 'Выберите термин',
  pairs: 'Соедините пары',
  truth: 'Верна ли пара?',
  definition: 'Выберите определение',
  term: 'Выберите термин',
  writeTerm: 'Напишите термин',
  writeDefinition: 'Напишите определение',
};

export interface WritingModes {
  term: boolean;
  definition: boolean;
}

export function prepareLearnExercise(
  items: QueueItem[],
  index: number,
  turn: number,
  enabled: readonly LearnQuestionType[],
  writing: WritingModes,
  seed: string,
  previous?: ExerciseKind,
): LearnExercise | null {
  const original = items[index];
  if (!original) return null;
  const card = original.card;
  const questionSeed = `${seed}:${card.id}:${turn}`;
  const choices = enabled.includes('choice');
  const similarItems = items.filter(
    (other) =>
      other.card.id !== card.id &&
      other.lang_term === original.lang_term &&
      other.lang_definition === original.lang_definition,
  );
  const methods: LearnExercise[] = [];
  const forward = { ...original, direction: 'term_to_def' as const };
  const reverse = { ...original, direction: 'def_to_term' as const };

  function choice(kind: ExerciseKind, side: 'term' | 'definition', authored: boolean) {
    if (!choices || !card[side].trim()) return;
    const options = generateOptions({
      correct: card[side],
      alternatives: card.alt_answers,
      seed: questionSeed,
      preferred: authored
        ? card[side === 'term' ? 'wrong_term_answers' : 'wrong_definition_answers']
        : [],
      pool:
        authored && side === 'term'
          ? []
          : similarItems
              .filter(
                (other) =>
                  normalizeOption(other.card[side === 'term' ? 'definition' : 'term']) !==
                  normalizeOption(card[side === 'term' ? 'definition' : 'term']),
              )
              .map((other) => other.card[side]),
    });
    if (options.length >= (authored ? 2 : 3))
      methods.push({ kind, item: side === 'term' ? reverse : forward, options });
  }

  choice('easyTerm', 'term', false);
  if (choices) {
    const pairs: QueueItem[] = [];
    const terms = new Set<string>(),
      definitions = new Set<string>();
    for (const other of items.slice(index)) {
      const term = normalizeOption(other.card.term),
        def = normalizeOption(other.card.definition);
      if (
        !term ||
        !def ||
        terms.has(term) ||
        definitions.has(def) ||
        other.lang_term !== original.lang_term ||
        other.lang_definition !== original.lang_definition
      )
        continue;
      terms.add(term);
      definitions.add(def);
      pairs.push(other);
      if (pairs.length === 4) break;
    }
    if (pairs.length >= 3 && pairs[0] === original)
      methods.push({ kind: 'pairs', pairs, item: original });
  }
  if (enabled.includes('recall')) methods.push({ kind: 'recall', item: original });
  if (writing.definition && card.definition.trim())
    methods.push({ kind: 'writeDefinition', item: forward });
  if (choices && card.term.trim() && card.definition.trim()) {
    const alternatives = generateOptions({
      correct: card.definition,
      preferred: card.wrong_definition_answers,
      pool: similarItems
        .filter((other) => normalizeOption(other.card.term) !== normalizeOption(card.term))
        .map((other) => other.card.definition),
      alternatives: card.alt_answers,
      seed: questionSeed,
    }).filter((value) => normalizeOption(value) !== normalizeOption(card.definition));
    if (alternatives.length) {
      const positive = shuffleWithSeed([true, false], questionSeed)[0]!;
      methods.push({
        kind: 'truth',
        item: forward,
        statement: positive ? card.definition : alternatives[0],
        trueStatement: positive,
      });
    }
  }
  choice('definition', 'definition', true);
  if (writing.term && card.term.trim()) methods.push({ kind: 'writeTerm', item: reverse });
  choice('term', 'term', true);
  if (!methods.length) return { kind: 'recall', item: original };
  const rotation = shuffleWithSeed(methods, seed);
  const position = turn % rotation.length;
  const candidate = rotation[position]!;
  return candidate.kind === previous && rotation.length > 1
    ? rotation[(position + 1) % rotation.length]!
    : candidate;
}
