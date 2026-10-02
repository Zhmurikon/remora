// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LegalPage } from './LegalPage';

afterEach(cleanup);

describe('LegalPage', () => {
  it('показывает русскую политику и ссылку на английскую версию', () => {
    render(<LegalPage kind="privacy" language="ru" />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Политика конфиденциальности',
    );
    expect(screen.getByRole('link', { name: 'English' }).getAttribute('href')).toBe('/en/privacy');
    expect(screen.getByText('3. Вход через Google')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'support@remora.com.ru' })).toHaveLength(2);
  });

  it('показывает английские условия и ссылку на русскую версию', () => {
    render(<LegalPage kind="terms" language="en" />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Terms of Use');
    expect(screen.getByRole('link', { name: 'Русский' }).getAttribute('href')).toBe('/terms');
    expect(screen.getByText('3. Your content')).toBeTruthy();
  });
});
