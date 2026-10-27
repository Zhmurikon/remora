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

test('входит в админку по паролю, когда обязательный 2FA отключён', async () => {
  const post = vi.spyOn(api, 'POST').mockImplementation(async (path) => {
    if (path === '/api/v1/admin/auth/login') {
      return {
        data: {
          access_token: 'admin-access',
          token_type: 'bearer',
          user: { id: 'user-id', username: 'owner', role: 'admin' },
          recovery_codes: [],
        },
      } as never;
    }
    return {} as never;
  });
  const user = userEvent.setup();
  render(<LoginPage />);

  await user.type(screen.getByLabelText('Электронная почта'), 'owner@example.com');
  await user.type(screen.getByLabelText('Пароль'), 'Strong-password-1');
  await user.click(screen.getByRole('button', { name: 'Войти' }));

  expect(authenticate).toHaveBeenCalledWith(
    expect.objectContaining({ role: 'admin' }),
    'admin-access',
  );
  expect(post).toHaveBeenCalledOnce();
});
