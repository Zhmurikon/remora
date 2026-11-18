import type { ReactNode } from 'react';
import { PublicHeader } from '../../components/landing/PublicHeader';
import { HomeTheme } from '../../components/home/HomeTheme';
import '../home.css';
import '../blog/blog.css';
import './collections.css';

export default function CollectionsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="home-skip" href="#main-content">
        Перейти к содержимому
      </a>
      <PublicHeader />
      <div className="home blog collections">
        <main className="home-shell" id="main-content">
          {children}
        </main>
        <footer className="home-footer home-shell">
          <a className="home-brand" href="/" aria-label="Запоминальня — главная">
            <img src="/lecture-demo/remora-icon.png" width="32" height="32" alt="" />
            Запоминальня
          </a>
          <span>Учиться в своём темпе.</span>
          <HomeTheme />
          <nav aria-label="Навигация в подвале">
            <a href="/kursy">Каталог</a>
            <a href="/blog">Блог</a>
            <PublicAuthLink />
          </nav>
        </footer>
      </div>
    </>
  );
}
import { PublicAuthLink } from '../../components/auth/PublicSession';
