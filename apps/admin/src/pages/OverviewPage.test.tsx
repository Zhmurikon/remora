import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { api } from '../lib/api';
import { OverviewPage } from './OverviewPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OverviewPage />
    </QueryClientProvider>,
  );
}

test('показывает простую сводку без вымышленных данных', async () => {
  vi.spyOn(api, 'GET').mockResolvedValue({
    data: {
      generated_at: '2026-10-02T04:00:00Z',
      users_total: 128,
      users_new_7d: 17,
      users_active_7d: 42,
      reviews_7d: 2401,
      sets_total: 356,
      courses_total: 29,
      courses_published: 12,
      reports_open: 3,
    },
  } as never);

  renderPage();

  expect(await screen.findByText('128')).toBeInTheDocument();
  expect(screen.getByText('17')).toBeInTheDocument();
  expect(screen.getByText('42')).toBeInTheDocument();
  expect(screen.getByText('2 401')).toBeInTheDocument();
  expect(screen.getByText('Открытые жалобы')).toBeInTheDocument();
  expect(screen.getByText('3')).toBeInTheDocument();
});
