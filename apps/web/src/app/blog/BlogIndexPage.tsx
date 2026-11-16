import { PublicAnalytics } from '../../components/analytics/PublicAnalytics';
import { JsonLd } from '../../components/JsonLd';
import { BlogDesk } from '../../components/blog/BlogDesk';
import './blog-index.css';
import { BlogCards } from '../../components/blog/BlogCards';
import type { BlogPost, BlogPostSummary } from '../../content/blog';
import { blogPageCount, blogPagePosts, blogStructuredData } from '../../lib/blog';

function blogPageHref(page: number): string {
  return page === 1 ? '/blog' : `/blog/stranitsa/${page}`;
}

function visiblePages(currentPage: number, totalPages: number): (number | string)[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = Array.from(new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages]))
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  return pages.flatMap((page, index) => {
    const previous = pages[index - 1];
    return previous && page - previous > 1 ? [`gap-${previous}`, page] : [page];
  });
}

function BlogPagination({ currentPage, totalPages }: { currentPage: number; totalPages: number }) {
  if (totalPages <= 1) return null;

  return (
    <nav className="blog-pagination" aria-label="Страницы блога">
      <a
        href={currentPage === 1 ? '/blog' : blogPageHref(currentPage - 1)}
        aria-disabled={currentPage === 1 || undefined}
        tabIndex={currentPage === 1 ? -1 : undefined}
      >
        ← Предыдущая
      </a>
      <ol>
        {visiblePages(currentPage, totalPages).map((item) =>
          typeof item === 'string' ? (
            <li aria-hidden="true" key={item}>
              …
            </li>
          ) : (
            <li key={item}>
              <a href={blogPageHref(item)} aria-current={item === currentPage ? 'page' : undefined}>
                <span className="sr-only">Страница </span>
                {item}
              </a>
            </li>
          ),
        )}
      </ol>
      <a
        href={currentPage === totalPages ? blogPageHref(totalPages) : blogPageHref(currentPage + 1)}
        aria-disabled={currentPage === totalPages || undefined}
        tabIndex={currentPage === totalPages ? -1 : undefined}
      >
        Следующая →
      </a>
    </nav>
  );
}

export function BlogIndexPage({
  posts,
  currentPage = 1,
  includeStructuredData = false,
}: {
  posts: (BlogPost | BlogPostSummary)[];
  currentPage?: number;
  includeStructuredData?: boolean;
}) {
  const totalPages = blogPageCount(posts);
  const pagePosts = blogPagePosts(posts, currentPage);

  return (
    <>
      <PublicAnalytics path={blogPageHref(currentPage)} />
      {includeStructuredData ? <JsonLd data={blogStructuredData(undefined, posts)} /> : null}
      <header className="blog-desk">
        <div className="blog-desk-copy">
          <h1>
            Блог об учёбе <em>и запоминании</em>
          </h1>
          <p>
            Практические статьи о подготовке к экзаменам, работе с конспектами и способах запоминать
            сложное. Выберите тему или читайте новые материалы по порядку.
          </p>
        </div>
        <BlogDesk />
      </header>
      <section className="blog-feed" aria-label="Публикации редакции">
        <BlogCards posts={pagePosts} />
        <BlogPagination currentPage={currentPage} totalPages={totalPages} />
      </section>
      <aside className="blog-desk-cta">
        <img src="/lecture-demo/flashcards.webp" width="110" height="80" alt="" loading="lazy" />
        <div>
          <h2>Попробуйте учиться по карточкам</h2>
          <p>Три карточки о температуре. Без регистрации.</p>
        </div>
        <a href="/#demo" className="home-button">
          Пройти демо <span aria-hidden="true">→</span>
        </a>
      </aside>
    </>
  );
}
