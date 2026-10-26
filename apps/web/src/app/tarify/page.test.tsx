import { expect, it } from 'vitest';
import { metadata } from './page';

it('публикует индексируемые метаданные страницы тарифов', () => {
  expect(metadata.alternates).toMatchObject({ canonical: '/tarify' });
  expect(metadata.title).toBe('Тарифы Free, Plus и Pro');
  expect(metadata.description).toContain('Обучение, повторения');
});
