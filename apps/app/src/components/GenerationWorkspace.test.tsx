// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { components } from '@remora/api-client';
import { GenerationWorkspace } from './GenerationWorkspace';
import { StudyNotesPreview } from './StudyNotesPreview';

const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();
vi.mock('../lib/api', () => ({
  api: {
    GET: (...args: unknown[]) => get(...args),
    POST: (...args: unknown[]) => post(...args),
    PATCH: (...args: unknown[]) => patch(...args),
  },
}));
type Job = components['schemas']['GenerationPublic'];
const source = { id: 'source-id', title: 'Лекция' } as components['schemas']['TranscriptionPublic'];
const entitlements = {
  plan_code: 'plus',
  plan_name: 'Plus',
  current_period_end: null,
  cancel_at_period_end: false,
  limits: {},
  usage: {},
  resets_at: {},
  features: { 'ai.generation': true },
  remaining: { 'ai.generation_tokens_per_week': 500000 },
} as components['schemas']['EntitlementsPublic'];
const note: Job = {
  id: 'note-id',
  transcription_id: source.id,
  kind: 'notes',
  status: 'completed',
  title: 'Лекция',
  parent_id: null,
  source_hash: 'hash',
  markdown: '# Тема\n\nОсновное определение.',
  cards: null,
  error_message: null,
  saved_set_id: null,
  created_at: '2026-10-30T10:00:00Z',
  updated_at: '2026-10-30T10:00:00Z',
  issues: [],
};
function mount(kind: 'notes' | 'cards' = 'notes', paid = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GenerationWorkspace
          source={source}
          kind={kind}
          sourceReady
          entitlements={
            paid ? entitlements : { ...entitlements, features: { 'ai.generation': false } }
          }
          onNext={() => {}}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  get.mockResolvedValue({ data: [note] });
});
afterEach(cleanup);

describe('Генерация учебных материалов', () => {
  it('показывает сохранённый конспект после окончания подписки', async () => {
    mount('notes', false);
    expect(await screen.findByText('Основное определение.')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Создать новую версию' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Скачать .md' })).toBeTruthy();
  });
  it('запускает карточки по готовому конспекту и показывает фоновую обработку', async () => {
    let rows: Job[] = [note];
    get.mockImplementation(async () => ({ data: rows }));
    post.mockImplementation(async () => {
      const card: Job = {
        ...note,
        id: 'cards-id',
        kind: 'cards',
        status: 'queued',
        markdown: null,
        parent_id: note.id,
      };
      rows = [card, note];
      return { data: card };
    });
    mount('cards');
    await userEvent.click(await screen.findByRole('button', { name: 'Создать карточки' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[1].body.parent_id).toBe(note.id);
    expect(await screen.findByRole('status')).toBeTruthy();
  });
  it('сохраняет правку с ревизией и восстанавливает черновик после перехода', async () => {
    const first = mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Редактировать' }));
    const textarea = screen.getByRole('textbox', { name: 'Markdown конспекта' });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# Изменённый конспект');
    await waitFor(() =>
      expect(sessionStorage.getItem('generation-draft:note-id')).toContain('Изменённый'),
    );
    first.unmount();
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Редактировать' }));
    expect(
      (screen.getByRole('textbox', { name: 'Markdown конспекта' }) as HTMLTextAreaElement).value,
    ).toBe('# Изменённый конспект');
    patch.mockResolvedValue({
      data: { ...note, markdown: '# Изменённый конспект', updated_at: '2026-10-30T10:01:00Z' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0]?.[1].body.revision).toBe(note.updated_at);
  });
  it('не разрешает сохранять набор с замечаниями к определениям', async () => {
    get.mockResolvedValue({
      data: [
        {
          ...note,
          id: 'cards-id',
          kind: 'cards',
          markdown: null,
          parent_id: note.id,
          cards: [
            {
              term: 'Термин',
              definition: 'Длинное определение',
              wrong_definition_answers: ['Раз', 'Два', 'Три'],
            },
          ],
          issues: ['Карточка 1: правильное определение не должно быть самым длинным'],
        },
        note,
      ],
    });
    mount('cards');
    const button = await screen.findByRole('button', { name: 'Сохранить в новый набор' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText('Неверное определение 3')).toBeTruthy();
  });
});

it('показывает таблицы, callout и details, не исполняя HTML', () => {
  const { container } = render(
    <StudyNotesPreview
      value={
        '# Тема\n\n> [!abstract]\n> Тезис\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n<details>\n<summary>Вопрос</summary>\n\nОтвет\n\n</details>\n\n<script>alert(1)</script><img src=x onerror=alert(1)>'
      }
    />,
  );
  expect(container.querySelector('table')).toBeTruthy();
  expect(container.querySelector('details summary')?.textContent).toBe('Вопрос');
  expect(screen.getByText('Коротко')).toBeTruthy();
  expect(container.querySelector('script, img')).toBeNull();
});
