'use client';

import Script from 'next/script';
import { memo, useEffect, useRef } from 'react';
import { bindMenu, bindWave } from '../../../public/lecture-demo/header-behavior.mjs';
import { APP_URL } from '../../lib/auth-api';
import { usePublicSession } from '../auth/PublicSession';

declare const SheetButton: { attach(control: HTMLElement): void };

const HeaderMarkup = memo(function HeaderMarkup({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
});

export function LandingHeader({ html }: { html: string }) {
  const root = useRef<HTMLDivElement>(null);
  const session = usePublicSession();
  useEffect(() => {
    const header = root.current!.querySelector('header')!;
    const controller = new AbortController();
    bindMenu(header, controller.signal);
    bindWave(header.querySelector('.brand')!, controller.signal);
    return () => controller.abort();
  }, [html]);

  useEffect(() => {
    const account = root.current!.querySelector<HTMLAnchorElement>('.header-account .line-action')!;
    account.href = session === 'authenticated' ? APP_URL : '/login';
    account.querySelector('.line-label')!.textContent =
      session === 'authenticated' ? 'Войти в приложение' : 'Войти';
  }, [session, html]);

  return (
    <div ref={root} className="landing-chrome">
      <HeaderMarkup html={html} />
      <Script
        src="/lecture-demo/sheet-buttons.js"
        onReady={() => {
          // При возврате в каталог скрипт уже загружен, а кнопки в DOM новые.
          for (const control of root.current?.querySelectorAll<HTMLElement>('[data-sheet]') ?? []) {
            if (!control.querySelector('.sheet-label')) SheetButton.attach(control);
          }
        }}
      />
    </div>
  );
}
