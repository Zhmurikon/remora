import { Button } from '@remora/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { detachSession, flush } from './review-queue';
import { useStudyStore } from './study-store';

export function ResetProgress({ setId, disabled }: { setId: string; disabled: boolean }) {
  const client = useQueryClient();
  const reset = useMutation({
    mutationFn: async () => {
      // Сначала сохраняем ответы в историю. При сбое ничего локально не удаляем.
      const synced = await flush();
      if (!synced.ok)
        throw new Error(
          'Не удалось сохранить последние ответы. Проверьте соединение и повторите сброс.',
        );
      const { error } = await api.POST('/api/v1/study/sets/{set_id}/reset', {
        params: { path: { set_id: setId } },
      });
      if (error) throw new Error('Не удалось сбросить прогресс. Попробуйте ещё раз.');
      detachSession();
      if (useStudyStore.getState().setId === setId) useStudyStore.getState().reset();
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['study'] });
    },
  });

  return (
    <div className="border-border mt-6 border-t pt-4">
      <Button
        variant="ghost"
        className="text-danger min-h-11"
        disabled={disabled || reset.isPending}
        onClick={() => {
          if (
            window.confirm(
              'Сбросить прогресс этого набора? Все карточки станут новыми в обоих направлениях. Общее расписание обучения обнулится, текущие тренировки завершатся. Карточки и история занятий сохранятся. Ответы из старых тренировок не восстановят прогресс. Отменить сброс нельзя.',
            )
          ) {
            reset.mutate();
          }
        }}
      >
        {reset.isPending ? 'Сбрасываем прогресс…' : 'Сбросить прогресс заучивания'}
      </Button>
      <p className="text-fg-muted mt-1 text-sm">
        Начать этот набор заново. Карточки и история занятий сохранятся.
      </p>
      {reset.isError && (
        <p role="alert" className="text-danger mt-2 text-sm">
          {reset.error.message}
        </p>
      )}
      {reset.isSuccess && (
        <p role="status" className="text-success mt-2 text-sm">
          Прогресс сброшен. Можно начать заучивание заново.
        </p>
      )}
    </div>
  );
}
