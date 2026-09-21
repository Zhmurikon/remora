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
import {
  DEFAULT_LEARN_PREFERENCES,
  LearnSettingsControls,
  type LearnPreferences,
} from './LearnSettingsControls';

export function StudySettingsForm() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [learn, setLearn] = useState<LearnPreferences>(DEFAULT_LEARN_PREFERENCES);

  const settings = useQuery({
    queryKey: ['study', 'settings'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/study/settings');
      if (error || !data) throw new Error('Не удалось загрузить настройки');
      return data;
    },
  });

  useEffect(() => {
    if (!settings.data) return;
    setLearn({
      questionTypes: settings.data.learn_question_types,
      successesRequired: settings.data.learn_successes_required,
      typingCheck: settings.data.learn_typing_check,
      matchPercent: settings.data.learn_match_percent,
    });
  }, [settings.data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    if (learn.questionTypes.length === 0) {
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
        learn_question_types: learn.questionTypes,
        learn_successes_required: learn.successesRequired,
        learn_typing_check: learn.typingCheck,
        learn_match_percent: learn.matchPercent,
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
        <LearnSettingsControls value={learn} onChange={setLearn} />

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
