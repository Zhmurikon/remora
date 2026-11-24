// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { setDetailQuery } from './set-queries';
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

const makeCards = (length: number) =>
  Array.from({ length }, (_, i) => ({
    id: String(i),
    term: `Термин ${i + 1}`,
    definition: 'Определение',
    content_type: 'text',
    hint: 'Подсказка',
    alt_answers: ['Синоним'],
    wrong_term_answers: ['Другое слово'],
  }));
const cards = makeCards(8);
function LoadedCards() {
  const { data } = useQuery(setDetailQuery('set'));
  return data && <SetCardBrowser set={data} editable={data.can_edit} />;
}

function mount(canEdit: boolean, setCards = cards) {
  const data = {
    id: 'set',
    updated_at: '2026-11-17T00:00:00Z',
    cards: setCards,
    can_edit: canEdit,
  };
  vi.mocked(api.GET).mockResolvedValue({ data, response: new Response() } as never);
  vi.mocked(api.PUT).mockResolvedValue({ data, response: new Response() } as never);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LoadedCards />
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

it('показывает по 12 карточек, переключает страницы и сбрасывает страницу при поиске', async () => {
  mount(false, makeCards(173));
  const pages = within(await screen.findByRole('navigation', { name: 'Страницы состава набора' }));
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(13);
  expect(screen.getByText('1–12 из 173')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Карточки набора' })).toBeNull();
  fireEvent.click(pages.getByRole('button', { name: 'Страница 15' }));
  expect(screen.getByText('169–173 из 173')).toBeTruthy();
  expect(pages.getByRole('button', { current: 'page' }).textContent).toBe('15');
  expect(pages.getByRole('button', { name: 'Следующая страница' }).hasAttribute('disabled')).toBe(
    true,
  );
  fireEvent.click(pages.getByRole('button', { name: 'Предыдущая страница' }));
  expect(screen.getByText('157–168 из 173')).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Термин 1' } });
  expect(pages.getByRole('button', { current: 'page' }).textContent).toBe('1');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Термин 173' } });
  expect(screen.getByText('1–1 из 1')).toBeTruthy();
  expect(screen.queryByRole('navigation')).toBeNull();
});

it('после добавления 13-й карточки открывает новую страницу, после её удаления возвращается на первую', async () => {
  const initial = mount(true, makeCards(12));
  const extended = { ...initial, cards: makeCards(13) };
  vi.mocked(api.PUT).mockResolvedValueOnce({ data: extended, response: new Response() } as never);
  const add = await screen.findByRole('button', { name: 'Добавить карточку' });
  expect(add.textContent).toBe('+');
  fireEvent.click(add);
  const editor = within(screen.getByRole('dialog'));
  fireEvent.change(editor.getByLabelText('Термин'), { target: { value: 'Термин 13' } });
  fireEvent.change(editor.getByLabelText('Определение'), { target: { value: 'Определение' } });
  fireEvent.click(editor.getByRole('button', { name: 'Сохранить' }));
  await screen.findByText('13–13 из 13');
  fireEvent.click(screen.getByRole('button', { name: 'Удалить карточку «Термин 13»' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));
  await screen.findByText('1–12 из 12');
  expect(screen.queryByRole('navigation')).toBeNull();
});
