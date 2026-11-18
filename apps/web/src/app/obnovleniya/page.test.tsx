// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { updates } from './data';
import UpdatesPage, { metadata } from './page';

vi.mock('../../components/analytics/PublicAnalytics', () => ({
  PublicAnalytics: () => null,
}));
vi.mock('../../components/landing/LandingHeader', () => ({
  LandingHeader: ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />,
}));
vi.mock('../../components/home/HomeTheme', () => ({
  HomeTheme: () => <label>Тема</label>,
}));

afterEach(cleanup);

describe('История обновлений', () => {
  it('сохраняет все существующие записи и даты', () => {
    expect(updates).toMatchObject([
      {
        dateTime: '2026-10-30',
        date: '30 октября 2026',
        title: 'Конспект и карточки из одной записи лекции',
      },
      {
        dateTime: '2026-09-18',
        date: '18 сентября 2026',
        title: 'Тесты для самопроверки в конце урока',
      },
    ]);
  });

  it('публикует canonical и описание', () => {
    expect(metadata.alternates).toMatchObject({ canonical: '/obnovleniya' });
    expect(metadata.title).toBe('История обновлений');
    expect(metadata.description).toContain('Запоминальни');
  });

  it('выводит общую оболочку и семантическую хронологию', () => {
    const { container } = render(<UpdatesPage />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('История обновлений');
    expect(container.querySelector('.site-header')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(
      Array.from(container.querySelectorAll('time'), (time) => time.getAttribute('datetime')),
    ).toEqual(['2026-10-30', '2026-09-18']);
    const returnLink = screen.getByRole('link', { name: 'Вернуться к новостям на главной' });
    expect(returnLink.getAttribute('href')).toBe('/#news');
    expect(
      within(screen.getByRole('contentinfo'))
        .getByRole('link', { name: 'История обновлений' })
        .getAttribute('href'),
    ).toBe('/obnovleniya');
  });
});
