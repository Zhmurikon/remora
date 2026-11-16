'use client';

import { Input } from '@remora/ui';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { authApi, getErrorMessage } from '../../lib/auth-api';
import { ReadingHeading, ReadingResult, ReadingSubmit } from './reading-room/ReadingForm';
import { FormDivider, FormError, PasswordField, SocialButtons } from './AuthFields';

export function RegisterForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState('');

  useEffect(() => {
    setReferralCode(new URLSearchParams(window.location.search).get('ref')?.toUpperCase() ?? '');
  }, []);

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
          referral_code: referralCode.trim() || null,
        },
      });
      if (response.error) {
        setError(getErrorMessage(response.error));
        return;
      }
      // Письмо часто открывают в другой вкладке, поэтому привязываем продолжение к подтверждаемому адресу.
      try {
        const pending = sessionStorage.getItem('lecture-demo:continue');
        if (pending) {
          localStorage.setItem('lecture-demo:continue:' + email.trim().toLowerCase(), pending);
          sessionStorage.removeItem('lecture-demo:continue');
        }
      } catch {
        // Ограничения хранилища не должны прерывать уже состоявшуюся регистрацию.
      }
      setSentTo(email);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <ReadingResult title="Проверьте почту" action="Перейти ко входу">
        Отправили ссылку для подтверждения на <strong>{sentTo}</strong>. Она действует 24 часа.
      </ReadingResult>
    );
  }

  return (
    <>
      <ReadingHeading
        title="Начните запоминать"
        description="Создание аккаунта займёт меньше минуты."
      />
      <form className="reading-fields reading-enrollment" onSubmit={handleSubmit}>
        <div className="reading-enrollment-fields">
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
            pattern="[a-zA-Z0-9_\-]+"
            required
            className="h-12 rounded-xl"
            hint="Латиница, цифры, _ и −"
          />
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
        </div>
        <Input
          label="Пригласительный код"
          name="referral_code"
          value={referralCode}
          onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
          placeholder="RMR-XXXXXXXX"
          maxLength={24}
          className="h-12 rounded-xl"
          hint="Необязательно. После первой оплаты вы оба получите 30 дней Plus"
        />
        <label className="reading-consent">
          <input
            type="checkbox"
            required
            className="border-border accent-primary mt-0.5 h-5 w-5 shrink-0 rounded"
          />
          <span>
            Я принимаю{' '}
            <Link
              href="/terms"
              className="text-primary hover:text-primary-hover underline underline-offset-2"
            >
              условия использования
            </Link>{' '}
            и даю согласие на обработку персональных данных в соответствии с{' '}
            <Link
              href="/privacy"
              className="text-primary hover:text-primary-hover underline underline-offset-2"
            >
              политикой конфиденциальности
            </Link>
            .
          </span>
        </label>
        {error && <FormError>{error}</FormError>}
        <ReadingSubmit loading={loading}>Создать аккаунт</ReadingSubmit>
      </form>
      <div className="reading-divider">
        <FormDivider />
      </div>
      <SocialButtons compact />
      <p className="reading-register">
        Уже есть аккаунт?{' '}
        <Link href="/login" className="text-primary hover:text-primary-hover font-semibold">
          Войти
        </Link>
      </p>
    </>
  );
}
