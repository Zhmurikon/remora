import { Button, Card } from '@remora/ui';
import type { LocalArticleDraft } from './local-drafts';

export function ArticleDraftRecovery({
  drafts,
  disabled,
  restore,
  discard,
}: {
  drafts: LocalArticleDraft[];
  disabled: boolean;
  restore: (draft: LocalArticleDraft) => void;
  discard: (draft: LocalArticleDraft) => void;
}) {
  if (!drafts.length) return null;
  return (
    <Card className="mb-4 space-y-3" role="region" aria-label="Восстановление черновика">
      <h2 className="text-lg font-semibold">Найден несохранённый черновик</h2>
      <p className="text-fg-muted text-sm">
        Эти правки остались в этом браузере. Можно восстановить их в редакторе.
      </p>
      {drafts.map((draft) => (
        <div key={draft.writer} className="border-border space-y-2 border-t pt-3">
          <p className="font-medium">{draft.title || 'Без названия'}</p>
          <p className="text-fg-muted text-sm">
            {new Date(draft.updatedAt).toLocaleString('ru-RU')}
          </p>
          <details>
            <summary className="min-h-11 cursor-pointer py-2 text-sm">
              Посмотреть текст черновика
            </summary>
            <textarea
              aria-label="Текст сохранённого черновика"
              readOnly
              value={draft.body}
              className="border-border bg-surface mt-2 min-h-40 w-full rounded-lg border p-3 text-sm"
            />
          </details>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={disabled} onClick={() => restore(draft)}>
              Восстановить черновик
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={() => discard(draft)}
            >
              Удалить черновик
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
}
