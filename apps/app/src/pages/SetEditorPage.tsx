import { useCanHideMaterials } from '../components/MaterialVisibility';
import type { components } from '@remora/api-client';
import { defaultCardImportOptions, parseCardImport, type CardImportOptions } from '@remora/core';
import { Button, Card, Input, codeLanguageOptions, type CardContentType } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CourseIcon } from '../components/CourseAction';
import { EditorCardIndex } from '../features/materials/EditorCardIndex';
import { moveCustomItemTo } from '../features/library/ListSort';
import { setDetailQuery } from '../features/materials/set-queries';
import { CardSide } from '../features/materials/CardSide';
import './set-editor.css';
import { api, downloadFile, uploadBinary } from '../lib/api';
import { WrongAnswersEditor, wrongAnswersError } from './WrongAnswersEditor';

type Visibility = components['schemas']['SetVisibility'];
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
interface DraftCard {
  source?: components['schemas']['CardWrite'];
  wrongTermAnswers?: string[];
  wrongDefinitionAnswers?: string[];
  key: string;
  id?: string;
  term: string;
  definition: string;
  contentType: CardContentType;
  codeLanguage: string | null;
  termImageId: string | null;
  definitionImageId: string | null;
}
interface Snapshot {
  title: string;
  description: string;
  visibility: Visibility;
  folderId: string | null;
  cards: DraftCard[];
}

type SetDetail = components['schemas']['SetDetail'];

function sameMetadata(a: Snapshot, b: Snapshot) {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.visibility === b.visibility &&
    a.folderId === b.folderId
  );
}

function sameSnapshot(a: Snapshot, b: Snapshot) {
  return a.cards === b.cards && sameMetadata(a, b);
}

function sameServerCard(a: SetDetail['cards'][number], b?: SetDetail['cards'][number]) {
  return a.id === b?.id && a.updated_at === b.updated_at;
}

function fromServer(card: SetDetail['cards'][number]): DraftCard {
  return {
    source: card,
    key: card.id,
    id: card.id,
    term: card.term,
    definition: card.definition,
    wrongTermAnswers: card.wrong_term_answers,
    wrongDefinitionAnswers: card.wrong_definition_answers,
    contentType: card.content_type,
    codeLanguage: card.code_language ?? null,
    termImageId: card.term_image_id ?? null,
    definitionImageId: card.definition_image_id ?? null,
  };
}

function newCard(term = '', definition = ''): DraftCard {
  return {
    key: crypto.randomUUID(),
    term,
    definition,
    contentType: 'text',
    codeLanguage: null,
    termImageId: null,
    definitionImageId: null,
  };
}

export function SetEditorPage() {
  const { setId = '' } = useParams();
  const query = useQuery(setDetailQuery(setId));
  if (query.isPending) return <p role="status">Открываем редактор…</p>;
  if (!query.data)
    return (
      <div role="alert">
        <p>Не удалось открыть набор.</p>
        <button className="set-tool mt-3" onClick={() => void query.refetch()}>
          Повторить загрузку
        </button>
      </div>
    );
  if (query.data.can_edit === false)
    return (
      <div>
        <p>Редактировать набор может его владелец.</p>
        <Link className="set-back" to={`/sets/${setId}`}>
          К набору
        </Link>
      </div>
    );
  return <SetEditor key={setId} initial={query.data} />;
}

