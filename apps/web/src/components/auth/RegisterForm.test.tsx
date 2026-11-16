// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { RegisterForm } from './RegisterForm';

describe('RegisterForm', () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/register');
  });

  it('разрешает отправить пароль только после подключения обработчика формы', async () => {
    const html = document.createElement('template');
    html.innerHTML = renderToString(<RegisterForm />);
    expect(html.content.querySelector('form')?.method).toBe('post');
    expect(html.content.querySelector('button[type="submit"]')).toHaveProperty('disabled', true);

    render(<RegisterForm />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Создать аккаунт' })).toHaveProperty(
        'disabled',
        false,
      ),
    );
  });

  it('подставляет пригласительный код из ссылки', async () => {
    window.history.replaceState({}, '', '/register?ref=rmr-friend123');
    render(<RegisterForm />);

    const input = screen.getByLabelText('Пригласительный код') as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('RMR-FRIEND123'));
  });
});
