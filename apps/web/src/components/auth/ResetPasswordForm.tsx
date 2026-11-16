'use client';

import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authApi, getErrorMessage } from '../../lib/auth-api';
import { FormError, PasswordField } from './AuthFields';
import { ReadingHeading, ReadingResult, ReadingSubmit } from './reading-room/ReadingForm';

export function ResetPasswordForm() {
  const token = useSearchParams().get('token');
  if (!token) {
    return (
      <ReadingResult title="В ссылке нет кода" href="/forgot-password" action="Запросить ссылку">
        Чтобы сменить пароль, запросите письмо и откройте ссылку из него.
      </ReadingResult>
    );
  }
  return <NewPassword key={token} token={token} />;
}

function NewPassword({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'form' | 'invalid-link' | 'done'>('form');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password'));
    if (password !== String(data.get('password_confirm'))) {
      setError('Пароли не совпадают');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await authApi.POST('/api/v1/auth/password-reset/confirm', {
        body: { token, new_password: password },
      });
      if (response.error) {
        if ('code' in response.error && response.error.code === 'UNAUTHORIZED') {
          setStatus('invalid-link');
          return;
        }
        setError(getErrorMessage(response.error));
        return;
      }
      setStatus('done');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  if (status === 'invalid-link') {
    return (
      <ReadingResult
        title="Ссылка больше не действует"
        href="/forgot-password"
        action="Запросить новую ссылку"
      >
        Запросите новое письмо для смены пароля.
      </ReadingResult>
    );
  }

  if (status === 'done') {
    return (
      <ReadingResult title="Пароль изменён" action="Войти в «Запоминальню»">
        Теперь можно войти с новым паролем.
      </ReadingResult>
    );
  }

  return (
    <>
      <ReadingHeading
        title="Придумайте новый пароль"
        description="Используйте не менее 8 символов, буквы и цифры."
      />
      <form className="reading-fields" onSubmit={handleSubmit}>
        <PasswordField
          name="password"
          autoComplete="new-password"
          placeholder="Новый пароль"
          minLength={8}
          maxLength={128}
          required
        />
        <PasswordField
          label="Повторите пароль"
          name="password_confirm"
          autoComplete="new-password"
          placeholder="Ещё раз"
          minLength={8}
          maxLength={128}
          required
        />
        {error && <FormError>{error}</FormError>}
        <ReadingSubmit loading={loading}>Сохранить пароль</ReadingSubmit>
      </form>
    </>
  );
}
