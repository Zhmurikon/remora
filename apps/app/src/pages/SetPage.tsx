import { Badge, Button, Card, CardContent } from '@remora/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';

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
        <Link to={`/sets/${set.id}/edit`}>
          <Button variant="secondary">Редактировать</Button>
        </Link>
      </header>
      <div className="mt-8 space-y-3">
        {set.cards.map((card, index) => (
          <Card key={card.id} className="grid gap-4 p-5 sm:grid-cols-[48px_1fr_1fr]">
            <span className="text-fg-subtle text-sm">{index + 1}</span>
            <CardContent
              value={card.term}
              type={card.content_type}
              codeLanguage={card.code_language}
              className="font-medium"
            />
            <CardContent
              value={card.definition}
              type={card.content_type}
              codeLanguage={card.code_language}
              className="text-fg-muted"
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
