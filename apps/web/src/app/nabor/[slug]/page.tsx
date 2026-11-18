import { PublicAnalytics } from '../../../components/analytics/PublicAnalytics';
import { PublicHeader } from '../../../components/landing/PublicHeader';
import { PublicCardTable } from './PublicCardTable';
import { PublicSetCabinetLink } from './PublicSetCabinetLink';
import './public-set.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { PublicCardContent } from './PublicCardContent';
import { cache } from 'react';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8000';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5173';

type PublicCard = {
  id: string;
  term: string;
  definition: string;
  term_transcription: string | null;
  definition_transcription: string | null;
  hint: string | null;
  content_type: 'text' | 'latex' | 'code';
  code_language: string | null;
  term_image_url: string | null;
  definition_image_url: string | null;
};

type PublicSet = {
  course_url?: string | null;
  id: string;
  title: string;
  description: string;
  visibility: 'unlisted' | 'public';
  slug: string;
  cards_count: number;
  author: { username: string; display_name: string | null; avatar_url: string | null };
  cards: PublicCard[];
  updated_at: string;
};

const loadSet = cache(async (slug: string): Promise<PublicSet | null> => {
  // Параметр маршрута может прийти percent-encoded: не кодируем кириллицу повторно.
  try {
    slug = decodeURIComponent(slug);
  } catch {
    return null;
  }
  const response = await fetch(`${API_URL}/api/v1/sets/public/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Public set API returned ${response.status}`);
  return (await response.json()) as PublicSet;
});

