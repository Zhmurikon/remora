import type { components } from '@remora/api-client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setAccessToken } from '../../lib/api';

type User = components['schemas']['UserPublic'];
type AuthStatus = 'checking' | 'guest' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  authenticate: (user: User, token: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void api.GET('/api/v1/auth/me', { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      if (data?.role === 'admin') {
        setUser(data);
        setStatus('authenticated');
      } else {
        setUser(null);
        setStatus('guest');
      }
    });
    return () => controller.abort();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      authenticate: (nextUser, token) => {
        setAccessToken(token);
        setUser(nextUser);
        setStatus('authenticated');
      },
      logout: async () => {
        try {
          await api.POST('/api/v1/auth/logout');
        } finally {
          setAccessToken(null);
          setUser(null);
          setStatus('guest');
        }
      },
    }),
    [status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return value;
}
