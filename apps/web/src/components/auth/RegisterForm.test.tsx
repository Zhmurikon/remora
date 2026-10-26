// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { OFFER_VERSION, PDN_CONSENT_VERSION } from '../../lib/legal';
import { authApi } from '../../lib/auth-api';
import { RegisterForm } from './RegisterForm';

vi.mock('../../lib/auth-api', () => ({
  authApi: { POST: vi.fn() },
  getErrorMessage: () => 'Ошибка',
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('запрашивает представителя для ребёнка и передаёт версии документов', async () => {
  vi.mocked(authApi.POST).mockResolvedValue({ data: {} } as never);
  render(<RegisterForm />);
  await userEvent.type(screen.getByLabelText('Email'), 'child@example.com');
  await userEvent.type(screen.getByLabelText('Имя пользователя'), 'childuser');
  await userEvent.type(screen.getByLabelText('Пароль'), 'Str0ngP@ss!');
  await userEvent.type(screen.getByLabelText('Дата рождения'), '2020-01-01');
  await userEvent.type(
    await screen.findByLabelText('Email законного представителя'),
    'guardian@example.com',
  );
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

  await waitFor(() =>
    expect(authApi.POST).toHaveBeenCalledWith(
      '/api/v1/auth/register',
      expect.objectContaining({
        body: expect.objectContaining({
          birth_date: '2020-01-01',
          guardian_email: 'guardian@example.com',
          pdn_version: PDN_CONSENT_VERSION,
          offer_version: OFFER_VERSION,
        }),
      }),
    ),
  );
});
