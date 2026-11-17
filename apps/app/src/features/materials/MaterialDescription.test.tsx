// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { MaterialDescription } from './MaterialDescription';

afterEach(cleanup);

it('показывает короткое описание целиком', () => {
  const text = 'Краткое описание курса. Второе предложение.';
  render(<MaterialDescription description={text} />);
  expect(screen.getByText(text)).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});

it('раскрывает полный текст с абзацами и сворачивает его с клавиатуры', async () => {
  const lead = 'Конспект первой недели.';
  const body = 'Работа с таблицами и построение графиков. '.repeat(8).trim();
  render(<MaterialDescription description={lead + '\n\n' + body} />);
  const toggle = screen.getByRole('button', { name: 'Показать полное описание' });
  expect(screen.getByText(lead)).toBeTruthy();
  expect(screen.queryByText(body)).toBeNull();
  await userEvent.tab();
  await userEvent.keyboard('{Enter}');
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText(body)).toBeTruthy();
  await userEvent.keyboard('{Enter}');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByText(body)).toBeNull();
});

it('ограничивает длинное вступление без точки и возвращает его полностью', async () => {
  const text = 'вероятность '.repeat(50).trim();
  render(<MaterialDescription description={text} />);
  expect(screen.getByText(/…$/).textContent?.length).toBeLessThanOrEqual(240);
  await userEvent.click(screen.getByRole('button'));
  expect(screen.getByText(text)).toBeTruthy();
});
