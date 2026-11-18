// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BillingLimitDialog } from './BillingLimitDialog';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);
const details = { limit: 300, current: 290, requested: 20, resetsAt: '2026-11-23T00:00:00Z' };

it('показывает реальный остаток и ведёт к подписке без запуска оплаты', async () => {
  const close = vi.fn();
  render(
    <MemoryRouter>
      <BillingLimitDialog details={details} onClose={close} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('dialog', { name: 'Недостаточно минут' })).toBeTruthy();
  expect(screen.getByText(/потребуется 20 минут.*осталось 10/)).toBeTruthy();
  expect(screen.getByText('290 из 300 минут')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Посмотреть тарифы' }).getAttribute('href')).toBe(
    '/billing',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Вернуться к записи' }));
  expect(close).toHaveBeenCalledOnce();
});

it('закрывается при Escape и возвращает фокус после размонтирования', () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const close = vi.fn();
  const view = render(
    <MemoryRouter>
      <BillingLimitDialog details={details} onClose={close} />
    </MemoryRouter>,
  );
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});
