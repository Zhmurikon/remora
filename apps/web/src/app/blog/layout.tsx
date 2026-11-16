import type { ReactNode } from 'react';
import { HomeTheme } from '../../components/home/HomeTheme';
import { BlogMotion } from '../../components/blog/BlogMotion';
import { LandingHeader } from '../../components/landing/LandingHeader';
import { readLandingChrome } from '../../components/landing/readLandingChrome';
import '../../components/landing/chrome.css';
import '../home.css';
import './blog.css';
import './blog-motion.css';

export default function BlogLayout({ children }: { children: ReactNode }) {
  const { header, footer } = readLandingChrome();
  return (
    <BlogMotion>
      <a className="home-skip" href="#main-content">
        Перейти к содержимому
      </a>
      <LandingHeader
        html={header.replace('href="/blog"', 'href="/blog" aria-current="location"')}
      />
      <div className="home blog">
        <main className="home-shell" id="main-content">
          {children}
        </main>
        <div className="blog-theme home-shell">
          <HomeTheme />
        </div>
      </div>
      <div className="landing-chrome" dangerouslySetInnerHTML={{ __html: footer }} />
    </BlogMotion>
  );
}
