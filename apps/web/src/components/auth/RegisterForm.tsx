'use client';

import { Button, Input } from '@remora/ui';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { authApi, getErrorMessage } from '../../lib/auth-api';
import { FormError, PasswordField } from './AuthFields';

export function RegisterForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email'));

    try {
      const response = await authApi.POST('/api/v1/auth/register', {
        body: {
          email,
          username: String(data.get('username')),
          password: String(data.get('password')),
          birth_date: String(data.get('birth_date')),
        },
      });
      if (response.error) {
        setError(getErrorMessage(response.error));
        return;
      }
      setSentTo(email);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return <EmailSent email={sentTo} />;
  }

  return (
    <>
      <div>
        <p className="text-primary text-sm font-medium">Новый аккаунт</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          Начните запоминать
        </h1>
        <p className="text-fg-muted mt-3">Создание аккаунта займёт меньше минуты.</p>
      </div>
      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.ru"
            required
            className="h-12 rounded-xl"
          />
          <Input
            label="Имя пользователя"
            name="username"
            autoComplete="username"
            placeholder="yuriy"
            minLength={3}
            maxLength={32}
            pattern="[a-zA-Z0-9_-]+"
            required
            className="h-12 rounded-xl"
            hint="Латиница, цифры, _ и −"
          />
        </div>
        <PasswordField
          label="Пароль"
          name="password"
          autoComplete="new-password"
          placeholder="Не менее 8 символов"
          minLength={8}
          maxLength={128}
          required
        />
        <Input
          label="Дата рождения"
          name="birth_date"
          type="date"
          autoComplete="bday"
          required
          className="h-12 rounded-xl"
          hint="Нужна для возрастных настроек аккаунта"
        />
        <label className="text-fg-muted flex cursor-pointer items-start gap-3 py-1 text-sm leading-5">
          <input
            type="checkbox"
            required
            className="border-border accent-primary mt-0.5 h-5 w-5 shrink-0 rounded"
          />
          <span>
            Я принимаю условия использования и даю согласие на обработку персональных данных.
          </span>
        </label>
        {error && <FormError>{error}</FormError>}
        <Button
          type="submit"
          size="lg"
          loading={loading}
          fullWidth
          className="h-12 rounded-xl text-base"
        >
          Создать аккаунт
        </Button>
      </form>
      <p className="text-fg-muted mt-7 text-center text-sm">
        Уже есть аккаунт?{' '}
        <Link href="/login" className="text-primary hover:text-primary-hover font-semibold">
          Войти
        </Link>
      </p>
    </>
  );
}

function EmailSent({ email }: { email: string }) {
  return (
    <div className="text-center">
      <div className="bg-primary-subtle text-primary mx-auto grid h-16 w-16 place-items-center rounded-3xl">
        <span className="text-2xl">✉</span>
      </div>
      <h1 className="mt-7 text-3xl font-semibold tracking-[-0.035em]">Проверьте почту</h1>
      <p className="text-fg-muted mx-auto mt-4 max-w-sm leading-7">
        Отправили ссылку для подтверждения на{' '}
        <strong className="text-fg font-medium">{email}</strong>. Она действует 24 часа.
      </p>
      <Link
        href="/login"
        className="bg-primary text-primary-fg hover:bg-primary-hover mt-8 inline-flex h-12 items-center justify-center rounded-xl px-6 font-medium"
      >
        Перейти ко входу
      </Link>
    </div>
  );
}
