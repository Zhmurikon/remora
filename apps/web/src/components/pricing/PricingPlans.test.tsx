// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { HomePricing } from '../home/HomePricing';
import { PricingPlans } from './PricingPlans';

afterEach(cleanup);

it('показывает годовую скидку в пересчёте на месяц и точную сумму платежа', () => {
  render(<PricingPlans />);

  expect(screen.getByText('208 ₽')).toBeTruthy();
  expect(screen.getByText('833 ₽')).toBeTruthy();
  expect(screen.getByText('Разовая оплата 2 499 ₽ за год')).toBeTruthy();
  expect(screen.getByText('Разовая оплата 9 999 ₽ за год')).toBeTruthy();
  expect(screen.getByText('299 ₽').tagName).toBe('DEL');
  expect(screen.getByText('999 ₽').tagName).toBe('DEL');
  expect(screen.getByRole('heading', { name: 'Plus' }).closest('article')?.className).toContain(
    'is-recommended',
  );
});

it('для месяца убирает сравнение со скидкой и показывает месячную цену', async () => {
  const user = userEvent.setup();
  render(<PricingPlans />);

  await user.click(screen.getByRole('button', { name: 'Месяц' }));

  expect(screen.getByRole('button', { name: 'Месяц' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText('299 ₽').tagName).toBe('STRONG');
  expect(screen.getByText('999 ₽').tagName).toBe('STRONG');
  expect((screen.getByText('Разовая оплата 2 499 ₽ за год') as HTMLElement).hidden).toBe(true);
  expect(screen.queryByText('208 ₽')).toBeNull();
});

it('связывает компактный блок с полной страницей тарифов', () => {
  render(<HomePricing />);

  expect(
    screen.getByRole('heading', { name: /Учиться — бесплатно.*Платите за масштаб/ }),
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Сравнить тарифы →' }).getAttribute('href')).toBe(
    '/tarify',
  );
  expect(screen.getByRole('link', { name: 'Начать бесплатно' }).getAttribute('href')).toBe(
    '/register',
  );
  expect(screen.getByRole('heading', { name: 'Plus' }).closest('article')?.className).toContain(
    'is-recommended',
  );
});
