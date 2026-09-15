import { describe, expect, it } from 'vitest';
import { canAskMultipleChoice, generateOptions, similarity } from './distractors';

const POOL = [
  'собака',
  'кошка',
  'лошадь',
  'корова',
  'овца',
  'коза',
  'курица',
  'утка',
  'гусь',
  'индейка',
];

describe('generateOptions', () => {
  it('всегда содержит правильный ответ', () => {
    const options = generateOptions({ correct: 'кролик', pool: POOL, seed: 'card-1' });
    expect(options).toContain('кролик');
    expect(options).toHaveLength(4);
  });

  it('не повторяет варианты', () => {
    const options = generateOptions({
      correct: 'кошка',
      pool: ['Кошка', 'кошка ', 'кот', 'котёнок', 'котенок', 'пёс'],
      seed: 'card-2',
    });
    const normalized = options.map((option) => option.trim().toLowerCase().replace(/ё/g, 'е'));
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it('не подмешивает вариант, равный правильному ответу', () => {
    // Иначе в вопросе оказалось бы два верных ответа и любой выбор был бы ошибкой.
    const options = generateOptions({
      correct: 'кот',
      pool: ['Кот', 'КОТ', 'кот', 'пёс', 'мышь', 'ёж'],
      seed: 'card-3',
    });
    expect(options.filter((option) => option.toLowerCase() === 'кот')).toHaveLength(1);
  });

  it('держит порядок стабильным при одинаковом seed', () => {
    const first = generateOptions({ correct: 'кролик', pool: POOL, seed: 'card-4' });
    const second = generateOptions({ correct: 'кролик', pool: POOL, seed: 'card-4' });
    expect(second).toEqual(first);
  });

  it('даёт разный порядок для разных карточек', () => {
    const results = ['a', 'b', 'c', 'd', 'e'].map((seed) =>
      generateOptions({ correct: 'кролик', pool: POOL, seed }).join('|'),
    );
    expect(new Set(results).size).toBeGreaterThan(1);
  });

  it('не падает на бедном наборе и возвращает что есть', () => {
    expect(generateOptions({ correct: 'один', pool: [], seed: 'card-5' })).toEqual(['один']);
    expect(generateOptions({ correct: 'один', pool: ['два'], seed: 'card-6' })).toHaveLength(2);
  });

  it('уважает запрошенное число вариантов', () => {
    expect(generateOptions({ correct: 'кролик', pool: POOL, count: 6, seed: 's' })).toHaveLength(6);
    expect(generateOptions({ correct: 'кролик', pool: POOL, count: 2, seed: 's' })).toHaveLength(2);
  });

  it('предпочитает похожие варианты случайным', () => {
    const options = generateOptions({
      correct: 'существительное',
      pool: ['прилагательное', 'числительное', 'местоимение', 'до', 'и', 'на', 'от', 'за', 'по'],
      seed: 'grammar',
    });
    const short = options.filter((option) => option.length <= 2);
    expect(short).toHaveLength(0);
  });
});

describe('canAskMultipleChoice', () => {
  it('требует достаточно уникальных ответов в наборе', () => {
    expect(canAskMultipleChoice(POOL)).toBe(true);
    expect(canAskMultipleChoice(['один', 'два'])).toBe(false);
    expect(canAskMultipleChoice(['один', 'ОДИН', 'один '])).toBe(false);
    expect(canAskMultipleChoice(['один', 'два'], 3)).toBe(true);
  });
});

describe('similarity', () => {
  it('считает одинаковые строки максимально похожими', () => {
    expect(similarity('кошка', 'кошка')).toBeCloseTo(1, 5);
    expect(similarity('Кошка ', 'кошка')).toBeCloseTo(1, 5);
  });

  it('ставит близкие слова выше далёких', () => {
    expect(similarity('кошка', 'кошки')).toBeGreaterThan(similarity('кошка', 'бегемот'));
  });

  it('переживает пустые строки', () => {
    expect(similarity('', 'кошка')).toBe(0);
    expect(similarity('  ', '')).toBe(0);
  });
});
