import type { ApiError } from '@remora/api-client';
import { Badge, Button, Card, Input } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

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
  const [selectedFolder, setSelectedFolder] = useState<string | null | 'all'>('all');
  const [search, setSearch] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const sets = useQuery({
    queryKey: ['sets'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/sets');
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
  const visibleSets = useMemo(
    () =>
      (sets.data ?? []).filter((set) => {
        const inFolder = selectedFolder === 'all' || set.folder_id === selectedFolder;
        const needle = search.trim().toLocaleLowerCase('ru');
        return (
          inFolder &&
          (!needle || `${set.title} ${set.description}`.toLocaleLowerCase('ru').includes(needle))
        );
      }),
    [search, selectedFolder, sets.data],
  );

  async function createSet() {
    const { data } = await api.POST('/api/v1/sets', {
      body: {
        title: 'Новый набор',
        description: '',
        visibility: 'private',
        lang_term: 'ru',
        lang_definition: 'ru',
        folder_id: selectedFolder === 'all' ? null : selectedFolder,
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
              active={selectedFolder === 'all'}
              onClick={() => setSelectedFolder('all')}
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
                  <span>{sets.data?.filter((set) => set.folder_id === folder.id).length ?? 0}</span>
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
          {(sets.isPending || folders.isPending) && (
            <p className="text-fg-muted">Загружаем наборы…</p>
          )}
          {(sets.isError || folders.isError) && (
            <p className="text-danger">Не удалось загрузить библиотеку</p>
          )}
          {!sets.isPending && visibleSets.length === 0 && (
            <Card className="grid min-h-64 place-items-center text-center">
              <div>
                <p className="text-xl font-semibold">Здесь пока пусто</p>
                <p className="text-fg-muted mt-2">Создайте набор или выберите другую папку.</p>
                <Button className="mt-5" onClick={() => void createSet()}>
                  Создать набор
                </Button>
              </div>
            </Card>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleSets.map((set) => (
              <Link
                key={set.id}
                to={`/sets/${set.id}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/remora-set-id', set.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                className="group"
              >
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
        </section>
      </div>
    </div>
  );
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
