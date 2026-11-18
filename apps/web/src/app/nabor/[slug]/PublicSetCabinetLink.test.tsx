// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PublicSetCabinetLink } from './PublicSetCabinetLink';

const state = vi.hoisted(() => ({ session: 'authenticated' }));
vi.mock('../../../components/auth/PublicSession', () => ({
  usePublicSession: () => state.session,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  state.session = 'authenticated';
});

it('не запрашивает личные данные гостя и не показывает недоступный переход', () => {
  state.session = 'guest';
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  render(<PublicSetCabinetLink setId="set-1" appUrl="/app" />);
  expect(request).not.toHaveBeenCalled();
  expect(screen.queryByRole('link')).toBeNull();
});

it('открывает именно этот набор после подтверждения доступа сервером', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'test-token' })))
    .mockResolvedValueOnce(new Response('{}'));
  vi.stubGlobal('fetch', request);
  render(<PublicSetCabinetLink setId="set-1" appUrl="/app" />);
  expect((await screen.findByRole('link')).getAttribute('href')).toBe('/app/sets/set-1');
  expect(request).toHaveBeenLastCalledWith(
    expect.stringContaining('/api/v1/sets/set-1'),
    expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
  );
});

it.each([403, 404, 503])('не показывает ссылку в кабинет при ответе %s', async (status) => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'test-token' })))
    .mockResolvedValueOnce(new Response('{}', { status }));
  vi.stubGlobal('fetch', request);
  render(<PublicSetCabinetLink setId="set-1" appUrl="/app" />);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('link')).toBeNull();
});

it('убирает ранее подтверждённый переход после выхода', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'test-token' })))
      .mockResolvedValueOnce(new Response('{}')),
  );
  const view = render(<PublicSetCabinetLink setId="set-1" appUrl="/app" />);
  await screen.findByRole('link');
  state.session = 'guest';
  view.rerender(<PublicSetCabinetLink setId="set-1" appUrl="/app" />);
  expect(screen.queryByRole('link')).toBeNull();
});
