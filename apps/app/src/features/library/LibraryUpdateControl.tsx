import type { components } from '@remora/api-client';
import { Button } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { api } from '../../lib/api';

export function LibraryUpdateControl({
  saveId,
  title,
  targetType,
}: {
  saveId: string;
  title: string;
  targetType: components['schemas']['LibrarySaveCreate']['target_type'];
}) {
  const queryClient = useQueryClient();
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
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
        queryClient.invalidateQueries({ queryKey: ['sets'] }),
        queryClient.invalidateQueries({ queryKey: ['course'] }),
      ]);
    },
  });

  function closePreview() {
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div
      className={`min-w-0 max-w-full text-sm max-sm:[&_button]:min-h-11 ${open ? 'basis-full' : ''}`}
    >
      <div className="text-fg-muted flex flex-wrap items-center gap-x-1.5">
        <span className="inline-flex items-center gap-1.5">
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="text-danger shrink-0"
          >
            <circle cx="10" cy="10" r="8" />
            <path d="M10 5.7v5" strokeLinecap="round" />
            <circle cx="10" cy="13.8" r="1" fill="currentColor" stroke="none" />
          </svg>
          {targetType === 'course' ? 'Есть обновление курса' : 'Есть обновление набора'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true">—</span>
          <button
            ref={trigger}
            type="button"
            className="text-danger min-h-8 bg-transparent font-medium underline underline-offset-2 hover:decoration-2 focus-visible:outline-2"
            aria-label={`Обновить «${title}»`}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            disabled={accept.isPending}
            onClick={() => setOpen(!open)}
          >
            обновить
          </button>
        </span>
      </div>
      {open && (
        <section
          id={panelId}
          className="bg-surface-muted text-fg mt-2 rounded-xl p-4"
          aria-label={`Обновление «${title}»`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">Что изменится</h3>
            <Button size="sm" variant="ghost" disabled={accept.isPending} onClick={closePreview}>
              Скрыть
            </Button>
          </div>
          {targetType === 'article' && (
            <p className="text-fg-muted mt-2 text-sm">
              Обновится сохранённая статья вместе с её карточками.
            </p>
          )}
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
                  onClick={closePreview}
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
      )}
    </div>
  );
}
