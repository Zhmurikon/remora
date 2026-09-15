'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { authApi, getErrorMessage } from '../../lib/auth-api';
import { CheckIcon, MailIcon } from './Icons';

type Status = { kind: 'loading' } | { kind: 'success' } | { kind: 'error'; message: string };

export function VerifyEmail() {
  const token = useSearchParams().get('token');
  const started = useRef(false);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setStatus({ kind: 'error', message: 'В ссылке отсутствует токен подтверждения' });
      return;
    }
    void (async () => {
      try {
        const response = await authApi.POST('/api/v1/auth/verify-email', { body: { token } });
        if (response.error) {
          setStatus({ kind: 'error', message: getErrorMessage(response.error) });
          return;
        }
        setStatus({ kind: 'success' });
      } catch (requestError) {
        setStatus({ kind: 'error', message: getErrorMessage(requestError) });
      }
    })();
  }, [token]);

  if (status.kind === 'loading') {
    return (
      <div className="text-center" role="status">
        <span className="border-primary-subtle border-t-primary mx-auto block h-14 w-14 animate-spin rounded-full border-4" />
        <h1 className="mt-7 text-3xl font-semibold tracking-[-0.035em]">Подтверждаем email…</h1>
        <p className="text-fg-muted mt-3">Это займёт пару секунд.</p>
      </div>
    );
  }

  const success = status.kind === 'success';
  return (
    <div className="text-center">
      <span
        className={`mx-auto grid h-16 w-16 place-items-center rounded-3xl ${success ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}`}
      >
        {success ? <CheckIcon className="h-8 w-8" /> : <MailIcon className="h-7 w-7" />}
      </span>
      <h1 className="mt-7 text-3xl font-semibold tracking-[-0.035em]">
        {success ? 'Email подтверждён' : 'Ссылка не сработала'}
      </h1>
      <p className="text-fg-muted mt-4 leading-7">
        {success ? 'Аккаунт готов. Войдите и создайте первый набор карточек.' : status.message}
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
