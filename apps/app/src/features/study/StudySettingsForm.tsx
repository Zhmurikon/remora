/**
 * Настройки планировщика. Влияют только на плотность повторений — ни одна
 * из них не ограничивает доступ к обучению (docs/04-limits.md, раздел 3).
 */

import type { ApiError } from '@remora/api-client';
import { STRICTNESS_LABELS, STRICTNESS_LEVELS, type Strictness } from '@remora/core';
import { Button, Card, Input } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';

export function StudySettingsForm() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [typingCheck, setTypingCheck] = useState<'automatic' | 'self_check'>('automatic');

  const settings = useQuery({
    queryKey: ['study', 'settings'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/study/settings');
      if (error || !data) throw new Error('Не удалось загрузить настройки');
      return data;
    },
  });

  useEffect(() => {
    if (settings.data) setTypingCheck(settings.data.learn_typing_check);
  }, [settings.data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const questionTypes = form.getAll('learn_question_types').map(String) as Array<
      'choice' | 'typing' | 'recall'
    >;
    if (questionTypes.length === 0) {
      setMessage('Выберите хотя бы один тип упражнения');
      setSaving(false);
      return;
    }
    const { error } = await api.PATCH('/api/v1/study/settings', {
      body: {
        // Удержание в интерфейсе — проценты: «90%» понятнее, чем «0.9».
        fsrs_desired_retention: Number(form.get('retention')) / 100,
        fsrs_max_interval_days: Number(form.get('max_interval')),
        new_cards_per_day: Number(form.get('new_per_day')),
        reviews_per_day: Number(form.get('reviews_per_day')),
        daily_goal_cards: Number(form.get('daily_goal')),
        answer_strictness: String(form.get('strictness')) as Strictness,
        learn_question_types: questionTypes,
        learn_successes_required: Number(form.get('learn_successes_required')),
        learn_typing_check: typingCheck,
        learn_match_percent: Number(form.get('learn_match_percent')),
      },
    });
    if (error) {
      setMessage((error as ApiError).message ?? 'Не удалось сохранить');
    } else {
      setMessage('Настройки сохранены');
      await queryClient.invalidateQueries({ queryKey: ['study'] });
    }
    setSaving(false);
  }

  if (settings.isPending) {
    return (
      <Card className="p-6">
        <p className="text-fg-muted">Загружаем настройки обучения…</p>
      </Card>
    );
  }
  if (!settings.data) {
    return (
      <Card className="p-6">
        <p className="text-danger">Не удалось загрузить настройки обучения.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Обучение</h2>
      <p className="text-fg-muted mt-1 text-sm">Настройки расписания и режима «Заучивание».</p>
      <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        <fieldset className="border-border rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">Упражнения в «Заучивании»</legend>
          <p className="text-fg-subtle mb-3 text-sm">
            Remora подбирает подходящий тип из включённых по тому, насколько хорошо знакома
            карточка.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ['choice', 'Выбор ответа'],
              ['typing', 'Написание ответа'],
              ['recall', 'Карточка с самооценкой'],
            ].map(([value, label]) => (
              <label
                key={value}
                className="border-border bg-surface hover:bg-surface-muted flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors"
              >
                <input
                  type="checkbox"
                  name="learn_question_types"
                  value={value}
                  defaultChecked={settings.data.learn_question_types.includes(
                    value as 'choice' | 'typing' | 'recall',
                  )}
                  className="accent-primary h-5 w-5"
                />
                <span className="text-sm font-medium">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Input
          label="Успешных ответов на карточку"
          hint="Сколько раз нужно правильно ответить в одной сессии. Ошибки не сбрасывают уже набранные успехи."
          name="learn_successes_required"
          type="number"
          inputMode="numeric"
          min={1}
          max={5}
          defaultValue={settings.data.learn_successes_required}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="learn_typing_check" className="text-fg text-sm font-medium">
            Проверка написанного ответа
          </label>
          <select
            id="learn_typing_check"
            name="learn_typing_check"
            value={typingCheck}
            onChange={(event) => setTypingCheck(event.target.value as 'automatic' | 'self_check')}
            className="border-border bg-surface text-fg min-h-11 w-full rounded-md border px-3 text-base"
          >
            <option value="automatic">Автоматически по совпадению</option>
            <option value="self_check">Показывать ответ для самооценки</option>
          </select>
          <p className="text-fg-subtle text-sm">
            Самооценка полезна для длинных определений, где важен смысл, а не дословная
            формулировка.
          </p>
        </div>

        <Input
          label="Минимальное совпадение, %"
          hint="Доля совпавших символов после нормализации регистра и пробелов. Рекомендуем 90%."
          name="learn_match_percent"
          type="number"
          inputMode="numeric"
          min={50}
          max={100}
          step={1}
          defaultValue={settings.data.learn_match_percent}
          disabled={typingCheck === 'self_check'}
        />

        <h3 className="pt-2 text-base font-semibold">Расписание повторений</h3>
        <Input
          label="Целевое удержание, %"
          hint="Чем выше, тем чаще повторения. 90% — разумное значение по умолчанию."
          name="retention"
          type="number"
          min={70}
          max={98}
          step={1}
          defaultValue={Math.round(settings.data.fsrs_desired_retention * 100)}
        />
        <Input
          label="Максимальный интервал, дней"
          name="max_interval"
          type="number"
          min={1}
          max={36500}
          defaultValue={settings.data.fsrs_max_interval_days}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Новых карточек в день"
            name="new_per_day"
            type="number"
            min={0}
            max={500}
            defaultValue={settings.data.new_cards_per_day}
          />
          <Input
            label="Повторений в день"
            name="reviews_per_day"
            type="number"
            min={0}
            max={2000}
            defaultValue={settings.data.reviews_per_day}
          />
        </div>
        <Input
          label="Дневная цель, карточек"
          name="daily_goal"
          type="number"
          min={1}
          max={500}
          defaultValue={settings.data.daily_goal_cards}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="strictness" className="text-fg text-sm font-medium">
            Строгость проверки ответов
          </label>
          <select
            id="strictness"
            name="strictness"
            defaultValue={settings.data.answer_strictness}
            className="border-border bg-surface text-fg h-10 w-full rounded-md border px-3 text-base"
          >
            {STRICTNESS_LEVELS.map((level) => (
              <option key={level} value={level}>
                {STRICTNESS_LABELS[level]}
              </option>
            ))}
          </select>
          <p className="text-fg-subtle text-sm">
            «Строго» — только регистр, пробелы и ё. «Умеренно» — ещё пунктуация, артикли и одна
            опечатка. «Мягко» — прощает две-три.
          </p>
        </div>
        {message && <p className="text-fg-muted text-sm">{message}</p>}
        <Button type="submit" loading={saving}>
          Сохранить
        </Button>
      </form>
    </Card>
  );
}
