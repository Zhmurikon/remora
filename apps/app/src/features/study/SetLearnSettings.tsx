import type { components } from '@remora/api-client';
import { Button } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { SettingsDialog } from '../settings/SettingsDialog';
import {
  SettingsFeedback,
  SettingsSaveBar,
  settingsError,
  type SettingsNotice,
} from '../settings/SettingsFeedback';
import { SettingsLeaveGuard } from '../settings/SettingsLeaveGuard';
import { LearnSettingsControls, type LearnPreferences } from './LearnSettingsControls';
import './set-learn-settings.css';

type Snapshot = components['schemas']['SetLearnSettingsOut'];
const preferences = (data: Snapshot): LearnPreferences => ({
  questionTypes: data.question_types,
  successesRequired: data.successes_required,
  sessionSize: data.session_size,
  typingCheck: data.typing_check,
  matchPercent: data.match_percent,
});

export function SetLearnSettings({ setId, disabled }: { setId: string; disabled: boolean }) {
  const query = useQuery({
    queryKey: ['study', 'set-learn-settings', setId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/study/sets/{set_id}/learn-settings', {
        params: { path: { set_id: setId } },
      });
      if (error || !data) throw new Error(settingsError(error));
      return data;
    },
  });
  if (!query.data)
    return (
      <section className="set-learn-settings" aria-label="Настройки заучивания">
        <h3>Настройки заучивания</h3>
        {query.isPending ? (
          <p role="status">Загружаем настройки набора…</p>
        ) : (
          <>
            <SettingsFeedback
              notice={{
                kind: 'error',
                text: 'Не удалось загрузить настройки набора. Попробуйте ещё раз.',
              }}
            />
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Повторить загрузку
            </Button>
          </>
        )}
      </section>
    );
  return <SetLearnFields key={setId} setId={setId} initial={query.data} disabled={disabled} />;
}

function SetLearnFields({
  setId,
  initial,
  disabled,
}: {
  setId: string;
  initial: Snapshot;
  disabled: boolean;
}) {
  const cache = useQueryClient();
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(() => preferences(initial));
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState<SettingsNotice>(null);
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const dirty = JSON.stringify(value) !== JSON.stringify(preferences(saved));
  useEffect(() => {
    // Перечитывание общих параметров не должно стирать локальный черновик.
    if (!dirty && !saving) {
      setSaved(initial);
      setValue(preferences(initial));
    }
  }, [initial, dirty, saving]);
  function accept(data: Snapshot) {
    setSaved(data);
    setValue(preferences(data));
    cache.setQueryData(['study', 'set-learn-settings', setId], data);
    void cache.invalidateQueries({ queryKey: ['study', 'queue', setId] });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || disabled) return;
    if (!value.questionTypes.length) {
      setNotice({ kind: 'error', text: 'Выберите хотя бы один тип упражнения.' });
      form.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const { data, error } = await api.PUT('/api/v1/study/sets/{set_id}/learn-settings', {
        params: { path: { set_id: setId } },
        body: {
          question_types: value.questionTypes,
          successes_required: value.successesRequired,
          session_size: value.sessionSize,
          typing_check: value.typingCheck,
          match_percent: value.matchPercent,
        },
      });
      if (error || !data) throw error;
      accept(data);
      setNotice({ kind: 'success', text: 'Настройки этого набора сохранены' });
    } catch (error) {
      setNotice({ kind: 'error', text: settingsError(error) });
    } finally {
      setSaving(false);
    }
  }
  async function reset() {
    if (saving || disabled) return;
    setSaving(true);
    setNotice(null);
    try {
      const { error } = await api.DELETE('/api/v1/study/sets/{set_id}/learn-settings', {
        params: { path: { set_id: setId } },
      });
      if (error) throw error;
      const { data, error: loadError } = await api.GET(
        '/api/v1/study/sets/{set_id}/learn-settings',
        { params: { path: { set_id: setId } } },
      );
      if (loadError || !data)
        throw new Error(
          'Общие настройки применены, но не удалось их загрузить. Повторите действие.',
        );
      accept(data);
      setResetting(false);
      setNotice({ kind: 'success', text: 'Снова используются общие настройки' });
      requestAnimationFrame(() => heading.current?.focus());
    } catch (error) {
      setNotice({ kind: 'error', text: settingsError(error) });
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="set-learn-settings" aria-label="Настройки заучивания">
      <SettingsLeaveGuard dirty={dirty} />
      <header className="set-learn-heading">
        <h3 ref={heading} tabIndex={-1}>
          Настройки заучивания
        </h3>
        <span className="set-learn-origin">
          {saved.customized ? 'Для этого набора' : 'Общие параметры'}
        </span>
      </header>
      <p className="set-learn-intro">
        Выберите упражнения и темп. Изменения действуют только в этом наборе.
      </p>
      {disabled && (
        <p className="set-learn-intro">Добавьте карточки, чтобы менять настройки заучивания.</p>
      )}
      <form ref={form} onSubmit={(event) => void save(event)}>
        <fieldset disabled={saving || disabled} className="set-learn-fields">
          <LearnSettingsControls
            value={value}
            onChange={(next) => {
              setValue(next);
              setNotice(null);
            }}
          />
        </fieldset>
        {!resetting && <SettingsFeedback notice={notice} />}
        <SettingsSaveBar
          dirty={dirty && !disabled}
          saving={saving}
          label="Сохранить для набора"
          onCancel={() => {
            setValue(preferences(saved));
            setNotice(null);
          }}
        />
      </form>
      {saved.customized && (
        <div className="set-learn-reset">
          <div>
            <h4>Вернуться к общим параметрам</h4>
            <p>Набор будет следовать настройкам обучения из вашего профиля.</p>
          </div>
          <Button
            variant="secondary"
            disabled={saving || disabled}
            onClick={() => {
              setNotice(null);
              setResetting(true);
            }}
          >
            Использовать общие
          </Button>
        </div>
      )}
      {resetting && (
        <SettingsDialog
          title="Использовать общие настройки?"
          confirmLabel="Использовать общие"
          busy={saving}
          notice={notice}
          onCancel={() => {
            setResetting(false);
            setNotice(null);
          }}
          onConfirm={() => void reset()}
        >
          <p>
            Индивидуальные параметры этого набора и несохранённые изменения будут сброшены. Вместо
            них применятся настройки обучения из профиля.
          </p>
          <p>Карточки и прогресс сохранятся.</p>
        </SettingsDialog>
      )}
    </section>
  );
}
