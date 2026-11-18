import { LandingHeader } from './LandingHeader';
import { readLandingChrome } from './readLandingChrome';
import './chrome.css';

/** Общая публичная шапка берёт навигацию и бренд из утверждённой главной. */
export function PublicHeader() {
  return <LandingHeader html={readLandingChrome().header} />;
}
