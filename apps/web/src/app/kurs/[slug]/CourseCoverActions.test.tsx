// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { CourseCoverActions } from './CourseCoverActions';
const course = {
  id: 'course-id',
  slug: 'sample',
  title: 'Курс',
  likesCount: 0,
  savesCount: 0,
  liked: false,
};

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
        JSON.stringify({
          code: 'CONFLICT',
          message: 'Собственный материал уже доступен в библиотеке',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  vi.stubGlobal('fetch', fetchMock);

  render(<CourseCoverActions course={course} />);
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить курс' }));

  expect(await screen.findByText('Собственный материал уже доступен в библиотеке')).toBeTruthy();
});

it('сохраняет текст и карточки выбранного урока отдельно и закрывает меню', async () => {
  const request = vi.fn(
    async (url: string) =>
      new Response(JSON.stringify(url.endsWith('/refresh') ? { access_token: 'token' } : {})),
  );
  vi.stubGlobal('fetch', request);
  const lesson = { id: 'article-1', setId: 'set-1', title: 'Первый урок', hasCards: true };
  const view = render(<CourseCoverActions course={course} lesson={lesson} />);
  const trigger = screen.getByLabelText('Ещё действия');
  await userEvent.click(trigger);
  expect(
    screen.getByRole('link', { name: 'Скопировать только статью' }).getAttribute('href'),
  ).toMatch(/\?article=article-1&text_only=1$/);
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить только статью' }));
  expect(await screen.findByText('Статья «Первый урок» сохранена в библиотеке.')).toBeTruthy();
  expect(request).toHaveBeenLastCalledWith(
    expect.stringMatching(/\/library$/),
    expect.objectContaining({
      body: JSON.stringify({ target_type: 'article', target_id: 'article-1', text_only: true }),
    }),
  );
  expect(trigger.closest('details')?.open).toBe(false);
  expect(document.activeElement).toBe(trigger);

  view.rerender(
    <CourseCoverActions
      course={course}
      lesson={{ ...lesson, id: 'article-2', setId: 'set-2', title: 'Второй урок' }}
    />,
  );
  await userEvent.click(trigger);
  expect(
    screen.getByRole('link', { name: 'Скопировать только карточки' }).getAttribute('href'),
  ).toMatch(/\?set=set-2$/);
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить только карточки' }));
  expect(
    await screen.findByText('Карточки урока «Второй урок» сохранены в библиотеке.'),
  ).toBeTruthy();
  expect(request).toHaveBeenLastCalledWith(
    expect.stringMatching(/\/library$/),
    expect.objectContaining({ body: JSON.stringify({ target_type: 'set', target_id: 'set-2' }) }),
  );
});

it('предлагает действия, доступные для урока без карточек', async () => {
  render(
    <CourseCoverActions
      course={course}
      lesson={{ id: 'one', setId: 'empty', title: 'Теория', hasCards: false }}
    />,
  );
  const trigger = screen.getByLabelText('Ещё действия');
  trigger.focus();
  await userEvent.keyboard('{ArrowDown}');
  expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Сделать копию' }));
  expect(screen.queryByText('Скопировать только карточки')).toBeNull();
  expect(screen.queryByText('Сохранить только карточки')).toBeNull();
  await userEvent.keyboard('{Escape}');
  expect(trigger.closest('details')?.open).toBe(false);
  expect(document.activeElement).toBe(trigger);
});
