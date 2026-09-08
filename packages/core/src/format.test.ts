import { describe, expect, it } from 'vitest';
import { formatBytes, formatInterval, plural, pluralWithCount } from './format';

describe('plural', () => {
  const forms: [string, string, string] = ['карточка', 'карточки', 'карточек'];

  it('склоняет по русским правилам', () => {
    expect(plural(1, forms)).toBe('карточка');
    expect(plural(2, forms)).toBe('карточки');
    expect(plural(5, forms)).toBe('карточек');
    expect(plural(11, forms)).toBe('карточек');
    expect(plural(21, forms)).toBe('карточка');
    expect(plural(102, forms)).toBe('карточки');
    expect(plural(0, forms)).toBe('карточек');
  });

  it('добавляет число', () => {
    expect(pluralWithCount(3, forms)).toBe('3 карточки');
  });
});

describe('formatInterval', () => {
  it('часы для интервалов меньше суток', () => {
    expect(formatInterval(0.5)).toBe('12 часов');
    expect(formatInterval(1 / 24)).toBe('1 час');
  });

  it('дни', () => {
    expect(formatInterval(1)).toBe('1 день');
    expect(formatInterval(3)).toBe('3 дня');
    expect(formatInterval(21)).toBe('21 день');
  });

  it('месяцы и годы', () => {
    expect(formatInterval(60)).toBe('2 месяца');
    expect(formatInterval(365)).toBe('1 год');
  });
});

describe('formatBytes', () => {
  it('переводит в понятные единицы', () => {
    expect(formatBytes(512)).toBe('512 Б');
    expect(formatBytes(2048)).toBe('2 КБ');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2 МБ');
  });
});
