import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { api } from '../../lib/api';
import { LoginPage } from './LoginPage';

const authenticate = vi.fn();

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ authenticate }),
}));

beforeEach(() => {
  authenticate.mockReset();
});

test('проводит администратора через первичную настройку 2FA', async () => {
  const post = vi.spyOn(api, 'POST').mockImplementation(async (path) => {
    if (path === '/api/v1/admin/auth/login') {
      return { data: { step: 'setup_required', token: 'setup-token' } } as never;
    }
    if (path === '/api/v1/admin/auth/2fa/setup') {
      return {
        data: {
          secret: 'ABCDEFGHIJKLMNOP',
          provisioning_uri: 'otpauth://totp/test',
        },
      } as never;
    }
    return {
      data: {
        access_token: 'admin-access',
        token_type: 'bearer',
        user: { id: 'user-id', username: 'owner', role: 'admin' },
        recovery_codes: ['AAAA-BBBB-CCCC', 'DDDD-EEEE-FFFF'],
      },
    } as never;
  });
  const user = userEvent.setup();
  render(<LoginPage />);

  await user.type(screen.getByLabelText('Электронная почта'), 'owner@example.com');
  await user.type(screen.getByLabelText('Пароль'), 'Strong-password-1');
  await user.click(screen.getByRole('button', { name: 'Продолжить' }));

  expect(await screen.findByText('Настройка двухфакторного входа')).toBeInTheDocument();
  expect(screen.getByText('ABCDEFGHIJKLMNOP')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Код из приложения'), '123456');
  await user.click(screen.getByRole('button', { name: 'Подтвердить' }));

  expect(await screen.findByText('Сохраните коды восстановления')).toBeInTheDocument();
  expect(screen.getByText('AAAA-BBBB-CCCC')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Я сохранил коды' }));

  expect(authenticate).toHaveBeenCalledWith(
    expect.objectContaining({ role: 'admin' }),
    'admin-access',
  );
  expect(post).toHaveBeenCalledTimes(3);
});
