import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { api } from '../lib/api';
import { SystemPage } from './SystemPage';

test('показывает состояние, флаг и защищённое закрытие инцидента', async () => {
  vi.spyOn(api, 'GET').mockResolvedValue({
    data: {
      checks: [
        {
          key: 'worker',
          label: 'Worker',
          group: 'Основа',
          state: 'degraded',
          detail: 'Heartbeat worker не найден',
          checked_at: '2026-10-28T00:00:00Z',
        },
      ],
      flags: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          key: 'catalog.preview',
          description: 'Новая выдача',
          enabled: true,
          effective: true,
          environment: 'local',
          owner: 'Продукт',
          expires_at: null,
          updated_at: '2026-10-28T00:00:00Z',
          updated_by: 'admin',
        },
      ],
      incidents: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          title: 'Задержка очереди',
          summary: 'Экспорт ожидал обработки дольше нормы.',
          severity: 'medium',
          status: 'open',
          external_url: null,
          started_at: '2026-10-28T00:00:00Z',
          resolved_at: null,
          created_at: '2026-10-28T00:00:00Z',
          updated_at: '2026-10-28T00:00:00Z',
          updated_by: 'admin',
        },
      ],
      monitoring_links: [],
      checked_at: '2026-10-28T00:00:00Z',
    },
  } as never);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SystemPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Heartbeat worker не найден')).toBeInTheDocument();
  expect(screen.getByText('catalog.preview')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
  expect(screen.getByRole('heading', { name: 'Закрыть инцидент' })).toBeInTheDocument();
  expect(screen.getByText('Изменение попадёт в административный аудит.')).toBeInTheDocument();
});
