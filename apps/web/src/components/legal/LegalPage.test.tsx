// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LegalPage } from './LegalPage';

// Поведение меню проверяется в браузере; здесь сохраняем настоящую SSR-разметку шапки.
vi.mock('../landing/LandingHeader', () => ({
  LandingHeader: ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />,
}));

afterEach(cleanup);

describe('LegalPage', () => {
  it('показывает русскую политику и ссылку на английскую версию', () => {
    render(<LegalPage kind="privacy" language="ru" />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Политика конфиденциальности',
    );
    expect(screen.getByRole('link', { name: 'English' }).getAttribute('href')).toBe('/en/privacy');
    expect(screen.getByRole('heading', { level: 2, name: '3. Вход через Google' })).toBeTruthy();
    expect(
      within(screen.getByRole('main')).getAllByRole('link', {
        name: 'support@zapominalnya.ru',
      }),
    ).toHaveLength(2);
    expect(screen.getByRole('navigation', { name: 'Содержание' })).toBeTruthy();
  });

  it('показывает английские условия и ссылку на русскую версию', () => {
    render(<LegalPage kind="terms" language="en" />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Terms of Use');
    expect(screen.getByRole('link', { name: 'Русский' }).getAttribute('href')).toBe('/terms');
    expect(screen.getByRole('heading', { level: 2, name: '3. Your content' })).toBeTruthy();
  });
});
