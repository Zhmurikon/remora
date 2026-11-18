import { PublicAnalytics } from '../analytics/PublicAnalytics';
import Link from 'next/link';
import { HomeTheme } from '../home/HomeTheme';
import { PublicFooter } from '../landing/PublicFooter';
import { PublicHeader } from '../landing/PublicHeader';
import {
  getLegalDocument,
  LEGAL_CONTACT_EMAIL,
  LEGAL_UPDATED_AT,
  type LegalDocumentKind,
  type LegalLanguage,
} from '../../lib/legal';
import { PAYMENT_RETURN_PATH, PAYMENT_RETURN_UPDATED_AT } from '../../lib/payment-return';
import styles from './LegalPage.module.css';

interface LegalPageProps {
  kind: LegalDocumentKind;
  language: LegalLanguage;
}

const paths: Record<LegalLanguage, Partial<Record<LegalDocumentKind, string>>> = {
  ru: { privacy: '/privacy', terms: '/terms', payment: PAYMENT_RETURN_PATH },
  en: { privacy: '/en/privacy', terms: '/en/terms' },
};

export function LegalPage({ kind, language }: LegalPageProps) {
  const document = getLegalDocument(kind, language);
  const otherLanguage = language === 'ru' ? 'en' : 'ru';
  const isRu = language === 'ru';
  const currentPath = paths[language][kind];
  const alternatePath = paths[otherLanguage][kind];
  if (!currentPath) throw new Error('Для документа не настроен публичный путь');
  const sectionIds = document.sections.map((_, index) => `legal-section-${index + 1}`);

  return (
    <div lang={language} className={styles.page}>
      <a href="#legal-content" className={styles.skip}>
        {isRu ? 'К содержанию' : 'Skip to content'}
      </a>

      <div lang="ru">
        <PublicHeader />
      </div>

      <main id="legal-content" className={styles.main}>
        <header className={styles.documentHeader}>
          <nav
            className={styles.documentNav}
            aria-label={isRu ? 'Навигация по документам' : 'Document navigation'}
          >
            <Link href="/">{isRu ? 'Главная' : 'Home'}</Link>
            <span aria-hidden="true">/</span>
            <span>{document.eyebrow}</span>
            {alternatePath && (
              <Link href={alternatePath} hrefLang={otherLanguage} className={styles.language}>
                {isRu ? 'English' : 'Русский'}
              </Link>
            )}
          </nav>
          <h1>{document.title}</h1>
          <time
            dateTime={
              kind === 'privacy'
                ? '2026-11-12'
                : kind === 'payment'
                  ? PAYMENT_RETURN_UPDATED_AT
                  : LEGAL_UPDATED_AT
            }
            className={styles.updated}
          >
            {document.updated}
          </time>
          <p className={styles.intro}>{document.intro}</p>
        </header>

        <div className={styles.content}>
          <nav className={styles.toc} aria-label={isRu ? 'Содержание' : 'Contents'}>
            <h2>{isRu ? 'Содержание' : 'Contents'}</h2>
            <ol>
              {document.sections.map((section, index) => (
                <li key={section.title}>
                  <a href={`#${sectionIds[index]}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          <article className={styles.sections}>
            {document.sections.map((section, index) => (
              <section className={styles.section} id={sectionIds[index]} key={section.title}>
                <h2>{section.title}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets && (
                  <ul>
                    {section.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {section.contact && (
                  <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={styles.contact}>
                    {LEGAL_CONTACT_EMAIL}
                  </a>
                )}
              </section>
            ))}
          </article>
        </div>

        <PublicAnalytics path={currentPath} settings={kind === 'privacy'} english={!isRu} />

        <nav
          aria-label={isRu ? 'Юридические документы' : 'Legal documents'}
          className={styles.documentLinks}
        >
          <Link href={paths[language].privacy!}>{isRu ? 'Конфиденциальность' : 'Privacy'}</Link>
          <Link href={paths[language].terms!}>
            {isRu ? 'Условия использования' : 'Terms of Use'}
          </Link>
          {isRu && <Link href={PAYMENT_RETURN_PATH}>Условия оплаты и возврата</Link>}
        </nav>
        <div className={styles.themeControl}>
          <HomeTheme />
        </div>
      </main>

      <div lang="ru">
        <PublicFooter className={styles.footer} />
      </div>
    </div>
  );
}
