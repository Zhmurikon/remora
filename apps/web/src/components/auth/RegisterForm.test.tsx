// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RegisterForm } from './RegisterForm';

describe('RegisterForm', () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/register');
  });

  it('подставляет пригласительный код из ссылки', async () => {
    window.history.replaceState({}, '', '/register?ref=rmr-friend123');
    render(<RegisterForm />);

    const input = screen.getByLabelText('Пригласительный код') as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('RMR-FRIEND123'));
  });
});
