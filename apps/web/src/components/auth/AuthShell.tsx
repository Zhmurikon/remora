import Link from 'next/link';
import type { ReactNode } from 'react';
import { AuthMotionToggle } from './AuthMotionToggle';
import { BookIcon, ChartIcon } from './Icons';
import { Logo } from './Logo';

interface AuthShellProps {
  children: ReactNode;
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="auth-page bg-bg text-fg min-h-dvh">
      <div className="auth-ambient" aria-hidden="true">
        <span className="auth-ambient-shape" />
        <svg className="auth-memory-map" viewBox="0 0 1600 900" preserveAspectRatio="none">
          <path id="auth-route-one" d="M88 694C272 632 330 763 493 716C622 679 618 542 753 516" />
          <path
            id="auth-route-two"
            d="M1021 210C1172 192 1190 334 1338 297C1430 274 1466 213 1552 229"
          />
          <path id="auth-route-three" d="M1080 630C1197 537 1316 558 1442 703" />
          <circle cx="88" cy="694" r="5" />
          <circle cx="493" cy="716" r="7" />
          <circle cx="1021" cy="210" r="5" />
          <circle cx="1338" cy="297" r="7" />
          <circle cx="1442" cy="703" r="5" />
          <circle className="auth-memory-runner" r="5">
            <animateMotion dur="78s" repeatCount="indefinite" begin="-21s">
              <mpath href="#auth-route-one" />
            </animateMotion>
          </circle>
          <circle className="auth-memory-runner auth-memory-runner-accent" r="4">
            <animateMotion dur="92s" repeatCount="indefinite" begin="-57s">
              <mpath href="#auth-route-two" />
            </animateMotion>
          </circle>
          <circle className="auth-memory-runner" r="4.5">
            <animateMotion dur="84s" repeatCount="indefinite" begin="-38s">
              <mpath href="#auth-route-three" />
            </animateMotion>
          </circle>
        </svg>
        <span className="auth-orbit auth-orbit-one">
          <i />
        </span>
        <span className="auth-orbit auth-orbit-two">
          <i />
        </span>
        <span className="auth-mote auth-mote-one" />
        <span className="auth-mote auth-mote-two" />
        <span className="auth-mote auth-mote-three" />
        <span className="auth-mote auth-mote-four" />
        <span className="auth-spark auth-spark-one">
          <i />
          <i />
          <i />
        </span>
        <span className="auth-spark auth-spark-two">
          <i />
          <i />
          <i />
        </span>
      </div>

      <header className="auth-header">
        <Logo />
        <Link href="/" className="auth-home-link">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m14.5 6-6 6 6 6M9 12h10" />
          </svg>
          На главную
        </Link>
      </header>

      <div className="auth-stage">
        <section className="auth-statement" aria-label="О Remora">
          <h2>
            <span className="auth-title-word auth-title-word-one">Знания</span>
            <em className="auth-title-word auth-title-word-two">остаются</em>
            <span className="auth-title-word auth-title-word-three">с вами</span>
          </h2>
          <p>Собирайте важное в карточки и возвращайтесь к нему именно тогда, когда нужно.</p>
        </section>

        <div className="auth-form-panel">
          <div className="auth-form-content">{children}</div>
          <p className="auth-legal">
            Продолжая, вы принимаете <a href="#">условия использования</a> и{' '}
            <a href="#">политику конфиденциальности</a>
          </p>
        </div>

        <div className="auth-note auth-note-card" aria-hidden="true">
          <span className="auth-note-icon">
            <BookIcon />
          </span>
          <p>Что такое интервальное повторение?</p>
          <i />
          <i />
        </div>

        <div className="auth-note auth-note-progress" aria-hidden="true">
          <span className="auth-note-icon">
            <ChartIcon />
          </span>
          <div>
            <small>Прогресс недели</small>
            <strong>84% изучено</strong>
          </div>
          <span className="auth-mini-chart">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>

        <span className="auth-hand-note auth-hand-note-top" aria-hidden="true">
          Лучше запоминаю
        </span>
        <span className="auth-hand-note auth-hand-note-side" aria-hidden="true">
          Больше возможностей
        </span>
      </div>
      <AuthMotionToggle />
    </main>
  );
}
