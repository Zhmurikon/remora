'use client';

import { PublicErrorShell, PublicState } from '../components/landing/PublicState';

export default function Error({ reset }: { reset: () => void }) {
  return (
    <PublicErrorShell>
      <main>
        <PublicState
          variant="error"
          title="Страница не загрузилась"
          description="Проверьте соединение и попробуйте ещё раз. Если ошибка повторится, можно продолжить с каталога."
          primaryLabel="Повторить"
          onRetry={reset}
          secondaryHref="/kursy"
          secondaryLabel="Открыть каталог"
        />
      </main>
    </PublicErrorShell>
  );
}
