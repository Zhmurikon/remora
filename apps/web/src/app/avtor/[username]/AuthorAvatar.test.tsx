// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthorAvatar } from './AuthorAvatar';
import AuthorError from './error';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('восстанавливает инициал после ошибки фотографии и принимает новый адрес', () => {
  const { container, rerender } = render(
    <AuthorAvatar name="Ирина" src="https://example.test/avatar.png" />,
  );
  const image = container.querySelector('img')!;
  expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
  fireEvent.error(image);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('И')).toBeTruthy();
  rerender(<AuthorAvatar name="Ирина" src="https://example.test/new-avatar.png" />);
  expect(container.querySelector('img')?.getAttribute('src')).toBe(
    'https://example.test/new-avatar.png',
  );
});

it('даёт повторить загрузку без раскрытия технической ошибки', () => {
  const reset = vi.fn();
  render(<AuthorError reset={reset} />);
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(reset).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalledOnce();
  expect(screen.getByRole('link', { name: /Каталог курсов/ }).getAttribute('href')).toBe('/kursy');
});
