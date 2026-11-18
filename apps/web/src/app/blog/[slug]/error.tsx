'use client';

import { useRouter } from 'next/navigation';
import { startTransition } from 'react';
import { PublicState } from '../../../components/landing/PublicState';

export default function BlogArticleError({ reset }: { reset: () => void }) {
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
      title="Не удалось загрузить статью"
      description="Проверьте соединение и попробуйте ещё раз. Можно вернуться к списку публикаций — прочитанное не потеряется."
      primaryLabel="Повторить"
      onRetry={retry}
      secondaryHref="/blog"
      secondaryLabel="Все статьи"
    />
  );
}
