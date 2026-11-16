'use client';

import { Input } from '@remora/ui';
import { useState, type InputHTMLAttributes, type MouseEvent } from 'react';
import { API_URL, GOOGLE_OAUTH_URL } from '../../lib/auth-api';
import { EyeIcon } from './Icons';

export function PasswordField({
  label = 'Пароль',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        label={label}
        type={visible ? 'text' : 'password'}
        {...props}
        className="h-12 rounded-xl pr-12"
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="text-fg-subtle hover:text-fg absolute right-1 top-[29px] grid h-11 w-11 place-items-center rounded-xl transition-colors"
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
      >
        <EyeIcon crossed={visible} className="h-5 w-5" />
      </button>
    </div>
  );
}

export function SocialButtons({ compact = false }: { compact?: boolean }) {
  function continueWithGoogle(event: MouseEvent<HTMLAnchorElement>) {
    const next = new URLSearchParams(window.location.search).get('next');
    if (!next) return;
    event.preventDefault();
    const target = new URL('/api/v1/auth/oauth/google/start', API_URL);
    target.searchParams.set('next', next);
    window.location.assign(target.href);
  }

  return (
    <div className="space-y-3" aria-label="Вход через другой сервис">
      <a
        href={GOOGLE_OAUTH_URL}
        onClick={continueWithGoogle}
        className="border-border bg-surface text-fg hover:bg-surface-muted focus-visible:ring-primary flex h-12 w-full items-center justify-center gap-3 rounded-xl border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        {compact ? (
          <svg viewBox="0 0 18 18" width="21" height="21" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.909c1.702-1.568 2.683-3.878 2.683-6.615Z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.468-.806 5.957-2.18l-2.909-2.258c-.806.54-1.838.859-3.048.859-2.345 0-4.33-1.584-5.04-3.711H.953v2.331A9 9 0 0 0 9 18Z"
            />
            <path
              fill="#FBBC05"
              d="M3.96 10.71A5.4 5.4 0 0 1 3.678 9c0-.593.102-1.17.282-1.71V4.959H.953A9 9 0 0 0 0 9c0 1.452.348 2.827.953 4.041l3.007-2.331Z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.321 0 2.507.454 3.44 1.346l2.582-2.582C13.464.891 11.425 0 9 0A9 9 0 0 0 .953 4.959L3.96 7.29C4.67 5.163 6.655 3.58 9 3.58Z"
            />
          </svg>
        ) : (
          <span aria-hidden="true" className="text-base font-bold">
            G
          </span>
        )}
        Продолжить с Google
      </a>
      {compact ? (
        <p className="reading-providers">Скоро: VK ID, Яндекс ID, Telegram</p>
      ) : (
        <div className="grid grid-cols-3 gap-3" aria-label="Другие сервисы">
          <SocialButton label="VK ID" mark="VK" />
          <SocialButton label="Яндекс ID" mark="Я" />
          <SocialButton label="Telegram" mark="TG" />
        </div>
      )}
    </div>
  );
}

function SocialButton({ label, mark }: { label: string; mark: string }) {
  return (
    <button
      type="button"
      disabled
      title={`${label} — скоро`}
      className="border-border bg-surface-muted/45 text-fg-muted group relative flex h-12 items-center justify-center rounded-xl border text-sm font-semibold disabled:cursor-not-allowed"
      aria-label={`${label} — скоро`}
    >
      <span>{mark}</span>
      <span className="border-border bg-surface text-fg-subtle absolute -right-1 -top-2 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide">
        скоро
      </span>
    </button>
  );
}

export function FormDivider() {
  return (
    <div className="text-fg-subtle flex items-center gap-4 text-xs uppercase tracking-[0.16em]">
      <span className="bg-border h-px flex-1" />
      или
      <span className="bg-border h-px flex-1" />
    </div>
  );
}

export function FormError({ children }: { children: string }) {
  return (
    <div
      role="alert"
      className="border-danger/20 bg-danger-subtle text-danger rounded-xl border px-4 py-3 text-sm"
    >
      {children}
    </div>
  );
}
