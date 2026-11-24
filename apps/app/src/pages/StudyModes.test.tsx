// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useStudyStore, type QueueItem } from '../features/study/study-store';
import { StudyShell } from '../features/study/StudyShell';
import { api } from '../lib/api';
import { WritePage } from '../features/study/WritePage';
import { ListenPage } from '../features/study/ListenPage';
import { LearnPage } from '../features/study/LearnPage';
import { FlashcardsPage } from '../features/study/FlashcardsPage';

const session = vi.hoisted(() => ({
  finalize: vi.fn(async () => true),
  refetch: vi.fn(),
  types: ['choice', 'typing', 'recall'],
  error: false,
}));
vi.mock('../features/study/use-study-session', () => ({
  useStudySession: () => ({
    isPending: false,
    isError: session.error,
    refetch: session.refetch,
    data: {
      queue: {
        answer_strictness: 'moderate',
        lang_term: 'en',
        lang_definition: 'ru',
        learn_question_types: session.types,
      },
    },
  }),
  useStudySessionFinalizer: () => session.finalize,
}));
vi.mock('../features/study/review-queue', () => ({
  enqueue: vi.fn(),
  pendingCount: () => 0,
  FLUSH_THRESHOLD: 10,
}));
vi.mock('../features/study/SessionSummary', () => ({
  SessionSummary: () => <h1>Результат тренировки</h1>,
  Diff: ({ typed }: { typed: string }) => <span>{typed}</span>,
}));
vi.mock('../lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

function item(id: string, term: string, definition: string): QueueItem {
  return {
    card: { id, term, definition, content_type: 'text', alt_answers: [], hint: 'Вспомните погоду' },
    direction: 'term_to_def',
    state: { stability: 0 },
    previews: [1, 2, 3, 4].map((rating) => ({ rating, interval_seconds: 600 * rating })),
  } as unknown as QueueItem;
}
const cards = [
  item('first', 'drizzle', 'морось'),
  item('second', 'thunder', 'гром'),
  item('third', 'breeze', 'ветер'),
  item('fourth', 'frost', 'иней'),
];
function mount(page: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/sets/set-1/write']}>
        <Routes>
          <Route path="/sets/:setId/:mode" element={page} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  session.error = false;
  session.types = ['choice', 'typing', 'recall'];
  useStudyStore
    .getState()
    .begin({ mode: 'write', setId: 'set-1', sessionId: 'session-1', items: cards });
  vi.mocked(api.GET).mockResolvedValue({ data: { available: true } } as never);
  vi.mocked(api.POST).mockResolvedValue({ data: { audio_url: '/audio.wav' } } as never);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Обратная связь по текущей карточке', () => {
  it('в письме удерживает вопрос и правильный ответ до Enter, записывает ошибку один раз', async () => {
    mount(<WritePage />);
    await userEvent.type(screen.getByRole('textbox'), 'дождь{Enter}');
    expect(useStudyStore.getState().index).toBe(1);
    expect(screen.getByText('drizzle')).toBeTruthy();
    expect(screen.getByText('морось')).toBeTruthy();
    expect(screen.queryByText('thunder')).toBeNull();
    expect(screen.getByRole('textbox').getAttribute('readonly')).not.toBeNull();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText('thunder')).toBeTruthy();
    expect(useStudyStore.getState().answers).toHaveLength(1);
    expect(useStudyStore.getState().items.at(-1)?.card.id).toBe('first');
  });
  it('не отправляет опечатку и предлагает повторный ввод', async () => {
    useStudyStore.setState({ items: [item('first', 'rain', 'drizzle')] });
    mount(<WritePage />);
    await userEvent.type(screen.getByRole('textbox'), 'drizle{Enter}');
    expect(screen.getByText(/Почти верно/)).toBeTruthy();
    expect(useStudyStore.getState().answers).toHaveLength(0);
  });
  it('не отправляет повторный ответ во время успешной обратной связи', async () => {
    mount(<WritePage />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'морось' } });
    const form = screen.getByRole('textbox').closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(useStudyStore.getState().answers).toHaveLength(1);
    expect(screen.getByText('drizzle')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('thunder')).toBeTruthy());
  });
  it('на слух сохраняет озвученную сторону до продолжения', async () => {
    mount(<ListenPage />);
    await userEvent.type(await screen.findByRole('textbox'), 'rain{Enter}');
    expect(screen.getByText('drizzle')).toBeTruthy();
    expect(screen.queryByText('thunder')).toBeNull();
    expect(useStudyStore.getState().answers).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.queryByText('drizzle')).toBeNull();
    expect(screen.getByRole('textbox').getAttribute('readonly')).toBeNull();
  });
});

