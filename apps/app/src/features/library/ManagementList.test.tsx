// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ManageGroup, OrderedRows } from './ManagementList';

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('оставляет содержимое закрытой папки недоступным и раскрывает его кнопкой', async () => {
  render(
    <MemoryRouter>
      <ManageGroup title="Теория вероятностей" count={1} initialOpen={false} motion>
        <a href="/sets/set-1">Случайные величины</a>
      </ManageGroup>
    </MemoryRouter>,
  );

  const toggle = screen.getByRole('button', { name: /Теория вероятностей/ });
  expect(toggle.closest('.manage-group')?.classList.contains('manage-group-motion')).toBe(true);
  const body = document.querySelector('.manage-group-body') as HTMLElement;
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(body.getAttribute('aria-hidden')).toBe('true');
  expect(body.hasAttribute('inert')).toBe(true);

  await userEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(body.getAttribute('aria-hidden')).toBe('false');
  expect(body.hasAttribute('inert')).toBe(false);
});

it('анимирует перестановку строк через transform и отключает её при сокращённом движении', async () => {
  const animate = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value: animate,
  });
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const index = this.parentElement ? [...this.parentElement.children].indexOf(this) : 0;
    return {
      top: index * 76,
      bottom: index * 76 + 76,
      left: 0,
      right: 400,
      width: 400,
      height: 76,
      x: 0,
      y: index * 76,
      toJSON: () => ({}),
    };
  });

  function Example() {
    const [order, setOrder] = useState(['first', 'second']);
    const scope = useRef(new Map<string, DOMRect>());
    const items = order.map((id) => ({ id, title: id === 'first' ? 'Первый' : 'Второй' }));
    return (
      <OrderedRows
        items={items}
        fullOrder={order}
        onOrder={setOrder}
        custom
        motion
        motionScope={scope}
      >
        {(item) => <span>{item.title}</span>}
      </OrderedRows>
    );
  }

  render(<Example />);
  fireEvent.click(screen.getByRole('button', { name: 'Ниже — Первый' }));

  await waitFor(() => expect(animate).toHaveBeenCalled());
  expect(animate).toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ transform: 'translate(0px, -76px)' })]),
    expect.objectContaining({ duration: 180 }),
  );

  animate.mockClear();
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
  fireEvent.click(screen.getByRole('button', { name: 'Выше — Первый' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Первый — 1 из 2'));
  expect(animate).not.toHaveBeenCalled();
});
