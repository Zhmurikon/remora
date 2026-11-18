// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PublicErrorShell, PublicState } from './PublicState';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('сохраняет полную публичную навигацию в глобальной ошибке', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn() }));
  render(
    <PublicErrorShell>
      <main>Ошибка</main>
    </PublicErrorShell>,
  );

  expect(screen.getByRole('link', { name: 'Каталог курсов' }).getAttribute('href')).toBe('/kursy');
  expect(screen.getByRole('link', { name: 'Преподавателям' }).getAttribute('href')).toBe(
    '/#class-plan',
  );
  expect(screen.getByRole('link', { name: 'Создать аккаунт' }).getAttribute('href')).toBe(
    '/register',
  );
});

it('показывает безопасный переход после 404', () => {
  render(
    <PublicState
      code="404"
      title="Страница не найдена"
      description="Ссылка могла измениться."
      primaryHref="/"
      primaryLabel="На главную"
      secondaryHref="/kursy"
      secondaryLabel="Каталог курсов"
    />,
  );

  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Страница не найдена');
  expect(screen.getByRole('link', { name: 'На главную' }).getAttribute('href')).toBe('/');
  expect(screen.getByRole('link', { name: 'Каталог курсов' }).getAttribute('href')).toBe('/kursy');
});

it('повторяет загрузку из состояния ошибки', () => {
  const retry = vi.fn();
  render(
    <PublicState
      variant="error"
      title="Не удалось загрузить страницу"
      description="Проверьте соединение."
      primaryLabel="Повторить"
      onRetry={retry}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alert').textContent).toBe('Проверьте соединение.');
});
