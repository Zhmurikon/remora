'use client';

import { Button } from '@remora/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authApi, getErrorMessage } from '../../lib/auth-api';
import { FormError, PasswordField } from './AuthFields';
import { CheckIcon } from './Icons';

export function ResetPasswordForm() {
  const token = useSearchParams().get('token');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password'));
    if (password !== String(data.get('password_confirm'))) {
      setError('Пароли не совпадают');
      return;
    }
    if (!token) {
      setError('В ссылке отсутствует токен восстановления');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await authApi.POST('/api/v1/auth/password-reset/confirm', {
        body: { token, new_password: password },
      });
      if (response.error) {
        setError(getErrorMessage(response.error));
        return;
      }
      setDone(true);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <span className="bg-success-subtle text-success mx-auto grid h-16 w-16 place-items-center rounded-3xl">
          <CheckIcon className="h-8 w-8" />
        </span>
        <h1 className="mt-7 text-3xl font-semibold tracking-[-0.035em]">Пароль изменён</h1>
        <p className="text-fg-muted mt-4">Теперь можно войти с новым паролем.</p>
        <Link
          href="/login"
          className="bg-primary text-primary-fg hover:bg-primary-hover mt-8 inline-flex h-12 items-center justify-center rounded-xl px-6 font-medium"
        >
          Войти в Remora
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="text-primary text-sm font-medium">Новый пароль</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
        Придумайте новый пароль
      </h1>
      <p className="text-fg-muted mt-3 leading-7">
        Используйте не менее 8 символов, буквы и цифры.
      </p>
      <form className="mt-9 space-y-5" onSubmit={handleSubmit}>
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
        <Button
          type="submit"
          size="lg"
          loading={loading}
          fullWidth
          className="h-12 rounded-xl text-base"
        >
          Сохранить пароль
        </Button>
      </form>
    </>
  );
}
