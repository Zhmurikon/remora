import type { ReactNode } from 'react';
import { LandingHeader } from './LandingHeader';
import styles from './PublicState.module.css';
import './chrome.css';

const PUBLIC_ERROR_HEADER_HTML = `<header class="site-header">
  <a class="brand" href="/">
    <img src="/lecture-demo/remora-icon.png" width="40" height="40" alt="" />
    <span class="brand-name">Запоминальня</span>
  </a>
  <button class="header-toggle" data-sheet="outline" type="button" aria-controls="header-nav" aria-expanded="false" hidden>Меню</button>
  <nav id="header-nav" class="header-nav" aria-label="Основная навигация">
    <div class="header-sections">
      <a href="/#about">Как это работает</a>
      <a href="/kursy">Каталог курсов</a>
      <a href="/#class-plan">Преподавателям</a>
      <a href="/#pricing">Тарифы</a>
      <a href="/blog">Блог</a>
      <a href="/#faq">Вопросы и ответы</a>
    </div>
    <div class="header-account">
      <a href="/login" class="line-action"><span class="line-label">Войти</span></a><a class="signup" data-sheet="blue" href="/register">Создать аккаунт</a>
    </div>
  </nav>
</header>`;

interface PublicStateProps {
  title: string;
  description: string;
  code?: string;
  variant?: 'missing' | 'error';
  primaryHref?: string;
  primaryLabel: string;
  onRetry?: () => void;
  secondaryHref?: string;
  secondaryLabel?: string;
}

export function PublicState({
  title,
  description,
  code,
  variant = 'missing',
  primaryHref,
  primaryLabel,
  onRetry,
  secondaryHref,
  secondaryLabel,
}: PublicStateProps) {
  return (
    <section className={styles.state} data-state={variant} aria-labelledby="public-state-title">
      <div className={styles.copy}>
        {code && (
          <p className={styles.code} aria-hidden="true">
            {code}
          </p>
        )}
        <h1 id="public-state-title">{title}</h1>
        <p className={styles.description} role={variant === 'error' ? 'alert' : undefined}>
          {description}
        </p>
        <div className={styles.actions}>
          {onRetry ? (
            <button className={styles.primary} type="button" onClick={onRetry}>
              {primaryLabel}
            </button>
          ) : (
            <a className={styles.primary} href={primaryHref}>
              {primaryLabel}
            </a>
          )}
          {secondaryHref && secondaryLabel && (
            <a className={styles.secondary} href={secondaryHref}>
              {secondaryLabel}
            </a>
          )}
        </div>
      </div>
      <div className={styles.illustration} aria-hidden="true">
        <span className={styles.paperNumber}>{variant === 'missing' ? '404' : '…'}</span>
        <img src="/images/collections/study-folder.webp" width="1200" height="800" alt="" />
      </div>
    </section>
  );
}

export function PublicErrorShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#public-state">
        Перейти к содержимому
      </a>
      <LandingHeader html={PUBLIC_ERROR_HEADER_HTML} />
      <div id="public-state">{children}</div>
    </div>
  );
}
