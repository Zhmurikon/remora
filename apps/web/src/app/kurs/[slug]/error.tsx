'use client';

import { useRouter } from 'next/navigation';
import { startTransition } from 'react';
import { PublicState } from '../../../components/landing/PublicState';

export default function CourseError({ reset }: { reset: () => void }) {
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
        title="Не удалось загрузить курс"
        description="Проверьте соединение и попробуйте ещё раз. Ваши материалы и прогресс от этого не изменятся."
        primaryLabel="Повторить"
        onRetry={retry}
        secondaryHref="/kursy"
        secondaryLabel="Открыть каталог"
      />
    </main>
  );
}
