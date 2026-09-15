import type { components } from '@remora/api-client';
import { Button, Card, Input } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';

type Visibility = components['schemas']['SetVisibility'];
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
interface DraftCard {
  key: string;
  id?: string;
  term: string;
  definition: string;
}
interface Snapshot {
  title: string;
  description: string;
  visibility: Visibility;
  cards: DraftCard[];
}

export function SetEditorPage() {
  const { setId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [cards, setCards] = useState<DraftCard[]>([]);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const pending = useRef<Snapshot | null>(null);

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

  useEffect(() => {
    if (!query.data || ready) return;
    setTitle(query.data.title);
    setDescription(query.data.description);
    setVisibility(query.data.visibility);
    setCards(
      query.data.cards.map((card) => ({
        key: card.id,
        id: card.id,
        term: card.term,
        definition: card.definition,
      })),
    );
    setReady(true);
  }, [query.data, ready]);

  async function runSave(snapshot: Snapshot) {
    if (saving.current) {
      pending.current = snapshot;
      return;
    }
    saving.current = true;
    setSaveState('saving');
    try {
      const [metadata, content] = await Promise.all([
        api.PATCH('/api/v1/sets/{set_id}', {
          params: { path: { set_id: setId } },
          body: {
            title: snapshot.title || 'Без названия',
            description: snapshot.description,
            visibility: snapshot.visibility,
            lang_term: 'ru',
            lang_definition: 'ru',
          },
        }),
        api.PUT('/api/v1/sets/{set_id}/cards', {
          params: { path: { set_id: setId } },
          body: {
            cards: snapshot.cards.map(({ id, term, definition }) => ({
              id,
              term,
              definition,
              content_type: 'text' as const,
            })),
          },
        }),
      ]);
      if (metadata.error || content.error || !content.data) throw new Error();
      if (snapshot.cards.some((card) => !card.id))
        setCards((current) =>
          current.map((card, index) => ({
            ...card,
            id: content.data?.cards[index]?.id ?? card.id,
          })),
        );
      setSaveState('saved');
      await queryClient.invalidateQueries({ queryKey: ['sets'] });
    } catch {
      setSaveState('error');
    } finally {
      saving.current = false;
      const next = pending.current;
      pending.current = null;
      if (next) void runSave(next);
    }
  }

  function saveNow() {
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    void runSave({ title, description, visibility, cards });
  }

  useEffect(() => {
    if (!ready) return;
    setSaveState('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveNow(), 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // saveNow намеренно пересоздаётся: снимок должен содержать последние поля формы.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, visibility, cards, ready]);

  function updateCard(key: string, field: 'term' | 'definition', value: string) {
    setCards((items) =>
      items.map((card) => (card.key === key ? { ...card, [field]: value } : card)),
    );
  }
  function addCard() {
    setCards((items) => [...items, { key: crypto.randomUUID(), term: '', definition: '' }]);
  }
  function duplicateCard(index: number) {
    setCards((items) => {
      const source = items[index];
      if (!source) return items;
      const copy = { ...source, id: undefined, key: crypto.randomUUID() };
      return [...items.slice(0, index + 1), copy, ...items.slice(index + 1)];
    });
  }
  function removeCard(key: string) {
    setCards((items) => items.filter((card) => card.key !== key));
  }
  function moveCard(index: number, offset: number) {
    setCards((items) => {
      const target = index + offset;
      if (target < 0 || target >= items.length) return items;
      const next = [...items];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }
  async function deleteSet() {
    if (!window.confirm('Удалить набор? Это действие пока нельзя отменить.')) return;
    const { error } = await api.DELETE('/api/v1/sets/{set_id}', {
      params: { path: { set_id: setId } },
    });
    if (!error) {
      await queryClient.invalidateQueries({ queryKey: ['sets'] });
      navigate('/sets');
    }
  }

  if (query.isPending || !ready) return <p className="text-fg-muted">Открываем редактор…</p>;
  if (query.isError) return <p className="text-danger">{query.error.message}</p>;

  return (
    <div className="pb-24">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link to={`/sets/${setId}`} className="text-primary text-sm font-medium">
          ← Просмотр набора
        </Link>
        <div className="flex items-center gap-3">
          <SaveIndicator state={saveState} />
          <Button variant="secondary" size="sm" onClick={saveNow}>
            Сохранить
          </Button>
        </div>
      </div>
      <header className="mt-7 grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="space-y-4">
          <Input
            aria-label="Название набора"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
            className="h-14 border-0 bg-transparent px-0 text-3xl font-semibold shadow-none"
            placeholder="Название набора"
          />
          <textarea
            aria-label="Описание набора"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={5000}
            rows={2}
            className="border-border bg-surface text-fg placeholder:text-fg-subtle w-full resize-y rounded-xl border px-4 py-3"
            placeholder="Короткое описание"
          />
        </div>
        <label className="text-fg-muted text-sm">
          Видимость
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as Visibility)}
            className="border-border bg-surface text-fg mt-1.5 h-11 w-full rounded-xl border px-3"
          >
            <option value="private">Приватный</option>
            <option value="unlisted">По ссылке</option>
            <option value="public">Публичный</option>
          </select>
        </label>
      </header>
      <div className="mt-8 space-y-4">
        {cards.map((card, index) => (
          <Card key={card.key} className="p-0">
            <div className="border-border flex min-h-12 items-center justify-between border-b px-4">
              <span className="text-fg-subtle text-sm font-medium">{index + 1}</span>
              <div className="flex gap-1">
                <IconButton label="Выше" disabled={index === 0} onClick={() => moveCard(index, -1)}>
                  ↑
                </IconButton>
                <IconButton
                  label="Ниже"
                  disabled={index === cards.length - 1}
                  onClick={() => moveCard(index, 1)}
                >
                  ↓
                </IconButton>
                <IconButton label="Дублировать" onClick={() => duplicateCard(index)}>
                  ⧉
                </IconButton>
                <IconButton label="Удалить" onClick={() => removeCard(card.key)}>
                  ×
                </IconButton>
              </div>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <CardField
                label="Термин"
                value={card.term}
                onChange={(value) => updateCard(card.key, 'term', value)}
              />
              <CardField
                label="Определение"
                value={card.definition}
                onChange={(value) => updateCard(card.key, 'definition', value)}
              />
            </div>
          </Card>
        ))}
      </div>
      <Button variant="secondary" fullWidth className="mt-4 border-dashed" onClick={addCard}>
        ＋ Добавить карточку
      </Button>
      <div className="border-border mt-10 flex justify-end border-t pt-6">
        <Button variant="danger" onClick={() => void deleteSet()}>
          Удалить набор
        </Button>
      </div>
    </div>
  );
}

function CardField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-fg-muted text-xs font-medium uppercase tracking-wide">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        maxLength={10_000}
        className="border-border bg-surface-muted text-fg mt-2 w-full resize-y rounded-xl border px-4 py-3 text-base normal-case tracking-normal"
        placeholder={label === 'Термин' ? 'Например, memory' : 'Например, память'}
      />
    </label>
  );
}
function IconButton({
  label,
  children,
  ...props
}: { label: string; children: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      className="text-fg-muted hover:bg-surface-muted hover:text-fg grid h-10 w-10 place-items-center rounded-lg disabled:opacity-30"
      {...props}
    >
      {children}
    </button>
  );
}
function SaveIndicator({ state }: { state: SaveState }) {
  const labels: Record<SaveState, string> = {
    idle: 'Есть изменения',
    saving: 'Сохраняем…',
    saved: 'Сохранено',
    error: 'Ошибка сохранения',
  };
  return (
    <span
      className={`text-sm ${state === 'error' ? 'text-danger' : state === 'saved' ? 'text-success' : 'text-fg-muted'}`}
      role="status"
    >
      {labels[state]}
    </span>
  );
}
