// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { components } from '@remora/api-client';
import { PublicCourseCards } from './PublicCourseCards';
import { renderToString } from 'react-dom/server';

const card = {
  code_language: null,
  term_transcription: null,
  definition_transcription: null,
  hint: null,
  id: 'first',
  position: 0,
  term: 'Матрица',
  definition: 'Таблица',
  content_type: 'text' as const,
};
const initial: components['schemas']['PublicSet'] = {
  id: 'set',
  title: 'Набор',
  description: '',
  slug: 'set',
  visibility: 'private',
  cards_count: 2,
  lang_term: 'ru',
  lang_definition: 'ru',
  author: { username: 'author', display_name: null, avatar_url: null },
  cards: [card],
  next_cursor: 0,
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z',
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('включает первые карточки в серверный HTML без дополнительного запроса', () => {
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  const html = renderToString(
    <PublicCourseCards initial={initial} slug="course" articleId="article" />,
  );
  expect(html).toContain('Матрица');
  expect(html).toContain('Таблица');
  expect(request).not.toHaveBeenCalled();
});

it('добавляет следующую страницу и убирает кнопку в конце', async () => {
  const request = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        ...initial,
        cards: [{ ...card, id: 'second', term: 'Определитель' }],
        next_cursor: null,
      }),
    ),
  );
  vi.stubGlobal('fetch', request);
  render(<PublicCourseCards initial={initial} slug="course" articleId="article" />);
  await userEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
  expect(await screen.findByText('Определитель')).toBeTruthy();
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.queryByRole('button')).toBeNull();
  expect(request.mock.calls[0]?.[0]).toContain('after=0&revision=');
});

it('сохраняет уже показанные карточки после сбоя и позволяет повторить', async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ...initial, cards: [], next_cursor: null })),
    );
  vi.stubGlobal('fetch', request);
  render(<PublicCourseCards initial={initial} slug="course" articleId="article" />);
  await userEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByText('Матрица')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
  expect(request).toHaveBeenCalledTimes(2);
});

it.each([404, 409])('предлагает обновление страницы при статусе %s', async (status) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
  render(<PublicCourseCards initial={initial} slug="course" articleId="article" />);
  await userEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
  expect(await screen.findByRole('button', { name: 'Обновить страницу' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
});
