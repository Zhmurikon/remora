// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '../features/auth/auth-store';
import { api } from '../lib/api';
import { AccountDeletion } from './SettingsPage';

vi.mock('../lib/api', () => ({
  api: { POST: vi.fn() },
  clearAccessToken: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  useAuthStore.setState({ status: 'authenticated' });
});

it('требует подтверждение и передаёт выбранную судьбу публичных курсов', async () => {
  vi.mocked(api.POST).mockResolvedValue({
    data: { scheduled_for: '2026-11-25T00:00:00Z' },
  } as never);
  render(<AccountDeletion />);

  await userEvent.click(screen.getByLabelText('Анонимно передать в «Архив сообщества»'));
  await userEvent.type(screen.getByLabelText('Текущий пароль'), 'Str0ngP@ss!');
  await userEvent.click(
    screen.getByLabelText('Я понимаю, что через 30 дней данные нельзя будет восстановить.'),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));

  await waitFor(() =>
    expect(api.POST).toHaveBeenCalledWith('/api/v1/auth/delete-account', {
      body: {
        password: 'Str0ngP@ss!',
        confirmation: 'УДАЛИТЬ',
        public_content: 'archive_public',
      },
    }),
  );
  expect(useAuthStore.getState().status).toBe('guest');
});
