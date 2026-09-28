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

  it('сравнивает числа и массивы с заданной погрешностью', () => {
    const check = {
      kind: 'function' as const,
      name: 'Массив',
      functionName: 'standardize',
      args: [[1, 2, 3]],
      expected: [-1.224744871, 0, 1.224744871],
      tolerance: 1e-6,
    };

    expect(checkFailureMessage(check, [-1.2247449, 0, 1.2247449])).toBeNull();
    expect(checkFailureMessage(check, [-1.2, 0, 1.2])).toContain('Ожидалось:');
  });
});
