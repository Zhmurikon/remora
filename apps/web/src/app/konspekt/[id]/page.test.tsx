import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import SharedNotePage, { generateMetadata } from './page';

const params = Promise.resolve({ id: 'public-note' });
afterEach(() => vi.unstubAllGlobals());

it('сохраняет содержимое, формулы и самопроверку в серверной странице без действий курса', async () => {
  const fetchMock = vi.fn(async () =>
    Response.json({
      title: 'Вероятность',
      markdown:
        '# Вероятность\n\n$x^2$\n\n| Событие | Шанс |\n|---|---|\n| A | 0,5 |\n\n<details><summary>Проверь себя</summary>Ответ: половина.</details>\n\n<script>alert(1)</script>',
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const html = renderToStaticMarkup(await SharedNotePage({ params }));
  expect(html).toContain('Конспект лекции');
  expect(html).toContain('href="#note-content"');
  expect(html).toContain('id="note-content"');
  expect(html.match(/<h[1-6][^>]*>Вероятность<\/h[1-6]>/g)).toHaveLength(1);
  expect(html).toContain('<table');
  expect(html).toContain('katex');
  expect(html).toContain('<summary');
  expect(html).toContain('Ответ: половина.');
  expect(html).not.toContain('<script>alert');
  expect(html).not.toContain('Сохранить курс');
  expect(html).not.toContain('Скопировать курс');
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/notes/public/public-note'), {
    cache: 'no-store',
  });
});

it('сохраняет канонический адрес конспекта и метаданные ссылки', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ title: 'Вероятность', markdown: 'Текст' })),
  );
  const metadata = await generateMetadata({ params });
  expect(metadata.alternates?.canonical).toBe('/konspekt/public-note');
  expect(metadata.openGraph?.url).toBe('/konspekt/public-note');
  expect(metadata.title).toBe('Вероятность');
});

it.each([404, 422])('не показывает недоступный конспект при ответе API %s', async (status) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status })),
  );
  await expect(SharedNotePage({ params })).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  await expect(generateMetadata({ params })).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
});

it('отличает сбой API от отсутствующего конспекта', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 503 })),
  );
  await expect(SharedNotePage({ params })).rejects.toThrow('Не удалось загрузить конспект');
});
