import { pluralWithCount } from '@remora/core';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { CardSide } from './CardSide';
import {
  CardChangeDialog,
  type CardChange,
  type SetCard,
  type SetDetail,
} from './CardChangeDialog';
import cardsImage from '../../../../web/public/lecture-demo/pricing-cards.webp';
import pencilImage from '../../../../web/public/lecture-demo/create-pencil.webp';
import testImage from '../../../../web/public/lecture-demo/news-test.webp';
import './set-cards.css';

const PAGE_SIZE = 12;
const modes = [
  { path: 'flashcards', title: 'Карточки', description: 'Листать и запоминать', image: cardsImage },
  { path: 'write', title: 'Письмо', description: 'Отвечать по памяти', image: pencilImage },
  { path: 'test', title: 'Тест', description: 'Проверить знания', image: testImage },
];

export function SetModes({ setId }: { setId: string }) {
  return (
    <section className="set-block">
      <h3>Режимы обучения</h3>
      <div className="set-mode-grid">
        {modes.map((mode) => (
          <Link key={mode.path} to={`/sets/${setId}/${mode.path}`}>
            <img src={mode.image} width="52" height="50" alt="" />
            <span>
              <b>{mode.title}</b>
              <small>{mode.description}</small>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Face({ card, side }: { card: SetCard; side: 'term' | 'definition' }) {
  return (
    <CardSide
      value={card[side]}
      type={card.content_type}
      codeLanguage={card.code_language}
      imageId={side === 'term' ? card.term_image_id : card.definition_image_id}
      imageAlt={side === 'term' ? 'Иллюстрация термина' : 'Иллюстрация определения'}
    />
  );
}

function AddCardButton({ onClick }: { onClick: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  return (
    <span className="material-action" onPointerEnter={() => setDismissed(false)}>
      <button
        type="button"
        className="set-add"
        aria-label="Добавить карточку"
        onFocus={() => setDismissed(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setDismissed(true);
        }}
        onClick={onClick}
      >
        <span aria-hidden="true">+</span>
      </button>
      <span className="material-action-tip" aria-hidden="true" hidden={dismissed}>
        Добавить карточку
      </span>
    </span>
  );
}

function CardPagination({
  page,
  lastPage,
  onChange,
}: {
  page: number;
  lastPage: number;
  onChange: (page: number) => void;
}) {
  if (lastPage === 0) return null;
  const middle = Math.max(1, Math.min(page, lastPage - 1));
  const pages =
    lastPage < 5
      ? Array.from({ length: lastPage + 1 }, (_, i) => i)
      : [...new Set([0, middle - 1, middle, middle + 1, lastPage])];
  return (
    <nav className="set-pagination" aria-label="Страницы состава набора">
      <button
        type="button"
        className="set-page-arrow"
        aria-label="Предыдущая страница"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        ‹
      </button>
      {pages.map((number, index) => (
        <Fragment key={number}>
          {index > 0 && number - pages[index - 1]! > 1 && <span aria-hidden="true">…</span>}
          <button
            type="button"
            aria-label={`Страница ${number + 1}`}
            aria-current={number === page ? 'page' : undefined}
            onClick={() => onChange(number)}
          >
            {number + 1}
          </button>
        </Fragment>
      ))}
      <button
        type="button"
        className="set-page-arrow"
        aria-label="Следующая страница"
        disabled={page === lastPage}
        onClick={() => onChange(page + 1)}
      >
        ›
      </button>
    </nav>
  );
}

function RowIcon({ kind }: { kind: 'edit' | 'delete' }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d={
          kind === 'edit'
            ? 'm15 4 5 5M4 20l4.4-1 12-12a1.6 1.6 0 0 0 0-2.3l-1.1-1.1a1.6 1.6 0 0 0-2.3 0l-12 12L4 20Z'
            : 'M4 6.5h16M9 6.5V4h6v2.5M6 6.5l1 13h10l1-13M10 10v6m4-6v6'
        }
      />
    </svg>
  );
}

export function SetCardBrowser({ setId, owned }: { setId: string; owned: boolean }) {
  const query = useQuery({
    queryKey: ['sets', setId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/sets/{set_id}', {
        params: { path: { set_id: setId } },
      });
      if (!data || error) throw new Error('Не удалось загрузить карточки.');
      return data;
    },
  });
  const heading = useRef<HTMLHeadingElement>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [dialog, setDialog] = useState<{ snapshot: SetDetail; change: CardChange } | null>(null);
  if (!query.data)
    return (
      <section className="set-block">
        <h3>Состав набора</h3>
        {query.isError ? (
          <>
            <p role="alert">{query.error.message}</p>
            <button className="set-tool" onClick={() => void query.refetch()}>
              Повторить загрузку
            </button>
          </>
        ) : (
          <p>Загружаем карточки…</p>
        )}
      </section>
    );
  const set = query.data;
  const needle = search.trim().toLocaleLowerCase('ru');
  const filtered = set.cards.filter(
    (c) =>
      !needle || [c.term, c.definition].some((s) => s.toLocaleLowerCase('ru').includes(needle)),
  );
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);
  const editable = owned && set.can_edit;
  function open(change: CardChange) {
    setDialog({ snapshot: set, change });
  }
  return (
    <>
      <section className="set-block set-contents">
        <header className="set-block-head">
          <h3 ref={heading} tabIndex={-1}>
            Состав набора{' '}
            <small>{pluralWithCount(set.cards.length, ['карточка', 'карточки', 'карточек'])}</small>
          </h3>
          <div className="set-tools">
            <label className="set-card-search">
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <circle cx="10" cy="10" r="6.5" />
                <path d="m15 15 5 5" />
              </svg>
              <input
                type="search"
                aria-label="Поиск по карточкам набора"
                placeholder="Найти термин в наборе"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            {editable && <AddCardButton onClick={() => open({ kind: 'add' })} />}
          </div>
        </header>
        {rows.length ? (
          <table className="set-table">
            <thead>
              <tr>
                <th>Термин</th>
                <th>Определение</th>
                {editable && (
                  <th>
                    <span className="sr-only">Действия</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((card) => (
                <tr key={card.id}>
                  <td>
                    <Face card={card} side="term" />
                  </td>
                  <td>
                    <Face card={card} side="definition" />
                  </td>
                  {editable && (
                    <td>
                      <div className="set-row-tools">
                        {(['edit', 'delete'] as const).map((kind) => {
                          const label = kind === 'edit' ? 'Редактировать' : 'Удалить';
                          return (
                            <button
                              key={kind}
                              title={label}
                              aria-label={`${label} карточку «${card.term}»`}
                              onClick={() => open({ kind, card })}
                            >
                              <RowIcon kind={kind} />
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-fg-muted">
            {set.cards.length ? 'По этому запросу карточек нет.' : 'В наборе пока нет карточек.'}
          </p>
        )}
        {filtered.length > 0 && (
          <footer className="set-block-head set-pages">
            <small aria-live="polite">
              {start + 1}–{start + rows.length} из {filtered.length}
            </small>
            <CardPagination
              page={currentPage}
              lastPage={lastPage}
              onChange={(nextPage) => {
                setPage(nextPage);
                heading.current?.focus();
              }}
            />
          </footer>
        )}
      </section>
      {dialog && (
        <CardChangeDialog
          {...dialog}
          onClose={() => setDialog(null)}
          onSaved={(result) => {
            if (dialog.change.kind === 'add') {
              setSearch('');
              setPage(Math.floor((result.cards.length - 1) / PAGE_SIZE));
            } else setPage(currentPage);
            setDialog(null);
          }}
        />
      )}
    </>
  );
}
