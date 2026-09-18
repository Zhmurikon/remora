import { normalizeOption } from '@remora/core';
import { useId } from 'react';

export function wrongAnswersError(
  values: string[],
  correct: string,
  alternatives: string[] = [],
): string | null {
  const answers = values.filter((value) => value.trim());
  if (answers.length > 30) return 'Можно добавить до 30 вариантов для каждого направления.';
  const seen = new Set([normalizeOption(correct), ...alternatives.map(normalizeOption)]);
  for (const answer of answers) {
    if (answer.length > 10_000) return 'Вариант не должен превышать 10 000 символов.';
    const key = normalizeOption(answer);
    if (seen.has(key))
      return 'Уберите повторы и варианты, совпадающие с правильным ответом или его синонимами.';
    seen.add(key);
  }
  return null;
}

export function WrongAnswersEditor({
  term,
  definition,
  wrongTermAnswers,
  wrongDefinitionAnswers,
  alternatives,
  onChange,
}: {
  term: string;
  definition: string;
  wrongTermAnswers: string[];
  wrongDefinitionAnswers: string[];
  alternatives: string[];
  onChange: (field: 'wrongTermAnswers' | 'wrongDefinitionAnswers', values: string[]) => void;
}) {
  const id = useId();
  return (
    <details className="border-border mx-4 mb-4 border-t pt-2">
      <summary className="text-primary focus-visible:outline-primary min-h-11 cursor-pointer rounded-lg py-3 text-sm font-medium focus-visible:outline focus-visible:outline-2">
        Неверные ответы (необязательно)
      </summary>
      <p id={`${id}-help`} className="text-fg-muted mb-4 text-sm">
        Один вариант на строку. Сначала используем ваши варианты, недостающие берём из других
        карточек. Если вариантов больше трёх, выбираем три случайных. Пустые строки не сохраняются.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            [
              'wrongDefinitionAnswers',
              'Термин → определение',
              'Неверные определения',
              wrongDefinitionAnswers,
              definition,
            ],
            [
              'wrongTermAnswers',
              'Определение → термин',
              'Неверные термины',
              wrongTermAnswers,
              term,
            ],
          ] as const
        ).map(([field, direction, label, values, correct]) => {
          const error = wrongAnswersError(values, correct, alternatives);
          return (
            <div key={field}>
              <label htmlFor={`${id}-${field}`} className="block text-sm font-medium">
                {label}
              </label>
              <p className="text-fg-muted mt-1 text-sm">{direction}</p>
              <textarea
                id={`${id}-${field}`}
                rows={3}
                value={values.join('\n')}
                onChange={(event) => onChange(field, event.target.value.split('\n'))}
                aria-invalid={!!error}
                aria-describedby={`${id}-help${error ? ` ${id}-${field}-error` : ''}`}
                className="border-border bg-surface-muted text-fg mt-2 min-h-11 w-full resize-y rounded-xl border px-3 py-3 text-sm"
              />
              {error && (
                <p id={`${id}-${field}-error`} role="alert" className="text-danger mt-1 text-sm">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}
