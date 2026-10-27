import type { Metadata } from 'next';
import { blogPosts, type BlogPost, type BlogPostSummary } from '../content/blog';
import { absoluteUrl, DEFAULT_OG_IMAGE } from './seo';

export const BLOG_TITLE = 'Блог об учёбе и запоминании';
export const BLOG_DESCRIPTION =
  'Как учить конспекты, готовиться к экзаменам и составлять карточки. Практические материалы редакции «Запоминальни».';
export const BLOG_AUTHOR = 'Редакция «Запоминальни»';
export const BLOG_PAGE_SIZE = 10;
const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8000';

export function blogPageCount(posts: readonly unknown[]): number {
  return Math.max(1, Math.ceil(posts.length / BLOG_PAGE_SIZE));
}

export function blogPagePosts<T>(posts: readonly T[], page: number): T[] {
  const firstPost = (page - 1) * BLOG_PAGE_SIZE;
  return posts.slice(firstPost, firstPost + BLOG_PAGE_SIZE);
}

export function publishedPosts(
  posts: readonly BlogPost[] = blogPosts,
  now = new Date(),
): BlogPost[] {
  return posts
    .filter((post) => post.status === 'published' && Date.parse(post.publishedAt) <= now.getTime())
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
}

export function getPost(slug: string): BlogPost | undefined {
  return publishedPosts().find((post) => post.slug === slug);
}

function postSummary(post: BlogPost): BlogPostSummary {
  return { ...post, readingMinutes: readingMinutes(post) };
}

function staticSummaries(): BlogPostSummary[] {
  return publishedPosts().map(postSummary);
}

export async function loadPublishedPosts(): Promise<BlogPostSummary[]> {
  try {
    const remote: BlogPostSummary[] = [];
    for (let offset = 0; ; offset += 100) {
      const response = await fetch(`${API_URL}/api/v1/blog/posts?offset=${offset}&limit=100`, {
        next: { revalidate: 60 },
      });
      if (!response.ok) return staticSummaries();
      const page = (await response.json()) as BlogPostSummary[];
      remote.push(...page);
      if (page.length < 100) break;
    }
    const bySlug = new Map(staticSummaries().map((post) => [post.slug, post]));
    for (const post of remote) bySlug.set(post.slug, post);
    return [...bySlug.values()].sort(
      (a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug),
    );
  } catch {
    // Редакционный bootstrap остаётся доступен при временной недоступности API.
    return staticSummaries();
  }
}

export async function loadPost(slug: string): Promise<BlogPost | undefined> {
  try {
    const response = await fetch(`${API_URL}/api/v1/blog/posts/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    });
    if (response.ok) return (await response.json()) as BlogPost;
  } catch {
    // Стартовые статьи доступны и при временной недоступности API.
  }
  return getPost(slug);
}

export function relatedPosts(
  post: BlogPost,
  posts: readonly BlogPostSummary[] = staticSummaries(),
): BlogPostSummary[] {
  const bySlug = new Map(posts.map((item) => [item.slug, item]));
  return post.related
    .map((slug) => bySlug.get(slug))
    .filter((item): item is BlogPostSummary => Boolean(item) && item?.slug !== post.slug)
    .slice(0, 2);
}

export function readingMinutes(post: BlogPost): number {
  const text = post.sections
    .flatMap((section) => [
      section.title,
      ...(section.paragraphs ?? []),
      section.richText ?? '',
      ...(section.steps ?? []),
      section.example?.question ?? '',
      section.example?.answer ?? '',
    ])
    .join(' ');
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 180));
}

export function formatBlogDate(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date));
}

export function blogMetadata(post?: BlogPost): Metadata {
  const title = post?.title ?? BLOG_TITLE;
  const description = post?.description ?? BLOG_DESCRIPTION;
  const path = post ? `/blog/${post.slug}` : '/blog';
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} — Запоминальня`,
      description,
      url: path,
      siteName: 'Запоминальня',
      locale: 'ru_RU',
      images: [
        {
          url: DEFAULT_OG_IMAGE,
          width: 1200,
          height: 630,
          alt: 'Запоминальня — учёба и запоминание',
        },
      ],
      ...(post
        ? {
            type: 'article',
            publishedTime: post.publishedAt,
            modifiedTime: post.updatedAt,
            authors: [BLOG_AUTHOR],
            section: post.category,
          }
        : { type: 'website' }),
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} — Запоминальня`,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export function blogStructuredData(
  post?: BlogPost,
  posts: readonly Pick<BlogPost, 'slug' | 'title' | 'publishedAt'>[] = staticSummaries(),
) {
  const path = post ? `/blog/${post.slug}` : '/blog';
  const organization = {
    '@type': 'Organization',
    '@id': `${absoluteUrl('/')}#organization`,
    name: 'Запоминальня',
    url: absoluteUrl('/'),
  };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization,
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Главная', item: absoluteUrl('/') },
          { '@type': 'ListItem', position: 2, name: 'Блог', item: absoluteUrl('/blog') },
          ...(post
            ? [{ '@type': 'ListItem', position: 3, name: post.title, item: absoluteUrl(path) }]
            : []),
        ],
      },
      post
        ? {
            '@type': 'BlogPosting',
            '@id': `${absoluteUrl(path)}#article`,
            url: absoluteUrl(path),
            headline: post.title,
            description: post.description,
            inLanguage: 'ru',
            datePublished: post.publishedAt,
            dateModified: post.updatedAt,
            author: { '@type': 'Organization', name: BLOG_AUTHOR, url: absoluteUrl('/blog') },
            publisher: { '@id': organization['@id'] },
            mainEntityOfPage: absoluteUrl(path),
            image: absoluteUrl(DEFAULT_OG_IMAGE),
            articleSection: post.category,
            isPartOf: { '@type': 'Blog', '@id': `${absoluteUrl('/blog')}#blog` },
          }
        : {
            '@type': 'Blog',
            '@id': `${absoluteUrl('/blog')}#blog`,
            url: absoluteUrl('/blog'),
            name: BLOG_TITLE,
            description: BLOG_DESCRIPTION,
            inLanguage: 'ru',
            publisher: { '@id': organization['@id'] },
            blogPost: posts.map((item) => ({
              '@type': 'BlogPosting',
              headline: item.title,
              url: absoluteUrl(`/blog/${item.slug}`),
              datePublished: item.publishedAt,
            })),
          },
    ],
  };
}
