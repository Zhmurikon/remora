import { Button } from '@remora/ui';
import { createContext, useContext, useEffect } from 'react';

export type SettingsNotice = { kind: 'success' | 'error'; text: string } | null;
export const SettingsDirtyContext = createContext<(section: string, dirty: boolean) => void>(
  () => {},
);

export function useSettingsDirty(section: string, dirty: boolean) {
  const report = useContext(SettingsDirtyContext);
  useEffect(() => {
    report(section, dirty);
    return () => report(section, false);
  }, [section, dirty, report]);
}

export function SettingsFeedback({ notice }: { notice: SettingsNotice }) {
  return notice ? (
    <p
      className={`settings-feedback settings-feedback--${notice.kind}`}
      role={notice.kind === 'error' ? 'alert' : 'status'}
    >
      {notice.text}
    </p>
  ) : null;
}

export function SettingsSaveBar({
  dirty,
  saving,
  label,
  onCancel,
}: {
  dirty: boolean;
  saving: boolean;
  label: string;
  onCancel: () => void;
}) {
  return (
    <div className="settings-savebar">
      <span className="settings-save-status" role="status">
        {saving
          ? 'Сохраняем…'
          : dirty
            ? 'Есть несохранённые изменения'
            : 'Нет несохранённых изменений'}
      </span>
      <div className="settings-save-actions">
        <Button type="button" variant="secondary" disabled={!dirty || saving} onClick={onCancel}>
          Отменить
        </Button>
        <Button type="submit" loading={saving} disabled={!dirty || saving}>
          {label}
        </Button>
      </div>
    </div>
  );
}

export function settingsError(error: unknown) {
  return error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : 'Не удалось выполнить запрос. Проверьте соединение и попробуйте ещё раз.';
}
