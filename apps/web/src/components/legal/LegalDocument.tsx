import { FishMark } from '@remora/ui';
import type { ReactNode } from 'react';
import { legalDetailsReady } from '../../lib/legal-config';

export function LegalDocument({
  title,
  version,
  children,
}: {
  title: string;
  version: string;
  children: ReactNode;
}) {
  return (
    <main className="legal-page min-h-dvh px-4 py-8 sm:px-6 sm:py-12">
      <article className="border-border bg-surface mx-auto max-w-4xl rounded-3xl border px-5 py-8 sm:px-10 sm:py-12">
        <a className="inline-flex items-center gap-3 font-semibold" href="/">
          <FishMark className="h-10 w-10" />
          Remora
        </a>
        {!legalDetailsReady && (
          <div
            className="border-warning bg-surface-muted mt-8 rounded-2xl border p-4"
            role="status"
          >
            <p className="font-medium">Документ ещё не введён в действие</p>
            <p className="text-fg-muted mt-1 text-sm leading-6">
              До запуска владелец должен заполнить реквизиты оператора и контакт для обращений.
            </p>
          </div>
        )}
        <header className="border-border mt-10 border-b pb-8">
          <p className="text-primary text-sm font-medium">Версия {version}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="text-fg-muted mt-3">Дата редакции: 26 октября 2026 года</p>
        </header>
        <div className="legal-copy mt-8">{children}</div>
        <nav className="border-border mt-10 flex flex-wrap gap-x-5 gap-y-3 border-t pt-6 text-sm">
          <a href="/legal/privacy">Персональные данные</a>
          <a href="/legal/terms">Соглашение</a>
          <a href="/legal/cookies">Cookie</a>
          <a href="/legal/copyright">Правообладателям</a>
        </nav>
      </article>
    </main>
  );
}
