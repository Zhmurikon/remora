import { notFound } from 'next/navigation';
import { JsonLd } from '../../../components/JsonLd';
import { BlogCards, BlogDiagram } from '../../../components/blog/BlogCards';
import {
  BLOG_AUTHOR,
  blogMetadata,
  blogStructuredData,
  formatBlogDate,
  getPost,
  publishedPosts,
  readingMinutes,
  relatedPosts,
} from '../../../lib/blog';

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;

export function generateStaticParams() {
  return publishedPosts().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  const post = getPost((await params).slug);
  if (!post) notFound();
  return blogMetadata(post);
}

export default async function BlogPostPage({ params }: Props) {
  const post = getPost((await params).slug);
  if (!post) notFound();
  return (
    <>
      <JsonLd data={blogStructuredData(post)} />
      <nav className="blog-breadcrumbs" aria-label="Хлебные крошки">
        <a href="/">Главная</a>
        <span aria-hidden="true">/</span>
        <a href="/blog">Блог</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{post.title}</span>
      </nav>
      <article>
        <header className="blog-article-header">
          <span className="home-kicker">{post.category}</span>
          <h1>{post.title}</h1>
          <p>{post.description}</p>
          <div className="blog-meta">
            <span>{BLOG_AUTHOR}</span>
            <time dateTime={post.publishedAt}>{formatBlogDate(post.publishedAt)}</time>
            <span>≈ {readingMinutes(post)} мин чтения</span>
          </div>
          {post.updatedAt !== post.publishedAt && (
            <p className="blog-updated">
              Обновлено <time dateTime={post.updatedAt}>{formatBlogDate(post.updatedAt)}</time>
            </p>
          )}
        </header>
        <div className="blog-article-cover">
          <BlogDiagram post={post} />
        </div>
        <div className="blog-reading-layout">
          <nav className="blog-toc" aria-label="Оглавление статьи">
            <strong>В этой статье</strong>
            <ol>
              {post.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="blog-prose">
            {post.sections.map((section) => (
              <section key={section.id} id={section.id} tabIndex={-1}>
                <h2>{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.steps && (
                  <ol>
                    {section.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                )}
                {section.example && (
                  <div className="blog-example">
                    <span className="home-kicker">Пример карточки</span>
                    <dl>
                      <dt>Вопрос</dt>
                      <dd>{section.example.question}</dd>
                      <dt>Ответ</dt>
                      <dd>{section.example.answer}</dd>
                    </dl>
                  </div>
                )}
              </section>
            ))}
            {post.sources && (
              <section className="blog-sources" aria-labelledby="sources-title">
                <h2 id="sources-title">Источники</h2>
                <ul>
                  {post.sources.map((source) => (
                    <li key={source.url}>
                      <a href={source.url}>{source.title}</a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </article>
      <aside className="blog-cta">
        <div>
          <span className="home-kicker">Теперь ваша очередь</span>
          <h2>Начните с нескольких карточек</h2>
          <p>Попробуйте демо или создайте свой первый набор.</p>
        </div>
        <div className="blog-cta-actions">
          <a className="home-button" href="/#demo">
            Пройти демо
          </a>
          <a className="home-link" href="/register">
            Создать свои карточки →
          </a>
        </div>
      </aside>
      <aside className="blog-related" aria-label="Другие статьи">
        <h2 className="blog-related-title">Что почитать дальше</h2>
        <BlogCards posts={relatedPosts(post)} />
        <a className="home-link" href="/blog">
          ← Все публикации
        </a>
      </aside>
    </>
  );
}
