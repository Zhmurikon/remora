import { describe, expect, it } from 'vitest';
import cases from './answer-cases.json';
import {
  answerSimilarity,
  checkAnswer,
  levenshtein,
  normalizeAnswer,
  typoThreshold,
  type AnswerVerdict,
  type Strictness,
} from './answers';

describe('answerSimilarity', () => {
  it('возвращает понятный процент после нормализации', () => {
    expect(answerSimilarity('  Ёлка ', 'елка')).toBe(100);
    expect(answerSimilarity('кот', 'кит')).toBe(67);
    expect(answerSimilarity('', 'кот')).toBe(0);
  });
});

describe('контракт нормализатора ответов', () => {
  it.each(cases.cases.map((item) => [item.name, item] as const))('%s', (_name, item) => {
    const result = checkAnswer(item.typed, item.expected, {
      strictness: (item.strictness as Strictness | undefined) ?? 'moderate',
      alternatives: item.alternatives,
      lang: item.lang,
    });
    expect(result.verdict).toBe(item.verdict as AnswerVerdict);
    if (item.matched !== undefined) expect(result.matched).toBe(item.matched);
  });

  it('покрывает не меньше 60 кейсов', () => {
    // Требование Definition of Done этапа E4.
    expect(cases.cases.length).toBeGreaterThanOrEqual(60);
  });
});

describe('normalizeAnswer', () => {
  it('приводит регистр, пробелы и ё во всех режимах', () => {
    for (const strictness of ['strict', 'moderate', 'lenient'] as const) {
      expect(normalizeAnswer('  Ёлка\n\tЗелёная ', { strictness })).toBe('елка зеленая');
    }
  });

  it('сохраняет пунктуацию и диакритику в строгом режиме', () => {
    expect(normalizeAnswer('café, s’il vous plaît', { strictness: 'strict' })).toBe(
      'café, s’il vous plaît',
    );
  });

  it('снимает диакритику только с латиницы', () => {
    expect(normalizeAnswer('café')).toBe('cafe');
    expect(normalizeAnswer('мой')).toBe('мой');
    expect(normalizeAnswer('тайный')).toBe('тайный');
  });
});

describe('levenshtein', () => {
  it.each([
    ['', '', 0],
    ['кошка', 'кошка', 0],
    ['кошка', 'кошки', 1],
    ['кот', '', 3],
    ['', 'кот', 3],
    ['recieve', 'receive', 2],
    ['abc', 'cba', 2],
  ])('%s → %s = %i', (left, right, expected) => {
    expect(levenshtein(left, right)).toBe(expected);
    expect(levenshtein(right, left)).toBe(expected);
  });
});

describe('typoThreshold', () => {
  it('строгий режим не прощает ничего', () => {
    expect(typoThreshold(3, 'strict')).toBe(0);
    expect(typoThreshold(50, 'strict')).toBe(0);
  });

  it('растёт с длиной ответа', () => {
    expect(typoThreshold(3)).toBe(0);
    expect(typoThreshold(7)).toBe(1);
    expect(typoThreshold(20)).toBe(2);
    expect(typoThreshold(20, 'lenient')).toBe(3);
  });
});
