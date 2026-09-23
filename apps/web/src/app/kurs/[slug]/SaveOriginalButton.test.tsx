// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { SaveOriginalButton } from './SaveOriginalButton';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('показывает сообщение API при попытке сохранить собственный курс', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token' })))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 'CONFLICT', message: 'Собственный материал уже доступен в библиотеке' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  vi.stubGlobal('fetch', fetchMock);

  render(<SaveOriginalButton targetType="course" targetId="course-id" label="Сохранить курс" />);
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить курс' }));

  expect(await screen.findByText('Собственный материал уже доступен в библиотеке')).toBeTruthy();
});
