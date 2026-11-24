import type { components, ApiError } from '@remora/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StudyModeMenu } from '../features/study/StudyModeMenu';
import { api } from '../lib/api';
import {
  ManageHeader,
  ManageGroup,
  OriginFilter,
  OrderedRows,
  cardCount,
  type Origin,
} from '../features/library/ManagementList';
import { ListSort, sortItems, useCustomOrder, useListSort } from '../features/library/ListSort';
import { LibraryUpdateControl } from '../features/library/LibraryUpdateControl';

const web = import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000';
function checked<T>(result: { data?: T; error?: unknown }): T | undefined {
  if (result.error) throw new Error(errorMessage(result.error));
  return result.data;
}
export function SetsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState<Origin>('all');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [createdFolder, setCreatedFolder] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [sortMode, setSortMode] = useListSort('remora:sort:sets', 'custom', false);
  const [customOrder, setCustomOrder] = useCustomOrder('remora:order:sets');
  const rowMotionScope = useRef(new Map<string, DOMRect>());
  const sets = useQuery({
    queryKey: ['sets'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/sets');
      if (error) throw new Error(errorMessage(error));
      return data;
    },
  });
  const archivedSets = useQuery({
    queryKey: ['sets', 'archived'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/sets/archived');
      if (error) throw new Error(errorMessage(error));
      return data;
    },
  });
  const savedSets = useQuery({
    queryKey: ['library', 'sets'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/library/sets');
      if (error) throw new Error(errorMessage(error));
      return data;
    },
  });
  const folders = useQuery({
    queryKey: ['folders'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/folders');
      if (error) throw new Error(errorMessage(error));
      return data;
    },
  });
  type Item = components['schemas']['SetSummary'] | components['schemas']['SavedSetItem'];
  const matches = (item: Item) =>
    [item.title, item.description, 'course_title' in item ? item.course_title : ''].some((text) =>
      text.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')),
    );
  const sort = (items: Item[]) =>
    sortItems(
      items,
      sortMode,
      (item) => ({
        id: item.id,
        title: item.title,
        date: 'saved_at' in item ? item.saved_at : item.updated_at,
        size: item.cards_count,
      }),
      customOrder,
    );
  const active = sort([...(sets.data ?? []), ...(savedSets.data ?? [])]);
  const fullOrder = active.map((item) => item.id);
  const visible = active.filter(
    (item) => (origin === 'all' || (origin === 'saved') === 'save_id' in item) && matches(item),
  );
  const archive = sort(archivedSets.data ?? []).filter(matches);
  const groups = [
    ...(folders.data ?? []).map((f) => ({ id: f.id, title: f.title })),
    { id: 'none', title: 'Без папки' },
  ];
  const first = groups.find((group) =>
    visible.some((item) => (item.folder_id ?? 'none') === group.id),
  )?.id;
  const queries = [sets, archivedSets, savedSets, folders];
  const failed = queries.find((query) => query.isError);
  const pending = queries.some((query) => query.isPending);

  const write = useMutation({
    mutationFn: async (action: () => Promise<void>) => action(),
    onSuccess: async () => {
      await Promise.all(
        ['folders', 'sets', 'library', 'set'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  function moveToFolder(id: string, folder: string) {
    const item = active.find((item) => item.id === id);
    const folderId = folder === 'none' ? null : folder;
    if (!item || (item.folder_id ?? null) === folderId || write.isPending) return;
    write.mutate(async () => {
      checked(
        await api.PUT('/api/v1/library/sets/{set_id}/folder', {
          params: { path: { set_id: id } },
          body: { folder_id: folderId },
        }),
      );
    });
  }
  function createSet(folderId: string | null) {
    write.mutate(async () => {
      const data = checked(
        await api.POST('/api/v1/sets', {
          body: {
            title: 'Новый набор',
            description: '',
            visibility: 'public',
            lang_term: 'ru',
            lang_definition: 'ru',
            folder_id: folderId,
          },
        }),
      );
      if (data) navigate('/sets/' + data.id + '/edit');
    });
  }
  function folderActions(id: string, title: string) {
    return (
      <div className="manage-inline">
        <StudyModeMenu
          basePath={`/folders/${id}`}
          label={'Обучение — ' + title}
          summary="Учиться по папке"
        />
        <details>
          <summary aria-label={'Действия с папкой ' + title}>Действия</summary>
          <div className="manage-options">
            <button
              className="manage-link"
              disabled={write.isPending}
              onClick={() => createSet(id)}
            >
              Создать набор в папке
            </button>
            <button
              className="manage-link"
              disabled={write.isPending}
              onClick={() => {
                const name = window.prompt('Название папки', title)?.trim();
                if (name && name !== title)
                  write.mutate(async () => {
                    checked(
                      await api.PATCH('/api/v1/folders/{folder_id}', {
                        params: { path: { folder_id: id } },
                        body: { title: name },
                      }),
                    );
                  });
              }}
            >
              Переименовать
            </button>
            <button
              className="manage-link danger"
              disabled={write.isPending}
              onClick={() => {
                if (window.confirm('Удалить папку? Наборы останутся в разделе «Без папки».'))
                  write.mutate(async () => {
                    checked(
                      await api.DELETE('/api/v1/folders/{folder_id}', {
                        params: { path: { folder_id: id } },
                      }),
                    );
                  });
              }}
            >
              Удалить папку
            </button>
          </div>
        </details>
      </div>
    );
  }
  return (
    <div className="management management-motion">
      <ManageHeader title="Папки и сортировка наборов">
        <Link className="manage-link" to="/library/manage">
          Управлять сохранениями
        </Link>
        <button
          className="manage-action"
          disabled={write.isPending}
          onClick={() => createSet(null)}
        >
          Создать набор
        </button>
      </ManageHeader>
      <div className="manage-toolbar">
        <input
          type="search"
          aria-label="Поиск наборов"
          placeholder="Найти набор"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <OriginFilter value={origin} onChange={setOrigin} />
        <ListSort value={sortMode} onChange={setSortMode} label="Сортировка наборов" />
        <button className="manage-link" aria-expanded={adding} onClick={() => setAdding(!adding)}>
          ＋ Папка
        </button>
      </div>
      {adding && (
        <form
          className="manage-inline manage-folder-form"
          onSubmit={(e) => {
            e.preventDefault();
            const title = newFolder.trim();
            if (!title || write.isPending) return;
            write.mutate(async () => {
              const folder = checked(
                await api.POST('/api/v1/folders', {
                  body: { title, color: 'blue', parent_id: null },
                }),
              );
              if (folder) setCreatedFolder(folder.id);
              setAdding(false);
              setNewFolder('');
            });
          }}
        >
          <input
            className="manage-input"
            autoFocus
            required
            maxLength={100}
            aria-label="Название новой папки"
            placeholder="Название новой папки"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
          />
          <button className="manage-link" disabled={write.isPending}>
            Создать папку
          </button>
        </form>
      )}
      {write.isError && (
        <p role="alert" className="manage-note danger">
          {write.error.message}
        </p>
      )}
      {failed ? (
        <p role="alert" className="manage-note">
          {failed.error?.message}{' '}
          <button
            className="manage-link"
            onClick={() =>
              queries.forEach((q) => {
                if (q.isError) void q.refetch();
              })
            }
          >
            Повторить
          </button>
        </p>
      ) : pending ? (
        <p role="status">Загружаем наборы…</p>
      ) : (
        <div className="manage-groups">
          {search && !visible.length && !(origin !== 'saved' && archive.length) && (
            <p className="manage-note">Наборы не найдены.</p>
          )}
          {groups.map((group) => {
            const items = visible.filter((item) => (item.folder_id ?? 'none') === group.id);
            if (search && !items.length) return null;
            const real = group.id !== 'none';
            return (
              <ManageGroup
                key={group.id + (search ? 'search' : '')}
                folder={group.id}
                title={group.title}
                count={items.length}
                initialOpen={
                  !!search || group.id === first || group.id === createdFolder || (!first && !real)
                }
                dropProps={{
                  onDragOver: (e) => {
                    if (e.dataTransfer.types.includes('text/remora-set-id')) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }
                  },
                  onDrop: (e) => {
                    const id = e.dataTransfer.getData('text/remora-set-id');
                    if (id) {
                      e.preventDefault();
                      moveToFolder(id, group.id);
                    }
                  },
                }}
                actions={real ? folderActions(group.id, group.title) : undefined}
                motion
              >
                {!items.length && <p className="manage-note">Здесь пока нет наборов.</p>}
                <OrderedRows
                  items={items}
                  fullOrder={fullOrder}
                  onOrder={setCustomOrder}
                  custom={sortMode === 'custom'}
                  onMoveFolder={moveToFolder}
                  motion
                  motionScope={rowMotionScope}
                >
                  {(item) => (
                    <>
                      <Link className="manage-title" draggable={false} to={'/sets/' + item.id}>
                        {item.title}
                      </Link>
                      <div className="manage-meta">
                        {cardCount(item.cards_count)} ·{' '}
                        {'save_id' in item ? (
                          <>
                            {item.author.display_name || '@' + item.author.username} ·{' '}
                            <a href={web + '/kurs/' + item.course_slug}>{item.course_title}</a>
                          </>
                        ) : (
                          visibilityLabel(item.visibility)
                        )}
                      </div>
                      {'save_id' in item && item.has_updates && (
                        <LibraryUpdateControl
                          saveId={item.save_id}
                          targetType={item.access_via}
                          title={
                            item.access_via === 'course'
                              ? item.course_title
                              : item.access_via === 'article'
                                ? item.article_title
                                : item.title
                          }
                        />
                      )}
                      <details className="manage-set-actions">
                        <summary
                          aria-label={'Действия с набором ' + item.title}
                          title="Действия с набором"
                        >
                          ⋯
                        </summary>
                        <div className="manage-options">
                          <label>
                            Папка{' '}
                            <select
                              aria-label={'Папка для ' + item.title}
                              value={item.folder_id ?? 'none'}
                              disabled={write.isPending}
                              onChange={(e) => moveToFolder(item.id, e.target.value)}
                            >
                              {groups.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          {!('save_id' in item) && (
                            <button
                              className="manage-link"
                              disabled={write.isPending}
                              onClick={() =>
                                write.mutate(async () => {
                                  checked(
                                    await api.DELETE('/api/v1/sets/{set_id}', {
                                      params: { path: { set_id: item.id } },
                                    }),
                                  );
                                })
                              }
                            >
                              В архив
                            </button>
                          )}
                        </div>
                      </details>
                    </>
                  )}
                </OrderedRows>
              </ManageGroup>
            );
          })}
          {origin !== 'saved' && (!search || archive.length > 0) && (
            <ManageGroup
              key={'archive' + !!search}
              title="Архив"
              count={archive.length}
              initialOpen={!!search}
              motion
            >
              {hasNoVisibleSets(origin, 'archived', archive.length, 0) && (
                <p className="manage-note">Архив пуст.</p>
              )}
              {archive.length > 0 && (
                <p className="manage-note">При восстановлении учебный прогресс сохранится.</p>
              )}
              {archive.map((item) => (
                <div key={item.id} className="manage-row">
                  <div className="manage-item">
                    <h3 className="manage-title">{item.title}</h3>
                    <p className="manage-meta">{cardCount(item.cards_count)}</p>
                    <div className="manage-inline">
                      <button
                        disabled={write.isPending}
                        className="manage-link"
                        onClick={() =>
                          write.mutate(async () => {
                            checked(
                              await api.POST('/api/v1/sets/{set_id}/restore', {
                                params: { path: { set_id: item.id } },
                              }),
                            );
                          })
                        }
                      >
                        Восстановить
                      </button>
                      <button
                        className="manage-link danger"
                        disabled={write.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              'Удалить набор «' +
                                item.title +
                                '» навсегда вместе с учебным прогрессом?',
                            )
                          )
                            write.mutate(async () => {
                              checked(
                                await api.DELETE('/api/v1/sets/{set_id}/permanent', {
                                  params: { path: { set_id: item.id } },
                                }),
                              );
                            });
                        }}
                      >
                        Удалить навсегда
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </ManageGroup>
          )}
        </div>
      )}
    </div>
  );
}
export function hasNoVisibleSets(
  origin: 'all' | 'owned' | 'saved',
  selectedFolder: string | null | 'all' | 'archived',
  ownedCount: number,
  savedCount: number,
): boolean {
  if (origin === 'saved') return savedCount === 0;
  if (origin === 'owned' || selectedFolder === 'archived') return ownedCount === 0;
  return ownedCount === 0 && savedCount === 0;
}

function visibilityLabel(value: string) {
  return value === 'public' ? 'Публичный' : value === 'unlisted' ? 'По ссылке' : 'Приватный';
}
function errorMessage(error: unknown) {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String((error as ApiError).message)
    : 'Не удалось загрузить данные';
}
