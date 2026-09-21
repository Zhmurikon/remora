import type { ApiError } from '@remora/api-client';
import { Badge, Button } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  DEFAULT_LEARN_PREFERENCES,
  LearnSettingsControls,
  type LearnPreferences,
} from './LearnSettingsControls';

export function SetLearnSettings({ setId, disabled }: { setId: string; disabled: boolean }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState<LearnPreferences>(DEFAULT_LEARN_PREFERENCES);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const settings = useQuery({
    queryKey: ['study', 'set-learn-settings', setId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/study/sets/{set_id}/learn-settings', {
        params: { path: { set_id: setId } },
      });
      if (error || !data) throw new Error('Не удалось загрузить настройки набора');
      return data;
    },
  });

  useEffect(() => {
    if (!settings.data) return;
    setValue({
      questionTypes: settings.data.question_types,
      successesRequired: settings.data.successes_required,
      typingCheck: settings.data.typing_check,
      matchPercent: settings.data.match_percent,
    });
  }, [settings.data]);

  async function save() {
    if (value.questionTypes.length === 0) {
      setMessage('Выберите хотя бы один тип упражнения');
      return;
    }
    setSaving(true);
    setMessage(null);
    const { error } = await api.PUT('/api/v1/study/sets/{set_id}/learn-settings', {
      params: { path: { set_id: setId } },
      body: {
        question_types: value.questionTypes,
        successes_required: value.successesRequired,
        typing_check: value.typingCheck,
        match_percent: value.matchPercent,
      },
    });
    if (error) setMessage((error as ApiError).message ?? 'Не удалось сохранить');
    else {
      setMessage('Настройки этого набора сохранены');
      await invalidate();
    }
    setSaving(false);
  }

  async function reset() {
    setSaving(true);
    setMessage(null);
    const { error } = await api.DELETE('/api/v1/study/sets/{set_id}/learn-settings', {
      params: { path: { set_id: setId } },
    });
    if (error) setMessage((error as ApiError).message ?? 'Не удалось вернуть общие настройки');
    else {
      setMessage('Снова используются общие настройки');
      await invalidate();
    }
    setSaving(false);
  }

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['study', 'set-learn-settings', setId] }),
      queryClient.invalidateQueries({ queryKey: ['study', 'queue', setId] }),
    ]);
  }

  return (
    <details className="border-border mt-5 rounded-lg border">
      <summary className="focus-visible:ring-primary flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2">
        <span className="font-medium">Настройки заучивания</span>
        {settings.data?.customized ? (
          <Badge tone="primary">Для этого набора</Badge>
        ) : (
          <span className="text-fg-subtle text-sm">Общие</span>
        )}
      </summary>
      <div className="border-border border-t p-4">
        {settings.isPending ? (
          <p className="text-fg-muted text-sm">Загружаем настройки…</p>
        ) : settings.isError ? (
          <p className="text-danger text-sm">Не удалось загрузить настройки набора.</p>
        ) : (
          <>
            <p className="text-fg-muted mb-4 text-sm">
              Изменения применятся только к этому набору. Общие настройки профиля останутся
              прежними.
            </p>
            <LearnSettingsControls value={value} onChange={setValue} />
            {message && <p className="text-fg-muted mt-4 text-sm">{message}</p>}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                type="button"
                loading={saving}
                disabled={disabled}
                onClick={() => void save()}
              >
                Сохранить для набора
              </Button>
              {settings.data?.customized && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => void reset()}
                >
                  Использовать общие
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
