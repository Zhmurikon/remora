// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SetEditorPage } from './SetEditorPage';
import { wrongAnswersError } from './WrongAnswersEditor';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { GET: vi.fn(), PATCH: vi.fn(), PUT: vi.fn() } }));
const card = {
  id: 'card-1',
  term: 'кот',
  definition: 'cat',
  content_type: 'text',
  wrong_term_answers: ['кит'],
  wrong_definition_answers: ['bat'],
  alt_answers: ['feline'],
  hint: 'Животное',
};
const set = {
  id: 'set-1',
  title: 'Слова',
  description: '',
  visibility: 'private',
  folder_id: null,
  cards: [card],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.GET).mockImplementation(
    async (path) => ({ data: path === '/api/v1/folders' ? [] : set }) as never,
  );
  vi.mocked(api.PATCH).mockResolvedValue({ data: set } as never);
  vi.mocked(api.PUT).mockResolvedValue({ data: set } as never);
});
afterEach(cleanup);

function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/sets/set-1/edit']}>
        <Routes>
          <Route path="/sets/:setId/edit" element={<SetEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('загружает и сохраняет оба направления, сохраняет синонимы и подсказку', async () => {
  mount();
  await userEvent.click(await screen.findByText('Неверные ответы (необязательно)'));
  const terms = screen.getByLabelText('Неверные термины');
  const definitions = screen.getByLabelText('Неверные определения');
  expect((terms as HTMLTextAreaElement).value).toBe('кит');
  expect((definitions as HTMLTextAreaElement).value).toBe('bat');
  await userEvent.type(terms, '\nкрот');
  await userEvent.type(definitions, '\nhat');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() =>
    expect(api.PUT).toHaveBeenLastCalledWith(
      '/api/v1/sets/{set_id}/cards',
      expect.objectContaining({
        body: {
          cards: [
            expect.objectContaining({
              wrong_term_answers: ['кит', 'крот'],
              wrong_definition_answers: ['bat', 'hat'],
              alt_answers: ['feline'],
              hint: 'Животное',
            }),
          ],
        },
      }),
    ),
  );
  await userEvent.clear(terms);
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() =>
    expect(api.PUT).toHaveBeenLastCalledWith(
      '/api/v1/sets/{set_id}/cards',
      expect.objectContaining({
        body: { cards: [expect.objectContaining({ wrong_term_answers: [] })] },
      }),
    ),
  );
});

it('блокирует сохранение совпадения с правильным ответом', async () => {
  mount();
  await userEvent.click(await screen.findByText('Неверные ответы (необязательно)'));
  await userEvent.clear(screen.getByLabelText('Неверные термины'));
  await userEvent.type(screen.getByLabelText('Неверные термины'), 'КОТ');
  vi.mocked(api.PUT).mockClear();
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(screen.getByRole('alert').textContent).toContain('Уберите повторы');
  expect(api.PUT).not.toHaveBeenCalled();
});

it('проверяет повторы, синонимы и технические ограничения', () => {
  expect(wrongAnswersError(['ёж', 'ЕЖ'], 'кот')).not.toBeNull();
  expect(wrongAnswersError(['feline'], 'cat', ['feline'])).not.toBeNull();
  expect(wrongAnswersError(['x'.repeat(10001)], 'cat')).not.toBeNull();
  expect(
    wrongAnswersError(
      Array.from({ length: 31 }, (_, i) => String(i)),
      'cat',
    ),
  ).not.toBeNull();
  expect(wrongAnswersError(['', 'bat'], 'cat')).toBeNull();
});
