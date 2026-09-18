// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { detachSession, flush } from './review-queue';
import { ResetProgress } from './ResetProgress';

vi.mock('../../lib/api', () => ({ api: { POST: vi.fn() } }));
vi.mock('./review-queue', () => ({
  flush: vi.fn(),
  detachSession: vi.fn(),
  pendingCount: () => 0,
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(flush).mockResolvedValue({ ok: true, sent: 0, left: 0 });
  vi.mocked(api.POST).mockResolvedValue({ response: new Response(null, { status: 204 }) } as never);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <ResetProgress setId="set-1" disabled={false} />
    </QueryClientProvider>,
  );
  return invalidate;
}

it('требует подтверждения и не сбрасывает при отмене', async () => {
  vi.mocked(window.confirm).mockReturnValue(false);
  mount();
  await userEvent.click(screen.getByRole('button'));
  expect(window.confirm).toHaveBeenCalled();
  expect(flush).not.toHaveBeenCalled();
  expect(api.POST).not.toHaveBeenCalled();
});

it('синхронизирует ответы, сбрасывает выбранный набор и обновляет статистику', async () => {
  const invalidate = mount();
  await userEvent.click(screen.getByRole('button'));
  expect(await screen.findByRole('status')).toBeTruthy();
  expect(api.POST).toHaveBeenCalledWith('/api/v1/study/sets/{set_id}/reset', {
    params: { path: { set_id: 'set-1' } },
  });
  expect(flush).toHaveBeenCalledOnce();
  expect(detachSession).toHaveBeenCalledOnce();
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['study'] });
});

it('при недоступной сети не удаляет очередь и позволяет повторить', async () => {
  vi.mocked(flush).mockResolvedValue({ ok: false, sent: 0, left: 3 });
  mount();
  await userEvent.click(screen.getByRole('button'));
  expect((await screen.findByRole('alert')).textContent).toContain('последние ответы');
  expect(api.POST).not.toHaveBeenCalled();
  expect(detachSession).not.toHaveBeenCalled();
  vi.mocked(flush).mockResolvedValue({ ok: true, sent: 3, left: 0 });
  await userEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
});

it('показывает ошибку сервера без сообщения об успехе', async () => {
  vi.mocked(api.POST).mockResolvedValue({ error: { code: 'ERROR' } } as never);
  mount();
  await userEvent.click(screen.getByRole('button'));
  expect((await screen.findByRole('alert')).textContent).toContain('Не удалось сбросить');
  expect(detachSession).not.toHaveBeenCalled();
  expect(screen.queryByRole('status')).toBeNull();
});
