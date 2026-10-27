import type { BlogPost, BlogPostSummary } from '../../content/blog';
import { formatBlogDate, readingMinutes } from '../../lib/blog';

type BlogCardPost = BlogPost | BlogPostSummary;

export function BlogDiagram({ post }: { post: Pick<BlogCardPost, 'tone' | 'diagram'> }) {
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

function BlogListCover({ post }: { post: BlogCardPost }) {
  return (
    <div className="blog-list-media">
      {post.cover ? (
        <img src={post.cover.src} alt={post.cover.alt} width="640" height="400" loading="lazy" />
      ) : (
        <BlogDiagram post={post} />
      )}
    </div>
  );
}

export function BlogCards({ posts }: { posts: BlogCardPost[] }) {
  if (!posts.length)
    return (
      <p className="blog-empty">
        Здесь появятся материалы об учёбе и запоминании. Пока можно попробовать{' '}
        <a href="/#demo">демо с карточками</a>.
      </p>
    );

  const groups = Array.from(
    posts.reduce((result, post) => {
      const group = result.get(post.category) ?? [];
      group.push(post);
      result.set(post.category, group);
      return result;
    }, new Map<string, BlogCardPost[]>()),
  );

  return (
    <div className="blog-browser">
      <aside className="blog-topic-index">
        <h2>Темы</h2>
        <p>Рубрики появляются здесь автоматически, когда редакция публикует новые материалы.</p>
        <nav aria-label="Темы блога">
          <a href="#all-articles">Все статьи</a>
          {groups.map(([category], index) => (
            <a href={`#blog-topic-${index + 1}`} key={category}>
              {category}
            </a>
          ))}
        </nav>
      </aside>

      <div className="blog-results" id="all-articles">
        <header className="blog-results-header">
          <h2>Все статьи</h2>
          <p>Практические материалы редакции — от свежих к более ранним.</p>
        </header>

        {groups.map(([category, categoryPosts], index) => {
          const headingId = `blog-topic-${index + 1}-title`;
          return (
            <section
              className="blog-topic-section"
              id={`blog-topic-${index + 1}`}
              aria-labelledby={headingId}
              key={category}
            >
              <h3 id={headingId}>{category}</h3>
              <div className="blog-topic-posts">
                {categoryPosts.map((post) => (
                  <article className="blog-list-item" key={post.slug}>
                    <a href={`/blog/${post.slug}`} className="blog-list-link">
                      <BlogListCover post={post} />
                      <div className="blog-list-copy">
                        <h4>{post.title}</h4>
                        <p>{post.description}</p>
                        <div className="blog-meta">
                          <time dateTime={post.publishedAt}>
                            {formatBlogDate(post.publishedAt)}
                          </time>
                          <span>
                            ≈{' '}
                            {'readingMinutes' in post ? post.readingMinutes : readingMinutes(post)}{' '}
                            мин чтения
                          </span>
                        </div>
                      </div>
                      <span className="blog-list-arrow" aria-hidden="true">
                        →
                      </span>
                    </a>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
