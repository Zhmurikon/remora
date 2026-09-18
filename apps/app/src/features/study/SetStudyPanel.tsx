/**
 * Блок обучения на странице набора: что делать прямо сейчас, как идут дела
 * и какая нагрузка ждёт впереди.
 */

import { pluralWithCount } from '@remora/core';
import { Badge, Button, Card } from '@remora/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { PrintMenu } from './PrintMenu';
import { ResetProgress } from './ResetProgress';

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

  const disabled = cardsCount === 0;
  const due = stats.data?.due_now ?? 0;
  const notStarted = stats.data?.not_started_count ?? cardsCount;

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Обучение</h2>
          <p className="text-fg-muted mt-1 text-sm">
            {disabled
              ? 'Добавьте карточки, чтобы начать'
              : due > 0
                ? `${pluralWithCount(due, ['карточка ждёт', 'карточки ждут', 'карточек ждут'])} повторения`
                : notStarted > 0
                  ? `${pluralWithCount(notStarted, ['карточка', 'карточки', 'карточек'])} ещё не начата`
                  : 'Всё повторено — возвращайтесь по расписанию'}
          </p>
        </div>
        {stats.data && (
          <Badge tone={stats.data.mastery_percent >= 80 ? 'success' : 'primary'}>
            Освоено {Math.round(stats.data.mastery_percent)}%
          </Badge>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link to={`/sets/${setId}/learn`} aria-disabled={disabled}>
          <Button disabled={disabled}>Заучивание</Button>
        </Link>
        <Link to={`/sets/${setId}/flashcards`} aria-disabled={disabled}>
          <Button variant="secondary" disabled={disabled}>
            Карточки
          </Button>
        </Link>
        <Link to={`/sets/${setId}/write`} aria-disabled={disabled}>
          <Button variant="secondary" disabled={disabled}>
            Письмо
          </Button>
        </Link>
        <Link to={`/sets/${setId}/test`} aria-disabled={disabled}>
          <Button variant="secondary" disabled={disabled}>
            Тест
          </Button>
        </Link>
        <Link to={`/sets/${setId}/listen`} aria-disabled={disabled}>
          <Button variant="secondary" disabled={disabled}>
            Аудирование
          </Button>
        </Link>
      </div>

      {stats.data && stats.data.cards_total > 0 && (
        <>
          <div className="mt-6">
            <StateBar
              distribution={stats.data.distribution}
              total={
                stats.data.distribution.new +
                stats.data.distribution.learning +
                stats.data.distribution.review +
                stats.data.distribution.relearning
              }
            />
          </div>

          <Forecast days={stats.data.forecast} />

          <PrintMenu setId={setId} disabled={disabled} />

          {stats.data.problem_cards.length > 0 && (
            <section className="mt-6">
              <h3 className="text-sm font-semibold">Проблемные карточки</h3>
              <ul className="mt-2 space-y-1">
                {stats.data.problem_cards.slice(0, 5).map((card) => (
                  <li
                    key={card.card_id}
                    className="text-fg-muted flex justify-between gap-4 text-sm"
                  >
                    <span className="truncate">{card.term}</span>
                    <span className="text-fg-subtle shrink-0">
                      {pluralWithCount(card.lapses, ['ошибка', 'ошибки', 'ошибок'])}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <ResetProgress setId={setId} disabled={disabled} />
    </Card>
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
