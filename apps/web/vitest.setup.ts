import { vi } from 'vitest';

// unstable_cache требует incrementalCache сервера Next, которого в юнит-тестах нет.
// Подменяем его сквозным вызовом: тесты проверяют логику страниц, а не механику кэша.
// Саму проводку кэширования сверяет src/lib/cache.test.ts по исходникам страниц.
vi.mock('next/cache', () => ({
  unstable_cache:
    <A extends unknown[], T>(load: (...args: A) => Promise<T>) =>
    (...args: A) =>
      load(...args),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));