it('при ошибке проверки озвучки предлагает повтор и другой режим', async () => {
  vi.mocked(api.GET).mockResolvedValue({ error: { code: 'UNAVAILABLE' } } as never);
  mount(<ListenPage />);
  expect(await screen.findByRole('heading', { name: 'Не удалось проверить озвучку' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Перейти к заучиванию' })).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }));
  await waitFor(() => expect(api.GET).toHaveBeenCalledTimes(2));
});
it('при отключённой озвучке предлагает заучивание', async () => {
  vi.mocked(api.GET).mockResolvedValue({ data: { available: false } } as never);
  mount(<ListenPage />);
  expect(await screen.findByRole('heading', { name: 'Озвучка пока недоступна' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Перейти к заучиванию' })).toBeTruthy();
});
it('при сбое отдельной карточки предлагает озвучить снова или перейти к письму', async () => {
  vi.mocked(api.POST).mockResolvedValue({ error: { code: 'UNAVAILABLE' } } as never);
  mount(<ListenPage />);
  expect(await screen.findByRole('button', { name: 'Повторить озвучку' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Перейти к письму' })).toBeTruthy();
});
it('выход из заучивания сохраняет принятый ответ один раз и блокирует клавиши результата', () => {
  vi.useFakeTimers();
  session.types = ['typing'];
  mount(<LearnPage />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'морось' } });
  fireEvent.submit(screen.getByRole('textbox').closest('form')!);
  fireEvent.click(screen.getByRole('button', { name: /Завершить/ }));
  act(() => vi.advanceTimersByTime(1600));
  fireEvent.keyDown(window, { key: '1' });
  expect(useStudyStore.getState().answers).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Результат тренировки' })).toBeTruthy();
});
it('карточки не перехватывают Enter и стрелки на кнопках и флажке', async () => {
  mount(<FlashcardsPage />);
  const known = screen.getByRole('button', { name: 'Знаю' });
  known.focus();
  await userEvent.keyboard('{Enter}');
  expect(useStudyStore.getState().index).toBe(1);
  screen.getByRole('checkbox').focus();
  await userEvent.keyboard('{ArrowDown}');
  expect(useStudyStore.getState().index).toBe(1);
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(useStudyStore.getState().index).toBe(2);
});
it('ошибка загрузки предлагает повторить запрос', async () => {
  session.error = true;
  mount(<LearnPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }));
  expect(session.refetch).toHaveBeenCalledOnce();
});
it('оболочка сообщает о локальных ответах и позволяет повторить отправку', async () => {
  const syncNow = vi.fn(async () => {});
  useStudyStore.setState({ sync: 'offline', pending: 3, syncNow });
  mount(
    <StudyShell title="Письмо" done={1} total={4} onExit={() => {}}>
      Вопрос
    </StudyShell>,
  );
  expect(screen.getByRole('status').textContent).toContain('Ответы сохранены на устройстве: 3');
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');
  await userEvent.click(screen.getByRole('button', { name: 'Повторить отправку' }));
  expect(syncNow).toHaveBeenCalledOnce();
});

it('после неверного ввода в заучивании переводит фокус на продолжение', async () => {
  session.types = ['typing'];
  mount(<LearnPage />);
  await userEvent.type(screen.getByRole('textbox'), 'дождь{Enter}');
  const next = screen.getByRole('button', { name: 'Дальше' });
  expect(document.activeElement).toBe(next);
  expect(useStudyStore.getState().answers).toHaveLength(1);
  await userEvent.keyboard('{Enter}');
  expect(useStudyStore.getState().answers).toHaveLength(1);
  expect(useStudyStore.getState().answers[0]?.correct).toBe(false);
  expect(screen.getByText('thunder')).toBeTruthy();
});

it('заучивание принимает правильный ввод и переходит к следующему вопросу', async () => {
  session.types = ['typing'];
  mount(<LearnPage />);
  await userEvent.type(screen.getByRole('textbox'), 'морось{Enter}');
  expect(screen.getByText('Верно')).toBeTruthy();
  await waitFor(() => expect(screen.getByText('thunder')).toBeTruthy());
  expect(useStudyStore.getState().answers[0]).toMatchObject({
    cardId: 'first',
    rating: 3,
    correct: true,
  });
});

it('самооценка предлагает две оценки, цифра 2 записывает «Помню»', async () => {
  session.types = ['recall'];
  mount(<LearnPage />);
  expect(screen.queryByText('морось')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Показать ответ' }));
  expect(screen.getByText('морось')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Не помню' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Помню' })).toBeTruthy();
  await userEvent.keyboard('2');
  expect(useStudyStore.getState().answers[0]).toMatchObject({
    cardId: 'first',
    rating: 3,
    correct: true,
  });
  expect(screen.getByText('thunder')).toBeTruthy();
});

it('в смешанной очереди проверяет письмо по языку исходного набора', async () => {
  const first = item('mixed', 'кошка', 'the cat');
  first.lang_definition = 'en';
  useStudyStore
    .getState()
    .begin({ mode: 'write', setId: 'folder', sessionId: 'session-1', items: [first] });
  mount(<WritePage />);
  await userEvent.type(screen.getByRole('textbox'), 'cat{Enter}');
  expect(useStudyStore.getState().answers[0]?.correct).toBe(true);
});

it('переворачивает обратную карточку и записывает показанное направление', async () => {
  const first = item('reversed', 'кошка', 'cat');
  first.direction = 'def_to_term';
  useStudyStore
    .getState()
    .begin({ mode: 'flashcards', setId: 'set-1', sessionId: null, items: [first] });
  mount(<FlashcardsPage />);
  expect(screen.getByText('cat')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Показать термин' }));
  expect(screen.getByText('кошка')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Знаю' }));
  expect(useStudyStore.getState().answers[0]?.direction).toBe('def_to_term');
});

it('просмотр новой карточки переносит её в хвост без записи ответа', async () => {
  useStudyStore.setState({
    items: cards.map((value) => ({ ...value, state: { ...value.state, reps: 0 } })),
  });
  mount(<LearnPage />);
  expect(screen.getByText('Знакомство с карточкой')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Дальше' }));
  const state = useStudyStore.getState();
  expect(state.answers).toHaveLength(0);
  expect(state.items.at(-1)?.card.id).toBe('first');
  expect(state.index).toBe(0);
});

it('сохраняет ответ вне очереди на исходную карточку и оставляет соседние карточки доступными', () => {
  const state = useStudyStore.getState();
  const original = state.items[2]!;
  state.answer({
    item: { ...original, direction: 'def_to_term' },
    consume: original,
    rating: 1,
    correct: false,
    durationMs: 300,
    requeue: true,
  });
  const after = useStudyStore.getState();
  expect(after.items.map((value) => value.card.id)).toEqual([
    'third',
    'first',
    'second',
    'fourth',
    'third',
  ]);
  expect(after.answers[0]).toMatchObject({
    cardId: 'third',
    direction: 'def_to_term',
    correct: false,
  });
});

it('при смене вопроса останавливает озвучку и отбрасывает запоздалое окончание старой реплики', async () => {
  const { useAuthStore } = await import('../features/auth/auth-store');
  const utterances: SpeechSynthesisUtterance[] = [];
  const cancel = vi.fn();
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      constructor(public text: string) {}
    },
  );
  vi.stubGlobal('speechSynthesis', {
    cancel,
    speak: (utterance: SpeechSynthesisUtterance) => utterances.push(utterance),
  });
  const user = useAuthStore.getState().user;
  useAuthStore.setState({ user: { id: 'learner' } as NonNullable<typeof user> });
  vi.mocked(api.GET).mockResolvedValue({
    data: { features: { 'study.learn_narration': true } },
  } as never);
  useStudyStore.setState({
    items: cards.map((value) => ({ ...value, state: { ...value.state, reps: 0 } })),
  });
  try {
    mount(<LearnPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Включить озвучку' }));
    expect(utterances.map((u) => u.text)).toEqual(['drizzle']);
    const question = utterances[0]!;
    const ended = question.onend!;
    act(() => ended.call(question, {} as SpeechSynthesisEvent));
    expect(utterances.map((u) => u.text)).toEqual(['drizzle', 'морось']);
    const stale = utterances[1]!;
    const oldEnd = stale.onend!;
    await userEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(cancel).toHaveBeenCalled();
    const length = utterances.length;
    act(() => oldEnd.call(stale, {} as SpeechSynthesisEvent));
    expect(utterances).toHaveLength(length);
    await userEvent.click(screen.getByRole('button', { name: 'Выключить озвучку' }));
  } finally {
    cleanup();
    useAuthStore.setState({ user });
    vi.unstubAllGlobals();
  }
});
