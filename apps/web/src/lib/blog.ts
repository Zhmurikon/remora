import type { Metadata } from 'next';
import { blogPosts, type BlogPost } from '../content/blog';
import { absoluteUrl, DEFAULT_OG_IMAGE } from './seo';

export const BLOG_TITLE = 'Блог об учёбе и запоминании';
export const BLOG_DESCRIPTION =
  'Как учить конспекты, готовиться к экзаменам и составлять карточки. Практические материалы редакции Remora.';
export const BLOG_AUTHOR = 'Редакция Remora';

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

export function relatedPosts(post: BlogPost): BlogPost[] {
  return post.related
    .map(getPost)
    .filter((item): item is BlogPost => Boolean(item) && item?.slug !== post.slug)
    .slice(0, 2);
}

export function readingMinutes(post: BlogPost): number {
  const text = post.sections
    .flatMap((section) => [
      section.title,
      ...section.paragraphs,
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
      title: `${title} — Remora`,
      description,
      url: path,
      siteName: 'Remora',
      locale: 'ru_RU',
      images: [
        { url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: 'Remora — учёба и запоминание' },
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
      title: `${title} — Remora`,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export function blogStructuredData(post?: BlogPost) {
  const path = post ? `/blog/${post.slug}` : '/blog';
  const organization = {
    '@type': 'Organization',
    '@id': `${absoluteUrl('/')}#organization`,
    name: 'Remora',
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
            blogPost: publishedPosts().map((item) => ({
              '@type': 'BlogPosting',
              headline: item.title,
              url: absoluteUrl(`/blog/${item.slug}`),
              datePublished: item.publishedAt,
            })),
          },
    ],
  };
}
