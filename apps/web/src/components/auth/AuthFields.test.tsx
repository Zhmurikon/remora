// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { GOOGLE_OAUTH_URL } from '../../lib/auth-api';
import { SocialButtons } from './AuthFields';

afterEach(cleanup);

it('показывает активный вход через Google и оставляет остальные сервисы заглушками', () => {
  render(<SocialButtons />);

  expect(screen.getByRole('link', { name: 'Продолжить с Google' }).getAttribute('href')).toBe(
    GOOGLE_OAUTH_URL,
  );
  for (const label of ['VK ID — скоро', 'Яндекс ID — скоро', 'Telegram — скоро']) {
    expect(screen.getByRole('button', { name: label })).toHaveProperty('disabled', true);
  }
});
