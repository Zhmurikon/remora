'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { APP_URL } from '../../lib/auth-api';

type SessionStatus = 'checking' | 'authenticated' | 'guest';
const SessionContext = createContext<SessionStatus>('checking');
let pending: Promise<SessionStatus> | null = null;

function checkSession(): Promise<SessionStatus> {
  // Одна ротация cookie на все компоненты, включая повторный эффект в StrictMode.
  pending ??= fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/v1/auth/refresh`,
    {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    },
  )
    .then((response): SessionStatus => (response.ok ? 'authenticated' : 'guest'))
    .catch((): SessionStatus => 'guest')
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function PublicSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('checking');
  useEffect(() => {
    let active = true;
    const update = () => {
      if (document.visibilityState === 'hidden') return;
      void checkSession().then((value) => {
        if (active) setStatus(value);
      });
    };
    update();
    window.addEventListener('focus', update);
    window.addEventListener('pageshow', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      active = false;
      window.removeEventListener('focus', update);
      window.removeEventListener('pageshow', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return <SessionContext.Provider value={status}>{children}</SessionContext.Provider>;
}

export function usePublicSession() {
  return useContext(SessionContext);
}

export function PublicAuthLink({ className }: { className?: string }) {
  const status = usePublicSession();
  return (
    <a href={status === 'authenticated' ? APP_URL : '/login'} className={className}>
      {status === 'authenticated' ? 'Войти в приложение' : 'Войти'}
    </a>
  );
}
