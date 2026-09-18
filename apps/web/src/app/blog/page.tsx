import { JsonLd } from '../../components/JsonLd';
import { BlogCards } from '../../components/blog/BlogCards';
import { blogMetadata, blogStructuredData, publishedPosts } from '../../lib/blog';

export const metadata = blogMetadata();

export default function BlogPage() {
  return (
    <>
      <JsonLd data={blogStructuredData()} />
      <header className="blog-intro">
        <span className="home-kicker">Журнал Remora</span>
        <h1>
          Учиться с пониманием.
          <br />
          <span>Запоминать надолго.</span>
        </h1>
        <p>
          Как разобраться в конспекте, составить хорошие карточки и подготовиться к экзамену.
          Практика, с которой можно начать сегодня.
        </p>
      </header>
      <section className="blog-feed" aria-label="Публикации редакции">
        <BlogCards posts={publishedPosts()} />
      </section>
      <aside className="blog-cta">
        <div>
          <span className="home-kicker">От чтения к практике</span>
          <h2>Попробуйте учиться по карточкам</h2>
          <p>Пять вопросов на разные темы. Без регистрации.</p>
        </div>
        <a href="/#demo" className="home-button">
          Пройти демо <span aria-hidden="true">→</span>
        </a>
      </aside>
    </>
  );
}
