'use client';

import { Input } from '@remora/ui';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { APP_URL, authApi, getErrorMessage } from '../../lib/auth-api';
import { FormDivider, FormError, PasswordField, SocialButtons } from './AuthFields';
import { ReadingHeading, ReadingSubmit } from './reading-room/ReadingForm';
import { usePublicSession } from './PublicSession';

export function LoginForm() {
  const session = usePublicSession();
  useEffect(() => {
    if (session === 'authenticated') window.location.replace(APP_URL);
  }, [session]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const oauthError = new URLSearchParams(window.location.search).get('oauth_error');
    if (!oauthError) return;
    const messages: Record<string, string> = {
      denied: 'Вы отменили вход через Google.',
      invalid_state: 'Сессия входа устарела. Попробуйте войти через Google ещё раз.',
      unavailable: 'Вход через Google пока не настроен.',
      link_required:
        'Для безопасности этот адрес нельзя связать автоматически. Войдите по email и паролю.',
      failed: 'Не удалось войти через Google. Попробуйте ещё раз.',
    };
    setError(messages[oauthError] ?? messages.failed ?? null);
  }, []);

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
      const next = new URLSearchParams(window.location.search).get('next');
      const target = new URL(next ?? APP_URL, APP_URL);
      const allowedOrigins = new Set([window.location.origin, new URL(APP_URL).origin]);
      window.location.assign(allowedOrigins.has(target.origin) ? target.href : APP_URL);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  if (session !== 'guest')
    return (
      <p role="status">{session === 'checking' ? 'Проверяем вход…' : 'Открываем приложение…'}</p>
    );

  return (
    <>
      <ReadingHeading
        title="Войдите в «Запоминальню»"
        description="Ваши карточки и прогресс уже ждут."
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
        <div>
          <PasswordField
            name="password"
            autoComplete="current-password"
            placeholder="Введите пароль"
            required
          />
          <Link href="/forgot-password" className="reading-forgot">
            Забыли пароль?
          </Link>
        </div>
        {error && <FormError>{error}</FormError>}
        <ReadingSubmit loading={loading}>Войти</ReadingSubmit>
      </form>

      <div className="reading-divider">
        <FormDivider />
      </div>
      <SocialButtons compact />
      <p className="reading-register">
        Ещё нет аккаунта?{' '}
        <Link href="/register" className="text-primary hover:text-primary-hover font-semibold">
          Создать
        </Link>
      </p>
    </>
  );
}
