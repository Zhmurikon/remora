/** Настройки меняют расписание, но никогда не ограничивают доступ к обучению. */
import type { components } from '@remora/api-client';
import { STRICTNESS_LABELS, STRICTNESS_LEVELS, type Strictness } from '@remora/core';
import { Button, Card, Input } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import {
  SettingsFeedback,
  SettingsSaveBar,
  useSettingsDirty,
  settingsError,
  type SettingsNotice,
} from '../settings/SettingsFeedback';
import { LearnSettingsControls } from './LearnSettingsControls';

type StudySettings = components['schemas']['StudySettingsOut'];

export function StudySettingsForm() {
  const settings = useQuery({
    queryKey: ['study', 'settings'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/study/settings');
      if (error || !data) throw new Error(settingsError(error));
      return data;
    },
  });
  if (settings.isPending)
    return (
      <Card className="settings-card">
        <h2>Обучение</h2>
        <p role="status" className="mt-5">
          Загружаем настройки обучения…
        </p>
      </Card>
    );
  if (!settings.data)
    return (
      <Card className="settings-card">
        <h2>Обучение</h2>
        <SettingsFeedback
          notice={{ kind: 'error', text: 'Не удалось загрузить настройки обучения.' }}
        />
        <Button variant="secondary" onClick={() => void settings.refetch()}>
          Повторить
        </Button>
      </Card>
    );
  return <StudySettingsFields initial={settings.data} />;
}

function StudySettingsFields({ initial }: { initial: StudySettings }) {
  const cache = useQueryClient();
  // Фоновая загрузка не должна перезаписывать уже изменённые пользователем поля.
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [notice, setNotice] = useState<SettingsNotice>(null);
  const [saving, setSaving] = useState(false);
  const [exerciseError, setExerciseError] = useState(false);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  useSettingsDirty('study', dirty);
  function change(patch: Partial<StudySettings>) {
    setDraft((current) => ({ ...current, ...patch }));
    setNotice(null);
    setExerciseError(false);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!draft.learn_question_types.length) {
      setExerciseError(true);
      setNotice({ kind: 'error', text: 'Выберите хотя бы один тип упражнения.' });
      event.currentTarget.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const { data, error } = await api.PATCH('/api/v1/study/settings', {
        body: {
          fsrs_desired_retention: draft.fsrs_desired_retention,
          fsrs_max_interval_days: draft.fsrs_max_interval_days,
          new_cards_per_day: draft.new_cards_per_day,
          reviews_per_day: draft.reviews_per_day,
          daily_goal_cards: draft.daily_goal_cards,
          answer_strictness: draft.answer_strictness,
          learn_question_types: draft.learn_question_types,
          learn_successes_required: draft.learn_successes_required,
          learn_session_size: draft.learn_session_size,
          learn_typing_check: draft.learn_typing_check,
          learn_match_percent: draft.learn_match_percent,
        },
      });
      if (error) throw error;
      const updated = data ?? draft;
      setSaved(updated);
      setDraft(updated);
      cache.setQueryData(['study', 'settings'], updated);
      setNotice({ kind: 'success', text: 'Настройки обучения сохранены' });
      await cache.invalidateQueries({ queryKey: ['study'] });
    } catch (error) {
      setNotice({ kind: 'error', text: settingsError(error) });
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card className="settings-card">
      <h2>Обучение</h2>
      <p className="settings-description">Настройки расписания и режима «Заучивание».</p>
      <form className="settings-form" onSubmit={(event) => void submit(event)}>
        <fieldset disabled={saving} className="settings-fields">
          <LearnSettingsControls
            value={{
              questionTypes: draft.learn_question_types,
              successesRequired: draft.learn_successes_required,
              sessionSize: draft.learn_session_size,
              typingCheck: draft.learn_typing_check,
              matchPercent: draft.learn_match_percent,
            }}
            onChange={(learn) =>
              change({
                learn_question_types: learn.questionTypes,
                learn_successes_required: learn.successesRequired,
                learn_session_size: learn.sessionSize,
                learn_typing_check: learn.typingCheck,
                learn_match_percent: learn.matchPercent,
              })
            }
          />
          {exerciseError && (
            <p className="text-danger text-sm">Нужно включить хотя бы одно упражнение.</p>
          )}
          <h3 className="settings-subheading">Расписание повторений</h3>
          <p className="text-fg-muted text-sm">
            Эти значения помогают планировать день. Вы всегда можете продолжить обучение сверх
            расписания.
          </p>
          <div className="settings-field-pair">
            <Input
              label="Новых карточек в день"
              name="new_per_day"
              type="number"
              min={0}
              max={500}
              required
              value={draft.new_cards_per_day}
              onChange={(event) => change({ new_cards_per_day: Number(event.target.value) })}
            />
            <Input
              label="Повторений в день"
              name="reviews_per_day"
              type="number"
              min={0}
              max={2000}
              required
              value={draft.reviews_per_day}
              onChange={(event) => change({ reviews_per_day: Number(event.target.value) })}
            />
          </div>
          <Input
            label="Дневная цель, карточек"
            name="daily_goal"
            type="number"
            min={1}
            max={500}
            required
            value={draft.daily_goal_cards}
            onChange={(event) => change({ daily_goal_cards: Number(event.target.value) })}
          />
          <details className="settings-advanced">
            <summary>Точные настройки расписания и проверки</summary>
            <div className="settings-fields">
              <Input
                label="Целевое удержание, %"
                hint="Чем выше, тем чаще повторения. Рекомендуем 90%."
                name="retention"
                type="number"
                min={70}
                max={98}
                step={1}
                required
                value={Math.round(draft.fsrs_desired_retention * 100)}
                onChange={(event) =>
                  change({ fsrs_desired_retention: Number(event.target.value) / 100 })
                }
              />
              <Input
                label="Максимальный интервал, дней"
                name="max_interval"
                type="number"
                min={1}
                max={36500}
                required
                value={draft.fsrs_max_interval_days}
                onChange={(event) => change({ fsrs_max_interval_days: Number(event.target.value) })}
              />
              <div className="settings-fields">
                <label htmlFor="strictness">Строгость проверки ответов</label>
                <select
                  id="strictness"
                  name="strictness"
                  value={draft.answer_strictness}
                  onChange={(event) =>
                    change({ answer_strictness: event.target.value as Strictness })
                  }
                >
                  {STRICTNESS_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {STRICTNESS_LABELS[level]}
                    </option>
                  ))}
                </select>
                <p className="text-fg-muted text-sm">
                  «Строго» — только регистр, пробелы и ё. «Умеренно» — ещё пунктуация, артикли и
                  одна опечатка. «Мягко» — прощает две-три.
                </p>
              </div>
            </div>
          </details>
        </fieldset>
        <SettingsFeedback notice={notice} />
        <SettingsSaveBar
          dirty={dirty}
          saving={saving}
          label="Сохранить обучение"
          onCancel={() => {
            setDraft(saved);
            setNotice(null);
            setExerciseError(false);
          }}
        />
      </form>
    </Card>
  );
}
