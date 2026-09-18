// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { CourseLikeButton } from './CourseLikeButton';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('обновляет лайк после refresh авторизации', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token' })))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ likes_count: 4, liked_by_me: true }), { status: 200 }),
    );
  vi.stubGlobal('fetch', request);
  render(<CourseLikeButton slug="course" initialCount={3} initialLiked={false} />);

  await userEvent.click(screen.getByRole('button', { name: 'Нравится' }));

  expect(await screen.findByText('Лайков: 4')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Убрать лайк' })).toBeTruthy();
  expect(request).toHaveBeenLastCalledWith(
    'http://localhost:8000/api/v1/courses/public/course/like',
    expect.objectContaining({ method: 'POST' }),
  );
});
