// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import PaymentReturnPage, { metadata } from './page';

vi.mock('../../components/landing/LandingHeader', () => ({
  LandingHeader: ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />,
}));

vi.mock('../../components/analytics/PublicAnalytics', () => ({ PublicAnalytics: () => null }));

it('публикует индексируемые метаданные страницы', () => {
  expect(metadata.title).toBe('Условия оплаты и возврата');
  expect(metadata.alternates).toMatchObject({ canonical: '/oplata-i-vozvrat' });
  expect(metadata.openGraph).toMatchObject({ url: '/oplata-i-vozvrat', locale: 'ru_RU' });
});

it('показывает действующие условия без несуществующего английского перевода', () => {
  render(<PaymentReturnPage />);

  const main = screen.getByRole('main');
  expect(within(main).getByRole('heading', { level: 1 }).textContent).toBe(
    'Условия оплаты и возврата',
  );
  expect(within(main).getByText(/Коньков Юрий Алексеевич/)).toBeTruthy();
  expect(within(main).getByText(/ИНН 272201512193/)).toBeTruthy();
  expect(within(main).getByText(/Полоцкий переулок, дом 2/)).toBeTruthy();
  expect(within(main).getAllByText(/в течение семи дней/)).toHaveLength(2);
  expect(within(main).getByText(/не выполняет автоматических списаний/)).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'English' })).toBeNull();
});
