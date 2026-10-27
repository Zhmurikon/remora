import { ArticleContentServer, type ArticleMedia } from '@remora/ui/article-content-server';

export function BlogRichText({
  value,
  media = {},
}: {
  value: string;
  media?: Record<string, ArticleMedia>;
}) {
  return (
    <ArticleContentServer value={value} media={media} headingLevel={3} className="blog-rich-text" />
  );
}