function SetEditor({ initial }: { initial: SetDetail }) {
  const setId = initial.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canHide = useCanHideMaterials();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility);
  const [folderId, setFolderId] = useState(initial.folder_id);
  const [cards, setCards] = useState(() => initial.cards.map(fromServer));
  const [selected, setSelected] = useState(cards[0]?.key);
  const [firstTerm, setFirstTerm] = useState('');
  const [firstDefinition, setFirstDefinition] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMounted, setBulkMounted] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState('');
  const snapshot = useMemo(
    () => ({ title, description, visibility, folderId, cards }),
    [title, description, visibility, folderId, cards],
  );
  const baseline = useRef<Snapshot>(snapshot);
  const revision = useRef(initial.updated_at);
  const serverCards = useRef(initial.cards);
  const importGeneration = useRef(0);
  const serverIds = useRef(new Map(initial.cards.map((card) => [card.id, card.id])));
  const chain = useRef(Promise.resolve(true));
  const pendingSaves = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workPanel = useRef<HTMLElement>(null);
  const focusForm = useRef(false);
  const index = Math.max(
    0,
    cards.findIndex((card) => card.key === selected),
  );
  const card = cards[index];

  useEffect(() => {
    if (focusForm.current) {
      workPanel.current?.focus();
      focusForm.current = false;
    }
  }, [card?.key]);

  const folders = useQuery({
    queryKey: ['folders'],
    queryFn: async () => (await api.GET('/api/v1/folders')).data ?? [],
  });

  const save = useCallback(
    (draft: Snapshot) => {
      const generation = importGeneration.current;
      async function persist() {
        // После импорта новая версия формы уже содержит добавленные строки.
        if (generation !== importGeneration.current) return false;
        const previous = baseline.current;
        if (sameSnapshot(previous, draft)) {
          setSaveError('');
          setSaveState('saved');
          return true;
        }
        setSaveError('');
        const invalid = draft.cards.findIndex(
          (c) =>
            wrongAnswersError(c.wrongTermAnswers ?? [], c.term, c.source?.alt_answers) ||
            wrongAnswersError(c.wrongDefinitionAnswers ?? [], c.definition, c.source?.alt_answers),
        );
        if (invalid >= 0) {
          setSaveError(`Проверьте неверные ответы в карточке ${invalid + 1}.`);
          setSaveState('error');
          return false;
        }
        setSaveState('saving');
        try {
          if (previous.cards !== draft.cards) {
            const content = await api.PUT('/api/v1/sets/{set_id}/cards', {
              params: { path: { set_id: setId } },
              body: {
                expected_updated_at: revision.current,
                cards: draft.cards.map((item) => ({
                  ...item.source,
                  id: serverIds.current.get(item.key) ?? item.id,
                  wrong_term_answers: (item.wrongTermAnswers ?? [])
                    .map((v) => v.trim())
                    .filter(Boolean),
                  wrong_definition_answers: (item.wrongDefinitionAnswers ?? [])
                    .map((v) => v.trim())
                    .filter(Boolean),
                  term: item.term,
                  definition: item.definition,
                  content_type: item.contentType,
                  code_language: item.contentType === 'code' ? item.codeLanguage || 'text' : null,
                  term_image_id: item.termImageId,
                  definition_image_id: item.definitionImageId,
                })),
              },
            });
            if (content.error || !content.data)
              throw new Error(
                (content.error as { message?: string } | undefined)?.message ??
                  'Не удалось сохранить карточки.',
              );
            // Сервер возвращает карточки в порядке отправленного снимка. Пользователь за это время мог изменить порядок в форме.
            draft.cards.forEach((item, i) =>
              serverIds.current.set(item.key, content.data.cards[i]!.id),
            );
            revision.current = content.data.updated_at;
            serverCards.current = content.data.cards;
            baseline.current = { ...previous, cards: draft.cards };
            queryClient.setQueryData(['sets', setId], content.data);
          }
          if (!sameMetadata(previous, draft)) {
            const metadata = await api.PATCH('/api/v1/sets/{set_id}', {
              params: { path: { set_id: setId } },
              body: {
                lang_term: initial.lang_term,
                lang_definition: initial.lang_definition,
                title: draft.title || 'Без названия',
                description: draft.description,
                visibility: draft.visibility,
                folder_id: draft.folderId,
              },
            });
            if (metadata.error || !metadata.data)
              throw new Error(
                (metadata.error as { message?: string } | undefined)?.message ??
                  'Не удалось сохранить настройки набора.',
              );
            // Изменение заголовка не даёт права перезаписать чужие изменения в карточках.
            if (
              metadata.data.cards.length === serverCards.current.length &&
              metadata.data.cards.every((c, i) => sameServerCard(c, serverCards.current[i]))
            ) {
              revision.current = metadata.data.updated_at;
            }
          }
          baseline.current = draft;
          await queryClient.invalidateQueries({ queryKey: ['sets'] });
          if (previous.cards !== draft.cards)
            await queryClient.invalidateQueries({ queryKey: ['study'] });
          setSaveState('saved');
          return true;
        } catch (error) {
          setSaveError(error instanceof Error ? error.message : 'Не удалось сохранить набор.');
          setSaveState('error');
          return false;
        }
      }
      pendingSaves.current += 1;
      chain.current = chain.current.then(persist).finally(() => {
        pendingSaves.current -= 1;
      });
      return chain.current;
    },
    [queryClient, setId, initial.lang_term, initial.lang_definition],
  );

  const firstPending = !cards.length && !!(firstTerm.trim() || firstDefinition.trim());
  const currentDraft = useMemo(
    () => (firstPending ? { ...snapshot, cards: [newCard(firstTerm, firstDefinition)] } : snapshot),
    [firstPending, firstTerm, firstDefinition, snapshot],
  );
  const leaving = useRef(currentDraft);
  useEffect(() => {
    leaving.current = currentDraft;
  }, [currentDraft]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!sameSnapshot(leaving.current, baseline.current)) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      // Ссылка в общей навигации может закрыть форму до срабатывания таймера.
      if (pendingSaves.current || !sameSnapshot(leaving.current, baseline.current))
        void save(leaving.current);
    };
  }, [save]);

  function saveNow() {
    if (timer.current) clearTimeout(timer.current);
    if (firstPending) {
      setCards(currentDraft.cards);
      setSelected(currentDraft.cards[0]!.key);
      setFirstTerm('');
      setFirstDefinition('');
    }
    return save(currentDraft);
  }
  useEffect(() => {
    if (!pendingSaves.current && sameSnapshot(snapshot, baseline.current)) {
      setSaveState('saved');
      setSaveError('');
      return;
    }
    setSaveState('idle');
    timer.current = setTimeout(() => void save(snapshot), 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [snapshot, save]);

  const refreshImported = useCallback(async () => {
    const refresh = chain.current.then(async () => {
      const { data, error } = await api.GET('/api/v1/sets/{set_id}', {
        params: { path: { set_id: setId } },
      });
      if (!data || error) throw new Error('Не удалось загрузить карточки.');
      const known = serverCards.current;
      if (!known.every((c, i) => sameServerCard(c, data.cards[i])))
        throw new Error('Набор изменился.');
      const additions = data.cards.slice(known.length).map(fromServer);
      if (additions.length) {
        if (timer.current) clearTimeout(timer.current);
        importGeneration.current += 1;
        serverCards.current = data.cards;
        revision.current = data.updated_at;
        additions.forEach((c) => serverIds.current.set(c.key, c.id!));
        const previous = baseline.current;
        const merged = [...previous.cards, ...additions];
        baseline.current = { ...previous, cards: merged };
        setCards((local) => (local === previous.cards ? merged : [...local, ...additions]));
      }
      queryClient.setQueryData(['sets', setId], data);
      return true;
    });
    chain.current = refresh.catch(() => false);
    await refresh;
  }, [setId, queryClient]);

  function updateCard(key: string, field: 'term' | 'definition', value: string) {
    setCards((items) =>
      items.map((card) => (card.key === key ? { ...card, [field]: value } : card)),
    );
  }
  function selectCard(key: string) {
    if (key === card?.key) workPanel.current?.focus();
    else focusForm.current = true;
    setSelected(key);
    setBulkOpen(false);
    setExportOpen(false);
  }
  function addCard() {
    const addition = newCard(cards.length ? '' : firstTerm, cards.length ? '' : firstDefinition);
    setCards((items) => [...items, addition]);
    setFirstTerm('');
    setFirstDefinition('');
    selectCard(addition.key);
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
    const source = cards[index];
    if (!source) return;
    const copy = { ...source, id: undefined, key: crypto.randomUUID() };
    setCards((items) => [...items.slice(0, index + 1), copy, ...items.slice(index + 1)]);
    selectCard(copy.key);
  }
  function removeCard(key: string) {
    setSelected(cards[index + 1]?.key ?? cards[index - 1]?.key);
    focusForm.current = true;
    setCards((items) => items.filter((item) => item.key !== key));
  }
  function moveCard(source: string, target: string, after: boolean) {
    setCards((items) => {
      const byKey = new Map(items.map((item) => [item.key, item]));
      const order = moveCustomItemTo([...byKey.keys()], source, target, after);
      return order.every((key, i) => key === items[i]?.key)
        ? items
        : order.map((key) => byKey.get(key)!);
    });
  }
  async function deleteSet() {
    if (!window.confirm('Переместить набор в архив?')) return;
    if (!(await saveNow())) return;
    const { error } = await api.DELETE('/api/v1/sets/{set_id}', {
      params: { path: { set_id: setId } },
    });
    if (!error) {
      await queryClient.invalidateQueries({ queryKey: ['sets'], refetchType: 'none' });
      navigate('/sets');
    } else setSaveError('Не удалось переместить набор в архив.');
  }

  const displaySaveState =
    saveState === 'saved' && (firstPending || !sameSnapshot(snapshot, baseline.current))
      ? 'idle'
      : saveState;

  return (
    <article className="set-editor">
      <div className="editor-toolbar">
        <Link
          className="set-back"
          to={`/sets/${setId}`}
          onClick={async (e) => {
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            if (await saveNow()) navigate(`/sets/${setId}`);
          }}
        >
          ← К набору
        </Link>
        <div className="editor-actions">
          <SaveIndicator state={displaySaveState} />
          <Button onClick={() => void saveNow()}>Сохранить</Button>
        </div>
      </div>
      <header className="editor-heading">
        <h1 className="sr-only">Редактор набора</h1>
        <textarea
          className="editor-title"
          aria-label="Название набора"
          value={title}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
          rows={1}
          maxLength={160}
          placeholder="Название набора"
        />
        <textarea
          className="editor-description"
          aria-label="Описание набора"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={1}
          maxLength={5000}
          placeholder="Добавить описание"
        />
        <div className="editor-meta">
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
            label="Доступ к набору"
            value={visibility}
            onChange={(value) => setVisibility(value as Visibility)}
          >
            <option value="public">Публичный</option>
            <option value="unlisted" disabled={!canHide}>
              По ссылке · Plus и Pro
            </option>
            <option value="private" disabled={!canHide}>
              Только мне · Plus и Pro
            </option>
          </SelectField>
          <div className="editor-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setExportOpen((open) => !open);
                setBulkOpen(false);
              }}
            >
              {exportOpen ? 'Закрыть экспорт' : 'Экспорт'}
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                if (!bulkOpen && !(await saveNow())) return;
                setBulkMounted(true);
                setBulkOpen((open) => !open);
                setExportOpen(false);
              }}
            >
              {bulkOpen ? 'Закрыть импорт' : 'Импорт'}
            </Button>
          </div>
        </div>
        {saveError && (
          <p role="status" className="text-danger mt-3">
            {saveError}
          </p>
        )}
      </header>
      <div className="editor-spread">
        <aside className="editor-index" aria-label="Карточки набора">
          <div className="editor-index-head">
            <h2>
              Карточки <small>{cards.length}</small>
            </h2>
            <IconButton label="Добавить карточку" onClick={addCard}>
              ＋
            </IconButton>
          </div>
          {card ? (
            <EditorCardIndex
              cards={cards}
              selected={card}
              onSelect={selectCard}
              onMove={moveCard}
            />
          ) : (
            <p className="editor-empty-index">Список пока пуст</p>
          )}
        </aside>
        <section
          ref={workPanel}
          tabIndex={-1}
          aria-label="Редактирование карточки"
          className="editor-work"
        >
          {exportOpen && (
            <SetExport
              setId={setId}
              title={title || 'Набор'}
              canExport={
                !firstPending && saveState === 'saved' && sameSnapshot(snapshot, baseline.current)
              }
            />
          )}
          {bulkMounted && (
            <div hidden={!bulkOpen}>
              <BulkImport
                setId={setId}
                onCancel={() => setBulkOpen(false)}
                onAnkiImported={refreshImported}
                onImport={(imported) => {
                  const additions = imported.map((c) => newCard(c.term, c.definition));
                  if (firstPending) {
                    additions.unshift(newCard(firstTerm, firstDefinition));
                    setFirstTerm('');
                    setFirstDefinition('');
                  }
                  setCards((items) => [...items, ...additions]);
                  if (additions[0]) selectCard(additions[0].key);
                  setBulkOpen(false);
                }}
              />
            </div>
          )}
          {card ? (
            <div key={card.key} className="editor-card">
              <div className="editor-faces">
                <CardField
                  label="Термин"
                  value={card.term}
                  contentType={card.contentType}
                  imageId={card.termImageId}
                  onChange={(value) => updateCard(card.key, 'term', value)}
                  onImageChange={(value) =>
                    setCards((items) =>
                      items.map((item) =>
                        item.key === card.key ? { ...item, termImageId: value } : item,
                      ),
                    )
                  }
                />
                <CardField
                  label="Определение"
                  value={card.definition}
                  contentType={card.contentType}
                  imageId={card.definitionImageId}
                  onChange={(value) => updateCard(card.key, 'definition', value)}
                  onImageChange={(value) =>
                    setCards((items) =>
                      items.map((item) =>
                        item.key === card.key ? { ...item, definitionImageId: value } : item,
                      ),
                    )
                  }
                />
                <div className="editor-card-type">
                  <select
                    aria-label={`Тип содержимого карточки ${index + 1}`}
                    value={card.contentType}
                    onChange={(event) =>
                      setCardType(card.key, event.target.value as CardContentType)
                    }
                    className="border-border bg-surface-muted text-fg h-10 rounded-lg border px-3 text-sm"
                  >
                    <option value="text">Текст и формулы</option>
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
              </div>
              <WrongAnswersEditor
                term={card.term}
                definition={card.definition}
                wrongTermAnswers={card.wrongTermAnswers ?? []}
                wrongDefinitionAnswers={card.wrongDefinitionAnswers ?? []}
                alternatives={card.source?.alt_answers ?? []}
                onChange={(field, values) =>
                  setCards((items) =>
                    items.map((item) =>
                      item.key === card.key ? { ...item, [field]: values } : item,
                    ),
                  )
                }
              />
              <details className="editor-preview">
                <summary>Предпросмотр</summary>
                <div>
                  {(['term', 'definition'] as const).map((side) => (
                    <CardSide
                      key={side}
                      card={{
                        term: card.term,
                        definition: card.definition,
                        content_type: card.contentType,
                        code_language: card.codeLanguage,
                      }}
                      side={side}
                      imageId={side === 'term' ? card.termImageId : card.definitionImageId}
                    />
                  ))}
                </div>
              </details>
              <div className="editor-card-actions">
                <SaveIndicator state={displaySaveState} announce={false} />
                <IconButton label="Сохранить изменения" onClick={() => void saveNow()}>
                  <CourseIcon name="save" />
                </IconButton>
                <IconButton label="Дублировать" onClick={() => duplicateCard(index)}>
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.65"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="8" y="8" width="12" height="13" rx="2" />
                    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                  </svg>
                </IconButton>
                <IconButton label="Удалить" onClick={() => removeCard(card.key)}>
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.65"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
                  </svg>
                </IconButton>
              </div>
            </div>
          ) : (
            <div className="editor-first">
              <h2>Первая карточка</h2>
              <label>
                Термин
                <textarea
                  rows={2}
                  maxLength={10000}
                  value={firstTerm}
                  onChange={(e) => setFirstTerm(e.target.value)}
                  placeholder="Введите термин"
                />
              </label>
              <label>
                Определение
                <textarea
                  rows={2}
                  maxLength={10000}
                  value={firstDefinition}
                  onChange={(e) => setFirstDefinition(e.target.value)}
                  placeholder="Введите определение"
                />
              </label>
              <Button onClick={addCard}>Добавить карточку</Button>
            </div>
          )}
        </section>
      </div>
      <div className="editor-delete">
        <Button variant="danger" onClick={() => void deleteSet()}>
          Удалить набор
        </Button>
      </div>
    </article>
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
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-border bg-surface text-fg mt-1.5 h-11 w-full rounded-xl border px-3"
      >
        {children}
      </select>
    </label>
  );
}

