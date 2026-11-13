import type { components } from '@remora/api-client';
import { ArticleContentServer, StudyNotesPreview } from '@remora/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

const loadNote = cache(async (id: string) => {
  const origin = process.env.API_INTERNAL_URL ?? 'http://localhost:8000';
  const response = await fetch(`${origin}/api/v1/notes/public/${encodeURIComponent(id)}`, {
    cache: 'no-store',
  });
  if (response.status === 404 || response.status === 422) notFound();
  if (!response.ok) throw new Error('Не удалось загрузить конспект');
  return (await response.json()) as components['schemas']['SharedNote'];
});

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const note = await loadNote(id);
  return { title: note.title, alternates: { canonical: `/konspekt/${id}` } };
}

export default async function SharedNotePage({ params }: Props) {
  const { title, markdown } = await loadNote((await params).id);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-primary inline-flex min-h-11 items-center underline">
        Запоминальня
      </Link>
      <article className="mt-6 space-y-6">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <StudyNotesPreview value={markdown} Content={ArticleContentServer} />
      </article>
    </main>
  );
}
