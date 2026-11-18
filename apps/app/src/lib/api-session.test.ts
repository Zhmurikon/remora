import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { User } from '../features/auth/auth-store';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'http://localhost');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function token(sub: string) {
  return `header.${btoa(JSON.stringify({ sub }))}.signature`;
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

it('не подменяет владельца вкладки токеном из cookie другого аккаунта', async () => {
  const { useAuthStore } = await import('../features/auth/auth-store');
  useAuthStore.getState().authenticate({ id: 'owner' } as User);
  const fetchMock = vi.fn(async (request: Request | string) =>
    typeof request === 'string' ? json({ access_token: token('other') }) : json({}, 401),
  );
  vi.stubGlobal('fetch', fetchMock);
  const { api, setAccessToken } = await import('./api');
  setAccessToken(token('owner'));
  const response = await api.GET('/api/v1/practice/python/progress');
  expect(response.response.status).toBe(401);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(useAuthStore.getState().status).toBe('guest');
});

it('не заменяет токен нового сеанса поздним ответом refresh прежнего', async () => {
  const { useAuthStore } = await import('../features/auth/auth-store');
  useAuthStore.getState().authenticate({ id: 'owner' } as User);
  let finish!: (value: Response) => void;
  const fetchMock = vi.fn(async (request: Request | string) => {
    if (typeof request === 'string')
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    return request.headers.get('Authorization') === `Bearer ${token('other')}`
      ? json([])
      : json({}, 401);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { api, setAccessToken, clearAccessToken } = await import('./api');
  setAccessToken(token('owner'));
  const pending = api.GET('/api/v1/practice/python/progress');
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  clearAccessToken();
  useAuthStore.getState().becomeGuest();
  useAuthStore.getState().authenticate({ id: 'other' } as User);
  setAccessToken(token('other'));
  finish(json({ access_token: token('owner') }));
  expect((await pending).response.status).toBe(401);
  expect((await api.GET('/api/v1/practice/python/progress')).data).toEqual([]);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it('сохраняет обычный refresh и повтор запроса в том же аккаунте', async () => {
  const { useAuthStore } = await import('../features/auth/auth-store');
  useAuthStore.getState().authenticate({ id: 'owner' } as User);
  const fetchMock = vi.fn(async (request: Request | string) => {
    if (typeof request === 'string') return json({ access_token: token('owner') });
    return request.headers.has('Authorization') ? json([]) : json({}, 401);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { api } = await import('./api');
  expect((await api.GET('/api/v1/practice/python/progress')).data).toEqual([]);
  expect(useAuthStore.getState().user?.id).toBe('owner');
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
