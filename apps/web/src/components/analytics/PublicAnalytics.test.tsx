// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://zapominalnya.ru/"}
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PublicAnalytics } from './PublicAnalytics';

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete window.Ya;
  document.querySelector('script[src*="mc.yandex.ru"]')?.remove();
});

it('не загружает счётчик до согласия и отменяет просмотр при отзыве во время загрузки', async () => {
  const { rerender } = render(<PublicAnalytics path="/privacy" settings />);
  const scripts = () => document.querySelector<HTMLScriptElement>('script[src*="mc.yandex.ru"]');
  expect(scripts()).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Отказаться' }));
  expect(scripts()).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Разрешить' }));
  const script = scripts();
  expect(script).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Отказаться' }));
  const hit = vi.fn();
  const destruct = vi.fn();
  window.Ya = {
    Metrika2: class {
      hit = hit;
      destruct = destruct;
    },
  };
  script!.dispatchEvent(new Event('load'));
  await Promise.resolve();
  expect(hit).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Разрешить' }));
  await waitFor(() => expect(hit).toHaveBeenCalledTimes(1));
  expect(hit.mock.calls[0]?.[0]).toBe('https://zapominalnya.ru/privacy');
  rerender(<PublicAnalytics path="/tarify" settings />);
  await waitFor(() => expect(hit).toHaveBeenCalledTimes(2));
  expect(hit.mock.calls[1]).toEqual([
    'https://zapominalnya.ru/tarify',
    { referer: 'https://zapominalnya.ru/privacy' },
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Отказаться' }));
  expect(destruct).toHaveBeenCalledTimes(2);
});

it('запоминает отказ и не показывает уведомление при следующем открытии', () => {
  const view = render(<PublicAnalytics path="/nabor/example" />);
  expect(screen.getByRole('heading', { name: 'Cookie для аналитики' })).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Политика конфиденциальности' }).getAttribute('href'),
  ).toBe('/privacy');
  fireEvent.click(screen.getByRole('button', { name: 'Отказаться' }));
  expect(localStorage.getItem('zapominalnya.analytics.v1')).toBe('no');
  expect(screen.queryByRole('complementary')).toBeNull();
  view.unmount();
  render(<PublicAnalytics path="/kursy" />);
  expect(screen.queryByRole('complementary')).toBeNull();
  expect(document.querySelector('script[src*="mc.yandex.ru"]')).toBeNull();
});

it('сохраняет английскую версию уведомления и ссылку на политику', () => {
  render(<PublicAnalytics path="/en/terms" english />);
  expect(screen.getByRole('heading', { name: 'Cookies for analytics' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href')).toBe(
    '/en/privacy',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
  expect(localStorage.getItem('zapominalnya.analytics.v1')).toBe('no');
});
