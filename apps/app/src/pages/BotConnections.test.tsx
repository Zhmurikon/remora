// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { BotConnections } from './BotConnections';

vi.mock('../lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() } }));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function setup() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <BotConnections />
    </QueryClientProvider>,
  );
  return cache;
}

it('показывает одноразовую команду, не сохраняя код в кеше', async () => {
  vi.mocked(api.GET).mockResolvedValue({ data: [] } as never);
  vi.mocked(api.POST).mockResolvedValue({
    data: {
      code: 'one-time-secret',
      expires_at: new Date(Date.now() + 600000).toISOString(),
      bot_url: 'https://t.me/test',
    },
  } as never);
  const cache = setup();
  await userEvent.click(await screen.findByRole('button', { name: 'Подключить Telegram' }));
  expect(((await screen.findByLabelText('Команда привязки')) as HTMLInputElement).value).toBe(
    '/link one-time-secret',
  );
  expect(JSON.stringify(cache.getQueryCache().getAll())).not.toContain('one-time-secret');
  await userEvent.click(screen.getByRole('button', { name: 'Скрыть код' }));
  expect(screen.queryByLabelText('Команда привязки')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Боты Telegram и VK' }));
});

it('подтверждает отзыв и показывает сетевую ошибку', async () => {
  vi.mocked(api.GET).mockResolvedValue({
    data: [{ id: 'link', platform: 'vk', actor_id: '123' }],
  } as never);
  vi.mocked(api.DELETE).mockResolvedValue({ error: { message: 'Нет связи' } } as never);
  setup();
  await userEvent.click(await screen.findByRole('button', { name: 'Отключить VK' }));
  expect(api.DELETE).not.toHaveBeenCalled();
  const dialog = screen.getByRole('alertdialog', { name: 'Отключить VK?' });
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Отмена' }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Отключить VK' }));
  await userEvent.click(screen.getByRole('button', { name: 'Отключить VK' }));
  await userEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Отключить VK' }),
  );
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Нет связи'));
});
