import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { PUBLIC_REVALIDATE_SECONDS } from './cache';

const PAGES = [
  'app/kurs/[slug]/page.tsx',
  'app/avtor/[username]/page.tsx',
  'app/nabor/[slug]/page.tsx',
];

function source(page: string): string {
  return readFileSync(join(process.cwd(), 'src', page), 'utf8');
}

it('срок кэша задан одним значением', () => {
  expect(PUBLIC_REVALIDATE_SECONDS).toBeGreaterThan(0);
});

it.each(PAGES)('%s кэширует недоступность наравне с успешным ответом', (page) => {
  // Fetch-кэш Next не сохраняет 404: при ревалидации он отбрасывал бы ответ и оставлял
  // прошлый успешный. cachedPublicRead кэширует возвращаемое значение, включая null.
  const text = source(page);
  expect(text, `${page} должен читать через cachedPublicRead`).toContain('cachedPublicRead');
  expect(text, `${page} должен возвращать null на 404`).toMatch(/if \(response\.status === 404\)/);
});

it.each(PAGES)('%s не кэширует отрендеренную страницу целиком', (page) => {
  // Регрессия: при `export const revalidate` Next оставлял прошлый удачный HTML,
  // если новый рендер уходил в notFound(). Снятый курс отдавался бы бесконечно.
  expect(source(page)).not.toMatch(/^export const revalidate/m);
});
