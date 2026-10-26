'use client';

import { Button } from '@remora/ui';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { authApi, getErrorMessage } from '../../lib/auth-api';

export function GuardianConsent() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!token) return setError('В ссылке отсутствует код подтверждения.');
    setState('loading');
    setError(null);
    const response = await authApi.POST('/api/v1/auth/guardian-consent/confirm', {
      body: { token },
    });
    if (response.error) {
      setError(getErrorMessage(response.error));
      setState('idle');
      return;
    }
    setState('done');
  }

  if (state === 'done') {
    return (
      <div>
        <p className="text-primary text-sm font-medium">Согласие сохранено</p>
        <h1 className="mt-2 text-3xl font-semibold">Публичные функции доступны</h1>
        <p className="text-fg-muted mt-4 leading-7">
          Пользователь может публиковать учебные материалы. Ссылка больше не действует.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-primary text-sm font-medium">Законному представителю</p>
      <h1 className="mt-2 text-3xl font-semibold">Согласие на публичные функции</h1>
      <p className="text-fg-muted mt-4 leading-7">
        Подтвердите, что вы являетесь законным представителем пользователя младше 14 лет и
        разрешаете ему публиковать материалы и показывать имя пользователя в Remora. Учиться и
        работать с приватными наборами можно без этого разрешения.
      </p>
      <p className="text-fg-muted mt-4 text-sm leading-6">
        Перед подтверждением прочитайте{' '}
        <a className="text-primary underline underline-offset-4" href="/legal/privacy">
          политику обработки персональных данных
        </a>{' '}
        и{' '}
        <a className="text-primary underline underline-offset-4" href="/legal/guardian">
          условия согласия представителя
        </a>
        .
      </p>
      {error && <p className="text-danger mt-4 text-sm">{error}</p>}
      <Button className="mt-6" loading={state === 'loading'} onClick={() => void confirm()}>
        Подтвердить согласие
      </Button>
    </div>
  );
}
