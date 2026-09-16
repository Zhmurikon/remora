import { afterEach, expect, it, vi } from 'vitest';
import { generateMetadata } from './page';

afterEach(() => vi.unstubAllGlobals());

it.each([true, false])('сохраняет индексацию курса is_listed=%s', async (isListed) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ title: 'Курс', description: '', slug: 'course', is_listed: isListed }),
        ),
    ),
  );
  const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'course' }) });
  expect(metadata.robots).toEqual({ index: isListed, follow: isListed });
  expect(metadata.alternates?.canonical).toBe('/kurs/course');
});