type ExportFormat = 'txt' | 'csv' | 'anki' | 'pdf';

function SetExport({
  setId,
  title,
  canExport,
}: {
  setId: string;
  title: string;
  canExport: boolean;
}) {
  const [format, setFormat] = useState<ExportFormat>('txt');
  const [sideSeparator, setSideSeparator] = useState('\t');
  const [cardSeparator, setCardSeparator] = useState('\n');
  const [layout, setLayout] = useState<'double_sided' | 'foldable'>('double_sided');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  async function download() {
    setDownloading(true);
    setError('');
    const params = new URLSearchParams({ format });
    const suffix = format === 'anki' ? 'anki.txt' : format;
    if (format === 'txt') {
      params.set('side_separator', sideSeparator);
      params.set('card_separator', cardSeparator);
    }
    if (format === 'pdf') params.set('layout', layout);
    try {
      await downloadFile(
        `/api/v1/sets/${setId}/export?${params.toString()}`,
        `${safeFilename(title)}.${suffix}`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось скачать набор');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-primary-subtle mt-5 p-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <SelectField
          label="Формат"
          value={format}
          onChange={(value) => setFormat(value as ExportFormat)}
        >
          <option value="txt">TXT с разделителями</option>
          <option value="csv">CSV для Excel и таблиц</option>
          <option value="anki">Anki-совместимый TXT</option>
          <option value="pdf">PDF для печати</option>
        </SelectField>

        {format === 'txt' && (
          <div className="grid grid-cols-2 gap-3">
            <SeparatorField
              label="Между сторонами"
              value={sideSeparator}
              onChange={setSideSeparator}
              customDefault=" | "
            />
            <SeparatorField
              label="Между карточками"
              value={cardSeparator}
              onChange={setCardSeparator}
              customDefault="---"
            />
          </div>
        )}
        {format === 'pdf' && (
          <SelectField
            label="Раскладка PDF"
            value={layout}
            onChange={(value) => setLayout(value as typeof layout)}
          >
            <option value="double_sided">Двусторонняя печать</option>
            <option value="foldable">Карточки со сгибом</option>
          </SelectField>
        )}
        {(format === 'csv' || format === 'anki') && (
          <p className="text-fg-muted self-center text-sm">
            {format === 'csv'
              ? 'Заголовки и UTF-8 BOM уже добавлены.'
              : 'Переносы строк сохранятся при импорте в Anki.'}
          </p>
        )}

        <Button
          className="min-w-36"
          disabled={
            !canExport ||
            downloading ||
            (format === 'txt' &&
              (!sideSeparator || !cardSeparator || sideSeparator === cardSeparator))
          }
          onClick={() => void download()}
        >
          {downloading ? 'Готовим…' : 'Скачать'}
        </Button>
      </div>
      {!canExport && (
        <p className="text-fg-muted mt-3 text-sm" role="status">
          Дождитесь сохранения изменений перед экспортом.
        </p>
      )}
      {error && (
        <p className="text-danger mt-3 text-sm" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}

function SeparatorField({
  label,
  value,
  onChange,
  customDefault,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  customDefault: string;
}) {
  const presets = [
    ['\t', 'Табуляция'],
    ['\n', 'Новая строка'],
    [';', 'Точка с запятой'],
    [',', 'Запятая'],
  ] as const;
  const presetValues: readonly string[] = presets.map(([preset]) => preset);
  const custom = !presetValues.includes(value);
  return (
    <div>
      <SelectField
        label={label}
        value={custom ? '__custom__' : value}
        onChange={(next) => onChange(next === '__custom__' ? customDefault : next)}
      >
        {presets.map(([preset, name]) => (
          <option key={name} value={preset}>
            {name}
          </option>
        ))}
        <option value="__custom__">Свой разделитель</option>
      </SelectField>
      {custom && (
        <Input
          aria-label={`${label}: свой разделитель`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={10}
          className="mt-2 font-mono"
        />
      )}
    </div>
  );
}

function safeFilename(value: string): string {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .slice(0, 80) || 'Набор'
  );
}

function BulkImport({
  setId,
  onCancel,
  onImport,
  onAnkiImported,
}: {
  setId: string;
  onCancel: () => void;
  onImport: (cards: Array<{ term: string; definition: string }>) => void;
  onAnkiImported: () => Promise<void>;
}) {
  const [source, setSource] = useState('');
  const [options, setOptions] = useState<CardImportOptions>(defaultCardImportOptions);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [quizletOpen, setQuizletOpen] = useState(false);
  const [ankiState, setAnkiState] = useState<
    'idle' | 'uploading' | 'queued' | 'processing' | 'done' | 'failed'
  >('idle');
  const [ankiJob, setAnkiJob] = useState<ImportJobResponse | null>(null);
  const result = useMemo(() => parseCardImport(source, options), [source, options]);
  const ankiJobId = ankiJob?.id;
  const ankiJobStatus = ankiJob?.status;

  useEffect(() => {
    let active = true;
    void api
      .GET('/api/v1/imports/sets/{set_id}/jobs', { params: { path: { set_id: setId } } })
      .then(async (response) => {
        if (!active || response.error || !response.data?.[0]) return;
        const latest = response.data[0] as ImportJobResponse;
        setAnkiJob(latest);
        setAnkiState(latest.status === 'completed' ? 'done' : latest.status);
        if (latest.status === 'failed') setFileError(latest.error_message ?? 'Импорт не завершён');
        if (latest.status === 'completed') {
          try {
            await onAnkiImported();
          } catch {
            setFileError('Не удалось загрузить импортированные карточки. Откройте набор заново.');
          }
        }
      });
    return () => {
      active = false;
    };
  }, [setId, onAnkiImported]);

  useEffect(() => {
    if (!ankiJobId || (ankiJobStatus !== 'queued' && ankiJobStatus !== 'processing')) return;
    let active = true;
    const poll = async () => {
      const response = await api.GET('/api/v1/imports/jobs/{job_id}', {
        params: { path: { job_id: ankiJobId } },
      });
      if (!active || response.error || !response.data) return;
      const job = response.data as ImportJobResponse;
      setAnkiJob(job);
      if (job.status === 'completed') {
        setAnkiState('done');
        try {
          await onAnkiImported();
        } catch {
          setFileError('Не удалось загрузить импортированные карточки. Откройте набор заново.');
        }
      } else {
        setAnkiState(job.status);
        if (job.status === 'failed') setFileError(job.error_message ?? 'Импорт не завершён');
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [ankiJobId, ankiJobStatus, onAnkiImported]);
  return (
    <Card className="mt-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Вставьте карточки</h3>
          <p className="text-fg-muted mt-1 text-sm">
            Вставьте экспорт Quizlet, CSV или TSV. Разделители определятся автоматически, кавычки и
            переносы внутри полей сохранятся.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setQuizletOpen(true)}>
            Перенести из Quizlet
          </Button>
          <button
            type="button"
            className="text-fg-muted hover:text-fg h-11 px-2"
            onClick={onCancel}
          >
            Закрыть
          </button>
        </div>
      </div>
      {quizletOpen ? (
        <QuizletWizard
          source={source}
          onSourceChange={(value) => {
            setSource(value);
            setOptions(defaultCardImportOptions);
          }}
          onBack={() => setQuizletOpen(false)}
          onImport={onImport}
        />
      ) : (
        <>
          <textarea
            autoFocus
            value={source}
            onChange={(event) => setSource(event.target.value)}
            rows={8}
            className="border-border bg-surface-muted text-fg mt-4 w-full resize-y rounded-xl border px-4 py-3 font-mono text-sm"
            placeholder={'memory\tпамять\nlearn\tучиться'}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="border-border text-fg hover:bg-surface-muted inline-flex min-h-11 cursor-pointer items-center rounded-xl border px-4 py-2 text-sm font-medium">
              Выбрать CSV или TSV
              <input
                type="file"
                accept=".csv,.tsv,text/csv,text/tab-separated-values"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setFileError('');
                  void file
                    .text()
                    .then((text) => {
                      setSource(text);
                      setFileName(file.name);
                      setOptions(defaultCardImportOptions);
                    })
                    .catch(() =>
                      setFileError('Не удалось прочитать файл. Попробуйте сохранить его в UTF-8.'),
                    );
                }}
              />
            </label>
            {fileName && <span className="text-fg-muted text-sm">{fileName}</span>}
            {fileError && (
              <span role="alert" className="text-danger text-sm">
                {fileError}
              </span>
            )}
          </div>
          <div className="border-border mt-4 border-t pt-4">
            <p className="text-sm font-medium">Или импортируйте файл Anki</p>
            <p className="text-fg-muted mt-1 text-sm">
              Поддерживаются .apkg и экспортированный из Anki .txt. Изображения из APKG добавятся к
              карточкам автоматически.
            </p>
            <label className="border-border text-fg hover:bg-surface-muted mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-xl border px-4 py-2 text-sm font-medium">
              {ankiState === 'uploading' ? 'Загружаем…' : 'Выбрать файл Anki'}
              <input
                type="file"
                accept=".apkg,.txt"
                disabled={['uploading', 'queued', 'processing'].includes(ankiState)}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setFileError('');
                  setAnkiJob(null);
                  setAnkiState('uploading');
                  void uploadBinary<ImportJobResponse>(
                    `/api/v1/imports/sets/${setId}/anki/jobs?filename=${encodeURIComponent(file.name)}`,
                    file,
                  )
                    .then((job) => {
                      setAnkiJob(job);
                      setAnkiState('queued');
                    })
                    .catch((error: unknown) => {
                      setFileError(
                        error instanceof Error ? error.message : 'Не удалось импортировать файл',
                      );
                      setAnkiState('idle');
                    });
                }}
              />
            </label>
            {ankiJob && ['queued', 'processing'].includes(ankiJob.status) && (
              <div
                role="status"
                aria-live="polite"
                className="bg-primary-subtle mt-3 rounded-xl p-3"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {ankiJob.status === 'queued' ? 'Ожидает обработки' : 'Импортируем карточки'}
                  </span>
                  <span className="font-medium">{ankiJob.progress}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Прогресс импорта Anki"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={ankiJob.progress}
                  className="bg-surface mt-2 h-2 overflow-hidden rounded-full"
                >
                  <div
                    className="bg-primary h-full rounded-full transition-[width]"
                    style={{ width: `${ankiJob.progress}%` }}
                  />
                </div>
                <p className="text-fg-muted mt-2 text-xs">
                  Окно импорта можно закрыть — задача продолжится в фоне.
                </p>
              </div>
            )}
            {ankiJob?.status === 'completed' && ankiJob.result && (
              <div role="status" className="bg-success-subtle mt-3 rounded-xl px-3 py-2 text-sm">
                Добавлено карточек: {numberResult(ankiJob.result, 'imported_cards')}, изображений:{' '}
                {numberResult(ankiJob.result, 'imported_images')}.
                {(numberResult(ankiJob.result, 'skipped_notes') > 0 ||
                  numberResult(ankiJob.result, 'skipped_media') > 0) && (
                  <span className="text-fg-muted">
                    {' '}
                    Пропущено заметок: {numberResult(ankiJob.result, 'skipped_notes')}, медиа:{' '}
                    {numberResult(ankiJob.result, 'skipped_media')}.
                  </span>
                )}
                {stringListResult(ankiJob.result, 'warnings').map((warning) => (
                  <p key={warning} className="text-fg-muted mt-1">
                    {warning}
                  </p>
                ))}
                {ankiJob.errors.slice(0, 5).map((error, index) => (
                  <p key={`${error.row}-${index}`} className="text-fg-muted mt-1">
                    {error.row ? `Строка ${error.row}: ` : ''}
                    {error.message}
                  </p>
                ))}
                {ankiJob.errors.length > 5 && (
                  <p className="text-fg-muted mt-1">Ещё ошибок: {ankiJob.errors.length - 5}</p>
                )}
              </div>
            )}
          </div>
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
                <option value="auto">Определить автоматически</option>
                <option value="tab">Табуляция</option>
                <option value="comma">Запятая</option>
                <option value="semicolon">Точка с запятой</option>
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
                <option value="auto">Определить автоматически</option>
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
          {(fileName || result.columns.length > 2) && result.columns.length >= 2 && (
            <div className="bg-surface-muted mt-4 rounded-xl p-4">
              <p className="text-sm font-medium">Сопоставление колонок</p>
              <p className="text-fg-muted mt-1 text-sm">
                Выберите, из каких колонок взять стороны карточки.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Термин"
                  value={String(options.termColumn ?? 0)}
                  onChange={(value) => setOptions({ ...options, termColumn: Number(value) })}
                >
                  {result.columns.map((sample, index) => (
                    <option key={index} value={index}>
                      {columnLabel(index, sample)}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Определение"
                  value={String(options.definitionColumn ?? 1)}
                  onChange={(value) => setOptions({ ...options, definitionColumn: Number(value) })}
                >
                  {result.columns.map((sample, index) => (
                    <option key={index} value={index}>
                      {columnLabel(index, sample)}
                    </option>
                  ))}
                </SelectField>
              </div>
              <label className="text-fg mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={options.skipFirstRow ?? false}
                  onChange={(event) =>
                    setOptions({ ...options, skipFirstRow: event.target.checked })
                  }
                  className="h-5 w-5 rounded"
                />
                Первая строка содержит названия колонок
              </label>
            </div>
          )}
          <div className="border-border mt-5 border-t pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">
                Предпросмотр: {result.cards.length} карточек
                {result.skipped > 0 ? `, пропущено строк: ${result.skipped}` : ''}
              </p>
              {(options.sideSeparator === 'auto' || options.cardSeparator === 'auto') && source && (
                <p className="text-fg-subtle text-xs">
                  Формат: {separatorLabel(result.detected.sideSeparator)} между сторонами,{' '}
                  {separatorLabel(result.detected.cardSeparator)} между карточками
                </p>
              )}
            </div>
            {result.issues.length > 0 && (
              <div
                role="status"
                className="bg-warning-subtle text-fg mt-3 rounded-xl px-3 py-2 text-sm"
              >
                {result.issues.slice(0, 3).map((issue) => (
                  <p key={`${issue.row}-${issue.message}`}>
                    Строка {issue.row}: {issue.message}
                  </p>
                ))}
                {result.issues.length > 3 && (
                  <p className="text-fg-muted mt-1">Ещё ошибок: {result.issues.length - 3}</p>
                )}
              </div>
            )}
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
        </>
      )}
    </Card>
  );
}

function QuizletWizard({
  source,
  onSourceChange,
  onBack,
  onImport,
}: {
  source: string;
  onSourceChange: (value: string) => void;
  onBack: () => void;
  onImport: (cards: Array<{ term: string; definition: string }>) => void;
}) {
  const [step, setStep] = useState(1);
  const result = useMemo(() => parseCardImport(source), [source]);
  const steps = ['Откройте набор', 'Скопируйте экспорт', 'Вставьте карточки'];

  return (
    <section aria-labelledby="quizlet-import-title" className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-primary text-xs font-semibold uppercase tracking-wide">
            Перенос из Quizlet
          </p>
          <h4 id="quizlet-import-title" className="mt-1 text-lg font-semibold">
            {steps[step - 1]}
          </h4>
        </div>
        <button
          type="button"
          className="text-fg-muted hover:text-fg min-h-11 px-2 text-sm"
          onClick={onBack}
        >
          К обычному импорту
        </button>
      </div>

      <ol aria-label="Шаги переноса" className="mt-5 grid grid-cols-3 gap-2">
        {steps.map((label, index) => {
          const number = index + 1;
          const current = number === step;
          const complete = number < step;
          return (
            <li key={label} aria-current={current ? 'step' : undefined}>
              <button
                type="button"
                onClick={() => setStep(number)}
                className={`min-h-11 w-full rounded-xl px-2 py-2 text-left text-xs sm:text-sm ${
                  current
                    ? 'bg-primary-subtle text-primary font-medium'
                    : complete
                      ? 'bg-success-subtle text-fg'
                      : 'bg-surface-muted text-fg-muted'
                }`}
              >
                <span className="mr-1 font-semibold">{complete ? '✓' : number}.</span> {label}
              </button>
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <div className="mt-5 grid items-center gap-5 md:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="leading-relaxed">
              Войдите в Quizlet с компьютера и откройте набор, который создали сами. Экспорт в
              мобильном приложении и для чужих наборов недоступен.
            </p>
            <a
              href="https://quizlet.com/latest"
              target="_blank"
              rel="noreferrer"
              className="border-border text-fg hover:bg-surface-muted mt-4 inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-medium"
            >
              Открыть Quizlet в новой вкладке ↗
            </a>
          </div>
          <QuizletGuideVisual kind="set" />
        </div>
      )}

      {step === 2 && (
        <div className="mt-5 grid items-center gap-5 md:grid-cols-[1fr_1.1fr]">
          <div className="space-y-3 leading-relaxed">
            <p>Откройте меню «Ещё» с тремя точками и выберите «Экспорт».</p>
            <p>
              Оставьте табуляцию между термином и определением, новую строку — между карточками.
              Затем нажмите «Копировать текст».
            </p>
            <p className="bg-warning-subtle rounded-xl p-3 text-sm">
              Если пункта «Экспорт» нет, проверьте, что набор ваш и открыт в веб-версии Quizlet.
            </p>
          </div>
          <QuizletGuideVisual kind="export" />
        </div>
      )}

      {step === 3 && (
        <div className="mt-5">
          <label className="text-sm font-medium" htmlFor="quizlet-import-source">
            Текст из Quizlet
          </label>
          <textarea
            id="quizlet-import-source"
            autoFocus
            value={source}
            onChange={(event) => onSourceChange(event.target.value)}
            rows={8}
            className="border-border bg-surface-muted text-fg mt-2 w-full resize-y rounded-xl border px-4 py-3 font-mono text-sm"
            placeholder={'memory\tпамять\nlearn\tучиться'}
          />
          <div
            aria-live="polite"
            className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <p className="font-medium">Распознано карточек: {result.cards.length}</p>
            {result.skipped > 0 && (
              <p className="text-warning">Нужно проверить строк: {result.skipped}</p>
            )}
          </div>
          <div className="mt-3 max-h-48 space-y-2 overflow-auto">
            {result.cards.slice(0, 8).map((card, index) => (
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
      )}

      <div className="border-border mt-6 flex flex-wrap justify-between gap-3 border-t pt-4">
        <Button variant="ghost" disabled={step === 1} onClick={() => setStep((value) => value - 1)}>
          Назад
        </Button>
        {step < 3 ? (
          <Button onClick={() => setStep((value) => value + 1)}>Дальше</Button>
        ) : (
          <Button disabled={result.cards.length === 0} onClick={() => onImport(result.cards)}>
            Добавить {result.cards.length || ''}
          </Button>
        )}
      </div>
    </section>
  );
}

function QuizletGuideVisual({ kind }: { kind: 'set' | 'export' }) {
  return (
    <div
      role="img"
      aria-label={
        kind === 'set'
          ? 'Схема страницы набора Quizlet с меню из трёх точек'
          : 'Схема окна экспорта с кнопкой копирования текста'
      }
      className="border-border bg-surface-muted overflow-hidden rounded-2xl border p-3 shadow-sm"
    >
      <div className="bg-surface border-border rounded-xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="bg-border h-2.5 w-24 rounded-full" />
            <div className="bg-surface-muted h-2 w-36 rounded-full" />
          </div>
          <div className="border-primary bg-primary-subtle text-primary flex h-11 w-11 items-center justify-center rounded-xl border text-xl font-bold">
            ···
          </div>
        </div>
        {kind === 'set' ? (
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="bg-surface-muted h-14 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="border-border bg-surface mt-4 rounded-xl border p-3 shadow-sm">
            <div className="text-fg text-sm font-semibold">Экспорт</div>
            <div className="bg-surface-muted mt-3 space-y-2 rounded-lg p-3">
              <div className="bg-border h-2 w-4/5 rounded-full" />
              <div className="bg-border h-2 w-3/5 rounded-full" />
              <div className="bg-border h-2 w-2/3 rounded-full" />
            </div>
            <div className="bg-primary text-primary-fg mt-3 flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-medium">
              Копировать текст
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function separatorLabel(separator: string): string {
  if (separator === 'tab') return 'табуляция';
  if (separator === 'comma') return 'запятая';
  if (separator === 'semicolon') return 'точка с запятой';
  if (separator === 'newline') return 'новая строка';
  return 'свой разделитель';
}

function columnLabel(index: number, sample: string): string {
  const compact = sample.replace(/\s+/g, ' ').slice(0, 36);
  return compact ? `Колонка ${index + 1} — ${compact}` : `Колонка ${index + 1}`;
}

interface ImportJobResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  result: Record<string, unknown> | null;
  errors: Array<{ row: number | null; message: string }>;
  error_message: string | null;
}

function numberResult(result: Record<string, unknown>, key: string): number {
  return typeof result[key] === 'number' ? result[key] : 0;
}

function stringListResult(result: Record<string, unknown>, key: string): string[] {
  return Array.isArray(result[key])
    ? result[key].filter((value): value is string => typeof value === 'string')
    : [];
}

function CardField({
  label,
  value,
  contentType,
  imageId,
  onChange,
  onImageChange,
}: {
  label: string;
  value: string;
  contentType: CardContentType;
  imageId: string | null;
  onChange: (value: string) => void;
  onImageChange: (value: string | null) => void;
}) {
  const id = useId();
  return (
    <div className="editor-field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        maxLength={10000}
        placeholder={fieldPlaceholder(label, contentType)}
      />
      <ImageUpload imageId={imageId} label={label} onChange={onImageChange} />
    </div>
  );
}

function ImageUpload({
  imageId,
  label,
  onChange,
}: {
  imageId: string | null;
  label: string;
  onChange: (value: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const image = useQuery({
    queryKey: ['media', imageId],
    enabled: Boolean(imageId),
    queryFn: async () => {
      const { data, error: apiError } = await api.GET('/api/v1/media/{asset_id}', {
        params: { path: { asset_id: imageId! } },
      });
      if (apiError || !data) throw new Error();
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });

  async function upload(file: File) {
    setUploading(true);
    setError('');
    try {
      const ticket = await api.POST('/api/v1/media/upload-url', {
        body: { filename: file.name, mime: file.type, size_bytes: file.size },
      });
      if (ticket.error || !ticket.data) throw new Error();
      const uploaded = await fetch(ticket.data.upload_url, {
        method: ticket.data.method,
        headers: ticket.data.headers,
        body: file,
      });
      if (!uploaded.ok) throw new Error();
      const completed = await api.POST('/api/v1/media/{asset_id}/complete', {
        params: { path: { asset_id: ticket.data.id } },
      });
      if (completed.error || !completed.data) throw new Error();
      onChange(completed.data.id);
    } catch {
      setError('Не удалось загрузить изображение');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-3 normal-case tracking-normal">
      {image.data?.download_url && (
        <img
          src={image.data.download_url}
          alt={`Изображение: ${label.toLowerCase()}`}
          className="border-border bg-surface mb-3 max-h-48 w-full rounded-xl border object-contain"
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="border-border text-fg hover:bg-surface-muted inline-flex h-11 cursor-pointer items-center rounded-xl border px-4 text-sm font-medium">
          {uploading ? 'Загружаем…' : imageId ? 'Заменить изображение' : '＋ Изображение'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = '';
            }}
          />
        </label>
        {imageId && (
          <button
            type="button"
            className="text-danger hover:bg-danger-soft h-11 rounded-xl px-3 text-sm"
            onClick={() => onChange(null)}
          >
            Убрать
          </button>
        )}
      </div>
      {error && <p className="text-danger mt-2 text-sm">{error}</p>}
    </div>
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
}: { label: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="text-fg-muted hover:bg-surface-muted hover:text-fg grid h-11 w-11 place-items-center rounded-lg disabled:opacity-30"
      {...props}
    >
      {children}
    </button>
  );
}
function SaveIndicator({ state, announce = true }: { state: SaveState; announce?: boolean }) {
  const labels: Record<SaveState, string> = {
    idle: 'Есть изменения',
    saving: 'Сохраняем…',
    saved: 'Сохранено',
    error: 'Ошибка сохранения',
  };
  return (
    <span
      className={`text-sm ${state === 'error' ? 'text-danger' : state === 'saved' ? 'text-success' : 'text-fg-muted'}`}
      role={announce ? 'status' : undefined}
    >
      {labels[state]}
    </span>
  );
}
