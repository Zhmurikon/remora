'use client';

import { Input } from '@remora/ui';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { authApi, getErrorMessage } from '../../lib/auth-api';
import { FormError } from './AuthFields';
import { ReadingHeading, ReadingResult, ReadingSubmit } from './reading-room/ReadingForm';

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
      <ReadingResult title="Письмо уже в пути" action="Вернуться ко входу">
        Если такой email зарегистрирован, на него придёт ссылка. Она действует 30 минут.
      </ReadingResult>
    );
  }

  return (
    <>
      <ReadingHeading
        title="Восстановить пароль"
        description="Укажите email аккаунта — отправим одноразовую ссылку для смены пароля."
      />
      <form className="reading-fields" onSubmit={handleSubmit}>
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
        <ReadingSubmit loading={loading}>Отправить ссылку</ReadingSubmit>
      </form>
      <Link href="/login" className="reading-back">
        ← Ко входу
      </Link>
    </>
  );
}
