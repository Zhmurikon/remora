import { Button } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';

export function LibraryUpdateControl({ saveId, title }: { saveId: string; title: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const changes = useQuery({
    queryKey: ['library', saveId, 'changes'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/library/{save_id}/changes', {
        params: { path: { save_id: saveId } },
      });
      if (!data || error) throw new Error('Не удалось загрузить изменения');
      return data;
    },
  });
  const accept = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/library/{save_id}/accept', {
        params: { path: { save_id: saveId } },
      });
      if (error) throw new Error('Не удалось обновить материал');
    },
    onSuccess: async () => {
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['library'] }),
        queryClient.invalidateQueries({ queryKey: ['study'] }),
      ]);
    },
  });

  if (!open) {
    return (
      <Button
        size="sm"
        variant="secondary"
        aria-label={`Обновить «${title}»`}
        onClick={() => setOpen(true)}
      >
        Обновить
      </Button>
    );
  }

  return (
    <section
      className="bg-surface-muted basis-full rounded-xl p-4"
      aria-label={`Обновление «${title}»`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Что изменится</h3>
        <Button
          size="sm"
          variant="ghost"
          disabled={accept.isPending}
          onClick={() => setOpen(false)}
        >
          Скрыть
        </Button>
      </div>
      {changes.isPending && (
        <p role="status" className="text-fg-muted mt-3 text-sm">
          Сравниваем версии…
        </p>
      )}
      {changes.isError && (
        <div role="alert" className="mt-3 space-y-3">
          <p className="text-danger text-sm">
            Не удалось загрузить изменения. Проверьте соединение и повторите попытку.
          </p>
          <Button size="sm" variant="secondary" onClick={() => void changes.refetch()}>
            Повторить
          </Button>
        </div>
      )}
      {changes.data && (
        <>
          {changes.data.summary.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {changes.data.summary.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-muted mt-3 text-sm">Автор обновил свойства материала.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" loading={accept.isPending} onClick={() => accept.mutate()}>
              Применить обновление
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={accept.isPending}
              onClick={() => setOpen(false)}
            >
              Отмена
            </Button>
          </div>
          {accept.isError && (
            <p role="alert" className="text-danger mt-3 text-sm">
              Не удалось обновить материал. Проверьте соединение и повторите попытку.
            </p>
          )}
        </>
      )}
    </section>
  );
}