async function hasAuthorProfile(username: string): Promise<boolean> {
  try {
    // Профиль автора доступен не для каждого самостоятельного набора.
    const response = await fetch(`${API_URL}/api/v1/authors/${encodeURIComponent(username)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const set = await loadSet(slug);
  if (!set) return { title: 'Набор не найден' };
  if (set.course_url)
    return { title: set.title, alternates: { canonical: set.course_url.split('#')[0] } };
  const description =
    set.description || `Набор «${set.title}»: ${set.cards_count} карточек для запоминания.`;
  return {
    title: set.title,
    description,
    robots:
      set.visibility === 'public' ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: `/nabor/${set.slug}` },
    openGraph: { title: set.title, description, type: 'article' },
  };
}

export default async function PublicSetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const set = await loadSet(slug);
  if (!set) notFound();
  if (set.course_url) permanentRedirect(set.course_url);
  const authorName = set.author.display_name || `@${set.author.username}`;
  const authorProfileAvailable = await hasAuthorProfile(set.author.username);
  const authorContent = (
    <>
      <AuthorAvatar name={authorName} avatarUrl={set.author.avatar_url} />
      <span>
        <span className="ps-author-label">Автор набора</span>
        <span className="ps-author-name">{authorName}</span>
      </span>
    </>
  );

  return (
    <>
      <a className="ps-skip" href="#cards-heading">
        К карточкам
      </a>
      <PublicHeader />
      <main className="public-set-page">
        {set.visibility === 'public' && (
          <PublicAnalytics path={`/nabor/${encodeURIComponent(set.slug)}`} />
        )}
        <header className="ps-cover">
          <div className="ps-width ps-cover-grid">
            <div className="ps-heading">
              <p className="ps-eyebrow">Набор карточек</p>
              <h1>{set.title}</h1>
              {set.description && <p className="ps-description">{set.description}</p>}
              {authorProfileAvailable ? (
                <Link
                  className="ps-author"
                  href={`/avtor/${encodeURIComponent(set.author.username)}`}
                >
                  {authorContent}
                </Link>
              ) : (
                <div className="ps-author">{authorContent}</div>
              )}
            </div>
            <aside className="ps-summary" aria-label="О наборе">
              <p className="ps-count">{formatCardCount(set.cards_count)}</p>
              <p className="ps-visibility">
                {set.visibility === 'public' ? 'Публичный набор' : 'Доступ по ссылке'}
              </p>
              <p className="ps-summary-note">
                {set.cards_count > 0
                  ? 'Термины и определения можно читать без входа.'
                  : 'Автор ещё не добавил карточки в этот набор.'}
              </p>
              {set.cards.length > 0 ? (
                <a href="#cards-heading" className="ps-primary">
                  Смотреть карточки <span aria-hidden="true">↓</span>
                </a>
              ) : (
                <Link href="/kursy" className="ps-primary">
                  Выбрать курс
                </Link>
              )}
              <PublicSetCabinetLink setId={set.id} appUrl={APP_URL} />
            </aside>
          </div>
        </header>
        <section aria-labelledby="cards-heading" className="ps-width ps-content">
          <div className="ps-section-heading">
            <h2 id="cards-heading" tabIndex={-1}>
              Карточки набора
            </h2>
            <p>
              {set.cards_count > set.cards.length
                ? `Показаны первые ${set.cards.length} из ${set.cards_count}`
                : formatCardCount(set.cards_count)}
            </p>
          </div>
          {set.cards.length > 0 ? (
            <PublicCardTable>
              <ol className="ps-cards">
                {set.cards.map((card, index) => (
                  <li key={card.id} className="ps-card">
                    <span className="ps-card-number" aria-label={`Карточка ${index + 1}`}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <CardSide card={card} side="term" />
                    <CardSide card={card} side="definition" />
                  </li>
                ))}
              </ol>
            </PublicCardTable>
          ) : (
            <div className="ps-empty">
              <h3>Карточек пока нет</h3>
              <p>Здесь появятся термины и определения, когда автор добавит их в набор.</p>
              <Link href="/kursy">
                Посмотреть курсы в каталоге <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}
          <footer className="ps-footer">
            {authorProfileAvailable && (
              <Link href={`/avtor/${encodeURIComponent(set.author.username)}`}>
                Другие материалы автора <span aria-hidden="true">→</span>
              </Link>
            )}
            <Link href="/kursy">Каталог курсов</Link>
          </footer>
        </section>
      </main>
    </>
  );
}

function CardSide({ card, side }: { card: PublicCard; side: 'term' | 'definition' }) {
  const isTerm = side === 'term';
  const value = isTerm ? card.term : card.definition;
  const transcription = isTerm ? card.term_transcription : card.definition_transcription;
  const imageUrl = isTerm ? card.term_image_url : card.definition_image_url;
  return (
    <div
      className={`ps-side ps-side-${side}`}
      role="group"
      aria-label={isTerm ? 'Термин' : 'Определение'}
    >
      <p className="ps-side-label">{isTerm ? 'Термин' : 'Определение'}</p>
      <PublicCardContent
        value={value}
        type={card.content_type}
        codeLanguage={card.code_language}
        imageUrl={imageUrl}
        imageAlt={isTerm ? `Термин: ${card.term}` : `Определение: ${card.definition}`}
        className={isTerm ? 'ps-term' : 'ps-definition'}
      />
      {transcription && <p className="ps-transcription">[{transcription}]</p>}
      {!isTerm && card.hint && <p className="ps-hint">Подсказка: {card.hint}</p>}
    </div>
  );
}

function AuthorAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    // Аватар приходит из профиля автора и может храниться у внешнего провайдера.
    return <img src={avatarUrl} alt="" className="ps-avatar" />;
  }
  return (
    <span className="ps-avatar ps-avatar-fallback" aria-hidden="true">
      {name.replace(/^@/, '').slice(0, 1).toUpperCase()}
    </span>
  );
}

function formatCardCount(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word =
    mod100 >= 11 && mod100 <= 14
      ? 'карточек'
      : mod10 === 1
        ? 'карточка'
        : mod10 >= 2 && mod10 <= 4
          ? 'карточки'
          : 'карточек';
  return `${count} ${word}`;
}
