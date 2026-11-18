'use client';

import { startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PublicState } from '../../../components/landing/PublicState';

export default function NoteError({ reset }: { reset: () => void }) {
  const router = useRouter();
  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <main>
      <PublicState
        variant="error"
        title="Не удалось загрузить конспект"
        description="Проверьте соединение и попробуйте ещё раз."
        primaryLabel="Повторить"
        onRetry={retry}
        secondaryHref="/"
        secondaryLabel="На главную"
      />
    </main>
  );
}
