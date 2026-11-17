// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { SetCardBrowser } from './SetCardBrowser';

vi.mock('../../lib/api', () => ({ api: { GET: vi.fn(), PUT: vi.fn() } }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const cards = Array.from({ length: 8 }, (_, i) => ({
  id: String(i),
  term: `Термин ${i + 1}`,
  definition: 'Определение',
  content_type: 'text',
  hint: 'Подсказка',
  alt_answers: ['Синоним'],
  wrong_term_answers: ['Другое слово'],
}));
function mount(canEdit: boolean) {
  const data = { id: 'set', updated_at: '2026-11-17T00:00:00Z', cards, can_edit: canEdit };
  vi.mocked(api.GET).mockResolvedValue({ data, response: new Response() } as never);
  vi.mocked(api.PUT).mockResolvedValue({ data, response: new Response() } as never);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SetCardBrowser setId="set" owned={canEdit} />
    </QueryClientProvider>,
  );
  return data;
}

it('удаляет только выбранную карточку даже при фильтрации и отправляет версию снимка', async () => {
  const set = mount(true);
  fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'Термин 8' } });
  fireEvent.click(screen.getByRole('button', { name: 'Удалить карточку «Термин 8»' }));
  expect(api.PUT).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));
  await waitFor(() =>
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/sets/{set_id}/cards', {
      params: { path: { set_id: 'set' } },
      body: { expected_updated_at: set.updated_at, cards: cards.slice(0, -1) },
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('редактирует текст по идентификатору и сохраняет остальные поля и порядок карточек', async () => {
  mount(true);
  fireEvent.click(await screen.findByRole('button', { name: 'Редактировать карточку «Термин 2»' }));
  const dialog = within(screen.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText('Определение'), { target: { value: 'Исправлено' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() =>
    expect(api.PUT).toHaveBeenCalledWith(
      '/api/v1/sets/{set_id}/cards',
      expect.objectContaining({
        body: expect.objectContaining({
          cards: cards.map((c) => (c.id === '1' ? { ...c, definition: 'Исправлено' } : c)),
        }),
      }),
    ),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('показывает состав сохранённого набора без действий владельца', async () => {
  mount(false);
  await screen.findByRole('table');
  expect(
    screen.queryByRole('button', {
      name: /Добавить карточку|Редактировать карточку|Удалить карточку/,
    }),
  ).toBeNull();
});
