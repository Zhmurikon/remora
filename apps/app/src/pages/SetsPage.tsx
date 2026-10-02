import type { ApiError } from '@remora/api-client';
import { Badge, Button, Card, Input } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
  DropIndicator,
  ListSort,
  moveCustomItem,
  moveCustomItemTo,
  sortItems,
  useCustomOrder,
  useDragOrder,
  useListSort,
} from '../features/library/ListSort';

const folderColors: Record<string, string> = {
  lime: 'bg-primary',
  blue: 'bg-success',
  violet: 'bg-accent',
  orange: 'bg-warning',
  rose: 'bg-danger',
};

export function SetsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedFolder, setSelectedFolder] = useState<string | null | 'all' | 'archived'>('all');
  const [origin, setOrigin] = useState<'all' | 'owned' | 'saved'>('all');
  const [search, setSearch] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [sortMode, setSortMode] = useListSort('remora:sort:sets', 'custom', false);
  const [customOrder, setCustomOrder] = useCustomOrder('remora:order:sets');
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
  const visibleSets = useMemo(() => {
    const source = selectedFolder === 'archived' ? archivedSets.data : sets.data;
    return sortItems(
      (source ?? []).filter((set) => {
        const inFolder =
          selectedFolder === 'archived' ||
          selectedFolder === 'all' ||
          set.folder_id === selectedFolder;
        const needle = search.trim().toLocaleLowerCase('ru');
        return (
          inFolder &&
          (!needle || `${set.title} ${set.description}`.toLocaleLowerCase('ru').includes(needle))
        );
      }),
      sortMode,
      (set) => ({ id: set.id, title: set.title, date: set.updated_at, size: set.cards_count }),
      customOrder,
    );
  }, [archivedSets.data, customOrder, search, selectedFolder, sets.data, sortMode]);
  const visibleSavedSets = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('ru');
    return sortItems(
      (savedSets.data ?? []).filter(
        (set) =>
          (selectedFolder === 'all' ||
            selectedFolder === 'archived' ||
            set.folder_id === selectedFolder) &&
          (!needle ||
            `${set.title} ${set.description} ${set.course_title}`
              .toLocaleLowerCase('ru')
              .includes(needle)),
      ),
      sortMode,
      (set) => ({ id: set.id, title: set.title, date: set.saved_at, size: set.cards_count }),
      customOrder,
    );
  }, [customOrder, savedSets.data, search, selectedFolder, sortMode]);
  const allOrderedIds = [
    ...sortItems(
      sets.data ?? [],
      sortMode,
      (set) => ({ id: set.id, title: set.title, date: set.updated_at, size: set.cards_count }),
      customOrder,
    ),
    ...sortItems(
      savedSets.data ?? [],
      sortMode,
      (set) => ({ id: set.id, title: set.title, date: set.saved_at, size: set.cards_count }),
      customOrder,
    ),
  ].map((set) => set.id);
  const visibleOwnedIds =
    origin === 'saved' || selectedFolder === 'archived' ? [] : visibleSets.map((set) => set.id);
  const visibleSavedIds =
    origin === 'owned' || selectedFolder === 'archived'
      ? []
      : visibleSavedSets.map((set) => set.id);

  function moveVisibleSet(setId: string, direction: -1 | 1) {
    const visibleIds = visibleOwnedIds.includes(setId) ? visibleOwnedIds : visibleSavedIds;
    setCustomOrder(moveCustomItem(allOrderedIds, visibleIds, setId, direction));
  }
  const moveSetByDrag = (setId: string, targetId: string, afterTarget: boolean) => {
    setCustomOrder(moveCustomItemTo(allOrderedIds, setId, targetId, afterTarget));
  };
  const ownedSetDrag = useDragOrder(moveSetByDrag, visibleOwnedIds, moveVisibleSet);
  const savedSetDrag = useDragOrder(moveSetByDrag, visibleSavedIds, moveVisibleSet);
  const isEmpty = hasNoVisibleSets(
    origin,
    selectedFolder,
    visibleSets.length,
    visibleSavedSets.length,
  );

  async function createSet() {
    const { data } = await api.POST('/api/v1/sets', {
      body: {
        title: 'Новый набор',
        description: '',
        visibility: 'private',
        lang_term: 'ru',
        lang_definition: 'ru',
        folder_id:
          selectedFolder === 'all' || selectedFolder === 'archived' ? null : selectedFolder,
      },
    });
    if (!data) return;
    await queryClient.invalidateQueries({ queryKey: ['sets'] });
    navigate(`/sets/${data.id}/edit`);
  }
  async function createFolder() {
    if (!newFolder.trim()) return;
    setCreatingFolder(true);
    const { data } = await api.POST('/api/v1/folders', {
      body: { title: newFolder.trim(), color: 'lime', parent_id: null },
    });
    setCreatingFolder(false);
    if (!data) return;
    setNewFolder('');
    await queryClient.invalidateQueries({ queryKey: ['folders'] });
    setSelectedFolder(data.id);
  }
  async function deleteFolder(folderId: string) {
    if (!window.confirm('Удалить папку? Наборы останутся в разделе «Без папки».')) return;
    const { error } = await api.DELETE('/api/v1/folders/{folder_id}', {
      params: { path: { folder_id: folderId } },
    });
    if (error) return;
    if (selectedFolder === folderId) setSelectedFolder('all');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['folders'] }),
      queryClient.invalidateQueries({ queryKey: ['sets'] }),
    ]);
  }
  async function moveSet(setId: string, folderId: string | null) {
    const set = sets.data?.find((item) => item.id === setId);
    if (!set || set.folder_id === folderId) return;
    const detail = await api.GET('/api/v1/sets/{set_id}', { params: { path: { set_id: setId } } });
    if (!detail.data) return;
    await api.PATCH('/api/v1/sets/{set_id}', {
      params: { path: { set_id: setId } },
      body: {
        title: detail.data.title,
        description: detail.data.description,
        visibility: detail.data.visibility,
        lang_term: detail.data.lang_term,
        lang_definition: detail.data.lang_definition,
        folder_id: folderId,
      },
    });
    await queryClient.invalidateQueries({ queryKey: ['sets'] });
  }
  async function restoreSet(setId: string) {
    const { error } = await api.POST('/api/v1/sets/{set_id}/restore', {
      params: { path: { set_id: setId } },
    });
    if (error) return;
    await queryClient.invalidateQueries({ queryKey: ['sets'] });
  }
  async function permanentlyDeleteSet(setId: string, title: string) {
    if (!window.confirm(`Удалить набор «${title}» навсегда вместе с учебным прогрессом?`)) return;
    const { error } = await api.DELETE('/api/v1/sets/{set_id}/permanent', {
      params: { path: { set_id: setId } },
    });
    if (error) return;
    await queryClient.invalidateQueries({ queryKey: ['sets', 'archived'] });
  }

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-primary text-sm font-medium">Библиотека</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Мои наборы</h1>
          <p className="text-fg-muted mt-2">
            Создавайте карточки и раскладывайте материалы по папкам.
          </p>
        </div>
        <Button size="lg" onClick={() => void createSet()}>
          Создать набор
        </Button>
      </header>
      <nav className="mt-5 flex flex-wrap gap-2" aria-label="Фильтр наборов">
        {(
          [
            ['all', 'Все'],
            ['owned', 'Созданные мной'],
            ['saved', 'Сохранённые'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={origin === value ? 'primary' : 'secondary'}
            size="sm"
            aria-pressed={origin === value}
            onClick={() => {
              setOrigin(value);
              if (value === 'saved' && selectedFolder === 'archived') setSelectedFolder('all');
            }}
          >
            {label}
          </Button>
        ))}
      </nav>
      <div className="mt-8 grid gap-6 lg:grid-cols-[230px_1fr]">
        <aside>
          <Input
            type="search"
            aria-label="Поиск наборов"
            placeholder="Найти набор"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <nav className="mt-4 space-y-1" aria-label="Папки">
            <FolderButton
              active={selectedFolder === 'all' && origin !== 'saved'}
              onClick={() => {
                setOrigin('all');
                setSelectedFolder('all');
              }}
              onDrop={(id) => void moveSet(id, null)}
            >
              Все наборы <span>{sets.data?.length ?? 0}</span>
            </FolderButton>
            <FolderButton
              active={selectedFolder === null}
              onClick={() => setSelectedFolder(null)}
              onDrop={(id) => void moveSet(id, null)}
            >
              Без папки <span>{sets.data?.filter((set) => !set.folder_id).length ?? 0}</span>
            </FolderButton>
            {folders.data?.map((folder) => (
              <div key={folder.id} className="group flex items-center gap-1">
                <FolderButton
                  active={selectedFolder === folder.id}
                  onClick={() => setSelectedFolder(folder.id)}
                  onDrop={(id) => void moveSet(id, folder.id)}
                >
                  <i
                    className={`h-2.5 w-2.5 rounded-full ${folderColors[folder.color] ?? 'bg-primary'}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-left">{folder.title}</span>
                  <span>
                    {(sets.data?.filter((set) => set.folder_id === folder.id).length ?? 0) +
                      (savedSets.data?.filter((set) => set.folder_id === folder.id).length ?? 0)}
                  </span>
                </FolderButton>
                <button
                  type="button"
                  aria-label={`Удалить папку ${folder.title}`}
                  onClick={() => void deleteFolder(folder.id)}
                  className="text-fg-subtle hover:text-danger grid h-11 w-8 shrink-0 place-items-center opacity-0 focus:opacity-100 group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            ))}
            <div className="border-border mt-3 border-t pt-3">
              <FolderButton
                active={selectedFolder === 'archived'}
                onClick={() => setSelectedFolder('archived')}
                onDrop={() => undefined}
              >
                Архив <span>{archivedSets.data?.length ?? 0}</span>
              </FolderButton>
            </div>
            <div className="border-border mt-3 border-t pt-3">
              <FolderButton
                active={origin === 'saved'}
                onClick={() => setOrigin('saved')}
                onDrop={() => undefined}
              >
                Сохранённые <span>{savedSets.data?.length ?? 0}</span>
              </FolderButton>
            </div>
          </nav>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void createFolder();
            }}
          >
            <Input
              aria-label="Название новой папки"
              placeholder="Новая папка"
              maxLength={100}
              value={newFolder}
              onChange={(event) => setNewFolder(event.target.value)}
            />
            <Button type="submit" size="sm" loading={creatingFolder} aria-label="Создать папку">
              ＋
            </Button>
          </form>
          <p className="text-fg-subtle mt-3 text-xs">
            Перетащите набор на папку, чтобы переместить его.
          </p>
        </aside>
        <section>
          <div className="mb-5 flex justify-end">
            <ListSort value={sortMode} onChange={setSortMode} label="Сортировка наборов" />
          </div>
          {sortMode === 'custom' && selectedFolder !== 'archived' && (
            <p className="text-fg-muted mb-5 text-sm">
              Перетаскивайте карточки. Новые наборы будут появляться сверху.
            </p>
          )}
          {typeof selectedFolder === 'string' &&
            selectedFolder !== 'all' &&
            selectedFolder !== 'archived' && (
              <Card className="mb-5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {folders.data?.find((folder) => folder.id === selectedFolder)?.title ??
                        'Папка'}
                    </p>
                    <p className="text-fg-muted mt-1 text-sm">
                      Учитесь сразу по всем наборам этой папки.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/folders/${selectedFolder}/learn`}>
                      <Button size="sm">Заучивание</Button>
                    </Link>
                    <Link to={`/folders/${selectedFolder}/flashcards`}>
                      <Button size="sm" variant="secondary">
                        Карточки
                      </Button>
                    </Link>
                    <Link to={`/folders/${selectedFolder}/write`}>
                      <Button size="sm" variant="secondary">
                        Письмо
                      </Button>
                    </Link>
                    <Link to={`/folders/${selectedFolder}/listen`}>
                      <Button size="sm" variant="secondary">
                        Аудирование
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            )}
          {(sets.isPending ||
            folders.isPending ||
            archivedSets.isPending ||
            savedSets.isPending) && <p className="text-fg-muted">Загружаем наборы…</p>}
          {(sets.isError || folders.isError || archivedSets.isError || savedSets.isError) && (
            <p className="text-danger">Не удалось загрузить библиотеку</p>
          )}
          {!sets.isPending && !savedSets.isPending && isEmpty && (
            <Card className="grid min-h-64 place-items-center text-center">
              <div>
                <p className="text-xl font-semibold">
                  {selectedFolder === 'archived' ? 'Архив пуст' : 'Здесь пока пусто'}
                </p>
                <p className="text-fg-muted mt-2">
                  {selectedFolder === 'archived'
                    ? 'Удалённые курсы и наборы появятся здесь.'
                    : 'Создайте набор или выберите другую папку.'}
                </p>
                {selectedFolder !== 'archived' && (
                  <Button className="mt-5" onClick={() => void createSet()}>
                    Создать набор
                  </Button>
                )}
              </div>
            </Card>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {origin !== 'saved' && selectedFolder === 'archived'
              ? visibleSets.map((set) => (
                  <Card key={set.id} className="h-full p-5">
                    <div className="flex items-start justify-between gap-3">
                      <Badge>В архиве</Badge>
                      <span className="text-fg-subtle text-xs">{set.cards_count} карт.</span>
                    </div>
                    <h2 className="mt-5 text-lg font-semibold">{set.title}</h2>
                    <p className="text-fg-muted mt-2 line-clamp-2 text-sm">
                      {set.description || 'Описание не добавлено'}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void restoreSet(set.id)}>
                        Восстановить
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void permanentlyDeleteSet(set.id, set.title)}
                      >
                        Удалить навсегда
                      </Button>
                    </div>
                  </Card>
                ))
              : origin !== 'saved' &&
                visibleSets.map((set) => (
                  <div
                    key={set.id}
                    {...(sortMode === 'custom' ? ownedSetDrag.getDragProps(set.id, set.title) : {})}
                    className={`focus-visible:outline-primary relative transition-opacity focus-visible:outline focus-visible:outline-2 ${
                      sortMode === 'custom' ? 'cursor-grab active:cursor-grabbing' : ''
                    } ${ownedSetDrag.draggedId === set.id ? 'opacity-40' : ''}`}
                  >
                    {ownedSetDrag.dropTarget?.id === set.id && (
                      <DropIndicator edge={ownedSetDrag.dropTarget.edge} />
                    )}
                    <Card interactive className="h-full p-5">
                      <Link
                        to={`/sets/${set.id}`}
                        draggable={sortMode !== 'custom'}
                        onDragStart={(event) => {
                          if (sortMode === 'custom') return;
                          event.dataTransfer.setData('text/remora-set-id', set.id);
                          event.dataTransfer.effectAllowed = 'move';
                        }}
                        className="group block"
                      >
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
                      </Link>
                    </Card>
                  </div>
                ))}
            {origin !== 'owned' &&
              (origin === 'saved' || selectedFolder !== 'archived') &&
              visibleSavedSets.map((set) => (
                <div
                  key={set.id}
                  {...(sortMode === 'custom' ? savedSetDrag.getDragProps(set.id, set.title) : {})}
                  className={`focus-visible:outline-primary relative transition-opacity focus-visible:outline focus-visible:outline-2 ${
                    sortMode === 'custom' ? 'cursor-grab active:cursor-grabbing' : ''
                  } ${savedSetDrag.draggedId === set.id ? 'opacity-40' : ''}`}
                >
                  {savedSetDrag.dropTarget?.id === set.id && (
                    <DropIndicator edge={savedSetDrag.dropTarget.edge} />
                  )}
                  <Card interactive className="h-full p-5">
                    <Link
                      to={`/sets/${set.id}`}
                      draggable={sortMode !== 'custom'}
                      className="group block"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <Badge>Сохранённый</Badge>
                        <span className="text-fg-subtle text-xs">{set.cards_count} карт.</span>
                      </div>
                      <h2 className="group-hover:text-primary mt-5 text-lg font-semibold transition-colors">
                        {set.title}
                      </h2>
                      <p className="text-fg-muted mt-2 line-clamp-2 text-sm">
                        {set.description || 'Описание не добавлено'}
                      </p>
                      <p className="text-fg-subtle mt-5 text-xs">
                        {set.course_title} · {set.author.display_name || `@${set.author.username}`}
                      </p>
                      {set.has_updates && (
                        <p className="text-warning mt-2 text-xs">Для курса доступно обновление</p>
                      )}
                    </Link>
                  </Card>
                </div>
              ))}
          </div>
        </section>
      </div>
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

function FolderButton({
  active,
  onClick,
  onDrop,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onDrop: (setId: string) => void;
  children: ReactNode;
}) {
  function drop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/remora-set-id');
    if (id) onDrop(id);
  }
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={drop}
      className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 text-sm transition-colors ${active ? 'bg-primary-subtle text-primary font-medium' : 'text-fg-muted hover:bg-surface-muted hover:text-fg'}`}
    >
      {children}
    </button>
  );
}
function visibilityLabel(value: string) {
  return value === 'public' ? 'Публичный' : value === 'unlisted' ? 'По ссылке' : 'Приватный';
}
function errorMessage(error: unknown) {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String((error as ApiError).message)
    : 'Не удалось загрузить данные';
}
