import fixture from '../../../../../packages/core/src/learn-round-cases.json';
import { describe, expect, it } from 'vitest';
import { prepareLearnExercise, type ExerciseKind } from './learn-exercise';
import type { QueueItem } from './study-store';

const cards = Array.from({ length: 5 }, (_, i): QueueItem => ({
  card: {
    id: String(i),
    position: i,
    code_language: null,
    content_type: 'text',
    term_transcription: null,
    definition_transcription: null,
    hint: null,
    term: 'Термин ' + i,
    definition: 'Значение ' + i,
    alt_answers: [],
    wrong_term_answers: ['А', 'Б', 'В'],
    wrong_definition_answers: ['Г', 'Д', 'Е'],
  },
  state: {
    card_id: String(i),
    direction: 'term_to_def',
    difficulty: null,
    stability: null,
    due_at: '2026-11-24T00:00:00Z',
    lapses: 0,
    reps: 0,
    state: 'new',
    last_reviewed_at: null,
  },
  previews: [],
  direction: 'term_to_def',
  lang_term: 'ru',
  lang_definition: 'ru',
}));
describe('Заучивание', () => {
  it('совпадает с мобильным раундом по типам, направлениям и порядку вариантов', () => {
    let previous: ExerciseKind | undefined;
    fixture.rounds.forEach((expected, turn) => {
      const plan = prepareLearnExercise(
        fixture.items as unknown as QueueItem[],
        0,
        turn,
        ['choice', 'recall'],
        { term: true, definition: true },
        fixture.seed,
        previous,
      )!;
      expect({
        kind: plan.kind,
        direction: plan.item.direction,
        options: plan.options,
        pairs: plan.pairs?.map((item) => item.card.id),
        statement: plan.statement,
        truth: plan.trueStatement,
      }).toEqual(expected);
      previous = plan.kind;
    });
  });
  it('чередует доступные формы, различает источники вариантов и направления письма', () => {
    const found = new Set<ExerciseKind>();
    let previous: ExerciseKind | undefined;
    for (let turn = 0; turn < 16; turn++) {
      const exercise = prepareLearnExercise(
        cards,
        0,
        turn,
        ['choice', 'recall'],
        { term: true, definition: true },
        'mixed',
        previous,
      )!;
      expect(exercise.kind).not.toBe(previous);
      previous = exercise.kind;
      found.add(exercise.kind);
      if (exercise.kind === 'easyTerm')
        expect(exercise.options!.every((text) => text.startsWith('Термин'))).toBe(true);
      if (exercise.kind === 'term')
        expect(exercise.options).toEqual(expect.arrayContaining(['А', 'Б', 'В']));
      if (exercise.kind === 'writeTerm') expect(exercise.item.direction).toBe('def_to_term');
      if (exercise.kind === 'writeDefinition') expect(exercise.item.direction).toBe('term_to_def');
    }
    expect(found.size).toBe(8);
  });
  it('для маленького набора пропускает сопоставление и по умолчанию не предлагает письмо', () => {
    for (let turn = 0; turn < 15; turn++) {
      const { kind } = prepareLearnExercise(
        cards.slice(0, 2),
        0,
        turn,
        ['choice', 'recall'],
        { term: false, definition: false },
        'small',
      )!;
      expect(['writeTerm', 'writeDefinition', 'pairs']).not.toContain(kind);
    }
  });
});
