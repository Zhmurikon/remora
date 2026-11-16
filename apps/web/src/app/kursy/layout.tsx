import type { ReactNode } from 'react';
import { LandingHeader } from '../../components/landing/LandingHeader';
import { readLandingChrome } from '../../components/landing/readLandingChrome';
import '../../components/landing/chrome.css';
import './catalog-motion.css';

export default function CatalogLayout({ children }: { children: ReactNode }) {
  const { header, footer } = readLandingChrome();
  return (
    <div className="catalog-route">
      <LandingHeader html={header} />
      {children}
      <div className="landing-chrome" dangerouslySetInnerHTML={{ __html: footer }} />
    </div>
  );
}
