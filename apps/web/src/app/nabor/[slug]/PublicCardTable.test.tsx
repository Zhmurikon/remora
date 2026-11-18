// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PublicCardTable } from './PublicCardTable';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('меняет общие колонки стрелками в пределах 30–70% и сбрасывает пропорции', () => {
  render(
    <PublicCardTable>
      <ol>
        <li>Карточка остаётся доступна</li>
      </ol>
    </PublicCardTable>,
  );
  const separator = screen.getByRole('separator');
  const share = () => separator.getAttribute('aria-valuenow');
  expect(share()).toBe('50');
  fireEvent.keyDown(separator, { key: 'ArrowRight' });
  expect(share()).toBe('52');
  fireEvent.keyDown(separator, { key: 'ArrowRight', shiftKey: true });
  expect(share()).toBe('62');
  fireEvent.keyDown(separator, { key: 'End' });
  fireEvent.keyDown(separator, { key: 'ArrowRight' });
  expect(share()).toBe('70');
  fireEvent.keyDown(separator, { key: 'Home' });
  fireEvent.keyDown(separator, { key: 'ArrowLeft' });
  expect(share()).toBe('30');
  expect(separator.getAttribute('aria-valuetext')).toBe('Термин 30%, определение 70%');
  fireEvent.click(screen.getByRole('button', { name: 'Поровну' }));
  expect(share()).toBe('50');
  expect(screen.getByText('Карточка остаётся доступна')).toBeTruthy();
});

it('ограничивает перетаскивание и прекращает изменение после отпускания', () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  render(
    <PublicCardTable>
      <p>Содержимое</p>
    </PublicCardTable>,
  );
  const separator = screen.getByRole('separator');
  separator.setPointerCapture = vi.fn();
  separator.hasPointerCapture = vi.fn(() => false);
  for (const cell of [screen.getByText('Термин'), screen.getByText('Определение').parentElement!]) {
    vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue({ width: 200 } as DOMRect);
  }
  fireEvent.pointerDown(separator, { button: 0, clientX: 200 });
  fireEvent.pointerMove(separator, { clientX: 1000 });
  expect(separator.getAttribute('aria-valuenow')).toBe('70');
  fireEvent.pointerUp(separator);
  fireEvent.pointerMove(separator, { clientX: -1000 });
  expect(separator.getAttribute('aria-valuenow')).toBe('70');
  fireEvent.pointerDown(separator, { button: 0, clientX: 200 });
  fireEvent.pointerMove(separator, { clientX: -1000 });
  expect(separator.getAttribute('aria-valuenow')).toBe('30');
  fireEvent.pointerCancel(separator);
  fireEvent.doubleClick(separator);
  expect(separator.getAttribute('aria-valuenow')).toBe('50');
});
