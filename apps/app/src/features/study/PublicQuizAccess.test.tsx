// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { PublicQuizAccess } from './PublicQuizAccess';

vi.mock('../../lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

function openQuiz() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PublicQuizAccess setId="lesson-set">Настройки теста</PublicQuizAccess>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('сразу открывает квиз доступного набора', async () => {
  vi.mocked(api.GET).mockResolvedValue({ data: { id: 'lesson-set' } } as never);
  openQuiz();
  await screen.findByText('Настройки теста');
  expect(api.POST).not.toHaveBeenCalled();
});

it('сохраняет карточки по нажатию и повторно проверяет доступ', async () => {
  vi.mocked(api.GET)
    .mockResolvedValueOnce({ error: { code: 'FORBIDDEN' } } as never)
    .mockResolvedValueOnce({ data: { id: 'lesson-set' } } as never);
  vi.mocked(api.POST).mockResolvedValue({ data: { id: 'save' } } as never);
  openQuiz();
  const save = await screen.findByRole('button', { name: 'Сохранить карточки и открыть квиз' });
  expect(api.POST).not.toHaveBeenCalled();
  fireEvent.click(save);
  await screen.findByText('Настройки теста');
  expect(api.POST).toHaveBeenCalledWith('/api/v1/library', {
    body: { target_type: 'set', target_id: 'lesson-set', text_only: false },
  });
});

it('при ошибке сети предлагает повторить загрузку', async () => {
  vi.mocked(api.GET)
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce({ data: { id: 'lesson-set' } } as never);
  openQuiz();
  fireEvent.click(await screen.findByRole('button', { name: 'Повторить загрузку' }));
  await screen.findByText('Настройки теста');
  expect(api.POST).not.toHaveBeenCalled();
});
