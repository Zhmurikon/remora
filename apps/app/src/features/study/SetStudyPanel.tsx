/**
 * Блок обучения на странице набора: что делать прямо сейчас, как идут дела
 * и какая нагрузка ждёт впереди.
 */

import { pluralWithCount } from '@remora/core';
import { useState } from 'react';
import trayImage from '../../../../web/public/lecture-demo/create-tray.webp';
import { SettingsIcon } from '../../components/SettingsIcon';
import { SetModes } from '../materials/SetCardBrowser';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { SetLearnSettings } from './SetLearnSettings';

export function SetStudyPanel({ setId, cardsCount }: { setId: string; cardsCount: number }) {
  const stats = useQuery({
    queryKey: ['study', 'stats', setId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/study/sets/{set_id}/stats', {
        params: { path: { set_id: setId } },
      });
      if (error || !data) throw new Error('Не удалось загрузить статистику');
      return data;
    },
  });

  const [panel, setPanel] = useState<'settings' | 'stats' | null>(null);
  const disabled = cardsCount === 0;
  const data = stats.data;
  const due = data?.due_now ?? 0;
  const percent = Math.round(data?.mastery_percent ?? 0);
  const action = due > 0 ? 'Начать повторение' : 'Начать заучивание';
  let message = 'Повторять по расписанию';
  if (disabled) message = 'Добавьте карточки, чтобы начать';
  else if (due > 0)
    message = `${pluralWithCount(due, ['карточка ждёт', 'карточки ждут', 'карточек ждут'])} повторения`;
  else if (data?.not_started_count)
    message = `Ещё не начато: ${pluralWithCount(data.not_started_count, ['карточка', 'карточки', 'карточек'])}`;
  else if (data) message = 'Всё повторено по расписанию';

  return (
    <>
      <section className="set-session" aria-labelledby="set-learn-title">
        <div className="set-session-main">
          <img className="set-tray" src={trayImage} width="156" height="120" alt="" />
          <div className="set-launch">
            <h2 id="set-learn-title">Заучивание</h2>
            <p>{message}</p>
            {disabled ? (
              <button className="set-start" disabled>
                {action}
              </button>
            ) : (
              <Link
                className="set-start"
                to={`/sets/${setId}/learn`}
                aria-label={`${action} — Заучивание`}
              >
                {action} <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
          {!disabled && (
            <div className="set-mastery">
              {data ? (
                <>
                  <p>
                    Освоено <strong>{percent}%</strong>
                  </p>
                  <progress value={data.mastery_percent} max={100} aria-label="Освоение набора" />
                  <p className="set-counts">
                    Закреплено {data.mastered_count} из {cardsCount} · Изучаются{' '}
                    {data.learning_count} · Не начато {data.not_started_count}
                  </p>
                  <button
                    type="button"
                    className="set-stat-link"
                    aria-expanded={panel === 'stats'}
                    aria-controls="set-stats"
                    onClick={() => setPanel(panel === 'stats' ? null : 'stats')}
                  >
                    Статистика <span aria-hidden="true" className="material-caret" />
                  </button>
                </>
              ) : stats.isError ? (
                <>
                  <p role="alert">Не удалось загрузить статистику.</p>
                  <button className="set-stat-link" onClick={() => void stats.refetch()}>
                    Повторить загрузку
                  </button>
                </>
              ) : (
                <p role="status">Загружаем статистику…</p>
              )}
            </div>
          )}
        </div>
        <button
          className="set-icon set-settings"
          type="button"
          aria-label="Настройки заучивания"
          title="Настройки заучивания"
          aria-controls="set-learn-settings"
          aria-expanded={panel === 'settings'}
          onClick={() => setPanel(panel === 'settings' ? null : 'settings')}
        >
          <SettingsIcon />
        </button>
        <div className="set-study-details" id="set-learn-settings" hidden={panel !== 'settings'}>
          <SetLearnSettings setId={setId} disabled={disabled} />
        </div>
        {data && !disabled && (
          <div className="set-study-details" id="set-stats" hidden={panel !== 'stats'}>
            <StateBar
              distribution={data.distribution}
              total={Object.values(data.distribution).reduce((sum, value) => sum + value, 0)}
            />
            <Forecast days={data.forecast} />
            {data.problem_cards.length > 0 && (
              <section className="mt-5">
                <h3 className="text-sm font-medium">Проблемные карточки</h3>
                <ul className="mt-2 space-y-1">
                  {data.problem_cards.slice(0, 5).map((card) => (
                    <li key={card.card_id} className="flex justify-between gap-4 text-sm">
                      <span className="min-w-0 break-words">{card.term}</span>
                      <span className="text-fg-muted shrink-0">
                        {pluralWithCount(card.lapses, ['ошибка', 'ошибки', 'ошибок'])}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </section>
      <SetModes setId={setId} standalone disabled={disabled} />
    </>
  );
}

const stateLabels: Record<string, { label: string; className: string }> = {
  new: { label: 'Не начато', className: 'bg-surface-muted' },
  learning: { label: 'Изучается', className: 'bg-warning' },
  relearning: { label: 'Повторно', className: 'bg-danger' },
  review: { label: 'На повторении', className: 'bg-primary' },
};

function StateBar({
  distribution,
  total,
}: {
  distribution: Record<string, number>;
  total: number;
}) {
  if (total === 0) return null;
  const order = ['review', 'learning', 'relearning', 'new'];
  return (
    <div>
      <div className="bg-surface-muted flex h-2 overflow-hidden rounded-full">
        {order.map((key) => {
          const value = distribution[key] ?? 0;
          if (value === 0) return null;
          return (
            <div
              key={key}
              className={stateLabels[key]?.className}
              style={{ width: `${(value / total) * 100}%` }}
              title={`${stateLabels[key]?.label}: ${value}`}
            />
          );
        })}
      </div>
      <ul className="text-fg-muted mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {order.map((key) => (
          <li key={key} className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${stateLabels[key]?.className}`}
              aria-hidden="true"
            />
            {stateLabels[key]?.label}: {distribution[key] ?? 0}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Прогноз нагрузки на 14 дней — видно, не копится ли долг повторений. */
function Forecast({ days }: { days: { date: string; count: number }[] }) {
  const peak = Math.max(1, ...days.map((day) => day.count));
  if (days.every((day) => day.count === 0)) return null;
  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold">Нагрузка на 14 дней</h3>
      <div className="mt-3 flex h-20 items-end gap-1">
        {days.map((day) => (
          <div
            key={day.date}
            className="bg-primary-subtle flex-1 rounded-sm"
            style={{ height: `${Math.max(4, (day.count / peak) * 100)}%` }}
            title={`${new Date(day.date).toLocaleDateString('ru-RU')}: ${day.count}`}
          />
        ))}
      </div>
    </section>
  );
}
