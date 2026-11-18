// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { components } from '@remora/api-client';
import { api } from '../lib/api';
import { BattlePage } from './BattlePage';

vi.mock('../lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));
vi.mock('@remora/ui', async () => {
  const actual = await vi.importActual('@remora/ui');
  return { ...actual, CardContent: ({ value }: { value: string }) => <span>{value}</span> };
});
type Room = components['schemas']['BattleRoomOut'];
const player = {
  user_id: 'u1',
  username: 'alice',
  display_name: 'Алиса',
  avatar_url: null,
  slot: 1,
  ready: false,
  answered_count: 0,
  correct_count: null,
  finished_at: null,
  duration_ms: null,
  is_connected: true,
  is_current: true,
};
function room(patch: Partial<Room> = {}): Room {
  return {
    id: 'b1',
    set_id: 's1',
    set_title: 'Формулы',
    status: 'waiting',
    direction: 'term_to_def',
    question_count: 4,
    questions: Array.from({ length: 4 }, (_, i) => ({
      id: `q${i}`,
      card_id: `c${i}`,
      direction: 'term_to_def',
      prompt: `Вопрос ${i}`,
      content_type: 'text',
      code_language: null,
      prompt_image_url: null,
      hint: null,
      options: ['Ответ А', 'Ответ Б', 'Ответ В', 'Ответ Г'],
    })),
    participants: [player],
    server_now: new Date().toISOString(),
    starts_at: null,
    deadline_at: null,
    finished_at: null,
    winner_id: null,
    is_draw: false,
    finish_reason: null,
    ...patch,
  };
}
const caches: QueryClient[] = [];
function setup(initial = '/battles/b1') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/battles/:battleId" element={<BattlePage />} />
          <Route path="/sets/:setId/battle" element={<BattlePage />} />
          <Route path="/sets/:setId" element={<p>Обзор набора</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(api.GET).mockResolvedValue({ data: room() } as never);
});
afterEach(() => {
  cleanup();
  caches.forEach((client) => client.clear());
  caches.length = 0;
  vi.restoreAllMocks();
});

