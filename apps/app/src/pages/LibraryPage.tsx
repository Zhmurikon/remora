import type { components } from '@remora/api-client';
import { Badge, Button, Card } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

const WEB_URL = import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000';

export function LibraryPage() {
  const queryClient = useQueryClient();
  const library = useQuery({
    queryKey: ['library'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/library');
      if (error) throw new Error('Не удалось загрузить библиотеку');
      return data;
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/library/{save_id}', {
        params: { path: { save_id: id } },
      });
      if (error) throw new Error('Не удалось убрать материал');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  });

  return (
    <div>
      <header>
        <p className="text-primary text-sm font-medium">Связанные оригиналы</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Библиотека</h1>
        <p className="text-fg-muted mt-2 max-w-2xl">
          Учитесь по материалам авторов. Изменения не затрагивают ваш личный прогресс.
        </p>
      </header>
      {library.isPending && <p className="text-fg-muted mt-8">Загружаем библиотеку…</p>}
      {library.isError && <p className="text-danger mt-8">Не удалось загрузить библиотеку.</p>}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {library.data?.map((item) => (
          <LibraryCard
            key={item.id}
            item={item}
            removing={remove.isPending && remove.variables === item.id}
            onRemove={() => remove.mutate(item.id)}
          />
        ))}
      </div>
      {library.data?.length === 0 && (
        <Card className="mt-8 p-8 text-center">
          <p className="text-fg-muted">Сохранённых материалов пока нет.</p>
          <a
            className="text-primary mt-3 inline-flex min-h-11 items-center underline"
            href={`${WEB_URL}/kursy`}
          >
            Перейти в каталог
          </a>
        </Card>
      )}
    </div>
  );
}

type LibraryItem = components['schemas']['LibraryItem'];

function LibraryCard({
  item,
  removing,
  onRemove,
}: {
  item: LibraryItem;
  removing: boolean;
  onRemove: () => void;
}) {
  const queryClient = useQueryClient();
  const [showChanges, setShowChanges] = useState(false);
  const changes = useQuery({
    queryKey: ['library', item.id, 'changes'],
    enabled: showChanges && item.has_updates,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/library/{save_id}/changes', {
        params: { path: { save_id: item.id } },
      });
      if (error) throw new Error('Не удалось загрузить изменения');
      return data;
    },
  });
  const accept = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/library/{save_id}/accept', {
        params: { path: { save_id: item.id } },
      });
      if (error) throw new Error('Не удалось применить обновление');
    },
    onSuccess: async () => {
      setShowChanges(false);
      await queryClient.invalidateQueries({ queryKey: ['library'] });
    },
  });
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>
          {item.target_type === 'course'
            ? 'Курс'
            : item.target_type === 'article'
              ? 'Статья'
              : 'Набор'}
        </Badge>
        {item.has_updates && <Badge tone="warning">Есть обновление</Badge>}
      </div>
      <h2 className="mt-3 text-xl font-semibold">
        {item.article_title ?? item.set_title ?? item.course_title}
      </h2>
      <p className="text-fg-muted mt-2 text-sm">
        {item.course_title} · {item.cards_count} карточек
      </p>
      {showChanges && (
        <div className="bg-surface-muted mt-4 rounded-xl p-4">
          {changes.isPending && <p className="text-fg-muted text-sm">Сравниваем версии…</p>}
          {changes.data && (
            <>
              <ul className="space-y-1 text-sm">
                {changes.data.summary.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
              <Button className="mt-4" loading={accept.isPending} onClick={() => accept.mutate()}>
                Обновить
              </Button>
            </>
          )}
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        {item.set_id ? (
          <Link to={`/sets/${item.set_id}/learn`}>
            <Button>Начать учиться</Button>
          </Link>
        ) : (
          <a href={`${WEB_URL}/kurs/${item.course_slug}`}>
            <Button>Открыть курс</Button>
          </a>
        )}
        {item.has_updates && (
          <Button variant="secondary" onClick={() => setShowChanges((value) => !value)}>
            {showChanges ? 'Скрыть изменения' : 'Посмотреть изменения'}
          </Button>
        )}
        <Button variant="ghost" loading={removing} onClick={onRemove}>
          Убрать
        </Button>
      </div>
    </Card>
  );
}
