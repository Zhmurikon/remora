import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { api } from '../../lib/api';
import { EntitlementManagement, UserManagement } from './UserManagement';

const baseUser = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'user',
  status: 'active',
  access: {
    features: { 'ai.generation': false },
    limits: { 'courses.total': 10 },
    overrides: [],
  },
} as never;

beforeEach(() => {
  vi.restoreAllMocks();
});

test('меняет роль только после повторного подтверждения и причины', async () => {
  const post = vi.spyOn(api, 'POST').mockResolvedValue({
    data: { confirmation_token: 'confirmation', expires_at: '2026-10-27T08:00:00Z' },
  } as never);
  const patch = vi.spyOn(api, 'PATCH').mockResolvedValue({ data: baseUser } as never);
  const onUpdated = vi.fn();
  const user = userEvent.setup();
  render(<UserManagement data={baseUser} onUpdated={onUpdated} />);

  await user.selectOptions(screen.getByLabelText('Роль'), 'teacher');
  await user.click(screen.getByRole('button', { name: 'Сохранить роль' }));
  expect(screen.getByText('Изменить роль на «Преподаватель»?')).toBeInTheDocument();

  await user.type(screen.getByLabelText('Причина изменения'), 'Назначение преподавателем');
  await user.type(screen.getByLabelText('Пароль администратора или код 2FA'), 'Strong-password-1');
  await user.click(screen.getByRole('button', { name: 'Изменить роль' }));

  expect(post).toHaveBeenCalledWith('/api/v1/admin/security/confirm', {
    body: { credential: 'Strong-password-1' },
  });
  expect(patch).toHaveBeenCalledWith(
    '/api/v1/admin/users/{user_id}/role',
    expect.objectContaining({
      body: { role: 'teacher', reason: 'Назначение преподавателем' },
      params: expect.objectContaining({
        header: expect.objectContaining({ 'X-Admin-Confirmation': 'confirmation' }),
      }),
    }),
  );
  expect(onUpdated).toHaveBeenCalledOnce();
});

test('выдаёт квоту из каталога через защищённую форму', async () => {
  vi.spyOn(api, 'POST').mockImplementation(async (path) => {
    if (path === '/api/v1/admin/security/confirm') {
      return {
        data: { confirmation_token: 'confirmation', expires_at: '2026-10-27T08:00:00Z' },
      } as never;
    }
    return { data: baseUser } as never;
  });
  const onUpdated = vi.fn();
  const user = userEvent.setup();
  render(<EntitlementManagement data={baseUser} onUpdated={onUpdated} />);

  await user.selectOptions(screen.getByLabelText('Возможность или квота'), 'limit.courses.total');
  await user.clear(screen.getByLabelText('Значение квоты'));
  await user.type(screen.getByLabelText('Значение квоты'), '25');
  await user.click(screen.getByRole('button', { name: 'Выдать право' }));
  await user.type(screen.getByLabelText('Причина изменения'), 'Индивидуальная квота курсов');
  await user.type(screen.getByLabelText('Пароль администратора или код 2FA'), 'Strong-password-1');
  await user.click(screen.getByRole('button', { name: 'Выдать право' }));

  expect(api.POST).toHaveBeenCalledWith(
    '/api/v1/admin/users/{user_id}/entitlements',
    expect.objectContaining({
      body: {
        key: 'limit.courses.total',
        value: 25,
        valid_until: null,
        reason: 'Индивидуальная квота курсов',
      },
    }),
  );
  expect(onUpdated).toHaveBeenCalledOnce();
});
