import type { components } from '@remora/api-client';
import { LibraryUpdateControl } from './LibraryUpdateControl';

export function SavedMaterialSource({
  slug,
  sourceLabel,
  linkText,
  articleId,
  author,
  hasUpdates,
  saveId,
  title,
  targetType,
}: {
  slug: string;
  sourceLabel: string;
  linkText: string;
  articleId?: string;
  author: string;
  hasUpdates: boolean;
  saveId: string;
  title: string;
  targetType: components['schemas']['LibrarySaveCreate']['target_type'];
}) {
  const courseUrl = `${import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000'}/kurs/${encodeURIComponent(slug)}`;
  return (
    <div className="text-fg-muted mt-3 space-y-2 text-sm">
      <p className="break-words">
        {sourceLabel}{' '}
        <a
          className="text-primary underline underline-offset-2 max-sm:inline-flex max-sm:min-h-11 max-sm:max-w-full max-sm:items-center"
          href={articleId ? `${courseUrl}#article-${articleId}` : courseUrl}
        >
          {linkText}
        </a>
        {' · '}
        {author}
      </p>
      {hasUpdates && <LibraryUpdateControl saveId={saveId} title={title} targetType={targetType} />}
    </div>
  );
}

export function SavedSetSource({ set }: { set: components['schemas']['SavedSetItem'] }) {
  const course = set.access_via === 'course';
  const article = set.access_via === 'article';
  return (
    <SavedMaterialSource
      slug={set.course_slug}
      sourceLabel={course ? 'Карточки из курса' : 'Карточки из статьи'}
      linkText={course ? set.course_title : set.article_title}
      articleId={course ? undefined : set.article_id}
      author={set.author.display_name || `@${set.author.username}`}
      saveId={set.save_id}
      hasUpdates={set.has_updates}
      title={course ? set.course_title : article ? set.article_title : set.title}
      targetType={set.access_via}
    />
  );
}
