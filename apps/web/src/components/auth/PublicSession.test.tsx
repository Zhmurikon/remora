// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PublicAuthLink, PublicSessionProvider } from './PublicSession';
import { LoginForm } from './LoginForm';
import { APP_URL } from '../../lib/auth-api';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('проверяет общую сессию один раз и обновляет все ссылки', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetcher);
  render(
    <StrictMode>
      <PublicSessionProvider>
        <PublicAuthLink />
        <PublicAuthLink />
      </PublicSessionProvider>
    </StrictMode>,
  );
  const links = await screen.findAllByRole('link', { name: 'Войти в приложение' });
  expect(links).toHaveLength(2);
  expect(links[0]?.getAttribute('href')).toBe(APP_URL);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining('/api/v1/auth/refresh'),
    expect.objectContaining({ credentials: 'include', method: 'POST' }),
  );
});

it.each([false, 'offline'])('оставляет гостю форму входа при ответе %s', async (result) => {
  vi.stubGlobal(
    'fetch',
    result === 'offline'
      ? vi.fn().mockRejectedValue(new Error('offline'))
      : vi.fn().mockResolvedValue({ ok: false }),
  );
  render(
    <PublicSessionProvider>
      <LoginForm />
      <PublicAuthLink />
    </PublicSessionProvider>,
  );
  expect(await screen.findByRole('heading', { name: 'Войдите в Remora' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Войти' }).getAttribute('href')).toBe('/login');
});

it('перенаправляет вошедшего пользователя без формы пароля', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  const replace = vi.fn();
  const original = window;
  vi.stubGlobal(
    'window',
    new Proxy(original, {
      get(target, key) {
        if (key === 'location') return { replace };
        const value: unknown = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  );
  render(
    <PublicSessionProvider>
      <LoginForm />
    </PublicSessionProvider>,
  );
  await waitFor(() => expect(replace).toHaveBeenCalledWith(APP_URL));
  expect(screen.queryByRole('button', { name: 'Войти' })).toBeNull();
});

it('перепроверяет сессию после возвращения из приложения', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValue({ ok: false });
  vi.stubGlobal('fetch', fetcher);
  render(
    <PublicSessionProvider>
      <PublicAuthLink />
    </PublicSessionProvider>,
  );
  await screen.findByRole('link', { name: 'Войти в приложение' });
  window.dispatchEvent(new Event('focus'));
  expect(await screen.findByRole('link', { name: 'Войти' })).toBeTruthy();
});
