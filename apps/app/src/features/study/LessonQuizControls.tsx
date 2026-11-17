import type { components } from '@remora/api-client';
import { useRef } from 'react';

const drawings = {
  choice: (
    <>
      <g fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="10" cy="8" r="6" className="quiz-ink" />
        <circle cx="10" cy="25" r="6" />
        <circle cx="10" cy="42" r="6" />
        <path d="M28 8h68m-68 17h53m-53 17h62" strokeWidth="3" />
      </g>
      <circle cx="10" cy="8" r="2.6" fill="currentColor" className="quiz-ink" />
    </>
  ),
  true_false: (
    <>
      <rect x="3" y="10" width="43" height="29" rx="5" />
      <rect x="54" y="10" width="43" height="29" rx="5" />
      <path d="m17 24 5 5 11-12m36 2 11 11m0-11-11 11" />
    </>
  ),
  typing: (
    <>
      <rect x="3" y="11" width="112" height="27" rx="4" />
      <path d="M13 17v14" />
    </>
  ),
  matching: (
    <>
      <path d="M12 14h33m-33 23h33m41-23h30m-30 23h30" strokeWidth="3" />
      <path d="M50 14c12 0 17 23 30 23m-30 0c12 0 17-23 30-23" />
      <g fill="currentColor" stroke="none">
        <circle cx="4" cy="14" r="3" />
        <circle cx="4" cy="37" r="3" />
      </g>
    </>
  ),
};

export function QuizFormatPreview({ kind }: { kind: components['schemas']['TestQuestionKind'] }) {
  return (
    <svg
      className="quiz-format-preview"
      viewBox="0 0 120 50"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {drawings[kind]}
    </svg>
  );
}

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
