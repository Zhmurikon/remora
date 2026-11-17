import { useRef } from 'react';

export function LessonQuizCount({
  value,
  onChange,
  valid,
}: {
  value: string;
  onChange: (value: string) => void;
  valid: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  function step(direction: 'up' | 'down') {
    const field = input.current;
    if (!field) return;
    if (direction === 'up') field.stepUp();
    else field.stepDown();
    onChange(field.value);
  }
  return (
    <div className="quiz-count">
      <label htmlFor="lesson-quiz-count">Количество вопросов</label>
      <div className="quiz-stepper">
        <button
          type="button"
          aria-label="Уменьшить количество вопросов"
          disabled={Number(value) <= 1}
          onClick={() => step('down')}
        >
          −
        </button>
        <input
          ref={input}
          id="lesson-quiz-count"
          type="number"
          inputMode="numeric"
          required
          min={1}
          max={50}
          step={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={!valid || undefined}
          aria-describedby={!valid ? 'lesson-quiz-count-hint' : undefined}
        />
        <button
          type="button"
          aria-label="Увеличить количество вопросов"
          disabled={Number(value) >= 50}
          onClick={() => step('up')}
        >
          +
        </button>
      </div>
      {!valid && (
        <p id="lesson-quiz-count-hint" className="text-danger text-sm">
          Введите целое число от 1 до 50.
        </p>
      )}
    </div>
  );
}
