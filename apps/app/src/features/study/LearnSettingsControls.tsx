import { Button, Input } from '@remora/ui';

export type LearnQuestionType = 'choice' | 'typing' | 'recall';
export type LearnTypingCheck = 'automatic' | 'self_check';

export interface LearnPreferences {
  questionTypes: LearnQuestionType[];
  successesRequired: number;
  typingCheck: LearnTypingCheck;
  matchPercent: number;
}

export const DEFAULT_LEARN_PREFERENCES: LearnPreferences = {
  questionTypes: ['choice', 'typing', 'recall'],
  successesRequired: 1,
  typingCheck: 'automatic',
  matchPercent: 90,
};

const PRESETS: Array<{ label: string; value: LearnPreferences }> = [
  {
    label: 'Быстро',
    value: {
      questionTypes: ['choice', 'recall'],
      successesRequired: 1,
      typingCheck: 'automatic',
      matchPercent: 80,
    },
  },
  { label: 'Обычно', value: DEFAULT_LEARN_PREFERENCES },
  {
    label: 'Тщательно',
    value: {
      questionTypes: ['choice', 'typing', 'recall'],
      successesRequired: 3,
      typingCheck: 'automatic',
      matchPercent: 95,
    },
  },
];

export function LearnSettingsControls({
  value,
  onChange,
}: {
  value: LearnPreferences;
  onChange: (value: LearnPreferences) => void;
}) {
  function toggle(questionType: LearnQuestionType) {
    const enabled = value.questionTypes.includes(questionType);
    onChange({
      ...value,
      questionTypes: enabled
        ? value.questionTypes.filter((item) => item !== questionType)
        : [...value.questionTypes, questionType],
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-fg text-sm font-medium">Готовые варианты</p>
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Пресеты заучивания">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="secondary"
              onClick={() =>
                onChange({ ...preset.value, questionTypes: [...preset.value.questionTypes] })
              }
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <p className="text-fg-subtle mt-2 text-sm">
          «Быстро» — одно узнавание, «Обычно» — адаптивный режим, «Тщательно» — три успешных ответа.
        </p>
      </div>

      <fieldset className="border-border rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Упражнения</legend>
        <p className="text-fg-subtle mb-3 text-sm">
          Remora подбирает подходящий тип из включённых по тому, насколько хорошо знакома карточка.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ['choice', 'Выбор ответа'],
            ['typing', 'Написание ответа'],
            ['recall', 'Карточка с самооценкой'],
          ].map(([rawValue, label]) => {
            const questionType = rawValue as LearnQuestionType;
            return (
              <label
                key={questionType}
                className="border-border bg-surface hover:bg-surface-muted flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={value.questionTypes.includes(questionType)}
                  onChange={() => toggle(questionType)}
                  className="accent-primary h-5 w-5"
                />
                <span className="text-sm font-medium">{label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Input
        label="Успешных ответов на карточку"
        hint="Сколько раз нужно правильно ответить в одной сессии. Ошибки не сбрасывают уже набранные успехи."
        type="number"
        inputMode="numeric"
        min={1}
        max={5}
        value={value.successesRequired}
        onChange={(event) => onChange({ ...value, successesRequired: Number(event.target.value) })}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="learn_typing_check" className="text-fg text-sm font-medium">
          Проверка написанного ответа
        </label>
        <select
          id="learn_typing_check"
          value={value.typingCheck}
          onChange={(event) =>
            onChange({ ...value, typingCheck: event.target.value as LearnTypingCheck })
          }
          className="border-border bg-surface text-fg min-h-11 w-full rounded-md border px-3 text-base"
        >
          <option value="automatic">Автоматически по совпадению</option>
          <option value="self_check">Показывать ответ для самооценки</option>
        </select>
        <p className="text-fg-subtle text-sm">
          Самооценка полезна для длинных определений, где важен смысл, а не дословная формулировка.
        </p>
      </div>

      <Input
        label="Минимальное совпадение, %"
        hint="Доля совпавших символов после нормализации регистра и пробелов. Рекомендуем 90%."
        type="number"
        inputMode="numeric"
        min={50}
        max={100}
        step={1}
        value={value.matchPercent}
        onChange={(event) => onChange({ ...value, matchPercent: Number(event.target.value) })}
        disabled={value.typingCheck === 'self_check'}
      />
    </div>
  );
}
