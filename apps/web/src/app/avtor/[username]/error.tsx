'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition } from 'react';

export default function AuthorError({ reset }: { reset: () => void }) {
  const router = useRouter();
  function retry() {
    // Повтор нужен и для серверного чтения, а не только для клиентской границы ошибки.
    startTransition(() => {
      router.refresh();
      reset();
    });
  }
  return (
    <main className="public-author public-author-state">
      <div className="public-author-width">
        <p className="public-author-label">Профиль автора</p>
        <h1>Не удалось загрузить профиль</h1>
        <p>Проверьте соединение и попробуйте ещё раз.</p>
        <div className="public-author-state-actions">
          <button type="button" className="public-author-retry" onClick={retry}>
            Повторить
          </button>
          <Link href="/kursy" className="public-author-link">
            Каталог курсов →
          </Link>
        </div>
      </div>
    </main>
  );
}