it('создаёт приглашение с выбранным направлением и сохраняет ключ при повторе ошибки', async () => {
  vi.mocked(api.GET).mockResolvedValue({
    data: { id: 's1', title: 'Формулы', cards_count: 6, visibility: 'public' },
  } as never);
  vi.mocked(api.POST).mockResolvedValue({ error: { message: 'Нет связи' } } as never);
  setup('/sets/s1/battle');
  await screen.findByText('Формулы');
  fireEvent.click(screen.getByRole('radio', { name: '4' }));
  fireEvent.click(screen.getByRole('radio', { name: /Определение → термин/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Создать приглашение' }));
  await screen.findByText('Нет связи');
  const first = vi.mocked(api.POST).mock.calls[0]?.[1];
  fireEvent.click(screen.getByRole('button', { name: 'Создать приглашение' }));
  await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.POST).mock.calls[1]?.[1]).toEqual(first);
  expect(first).toMatchObject({ body: { direction: 'def_to_term', question_count: 4 } });
});
it('не создаёт битву из приватного или слишком маленького набора', async () => {
  vi.mocked(api.GET).mockResolvedValue({
    data: { title: 'Мало', cards_count: 3, visibility: 'public' },
  } as never);
  setup('/sets/s1/battle');
  await screen.findByText(/хотя бы четыре/);
  expect(
    (screen.getByRole('button', { name: 'Создать приглашение' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
it('входит по приглашению только после явного действия и показывает ошибку третьего участника', async () => {
  vi.mocked(api.GET).mockResolvedValue({ error: { message: 'Нет доступа' } } as never);
  vi.mocked(api.POST).mockResolvedValue({
    error: { message: 'В битве уже два участника' },
  } as never);
  setup('/battles/b1?invite=test');
  const join = await screen.findByRole('button', { name: 'Присоединиться' });
  expect(api.POST).not.toHaveBeenCalled();
  fireEvent.click(join);
  await screen.findByText('В битве уже два участника');
});
it('участник открывает комнату с просроченным токеном без повторного вступления', async () => {
  setup('/battles/b1?invite=expired');
  await screen.findByText('Комната ожидания');
  expect(api.POST).not.toHaveBeenCalled();
});
it('показывает обратную связь копирования и выделяет ссылку при отказе clipboard', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
  });
  setup('/battles/b1?invite=token');
  fireEvent.click(await screen.findByRole('button', { name: 'Копировать' }));
  await screen.findByText(/Ссылка выделена/);
  const input = screen.getByLabelText('Ссылка-приглашение') as HTMLInputElement;
  expect(document.activeElement).toBe(input);
  expect(input.selectionEnd).toBe(input.value.length);
});
it('отправляет готовность один раз и показывает ошибку запроса', async () => {
  let resolve: (value: unknown) => void = () => undefined;
  vi.mocked(api.POST).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }) as never,
  );
  setup();
  const ready = await screen.findByRole('button', { name: 'Я готов' });
  fireEvent.click(ready);
  fireEvent.click(ready);
  await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(1));
  resolve({ error: { message: 'Не удалось подтвердить готовность' } });
  await screen.findByText('Не удалось подтвердить готовность');
});
it('восстанавливает вопрос по серверному числу принятых ответов', async () => {
  vi.mocked(api.GET).mockResolvedValue({
    data: room({ status: 'active', participants: [{ ...player, answered_count: 2 }] }),
  } as never);
  setup();
  await screen.findByRole('heading', { name: 'Вопрос 3 из 4' });
  expect(screen.getByText('Вопрос 2')).toBeTruthy();
});
it('сохраняет выбор до отправки, блокирует повторные клики и повторяет тот же ответ', async () => {
  vi.mocked(api.GET).mockResolvedValue({ data: room({ status: 'active' }) } as never);
  vi.mocked(api.POST).mockRejectedValue(new Error('offline'));
  setup();
  const option = await screen.findByRole('button', { name: 'Ответ А' });
  fireEvent.click(option);
  fireEvent.click(option);
  await screen.findByText(/Ответ сохранён на устройстве/);
  const first = vi.mocked(api.POST).mock.calls[0]?.[1];
  expect(JSON.parse(localStorage.getItem('remora:battle-answer:u1:b1')!)).toMatchObject({
    value: 'Ответ А',
    question_id: 'q0',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Повторить отправку' }));
  await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.POST).mock.calls[1]?.[1]).toEqual(first);
});
it('восстанавливает неотправленный ответ после перезагрузки с прежним ключом', async () => {
  localStorage.setItem(
    'remora:battle-answer:u1:b1',
    JSON.stringify({
      client_answer_id: 'saved-key',
      question_id: 'q0',
      value: 'Ответ Б',
      index: 0,
    }),
  );
  vi.mocked(api.GET).mockResolvedValue({ data: room({ status: 'active' }) } as never);
  vi.mocked(api.POST).mockResolvedValue({
    data: {
      accepted: true,
      duplicate: false,
      room: room({ status: 'active', participants: [{ ...player, answered_count: 1 }] }),
    },
  } as never);
  setup();
  await screen.findByRole('heading', { name: 'Вопрос 2 из 4' });
  expect(api.POST).toHaveBeenCalledWith(
    '/api/v1/battles/{battle_id}/answers',
    expect.objectContaining({
      body: { client_answer_id: 'saved-key', question_id: 'q0', value: 'Ответ Б' },
    }),
  );
  expect(localStorage.getItem('remora:battle-answer:u1:b1')).toBeNull();
});
it('не скрывает комнату при сбое polling', async () => {
  setup();
  await screen.findByText('Комната ожидания');
  vi.mocked(api.GET).mockRejectedValue(new Error('offline'));
  await screen.findByText(/Не удалось обновить комнату/, {}, { timeout: 2500 });
  expect(screen.getByRole('button', { name: 'Я готов' })).toBeTruthy();
});
it('после последнего ответа ждёт общего финиша без повторного показа вопроса', async () => {
  vi.mocked(api.GET).mockResolvedValue({
    data: room({ status: 'active', participants: [{ ...player, answered_count: 4 }] }),
  } as never);
  setup();
  await screen.findByText('Вы ответили на все вопросы');
  expect(screen.queryByRole('button', { name: 'Ответ А' })).toBeNull();
});
it.each(['expired', 'cancelled'] as const)('показывает конечное состояние %s', async (status) => {
  vi.mocked(api.GET).mockResolvedValue({ data: room({ status }) } as never);
  setup();
  await screen.findByRole('link', { name: 'Новая битва' });
  expect(screen.queryByRole('button', { name: 'Я готов' })).toBeNull();
});
it('показывает ничью и ошибку разбора с повтором, сохраняет ключ реванша', async () => {
  const finished = room({
    status: 'finished',
    is_draw: true,
    participants: [{ ...player, correct_count: 4, duration_ms: 5000 }],
  });
  vi.mocked(api.GET).mockImplementation(
    async (path) =>
      ({
        data: String(path).endsWith('/result') ? undefined : finished,
        error: String(path).endsWith('/result') ? { message: 'fail' } : undefined,
      }) as never,
  );
  vi.mocked(api.POST).mockResolvedValue({ error: { message: 'Ошибка реванша' } } as never);
  setup();
  await screen.findByRole('heading', { name: 'Ничья' });
  await screen.findByText(/Не удалось загрузить разбор/);
  fireEvent.click(screen.getByRole('button', { name: 'Реванш' }));
  await screen.findByText('Ошибка реванша');
  fireEvent.click(screen.getByRole('button', { name: 'Реванш' }));
  await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.POST).mock.calls[0]?.[1]).toEqual(vi.mocked(api.POST).mock.calls[1]?.[1]);
});
it('подтверждает выход, сохраняет ошибку и позволяет остаться', async () => {
  vi.mocked(api.POST).mockResolvedValue({ error: { message: 'Выход не подтверждён' } } as never);
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Выйти из битвы' }));
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить выход' }));
  await screen.findByText('Выход не подтверждён');
  fireEvent.click(screen.getByRole('button', { name: 'Остаться' }));
  expect(screen.queryByText('Выйти из битвы?')).toBeNull();
});
it('клавиши 1–4 отправляют выбранный ответ', async () => {
  vi.mocked(api.GET).mockResolvedValue({ data: room({ status: 'active' }) } as never);
  vi.mocked(api.POST).mockRejectedValue(new Error('offline'));
  setup();
  await screen.findByRole('heading', { name: 'Вопрос 1 из 4' });
  fireEvent.keyDown(window, { key: '2' });
  await waitFor(() =>
    expect(api.POST).toHaveBeenCalledWith(
      '/api/v1/battles/{battle_id}/answers',
      expect.objectContaining({ body: expect.objectContaining({ value: 'Ответ Б' }) }),
    ),
  );
});

it('переносит фокус на каждый новый вопрос и на итог при прохождении через Tab и Enter', async () => {
  const { default: userEvent } = await import('@testing-library/user-event');
  const keyboard = userEvent.setup();
  let accepted = 0;
  let current = room({ status: 'active' });
  vi.mocked(api.GET).mockImplementation(
    async (path) =>
      ({ data: String(path).endsWith('/result') ? { ...current, review: [] } : current }) as never,
  );
  vi.mocked(api.POST).mockImplementation(async () => {
    accepted += 1;
    current = room({
      status: accepted === 4 ? 'finished' : 'active',
      is_draw: accepted === 4,
      participants: [
        { ...player, answered_count: accepted, correct_count: accepted === 4 ? 1 : null },
      ],
    });
    return { data: { room: current, accepted: true, duplicate: false } } as never;
  });
  setup();
  for (let i = 1; i <= 4; i += 1) {
    const heading = await screen.findByRole('heading', { name: `Вопрос ${i} из 4` });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    await keyboard.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ответ А' }));
    await keyboard.keyboard('{Enter}');
  }
  const result = await screen.findByRole('heading', { name: 'Ничья' });
  await waitFor(() => expect(document.activeElement).toBe(result));
  expect(accepted).toBe(4);
});
