import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { api } from '../lib/api';
import { BlogPage } from './BlogPage';

const item = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'intervalnoe-povtorenie',
  title: 'Интервальное повторение',
  description: 'Практическое объяснение метода.',
  category: 'Учебные привычки',
  state: 'draft',
  status: 'draft',
  revision: 1,
  author_id: '22222222-2222-4222-8222-222222222222',
  author_username: 'editor',
  published_at: null,
  updated_at: '2026-10-27T08:00:00Z',
  tone: 'mint',
  diagram: ['Материал', 'Интервал', 'Проверка'],
  cover_media_id: null,
  cover_alt: null,
  sections: [
    {
      id: 'princip',
      title: 'Принцип',
      paragraphs: [],
      rich_text: 'Повторяйте материал **через интервалы**.',
      steps: [],
      example: null,
    },
  ],
  sources: [],
  related: [],
  history: [],
} as const;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BlogPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.restoreAllMocks());

test('открывает черновик, сохраняет его и запускает защищённую публикацию', async () => {
  vi.spyOn(api, 'GET').mockImplementation(async (path) => {
    if (path === '/api/v1/admin/blog/posts') {
      return { data: { items: [item], total: 1, offset: 0, limit: 25 } } as never;
    }
    return { data: item } as never;
  });
  const put = vi.spyOn(api, 'PUT').mockResolvedValue({
    data: { ...item, title: 'Интервальное повторение без перегрузки', revision: 2 },
  } as never);
  const post = vi.spyOn(api, 'POST').mockImplementation(async (path) => {
    if (path === '/api/v1/admin/security/confirm') {
      return {
        data: { confirmation_token: 'confirmed', expires_at: '2026-10-27T09:00:00Z' },
      } as never;
    }
    return {
      data: {
        ...item,
        title: 'Интервальное повторение без перегрузки',
        status: 'published',
        state: 'published',
        revision: 3,
        published_at: '2026-10-27T08:30:00Z',
      },
    } as never;
  });
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByRole('button', { name: 'Интервальное повторение' }));
  const title = await screen.findByLabelText('Заголовок');
  await user.clear(title);
  await user.type(title, 'Интервальное повторение без перегрузки');
  await user.click(screen.getByRole('button', { name: 'Сохранить черновик' }));

  expect(put).toHaveBeenCalledWith(
    '/api/v1/admin/blog/posts/{post_id}',
    expect.objectContaining({
      body: expect.objectContaining({
        title: 'Интервальное повторение без перегрузки',
        revision: 1,
      }),
    }),
  );
  expect(await screen.findByText('Черновик сохранён.')).toBeInTheDocument();

  const publishButtons = screen.getAllByRole('button', { name: 'Опубликовать' });
  await user.click(publishButtons[publishButtons.length - 1]!);
  await user.type(
    screen.getByLabelText('Причина изменения'),
    'Статья прошла редакционную проверку',
  );
  await user.type(screen.getByLabelText('Пароль администратора или код 2FA'), 'Strong-password-1');
  const confirmationButtons = screen.getAllByRole('button', { name: 'Опубликовать' });
  await user.click(confirmationButtons[confirmationButtons.length - 1]!);

  expect(post).toHaveBeenCalledWith(
    '/api/v1/admin/blog/posts/{post_id}/publication',
    expect.objectContaining({
      body: expect.objectContaining({
        action: 'publish',
        revision: 2,
        reason: 'Статья прошла редакционную проверку',
      }),
    }),
  );
  expect(await screen.findByText('Статья опубликована.')).toBeInTheDocument();
});
