import { describe, expect, it } from 'vitest';
import { checkFailureMessage, normalizeOutput } from './python-checks';

describe('проверка решений Python', () => {
  it('нормализует переносы строк и завершающие пробелы в выводе', () => {
    expect(normalizeOutput('Привет\r\n\n')).toBe('Привет');
    expect(
      checkFailureMessage(
        { kind: 'output', name: 'Пример', stdin: [], expectedOutput: 'Привет' },
        'Привет\n',
      ),
    ).toBeNull();
  });

  it('объясняет первое несовпадение вывода', () => {
    expect(
      checkFailureMessage(
        { kind: 'output', name: 'Пример', stdin: [], expectedOutput: 'Привет, Мира!' },
        'Привет!',
      ),
    ).toBe('Ожидалось: «Привет, Мира!»\nПолучено: «Привет!»');
  });

  it('сравнивает структурированный результат функции независимо от порядка ключей', () => {
    const check = {
      kind: 'function' as const,
      name: 'Словарь',
      functionName: 'summary',
      args: [[1, 2, 3]],
      expected: { total: 6, count: 3 },
    };

    expect(checkFailureMessage(check, { count: 3, total: 6 })).toBeNull();
    expect(checkFailureMessage(check, { count: 2, total: 6 })).toContain('Ожидалось:');
  });
});
