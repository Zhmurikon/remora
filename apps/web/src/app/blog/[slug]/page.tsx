import { notFound } from 'next/navigation';
import { JsonLd } from '../../../components/JsonLd';
import { BlogDiagram } from '../../../components/blog/BlogCards';
import { BlogRichText } from '../../../components/blog/BlogRichText';
import {
  BLOG_AUTHOR,
  blogMetadata,
  blogStructuredData,
  formatBlogDate,
  loadPost,
  loadPublishedPosts,
  publishedPosts,
  readingMinutes,
  relatedPosts,
} from '../../../lib/blog';

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = true;

export function generateStaticParams() {
  return publishedPosts().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) notFound();
  return blogMetadata(post);
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const [post, posts] = await Promise.all([loadPost(slug), loadPublishedPosts()]);
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
      <article className="blog-article">
        <div className="blog-article-grid">
          <header className="blog-article-header">
            <span className="home-kicker">{post.category}</span>
            <div className="blog-meta">
              <time dateTime={post.publishedAt}>{formatBlogDate(post.publishedAt)}</time>
              <span>≈ {readingMinutes(post)} мин чтения</span>
              <span>{BLOG_AUTHOR}</span>
            </div>
            <h1>{post.title}</h1>
            <p>{post.description}</p>
            {post.updatedAt !== post.publishedAt && (
              <p className="blog-updated">
                Обновлено <time dateTime={post.updatedAt}>{formatBlogDate(post.updatedAt)}</time>
              </p>
            )}
          </header>
          <div className="blog-article-cover">
            {post.cover ? (
              <img src={post.cover.src} alt={post.cover.alt} width="1672" height="941" />
            ) : (
              <BlogDiagram post={post} />
            )}
          </div>
          <aside className="blog-article-rail">
            <nav className="blog-toc" aria-label="Оглавление статьи">
              <h2>В этой статье</h2>
              <ol>
                {post.sections.map((section, index) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>
                      <span>{index + 1}</span>
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="blog-practice">
              <div className="blog-practice-visual" aria-hidden="true">
                <div className="blog-practice-mini-card blog-practice-mini-question">
                  <span>Вопрос</span>
                  <strong>Столица Японии?</strong>
                </div>
                <img src="/icon.svg" alt="" width="104" height="104" />
                <div className="blog-practice-mini-card blog-practice-mini-answer">
                  <span>Ответ</span>
                  <strong>Токио</strong>
                </div>
              </div>
              <h2>Проверьте, как работают карточки</h2>
              <p>Пройдите пять коротких вопросов и сразу увидьте свой результат.</p>
              <a className="home-button" href="/#demo">
                Пройти демо <span aria-hidden="true">→</span>
              </a>
              <small>Бесплатно · без регистрации</small>
            </div>
          </aside>
          <div className="blog-prose">
            {post.sections.map((section) => (
              <section key={section.id} id={section.id} tabIndex={-1}>
                <h2>{section.title}</h2>
                {(section.paragraphs ?? []).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.richText && (
                  <BlogRichText value={section.richText} media={section.media} />
                )}
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
      <aside className="blog-related" aria-label="Другие статьи">
        <div className="blog-related-heading">
          <div>
            <span className="home-kicker">Продолжить чтение</span>
            <h2>Что почитать дальше</h2>
          </div>
          <a className="home-link" href="/blog">
            Все публикации →
          </a>
        </div>
        <div className="blog-related-grid">
          {relatedPosts(post, posts).map((related) => (
            <a href={`/blog/${related.slug}`} key={related.slug}>
              <span>{related.category}</span>
              <h3>{related.title}</h3>
              <p>{related.description}</p>
              <strong aria-hidden="true">→</strong>
            </a>
          ))}
        </div>
      </aside>
    </>
  );
}
