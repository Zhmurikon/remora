'use client';

import { Button } from '@remora/ui';

export default function CourseError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-16">
      <h1 className="text-3xl font-semibold">Не удалось загрузить курс</h1>
      <p className="text-fg-muted">Проверьте соединение и попробуйте ещё раз.</p>
      <Button className="min-h-11" onClick={reset}>
        Повторить
      </Button>
    </main>
  );
}
