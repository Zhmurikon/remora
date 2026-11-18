import type { components } from '@remora/api-client';
import { ArticleContentServer, StudyNotesPreview } from '@remora/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { NoteReader } from '../../../components/reading/NoteReader';
import { DEFAULT_OG_IMAGE } from '../../../lib/seo';

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
  const description = `Конспект «${note.title}» — читать в Запоминальне.`;
  return {
    title: note.title,
    description,
    alternates: { canonical: `/konspekt/${id}` },
    openGraph: {
      title: note.title,
      description,
      type: 'article',
      url: `/konspekt/${id}`,
      images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: note.title }],
    },
    twitter: { card: 'summary_large_image', title: note.title, description },
  };
}

export default async function SharedNotePage({ params }: Props) {
  const { title, markdown } = await loadNote((await params).id);
  return (
    <main className="course-detail">
      <NoteReader title={title}>
        <StudyNotesPreview value={markdown} articleTitle={title} Content={ArticleContentServer} />
      </NoteReader>
    </main>
  );
}
