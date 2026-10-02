// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { LibraryUpdateControl } from './LibraryUpdateControl';

vi.mock('../../lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <LibraryUpdateControl saveId="save-1" title="Физика" />
    </QueryClientProvider>,
  );
}

it('показывает состав изменений и применяет обновление', async () => {
  vi.mocked(api.GET).mockResolvedValue({
    data: {
      save_id: 'save-1',
      has_updates: true,
      accepted_at: '2026-09-17T00:00:00Z',
      summary: ['Добавлено карточек: 2'],
    },
  } as never);
  vi.mocked(api.POST).mockResolvedValue({ data: {} } as never);
  mount();

  await userEvent.click(screen.getByRole('button', { name: 'Обновить «Физика»' }));
  expect(await screen.findByText('Добавлено карточек: 2')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Применить обновление' }));

  await waitFor(() =>
    expect(api.POST).toHaveBeenCalledWith('/api/v1/library/{save_id}/accept', {
      params: { path: { save_id: 'save-1' } },
    }),
  );
});

it('позволяет повторить загрузку состава изменений после ошибки', async () => {
  vi.mocked(api.GET)
    .mockResolvedValueOnce({ error: { code: 'NETWORK_ERROR' } } as never)
    .mockResolvedValueOnce({
      data: {
        save_id: 'save-1',
        has_updates: true,
        accepted_at: '2026-09-17T00:00:00Z',
        summary: [],
      },
    } as never);
  mount();

  await userEvent.click(screen.getByRole('button', { name: 'Обновить «Физика»' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Не удалось загрузить изменения');
  await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(await screen.findByText('Автор обновил свойства материала.')).toBeTruthy();
});
