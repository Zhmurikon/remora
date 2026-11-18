import type { ReactNode } from 'react';
import { LandingHeader } from '../landing/LandingHeader';
import { readLandingChrome } from '../landing/readLandingChrome';
import { HomeTheme } from '../home/HomeTheme';
import '../landing/chrome.css';
import '../../app/kurs/[slug]/course.css';

/** Курс и отдельный конспект используют одну оболочку и шкалу чтения. */
export function PublicReadingLayout({ children }: { children: ReactNode }) {
  const { header, footer } = readLandingChrome();
  return (
    <>
      <LandingHeader html={header} />
      {children}
      <div className="reading-theme">
        <div className="course-width">
          <HomeTheme />
        </div>
      </div>
      <div className="landing-chrome" dangerouslySetInnerHTML={{ __html: footer }} />
    </>
  );
}
