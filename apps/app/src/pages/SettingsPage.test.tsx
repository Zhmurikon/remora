// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '../features/auth/auth-store';
import { api, clearAccessToken } from '../lib/api';
import { SettingsPage } from './SettingsPage';

vi.mock('../lib/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
  clearAccessToken: vi.fn(),
}));
const user = {
  id: 'u',
  email: 'test@example.com',
  username: 'alexey',
  display_name: 'Алексей',
  locale: 'ru',
  timezone: 'Europe/Moscow',
  role: 'user',
};
const study = {
  answer_strictness: 'moderate',
  daily_goal_cards: 20,
  fsrs_desired_retention: 0.9,
  fsrs_max_interval_days: 365,
  learn_match_percent: 90,
  learn_question_types: ['choice', 'recall'],
  learn_session_size: 10,
  learn_successes_required: 1,
  learn_typing_check: 'automatic',
  new_cards_per_day: 20,
  reviews_per_day: 200,
};
const session = {
  id: 's',
  current: false,
  user_agent: 'Firefox',
  ip: '127.0.0.1',
  expires_at: '2099-01-01',
};
beforeEach(() => {
  vi.resetAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(callback, 0),
  );
  useAuthStore.setState({ status: 'authenticated', user: user as never });
  vi.mocked(api.GET).mockImplementation(
    async (path) =>
      ({
        data:
          path === '/api/v1/study/settings'
            ? study
            : path === '/api/v1/auth/sessions'
              ? [session]
              : path === '/api/v1/users/me/export/latest'
                ? null
                : [],
      }) as never,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup(hash = '') {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={['/settings' + hash]}>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return cache;
}
async function section(name: string) {
  await userEvent.click(
    within(screen.getByRole('navigation', { name: 'Разделы настроек' })).getByRole('button', {
      name: new RegExp('^' + name),
    }),
  );
}

it('сохраняет черновик при смене раздела, отменяет к серверному снимку и не отправляет форму при переходе', async () => {
  setup();
  await userEvent.clear(screen.getByLabelText('Отображаемое имя'));
  await userEvent.type(screen.getByLabelText('Отображаемое имя'), 'Черновик');
  await section('Пароль');
  await section('Профиль');
  expect((screen.getByLabelText('Отображаемое имя') as HTMLInputElement).value).toBe('Черновик');
  expect(api.PATCH).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Отменить' }));
  expect((screen.getByLabelText('Отображаемое имя') as HTMLInputElement).value).toBe('Алексей');
  expect(
    (screen.getByRole('button', { name: 'Сохранить профиль' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

it('после сетевого сбоя сохраняет ввод, разрешает повтор и принимает серверный результат', async () => {
  vi.mocked(api.PATCH)
    .mockRejectedValueOnce(new Error('Нет соединения'))
    .mockResolvedValueOnce({ data: { ...user, display_name: 'Новое имя' } } as never);
  setup();
  await userEvent.clear(screen.getByLabelText('Отображаемое имя'));
  await userEvent.type(screen.getByLabelText('Отображаемое имя'), 'Новое имя');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Нет соединения');
  expect((screen.getByLabelText('Отображаемое имя') as HTMLInputElement).value).toBe('Новое имя');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));
  await screen.findByText('Профиль сохранён');
  expect(useAuthStore.getState().user?.display_name).toBe('Новое имя');
});

it('ищет только названия, раскрывает точные настройки и фокусирует поле', async () => {
  setup();
  await screen.findByLabelText('Целевое удержание, %');
  await userEvent.type(screen.getByRole('searchbox'), 'удержание');
  await userEvent.click(screen.getByRole('button', { name: /Целевое удержание, %/ }));
  const input = screen.getByLabelText('Целевое удержание, %');
  await waitFor(() => expect(document.activeElement).toBe(input));
  expect(input.closest('details')?.open).toBe(true);
  await userEvent.type(screen.getByRole('searchbox'), 'test@example.com');
  expect(screen.getByText('Ничего не найдено. Попробуйте другое название.')).toBeTruthy();
});

it('не перезаписывает учебный черновик фоновым запросом и сохраняет оба блока вместе', async () => {
  const cache = setup('#study');
  const goal = await screen.findByLabelText('Дневная цель, карточек');
  fireEvent.change(goal, { target: { value: '35' } });
  cache.setQueryData(['study', 'settings'], { ...study, daily_goal_cards: 99 });
  expect((goal as HTMLInputElement).value).toBe('35');
  vi.mocked(api.PATCH).mockResolvedValue({ data: { ...study, daily_goal_cards: 35 } } as never);
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить обучение' }));
  await screen.findByText('Настройки обучения сохранены');
  expect(api.PATCH).toHaveBeenCalledWith('/api/v1/study/settings', {
    body: { ...study, daily_goal_cards: 35 },
  });
});

it('запрещает пустой набор упражнений и показывает ошибку несовпадающих паролей у поля', async () => {
  setup('#study');
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Выбор ответа' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Карточка с самооценкой' }));
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить обучение' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Выберите хотя бы один');
  expect(api.PATCH).not.toHaveBeenCalled();
  await section('Пароль');
  await userEvent.type(screen.getByLabelText('Текущий пароль'), 'current123');
  await userEvent.type(screen.getByLabelText('Новый пароль'), 'password123');
  await userEvent.type(screen.getByLabelText('Повторите новый пароль'), 'different123');
  await userEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }));
  expect(screen.getByLabelText('Повторите новый пароль').getAttribute('aria-invalid')).toBe('true');
  expect(api.POST).not.toHaveBeenCalled();
});

