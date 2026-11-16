import type { ReactNode } from 'react';
import { LandingHeader } from '../../../components/landing/LandingHeader';
import { readLandingChrome } from '../../../components/landing/readLandingChrome';
import '../../../components/landing/chrome.css';
import './course.css';

export default function CourseLayout({ children }: { children: ReactNode }) {
  const { header, footer } = readLandingChrome();
  return (
    <>
      <LandingHeader html={header} />
      {children}
      <div className="landing-chrome" dangerouslySetInnerHTML={{ __html: footer }} />
    </>
  );
}
