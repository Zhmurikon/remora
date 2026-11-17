import type { components } from '@remora/api-client';
import { Button } from '@remora/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';

export type SetDetail = components['schemas']['SetDetail'];
export type SetCard = SetDetail['cards'][number];
export type CardChange = { kind: 'add' } | { kind: 'edit' | 'delete'; card: SetCard };

export function CardChangeDialog({
  snapshot,
  change,
  onClose,
  onSaved,
}: {
  snapshot: SetDetail;
  change: CardChange;
  onClose: () => void;
  onSaved: (set: SetDetail) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const client = useQueryClient();
  const card = change.kind === 'add' ? null : change.card;
  const [term, setTerm] = useState(card?.term ?? '');
  const [definition, setDefinition] = useState(card?.definition ?? '');
  const deleting = change.kind === 'delete';
  const title = deleting
    ? 'Удалить карточку?'
    : card
      ? 'Редактировать карточку'
      : 'Добавить карточку';
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  const save = useMutation({
    mutationFn: async () => {
      let cards: components['schemas']['CardWrite'][] = snapshot.cards;
      if (change.kind === 'add') cards = [...cards, { term, definition, content_type: 'text' }];
      else if (deleting) cards = cards.filter((c) => c.id !== change.card.id);
      else cards = cards.map((c) => (c.id === change.card.id ? { ...c, term, definition } : c));
      const result = await api.PUT('/api/v1/sets/{set_id}/cards', {
        params: { path: { set_id: snapshot.id } },
        body: { cards, expected_updated_at: snapshot.updated_at },
      });
      if (!result.data || result.error) {
        if (result.response.status === 409)
          await client.invalidateQueries({ queryKey: ['sets', snapshot.id] });
        const error = result.error as { message?: string } | undefined;
        throw new Error(error?.message ?? 'Не удалось сохранить карточки. Попробуйте ещё раз.');
      }
      return result.data;
    },
    onSuccess: async (set) => {
      await client.cancelQueries({ queryKey: ['sets', set.id] });
      client.setQueryData(['sets', set.id], set);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['sets'], exact: true }),
        client.invalidateQueries({ queryKey: ['study', 'set-stats', set.id] }),
        client.invalidateQueries({ queryKey: ['study', 'stats', set.id] }),
      ]);
      onSaved(set);
    },
  });
  return (
    <dialog
      ref={dialog}
      className="set-dialog"
      aria-labelledby="set-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!save.isPending) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!save.isPending) save.mutate();
        }}
      >
        <h3 id="set-dialog-title">{title}</h3>
        {deleting ? (
          <p>Карточка «{card?.term || 'Без текста'}» и её прогресс будут удалены из набора.</p>
        ) : (
          <>
            <div className="set-dialog-field">
              <label htmlFor="card-term">Термин</label>
              <textarea
                id="card-term"
                autoFocus
                rows={3}
                disabled={save.isPending}
                maxLength={10000}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>
            <div className="set-dialog-field">
              <label htmlFor="card-definition">Определение</label>
              <textarea
                id="card-definition"
                rows={4}
                disabled={save.isPending}
                maxLength={10000}
                value={definition}
                onChange={(e) => setDefinition(e.target.value)}
              />
            </div>
          </>
        )}
        {save.isError && (
          <p role="alert" className="text-danger">
            {save.error.message}
          </p>
        )}
        <div className="set-dialog-actions">
          <Button
            type="button"
            variant="secondary"
            autoFocus={deleting}
            disabled={save.isPending}
            onClick={onClose}
          >
            Отмена
          </Button>
          <Button
            type="submit"
            loading={save.isPending}
            disabled={
              save.isPending ||
              (!deleting &&
                !term.trim() &&
                !definition.trim() &&
                !card?.term_image_id &&
                !card?.definition_image_id)
            }
            variant={deleting ? 'danger' : 'primary'}
          >
            {deleting ? 'Удалить' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