it('не завершает сеанс до подтверждения и сохраняет авторизацию при ошибке', async () => {
  vi.mocked(api.DELETE).mockRejectedValue(new Error('Сеанс не завершён'));
  setup('#sessions');
  await userEvent.click(await screen.findByRole('button', { name: 'Завершить' }));
  expect(api.DELETE).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(api.DELETE).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Завершить' }));
  await userEvent.click(screen.getByRole('button', { name: 'Да, завершить' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Сеанс не завершён');
  expect(clearAccessToken).not.toHaveBeenCalled();
});

it('выходит из текущего сеанса только после успешного отзыва', async () => {
  const cache = setup('#sessions');
  await screen.findByRole('button', { name: 'Завершить' });
  cache.setQueryData(['auth', 'sessions'], [{ ...session, current: true }]);
  await userEvent.click(await screen.findByRole('button', { name: 'Выйти' }));
  vi.mocked(api.DELETE).mockResolvedValue({} as never);
  await userEvent.click(screen.getByRole('button', { name: 'Да, завершить' }));
  await waitFor(() => expect(clearAccessToken).toHaveBeenCalledOnce());
  expect(useAuthStore.getState().status).toBe('guest');
});

it('показывает ошибку загрузки архива и восстанавливает действие после повтора', async () => {
  const normal = vi.mocked(api.GET).getMockImplementation()!;
  let fail = true;
  vi.mocked(api.GET).mockImplementation(async (...args) => {
    if (args[0] === '/api/v1/users/me/export/latest' && fail) throw new Error('offline');
    return normal(...args);
  });
  setup('#data');
  await screen.findByText(
    'Не удалось проверить архив. Попробуйте загрузить его состояние ещё раз.',
  );
  expect(
    (screen.getByRole('button', { name: 'Запросить архив' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fail = false;
  await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Запросить архив' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
});

it('перехватывает отменённый возврат по истории раньше размонтирования формы', async () => {
  const { BrowserRouter, Routes, Route } = await import('react-router-dom');
  window.history.replaceState({ idx: 2 }, '', '/settings');
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
  render(
    <QueryClientProvider client={cache}>
      <BrowserRouter>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/materials" element={<p>Другая страница</p>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>,
  );
  await userEvent.type(screen.getByLabelText('Отображаемое имя'), ' — черновик');
  window.history.replaceState({ idx: 1 }, '', '/materials');
  fireEvent(window, new PopStateEvent('popstate', { state: { idx: 1 } }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(go).toHaveBeenCalledWith(1);
  expect(screen.queryByText('Другая страница')).toBeNull();
  expect((screen.getByLabelText('Отображаемое имя') as HTMLInputElement).value).toBe(
    'Алексей — черновик',
  );
  window.history.replaceState({ idx: 2 }, '', '/settings');
  fireEvent(window, new PopStateEvent('popstate', { state: { idx: 2 } }));
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
});

it('меняет пароль отдельным запросом, очищает секреты только после успеха и обновляет сеансы', async () => {
  vi.mocked(api.POST)
    .mockResolvedValueOnce({ error: { message: 'Текущий пароль неверен' } } as never)
    .mockResolvedValueOnce({} as never);
  const cache = setup('#password');
  const invalidate = vi.spyOn(cache, 'invalidateQueries');
  await userEvent.type(screen.getByLabelText('Текущий пароль'), 'old-password');
  await userEvent.type(screen.getByLabelText('Новый пароль'), 'new-password');
  await userEvent.type(screen.getByLabelText('Повторите новый пароль'), 'new-password');
  await userEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Текущий пароль неверен');
  expect((screen.getByLabelText('Новый пароль') as HTMLInputElement).value).toBe('new-password');
  await userEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }));
  await screen.findByText('Пароль изменён. Остальные устройства вышли из аккаунта.');
  expect((screen.getByLabelText('Текущий пароль') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Новый пароль') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Повторите новый пароль') as HTMLInputElement).value).toBe('');
  expect(api.POST).toHaveBeenLastCalledWith('/api/v1/auth/change-password', {
    body: { current_password: 'old-password', new_password: 'new-password' },
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['auth', 'sessions'] });
});

it('защищает название, срок и права черновика токена от потери', async () => {
  setup('#api');
  const guarded = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  expect(guarded()).toBe(false);
  await userEvent.type(screen.getByLabelText('Название токена'), 'Черновик');
  expect(guarded()).toBe(true);
  await userEvent.clear(screen.getByLabelText('Название токена'));
  expect(guarded()).toBe(false);
  await userEvent.selectOptions(screen.getByLabelText('Срок действия'), '30');
  expect(guarded()).toBe(true);
  await userEvent.selectOptions(screen.getByLabelText('Срок действия'), '90');
  await userEvent.click(screen.getByLabelText('Читать свои наборы и курсы'));
  expect(guarded()).toBe(true);
});

it('привязывает серверные ошибки профиля к полям по коду и пути', async () => {
  vi.mocked(api.PATCH)
    .mockResolvedValueOnce({ error: { code: 'CONFLICT', message: 'Conflict' } } as never)
    .mockResolvedValueOnce({
      error: {
        code: 'VALIDATION_ERROR',
        details: { errors: [{ loc: ['body', 'locale'] }, { loc: ['body', 'timezone'] }] },
      },
    } as never);
  setup();
  await userEvent.type(screen.getByLabelText('Имя пользователя'), 'new');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));
  await screen.findByText('Это имя пользователя занято');
  expect(screen.getByLabelText('Имя пользователя').getAttribute('aria-invalid')).toBe('true');
  await userEvent.type(screen.getByLabelText('Имя пользователя'), '2');
  expect(screen.queryByText('Это имя пользователя занято')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));
  await screen.findByText('Укажите код языка длиной от 2 до 5 символов.');
  expect(screen.getByLabelText('Язык').getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByLabelText('Часовой пояс').getAttribute('aria-invalid')).toBe('true');
});
