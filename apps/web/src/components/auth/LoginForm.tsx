'use client';

import { Button, Input } from '@remora/ui';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { APP_URL, authApi, getErrorMessage } from '../../lib/auth-api';
import { FormDivider, FormError, PasswordField, SocialButtons } from './AuthFields';

export function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const data = new FormData(event.currentTarget);

    try {
      const response = await authApi.POST('/api/v1/auth/login', {
        body: { email: String(data.get('email')), password: String(data.get('password')) },
      });
      if (response.error) {
        setError(getErrorMessage(response.error));
        return;
      }
      window.location.assign(APP_URL);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div>
        <p className="text-primary text-sm font-medium">С возвращением</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          Войдите в Remora
        </h1>
        <p className="text-fg-muted mt-3">Ваши карточки и прогресс уже ждут.</p>
      </div>

      <form className="mt-9 space-y-5" onSubmit={handleSubmit}>
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@example.ru"
          required
          className="h-12 rounded-xl"
        />
        <div>
          <div className="mb-1 flex justify-end">
            <Link
              href="/forgot-password"
              className="text-primary hover:text-primary-hover text-sm font-medium"
            >
              Забыли пароль?
            </Link>
          </div>
          <PasswordField
            name="password"
            autoComplete="current-password"
            placeholder="Введите пароль"
            required
          />
        </div>
        {error && <FormError>{error}</FormError>}
        <Button
          type="submit"
          size="lg"
          loading={loading}
          fullWidth
          className="h-12 rounded-xl text-base"
        >
          Войти
        </Button>
      </form>

      <div className="my-7">
        <FormDivider />
      </div>
      <SocialButtons />
      <p className="text-fg-muted mt-8 text-center text-sm">
        Ещё нет аккаунта?{' '}
        <Link href="/register" className="text-primary hover:text-primary-hover font-semibold">
          Создать
        </Link>
      </p>
    </>
  );
}
