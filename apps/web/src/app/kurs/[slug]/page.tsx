import type { components } from '@remora/api-client';
import { Badge } from '@remora/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PublicCourseCards } from './PublicCourseCards';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8000';
type Course = components['schemas']['CourseDetail'];
type Material = components['schemas']['PublicSet'];

const loadCourse = cache(async (slug: string): Promise<Course> => {
  const response = await fetch(`${API_URL}/api/v1/courses/public/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('Не удалось загрузить курс');
  return response.json() as Promise<Course>;
});

async function loadMaterial(slug: string, id: string): Promise<Material | null> {
  const response = await fetch(
    `${API_URL}/api/v1/courses/public/${encodeURIComponent(slug)}/articles/${encodeURIComponent(id)}`,
    { cache: 'no-store' },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Не удалось загрузить материалы курса');
  return response.json() as Promise<Material>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const course = await loadCourse((await params).slug);
  const description = course.description || `Учебный курс «${course.title}» на Remora.`;
  return {
    title: course.title,
    description,
    robots: course.is_listed ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: `/kurs/${course.slug}` },
    openGraph: { title: course.title, description, type: 'article' },
  };
}

export default async function PublicCoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const course = await loadCourse((await params).slug);
  const entries = await Promise.all(
    course.sections
      .flatMap((section) => section.articles)
      .map(async (article) => [article.id, await loadMaterial(course.slug, article.id)] as const),
  );
  const materials = new Map(entries);
  return (
    <main className="mx-auto min-h-dvh max-w-6xl px-4 py-6 sm:px-8">
      <nav className="flex items-center justify-between" aria-label="Основная навигация">
        <Link
          href="/"
          className="text-primary inline-flex min-h-11 items-center text-xl font-semibold"
        >
          Remora
        </Link>
        <Link href="/kursy" className="text-primary inline-flex min-h-11 items-center underline">
          Каталог курсов
        </Link>
        <Link href="/login" className="text-primary inline-flex min-h-11 items-center underline">
          Войти
        </Link>
      </nav>
      <header className="max-w-3xl py-12">
        <p className="text-primary text-sm font-medium">Учебный курс</p>
        <h1 className="mt-3 break-words text-4xl font-semibold tracking-tight sm:text-5xl">
          {course.title}
        </h1>
        {course.description && (
          <p className="text-fg-muted mt-5 whitespace-pre-wrap break-words text-lg leading-relaxed">
            {course.description}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {course.tags.map((tag) => (
            <Badge key={tag}>#{tag}</Badge>
          ))}
        </div>
      </header>
      <div className="space-y-10 pb-12">
        {course.sections.map((section) => (
          <section key={section.id} className="space-y-6">
            <h2 className="text-2xl font-semibold">{section.title}</h2>
            {section.articles.map((article) => {
              const material = materials.get(article.id);
              if (!material) return null;
              return (
                <article key={article.id} id={`article-${article.id}`} className="space-y-4">
                  <header>
                    <h3 className="break-words text-xl font-semibold">{article.title}</h3>
                    <p className="text-fg-muted mt-2 text-sm">
                      Автор: {material.author.display_name || material.author.username} · Карточек:{' '}
                      {material.cards_count}
                    </p>
                  </header>
                  {article.body && (
                    <p className="max-w-prose whitespace-pre-wrap break-words leading-relaxed">
                      {article.body}
                    </p>
                  )}
                  <PublicCourseCards initial={material} slug={course.slug} articleId={article.id} />
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </main>
  );
}
