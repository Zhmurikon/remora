import type { PythonCheck } from './python-runner-protocol';

export function checkFailureMessage(check: PythonCheck, actual: unknown): string | null {
  if (check.kind === 'output') {
    const actualOutput = normalizeOutput(String(actual));
    const expectedOutput = normalizeOutput(check.expectedOutput);
    if (actualOutput === expectedOutput) return null;
    return failureMessage(expectedOutput, actualOutput);
  }

  if (canonicalJson(actual) === canonicalJson(check.expected)) return null;
  return failureMessage(check.expected, actual);
}

export function normalizeOutput(value: string) {
  return value.replace(/\r\n?/g, '\n').trimEnd();
}

function failureMessage(expected: unknown, actual: unknown) {
  return `Ожидалось: ${formatValue(expected)}\nПолучено: ${formatValue(actual)}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

function formatValue(value: unknown) {
  if (typeof value === 'string') return value ? `«${value}»` : 'пустая строка';
  return JSON.stringify(value, null, 2) ?? String(value);
}
