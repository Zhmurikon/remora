// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { SetLearnSettings } from './SetLearnSettings';
vi.mock('../../lib/api', () => ({ api: { GET: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() } }));
const common = {
  question_types: ['choice', 'recall'],
  successes_required: 1,
  session_size: 10,
  typing_check: 'automatic',
  match_percent: 90,
  customized: false,
};
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(callback, 0),
  );
  vi.mocked(api.GET).mockResolvedValue({ data: common } as never);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup(disabled = false) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <SetLearnSettings setId="set" disabled={disabled} />
    </QueryClientProvider>,
  );
  return cache;
}
it('сохраняет черновик при обновлении кеша, отменяет и сообщает об ошибке без потери ввода', async () => {
  const cache = setup();
  const count = await screen.findByLabelText('Карточек в сессии');
  fireEvent.change(count, { target: { value: '15' } });
  await act(async () => {
    cache.setQueryData(['study', 'set-learn-settings', 'set'], { ...common, session_size: 20 });
  });
  expect((count as HTMLInputElement).value).toBe('15');
  vi.mocked(api.PUT)
    .mockRejectedValueOnce(new Error('Нет связи'))
    .mockResolvedValueOnce({ data: { ...common, session_size: 15, customized: true } } as never);
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить для набора' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Нет связи');
  expect((count as HTMLInputElement).value).toBe('15');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить для набора' }));
  await screen.findByText('Настройки этого набора сохранены');
  expect(screen.getByText('Для этого набора')).toBeTruthy();
  fireEvent.change(count, { target: { value: '20' } });
  await userEvent.click(screen.getByRole('button', { name: 'Отменить' }));
  expect((count as HTMLInputElement).value).toBe('15');
});
it('подтверждает сброс и перечитывает общие параметры после ответа 204', async () => {
  vi.mocked(api.GET)
    .mockResolvedValueOnce({ data: { ...common, session_size: 20, customized: true } } as never)
    .mockResolvedValue({ data: common } as never);
  vi.mocked(api.DELETE).mockResolvedValue({} as never);
  setup();
  await userEvent.click(await screen.findByRole('button', { name: 'Использовать общие' }));
  expect(api.DELETE).not.toHaveBeenCalled();
  await userEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Отмена' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Использовать общие' }));
  await userEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Использовать общие' }),
  );
  await screen.findByText('Снова используются общие настройки');
  expect((screen.getByLabelText('Карточек в сессии') as HTMLInputElement).value).toBe('10');
  expect(screen.queryByRole('alertdialog')).toBeNull();
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Настройки заучивания' }),
    ),
  );
});
it('не сохраняет пустой набор упражнений и блокирует запись для пустого набора', async () => {
  setup();
  await userEvent.click(await screen.findByLabelText('Выбор ответа'));
  await userEvent.click(screen.getByLabelText('Карточка с самооценкой'));
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить для набора' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Выберите хотя бы один');
  expect(api.PUT).not.toHaveBeenCalled();
  cleanup();
  setup(true);
  await screen.findByLabelText('Карточек в сессии');
  expect(
    (screen.getByRole('button', { name: 'Сохранить для набора' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
it('позволяет повторить загрузку после сбоя', async () => {
  vi.mocked(api.GET)
    .mockRejectedValueOnce(new Error('Нет связи'))
    .mockResolvedValue({ data: common } as never);
  setup();
  await userEvent.click(await screen.findByRole('button', { name: 'Повторить загрузку' }));
  expect(await screen.findByLabelText('Карточек в сессии')).toBeTruthy();
});
