import { Badge, Button, Card, CardContent } from '@remora/ui';
import { useQuery } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SetStudyPanel } from '../features/study/SetStudyPanel';
import { api } from '../lib/api';

const WEB_URL = import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000';

export function SetPage() {
  const { setId = '' } = useParams();
  const query = useQuery({
    queryKey: ['sets', setId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/sets/{set_id}', {
        params: { path: { set_id: setId } },
      });
      if (error) throw new Error('Не удалось загрузить набор');
      return data;
    },
  });
  if (query.isPending) return <p className="text-fg-muted">Загружаем набор…</p>;
  if (!query.data) return <p className="text-danger">Набор не найден.</p>;
  const set = query.data;
  return (
    <div>
      <Link to="/sets" className="text-primary text-sm font-medium">
        ← Мои наборы
      </Link>
      <header className="mt-5 flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="flex items-center gap-3">
            <Badge>
              {set.visibility === 'private'
                ? 'Приватный'
                : set.visibility === 'public'
                  ? 'Публичный'
                  : 'По ссылке'}
            </Badge>
            <span className="text-fg-muted text-sm">{set.cards_count} карточек</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{set.title}</h1>
          {set.description && <p className="text-fg-muted mt-3 max-w-2xl">{set.description}</p>}
        </div>
        <div className="flex flex-wrap gap-3">
          {set.visibility !== 'private' && (
            <a
              href={`${WEB_URL}/nabor/${set.slug}`}
              target="_blank"
              rel="noreferrer"
              className="border-border bg-surface hover:bg-surface-muted inline-flex h-10 items-center justify-center rounded-md border px-4 font-medium transition-colors"
            >
              Открыть публичную страницу
            </a>
          )}
          <Link to={`/sets/${set.id}/edit`}>
            <Button variant="secondary">Редактировать</Button>
          </Link>
        </div>
      </header>
      <div className="mt-8">
        <SetStudyPanel setId={set.id} cardsCount={set.cards_count} />
      </div>
      <h2 className="mt-10 text-lg font-semibold">Карточки</h2>
      <div className="mt-4 space-y-3">
        {set.cards.map((card, index) => (
          <Card key={card.id} className="grid gap-4 p-5 sm:grid-cols-[48px_1fr_1fr]">
            <span className="text-fg-subtle text-sm">{index + 1}</span>
            <CardSide
              value={card.term}
              type={card.content_type}
              codeLanguage={card.code_language}
              className="font-medium"
              imageId={card.term_image_id}
              imageAlt={`Термин: ${card.term}`}
            />
            <CardSide
              value={card.definition}
              type={card.content_type}
              codeLanguage={card.code_language}
              className="text-fg-muted"
              imageId={card.definition_image_id}
              imageAlt={`Определение: ${card.definition}`}
            />
          </Card>
        ))}
      </div>
      {set.cards.length === 0 && (
        <Card className="mt-8 p-8 text-center">
          <p className="text-fg-muted">В наборе ещё нет карточек.</p>
        </Card>
      )}
    </div>
  );
}

function CardSide({
  imageId,
  imageAlt,
  ...content
}: ComponentProps<typeof CardContent> & { imageId?: string | null; imageAlt: string }) {
  const image = useQuery({
    queryKey: ['media', imageId],
    enabled: Boolean(imageId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/media/{asset_id}', {
        params: { path: { asset_id: imageId! } },
      });
      if (error || !data) throw new Error();
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });
  return <CardContent {...content} imageUrl={image.data?.download_url} imageAlt={imageAlt} />;
}
