'use client';

import type { components } from '@remora/api-client';
import { Button, Card } from '@remora/ui';
import { useRef, useState } from 'react';
import { PublicCardContent } from '../../nabor/[slug]/PublicCardContent';

type Material = components['schemas']['PublicSet'];

export function PublicCourseCards({
  initial,
  slug,
  articleId,
}: {
  initial: Material;
  slug: string;
  articleId: string;
}) {
  const [cards, setCards] = useState(initial.cards);
  const [cursor, setCursor] = useState(initial.next_cursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(false);
  const inFlight = useRef(false);

  async function loadMore() {
    if (inFlight.current || cursor == null) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      const query = new URLSearchParams({ after: String(cursor), revision: initial.updated_at });
      const response = await fetch(
        `/kurs/${encodeURIComponent(slug)}/articles/${encodeURIComponent(articleId)}/cards?${query}`,
        { cache: 'no-store' },
      );
      if (response.status === 404 || response.status === 409) {
        setReload(true);
        throw new Error(
          response.status === 404
            ? 'Материал больше недоступен.'
            : 'Автор изменил карточки. Обновите страницу, чтобы увидеть актуальный список.',
        );
      }
      if (!response.ok) throw new Error('Не удалось загрузить карточки. Попробуйте ещё раз.');
      const page = (await response.json()) as Material;
      setCards((current) => [...current, ...page.cards]);
      setCursor(page.next_cursor);
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? 'Нет соединения с сервером. Проверьте сеть и повторите попытку.'
          : cause instanceof Error
            ? cause.message
            : 'Не удалось загрузить карточки.',
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {cards.map((card) => (
          <li key={card.id}>
            <Card className="grid gap-5 sm:grid-cols-2">
              <div className="min-w-0">
                <PublicCardContent
                  value={card.term}
                  type={card.content_type}
                  codeLanguage={card.code_language ?? null}
                  imageUrl={card.term_image_url ?? null}
                  imageAlt={`Термин: ${card.term}`}
                />
                {card.term_transcription && (
                  <p className="text-fg-muted mt-2 text-sm">[{card.term_transcription}]</p>
                )}
              </div>
              <div className="border-border min-w-0 border-t pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                <PublicCardContent
                  value={card.definition}
                  type={card.content_type}
                  codeLanguage={card.code_language ?? null}
                  imageUrl={card.definition_image_url ?? null}
                  imageAlt={`Определение: ${card.definition}`}
                />
                {card.definition_transcription && (
                  <p className="text-fg-muted mt-2 text-sm">[{card.definition_transcription}]</p>
                )}
                {card.hint && <p className="text-fg-muted mt-3 text-sm">Подсказка: {card.hint}</p>}
              </div>
            </Card>
          </li>
        ))}
      </ol>
      <p role="status" className="text-fg-muted text-sm">
        Показано {cards.length} из {initial.cards_count} карточек
      </p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {reload ? (
        <Button className="min-h-11" variant="secondary" onClick={() => window.location.reload()}>
          Обновить страницу
        </Button>
      ) : (
        cursor != null && (
          <Button
            className="min-h-11"
            variant="secondary"
            loading={pending}
            onClick={() => void loadMore()}
          >
            {error ? 'Повторить загрузку' : 'Показать ещё'}
          </Button>
        )
      )}
    </div>
  );
}
