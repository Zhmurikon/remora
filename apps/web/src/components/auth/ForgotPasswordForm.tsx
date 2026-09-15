'use client';

import { Button, Input } from '@remora/ui';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { authApi, getErrorMessage } from '../../lib/auth-api';
import { FormError } from './AuthFields';
import { ArrowLeftIcon, MailIcon } from './Icons';

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await authApi.POST('/api/v1/auth/password-reset', {
        body: { email: String(data.get('email')) },
      });
      if (response.error) {
        setError(getErrorMessage(response.error));
        return;
      }
      setSent(true);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <span className="bg-primary-subtle text-primary mx-auto grid h-16 w-16 place-items-center rounded-3xl">
          <MailIcon />
        </span>
        <h1 className="mt-7 text-3xl font-semibold tracking-[-0.035em]">Письмо уже в пути</h1>
        <p className="text-fg-muted mt-4 leading-7">
          Если такой email зарегистрирован, на него придёт ссылка. Она действует 30 минут.
        </p>
        <Link
          href="/login"
          className="bg-primary text-primary-fg hover:bg-primary-hover mt-8 inline-flex h-12 items-center justify-center rounded-xl px-6 font-medium"
        >
          Вернуться ко входу
        </Link>
      </div>
    );
  }

  return (
    <>
      <Link
        href="/login"
        className="text-fg-muted hover:text-fg mb-8 inline-flex w-fit items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="h-5 w-5" /> Ко входу
      </Link>
      <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
        Восстановить пароль
      </h1>
      <p className="text-fg-muted mt-3 leading-7">
        Укажите email аккаунта — отправим одноразовую ссылку для смены пароля.
      </p>
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
        {error && <FormError>{error}</FormError>}
        <Button
          type="submit"
          size="lg"
          loading={loading}
          fullWidth
          className="h-12 rounded-xl text-base"
        >
          Отправить ссылку
        </Button>
      </form>
    </>
  );
}
