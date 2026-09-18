export default function BlogNotFound() {
  return (
    <section className="blog-intro">
      <span className="home-kicker">404</span>
      <h1>Статья не найдена</h1>
      <p>Возможно, ссылка изменилась или публикация больше недоступна.</p>
      <a href="/blog" className="home-button">
        Все статьи
      </a>
    </section>
  );
}
