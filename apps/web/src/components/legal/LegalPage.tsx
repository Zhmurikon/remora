import Link from 'next/link';
import { FishMark } from '@remora/ui';
import {
  getLegalDocument,
  LEGAL_CONTACT_EMAIL,
  LEGAL_UPDATED_AT,
  type LegalDocumentKind,
  type LegalLanguage,
} from '../../lib/legal';

interface LegalPageProps {
  kind: LegalDocumentKind;
  language: LegalLanguage;
}

const paths = {
  ru: { privacy: '/privacy', terms: '/terms' },
  en: { privacy: '/en/privacy', terms: '/en/terms' },
} as const;

export function LegalPage({ kind, language }: LegalPageProps) {
  const document = getLegalDocument(kind, language);
  const otherLanguage = language === 'ru' ? 'en' : 'ru';
  const isRu = language === 'ru';

  return (
    <div lang={language} className="bg-bg text-fg min-h-dvh">
      <a
        href="#legal-content"
        className="bg-surface text-primary focus-visible:ring-primary fixed left-4 top-4 z-50 -translate-y-24 rounded-lg px-4 py-3 font-semibold focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-2"
      >
        {isRu ? 'К содержанию' : 'Skip to content'}
      </a>

      <header className="border-border border-b">
        <div className="mx-auto flex min-h-20 max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link
            href="/"
            className="focus-visible:ring-primary flex min-h-11 items-center gap-2 rounded-lg text-xl font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            aria-label={isRu ? 'Remora, на главную' : 'Remora, home'}
          >
            <FishMark className="h-11 w-11" />
            <span>Remora</span>
          </Link>
          <Link
            href={paths[otherLanguage][kind]}
            hrefLang={otherLanguage}
            className="border-border text-fg-muted hover:border-primary hover:text-primary focus-visible:ring-primary inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            {isRu ? 'English' : 'Русский'}
          </Link>
        </div>
      </header>

      <main id="legal-content" className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="text-primary text-sm font-bold uppercase tracking-[0.14em]">
          {document.eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">{document.title}</h1>
        <time dateTime={LEGAL_UPDATED_AT} className="text-fg-subtle mt-5 block text-sm">
          {document.updated}
        </time>
        <p className="text-fg-muted mt-8 text-lg leading-8">{document.intro}</p>

        <div className="mt-14 space-y-12">
          {document.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-2xl font-bold tracking-tight">{section.title}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="text-fg-muted mt-4 leading-7">
                  {paragraph}
                </p>
              ))}
              {section.bullets && (
                <ul className="text-fg-muted mt-4 list-disc space-y-2 pl-6 leading-7">
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {section.contact && (
                <a
                  href={`mailto:${LEGAL_CONTACT_EMAIL}`}
                  className="text-primary hover:text-primary-hover focus-visible:ring-primary mt-4 inline-flex min-h-11 items-center rounded-md font-semibold underline decoration-1 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                >
                  {LEGAL_CONTACT_EMAIL}
                </a>
              )}
            </section>
          ))}
        </div>
      </main>

      <footer className="border-border border-t">
        <nav
          aria-label={isRu ? 'Юридические документы' : 'Legal documents'}
          className="text-fg-muted mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 text-sm sm:px-8"
        >
          <Link className="hover:text-primary py-3" href="/">
            {isRu ? 'Главная' : 'Home'}
          </Link>
          <Link className="hover:text-primary py-3" href={paths[language].privacy}>
            {isRu ? 'Конфиденциальность' : 'Privacy'}
          </Link>
          <Link className="hover:text-primary py-3" href={paths[language].terms}>
            {isRu ? 'Условия использования' : 'Terms of Use'}
          </Link>
        </nav>
      </footer>
    </div>
  );
}
