import { Badge, Card } from '@remora/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { PublicCardContent } from './PublicCardContent';
import { cachedPublicRead } from '../../../lib/cache';

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

// `null` = набор недоступен; кэшируется наравне с успешным ответом, см. lib/cache.ts.
const loadSet = cachedPublicRead(
  ['public-set'],
  async (slug: string): Promise<PublicSet | null> => {
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
  },
);

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

  return (
    <main className="public-set-page min-h-dvh px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <nav className="flex items-center justify-between py-2" aria-label="Основная навигация">
          <Link href="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight">
            <span className="bg-primary text-primary-fg grid h-9 w-9 place-items-center rounded-xl">
              R
            </span>
            Remora
          </Link>
          <PublicAuthLink className="border-border bg-surface hover:bg-surface-muted inline-flex h-11 items-center rounded-full border px-5 text-sm font-medium transition-colors" />
        </nav>

        <header className="grid gap-8 pb-10 pt-14 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="primary">
                {set.visibility === 'public' ? 'Публичный' : 'Доступ по ссылке'}
              </Badge>
              <span className="text-fg-muted text-sm">{formatCardCount(set.cards_count)}</span>
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">{set.title}</h1>
            {set.description && (
              <p className="text-fg-muted mt-5 max-w-2xl whitespace-pre-wrap text-lg leading-8">
                {set.description}
              </p>
            )}
            <div className="mt-7 flex items-center gap-3">
              <AuthorAvatar name={authorName} avatarUrl={set.author.avatar_url} />
              <div>
                <p className="text-sm font-medium">{authorName}</p>
                <p className="text-fg-subtle text-xs">Автор набора</p>
              </div>
            </div>
          </div>
          <Link
            href={`${APP_URL}/login`}
            className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex h-12 items-center justify-center rounded-full px-7 text-base font-semibold transition-colors"
          >
            Начать учиться
          </Link>
        </header>

        <section aria-labelledby="cards-heading" className="pb-20">
          <div className="border-border mb-4 flex items-end justify-between border-b pb-4">
            <div>
              <p className="text-primary text-xs font-semibold uppercase tracking-[0.18em]">
                Содержание
              </p>
              <h2 id="cards-heading" className="mt-1 text-2xl font-semibold">
                Карточки набора
              </h2>
            </div>
            {set.cards_count > set.cards.length && (
              <span className="text-fg-muted text-sm">Показаны первые {set.cards.length}</span>
            )}
          </div>
          <ol className="space-y-3">
            {set.cards.map((card, index) => (
              <li key={card.id}>
                <Card className="grid gap-5 p-5 sm:grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] sm:p-6">
                  <span className="text-fg-subtle pt-1 text-sm tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <CardSide card={card} side="term" />
                  <CardSide card={card} side="definition" />
                </Card>
              </li>
            ))}
          </ol>
          {set.cards.length === 0 && (
            <Card className="p-10 text-center">
              <p className="text-fg-muted">Автор пока не добавил карточки.</p>
            </Card>
          )}
        </section>
      </div>
    </main>
  );
}

function CardSide({ card, side }: { card: PublicCard; side: 'term' | 'definition' }) {
  const isTerm = side === 'term';
  const value = isTerm ? card.term : card.definition;
  const transcription = isTerm ? card.term_transcription : card.definition_transcription;
  const imageUrl = isTerm ? card.term_image_url : card.definition_image_url;
  return (
    <div
      className={
        isTerm ? '' : 'border-border border-t pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0'
      }
    >
      <PublicCardContent
        value={value}
        type={card.content_type}
        codeLanguage={card.code_language}
        imageUrl={imageUrl}
        imageAlt={isTerm ? `Термин: ${card.term}` : `Определение: ${card.definition}`}
        className={isTerm ? 'font-medium' : 'text-fg-muted'}
      />
      {transcription && <p className="text-fg-subtle mt-2 text-sm">[{transcription}]</p>}
      {!isTerm && card.hint && (
        <p className="text-fg-subtle mt-3 text-sm">Подсказка: {card.hint}</p>
      )}
    </div>
  );
}

function AuthorAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    // Аватар приходит из профиля автора и может храниться у внешнего провайдера.
    return <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />;
  }
  return (
    <span className="bg-primary-subtle text-primary grid h-10 w-10 place-items-center rounded-full font-semibold">
      {name.slice(0, 1).toUpperCase()}
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
import { PublicAuthLink } from '../../../components/auth/PublicSession';
