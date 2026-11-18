'use client';

import { useRouter } from 'next/navigation';
import { startTransition } from 'react';
import { PublicState } from '../../../components/landing/PublicState';

export default function CollectionError({ reset }: { reset: () => void }) {
  const router = useRouter();
  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <PublicState
      variant="error"
      title="Не удалось загрузить подборку"
      description="Проверьте соединение и попробуйте ещё раз. Если материал временно недоступен, другие темы остаются в каталоге."
      primaryLabel="Повторить"
      onRetry={retry}
      secondaryHref="/podborki"
      secondaryLabel="Все подборки"
    />
  );
}
