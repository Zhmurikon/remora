import type { components } from '@remora/api-client';
import { defaultCardImportOptions, parseCardImport, type CardImportOptions } from '@remora/core';
import {
  Button,
  Card,
  CardContent,
  Input,
  codeLanguageOptions,
  type CardContentType,
} from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';

type Visibility = components['schemas']['SetVisibility'];
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
interface DraftCard {
  key: string;
  id?: string;
  term: string;
  definition: string;
  contentType: CardContentType;
  codeLanguage: string | null;
}
interface Snapshot {
  title: string;
  description: string;
  visibility: Visibility;
  folderId: string | null;
  cards: DraftCard[];
}

export function SetEditorPage() {
  const { setId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [cards, setCards] = useState<DraftCard[]>([]);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [bulkOpen, setBulkOpen] = useState(false);
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
  const folders = useQuery({
    queryKey: ['folders'],
    queryFn: async () => (await api.GET('/api/v1/folders')).data ?? [],
  });

  useEffect(() => {
    if (!query.data || ready) return;
    setTitle(query.data.title);
    setDescription(query.data.description);
    setVisibility(query.data.visibility);
    setFolderId(query.data.folder_id);
    setCards(
      query.data.cards.map((card) => ({
        key: card.id,
        id: card.id,
        term: card.term,
        definition: card.definition,
        contentType: card.content_type,
        codeLanguage: card.code_language ?? null,
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
            folder_id: snapshot.folderId,
          },
        }),
        api.PUT('/api/v1/sets/{set_id}/cards', {
          params: { path: { set_id: setId } },
          body: {
            cards: snapshot.cards.map(({ id, term, definition, contentType, codeLanguage }) => ({
              id,
              term,
              definition,
              content_type: contentType,
              code_language: contentType === 'code' ? codeLanguage || 'text' : null,
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
    void runSave({ title, description, visibility, folderId, cards });
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
  }, [title, description, visibility, folderId, cards, ready]);

  function updateCard(key: string, field: 'term' | 'definition', value: string) {
    setCards((items) =>
      items.map((card) => (card.key === key ? { ...card, [field]: value } : card)),
    );
  }
  function addCard() {
    setCards((items) => [
      ...items,
      {
        key: crypto.randomUUID(),
        term: '',
        definition: '',
        contentType: 'text',
        codeLanguage: null,
      },
    ]);
  }
  function setCardType(key: string, contentType: CardContentType) {
    setCards((items) =>
      items.map((card) =>
        card.key === key
          ? {
              ...card,
              contentType,
              codeLanguage: contentType === 'code' ? card.codeLanguage || 'text' : null,
            }
          : card,
      ),
    );
  }
  function setCodeLanguage(key: string, codeLanguage: string) {
    setCards((items) => items.map((card) => (card.key === key ? { ...card, codeLanguage } : card)));
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
        <div className="space-y-4">
          <SelectField
            label="Папка"
            value={folderId ?? ''}
            onChange={(value) => setFolderId(value || null)}
          >
            <option value="">Без папки</option>
            {folders.data?.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.title}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Видимость"
            value={visibility}
            onChange={(value) => setVisibility(value as Visibility)}
          >
            <option value="private">Приватный</option>
            <option value="unlisted">По ссылке</option>
            <option value="public">Публичный</option>
          </SelectField>
        </div>
      </header>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Карточки</h2>
        <Button variant="secondary" onClick={() => setBulkOpen((open) => !open)}>
          {bulkOpen ? 'Закрыть импорт' : 'Массовый ввод'}
        </Button>
      </div>
      {bulkOpen && (
        <BulkImport
          onCancel={() => setBulkOpen(false)}
          onImport={(imported) => {
            setCards((current) => [
              ...current,
              ...imported.map((card) => ({
                ...card,
                key: crypto.randomUUID(),
                contentType: 'text' as const,
                codeLanguage: null,
              })),
            ]);
            setBulkOpen(false);
          }}
        />
      )}
      <div className="mt-8 space-y-4">
        {cards.map((card, index) => (
          <Card key={card.key} className="p-0">
            <div className="border-border flex min-h-14 flex-wrap items-center justify-between gap-2 border-b px-4 py-1">
              <div className="flex items-center gap-3">
                <span className="text-fg-subtle text-sm font-medium">{index + 1}</span>
                <select
                  aria-label={`Тип содержимого карточки ${index + 1}`}
                  value={card.contentType}
                  onChange={(event) => setCardType(card.key, event.target.value as CardContentType)}
                  className="border-border bg-surface-muted text-fg h-10 rounded-lg border px-3 text-sm"
                >
                  <option value="text">Текст</option>
                  <option value="latex">Формула</option>
                  <option value="code">Код</option>
                </select>
                {card.contentType === 'code' && (
                  <select
                    aria-label={`Язык кода карточки ${index + 1}`}
                    value={card.codeLanguage ?? 'text'}
                    onChange={(event) => setCodeLanguage(card.key, event.target.value)}
                    className="border-border bg-surface-muted text-fg h-10 rounded-lg border px-3 text-sm"
                  >
                    {codeLanguageOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
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
                contentType={card.contentType}
                codeLanguage={card.codeLanguage}
                onChange={(value) => updateCard(card.key, 'term', value)}
              />
              <CardField
                label="Определение"
                value={card.definition}
                contentType={card.contentType}
                codeLanguage={card.codeLanguage}
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

function SelectField({
  label,
  children,
  value,
  onChange,
}: {
  label: string;
  children: ReactNode;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-fg-muted block text-sm">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-border bg-surface text-fg mt-1.5 h-11 w-full rounded-xl border px-3"
      >
        {children}
      </select>
    </label>
  );
}

function BulkImport({
  onCancel,
  onImport,
}: {
  onCancel: () => void;
  onImport: (cards: Array<{ term: string; definition: string }>) => void;
}) {
  const [source, setSource] = useState('');
  const [options, setOptions] = useState<CardImportOptions>(defaultCardImportOptions);
  const result = useMemo(() => parseCardImport(source, options), [source, options]);
  return (
    <Card className="mt-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Вставьте карточки</h3>
          <p className="text-fg-muted mt-1 text-sm">
            Подходит экспорт Quizlet: термин и определение через Tab, каждая карточка с новой
            строки.
          </p>
        </div>
        <button type="button" className="text-fg-muted hover:text-fg h-11 px-2" onClick={onCancel}>
          Закрыть
        </button>
      </div>
      <textarea
        autoFocus
        value={source}
        onChange={(event) => setSource(event.target.value)}
        rows={8}
        className="border-border bg-surface-muted text-fg mt-4 w-full resize-y rounded-xl border px-4 py-3 font-mono text-sm"
        placeholder={'memory\tпамять\nlearn\tучиться'}
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-fg-muted text-sm">
          Между термином и определением
          <select
            value={options.sideSeparator}
            onChange={(event) =>
              setOptions({
                ...options,
                sideSeparator: event.target.value as CardImportOptions['sideSeparator'],
              })
            }
            className="border-border bg-surface text-fg mt-1 h-11 w-full rounded-xl border px-3"
          >
            <option value="tab">Табуляция</option>
            <option value="comma">Запятая</option>
            <option value="custom">Свой символ</option>
          </select>
        </label>
        <label className="text-fg-muted text-sm">
          Между карточками
          <select
            value={options.cardSeparator}
            onChange={(event) =>
              setOptions({
                ...options,
                cardSeparator: event.target.value as CardImportOptions['cardSeparator'],
              })
            }
            className="border-border bg-surface text-fg mt-1 h-11 w-full rounded-xl border px-3"
          >
            <option value="newline">Новая строка</option>
            <option value="semicolon">Точка с запятой</option>
            <option value="custom">Свой символ</option>
          </select>
        </label>
      </div>
      {(options.sideSeparator === 'custom' || options.cardSeparator === 'custom') && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {options.sideSeparator === 'custom' && (
            <Input
              aria-label="Разделитель сторон"
              placeholder="Например, —"
              maxLength={10}
              value={options.customSideSeparator ?? ''}
              onChange={(event) =>
                setOptions({ ...options, customSideSeparator: event.target.value })
              }
            />
          )}
          {options.cardSeparator === 'custom' && (
            <Input
              aria-label="Разделитель карточек"
              placeholder="Например, |"
              maxLength={10}
              value={options.customCardSeparator ?? ''}
              onChange={(event) =>
                setOptions({ ...options, customCardSeparator: event.target.value })
              }
            />
          )}
        </div>
      )}
      <div className="border-border mt-5 border-t pt-4">
        <p className="text-sm font-medium">
          Предпросмотр: {result.cards.length} карточек
          {result.skipped > 0 ? `, пропущено строк: ${result.skipped}` : ''}
        </p>
        <div className="mt-3 max-h-52 space-y-2 overflow-auto">
          {result.cards.slice(0, 20).map((card, index) => (
            <div
              key={`${card.term}-${index}`}
              className="bg-surface-muted grid gap-2 rounded-lg px-3 py-2 text-sm sm:grid-cols-2"
            >
              <span>{card.term}</span>
              <span className="text-fg-muted">{card.definition}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
        <Button disabled={result.cards.length === 0} onClick={() => onImport(result.cards)}>
          Добавить {result.cards.length || ''}
        </Button>
      </div>
    </Card>
  );
}

function CardField({
  label,
  value,
  contentType,
  codeLanguage,
  onChange,
}: {
  label: string;
  value: string;
  contentType: CardContentType;
  codeLanguage: string | null;
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
        placeholder={fieldPlaceholder(label, contentType)}
      />
      {contentType !== 'text' && value && (
        <div className="border-border bg-surface mt-3 rounded-xl border p-3 normal-case tracking-normal">
          <span className="text-fg-subtle mb-2 block text-xs">Предпросмотр</span>
          <CardContent value={value} type={contentType} codeLanguage={codeLanguage} />
        </div>
      )}
    </label>
  );
}

function fieldPlaceholder(label: string, type: CardContentType) {
  if (type === 'latex')
    return label === 'Термин'
      ? String.raw`x = \frac{-b \pm \sqrt{D}}{2a}`
      : String.raw`D = b^2 - 4ac`;
  if (type === 'code') return label === 'Термин' ? 'function remember() {' : '  return true;\n}';
  return label === 'Термин' ? 'Например, memory' : 'Например, память';
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
