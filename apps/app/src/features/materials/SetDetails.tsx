import { pluralWithCount } from '@remora/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SavedSetSource } from '../library/SavedMaterialSource';
import { MaterialDescription } from './MaterialDescription';
import { SetCardBrowser } from './SetCardBrowser';
import { PrintMenu } from '../study/PrintMenu';
import { ResetProgress } from '../study/ResetProgress';
import { SetStudyPanel } from '../study/SetStudyPanel';
import { api } from '../../lib/api';
import type { components } from '@remora/api-client';
import { setDetailQuery } from './set-queries';
import './set-detail.css';

const WEB_URL = import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000';

export function SetDetails({
  setId,
  librarySource,
}: {
  setId: string;
  librarySource?: components['schemas']['SavedSetItem'] | null;
}) {
  const inLibrary = librarySource !== undefined;
  const Heading = inLibrary ? 'h2' : 'h1';
  const [more, setMore] = useState(false);
  const query = useQuery(setDetailQuery(setId));
  const savedSets = useQuery({
    queryKey: ['library', 'sets'],
    enabled: !inLibrary && query.data?.can_edit === false,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/library/sets');
      if (!data || error) throw new Error('Не удалось загрузить сохранённые наборы.');
      return data;
    },
  });
  const source = librarySource ?? savedSets.data?.find((entry) => entry.id === setId);
  if (query.isPending) return <p role="status">Загружаем набор…</p>;
  if (!query.data)
    return (
      <div role="alert">
        <p>Не удалось открыть набор.</p>
        <button className="set-tool mt-3" onClick={() => void query.refetch()}>
          Повторить загрузку
        </button>
      </div>
    );
  const set = query.data;
  const editable = set.can_edit && !librarySource;
  return (
    <article className="set-detail">
      <div className="set-toolbar">
        {inLibrary ? (
          <Link to={`/sets/${setId}`} className="set-back">
            Открыть страницу набора <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <Link to="/sets" className="set-back">
            <span aria-hidden="true">←</span> Мои наборы
          </Link>
        )}
        <div className="set-header-actions">
          {set.visibility !== 'private' && (
            <a
              className="set-icon"
              href={`${WEB_URL}/nabor/${set.slug}`}
              target="_blank"
              rel="noreferrer"
              title="Открыть публичную страницу"
              aria-label="Открыть публичную страницу"
            >
              <SetIcon kind="open" />
            </a>
          )}
          {editable && (
            <Link
              className="set-icon"
              to={`/sets/${set.id}/edit`}
              title="Редактировать набор"
              aria-label="Редактировать набор"
            >
              <SetIcon kind="edit" />
            </Link>
          )}
          <button
            type="button"
            className="set-icon"
            aria-label="Другие действия"
            title="Другие действия"
            aria-expanded={more}
            aria-controls="set-more"
            onClick={() => setMore(!more)}
          >
            <span aria-hidden="true">•••</span>
          </button>
        </div>
      </div>
      <div id="set-more" className="set-options" hidden={!more}>
        <PrintMenu setId={setId} disabled={!set.cards_count} />
        <ResetProgress setId={setId} disabled={!set.cards_count} />
      </div>
      <header className="set-heading">
        <div className="set-meta">
          <span>
            <SetIcon kind="visibility" />
            {set.visibility === 'private'
              ? 'Приватный'
              : set.visibility === 'public'
                ? 'Публичный'
                : 'По ссылке'}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <SetIcon kind="cards" />
            {pluralWithCount(set.cards_count, ['карточка', 'карточки', 'карточек'])}
          </span>
        </div>
        <Heading className="set-title">{set.title}</Heading>
        <MaterialDescription description={set.description} />
        {source && <SavedSetSource set={source} />}
      </header>
      <SetStudyPanel setId={set.id} cardsCount={set.cards_count} />
      <SetCardBrowser set={set} editable={editable} />
    </article>
  );
}

function SetIcon({ kind }: { kind: 'open' | 'edit' | 'visibility' | 'cards' }) {
  const paths = {
    open: 'M14 4h6v6m0-6-9 9m0-8H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5',
    edit: 'm5 15 11-11a2 2 0 0 1 4 4L9 19l-5 1 1-5Zm9-9 4 4',
    visibility:
      'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    cards: 'M3 8h14v12H3z M7 4h14v12',
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
