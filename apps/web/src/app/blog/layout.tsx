import type { ReactNode } from 'react';
import { FishMark } from '@remora/ui';
import { HomeTheme } from '../../components/home/HomeTheme';
import '../home.css';
import './blog.css';

export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="home blog">
      <a className="home-skip" href="#main-content">
        Перейти к содержимому
      </a>
      <header className="blog-header home-shell">
        <a className="home-brand" href="/" aria-label="Remora — главная">
          <FishMark />
          Remora
        </a>
        <nav aria-label="Основная навигация">
          <a href="/kursy">Каталог</a>
          <a href="/podborki">Подборки</a>
          <a href="/blog" aria-current="location">
            Блог
          </a>
          <a className="home-button home-button-small" href="/#demo">
            Попробовать
          </a>
        </nav>
      </header>
      <main className="home-shell" id="main-content">
        {children}
      </main>
      <footer className="home-footer home-shell">
        <a className="home-brand" href="/" aria-label="Remora — главная">
          <FishMark />
          Remora
        </a>
        <span>Учиться в своём темпе.</span>
        <HomeTheme />
        <nav aria-label="Навигация в подвале">
          <a href="/blog">Все статьи</a>
          <a href="/kursy">Каталог</a>
          <PublicAuthLink />
        </nav>
      </footer>
    </div>
  );
}
import { PublicAuthLink } from '../../components/auth/PublicSession';
