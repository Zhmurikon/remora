// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranscriptionsPage } from './TranscriptionsPage';

const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();
const remove = vi.fn();
const mediaInfoMocks = vi.hoisted(() => ({
  analyzeData: vi.fn(),
  close: vi.fn(),
  factory: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: {
    GET: (...args: unknown[]) => get(...args),
    POST: (...args: unknown[]) => post(...args),
    PATCH: (...args: unknown[]) => patch(...args),
    DELETE: (...args: unknown[]) => remove(...args),
  },
  ApiRequestError: class extends Error {},
  uploadTranscriptionChunk: vi.fn(),
}));

vi.mock('mediainfo.js', () => ({
  default: (...args: unknown[]) => mediaInfoMocks.factory(...args),
}));

const entitlements = {
  plan_code: 'free',
  plan_name: 'Free',
  features: { 'ai.transcription': false },
  limits: { 'ai.transcription_minutes_per_week': 0 },
  usage: { 'ai.transcription_minutes_per_week': 0 },
  remaining: { 'ai.transcription_minutes_per_week': 0 },
  resets_at: { 'ai.transcription_minutes_per_week': '2026-11-02T00:00:00Z' },
  current_period_end: null,
  cancel_at_period_end: false,
};

const completed = {
  id: '11111111-1111-4111-8111-111111111111',
  filename: 'lecture.mp4',
  title: 'Лекция по теории вероятностей',
  size_bytes: 1024,
  duration_seconds: 2880,
  total_parts: 1,
  uploaded_parts: 1,
  status: 'completed',
  provider: 'yandex_speechkit',
  result_text: 'Вероятность события — численная мера возможности его наступления.',
  error_message: null,
  created_at: '2026-10-29T00:00:00Z',
  started_at: '2026-10-29T00:01:00Z',
  finished_at: '2026-10-29T00:05:00Z',
};

function renderPage(path = '/transcriptions') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="transcriptions" element={<TranscriptionsPage />} />
          <Route path="transcriptions/:jobId" element={<TranscriptionsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mediaInfoMocks.factory.mockResolvedValue({
    analyzeData: mediaInfoMocks.analyzeData,
    close: mediaInfoMocks.close,
  });
  get.mockImplementation((path: string) => {
    if (path === '/api/v1/transcriptions') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: entitlements });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('TranscriptionsPage', () => {
  it('показывает загрузку вместо пустого документа', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Новая расшифровка' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Выбрать аудио или видео' })).toBeTruthy();
    expect(screen.getByText('Перетащите файл сюда')).toBeTruthy();
    expect(screen.getByText('0 из 0 минут осталось')).toBeTruthy();
  });

  it('показывает редактор, действия и библиотеку готовых результатов', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/api/v1/transcriptions') return Promise.resolve({ data: [completed] });
      return Promise.resolve({ data: entitlements });
    });
    const user = userEvent.setup();
    renderPage(`/transcriptions/${completed.id}`);

    expect(await screen.findByDisplayValue(completed.title)).toBeTruthy();
    expect(
      (screen.getByRole('textbox', { name: 'Текст расшифровки' }) as HTMLTextAreaElement).value,
    ).toBe(completed.result_text);
    expect(screen.getByRole('button', { name: 'Скачать .txt' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Открыть библиотеку' }));
    expect(screen.getByRole('heading', { name: 'Библиотека конспектов' })).toBeTruthy();
    expect(screen.getByText(completed.title)).toBeTruthy();
  });

  it('автоматически получает длительность из выбранного файла', async () => {
    const createElement = document.createElement.bind(document);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:lecture'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      const element = createElement(tagName, options);
      if (tagName !== 'audio') return element;
      Object.defineProperty(element, 'duration', { configurable: true, value: 125 });
      Object.defineProperty(element, 'src', {
        configurable: true,
        set: () => queueMicrotask(() => element.onloadedmetadata?.(new Event('loadedmetadata'))),
      });
      return element;
    });
    const user = userEvent.setup();
    const view = renderPage();
    await screen.findByRole('heading', { name: 'Новая расшифровка' });

    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).toBeTruthy();
    await user.upload(input!, new File(['audio'], 'lecture.mp3', { type: 'audio/mpeg' }));

    expect(await screen.findByText(/3 минуты/)).toBeTruthy();
    expect(screen.queryByLabelText('Длительность, минут')).toBeNull();
  });

  it('получает длительность MPEG-TS через универсальный анализатор', async () => {
    mediaInfoMocks.analyzeData.mockResolvedValue({
      media: {
        track: [{ '@type': 'General', Duration: 3725.4, Format: 'MPEG-TS' }],
      },
    });
    const user = userEvent.setup();
    const view = renderPage();
    await screen.findByRole('heading', { name: 'Новая расшифровка' });

    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).toBeTruthy();
    const file = new File(['transport stream'], 'lecture.ts', { type: 'video/mp2t' });
    await user.upload(input!, file);

    expect(await screen.findByText(/63 минуты/)).toBeTruthy();
    expect(mediaInfoMocks.factory).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'object', locateFile: expect.any(Function) }),
    );
    expect(mediaInfoMocks.analyzeData).toHaveBeenCalledWith(file.size, expect.any(Function));
    expect(mediaInfoMocks.close).toHaveBeenCalledOnce();
  });
});
