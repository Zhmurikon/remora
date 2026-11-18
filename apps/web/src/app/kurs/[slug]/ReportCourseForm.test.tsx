// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ReportCourseForm } from './ReportCourseForm';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function refreshOk() {
  return new Response(JSON.stringify({ access_token: 'token' }));
}

it('отправляет жалобу с причиной и комментарием', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(refreshOk())
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'r1', reason: 'spam', status: 'open' }), { status: 201 }),
    );
  vi.stubGlobal('fetch', request);
  const sent = vi.fn();
  render(<ReportCourseForm slug="course" onClose={vi.fn()} onSent={sent} />);

  await userEvent.selectOptions(screen.getByLabelText('Причина жалобы'), 'spam');
  await userEvent.type(screen.getByRole('textbox'), 'Реклама в теории');
  await userEvent.click(screen.getByRole('button', { name: 'Отправить жалобу' }));

  expect(sent).toHaveBeenCalledOnce();
  expect(request).toHaveBeenLastCalledWith(
    'http://localhost:8000/api/v1/courses/public/course/report',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ reason: 'spam', comment: 'Реклама в теории' }),
    }),
  );
});

it('различает повторную жалобу по коду ошибки, а не по тексту', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(refreshOk())
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'CONFLICT', message: 'что угодно' }), { status: 409 }),
    );
  vi.stubGlobal('fetch', request);
  render(<ReportCourseForm slug="course" onClose={vi.fn()} onSent={vi.fn()} />);

  await userEvent.click(screen.getByRole('button', { name: 'Отправить жалобу' }));

  expect((await screen.findByRole('alert')).textContent).toContain('уже отправили жалобу');
});

it('ведёт на вход, когда сессия не восстановилась', async () => {
  const assign = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 401 })));
  vi.stubGlobal('location', { href: 'https://remora.test/kurs/course', assign });
  render(<ReportCourseForm slug="course" onClose={vi.fn()} onSent={vi.fn()} />);

  await userEvent.click(screen.getByRole('button', { name: 'Отправить жалобу' }));

  expect(assign).toHaveBeenCalledWith('/login?next=https%3A%2F%2Fremora.test%2Fkurs%2Fcourse');
});
