import type { ApiError } from '@remora/api-client';
import { Badge, Button, Card } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export function SetsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sets = useQuery({
    queryKey: ['sets'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/sets');
      if (error) throw new Error(errorMessage(error));
      return data;
    },
  });

  async function createSet() {
    const { data } = await api.POST('/api/v1/sets', {
      body: {
        title: 'Новый набор',
        description: '',
        visibility: 'private',
        lang_term: 'ru',
        lang_definition: 'ru',
      },
    });
    if (!data) return;
    await queryClient.invalidateQueries({ queryKey: ['sets'] });
    navigate(`/sets/${data.id}/edit`);
  }

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-primary text-sm font-medium">Библиотека</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Мои наборы</h1>
          <p className="text-fg-muted mt-2">Создавайте карточки и собирайте учебные материалы.</p>
        </div>
        <Button size="lg" onClick={() => void createSet()}>
          Создать набор
        </Button>
      </header>
      {sets.isPending && <p className="text-fg-muted mt-10">Загружаем наборы…</p>}
      {sets.isError && <p className="text-danger mt-10">{sets.error.message}</p>}
      {sets.data?.length === 0 && (
        <Card className="mt-8 grid min-h-72 place-items-center text-center">
          <div>
            <p className="text-xl font-semibold">Пока нет наборов</p>
            <p className="text-fg-muted mt-2">Начните с нескольких терминов и определений.</p>
            <Button className="mt-5" onClick={() => void createSet()}>
              Создать первый набор
            </Button>
          </div>
        </Card>
      )}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sets.data?.map((set) => (
          <Link key={set.id} to={`/sets/${set.id}`} className="group">
            <Card interactive className="h-full p-5">
              <div className="flex items-start justify-between gap-3">
                <Badge>{visibilityLabel(set.visibility)}</Badge>
                <span className="text-fg-subtle text-xs">{set.cards_count} карт.</span>
              </div>
              <h2 className="group-hover:text-primary mt-5 text-lg font-semibold transition-colors">
                {set.title}
              </h2>
              <p className="text-fg-muted mt-2 line-clamp-2 text-sm">
                {set.description || 'Описание не добавлено'}
              </p>
              <p className="text-fg-subtle mt-5 text-xs">
                Изменён {new Date(set.updated_at).toLocaleDateString('ru-RU')}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function visibilityLabel(value: string) {
  return value === 'public' ? 'Публичный' : value === 'unlisted' ? 'По ссылке' : 'Приватный';
}
function errorMessage(error: unknown) {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String((error as ApiError).message)
    : 'Не удалось загрузить наборы';
}
