import type { ReactNode } from 'react';
import { LandingHeader } from '../../../components/landing/LandingHeader';
import { readLandingChrome } from '../../../components/landing/readLandingChrome';
import '../../../components/landing/chrome.css';
import './author-profile.css';

export default function AuthorLayout({ children }: { children: ReactNode }) {
  const { header, footer } = readLandingChrome();
  return (
    <>
      <LandingHeader html={header} />
      {children}
      <div
        className="landing-chrome public-author-footer"
        dangerouslySetInnerHTML={{ __html: footer }}
      />
    </>
  );
}
