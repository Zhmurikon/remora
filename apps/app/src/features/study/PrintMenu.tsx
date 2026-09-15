/**
 * Печатные материалы набора. Для преподавателя это один из главных сценариев:
 * раздать карточки и список терминов на бумаге.
 */

import { Button } from '@remora/ui';
import { useState } from 'react';
import { openPdf } from '../../lib/api';

const documents = [
  {
    key: 'cards-double',
    label: 'Карточки (двусторонние)',
    path: (setId: string) => `/api/v1/print/sets/${setId}/cards?layout=double_sided`,
  },
  {
    key: 'cards-fold',
    label: 'Карточки (со сгибом)',
    path: (setId: string) => `/api/v1/print/sets/${setId}/cards?layout=foldable`,
  },
  {
    key: 'terms',
    label: 'Список терминов',
    path: (setId: string) => `/api/v1/print/sets/${setId}/terms`,
  },
];

export function PrintMenu({ setId, disabled }: { setId: string; disabled: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(key: string, path: string) {
    setBusy(key);
    setError(null);
    try {
      await openPdf(path);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось открыть документ');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold">Распечатать</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {documents.map((document) => (
          <Button
            key={document.key}
            size="sm"
            variant="secondary"
            disabled={disabled}
            loading={busy === document.key}
            onClick={() => void open(document.key, document.path(setId))}
          >
            {document.label}
          </Button>
        ))}
      </div>
      {error && <p className="text-danger mt-2 text-sm">{error}</p>}
    </section>
  );
}
