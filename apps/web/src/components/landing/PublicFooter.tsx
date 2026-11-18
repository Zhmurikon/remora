import { readLandingChrome } from './readLandingChrome';

/** Общий публичный подвал берётся из того же утверждённого шаблона, что и главная. */
export function PublicFooter({ className = '' }: { className?: string }) {
  return (
    <div
      className={`landing-chrome ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: readLandingChrome().footer }}
    />
  );
}
