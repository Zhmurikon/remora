import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  BLOG_DESCRIPTION,
  BLOG_TITLE,
  blogMetadata,
  blogPageCount,
  loadPublishedPosts,
  publishedPosts,
} from '../../../../lib/blog';
import { BlogIndexPage } from '../../BlogIndexPage';

type PageProps = { params: Promise<{ page: string }> };

export const dynamicParams = true;

function parsePage(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 2 ? page : null;
}

export function generateStaticParams() {
  const totalPages = blogPageCount(publishedPosts());
  return Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => ({
    page: String(index + 2),
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = parsePage((await params).page);
  if (!page || page > blogPageCount(await loadPublishedPosts())) notFound();

  const path = `/blog/stranitsa/${page}`;
  const title = `Страница ${page} — ${BLOG_TITLE}`;
  const base = blogMetadata();
  return {
    ...base,
    title,
    description: BLOG_DESCRIPTION,
    alternates: { canonical: path },
    openGraph: base.openGraph
      ? { ...base.openGraph, title: `${title} — Запоминальня`, url: path }
      : null,
    twitter: base.twitter ? { ...base.twitter, title: `${title} — Запоминальня` } : null,
  };
}

export default async function PaginatedBlogPage({ params }: PageProps) {
  const page = parsePage((await params).page);
  const posts = await loadPublishedPosts();
  if (!page || page > blogPageCount(posts)) notFound();

  return <BlogIndexPage posts={posts} currentPage={page} />;
}
