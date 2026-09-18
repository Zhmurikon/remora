import type { BlogPost } from '../../content/blog';
import { formatBlogDate, readingMinutes } from '../../lib/blog';

export function BlogDiagram({ post }: { post: BlogPost }) {
  return (
    <div className={`blog-diagram blog-tone-${post.tone}`} aria-hidden="true">
      <span className="blog-diagram-orbit" />
      {post.diagram.map((label, index) => (
        <div className="blog-diagram-step" key={label}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <strong>{label}</strong>
          <i />
        </div>
      ))}
    </div>
  );
}

export function BlogCards({ posts }: { posts: BlogPost[] }) {
  if (!posts.length)
    return (
      <p className="blog-empty">
        Здесь появятся материалы об учёбе и запоминании. Пока можно попробовать{' '}
        <a href="/#demo">демо с карточками</a>.
      </p>
    );
  return (
    <div className="blog-grid">
      {posts.map((post) => (
        <article className="blog-card" key={post.slug}>
          <a href={`/blog/${post.slug}`} className="blog-card-link">
            <BlogDiagram post={post} />
            <div className="blog-card-copy">
              <span className="home-kicker">{post.category}</span>
              <h2>{post.title}</h2>
              <p>{post.description}</p>
              <div className="blog-meta">
                <time dateTime={post.publishedAt}>{formatBlogDate(post.publishedAt)}</time>
                <span>≈ {readingMinutes(post)} мин чтения</span>
              </div>
              <span className="home-link">
                Читать статью <span aria-hidden="true">↗</span>
              </span>
            </div>
          </a>
        </article>
      ))}
    </div>
  );
}
