'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { authApi, getErrorMessage } from '../../lib/auth-api';
import { ReadingHeading, ReadingResult } from './reading-room/ReadingForm';

type Status = { kind: 'loading' } | { kind: 'success' } | { kind: 'error'; message: string };

export function VerifyEmail() {
  const token = useSearchParams()?.get('token');
  if (!token) {
    return (
      <ReadingResult title="Ссылка не сработала" action="Перейти ко входу">
        Откройте полную ссылку из письма для подтверждения почты.
      </ReadingResult>
    );
  }
  return <VerifyToken key={token} token={token} />;
}

function VerifyToken({ token }: { token: string }) {
  const started = useRef(false);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
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
      <div role="status">
        <ReadingHeading title="Подтверждаем email…" description="Это займёт пару секунд." />
      </div>
    );
  }

  const success = status.kind === 'success';
  return (
    <ReadingResult
      title={success ? 'Email подтверждён' : 'Ссылка не сработала'}
      action="Перейти ко входу"
    >
      {success ? 'Аккаунт готов. Войдите и создайте первый набор карточек.' : status.message}
    </ReadingResult>
  );
}
