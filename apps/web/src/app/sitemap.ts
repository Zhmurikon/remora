import type { components } from '@remora/api-client';
import type { MetadataRoute } from 'next';
import { absoluteUrl } from '../lib/seo';
import { publishedPosts } from '../lib/blog';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8000';
type Entry = components['schemas']['CourseSitemapEntry'];

async function loadEntries(): Promise<Entry[]> {
  try {
    const response = await fetch(`${API_URL}/api/v1/courses/sitemap`, {
      next: { revalidate: 3600 },
    });
    return response.ok ? ((await response.json()) as Entry[]) : [];
  } catch {
    // Статические страницы остаются в карте даже при временной недоступности API.
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await loadEntries();
  const authors = new Map<string, Date>();
  const courses = entries.map((entry) => {
    const modified = new Date(entry.updated_at);
    const previous = authors.get(entry.author_username);
    if (!previous || previous < modified) authors.set(entry.author_username, modified);
    return { url: absoluteUrl(`/kurs/${entry.slug}`), lastModified: modified };
  });
  return [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/kursy'), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/blog'), changeFrequency: 'weekly', priority: 0.7 },
    ...publishedPosts().map((post) => ({
      url: absoluteUrl(`/blog/${post.slug}`),
      lastModified: new Date(post.updatedAt),
    })),
    ...courses,
    ...Array.from(authors, ([username, lastModified]) => ({
      url: absoluteUrl(`/avtor/${username}`),
      lastModified,
    })),
  ];
}
