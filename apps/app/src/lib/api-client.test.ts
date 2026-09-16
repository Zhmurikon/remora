import { createApiClient } from '@remora/api-client';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

it('повторяет POST с исходным телом и новым токеном после 401', async () => {
  const bodies: string[] = [];
  const tokens: (string | null)[] = [];
  let token = 'expired';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: Request) => {
      bodies.push(await request.text());
      tokens.push(request.headers.get('Authorization'));
      return bodies.length === 1
        ? new Response('{}', { status: 401 })
        : new Response('{"id":"created"}', {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
    }),
  );
  const refresh = vi.fn(async () => {
    token = 'fresh';
    return true;
  });
  const client = createApiClient({
    baseUrl: 'http://localhost',
    getAccessToken: () => token,
    onUnauthorized: refresh,
  });
  const result = await client.POST('/api/v1/courses', {
    body: { title: 'Алгебра', description: '', set_id: 'set-id' },
  });
  expect(result.response.status).toBe(201);
  expect(bodies).toEqual([
    JSON.stringify({ title: 'Алгебра', description: '', set_id: 'set-id' }),
    JSON.stringify({ title: 'Алгебра', description: '', set_id: 'set-id' }),
  ]);
  expect(tokens).toEqual(['Bearer expired', 'Bearer fresh']);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('не повторяет запрос, если refresh не удался', async () => {
  const fetchMock = vi.fn(async (request: Request) => {
    await request.text();
    return new Response('{}', { status: 401 });
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = createApiClient({
    baseUrl: 'http://localhost',
    onUnauthorized: async () => false,
  });
  expect(
    (
      await client.POST('/api/v1/courses', {
        body: { title: 'Курс', description: '', set_id: 'set-id' },
      })
    ).response.status,
  ).toBe(401);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
