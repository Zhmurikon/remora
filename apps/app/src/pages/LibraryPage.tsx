import type { components } from '@remora/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  ManageHeader,
  ManageGroup,
  OrderedRows,
  cardCount,
} from '../features/library/ManagementList';
import { LibraryUpdateControl } from '../features/library/LibraryUpdateControl';
import { ListSort, sortItems, useListSort, useCustomOrder } from '../features/library/ListSort';

const web = import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000';
type Item = components['schemas']['LibraryItem'];
function readerPath(item: Item) {
  if (item.target_type === 'set') return '/sets/' + item.set_id;
  if (item.target_type === 'course') return '/courses/' + item.course_id;
  if (!item.set_id) return '/library/' + item.id + '/read';
  return '/courses/' + item.course_id + '?article=' + item.article_id;
}

function titleOf(item: Item) {
  return (item.target_type === 'set' ? item.set_title : item.article_title) ?? item.course_title;
}
export function LibraryPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [mode, setMode] = useListSort('remora:sort:library');
  const [order, setOrder] = useCustomOrder('remora:order:library');
  const library = useQuery({
    queryKey: ['library'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/library');
      if (!data || error) throw new Error('Не удалось загрузить библиотеку');
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
    onSuccess: async () => {
      await Promise.all(
        ['library', 'folders', 'course', 'set', 'study'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  const rows = sortItems(
    library.data ?? [],
    mode,
    (item) => ({ id: item.id, title: titleOf(item), date: item.saved_at, size: item.cards_count }),
    order,
  ).map((item) => ({ ...item, title: titleOf(item) }));
  const needle = search.trim().toLocaleLowerCase('ru');
  const visible = rows.filter((item) =>
    [item.title, item.course_title, item.author?.display_name, item.author?.username].some((text) =>
      text?.toLocaleLowerCase('ru').includes(needle),
    ),
  );
  return (
    <div className="management">
      <ManageHeader title="Сохранённые материалы">
        <a className="manage-link" href={web + '/kursy'}>
          Найти курсы
        </a>
      </ManageHeader>
      <div className="manage-toolbar">
        <input
          type="search"
          aria-label="Поиск по сохранённым материалам"
          placeholder="Найти материал или автора"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ListSort value={mode} onChange={setMode} label="Сортировка библиотеки" />
      </div>
      {library.isError ? (
        <p role="alert">
          {library.error.message}{' '}
          <button className="manage-link" onClick={() => void library.refetch()}>
            Повторить
          </button>
        </p>
      ) : library.isPending ? (
        <p role="status">Загружаем библиотеку…</p>
      ) : !visible.length ? (
        <p className="manage-note">
          {needle ? 'Материалы не найдены.' : 'Сохранённых материалов пока нет.'}
        </p>
      ) : null}
      {remove.isError && (
        <p role="alert" className="danger">
          {remove.error.message}
        </p>
      )}
      {(
        [
          ['course', 'Курсы'],
          ['article', 'Статьи'],
          ['set', 'Наборы'],
        ] as const
      ).map(([type, label]) => {
        const items = visible.filter((item) => item.target_type === type);
        if (!items.length) return null;
        return (
          <ManageGroup key={type} title={label} count={items.length}>
            <OrderedRows
              items={items}
              custom={mode === 'custom'}
              fullOrder={rows.map((item) => item.id)}
              onOrder={setOrder}
            >
              {(item) => (
                <>
                  <Link className="manage-title" to={readerPath(item)}>
                    {item.title}
                  </Link>
                  <p className="manage-meta">
                    {(type !== 'article' || item.set_id) && cardCount(item.cards_count) + ' · '}
                    {item.author?.display_name || item.author?.username} ·{' '}
                    <a href={web + '/kurs/' + item.course_slug}>
                      {type === 'course' ? 'Оригинал курса' : item.course_title}
                    </a>
                  </p>
                  <div className="manage-inline">
                    {item.set_id && (
                      <Link to={'/sets/' + item.set_id + '/learn'}>Начать учиться</Link>
                    )}
                    <button
                      className="manage-link"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm('Убрать «' + item.title + '» из сохранённых?'))
                          remove.mutate(item.id);
                      }}
                    >
                      Убрать
                    </button>
                  </div>
                  {item.has_updates && (
                    <LibraryUpdateControl
                      saveId={item.id}
                      title={item.title}
                      targetType={item.target_type}
                    />
                  )}
                </>
              )}
            </OrderedRows>
          </ManageGroup>
        );
      })}
    </div>
  );
}
