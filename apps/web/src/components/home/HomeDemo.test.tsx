// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { HomeDemo } from './HomeDemo';
import { HomeNav } from './HomeNav';
import { ModePreview } from './ModePreview';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('проходит пять вопросов, считает ошибки, переносит фокус и сбрасывает результат', async () => {
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  const user = userEvent.setup();
  render(<HomeDemo />);
  await user.click(screen.getByRole('button', { name: 'Сеул' }));
  expect(screen.getByRole('status').textContent).toContain('Не совсем. Токио');
  expect((screen.getByRole('button', { name: 'Токио' }) as HTMLButtonElement).disabled).toBe(true);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Следующий вопрос' }));
  await user.keyboard('{Enter}');
  expect(document.activeElement).toBe(
    screen.getByRole('heading', { name: 'Как переводится knowledge?' }),
  );
  for (const answer of ['Знание', 'Фотосинтез', '180°', 'Александр Пушкин']) {
    await user.click(screen.getByRole('button', { name: answer }));
    await user.keyboard('{Enter}');
  }
  expect(screen.getByText('4 из 5')).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Первый шаг сделан' }));
  expect(screen.getByRole('link', { name: 'Создать свои карточки' }).getAttribute('href')).toBe(
    '/register',
  );
  expect(request).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Пройти ещё раз' }));
  expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0');
  expect(screen.getByRole('heading', { name: 'Столица Японии?' })).toBeTruthy();
  expect(screen.queryByText('4 из 5')).toBeNull();
});

it('позволяет перевернуть карточку клавиатурой и посмотреть другие режимы', async () => {
  const user = userEvent.setup();
  render(<ModePreview />);
  const card = screen.getByRole('button', { name: 'Knowledge. Показать перевод' });
  card.focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('button', { name: 'Знание. Показать слово' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Письмо' }));
  expect(screen.getByText('Как переводится knowledge?')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Письмо' }).getAttribute('aria-pressed')).toBe('true');
});

it('закрывает мобильное меню по Escape и возвращает фокус', async () => {
  const user = userEvent.setup();
  render(<HomeNav />);
  const toggle = screen.getByRole('button', { name: 'Открыть меню' });
  await user.click(toggle);
  const nav = screen.getByRole('navigation', { name: 'Мобильная навигация' });
  (nav.querySelector('a') as HTMLAnchorElement).focus();
  await user.keyboard('{Escape}');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(toggle);
});
